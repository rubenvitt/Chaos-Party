import Foundation
import QuartzCore
import SwiftUI
#if os(macOS)
import AppKit
#endif

/// Pause aus `renderState().pause` (CHAOS-145): Server-Stand und ob Pausieren gerade geht.
struct PauseScreen: Equatable {
    var paused = false
    var canPause = false
    var roundText: String?

    init() {}

    init(_ p: RenderState.Pause?) {
        paused = p?.paused ?? false
        canPause = p?.canPause ?? false
        roundText = p?.roundText
    }
}

/// Bedienung der Pause wie `PauseControls` im Browser-Host (`apps/host/src/pause/pauseState.ts`):
/// - macOS: **P** oder **Esc** pausiert; in der Pause setzt **P** fort, **Esc** schließt erst die Rückfrage
///   „Partie beenden?“ und setzt sonst fort.
/// - tvOS: **Play/Pause** pausiert bzw. setzt fort, **Menü** wie Esc (nur in Brett, Minispiel und Pause; in der Lobby
///   führt Menü wie gewohnt zum Home-Bildschirm).
/// - Maßgeblich ist der Server-Stand: Die Pause erscheint erst, wenn der Kern sie meldet. Pausieren und Fortsetzen
///   über die Controller gibt es auch im Browser-Host nicht; die Handys zeigen die Pause (`board.paused`).
@MainActor
final class PauseControl: ObservableObject {
    /// Rückfrage „Partie beenden?“ offen; gilt nur in der Pause.
    @Published var confirming = false
    weak var runtime: HostRuntime?
    #if os(macOS)
    private var monitor: Any?
    #endif

    private var pause: PauseScreen { runtime?.overlay.pause ?? PauseScreen() }

    /// P bzw. Play/Pause.
    func toggle() {
        confirming = false
        if pause.paused { runtime?.command("resume") } else if pause.canPause { runtime?.command("pause") }
    }

    /// Esc bzw. Menü.
    func escape() {
        if pause.paused {
            if confirming { confirming = false } else { runtime?.command("resume") }
        } else if pause.canPause {
            runtime?.command("pause")
        }
    }

    func resume() {
        confirming = false
        runtime?.command("resume")
    }

    func endGame() {
        confirming = false
        runtime?.command("end-game")
    }

    #if os(macOS)
    /// Tasten unabhängig vom Fokus (das Brett hat keinen fokussierbaren Knopf).
    func installKeys() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, !event.isARepeat else { return event }
            switch event.keyCode {
            case 35: // P
                guard pause.paused || pause.canPause else { return event }
                toggle()
                return nil
            case 53: // Esc
                guard pause.paused || pause.canPause else { return event }
                escape()
                return nil
            default:
                return event
            }
        }
    }
    #endif
}

/// Beobachtet die Rückfrage „Partie beenden?“ (`PauseControl.confirming`).
struct PauseLayerContainer: View {
    let pause: PauseScreen
    @ObservedObject var control: PauseControl

    var body: some View {
        PauseLayerView(pause: pause, confirming: pause.paused && control.confirming, control: control)
    }
}

/// Pausenkarte über allem (auch über einem Minispiel, Rückmeldung aus CHAOS-144) bzw. der kleine Pause-Hinweis oben
/// rechts, solange Pausieren geht. Gestaltet für 1920×1080.
struct PauseLayerView: View {
    let pause: PauseScreen
    let confirming: Bool
    var control: PauseControl?
    #if os(tvOS)
    @Namespace private var focus
    #endif

    private static let ink = MinigameOverlayView.ink
    private static let paper = MinigameOverlayView.paper
    private static let accent = MinigameOverlayView.accent

