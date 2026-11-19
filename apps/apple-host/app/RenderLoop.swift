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

// CHAOS-114/142: Die Apple TV 4K ist bei 4K-Ausgabe pixelgebunden (ARView: 20 fps). Der Host rendert darum mit
// `RealityRenderer` in geringerer interner Auflösung und skaliert auf die volle Anzeige hoch (MetalFX Spatial
// oder bilinear). EXP-020: intern 1920×1080, ohne MSAA, drei Bilder im Flug, bilinear → 60 fps bei 4K.
// Übernommen aus dem Spike (`spikes/renderer-realitykit/app/Upscaled.swift`).

/// Grafikstufe des Hosts, Startparameter `--name=wert` überschreiben die Plattform-Vorgabe.
struct RenderSettings {
    /// Höchstens so viele Bildpunkte rendert RealityKit intern (Breite der Anzeige darüber wird hochskaliert).
    let maxInternalWidth: Double
    /// Fester Anteil je Achse statt `maxInternalWidth` (`--skala=0.5`).
    let fixedScale: Double?
    /// `metalfx` oder `bilinear`.
    let scaler: String
    let framesInFlight: Int
    let msaa: Bool
    /// `--bild=<pfad>`: PNG der 3D-Szene (ohne SwiftUI-Overlay), sobald sie geladen ist, und bei jedem Phasenwechsel
    /// `<pfad>-<phase>.png`.
    let screenshot: String?
    /// `--bildtakt=<s>`: zusätzlich alle s Sekunden `<bild>-<n>.png` (Sichtprüfung eines Zugs).
    let screenshotEvery: Double?
    /// `--assets=<ordner>`: USDZ und JSON aus diesem Ordner statt aus dem Bundle (Entwicklung).
    let assets: String?

    init(arguments: [String] = ProcessInfo.processInfo.arguments) {
        var raw: [String: String] = [:]
        for arg in arguments.dropFirst() where arg.hasPrefix("--") {
            let pair = arg.dropFirst(2).split(separator: "=", maxSplits: 1)
            if let key = pair.first { raw[String(key)] = pair.count > 1 ? String(pair[1]) : "1" }
        }
        #if os(tvOS)
        maxInternalWidth = 1920
        scaler = raw["skalierer"] ?? "bilinear"
        framesInFlight = Int(raw["imflug"] ?? "") ?? 3
        msaa = raw["msaa"].map { $0 == "1" } ?? false
        #else
        // Mac: Retina-Fenster bis 2560 Bildpunkte breit nativ, darüber hochskaliert.
        maxInternalWidth = 2560
        scaler = raw["skalierer"] ?? "metalfx"
        framesInFlight = Int(raw["imflug"] ?? "") ?? 2
        msaa = raw["msaa"].map { $0 == "1" } ?? true
        #endif
        fixedScale = raw["skala"].flatMap(Double.init).map { min(1, max(0.25, $0)) }
        screenshot = raw["bild"]
        screenshotEvery = raw["bildtakt"].flatMap(Double.init)
        assets = raw["assets"]
    }

    func scale(forOutputWidth width: Double) -> Double {
        fixedScale ?? min(1, maxInternalWidth / max(width, 1))
    }
}

/// Ansicht mit `CAMetalLayer` in voller Bildpunktgröße der Anzeige (Apple TV 4K: 3840×2160).
final class MetalLayerView: PlatformView {
    var onResize: ((CGSize) -> Void)?
    private var reported = CGSize.zero

