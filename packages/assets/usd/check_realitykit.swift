// CHAOS-78, CHAOS-140: Prüft die erzeugten USDZ mit RealityKit (nur macOS).
// Aufruf: swift packages/assets/usd/check_realitykit.swift build/apple-assets
// (`node scripts/build-apple-assets.mjs` ruft das auf einem Mac selbst auf.)
// Bricht mit Exit-Code 1 ab, wenn ein Grundmesh oder Feld-Anker fehlt, eine Figur keine
// Animation hat, die Zeitleiste nicht zur Clip-Tabelle passt oder die Achsen nicht stimmen.
// Ohne Mac prüft `packages/assets/usd/check_usdz.py` dasselbe mit usd-core, aber nicht RealityKit.
import Foundation
import RealityKit
import simd

let dir = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "build/apple-assets")
var failures = 0
func fail(_ msg: String) { print("FEHLER: \(msg)"); failures += 1 }

func count(_ e: Entity) -> Int { 1 + e.children.reduce(0) { $0 + count($1) } }
func firstModel(_ e: Entity) -> Entity? {
    e.components.has(ModelComponent.self) ? e : e.children.lazy.compactMap(firstModel).first
}
func fmt(_ v: SIMD3<Float>) -> String { String(format: "(%.2f, %.2f, %.2f)", v.x, v.y, v.z) }

// Kulisse
let brett = try await Entity(contentsOf: dir.appendingPathComponent("brett.usdz"))
let b = brett.visualBounds(relativeTo: nil)
print("brett.usdz: \(count(brett)) Entitäten, Bounds min \(fmt(b.min)) max \(fmt(b.max))")
// Die Wiese liegt flach (Y-up wie glTF/RealityKit); Himmelskuppeln machen die Gesamt-Bounds ±250.
if let wiese = brett.findEntity(named: "wiese") {
    let wb = wiese.visualBounds(relativeTo: nil)
    print("  wiese: Bounds min \(fmt(wb.min)) max \(fmt(wb.max)) (glTF: x -20,8…19,6, y -0,6…0,3, z -13,1…12,9)")
    if wb.extents.y > 2 || wb.extents.x < 30 || wb.min.z > -12 { fail("Wiese liegt nicht wie im glTF – Achsen falsch") }
} else { fail("wiese fehlt") }

struct Szene: Decodable {
    struct Inst: Decodable { let mesh: String }
    struct Feld: Decodable { let id: String; let anchor: String; let position: [Float] }
    let instanced: [Inst]
    let fields: [Feld]?
}
let szene = try JSONDecoder().decode(Szene.self, from: Data(contentsOf: dir.appendingPathComponent("brett.szene.json")))
// Feld-Anker (CHAOS-140): leere Knoten `feld_<id>` an der Feldoberfläche, Weltkoordinaten wie im JSON.
var anchorsOk = 0
for feld in szene.fields ?? [] {
    guard let node = brett.findEntity(named: feld.anchor) else { fail("Feld-Anker \(feld.anchor) fehlt"); continue }
    let at = node.position(relativeTo: nil)
    let want = SIMD3<Float>(feld.position[0], feld.position[1], feld.position[2])
    if simd_distance(at, want) > 0.01 { fail("Feld-Anker \(feld.anchor) bei \(fmt(at)), erwartet \(fmt(want))") } else { anchorsOk += 1 }
}
print("  Feld-Anker: \(anchorsOk) von \((szene.fields ?? []).count) am richtigen Ort")
if (szene.fields ?? []).isEmpty { fail("brett.szene.json ohne Felder") }
for inst in szene.instanced {
    let name = inst.mesh.replacingOccurrences(of: "-", with: "_")
    guard let node = brett.findEntity(named: name), let model = firstModel(node) else {
        fail("Grundmesh \(inst.mesh) (\(name)) fehlt"); continue
    }
    // Weltmatrix des Grundmeshes: das Instanz-Ergebnis ist M_json * w.
    let w = model.transformMatrix(relativeTo: nil)
    let mb = model.visualBounds(relativeTo: nil)
    // Grashalm: im glTF y 0…0,27, x ±0,02 – muss in RealityKit-Weltkoordinaten genauso stehen.
    if name.hasPrefix("gras"), mb.extents.y < 0.2 || mb.min.y < -0.01 { fail("\(name) steht nicht entlang +Y") }
    print("  \(inst.mesh) → \(name)/\(model.name): Basis-Weltmatrix Spalten \(fmt(SIMD3(w.columns.0.x, w.columns.0.y, w.columns.0.z))) \(fmt(SIMD3(w.columns.1.x, w.columns.1.y, w.columns.1.z))) \(fmt(SIMD3(w.columns.2.x, w.columns.2.y, w.columns.2.z))), Bounds \(fmt(mb.min))–\(fmt(mb.max))")
}

// Figuren
struct Clips: Decodable { struct Clip: Decodable { let name: String; let start: Double; let end: Double }; let clips: [Clip] }
for c in ["robot", "cactus", "raccoon", "sock"] {
    let fig = try await Entity(contentsOf: dir.appendingPathComponent("figuren/\(c).usdz"))
    let fb = fig.visualBounds(relativeTo: nil)
    // Die Wurzel trägt die Gesamtanimation (Skelett + Xform-Zeitreihen); die App spielt die erste.
    let anims = fig.availableAnimations
    print("figuren/\(c).usdz: \(count(fig)) Entitäten, Höhe \(String(format: "%.2f", fb.extents.y)), Bounds min \(fmt(fb.min)) max \(fmt(fb.max)), Wurzel-Animationen: \(anims.map { "\($0.name ?? "?") \(String(format: "%.2f", $0.definition.duration)) s" })")
    if anims.isEmpty { fail("\(c): keine Animation an der Wurzel") }
    if fb.extents.y < max(fb.extents.x, fb.extents.z) * 0.5 { fail("\(c): liegt flach – Achsen falsch") }
    if fig.findEntity(named: "abzeichen") == nil { fail("\(c): Knoten abzeichen fehlt") }
    // Zeitleiste (CHAOS-140): Alle Clips liegen nacheinander auf einer Animation; die Dauer muss
    // zum Ende des letzten Clips passen, sonst stimmt der Nullpunkt für `trimmed(start:end:)` nicht.
    let table = try JSONDecoder().decode(Clips.self, from: Data(contentsOf: dir.appendingPathComponent("figuren/\(c).clips.json")))
    if let first = anims.first, let last = table.clips.last {
        let duration = first.definition.duration
        print("  \(c): Zeitleiste \(String(format: "%.2f", duration)) s, Tabelle bis \(String(format: "%.2f", last.end)) s")
        if abs(duration - last.end) > 0.05 { fail("\(c): Zeitleiste \(duration) s passt nicht zur Clip-Tabelle (\(last.end) s)") }
    }
}

print(failures == 0 ? "OK" : "\(failures) Fehler")
exit(failures == 0 ? 0 : 1)
