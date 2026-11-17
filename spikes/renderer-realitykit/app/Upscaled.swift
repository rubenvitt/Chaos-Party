import Foundation
import Metal
import QuartzCore
import RealityKit
#if canImport(MetalFX)
import MetalFX
#endif
#if os(macOS)
import AppKit
typealias PlatformView = NSView
#else
import UIKit
typealias PlatformView = UIView
#endif

// CHAOS-114: Die Apple TV 4K (A15) ist bei 4K-Ausgabe pixelgebunden (ARView 34,7 ms GPU je Bild, 20 fps).
// Dieser Pfad rendert die Szene mit `RealityRenderer` in geringerer interner Auflösung und skaliert auf die volle
// Anzeige hoch (MetalFX Spatial oder bilinear). Bilder laufen überlappend (`--imflug`), getaktet von der Anzeige.

/// Gemeinsame Einrichtung des `RealityRenderer` für offscreen (`--durchsatz=1`) und hochskaliert.
@MainActor
func makeRealityRenderer(_ built: SceneBuilder.Built, _ settings: Settings) throws -> RealityRenderer {
    let renderer = try RealityRenderer()
    renderer.entities.append(built.root)
    renderer.activeCamera = built.camera
    if settings.ibl {
        renderer.lighting.resource = built.sky
        renderer.lighting.intensityExponent = built.skyExponent
    }
    renderer.cameraSettings.colorBackground = .color(built.clearColor)
    renderer.cameraSettings.antialiasing = settings.msaa >= 2 ? .multisample4X : .none
    renderer.cameraSettings.isToneMappingEnabled = settings.toneMapping
    return renderer
}

/// Ansicht mit `CAMetalLayer` in voller Bildpunktgröße der Anzeige (Apple TV 4K: 3840×2160).
final class MetalLayerView: PlatformView {
    var onResize: ((CGSize) -> Void)?
    private var reported = CGSize.zero

    #if os(macOS)
    let metalLayer = CAMetalLayer()
    override init(frame: NSRect) {
        super.init(frame: frame)
        layer = metalLayer   // layer-hosting: erst die Ebene setzen, dann wantsLayer
        wantsLayer = true
    }
    required init?(coder: NSCoder) { fatalError("nicht unterstützt") }
    override func layout() { super.layout(); updateSize() }
    override func viewDidChangeBackingProperties() { super.viewDidChangeBackingProperties(); updateSize() }
    private var pixelScale: CGFloat { window?.backingScaleFactor ?? 1 }
    #else
    override class var layerClass: AnyClass { CAMetalLayer.self }
    var metalLayer: CAMetalLayer { layer as! CAMetalLayer }
    override func layoutSubviews() { super.layoutSubviews(); updateSize() }
    override func didMoveToWindow() { super.didMoveToWindow(); updateSize() }
    private var pixelScale: CGFloat { window?.screen.nativeScale ?? 1 }
    #endif

    var pixelSize: CGSize { reported }

    private func updateSize() {
        let scale = pixelScale
        #if os(macOS)
        metalLayer.contentsScale = scale
        #else
        contentScaleFactor = scale
        #endif
        let size = CGSize(width: (bounds.width * scale).rounded(), height: (bounds.height * scale).rounded())
        guard size.width > 0, size.height > 0, size != reported else { return }
        reported = size
        metalLayer.drawableSize = size
        onResize?(size)
    }
}

/// Anzeige-getaktete Schleife: je Takt ein Bild an `RealityRenderer` übergeben (sofern ein Platz frei ist),
/// nach dessen `onComplete` hochskalieren und präsentieren (`Presenter`, läuft auf beliebigem Thread).
@MainActor
final class UpscaleLoop: NSObject {
    enum Event {
        /// Zeitpunkt, an dem ein Bild wirklich auf der Anzeige erschien (`MTLDrawable.presentedTime`).
        case presented(CFTimeInterval)
        /// GPU-Zeit des Hochskalier-Puffers und Abstand Übergabe an RealityKit → Hochskalieren fertig, beides in ms.
        case frame(upscaleGPU: Double, latency: Double)
        /// Bild wurde nie angezeigt (presentedTime 0).
        case dropped
    }