    #if os(macOS)
    let metalLayer = CAMetalLayer()
    override init(frame: NSRect) {
        super.init(frame: frame)
        layer = metalLayer // layer-hosting: erst die Ebene setzen, dann wantsLayer
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

/// Anzeige-getaktete Schleife: je Takt `onFrame` (JS-Tick, Szene nachführen), dann ein Bild an `RealityRenderer`
/// (sofern ein Platz frei ist); nach dessen `onComplete` hochskalieren und präsentieren (`Presenter`).
@MainActor
final class RenderLoop: NSObject {
    let renderer: RealityRenderer
    private let settings: RenderSettings
    private let view: MetalLayerView
    private let device: MTLDevice
    private let onFrame: (Double) -> Void
    /// Abstand zweier tatsächlich angezeigter Bilder in ms (`MTLDrawable.presentedTime`).
    var onPresented: ((Double) -> Void)?
    private var presenter: Presenter?
    private var slots: [(texture: MTLTexture, output: RealityRenderer.CameraOutput)] = []
    private var nextSlot = 0
    private var link: CADisplayLink?
    /// Ersatztakt, wenn die Anzeige keine Bilder anfordert (Fenster verdeckt, minimiert, Bildschirm aus): Das Spiel
    /// läuft weiter, nur ohne Darstellung. Sonst stünden Server-Fristen und Controller still.
    private var fallback: Timer?
    private var lastFrame: CFTimeInterval = 0
    private var lastTarget: CFTimeInterval?
    private var lastPresented: CFTimeInterval = 0
    private(set) var busyTicks = 0
    private(set) var describe = ""

    init(view: MetalLayerView, settings: RenderSettings, onFrame: @escaping (Double) -> Void) throws {
        guard let device = MTLCreateSystemDefaultDevice() else { throw HostRenderError.missing("Metal-Gerät") }
        self.device = device
        self.settings = settings
        self.view = view
        self.onFrame = onFrame
        renderer = try RealityRenderer()
        renderer.cameraSettings.antialiasing = settings.msaa ? .multisample4X : .none
        renderer.cameraSettings.isToneMappingEnabled = true
        super.init()
        view.onResize = { [weak self] size in self?.configure(size) }
        if view.pixelSize.width > 0 { configure(view.pixelSize) }
        fallback = Timer.scheduledTimer(withTimeInterval: 1.0 / 30, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.fallbackTick() }
        }
    }

    private func fallbackTick() {
        let now = CACurrentMediaTime()
        guard now - lastFrame > 0.1 else { return }
        onFrame(lastFrame > 0 ? min(0.1, now - lastFrame) : 1.0 / 30)
        lastFrame = now
    }

    private func configure(_ size: CGSize) {
        let (ow, oh) = (Int(size.width), Int(size.height))
        let scale = settings.scale(forOutputWidth: size.width)
        // Gerade Werte: MetalFX und Unterabtastung vertragen sich so besser.
        let iw = max(2, Int((Double(ow) * scale / 2).rounded()) * 2)
        let ih = max(2, Int((Double(oh) * scale / 2).rounded()) * 2)
        do {
            let presenter = try Presenter(device: device, layer: view.metalLayer, input: (iw, ih), output: (ow, oh),
                                          wantMetalFX: settings.scaler == "metalfx" && (iw, ih) != (ow, oh),
                                          slots: settings.framesInFlight, capture: settings.screenshot != nil) { [weak self] shown in
                Task { @MainActor in self?.presented(shown) }
            }
            var newSlots: [(texture: MTLTexture, output: RealityRenderer.CameraOutput)] = []
            for _ in 0..<settings.framesInFlight {
                let texture = try presenter.makeInputTexture()
                newSlots.append((texture: texture, output: try RealityRenderer.CameraOutput(.singleProjection(colorTexture: texture))))
            }
            self.presenter = presenter
            slots = newSlots
            nextSlot = 0
            describe = "intern \(iw)×\(ih) → \(ow)×\(oh), \(presenter.scalerName), \(settings.framesInFlight) im Flug, MSAA \(settings.msaa ? "4×" : "aus")"
            hostLog("Grafik: \(describe)")
            startLink()
        } catch {
            hostLog("FEHLER Hochskalieren einrichten: \(error)")
        }
    }

    private func presented(_ at: CFTimeInterval) {
        if lastPresented > 0, at > lastPresented { onPresented?((at - lastPresented) * 1000) }
        lastPresented = at
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
        fallback?.invalidate()
        fallback = nil
    }

    /// Nächstes präsentiertes Bild als PNG schreiben (nur mit `--bild`).
    func capture(to path: String) {
        presenter?.requestCapture { texture in
            guard let image = cgImage(from: texture) else { return }
            let url = URL(fileURLWithPath: path) as CFURL
            guard let dest = CGImageDestinationCreateWithURL(url, "public.png" as CFString, 1, nil) else { return }
            CGImageDestinationAddImage(dest, image, nil)
            if CGImageDestinationFinalize(dest) { hostLog("Bild gespeichert: \(path)") }
        }
    }

    @objc private func tick(_ link: CADisplayLink) {
        let dt = lastTarget.map { max(0.001, link.targetTimestamp - $0) } ?? 1.0 / 60
        lastTarget = link.targetTimestamp
        lastFrame = CACurrentMediaTime()
        onFrame(dt)
        guard let presenter, !slots.isEmpty, renderer.activeCamera != nil else { return }
        guard presenter.tryReserve() else { busyTicks += 1; return }
        let slot = slots[nextSlot]
        nextSlot = (nextSlot + 1) % slots.count
        do {
            try renderer.updateAndRender(deltaTime: dt, cameraOutput: slot.output, onComplete: presenter.completion(for: slot.texture))
        } catch {
            presenter.release()
            hostLog("FEHLER updateAndRender: \(error)")
        }
    }
}

enum HostRenderError: Error { case missing(String) }

private func cgImage(from texture: MTLTexture) -> CGImage? {
    let (w, h) = (texture.width, texture.height)
    var bytes = [UInt8](repeating: 0, count: w * h * 4)
    texture.getBytes(&bytes, bytesPerRow: w * 4, from: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0)
    let info = CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
    return CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                     space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info)?.makeImage()
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
    private let presented: @Sendable (CFTimeInterval) -> Void
    /// `FXScaler`, nur wenn MetalFX auf diesem System verfügbar ist.
    private var fx: AnyObject?
    private var intermediate: MTLTexture?
    private var inputUsage: MTLTextureUsage = [.renderTarget, .shaderRead]
    private var pendingCapture: ((MTLTexture) -> Void)?
    private(set) var scalerName = "bilinear"

