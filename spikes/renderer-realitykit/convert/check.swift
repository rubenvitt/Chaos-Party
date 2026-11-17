// CHAOS-78: Prüft die erzeugten USDZ mit RealityKit (macOS).
// Aufruf: swift spikes/renderer-realitykit/convert/check.swift spikes/renderer-realitykit/assets/export
// Bricht mit Exit-Code 1 ab, wenn ein Grundmesh fehlt, eine Figur keine Animation hat
// oder die Achsen nicht stimmen.
import Foundation
import RealityKit
import simd

let dir = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "spikes/renderer-realitykit/assets/export")
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

struct Szene: Decodable { struct Inst: Decodable { let mesh: String }; let instanced: [Inst] }
let szene = try JSONDecoder().decode(Szene.self, from: Data(contentsOf: dir.appendingPathComponent("brett.szene.json")))
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
for c in ["robot", "cactus", "raccoon", "sock"] {
    let fig = try await Entity(contentsOf: dir.appendingPathComponent("figuren/\(c).usdz"))
    let fb = fig.visualBounds(relativeTo: nil)
    // Die Wurzel trägt die Gesamtanimation (Skelett + Xform-Zeitreihen); die App spielt die erste.
    let anims = fig.availableAnimations
    print("figuren/\(c).usdz: \(count(fig)) Entitäten, Höhe \(String(format: "%.2f", fb.extents.y)), Bounds min \(fmt(fb.min)) max \(fmt(fb.max)), Wurzel-Animationen: \(anims.map { "\($0.name ?? "?") \(String(format: "%.2f", $0.definition.duration)) s" })")
    if anims.isEmpty { fail("\(c): keine Animation an der Wurzel") }
    if fb.extents.y < max(fb.extents.x, fb.extents.z) * 0.5 { fail("\(c): liegt flach – Achsen falsch") }
}

print(failures == 0 ? "OK" : "\(failures) Fehler")
exit(failures == 0 ? 0 : 1)