    private let settings: Settings
    private let log: (String) -> Void
    private let view: MetalLayerView
    private let renderer: RealityRenderer
    private let device: MTLDevice
    private let onEvent: (Event) -> Void
    private var presenter: Presenter?
    private var slots: [(texture: MTLTexture, output: RealityRenderer.CameraOutput)] = []
    private var nextSlot = 0
    private var link: CADisplayLink?
    private var lastTarget: CFTimeInterval?
    /// Anzeigetakte, in denen kein Platz frei war (GPU oder RealityKit hinken hinterher).
    private(set) var busyTicks = 0
    private(set) var internalSize = (0, 0)
    private(set) var outputSize = (0, 0)
    var scalerName: String { presenter?.scalerName ?? "–" }

    init(view: MetalLayerView, built: SceneBuilder.Built, settings: Settings, log: @escaping (String) -> Void,
         onEvent: @escaping (Event) -> Void) throws {
        guard let device = MTLCreateSystemDefaultDevice() else { throw SpikeError.missing("Metal-Gerät") }
        self.device = device
        self.settings = settings
        self.log = log
        self.view = view
        self.onEvent = onEvent
        renderer = try makeRealityRenderer(built, settings)
        super.init()
        view.onResize = { [weak self] size in self?.configure(size) }
        if view.pixelSize.width > 0 { configure(view.pixelSize) }
    }

    private func configure(_ size: CGSize) {
        let (ow, oh) = (Int(size.width), Int(size.height))
        // Gerade Werte: MetalFX und Unterabtastung vertragen sich so besser.
        let iw = max(2, Int((Double(ow) * settings.scale / 2).rounded()) * 2)
        let ih = max(2, Int((Double(oh) * settings.scale / 2).rounded()) * 2)
        do {
            let presenter = try Presenter(device: device, layer: view.metalLayer, input: (iw, ih), output: (ow, oh),
                                          wantMetalFX: settings.scaler == "metalfx", slots: settings.framesInFlight,
                                          capture: settings.screenshot != nil, log: log) { [weak self] event in
                Task { @MainActor in self?.onEvent(event) }
            }
            var newSlots: [(texture: MTLTexture, output: RealityRenderer.CameraOutput)] = []
            for _ in 0..<settings.framesInFlight {
                let texture = try presenter.makeInputTexture()
                let output = try RealityRenderer.CameraOutput(.singleProjection(colorTexture: texture))
                newSlots.append((texture: texture, output: output))
            }
            self.presenter = presenter
            slots = newSlots
            internalSize = (iw, ih)
            outputSize = (ow, oh)
            log("Hochskaliert: intern \(iw)×\(ih) → Anzeige \(ow)×\(oh), Skalierer \(presenter.scalerName), \(settings.framesInFlight) Bilder im Flug")
            startLink()
        } catch {
            log("FEHLER Hochskalieren einrichten: \(error)")
        }
    }

