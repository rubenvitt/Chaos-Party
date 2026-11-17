import Foundation
let base = URL(fileURLWithPath: CommandLine.arguments[1])
let fm = FileManager.default
func files(_ dir: String) -> [URL] { (try! fm.contentsOfDirectory(at: base.appendingPathComponent(dir), includingPropertiesForKeys: nil)).sorted { $0.path < $1.path } }
func stripNulls(_ v: Any) -> Any {
  if let d = v as? [String: Any] { return d.filter { !($0.value is NSNull) }.mapValues(stripNulls) }
  if let a = v as? [Any] { return a.map(stripNulls) }
  return v
}
func same(_ a: Data, _ b: Data) -> Bool {
  let x = stripNulls(try! JSONSerialization.jsonObject(with: a)) as! NSDictionary
  let y = stripNulls(try! JSONSerialization.jsonObject(with: b)) as! NSDictionary
  return x.isEqual(y)
}
var failures = 0
for f in files("server-to-controller") {
  let text = try! String(contentsOf: f, encoding: .utf8)
  do {
    let m = try ServerMessage.decode(text)
    if case .unknown = m { print("FAIL unknown", f.lastPathComponent); failures += 1; continue }
    let back = try JSONEncoder().encode(m)
    if !same(back, Data(text.utf8)) { print("FAIL roundtrip", f.lastPathComponent, String(decoding: back, as: UTF8.self)); failures += 1 }
  } catch { print("FAIL decode", f.lastPathComponent, error); failures += 1 }
}
for f in files("controller-to-server") {
  let data = try! Data(contentsOf: f)
  do {
    let m = try JSONDecoder().decode(ControllerMessage.self, from: data)
    let back = Data(try m.encoded().utf8)
    if !same(back, data) { print("FAIL roundtrip", f.lastPathComponent, String(decoding: back, as: UTF8.self)); failures += 1 }
  } catch { print("FAIL decode", f.lastPathComponent, error); failures += 1 }
}
for f in files("unknown-type") {
  let m = try! ServerMessage.decode(String(contentsOf: f, encoding: .utf8))
  guard case .unknown(let t) = m, t == "lobby" else { print("FAIL unknown", f.lastPathComponent); failures += 1; continue }
}
for f in files("invalid") {
  let name = f.deletingPathExtension().lastPathComponent
  do { _ = try ServerMessage.decode(String(contentsOf: f, encoding: .utf8)); print("FAIL accepted", name); failures += 1 }
  catch let e as ProtocolDecodingError {
    let ok: Bool
    switch e { case .tooLarge: ok = name == "too-large"; case .badMessage: ok = name.hasPrefix("bad-message"); case .versionMismatch: ok = name.hasPrefix("version-mismatch") }
    if !ok { print("FAIL wrong error", name, e); failures += 1 }
  } catch { print("FAIL other", name, error); failures += 1 }
}
let c = try! JSONSerialization.jsonObject(with: Data(contentsOf: base.appendingPathComponent("protocol-constants.json"))) as! [String: Any]
let e = c["enums"] as! [String: [String]]
func check(_ k: String, _ v: [String]) { if e[k]! != v { print("FAIL enum", k, e[k]!, v); failures += 1 } }
check("phases", Phase.known.map(\.rawValue)); check("layouts", Layout.known.map(\.rawValue)); check("actions", Action.known.map(\.rawValue))
check("feedbackKinds", FeedbackKind.known.map(\.rawValue)); check("errorCodes", ErrorCode.known.map(\.rawValue)); check("gamePhases", GamePhase.known.map(\.rawValue))
check("itemKinds", ItemKind.known.map(\.rawValue)); check("promptKinds", PromptKind.known.map(\.rawValue)); check("characterIds", CharacterId.known.map(\.rawValue))
check("minigameStages", MinigameStage.known.map(\.rawValue)); check("buttons", Button.allCases.map(\.rawValue)); check("gestureKinds", GestureKind.allCases.map(\.rawValue))
if (c["version"] as! Int) != ProtocolConstants.version { print("FAIL version"); failures += 1 }
// JoinTarget
let t1 = JoinTarget.fromScannedURL("http://192.168.1.20:8787/?code=ab12")
let t2 = JoinTarget.fromScannedURL("http://[fe80::1]:8787/?code=AB12")
let t3 = JoinTarget.manual(address: "192.168.1.20", code: " ab-12 ")
let t4 = JoinTarget.fromScannedURL("http://192.168.1.20:8787/?code=A")
print(t1?.socketURL.absoluteString ?? "nil", t1?.joinCode ?? "", t2?.socketURL.absoluteString ?? "nil", t3?.socketURL.absoluteString ?? "nil", t3?.joinCode ?? "", t4 == nil)
print(PlayerName.isValid("Jörg"), PlayerName.isValid(" x"), PlayerName.isValid(String(repeating: "😀", count: 9)), PlayerName.isValid("a\u{202E}b"))
print(failures == 0 ? "ALL OK" : "FAILURES \(failures)")
exit(failures == 0 ? 0 : 1)
