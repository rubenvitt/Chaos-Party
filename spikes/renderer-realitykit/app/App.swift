import RealityKit
import SwiftUI
#if os(macOS)
import AppKit
#endif

// iOS/iPadOS ist hier nur Renderer-Benchmark, kein Spiel-Host: Das Spiel läuft auf PC/Mac, iPhones/iPads sind Controller.
@main
struct ChaosRenderSpikeApp: App {
    @StateObject private var meter = Meter()

    var body: some SwiftUI.Scene {
        WindowGroup("Chaos Party – Renderer-Spike (RealityKit)") {
            ZStack(alignment: .topLeading) {
                SpikeView(meter: meter)
                    #if !os(macOS)
                    .ignoresSafeArea()
                    #endif
                Text(meter.hud)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundStyle(.white)
                    .padding(6)
                    .background(.black.opacity(0.55))
                    .padding(10)
            }
            #if os(macOS)
            // `breite`/`hoehe` in Bildpunkten wie bei Bevy, umgerechnet in Punkte.
            .frame(width: meter.settings.width / backingScale, height: meter.settings.height / backingScale)
            #endif
        }
        #if os(macOS)
        .windowResizability(.contentSize)
        #endif
    }

    #if os(macOS)
    private var backingScale: Double { Double(NSScreen.main?.backingScaleFactor ?? 1) }
    #endif
}

#if os(macOS)
struct SpikeView: NSViewRepresentable {
    let meter: Meter
    func makeNSView(context: Context) -> NSView { makeView() }
    func updateNSView(_ view: NSView, context: Context) {}
}
#else
struct SpikeView: UIViewRepresentable {
    let meter: Meter
    func makeUIView(context: Context) -> UIView { makeView() }
    func updateUIView(_ view: UIView, context: Context) {}
}
#endif

extension SpikeView {
    @MainActor func makeView() -> PlatformView {
        if meter.settings.upscale {
            // CHAOS-114: eigene Render-Schleife mit interner Auflösung und Hochskalierung.
            let view = MetalLayerView(frame: .zero)
            meter.startUpscaled(view)
            return view
        }
        #if os(iOS)
        let view = ARView(frame: .zero, cameraMode: .nonAR, automaticallyConfigureSession: false)
        #else
        let view = ARView(frame: .zero)
        #endif
        meter.start(view)
        return view
    }
}
