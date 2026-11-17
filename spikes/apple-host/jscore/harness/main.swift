// Harness für den JS-Kern (CHAOS-138): lädt dist/chaos-host.js in ein JSContext (macOS), spielt
// mit zwei simulierten Controllern (echte Protokoll-Nachrichten) eine Partie bis zum ersten
// angenommenen Minispiel-Ergebnis (mit `full`: bis zum Endstand) und misst die Rechenzeit je
// Tick. Virtuelle Uhr: 60 Ticks je Spielsekunde, ohne zu warten.
//
//   swift spikes/apple-host/jscore/harness/main.swift [full]
//
// Achtung: macOS-JSC hat einen JIT; die Zeiten sagen nichts über tvOS (dort ohne JIT).
import Foundation
import JavaScriptCore
import Security

let dist = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
  .deletingLastPathComponent().appendingPathComponent("dist")
let full = CommandLine.arguments.contains("full")
let joinCode = "AB12"

/// CPU-Zeit dieses Threads in ms: robust, wenn andere Prozesse die Maschine auslasten.
func cpuMs() -> Double {
  var ts = timespec()
  clock_gettime(CLOCK_THREAD_CPUTIME_ID, &ts)
  return Double(ts.tv_sec) * 1000 + Double(ts.tv_nsec) / 1_000_000
}
func out(_ s: String) { print(s); fflush(stdout) }
func fail(_ s: String) -> Never { out("FEHLER " + s); exit(1) }

let ctx = JSContext()!
var jsErrors = 0
ctx.exceptionHandler = { _, e in jsErrors += 1; out("JS-EXCEPTION \(e?.toString() ?? "?")") }

// --- env -----------------------------------------------------------------------------------
var outbox: [(Int, String)] = []
var closedByHost: [(Int, Int, String)] = []
var logLines: [String] = []
let send: @convention(block) (Int, String) -> Void = { id, text in outbox.append((id, text)) }
let close: @convention(block) (Int, Int, String) -> Void = { id, code, reason in
  closedByHost.append((id, code, reason))
}
let log: @convention(block) (String) -> Void = { line in logLines.append(line); out("  js: \(line)") }
let randomBytes: @convention(block) (Int) -> [NSNumber] = { n in
  var bytes = [UInt8](repeating: 0, count: n)
  guard SecRandomCopyBytes(kSecRandomDefault, n, &bytes) == errSecSuccess else { fail("SecRandom") }
  return bytes.map { NSNumber(value: $0) }
}
for (name, value) in [("__send", send as Any), ("__close", close), ("__log", log), ("__randomBytes", randomBytes)] {
  ctx.setObject(value, forKeyedSubscript: name as NSString)
}

// Havok-Bytes ohne Kopie als Uint8Array (2 MB als NSNumber-Array wären langsam).
guard let wasm = try? Data(contentsOf: dist.appendingPathComponent("HavokPhysics.wasm")) else {
  fail("dist/HavokPhysics.wasm fehlt – erst build.sh")
}
let wasmPtr = UnsafeMutableRawPointer.allocate(byteCount: wasm.count, alignment: 16)
wasm.copyBytes(to: wasmPtr.assumingMemoryBound(to: UInt8.self), count: wasm.count)
let wasmArray = JSObjectMakeTypedArrayWithBytesNoCopy(
  ctx.jsGlobalContextRef, kJSTypedArrayTypeUint8Array, wasmPtr, wasm.count, nil, nil, nil)
ctx.setObject(JSValue(jsValueRef: wasmArray, in: ctx), forKeyedSubscript: "__havokWasm" as NSString)

guard let bundle = try? String(contentsOf: dist.appendingPathComponent("chaos-host.js"), encoding: .utf8)
else { fail("dist/chaos-host.js fehlt – erst build.sh") }
var t0 = Date()
ctx.evaluateScript(bundle, withSourceURL: dist.appendingPathComponent("chaos-host.js"))
out("Bündel geladen: \(bundle.utf8.count / 1024) KiB in \(Int(Date().timeIntervalSince(t0) * 1000)) ms")

// Selbstprüfung des base64url-Shims gegen Foundation.
let sample: [UInt8] = [0, 1, 2, 250, 251, 252, 253, 254, 255, 42, 7]
for n in 0...sample.count {
  let bytes = Array(sample.prefix(n))
  let js = ctx.objectForKeyedSubscript("ChaosHostInternals").invokeMethod("base64url", withArguments: [
    ctx.evaluateScript("Uint8Array.from(\(bytes))")!,
  ])!.toString()!
  let swift = Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-")
    .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  if js != swift { fail("base64url(\(bytes)) = \(js), erwartet \(swift)") }
}
out("base64url-Shim stimmt mit Foundation überein")

