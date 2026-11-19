import Foundation
#if os(macOS)
import AppKit

/// CHAOS-203: macOS drosselt eine App, deren Fenster niemand sieht (verdeckt, minimiert, Display aus oder gesperrt):
/// App Nap, gebündelte Timer, niedrigere CPU-Priorität. Gemessen bei dunklem Display: Der Ersatztakt
/// (`RenderLoop.fallbackTick`) kam nur noch mit etwa 4 statt 8 Hz, einzelne JS-Ticks brauchten bis zu 1,2 s (EXP-031:
/// bis 5 s). Der Aufbau eines Minispiels ist auf Ticks verteilt (CHAOS-141); er wurde erst lange nach dem Countdown
/// fertig, das Minispiel endete nach der Kulanz des Servers (15 s), und das Ergebnis kam „nicht mehr gebraucht“ an.
///
/// Solange eine Partie läuft oder Controller verbunden sind, meldet der Host darum eine Aktivität an, die das abschaltet
/// (`.userInitiated`: kein App Nap, kein Ruhezustand des Macs; `.latencyCritical`: Timer pünktlich). Das Display darf
/// weiter dunkel werden. Ohne Controller in Lobby oder Siegerbildschirm darf macOS wieder drosseln. Nur macOS; tvOS pausiert die Partie im
/// Hintergrund (CHAOS-145). Nur auf dem Main-Thread benutzen.
final class SessionActivity {
    private var token: NSObjectProtocol?

    var isActive: Bool { token != nil }

    /// Controller verbunden oder Partie unterwegs (Brett, Minispiel, Pause): Drosselung aus; sonst wieder erlauben.
    /// Ohne Controller in Lobby oder Siegerbildschirm darf der Mac wieder schlafen.
    func update(phase: String, connections: Int) {
        let wanted = connections > 0 || ["board", "minigame", "paused"].contains(phase)
        guard wanted != isActive else { return }
        if wanted {
            token = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .latencyCritical],
                                                          reason: "Chaos Party: Partie läuft")
            hostLog("Drosselung aus (App Nap, Timer): Partie läuft")
        } else if let token {
            ProcessInfo.processInfo.endActivity(token)
            self.token = nil
            hostLog("Drosselung wieder erlaubt: keine Partie, keine Controller")
        }
    }

    /// `--minimiert` (CHAOS-203): Fenster kurz nach dem Start ins Dock legen. So lässt sich der Ersatztakt eines
    /// unsichtbaren Hosts ohne Handgriff nachstellen (README „Prüfen“).
    static func minimizeIfRequested() {
        guard CommandLine.arguments.contains("--minimiert") else { return }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            for window in NSApp.windows where window.isVisible { window.miniaturize(nil) }
            hostLog("Startparameter: Fenster minimiert")
        }
    }
}
#endif