    private func startLink() {
        guard link == nil else { return }
        #if os(macOS)
        let link = view.displayLink(target: self, selector: #selector(tick(_:)))
        #else
        let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
        #endif
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    func stop() {
        link?.invalidate()
        link = nil
    }

    /// Nächstes präsentiertes Bild zusätzlich als PNG-Quelle in eine CPU-lesbare Textur kopieren.
    func capture(_ done: @escaping (MTLTexture) -> Void) { presenter?.requestCapture(done) }

    @objc private func tick(_ link: CADisplayLink) {
        guard let presenter, !slots.isEmpty else { return }
        let dt = lastTarget.map { max(0.001, link.targetTimestamp - $0) } ?? 1.0 / 60
        lastTarget = link.targetTimestamp
        guard presenter.tryReserve() else { busyTicks += 1; return }
        let slot = slots[nextSlot]
        nextSlot = (nextSlot + 1) % slots.count
        let complete = presenter.completion(for: slot.texture, submitted: CACurrentMediaTime())
        do {
            try renderer.updateAndRender(deltaTime: dt, cameraOutput: slot.output, onComplete: complete)
        } catch {
            presenter.release()
            log("FEHLER updateAndRender: \(error)")
        }
    }
}

/// Hochskalieren und Präsentieren, ohne Actor-Bindung: `onComplete` von RealityKit kommt auf beliebigem Thread.
final class Presenter: @unchecked Sendable {
    private let device: MTLDevice
    private let queue: MTLCommandQueue
    private let layer: CAMetalLayer
    private let input: (Int, Int)
    private let output: (Int, Int)
    private let pipeline: MTLRenderPipelineState
    private let linear: MTLSamplerState
    private let nearest: MTLSamplerState
    private let free: DispatchSemaphore
    private let lock = NSLock()
    private let report: @Sendable (UpscaleLoop.Event) -> Void
    private let log: (String) -> Void
    /// `FXScaler`, nur wenn MetalFX auf diesem System verfügbar ist.
    private var fx: AnyObject?
    private var intermediate: MTLTexture?
    private var inputUsage: MTLTextureUsage = [.renderTarget, .shaderRead]
    private var loggedPath = false
    private var pendingCapture: ((MTLTexture) -> Void)?
    private(set) var scalerName = "bilinear"

    static let format = MTLPixelFormat.bgra8Unorm_srgb

    init(device: MTLDevice, layer: CAMetalLayer, input: (Int, Int), output: (Int, Int), wantMetalFX: Bool,
         slots: Int, capture: Bool, log: @escaping (String) -> Void, report: @escaping @Sendable (UpscaleLoop.Event) -> Void) throws {
        self.device = device
        self.layer = layer
        self.input = input
        self.output = output
        self.report = report
        self.log = log
        free = DispatchSemaphore(value: slots)
        guard let queue = device.makeCommandQueue() else { throw SpikeError.missing("Command-Queue") }
        self.queue = queue

        let library = try device.makeLibrary(source: Presenter.shader, options: nil)
        let desc = MTLRenderPipelineDescriptor()
        desc.vertexFunction = library.makeFunction(name: "vollbild")
        desc.fragmentFunction = library.makeFunction(name: "abtasten")
        desc.colorAttachments[0].pixelFormat = Presenter.format
        pipeline = try device.makeRenderPipelineState(descriptor: desc)
        let sampler = MTLSamplerDescriptor()
        sampler.minFilter = .linear
        sampler.magFilter = .linear
        guard let linear = device.makeSamplerState(descriptor: sampler) else { throw SpikeError.missing("Sampler") }
        sampler.minFilter = .nearest
        sampler.magFilter = .nearest
        guard let nearest = device.makeSamplerState(descriptor: sampler) else { throw SpikeError.missing("Sampler") }
        self.linear = linear
        self.nearest = nearest

        layer.device = device
        layer.pixelFormat = Presenter.format
        layer.maximumDrawableCount = 3

        if wantMetalFX { setUpMetalFX() }
        // MetalFX direkt in den Drawable schreiben braucht mehr als `renderTarget`; Bildschirmfoto braucht Blit.
        layer.framebufferOnly = fx == nil && !capture
    }

    private func setUpMetalFX() {
        #if canImport(MetalFX)
        if #available(macOS 13, iOS 16, tvOS 27.2, *) {
            if let scaler = FXScaler(device: device, input: input, output: output, format: Presenter.format) {
                fx = scaler
                scalerName = "metalfx-spatial"
                inputUsage.formUnion(scaler.colorUsage)
                let desc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: Presenter.format, width: output.0,
                                                                    height: output.1, mipmapped: false)
                desc.usage = scaler.outputUsage.union(.shaderRead)
                desc.storageMode = .private
                intermediate = device.makeTexture(descriptor: desc)
                return
            }
            log("MetalFX Spatial nicht verfügbar für dieses Gerät/Format – bilinear")
            return
        }
        log("MetalFX erst ab tvOS 27.2 – bilinear")
        #else
        log("MetalFX fehlt im SDK – bilinear")
        #endif
    }