t0 = Date()
let host = ctx.evaluateScript("""
  ChaosHost.create({ send: __send, close: __close, log: __log, randomBytes: __randomBytes,
    havokWasm: __havokWasm, joinUrl: 'http://192.168.0.2:8080/?code=\(joinCode)', joinCode: '\(joinCode)' })
  """)!
out("create in \(Int(Date().timeIntervalSince(t0) * 1000)) ms")
if host.isUndefined { fail("ChaosHost.create lieferte nichts") }

// --- Controller ------------------------------------------------------------------------------
final class Controller {
  let id: Int
  let name: String
  let character: String
  var seq = 0
  var slot: Int?
  var actions: [String] = []
  var answered = Set<Int>()
  var lastHeartbeat = 0.0
  var lastInput = 0.0
  var pressed = false
  var picked = false
  init(id: Int, name: String, character: String) {
    self.id = id; self.name = name; self.character = character
  }
  func nextSeq() -> Int { seq += 1; return seq }
}

func json(_ object: [String: Any]) -> String {
  String(data: try! JSONSerialization.data(withJSONObject: object), encoding: .utf8)!
}
func callHost(_ method: String, _ args: [Any]) -> JSValue? { host.invokeMethod(method, withArguments: args) }
func sendTo(_ c: Controller, _ type: String, _ fields: [String: Any]) {
  var message: [String: Any] = ["v": 4, "type": type]
  message.merge(fields) { _, new in new }
  _ = callHost("message", [c.id, json(message)])
}

let controllers = [Controller(id: 1, name: "Anna", character: "raccoon"),
                   Controller(id: 2, name: "Ben", character: "sock")]
var now = 0.0
var minigameAccepted = false
var errorsFromServer = 0

func handle(_ c: Controller, _ text: String) {
  guard let m = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
        let type = m["type"] as? String else { fail("unlesbar: \(text)") }
  switch type {
  case "welcome":
    let players = m["players"] as! [[String: Any]]
    c.slot = players[0]["slot"] as? Int
    out("[\(Int(now)) ms] \(c.name): welcome, Slot \(c.slot!)")
  case "context":
    c.actions = m["actions"] as? [String] ?? []
    guard let slot = c.slot else { return }
    if c.actions.contains("pick-character") && !c.picked {
      c.picked = true
      sendTo(c, "pick-character", ["slot": slot, "seq": c.nextSeq(), "character": c.character])
    } else if c.actions.contains("ready") && c.picked {
      sendTo(c, "ready", ["slot": slot, "seq": c.nextSeq()])
    }
    if c.actions.contains("choose"), let prompt = m["prompt"] as? [String: Any],
       let promptId = prompt["id"] as? Int, !c.answered.contains(promptId),
       let option = (prompt["options"] as? [[String: Any]])?.first?["id"] as? String {
      c.answered.insert(promptId)
      sendTo(c, "choose", ["slot": slot, "seq": c.nextSeq(), "promptId": promptId, "option": option])
    }
  case "error":
    errorsFromServer += 1
    out("[\(Int(now)) ms] \(c.name): error \(m["code"] ?? "?") \(m["message"] ?? "")")
  default:
    break
  }
}

func drain() {
  while !outbox.isEmpty || !closedByHost.isEmpty {
    let batch = outbox; outbox = []
    for (id, text) in batch {
      guard let c = controllers.first(where: { $0.id == id }) else { fail("send an unbekannte Verbindung \(id)") }
      handle(c, text)
    }
    for (id, code, reason) in closedByHost { fail("Host schließt Verbindung \(id): \(code) \(reason)") }
  }
}

/// Eingaben im Minispiel: Stick im Kreis (10/s), A alle 0,4 s abwechselnd drücken/loslassen.
func play(_ c: Controller) {
  guard let slot = c.slot else { return }
  if now - c.lastHeartbeat >= 5000 {
    c.lastHeartbeat = now
    sendTo(c, "heartbeat", ["t": now])
  }
  guard now - c.lastInput >= 100 else { return }
  c.lastInput = now
  if c.actions.contains("move") {
    let angle = now / 700 + Double(slot)
    sendTo(c, "move", ["slot": slot, "seq": c.nextSeq(), "x": cos(angle), "y": sin(angle)])
  }
  if c.actions.contains("button-a"), Int(now / 100) % 4 == slot {
    c.pressed.toggle()
    sendTo(c, c.pressed ? "press" : "release", ["slot": slot, "seq": c.nextSeq(), "button": "a"])
  }
}

