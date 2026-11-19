import Foundation
import JavaScriptCore
import QuartzCore
import Security
import os

private let logger = Logger(subsystem: "dev.rubeen.chaosparty.host", category: "host")

/// Problem lines since launch (`FEHLER`, `JS-FEHLER`, errors the JS core only logs); `--selftest` fails on them.
let hostProblems = OSAllocatedUnfairLock(initialState: 0)

func hostLog(_ text: String) {
    if text.hasPrefix("FEHLER") || text.hasPrefix("JS-FEHLER")
        || (text.hasPrefix("JS ") && ["Fehler", "ERROR", "fehlgeschlagen"].contains { text.contains($0) }) {
        hostProblems.withLock { $0 += 1 }
    }
    print(text)
    fflush(stdout)
    logger.log("\(text, privacy: .public)")
}

struct Overlay: Equatable {
    var phase = "start"
    var status = "startet …"
    var joinUrl = ""
    var joinCode = ""
    var players: [RenderState.Player] = []
    /// Brett und Figuren geladen (oder ohne Assets aufgegeben); vorher ist der Start gesperrt.
    var sceneLoaded = false
    var lines: [String] = []
    var notice: RenderState.Notice?
    /// Rundenzahl und „Mehr Zeit zum Reagieren“ (CHAOS-166).
    var settings: RenderState.LobbySettings?
    var stats = ""
}

/// One JSContext on a serial queue; the network runs on the same queue. Frames come from the main thread.
final class HostRuntime: ObservableObject {
    @Published private(set) var overlay = Overlay()

    private let queue = DispatchQueue(label: "dev.rubeen.chaosparty.host.js")
    private let context = JSContext()!
    private var instance: JSValue? // queue only
    private var server: HttpWsServer? // queue only
    private var connections = 0 // main only, refreshed per frame
    private var ready = false // main only
    private var busy = false // main only
    private var frameMs: [Double] = []
    private var jsMs: [Double] = []
    private var skipped = 0
    /// Completed JS ticks since launch (main only); `--selftest` waits for a few hundred.
    private(set) var ticks = 0
    private var windowStart = CACurrentMediaTime()
    private var lastState: RenderState?
    private var decodeFailed = false
    /// `--autostart`: start as soon as all lobby players are ready (no remote/keyboard needed for tests).
    private let autostart = CommandLine.arguments.contains("--autostart")
    /// `host-ready` erst nach `sceneReady()` (CHAOS-142); `--selftest` hat keine Szene.
    private let deferScene: Bool
    private var presentedMs: [Double] = []

    init(deferScene: Bool = true) { self.deferScene = deferScene }

    func start() { queue.async { self.boot() } }

    /// Brett und Figuren sind geladen: `host-ready` an den Server (CHAOS-68), Start freigeben.
    func sceneReady() {
        overlay.sceneLoaded = true
        queue.async { _ = self.instance?.invokeMethod("sceneReady", withArguments: []) }
    }

    /// Abstand zweier tatsächlich angezeigter Bilder (Main), für `HOST-MESSUNG`.
    func presented(ms: Double) { presentedMs.append(ms) }

    func command(_ cmd: String) {
        queue.async { _ = self.instance?.invokeMethod("hostCommand", withArguments: [cmd]) }
    }

    private func boot() {
        context.exceptionHandler = { _, error in
            hostLog("JS-FEHLER \(error?.toString() ?? "?") \(error?.objectForKeyedSubscript("stack")?.toString() ?? "")")
        }
        guard let payload = Bundle.main.url(forResource: "payload", withExtension: nil),
              let source = try? String(contentsOf: payload.appending(path: "chaos-host.js"), encoding: .utf8),
              let wasm = try? Data(contentsOf: payload.appending(path: "HavokPhysics.wasm"))
        else { return fail("payload fehlt – erst apps/apple-host/prepare.sh ausführen") }
        let t0 = CACurrentMediaTime()
        context.evaluateScript(source, withSourceURL: URL(string: "chaos-host.js"))
        hostLog(String(format: "Bündel geladen: %d KB in %.0f ms", source.utf8.count / 1024, (CACurrentMediaTime() - t0) * 1000))

        let server = HttpWsServer(queue: queue, webRoot: payload.appending(path: "controller"))
        server.onOpen = { [weak self] id in _ = self?.instance?.invokeMethod("open", withArguments: [id]) }
        server.onMessage = { [weak self] id, text in _ = self?.instance?.invokeMethod("message", withArguments: [id, text]) }
        server.onClosed = { [weak self] id in _ = self?.instance?.invokeMethod("closed", withArguments: [id]) }
        self.server = server
        server.start(port: 8787) { [weak self] port in self?.create(port: port, wasm: wasm) }
    }

