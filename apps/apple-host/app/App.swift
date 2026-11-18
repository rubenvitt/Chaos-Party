import Combine
import CoreImage.CIFilterBuiltins
import RealityKit
import SwiftUI

// ADR-019: Mac oder Apple TV hosten die Partie allein; iPhones/iPads bleiben Controller (CHAOS-138, CHAOS-139).
@main
@MainActor
enum Main {
    static func main() {
        #if os(macOS)
        // CHAOS-118: checks the built (signed, hardened) app without a window, see SelfTest.swift.
        if CommandLine.arguments.contains("--selftest") { SelfTest.run() }
        #endif
        ChaosHostApp.main()
    }
}

struct ChaosHostApp: App {
    @StateObject private var runtime = HostRuntime()

    var body: some SwiftUI.Scene {
        WindowGroup("Chaos Party") {
            ZStack(alignment: .topLeading) {
                StageView(runtime: runtime).ignoresSafeArea()
                OverlayView(overlay: runtime.overlay) { runtime.command("start") }
                if let notice = runtime.overlay.notice {
                    NoticeView(notice: notice).frame(maxWidth: .infinity).padding(.top, 28)
                }
            }
            #if os(macOS)
            .frame(minWidth: 960, minHeight: 540)
            #endif
            .onAppear {
                #if os(tvOS)
                // Input comes from phones, not the remote: without this tvOS sleeps mid-game and the listener dies.
                UIApplication.shared.isIdleTimerDisabled = true
                #endif
                runtime.start()
            }
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

/// Big banner like `.board-notice` in the PC host (apps/host/src/styles.css), CHAOS-157.
struct NoticeView: View {
    let notice: RenderState.Notice
    private static let ink = Color(red: 0x1b / 255, green: 0x15 / 255, blue: 0x30 / 255)

    var body: some View {
        VStack(spacing: 4) {
            Text(notice.title).font(.system(size: 40, weight: .black)).foregroundStyle(Color(red: 0xe8 / 255, green: 0x45 / 255, blue: 0x4a / 255))
                .shadow(color: Self.ink, radius: 0, x: 2, y: 2)
            if let detail = notice.detail, !detail.isEmpty {
                Text(detail).font(.system(size: 24, weight: .heavy).monospacedDigit()).foregroundStyle(Self.ink)
            }
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 28).padding(.top, 10).padding(.bottom, 12)
        .background(RoundedRectangle(cornerRadius: 28).fill(Color(red: 1, green: 0xe6 / 255, blue: 0xe6 / 255)))
        .overlay(RoundedRectangle(cornerRadius: 28).stroke(Self.ink, lineWidth: 5))
        .background(RoundedRectangle(cornerRadius: 28).fill(Self.ink).offset(y: 7))
        .transition(.scale(scale: 0.8).combined(with: .opacity))
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