    func makeInputTexture() throws -> MTLTexture {
        let desc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: Presenter.format, width: input.0,
                                                            height: input.1, mipmapped: false)
        desc.usage = inputUsage
        desc.storageMode = .private
        guard let texture = device.makeTexture(descriptor: desc) else { throw SpikeError.missing("Textur") }
        return texture
    }

    func tryReserve() -> Bool { free.wait(timeout: .now()) == .success }
    func release() { free.signal() }

    func requestCapture(_ done: @escaping (MTLTexture) -> Void) {
        lock.lock(); defer { lock.unlock() }
        pendingCapture = done
    }

    func completion(for texture: MTLTexture, submitted: CFTimeInterval) -> @Sendable (RealityRenderer) -> Void {
        { [self] _ in self.present(texture, submitted: submitted) }
    }

    private func present(_ source: MTLTexture, submitted: CFTimeInterval) {
        lock.lock(); defer { lock.unlock() }
        guard let drawable = layer.nextDrawable(), let buffer = queue.makeCommandBuffer() else {
            free.signal()
            report(.dropped)
            return
        }
        var path = "bilinear → Drawable"
        #if canImport(MetalFX)
        if #available(macOS 13, iOS 16, tvOS 27.2, *), let scaler = fx as? FXScaler {
            if drawable.texture.usage.contains(scaler.outputUsage) {
                scaler.encode(buffer, from: source, to: drawable.texture)
                path = "MetalFX → Drawable"
            } else if let intermediate {
                scaler.encode(buffer, from: source, to: intermediate)
                draw(intermediate, into: drawable.texture, sampler: nearest, buffer: buffer)
                path = "MetalFX → Zwischentextur → Drawable"
            }
        } else {
            draw(source, into: drawable.texture, sampler: linear, buffer: buffer)
        }
        #else
        draw(source, into: drawable.texture, sampler: linear, buffer: buffer)
        #endif
        if !loggedPath { loggedPath = true; log("Präsentationsweg: \(path)") }

        if let deliver = pendingCapture, !layer.framebufferOnly, let blit = buffer.makeBlitCommandEncoder() {
            pendingCapture = nil
            let desc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: Presenter.format, width: output.0,
                                                                height: output.1, mipmapped: false)
            desc.storageMode = .shared
            if let copy = device.makeTexture(descriptor: desc) {
                blit.copy(from: drawable.texture, to: copy)
                buffer.addCompletedHandler { _ in deliver(copy) }
            }
            blit.endEncoding()
        }

        let report = self.report
        let free = self.free
        drawable.addPresentedHandler { shown in
            report(shown.presentedTime > 0 ? .presented(shown.presentedTime) : .dropped)
        }
        buffer.addCompletedHandler { finished in
            free.signal()
            let gpu = (finished.gpuEndTime - finished.gpuStartTime) * 1000
            report(.frame(upscaleGPU: gpu, latency: (CACurrentMediaTime() - submitted) * 1000))
        }
        buffer.present(drawable)
        buffer.commit()
    }

    private func draw(_ source: MTLTexture, into target: MTLTexture, sampler: MTLSamplerState, buffer: MTLCommandBuffer) {
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = target
        pass.colorAttachments[0].loadAction = .dontCare
        pass.colorAttachments[0].storeAction = .store
        guard let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
        encoder.label = "CHAOS-114 hochskalieren"
        encoder.setRenderPipelineState(pipeline)
        encoder.setFragmentTexture(source, index: 0)
        encoder.setFragmentSamplerState(sampler, index: 0)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        encoder.endEncoding()
    }

    /// Vollbild-Dreieck, tastet die Quelltextur ab (bilinear oder 1:1).
    private static let shader = """
    #include <metal_stdlib>
    using namespace metal;
    struct Ecke { float4 position [[position]]; float2 uv; };
    vertex Ecke vollbild(uint id [[vertex_id]]) {
        float2 p = float2((id << 1) & 2, id & 2);
        Ecke e;
        e.position = float4(p * 2.0 - 1.0, 0.0, 1.0);
        e.uv = float2(p.x, 1.0 - p.y);
        return e;
    }
    fragment float4 abtasten(Ecke e [[stage_in]], texture2d<float> bild [[texture(0)]], sampler s [[sampler(0)]]) {
        return bild.sample(s, e.uv);
    }
    """
}

#if canImport(MetalFX)
/// MetalFX Spatial (keine Bewegungsvektoren nötig; Temporal bräuchte Tiefe und Bewegung, die RealityRenderer nicht liefert).
@available(macOS 13, iOS 16, tvOS 27.2, *)
final class FXScaler {
    private let scaler: any MTLFXSpatialScaler
    private let input: (Int, Int)

    init?(device: MTLDevice, input: (Int, Int), output: (Int, Int), format: MTLPixelFormat) {
        guard MTLFXSpatialScalerDescriptor.supportsDevice(device) else { return nil }
        let desc = MTLFXSpatialScalerDescriptor()
        desc.inputWidth = input.0
        desc.inputHeight = input.1
        desc.outputWidth = output.0
        desc.outputHeight = output.1
        desc.colorTextureFormat = format
        desc.outputTextureFormat = format
        // sRGB-Format: Lesen liefert lineare Werte.
        desc.colorProcessingMode = .linear
        guard let scaler = desc.makeSpatialScaler(device: device) else { return nil }
        self.scaler = scaler
        self.input = input
    }

    var colorUsage: MTLTextureUsage { scaler.colorTextureUsage }
    var outputUsage: MTLTextureUsage { scaler.outputTextureUsage }

    func encode(_ buffer: MTLCommandBuffer, from source: MTLTexture, to target: MTLTexture) {
        scaler.colorTexture = source
        scaler.inputContentWidth = input.0
        scaler.inputContentHeight = input.1
        scaler.outputTexture = target
        scaler.encode(commandBuffer: buffer)
    }
}
#endif
