import Combine
import Foundation
import Metal
import QuartzCore
import RealityKit
import os
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Zwei Messarten, Ergebnis jeweils als `SPIKE-ERGEBNIS {json}` auf stdout und im os_log:
/// - Standard: Bildabstände der ARView aus `SceneEvents.Update`. RealityKit rendert dort vsync-gebunden;
///   liegt der Median beim Bildwechselintervall, ist die Reserve unbekannt.
/// - `--durchsatz=1`: dieselbe Szene mit `RealityRenderer` offscreen in eine Textur (`breite`×`hoehe`), Bild für
///   Bild nacheinander ohne vsync. Die Bildzeit ist CPU + GPU je Bild ohne Überlappung (obere Schranke).
@MainActor
final class Meter: ObservableObject {
    @Published var hud = "lädt …"
    let settings = Settings()
    private let logger = Logger(subsystem: "dev.rubeen.chaosparty.renderspike", category: "spike")
    private var subscription: (any Cancellable)?
    private var readyAt: CFTimeInterval?
    private var startedAt: CFTimeInterval?
    private var samples: [Double] = []
    private var instances = 0
    private var done = false
    private weak var view: ARView?

    func log(_ text: String) {
        print(text)
        logger.log("\(text, privacy: .public)")
    }

    func start(_ view: ARView) {
        self.view = view
        if let rate = settings.preferredFrameRate {
            view.__enableAutomaticFrameRate = false
            view.__preferredFrameRate = rate
        }
        #if os(macOS)
        // Verdeckte Fenster (andere Space, Vollbild-App) drosselt macOS auf ≈ 10 Hz; deshalb nach vorn holen.
        NSApplication.shared.activate()
        #endif
        log("Parameter: \(settings.raw)")
        Task {
            do {
                let built = try await SceneBuilder(settings: settings, log: log).build()
                instances = built.instances
                if settings.throughput {
                    try await measureOffscreen(built)
                    return
                }
                let anchor = AnchorEntity(world: .zero)
                anchor.addChild(built.root)
                view.scene.addAnchor(anchor)
                #if os(macOS)
                view.environment.background = .color(NSColor(cgColor: built.clearColor) ?? .gray)
                #else
                view.environment.background = .color(UIColor(cgColor: built.clearColor))
                #endif
                view.environment.lighting.resource = built.sky
                view.environment.lighting.intensityExponent = built.skyExponent
                readyAt = CACurrentMediaTime()
                subscription = view.scene.subscribe(to: SceneEvents.Update.self) { [weak self] event in
                    MainActor.assumeIsolated { self?.tick(event.deltaTime) }
                }
            } catch {
                hud = "Fehler: \(error)"
                log("FEHLER \(error)")
            }
        }
        if let server = settings.server { HostClient.shared.connect(server, log: log) }
    }

    private func tick(_ dt: TimeInterval) {
        guard let readyAt, let view, !done else { return }
        let now = CACurrentMediaTime()
        if now - readyAt < settings.warmup {
            hud = String(format: "aufwärmen … (%d Instanzen)", instances)
            return
        }
        let started = startedAt ?? now
        startedAt = started
        if dt > 0 { samples.append(dt * 1000) }
        showProgress(elapsed: now - started)
        if now - started >= settings.seconds {
            #if os(macOS)
            let scale = view.window?.backingScaleFactor ?? 1
            #else
            let scale = view.window?.screen.scale ?? 1
            #endif
            finish(renderer: "realitykit-arview", size: (Int(view.bounds.width * scale), Int(view.bounds.height * scale)))
        }
    }

    private func measureOffscreen(_ built: SceneBuilder.Built) async throws {
        let (width, height) = (Int(settings.width), Int(settings.height))
        guard let device = MTLCreateSystemDefaultDevice() else { throw SpikeError.missing("Metal-Gerät") }
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm_srgb, width: width, height: height, mipmapped: false)
        descriptor.usage = [.renderTarget, .shaderRead]
        descriptor.storageMode = .shared
        guard let texture = device.makeTexture(descriptor: descriptor) else { throw SpikeError.missing("Textur") }
        let output = try RealityRenderer.CameraOutput(.singleProjection(colorTexture: texture))
        let renderer = try RealityRenderer()
        renderer.entities.append(built.root)
        renderer.activeCamera = built.camera
        renderer.lighting.resource = built.sky
        renderer.lighting.intensityExponent = built.skyExponent
        renderer.cameraSettings.colorBackground = .color(built.clearColor)
        renderer.cameraSettings.antialiasing = settings.msaa >= 2 ? .multisample4X : .none