    private func create(port: UInt16, wasm: Data) {
        let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") // like apps/server/src/ids.ts
        let code = String((0..<4).map { _ in alphabet.randomElement()! })
        let joinUrl = "http://\(lanIPv4() ?? "127.0.0.1"):\(port)/?code=\(code)"
        hostLog("JOIN-URL \(joinUrl)")

        let env = JSValue(newObjectIn: context)!
        let send: @convention(block) (Int, String) -> Void = { [weak self] id, text in self?.server?.send(id, text) }
        let close: @convention(block) (Int, Int, String) -> Void = { [weak self] id, code, reason in
            self?.server?.close(id, code: code, reason: reason)
        }
        let log: @convention(block) (String) -> Void = { hostLog("JS \($0)") }
        let randomBytes: @convention(block) (Int) -> [NSNumber] = { n in
            var bytes = [UInt8](repeating: 0, count: max(0, min(n, 65536)))
            precondition(SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess, "SecRandomCopyBytes")
            return bytes.map { NSNumber(value: $0) }
        }
        env.setValue(unsafeBitCast(send, to: AnyObject.self), forProperty: "send")
        env.setValue(unsafeBitCast(close, to: AnyObject.self), forProperty: "close")
        env.setValue(unsafeBitCast(log, to: AnyObject.self), forProperty: "log")
        env.setValue(unsafeBitCast(randomBytes, to: AnyObject.self), forProperty: "randomBytes")
        env.setValue(joinUrl, forProperty: "joinUrl")
        env.setValue(code, forProperty: "joinCode")
        env.setValue(deferScene, forProperty: "deferSceneReady")
        let ref = context.jsGlobalContextRef
        let typed = JSObjectMakeTypedArray(ref, kJSTypedArrayTypeUint8Array, wasm.count, nil)
        wasm.copyBytes(to: JSObjectGetTypedArrayBytesPtr(ref, typed, nil).assumingMemoryBound(to: UInt8.self), count: wasm.count)
        env.setValue(JSValue(jsValueRef: typed, in: context), forProperty: "havokWasm")

        let t0 = CACurrentMediaTime()
        let created = context.objectForKeyedSubscript("ChaosHost")?.invokeMethod("create", withArguments: [env])
        guard let created, created.isObject else { return fail("ChaosHost.create fehlgeschlagen (siehe JS-FEHLER)") }
        instance = created
        hostLog(String(format: "ChaosHost.create in %.0f ms", (CACurrentMediaTime() - t0) * 1000))
        if let configure = launchConfigureCommand(CommandLine.arguments) {
            hostLog("Startparameter: \(configure)")
            _ = created.invokeMethod("hostCommand", withArguments: [configure])
        }
        DispatchQueue.main.async {
            self.ready = true
            self.overlay.joinUrl = joinUrl
            self.overlay.joinCode = code
            self.overlay.status = "Bereit – Controller scannen den QR-Code"
        }
    }

    private func fail(_ message: String) {
        hostLog("FEHLER \(message)")
        DispatchQueue.main.async { self.overlay.status = "Fehler: \(message)" }
    }

