import Foundation
import RealityKit

/// Optional (`--server=ws://<pc>:8787/ws`): verbindet sich wie der Babylon-Host mit dem Sitzungsserver
/// (`host-hello`, Herzschlag), liest `board`-Stände und stellt die Figuren je Slot auf ihr Feld.
@MainActor
final class HostClient {
    static let shared = HostClient()
    private static let protocolVersion = 4
    var pawns: [Int: Entity] = [:]
    private var task: URLSessionWebSocketTask?
    private var heartbeat: Timer?
    private var log: (String) -> Void = { _ in }

    func connect(_ address: String, log: @escaping (String) -> Void) {
        self.log = log
        // Neuer Lauf aus dem Menü (CHAOS-147): alte Verbindung und Herzschlag erst beenden.
        heartbeat?.invalidate()
        task?.cancel(with: .goingAway, reason: nil)
        guard let url = URL(string: address) else { log("Server: ungültige Adresse \(address)"); return }
        let task = URLSession.shared.webSocketTask(with: url)
        self.task = task
        task.resume()
        send(["type": "host-hello"])
        heartbeat = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in
            MainActor.assumeIsolated { self.send(["type": "heartbeat", "t": Date().timeIntervalSince1970 * 1000]) }
        }
        receive()
    }

    private func send(_ message: [String: Any]) {
        var message = message
        message["v"] = Self.protocolVersion
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let text = String(data: data, encoding: .utf8) else { return }
        task?.send(.string(text)) { error in
            if let error { Task { @MainActor in self.log("Server: Senden fehlgeschlagen: \(error)") } }
        }
    }

    private func receive() {
        guard let task else { return }
        task.receive { result in
            Task { @MainActor in
                // Eine ältere, ersetzte Verbindung (neuer Lauf aus dem Menü) meldet sich hier nur noch ab.
                guard task === self.task else { return }
                switch result {
                case .failure(let error):
                    self.log("Server: Verbindung beendet: \(error.localizedDescription)")
                    self.heartbeat?.invalidate()
                case .success(.string(let text)):
                    self.handle(text)
                    self.receive()
                case .success:
                    self.receive()
                }
            }
        }
    }

    private func handle(_ text: String) {
        guard let message = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any],
              let type = message["type"] as? String else { return }
        guard type == "board",
              let view = message["view"] as? [String: Any],
              let players = view["players"] as? [[String: Any]] else {
            if type != "heartbeat-ack" { log("Server: \(type)") }
            return
        }
        for player in players {
            guard let slot = player["slot"] as? Int, let space = player["spaceId"] as? String,
                  let at = Self.spaces[space] else { continue }
            // Mehrere Figuren auf einem Feld leicht versetzt; x gespiegelt wie im Export (Babylon → rechtshändig).
            let offset = Float(slot - 1) * 0.4
            pawns[slot]?.position = SIMD3(-at.x + offset, 0.3, at.z)
        }
        log("Server: board, Runde \(view["round"] ?? "?"), \(players.count) Figuren gesetzt")
    }

    // shortcut: Feldkoordinaten aus packages/game-core/src/board/wackelwald.ts kopiert (nur dieses Brett); für mehr Bretter aus dem Export lesen.
    private static let spaces: [String: (x: Float, z: Float)] = [
        "s01": (0, -8.6), "s02": (2.3, -8.6), "s03": (4.6, -8.6), "s04": (6.9, -8.6), "s05": (9.2, -8.6),
        "s06": (11.4, -8.4), "s07": (13.4, -7.2), "s08": (14.8, -5.5), "s09": (15.5, -3.5), "s10": (15.6, -1.3),
        "s11": (15.6, 0.9), "s12": (15.7, 3.1), "s13": (14.9, 5), "s14": (11.5, -4.8), "s15": (11.2, -1.8),
        "s16": (11.2, 1.2), "s17": (11.5, 4.2), "s18": (13.4, 6.6), "s19": (11.4, 8.2), "s20": (9, 8.6),
        "s21": (6.4, 8.6), "s22": (3.9, 8.6), "s23": (1.3, 8.6), "s24": (-1.3, 8.6), "s25": (-3.9, 8.6),
        "s26": (-6.4, 8.6), "s27": (-9, 8.6), "s28": (-11.4, 8.2), "s29": (-13.4, 6.6), "s30": (-15, 4.6),
        "s31": (-15.6, 2.2), "s32": (-15.6, -0.3), "s33": (-15.6, -2.9), "s34": (-15.1, -5.2), "s35": (-11.1, 3.5),
        "s36": (-11, -0.3), "s37": (-11.1, -4.1), "s38": (-13.4, -7.2), "s39": (-11.4, -8.4), "s40": (-9.2, -8.6),
        "s41": (-6.9, -8.6), "s42": (-4.6, -8.6), "s43": (-2.3, -8.6),
    ]
}