        let begin = CACurrentMediaTime()
        var last = begin
        while true {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
                do {
                    try renderer.updateAndRender(deltaTime: 1.0 / 60, cameraOutput: output, onComplete: { _ in cont.resume() })
                } catch { cont.resume(throwing: error) }
            }
            let now = CACurrentMediaTime()
            defer { last = now }
            if now - begin < settings.warmup { continue }
            let started = startedAt ?? last
            startedAt = started
            samples.append((now - last) * 1000)
            if samples.count % 30 == 0 { showProgress(elapsed: now - started) }
            if now - started >= settings.seconds { break }
        }
        if let path = settings.screenshot, let image = cgImage(from: texture) {
            write(image, to: path)
        }
        finish(renderer: "realitykit-realityrenderer-offscreen", size: (width, height))
    }

    private func showProgress(elapsed: Double) {
        let median = percentile(samples.sorted(), 0.5)
        hud = String(format: "RealityKit%@  Bildzeit Median %.2f ms (%.0f fps)  %.0f/%.0f s",
                     settings.throughput ? " offscreen" : "", median, 1000 / median, elapsed, settings.seconds)
    }

    private var displayHz: Int {
        #if os(macOS)
        view?.window?.screen?.maximumFramesPerSecond ?? 0
        #else
        view?.window?.screen.maximumFramesPerSecond ?? 0
        #endif
    }

    private func finish(renderer: String, size: (Int, Int)) {
        done = true
        let sorted = samples.sorted()
        #if os(macOS)
        let platform = "macos"
        #elseif os(tvOS)
        let platform = "tvos"
        #else
        let platform = UIDevice.current.userInterfaceIdiom == .pad ? "ipados" : "ios"
        #endif
        #if targetEnvironment(simulator)
        let simulator = true
        #else
        let simulator = false
        #endif
        let report: [String: Any] = [
            "spike": "CHAOS-78",
            "renderer": renderer,
            "plattform": platform,
            "simulator": simulator,
            "geraet": deviceModel(),
            "aufloesung": [size.0, size.1],
            "display_hz": displayHz,
            "bilder": sorted.count,
            "fps_mittel": Double(sorted.count) * 1000 / sorted.reduce(0, +),
            "bildabstand_ms_median": percentile(sorted, 0.5),
            "bildabstand_ms_p95": percentile(sorted, 0.95),
            "bildabstand_ms_max": sorted.last ?? .nan,
            "instanzen": instances,
            "vsync": settings.throughput ? "aus (offscreen, seriell)" : "immer (ARView)",
            "einstellungen": [
                "sekunden": settings.seconds, "aufwaermen": settings.warmup, "gras": settings.grass,
                "schatten": settings.shadows, "schattenkarte": "nicht steuerbar",
                "msaa": settings.throughput ? (settings.msaa >= 2 ? 4 : 0) as Any : "nicht steuerbar",
                "bildrate": settings.preferredFrameRate.map { Double($0) as Any } ?? NSNull(),
            ] as [String: Any],
        ]
        let json = (try? JSONSerialization.data(withJSONObject: sanitized(report), options: [.sortedKeys]))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        log("SPIKE-ERGEBNIS \(json)")
        fflush(stdout)
        hud = "Ergebnis: \(json)"
        Task { await saveScreenshotAndQuit() }
    }

    private func saveScreenshotAndQuit() async {
        if let path = settings.screenshot, let view, !settings.throughput {
            let image = await withCheckedContinuation { cont in view.snapshot(saveToHDR: false) { cont.resume(returning: $0) } }
            #if os(macOS)
            let cg = image?.cgImage(forProposedRect: nil, context: nil, hints: nil)
            #else
            let cg = image?.cgImage
            #endif
            if let cg { write(cg, to: path) }
        }
        guard settings.quitAfterMeasurement else { return }
        try? await Task.sleep(for: .seconds(1))
        fflush(stdout)
        #if os(macOS)
        NSApp.terminate(nil)
        #else
        exit(0)
        #endif
    }

    private func write(_ image: CGImage, to path: String) {
        let url = URL(fileURLWithPath: path) as CFURL
        guard let dest = CGImageDestinationCreateWithURL(url, "public.png" as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(dest, image, nil)
        if CGImageDestinationFinalize(dest) { log("Bild gespeichert: \(path)") }
    }

    private func cgImage(from texture: MTLTexture) -> CGImage? {
        let (w, h) = (texture.width, texture.height)
        var bytes = [UInt8](repeating: 0, count: w * h * 4)
        texture.getBytes(&bytes, bytesPerRow: w * 4, from: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0)
        let info = CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
        return CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                         space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info)?.makeImage()
    }

    private func deviceModel() -> String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated }
        #if os(macOS)
        let key = "hw.model"
        #else
        let key = "hw.machine"
        #endif
        var size = 0
        sysctlbyname(key, nil, &size, nil, 0)
        var buf = [CChar](repeating: 0, count: max(size, 1))
        sysctlbyname(key, &buf, &size, nil, 0)
        return String(cString: buf)
    }

    /// JSON kennt kein NaN: als null.
    private func sanitized(_ value: Any) -> Any {
        switch value {
        case let d as Double: return d.isFinite ? d : NSNull()
        case let f as Float: return f.isFinite ? Double(f) : NSNull()
        case let dict as [String: Any]: return dict.mapValues(sanitized)
        case let arr as [Any]: return arr.map(sanitized)
        default: return value
        }
    }
}