    static let format = MTLPixelFormat.bgra8Unorm_srgb

    init(device: MTLDevice, layer: CAMetalLayer, input: (Int, Int), output: (Int, Int), wantMetalFX: Bool,
         slots: Int, capture: Bool, presented: @escaping @Sendable (CFTimeInterval) -> Void) throws {
        self.device = device
        self.layer = layer
        self.input = input
        self.output = output
        self.presented = presented
        free = DispatchSemaphore(value: slots)
        guard let queue = device.makeCommandQueue() else { throw HostRenderError.missing("Command-Queue") }
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
        guard let linear = device.makeSamplerState(descriptor: sampler) else { throw HostRenderError.missing("Sampler") }
        sampler.minFilter = .nearest
        sampler.magFilter = .nearest
        guard let nearest = device.makeSamplerState(descriptor: sampler) else { throw HostRenderError.missing("Sampler") }
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
            }
        }
        #endif
    }

    func makeInputTexture() throws -> MTLTexture {
        let desc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: Presenter.format, width: input.0,
                                                            height: input.1, mipmapped: false)
        desc.usage = inputUsage
        desc.storageMode = .private
        guard let texture = device.makeTexture(descriptor: desc) else { throw HostRenderError.missing("Textur") }
        return texture
    }

    func tryReserve() -> Bool { free.wait(timeout: .now()) == .success }
    func release() { free.signal() }

    func requestCapture(_ done: @escaping (MTLTexture) -> Void) {
        lock.lock(); defer { lock.unlock() }
        pendingCapture = done
    }

    func completion(for texture: MTLTexture) -> @Sendable (RealityRenderer) -> Void {
        { [self] _ in self.present(texture) }
    }

    private func present(_ source: MTLTexture) {
        lock.lock(); defer { lock.unlock() }
        guard let drawable = layer.nextDrawable(), let buffer = queue.makeCommandBuffer() else {
            free.signal()
            return
        }
        #if canImport(MetalFX)
        if #available(macOS 13, iOS 16, tvOS 27.2, *), let scaler = fx as? FXScaler {
            if drawable.texture.usage.contains(scaler.outputUsage) {
                scaler.encode(buffer, from: source, to: drawable.texture)
            } else if let intermediate {
                scaler.encode(buffer, from: source, to: intermediate)
                draw(intermediate, into: drawable.texture, sampler: nearest, buffer: buffer)
            }
        } else {
            draw(source, into: drawable.texture, sampler: input == output ? nearest : linear, buffer: buffer)
        }
        #else
        draw(source, into: drawable.texture, sampler: input == output ? nearest : linear, buffer: buffer)
        #endif

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

        let presented = self.presented
        let free = self.free
        #if targetEnvironment(simulator)
        // Der Simulator kennt `addPresentedHandler` nicht: Ende des Puffers als Näherung.
        buffer.addCompletedHandler { _ in free.signal(); presented(CACurrentMediaTime()) }
        #else
        drawable.addPresentedHandler { shown in
            if shown.presentedTime > 0 { presented(shown.presentedTime) }
        }
        buffer.addCompletedHandler { _ in free.signal() }
        #endif
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