    var body: some View {
        ZStack {
            if pause.paused {
                Color.black.opacity(0.5)
                card
            } else if pause.canPause {
                chip.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing).padding(.top, 26).padding(.trailing, 30)
            }
        }
        .frame(width: 1920, height: 1080)
        .foregroundStyle(Self.ink)
        #if os(tvOS)
        .focusScope(focus)
        #endif
    }

    #if os(tvOS)
    private let keys = "▶︎❙❙ weiter · Menü"
    private let chipText = "▶︎❙❙  Pause"
    #else
    private let keys = "P weiter · Esc"
    private let chipText = "❙❙  Pause (P)"
    #endif

    private var chip: some View {
        let label = Text(chipText).font(.system(size: 24, weight: .black, design: .rounded))
            .padding(.horizontal, 22).padding(.vertical, 10)
            .background(Self.paper, in: .capsule).overlay(Capsule().stroke(Self.ink, lineWidth: 4))
        #if os(tvOS)
        // Hält auf tvOS den Fokus, damit Play/Pause und Menü im Brett ankommen (sonst ist nichts fokussierbar).
        return Button { control?.toggle() } label: { label }.buttonStyle(.plain).prefersDefaultFocus(true, in: focus)
        #else
        return Button { control?.toggle() } label: { label }.buttonStyle(.plain)
        #endif
    }

    private var card: some View {
        VStack(spacing: 22) {
            if let round = pause.roundText {
                Text(round.uppercased()).font(.system(size: 26, weight: .black, design: .rounded)).tracking(4).foregroundStyle(Self.ink.opacity(0.7))
            }
            Text("Pause").font(.system(size: 96, weight: .black, design: .rounded))
            if confirming {
                Text("Partie jetzt beenden? Es zählt der aktuelle Stand – danach kommt sofort die Trophäenzählung.")
                    .font(.system(size: 30, weight: .semibold, design: .rounded)).multilineTextAlignment(.center)
                HStack(spacing: 24) {
                    button("Ja, beenden", style: .danger, focused: true) { control?.endGame() }
                    button("Zurück", style: .plain) { control?.confirming = false }
                }
            } else {
                Text("Alles steht still – keine Zeit läuft ab.").font(.system(size: 30, weight: .semibold, design: .rounded))
                HStack(spacing: 24) {
                    button("Weiter", style: .primary, focused: true) { control?.resume() }
                    button("Partie beenden", style: .plain) { control?.confirming = true }
                }
            }
            Text("\(keys) \(confirming ? "zurück" : "weiter")").font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(Self.ink.opacity(0.65))
        }
        .padding(.horizontal, 60).padding(.vertical, 46)
        .frame(width: 900)
        .background(
            RoundedRectangle(cornerRadius: 40).fill(Self.paper)
                .overlay(RoundedRectangle(cornerRadius: 40).stroke(Self.ink, lineWidth: 5))
                .background(RoundedRectangle(cornerRadius: 40).fill(Self.ink).offset(y: 10))
        )
    }

    private enum Style { case primary, danger, plain }

    @ViewBuilder
    private func button(_ label: String, style: Style, focused: Bool = false, action: @escaping () -> Void) -> some View {
        let fill: Color = style == .primary ? Self.accent : style == .danger ? Color(red: 0xe8 / 255, green: 0x45 / 255, blue: 0x4a / 255) : .white
        let content = Text(label).font(.system(size: 34, weight: .black, design: .rounded))
            .foregroundStyle(style == .plain ? Self.ink : .white)
            .padding(.horizontal, 40).padding(.vertical, 16)
            .background(fill, in: .capsule).overlay(Capsule().stroke(Self.ink, lineWidth: 5))
        #if os(tvOS)
        Button(action: action) { content }.buttonStyle(.plain).prefersDefaultFocus(focused, in: focus)
        #else
        if focused {
            Button(action: action) { content }.buttonStyle(.plain).keyboardShortcut(.defaultAction)
        } else {
            Button(action: action) { content }.buttonStyle(.plain)
        }
        #endif
    }
}

/// Startparameter für Sichtprüfungen ohne Fernbedienung und Tastatur (CHAOS-145), mit `--autostart` und Bot-Controllern:
/// - `--pausentest`: pausiert einmal im Brett (nach 6 s) und einmal im laufenden Minispiel (nach 5 s) für je 8 s.
/// - `--revanche=<s>` (ohne Wert 8): so lange nach dem Siegerbildschirm „Nochmal spielen“.
@MainActor
enum LaunchProbes {
    static func attach(runtime: HostRuntime) {
        let args = CommandLine.arguments
        let pauseTest = args.contains("--pausentest")
        let rematchArg = args.first { $0 == "--revanche" || $0.hasPrefix("--revanche=") }
        let rematchAfter = rematchArg.map { Double($0.split(separator: "=").dropFirst().first ?? "") ?? 8 }
        guard pauseTest || rematchAfter != nil else { return }
        var boardSince: CFTimeInterval?, playSince: CFTimeInterval?, pausedAt: CFTimeInterval?, winnerSince: CFTimeInterval?
        var boardDone = false, minigameDone = false, rematchSent = false
        Task { @MainActor [weak runtime] in
            while true {
                try? await Task.sleep(for: .milliseconds(250))
                guard let runtime else { return }
                let o = runtime.overlay
                let now = CACurrentMediaTime()
                if pauseTest {
                    boardSince = o.phase == "board" ? boardSince ?? now : nil
                    playSince = o.phase == "minigame" && o.minigame?.stage == "play" ? playSince ?? now : nil
                    if o.pause.paused, let at = pausedAt, now - at >= 8 {
                        hostLog("Pausentest: weiter")
                        runtime.command("resume")
                        pausedAt = nil
                    } else if !o.pause.paused, pausedAt == nil, o.pause.canPause {
                        if !boardDone, let since = boardSince, now - since >= 6 {
                            boardDone = true
                            pausedAt = now
                            hostLog("Pausentest: Pause im Brett")
                            runtime.command("pause")
                        } else if !minigameDone, let since = playSince, now - since >= 5 {
                            minigameDone = true
                            pausedAt = now
                            hostLog("Pausentest: Pause im Minispiel")
                            runtime.command("pause")
                        }
                    }
                }
                if let after = rematchAfter {
                    winnerSince = o.finale?.done == true ? winnerSince ?? now : nil
                    if !(o.finale?.done ?? false) { rematchSent = false }
                    if let since = winnerSince, now - since >= after, !rematchSent, o.finale?.canRematch == true {
                        rematchSent = true
                        hostLog("Revanche-Test: Nochmal spielen")
                        runtime.command("rematch")
                        boardDone = false
                        minigameDone = false
                    }
                }
            }
        }
    }
}
