import RealityKit
#if os(macOS)
import AppKit
typealias PlatformColor = NSColor
#else
import UIKit
typealias PlatformColor = UIColor
#endif

/// Generic renderer for `renderState`: board spaces as discs, pawns as spheres, minigame bodies by shape.
/// Babylon is left-handed, RealityKit right-handed: z and the quaternion's x/y flip.
@MainActor
final class Stage {
    private let root = AnchorEntity(world: .zero)
    private let camera = PerspectiveCamera()
    private var entities: [String: ModelEntity] = [:]
    private var targets: [String: SIMD3<Float>] = [:]
    private var materials: [String: SimpleMaterial] = [:]
    private var cameraKey = ""
    private let meshes: [String: MeshResource] = [
        "sphere": .generateSphere(radius: 0.5), "box": .generateBox(size: 1), "cylinder": .generateCylinder(height: 1, radius: 0.5),
    ]
    private static let slotColors = ["#3b82f6", "#ef4444", "#22c55e", "#eab308"]
    private static let kindColors = [
        "start": "#e2e8f0", "coins-plus": "#4ade80", "coins-minus": "#f87171", "event": "#a78bfa", "item": "#fbbf24", "trophy": "#f59e0b",
    ]

    init(view: ARView) {
        view.environment.background = .color(PlatformColor(red: 0.08, green: 0.1, blue: 0.16, alpha: 1))
        let light = DirectionalLight()
        light.light.intensity = 4000
        light.look(at: .zero, from: [4, 10, 6], relativeTo: nil)
        root.addChild(light)
        root.addChild(camera)
        view.scene.addAnchor(root)
    }

    func apply(_ s: RenderState) {
        var seen = Set<String>()
        func put(_ key: String, _ shape: String, _ color: String, _ pos: SIMD3<Float>, _ size: SIMD3<Float>,
                 _ rot: simd_quatf = simd_quatf(ix: 0, iy: 0, iz: 0, r: 1), animate: Bool = false) {
            seen.insert(key)
            guard let entity = entities[key] else {
                let entity = ModelEntity(mesh: meshes[shape] ?? meshes["box"]!, materials: [material(color)])
                entity.transform = Transform(scale: size, rotation: rot, translation: pos)
                root.addChild(entity)
                entities[key] = entity
                targets[key] = pos
                return
            }
            if !animate {
                entity.transform = Transform(scale: size, rotation: rot, translation: pos)
            } else if targets[key] != pos {
                targets[key] = pos
                var t = entity.transform
                t.translation = pos
                entity.move(to: t, relativeTo: root, duration: 0.35)
            }
        }

        if s.phase == "minigame", let m = s.minigame {
            for b in m.bodies ?? [] where b.pos.count == 3 {
                let r = b.rot ?? [0, 0, 0, 1], size = b.size ?? [1, 1, 1]
                put("body:\(b.id)", b.shape, b.color ?? "#cccccc", [b.pos[0], b.pos[1], -b.pos[2]],
                    size.count == 3 ? [size[0], size[1], size[2]] : [1, 1, 1],
                    r.count == 4 ? simd_quatf(ix: -r[0], iy: -r[1], iz: r[2], r: r[3]) : simd_quatf(ix: 0, iy: 0, iz: 0, r: 1))
            }
            aim("mg:\(m.id)", target: [0, 0, 0.6], from: [0, 13.5, 13.5], fov: 44.7)
        } else if s.phase != "lobby", let b = s.board {
            let spaces = b.spaces ?? []
            for space in spaces {
                put("space:\(space.id)", "cylinder", Self.kindColors[space.kind ?? ""] ?? "#94a3b8", [space.x, 0, -space.z], [1.6, 0.15, 1.6])
            }
            let colors = Dictionary((s.lobby?.players ?? []).map { ($0.slot, $0.color ?? "") }, uniquingKeysWith: { a, _ in a })
            for pawn in b.pawns ?? [] {
                let color = colors[pawn.slot].flatMap { $0.isEmpty ? nil : $0 } ?? Self.slotColors[(pawn.slot - 1) & 3]
                put("pawn:\(pawn.slot)", "sphere", color, [pawn.x, 0.6, -pawn.z], [0.8, 0.8, 0.8], animate: true)
            }
            if !spaces.isEmpty {
                let xs = spaces.map(\.x), zs = spaces.map { -$0.z }
                let center: SIMD3<Float> = [(xs.min()! + xs.max()!) / 2, 0, (zs.min()! + zs.max()!) / 2]
                let extent = max(xs.max()! - xs.min()!, (zs.max()! - zs.min()!) * 1.6, 6)
                aim("board:\(spaces.count)", target: center, from: center + [0, extent * 0.85, extent * 0.55], fov: 41)
            }
        }
        for (key, entity) in entities where !seen.contains(key) {
            entity.removeFromParent()
            entities[key] = nil
            targets[key] = nil
        }
    }

    private func aim(_ key: String, target: SIMD3<Float>, from: SIMD3<Float>, fov: Float) {
        guard key != cameraKey else { return }
        cameraKey = key
        camera.camera.fieldOfViewInDegrees = fov
        camera.look(at: target, from: from, relativeTo: nil)
    }

    private func material(_ hex: String) -> SimpleMaterial {
        if let cached = materials[hex] { return cached }
        let v = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0xcccccc
        let color = PlatformColor(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255,
                                  blue: CGFloat(v & 0xff) / 255, alpha: 1)
        let made = SimpleMaterial(color: color, roughness: 0.6, isMetallic: false)
        materials[hex] = made
        return made
    }
}