// --- Ablauf ----------------------------------------------------------------------------------
struct Stat { var n = 0; var sum = 0.0; var max = 0.0
  mutating func add(_ v: Double) { n += 1; sum += v; max = Swift.max(max, v) }
  var text: String { n == 0 ? "-" : String(format: "Ø %.3f ms, max %.2f ms (n=%d)", sum / Double(n), max, n) }
}
var tickStats: [String: Stat] = [:]
var renderStats: [String: Stat] = [:]
var lastPhase = ""
var lastStage = ""
var started = false
var printedMidPlay = false
var resultsSeenAfterAccept = false
let step = 1000.0 / 60.0
let limitMs = full ? 30 * 60_000.0 : 5 * 60_000.0

for c in controllers {
  _ = callHost("open", [c.id])
  sendTo(c, "join", ["joinCode": joinCode, "seats": 1, "names": [c.name]])
}
drain()

while now < limitMs {
  now += step
  RunLoop.current.run(until: Date())  // GC-Zeitgeber von JSC laufen über die Run-Loop (wie in der App)
  var t = cpuMs()
  _ = callHost("tick", [now])
  let tickMs = cpuMs() - t
  drain()
  for c in controllers { play(c) }
  drain()
  t = cpuMs()
  let stateText = callHost("renderState", [])!.toString()!
  let renderMs = cpuMs() - t
  guard let state = try? JSONSerialization.jsonObject(with: Data(stateText.utf8)) as? [String: Any],
        let phase = state["phase"] as? String else { fail("renderState unlesbar: \(stateText.prefix(200))") }
  let minigame = state["minigame"] as? [String: Any]
  if logLines.contains(where: { $0.contains("angenommen") }) { minigameAccepted = true }
  let stageName = minigame?["stage"] as? String ?? ""
  let key = phase == "minigame" ? "minigame-\(stageName)" : phase
  tickStats[key, default: Stat()].add(tickMs)
  renderStats[key, default: Stat()].add(renderMs)

  if phase != lastPhase || stageName != lastStage {
    out("[\(Int(now)) ms] Phase \(lastPhase.isEmpty ? "-" : lastPhase) → \(phase)\(stageName.isEmpty ? "" : " (\(stageName))")")
    if phase == "board" && lastPhase == "lobby", let board = state["board"] as? [String: Any] {
      let spaces = (board["spaces"] as? [Any])?.count ?? 0
      out("  board: Runde \(board["round"]!)/\(board["rounds"]!), \(spaces) Felder, Figuren \(json(["p": board["pawns"]!]))")
    }
    if phase == "minigame", stageName == "results" {
      out("  minigame: \(minigame?["id"] ?? "?") hud=\(minigame?["hud"] ?? "")")
      if minigameAccepted { resultsSeenAfterAccept = true }
    }
    lastPhase = phase; lastStage = stageName
  }
  if !started, let lobby = state["lobby"] as? [String: Any], let players = lobby["players"] as? [[String: Any]],
     players.count == 2, players.allSatisfy({ $0["ready"] as? Bool == true }) {
    started = true
    out("[\(Int(now)) ms] Lobby: \(json(["players": players]))")
    _ = callHost("hostCommand", ["start"])
    drain()
  }
  if stageName == "play", !printedMidPlay, (minigame?["elapsedMs"] as? Double ?? 0) > 1500 {
    printedMidPlay = true
    let bodies = minigame?["bodies"] as? [[String: Any]] ?? []
    let shapes = Dictionary(grouping: bodies, by: { $0["shape"] as? String ?? "?" }).mapValues(\.count)
    out("  minigame \(minigame?["id"] ?? "?") nach \(minigame?["elapsedMs"] ?? 0) ms: \(bodies.count) Körper \(shapes), hud=\(minigame?["hud"] ?? "")")
    for body in bodies.prefix(4) { out("    \(json(body))") }
    out("  renderState: \(stateText.utf8.count / 1024) KiB")
  }
  if !full && resultsSeenAfterAccept { break }
  if full && phase == "final" { out("[\(Int(now)) ms] Endstand erreicht"); break }
}

out("\nCPU-Zeit je Tick (macOS-JSC mit JIT – nur funktional, nicht tvOS-repräsentativ):")
for key in tickStats.keys.sorted() {
  out("  \(key): tick \(tickStats[key]!.text); renderState \(renderStats[key]!.text)")
}
out("Virtuelle Spielzeit \(Int(now / 1000)) s, Server-Fehler an Controller: \(errorsFromServer), JS-Ausnahmen: \(jsErrors)")
let ok = minigameAccepted && resultsSeenAfterAccept && jsErrors == 0 && (!full || lastPhase == "final")
out(ok ? "ERGEBNIS: OK" : "ERGEBNIS: NICHT OK (Ergebnis angenommen: \(minigameAccepted), Ergebnisanzeige: \(resultsSeenAfterAccept))")
exit(ok ? 0 : 1)
