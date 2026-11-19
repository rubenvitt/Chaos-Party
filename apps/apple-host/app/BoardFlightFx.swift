import Foundation
import RealityKit

/// Flug-Effekte am Brett (CHAOS-193), nachgebaut aus `syncFlightFx` in `apps/host/src/board/createBoardScene.ts`
/// (CHAOS-52): Beim Windstoß drehen sich zwei weiße Windringe um die Figur, beim Platztausch geht am Abflug- und am
/// Zielfeld ein Ring in Slot-Farbe auf. Alles kommt aus `board.pawns[].hop` (Stil, Fortschritt, Felder), kein
/// eigener Vertrag. Leuchtend und halbtransparent: `UnlitMaterial` mit `OpacityComponent`, ohne Schatten.
@MainActor
final class BoardFlightFx {
    /// Tausch-Ringe hängen hier (Brett-Koordinaten); Windringe hängen an der Figur.
    let root = Entity()

    private struct Slot {
        let swirl: [ModelEntity]
        let swap: ModelEntity
        weak var parent: Entity?
    }

    /// Windringe wie `swirl`: Durchmesser, Höhe über dem Figurenfuß, Neigung (Babylon `rotation.x`).
    private static let swirlSpecs: [(diameter: Float, y: Float, tilt: Float)] = [(1.7, 0.9, 0.35), (2.2, 1.6, -0.3)]
    /// Höhe des Tausch-Rings über der Feldoberfläche (`SPACE_TOP + 0.06`).
    private static let swapLift: Float = 0.06

    private var slots: [Int: Slot] = [:]
    private lazy var swirlMeshes = Self.swirlSpecs.map { Self.torus(radius: $0.diameter / 2, tube: 0.03) }
    private lazy var swapMesh = Self.torus(radius: 0.75, tube: 0.08)

    /// Ein Bild: `pawnRoot` liefert den Wurzelknoten der Figur (Lage samt Flugbahn).
    func update(_ pawns: [RenderState.Pawn], colors: [Int: String], anchors: [String: SIMD3<Float>], surfaceY: Float,
                pawnRoot: (Int) -> Entity?) {
        var seen = Set<Int>()
        for p in pawns {
            let style = p.hop?.style ?? "walk"
            // Erst beim ersten Flug bauen.
            guard style != "walk" || slots[p.slot] != nil else { continue }
            seen.insert(p.slot)
            var slot = slots[p.slot] ?? make(color: colors[p.slot].flatMap { $0.isEmpty ? nil : $0 } ?? "#ffffff")
            let t = Float(p.hop?.t ?? 0)
            let gust = style == "gust"
            if let parent = pawnRoot(p.slot), slot.parent !== parent {
                for ring in slot.swirl { parent.addChild(ring) }
                slot.parent = parent
            }
            for (index, ring) in slot.swirl.enumerated() {
                if ring.isEnabled != gust { ring.isEnabled = gust }
                guard gust else { continue }
                let spec = Self.swirlSpecs[index]
                let spin = (index == 0 ? 1 : -1) * t * .pi * 6
                ring.orientation = simd_quatf(angle: spin, axis: [0, 1, 0]) * simd_quatf(angle: spec.tilt, axis: [1, 0, 0])
                ring.scale = SIMD3(repeating: 0.8 + 0.5 * t)
                ring.components.set(OpacityComponent(opacity: 0.75 * sin(.pi * t)))
            }
            // Tausch: Ring am Abflugfeld (erste 40 %), dann am Zielfeld (letzte 40 %), je aufgehend.
            var phase: (space: String, progress: Float)?
            if style == "swap", let hop = p.hop {
                if t < 0.4 { phase = (hop.from, t / 0.4) } else if t >= 0.6 { phase = (hop.to, (t - 0.6) / 0.4) }
            }
            let at = phase.flatMap { anchors[$0.space] }
            slot.swap.isEnabled = at != nil
            if let at, let phase {
                slot.swap.position = at + [0, Self.swapLift, 0]
                slot.swap.scale = SIMD3(repeating: 0.7 + 1.6 * phase.progress)
                slot.swap.components.set(OpacityComponent(opacity: 0.9 * (1 - phase.progress)))
            }
            slots[p.slot] = slot
        }
        for (key, slot) in slots where !seen.contains(key) {
            for ring in slot.swirl { ring.isEnabled = false }
            slot.swap.isEnabled = false
        }
    }

    /// Lobby: alles aus.
    func clear() {
        for slot in slots.values {
            for ring in slot.swirl { ring.isEnabled = false }
            slot.swap.isEnabled = false
        }
    }

    private func make(color: String) -> Slot {
        var white = UnlitMaterial(color: .white)
        white.faceCulling = .none
        let swirl = Self.swirlSpecs.enumerated().map { index, spec in
            let ring = ModelEntity(mesh: swirlMeshes[index], materials: [white])
            ring.name = "windring"
            ring.position.y = spec.y
            ring.isEnabled = false
            ring.components.set(DynamicLightShadowComponent(castsShadow: false))
            return ring
        }
        var tint = UnlitMaterial(color: platformColor(color))
        tint.faceCulling = .none
        let swap = ModelEntity(mesh: swapMesh, materials: [tint])
        swap.name = "tausch-ring"
        swap.isEnabled = false
        swap.components.set(DynamicLightShadowComponent(castsShadow: false))
        root.addChild(swap)
        return Slot(swirl: swirl, swap: swap, parent: nil)
    }

    /// Torus in der xz-Ebene (wie Babylons `CreateTorus`): Mittelkreis `radius`, Röhre `tube`.
    static func torus(radius: Float, tube: Float, segments: Int = 32, sides: Int = 8) -> MeshResource {
        var positions: [SIMD3<Float>] = []
        var normals: [SIMD3<Float>] = []
        var indices: [UInt32] = []
        for i in 0...segments {
            let a = Float(i) / Float(segments) * 2 * .pi
            let center = SIMD3<Float>(cos(a) * radius, 0, sin(a) * radius)
            let outward = SIMD3<Float>(cos(a), 0, sin(a))
            for j in 0...sides {
                let b = Float(j) / Float(sides) * 2 * .pi
                let normal = outward * cos(b) + SIMD3<Float>(0, sin(b), 0)
                positions.append(center + normal * tube)
                normals.append(normal)
            }
        }
        let row = UInt32(sides + 1)
        for i in 0..<UInt32(segments) {
            for j in 0..<UInt32(sides) {
                let a = i * row + j, b = (i + 1) * row + j
                indices += [a, a + 1, b, b, a + 1, b + 1]
            }
        }
        var descriptor = MeshDescriptor(name: "torus")
        descriptor.positions = MeshBuffers.Positions(positions)
        descriptor.normals = MeshBuffers.Normals(normals)
        descriptor.primitives = .triangles(indices)
        return (try? MeshResource.generate(from: [descriptor])) ?? .generateSphere(radius: radius)
    }
}
