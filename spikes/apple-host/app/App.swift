import Combine
import CoreImage.CIFilterBuiltins
import RealityKit
import SwiftUI

// CHAOS-138 (ADR-019 W2): Das Apple TV hostet die Partie allein; iPhones/iPads bleiben Controller.
@main
struct ChaosTVHostApp: App {
    @StateObject private var runtime = HostRuntime()

    var body: some SwiftUI.Scene {
        WindowGroup("Chaos Party – Apple-TV-Host") {
            ZStack(alignment: .topLeading) {
                StageView(runtime: runtime).ignoresSafeArea()
                OverlayView(overlay: runtime.overlay) { runtime.command("start") }
            }
            #if os(macOS)
            .frame(minWidth: 960, minHeight: 540)
            #endif
            .onAppear { runtime.start() }
        }
    }
}

struct OverlayView: View {
    let overlay: Overlay
    let start: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if overlay.phase == "lobby" || overlay.phase == "start" {
                HStack(alignment: .top, spacing: 48) {
                    if let qr = qrImage(overlay.joinUrl) {
                        Image(decorative: qr, scale: 1).interpolation(.none).resizable()
                            .frame(width: 360, height: 360).padding(16).background(.white)
                    }
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Chaos Party").font(.largeTitle.bold())
                        Text(overlay.joinUrl).font(.title3.monospaced())
                        Text(overlay.status)
                        ForEach(overlay.players, id: \.self) { Text($0).font(.title2) }
                        startButton
                    }
                }
                .padding(40)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(.black.opacity(0.55))
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(overlay.lines.enumerated()), id: \.offset) { Text($0.element) }
                }
                .font(.title3).padding(12).background(.black.opacity(0.55)).padding(20)
            }
            Spacer()
            Text(overlay.stats).font(.caption.monospaced()).padding(8)
        }
        .foregroundStyle(.white)
    }

    @ViewBuilder private var startButton: some View {
        #if os(macOS)
        Button("Partie starten (⏎)", action: start).keyboardShortcut(.defaultAction)
        #else
        Button("Partie starten", action: start)
        #endif
    }

    private func qrImage(_ text: String) -> CGImage? {
        guard !text.isEmpty else { return nil }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let image = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)) else { return nil }
        return CIContext().createCGImage(image, from: image.extent)
    }
}

#if os(macOS)
struct StageView: NSViewRepresentable {
    let runtime: HostRuntime
    func makeNSView(context: Context) -> ARView { makeView(context.coordinator) }
    func updateNSView(_ view: ARView, context: Context) {}
}
#else
struct StageView: UIViewRepresentable {
    let runtime: HostRuntime
    func makeUIView(context: Context) -> ARView { makeView(context.coordinator) }
    func updateUIView(_ view: ARView, context: Context) {}
}
#endif

extension StageView {
    final class Coordinator {
        var stage: Stage?
        var subscription: (any Cancellable)?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    @MainActor func makeView(_ coordinator: Coordinator) -> ARView {
        let view = ARView(frame: .zero)
        let stage = Stage(view: view)
        coordinator.stage = stage
        // SceneEvents.Update is display-paced on both platforms and drives tick/renderState.
        coordinator.subscription = view.scene.subscribe(to: SceneEvents.Update.self) { [runtime] event in
            MainActor.assumeIsolated { runtime.frame(dtMs: event.deltaTime * 1000) { stage.apply($0) } }
        }
        #if os(macOS)
        NSApplication.shared.activate()
        #endif
        return view
    }
}
