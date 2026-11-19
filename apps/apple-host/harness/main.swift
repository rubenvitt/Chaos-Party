// Harness für den JS-Kern (CHAOS-138/139): lädt dist/chaos-host.js in ein JSContext (macOS), spielt
// mit zwei simulierten Controllern (echte Protokoll-Nachrichten) eine Partie bis zum ersten
// angenommenen Minispiel-Ergebnis (mit `full`: bis zum Endstand, alle Minispiele der Rotation) und
// misst die Rechenzeit je Tick. Virtuelle Uhr: 60 Ticks je Spielsekunde, ohne zu warten.
// Dekodiert außerdem die Beispielnachrichten (Fixtures/render-state) und jedes geprüfte
// `renderState` mit `app/RenderState.swift`, also genau dem Typ der App.
//
//   apps/apple-host/harness/run.sh [full]     (baut mit swiftc und startet; vorher `pnpm build`)
//
// Die Zeiten sind CPU-Zeit dieses Threads. JSC lief hier faktisch ohne JIT (EXP-024); die CI setzt
// zusätzlich JSC_useJIT=false. Ein Apple TV hat einen langsameren Kern, die Zahlen sind also eine
// Untergrenze für tvOS. Exit 1 bei jeder JS-Ausnahme, Problemzeile im Log oder Vertragsbruch.
import Foundation
import JavaScriptCore
import Security

let harnessDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let dist = harnessDir.deletingLastPathComponent().appendingPathComponent("dist")
let fixtures = harnessDir.appendingPathComponent("Fixtures/render-state")
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

// Beispielnachrichten des Vertrags (scripts/export-apple-host-fixtures.mjs) mit dem Typ der App dekodieren.
let fixtureFiles = (try? FileManager.default.contentsOfDirectory(at: fixtures, includingPropertiesForKeys: nil))?
  .filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent } ?? []
if fixtureFiles.isEmpty { fail("keine Fixtures in \(fixtures.path)") }
for file in fixtureFiles {
  guard let text = try? String(contentsOf: file, encoding: .utf8) else { fail("\(file.lastPathComponent) unlesbar") }
  do {
    let state = try RenderState.decode(text)
    if !RenderState.phases.contains(state.phase) { fail("\(file.lastPathComponent): Phase \(state.phase) unbekannt") }
  } catch { fail("\(file.lastPathComponent): \(error)") }
}
// CHAOS-157: die Einblendung „Sabotage wird stärker!“ kommt in der App an.
if let file = fixtureFiles.first(where: { $0.lastPathComponent == "board-sabotage-notice.json" }) {
  let state = try RenderState.decode(String(contentsOf: file, encoding: .utf8))
  if state.board?.notice?.title != "Sabotage wird stärker!" { fail("board-sabotage-notice.json: Einblendung fehlt") }
} else { fail("board-sabotage-notice.json fehlt") }
out("Fixtures dekodiert: \(fixtureFiles.count) Dateien mit RenderState.swift")

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
  fail("dist/HavokPhysics.wasm fehlt – erst `pnpm --filter @chaos-party/apple-host build`")
}
let wasmPtr = UnsafeMutableRawPointer.allocate(byteCount: wasm.count, alignment: 16)
wasm.copyBytes(to: wasmPtr.assumingMemoryBound(to: UInt8.self), count: wasm.count)
let wasmArray = JSObjectMakeTypedArrayWithBytesNoCopy(
  ctx.jsGlobalContextRef, kJSTypedArrayTypeUint8Array, wasmPtr, wasm.count, nil, nil, nil)
ctx.setObject(JSValue(jsValueRef: wasmArray, in: ctx), forKeyedSubscript: "__havokWasm" as NSString)

guard let bundle = try? String(contentsOf: dist.appendingPathComponent("chaos-host.js"), encoding: .utf8)
else { fail("dist/chaos-host.js fehlt – erst `pnpm --filter @chaos-party/apple-host build`") }
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
let rotation = (ctx.objectForKeyedSubscript("ChaosHostInternals").objectForKeyedSubscript("rotation").toArray() ?? [])
  .compactMap { $0 as? String }
if rotation.isEmpty { fail("ChaosHostInternals.rotation fehlt") }
out("Rotation: \(rotation.joined(separator: ", "))")

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
var frame = 0
var maxRound = 0
var plannedRounds = 0
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
  _ = callHost("tick", [now + 123_456_789])  // großer Startwert wie CACurrentMediaTime()*1000
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

  frame += 1
  if phase != lastPhase || stageName != lastStage || frame % 60 == 0 {
    do {
      let decoded = try RenderState.decode(stateText)
      if !RenderState.phases.contains(decoded.phase) { fail("renderState: Phase \(decoded.phase) unbekannt") }
      maxRound = max(maxRound, decoded.board?.round ?? 0)
      if let rounds = decoded.board?.rounds { plannedRounds = rounds }
    } catch {
      fail("renderState passt nicht zu RenderState.swift: \(error) – \(stateText.prefix(300))")
    }
  }
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

out("\nCPU-Zeit je Tick (macOS-JSC, faktisch ohne JIT; Apple TV langsamer):")
for key in tickStats.keys.sorted() {
  out("  \(key): tick \(tickStats[key]!.text); renderState \(renderStats[key]!.text)")
}
out("Virtuelle Spielzeit \(Int(now / 1000)) s, Server-Fehler an Controller: \(errorsFromServer), JS-Ausnahmen: \(jsErrors)")
// Fehler, die der Kern nur loggt (die Partie liefe trotzdem bis zum Ende weiter).
let problems = logLines.filter { line in
  ["Fehler", "ERROR", "fehlgeschlagen", "Laufzeit wertet", "nicht mehr gebraucht", "abgelehnt",
   "noch nicht geladen"].contains { line.contains($0) }
}
let builtIds = logLines.compactMap { line -> String? in
  guard line.hasPrefix("Minispiel "), line.contains("aufgebaut") else { return nil }
  return line.split(separator: " ").dropFirst().first.map(String.init)
}
let built = builtIds.count
let missing = rotation.filter { !builtIds.contains($0) }
let accepted = logLines.filter { $0.contains("angenommen") }.count
out("Runden: \(maxRound)/\(plannedRounds), Minispiele aufgebaut: \(built) (\(builtIds.joined(separator: ", "))), Ergebnisse angenommen: \(accepted), Problemzeilen: \(problems.count)")
if full && !missing.isEmpty { out("FEHLT aus der Rotation: \(missing.joined(separator: ", "))") }
for line in problems.prefix(10) { out("  PROBLEM \(line.prefix(200))") }
let fullOk = lastPhase == "final" && built == accepted && missing.isEmpty && plannedRounds > 0 && maxRound == plannedRounds
let ok = problems.isEmpty && accepted >= 1 && minigameAccepted && resultsSeenAfterAccept && jsErrors == 0
  && errorsFromServer == 0 && (!full || fullOk)
out(ok ? "ERGEBNIS: OK" : "ERGEBNIS: NICHT OK (Ergebnis angenommen: \(minigameAccepted), Ergebnisanzeige: \(resultsSeenAfterAccept))")
exit(ok ? 0 : 1)
