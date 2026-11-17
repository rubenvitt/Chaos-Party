import RealityKit
import SwiftUI
#if os(macOS)
import AppKit
#endif

// iOS/iPadOS ist hier nur Renderer-Benchmark, kein Spiel-Host: Das Spiel läuft auf PC/Mac, iPhones/iPads sind Controller.
@main
struct ChaosRenderSpikeApp: App {
    /// Startparameter, sonst die gespeicherte Messvariante; das Menü (tvOS) ersetzt den Lauf (CHAOS-147).
    @State private var run = SpikeRun.atLaunch()

    var body: some SwiftUI.Scene {
        WindowGroup("Chaos Party – Renderer-Spike (RealityKit)") {
            SpikeScreen(settings: run.settings)
                // Neue Identität je Wahl: Szene, Render-Schleife und Messung beginnen von vorn.
                .id(run.generation)
                #if os(tvOS)
                .modifier(VariantMenu(run: $run))
                #endif
        }
        #if os(macOS)
        .windowResizability(.contentSize)
        #endif
    }
}

/// Ein Lauf: Ansicht des gewählten Pfads, darüber das HUD mit der aktiven Variante.
struct SpikeScreen: View {
    @StateObject private var meter: Meter

    init(settings: Settings) {
        _meter = StateObject(wrappedValue: Meter(settings: settings))
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            SpikeView(meter: meter)
                #if !os(macOS)
                .ignoresSafeArea()
                #endif
            Text(hud)
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
        .onDisappear { meter.stop() }
    }

    private var hud: String {
        var head = "Variante: \(meter.settings.variantLabel) (\(meter.settings.source.rawValue))"
        #if os(tvOS)
        head += "  ·  Play/Pause: Variante wählen"
        #endif
        return head + "\n" + meter.hud
    }

    #if os(macOS)
    private var backingScale: Double { Double(NSScreen.main?.backingScaleFactor ?? 1) }
    #endif
}

#if os(tvOS)
/// CHAOS-147: Auswahl der Messvariante mit der Siri Remote. Play/Pause (oder Klick auf das Touchpad) öffnet das
/// Menü; die Menü-Taste schließt es bzw. führt wie gewohnt zum Home-Bildschirm.
struct VariantMenu: ViewModifier {
    @Binding var run: SpikeRun
    @State private var open = false

    func body(content: Content) -> some View {
        content
            .focusable()
            .focusEffectDisabled()
            .onPlayPauseCommand { open = true }
            .onTapGesture { open = true }
            .confirmationDialog("Messvariante", isPresented: $open, titleVisibility: .visible) {
                ForEach(Variant.all) { variant in
                    Button(run.settings.matches(variant) ? "✓ \(variant.label)" : variant.label) {
                        run.choose(variant)
                    }
                }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Die Messung startet neu. Die Wahl bleibt gespeichert und gilt bei jedem Start ohne Startparameter.")
            }
    }
}
#endif

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