    /// Main thread, once per displayed frame. Skips the JS tick while the previous one still runs.
    func frame(dtMs: Double, apply: @escaping (RenderState) -> Void) {
        if dtMs > 0 { frameMs.append(dtMs) }
        report()
        guard ready else { return }
        guard !busy else { skipped += 1; return }
        busy = true
        let now = CACurrentMediaTime() * 1000 // monotonic, as jscore expects
        queue.async {
            let t0 = CACurrentMediaTime()
            _ = self.instance?.invokeMethod("tick", withArguments: [now])
            let json = self.instance?.invokeMethod("renderState", withArguments: [])?.toString() ?? ""
            let ms = (CACurrentMediaTime() - t0) * 1000
            var state: RenderState?
            do { state = try RenderState.decode(json) } catch {
                if !self.decodeFailed { hostLog("FEHLER renderState: \(error) – \(json.prefix(300))") }
                self.decodeFailed = true
            }
            let connections = self.server?.connectionCount ?? 0
            DispatchQueue.main.async {
                self.busy = false
                self.ticks += 1
                self.jsMs.append(ms)
                self.connections = connections
                guard let state else { return }
                self.lastState = state
                apply(state)
                self.publish(state)
            }
        }
    }

    private func publish(_ s: RenderState) {
        var o = overlay
        o.phase = s.phase
        if let url = s.lobby?.joinUrl, !url.isEmpty { o.joinUrl = url }
        if let code = s.lobby?.joinCode, !code.isEmpty { o.joinCode = code }
        o.players = s.lobby?.players ?? []
        o.settings = s.lobby?.settings
        if s.phase == "minigame", let m = s.minigame {
            o.lines = ["\(m.id) · \(m.stage ?? "")", m.hud ?? ""].filter { !$0.isEmpty }
        } else if let b = s.board {
            let active = b.activeSlot.flatMap { slot in o.players.first { $0.slot == slot }?.name ?? "Spieler \(slot)" } ?? "–"
            o.lines = ["Runde \(b.round ?? 0)/\(b.rounds ?? 0) – am Zug: \(active)"]
                + (b.messages ?? []).suffix(4)
        } else {
            o.lines = [s.phase]
        }
        o.notice = s.phase == "board" ? s.board?.notice : nil
        if o != overlay { overlay = o }
        let players = s.lobby?.players ?? []
        if autostart, overlay.sceneLoaded, s.phase == "lobby", !players.isEmpty, players.allSatisfy({ $0.ready == true }) {
            command("start")
        }
    }

    private func report() {
        let now = CACurrentMediaTime()
        guard now - windowStart >= 10, !frameMs.isEmpty else { return }
        let frames = frameMs.sorted(), js = jsMs.sorted(), shown = presentedMs.sorted()
        #if os(tvOS)
        let platform = "tvos"
        #else
        let platform = "macos"
        #endif
        let result: [String: Any] = [
            "host": "apple-host", "plattform": platform, "phase": lastState?.phase ?? "start",
            "verbindungen": connections, "koerper": lastState?.minigame?.bodies?.count ?? 0,
            "bilder": frames.count, "bildabstand_ms_median": percentile(frames, 0.5), "bildabstand_ms_p95": percentile(frames, 0.95),
            "js_ticks": js.count, "js_ms_median": percentile(js, 0.5), "js_ms_p95": percentile(js, 0.95), "js_ms_max": js.last ?? 0,
            "js_uebersprungen": skipped,
            // Tatsächlich angezeigte Bilder (CHAOS-142: Bildrate bei 4K auf der Apple TV).
            "angezeigt": shown.count, "angezeigt_ms_median": percentile(shown, 0.5), "angezeigt_ms_p95": percentile(shown, 0.95),
            "fps": shown.isEmpty ? 0 : Double(shown.count) / (now - windowStart),
        ]
        let json = (try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])).map { String(decoding: $0, as: UTF8.self) } ?? "{}"
        hostLog("HOST-MESSUNG \(json)")
        overlay.stats = String(format: "%.0f fps · Bild %.1f/%.1f ms · JS %.2f/%.2f ms (Median/p95) · %d Verbindungen",
                               shown.isEmpty ? 0 : Double(shown.count) / (now - windowStart),
                               percentile(frames, 0.5), percentile(frames, 0.95), percentile(js, 0.5), percentile(js, 0.95), connections)
        frameMs.removeAll(keepingCapacity: true)
        jsMs.removeAll(keepingCapacity: true)
        presentedMs.removeAll(keepingCapacity: true)
        skipped = 0
        windowStart = now
    }
}

func percentile(_ sorted: [Double], _ p: Double) -> Double {
    sorted.isEmpty ? 0 : sorted[min(sorted.count - 1, Int(Double(sorted.count) * p))]
}
