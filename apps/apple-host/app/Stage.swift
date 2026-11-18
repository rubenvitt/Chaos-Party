import QuartzCore
import RealityKit
#if os(macOS)
import AppKit
typealias PlatformColor = NSColor
#else
import UIKit
typealias PlatformColor = UIColor
#endif

/// Darstellung von `renderState` im `RealityRenderer` (CHAOS-142):
/// - Lobby und Brett mit echter Grafik (`BoardScene`), sobald die USDZ-Assets geladen sind;
/// - Minispiele und Brett ohne Assets als Grundkörper (`Primitives`); echte Minispiel-Grafik folgt mit CHAOS-144/149.
@MainActor
final class Stage {
    private let renderer: RealityRenderer
    private let primitives = Primitives()
    private var board: BoardScene?
    private(set) var phase = ""
    private var lastApply: CFTimeInterval = 0
    /// `true`, sobald das Brett geladen ist oder feststeht, dass es ohne Assets (Grundkörper) läuft.
    private(set) var loaded = false
    var onPhase: ((String) -> Void)?

    init(renderer: RealityRenderer) {
        self.renderer = renderer
        renderer.entities.append(primitives.root)
        renderer.activeCamera = primitives.camera
        renderer.cameraSettings.colorBackground = .color(CGColor(red: 0.08, green: 0.1, blue: 0.16, alpha: 1))
    }

    /// Lädt Kulisse und Figuren. Ohne Assets bleibt es bei Grundkörpern (Entwicklung, CI ohne `build:apple-assets`).
    func load(assets override: String?) async {
        defer { loaded = true }
        guard let folder = BoardScene.assetFolder(override: override) else {
            hostLog("FEHLER Brett-Assets fehlen (payload/szene) – Grundkörper statt echter Grafik")
            return
        }
        do {
            let scene = try await BoardScene.load(from: folder)
            board = scene
            renderer.entities.append(scene.root)
            primitives.boardEnabled = false
            show(board: true)
        } catch {
            hostLog("FEHLER Brett laden: \(error)")
        }
    }

    func apply(_ s: RenderState) {
        let now = CACurrentMediaTime()
        let dt = lastApply > 0 ? min(0.1, now - lastApply) : 0
        lastApply = now
        if s.phase != phase {
            phase = s.phase
            onPhase?(phase)
        }
        if s.phase == "minigame", s.minigame != nil {
            show(board: false)
            primitives.apply(s)
            return
        }
        if let board {
            show(board: true)
            primitives.apply(RenderState(phase: "lobby"))
            if s.phase != "lobby", let b = s.board {
                board.apply(b, players: s.lobby?.players ?? [], dt: dt)
            } else {
                board.showOverview(dt: dt)
            }
        } else {
            primitives.apply(s)
        }
    }

    private func show(board visible: Bool) {
        guard let board else { return }
        board.root.isEnabled = visible
        primitives.root.isEnabled = !visible
        renderer.activeCamera = visible ? board.camera : primitives.camera
        renderer.lighting.resource = visible ? board.sky : nil
        renderer.lighting.intensityExponent = visible ? board.skyExponent : 0
        renderer.cameraSettings.colorBackground = .color(visible ? board.clearColor
            : CGColor(red: 0.08, green: 0.1, blue: 0.16, alpha: 1))
    }
}

/// Generischer Renderer aus dem Spike: Brettfelder als Scheiben, Figuren als Kugeln, Minispiel-Körper nach Form.
/// Babylon ist linkshändig, RealityKit rechtshändig: z und die x/y-Anteile der Quaternion kippen.
@MainActor
final class Primitives {
    let root = Entity()
    let camera = PerspectiveCamera()
    /// Brett als Grundkörper; aus, sobald das echte Brett geladen ist.
    var boardEnabled = true
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

    init() {
        let light = DirectionalLight()
        light.light.intensity = 4000
        light.look(at: .zero, from: [4, 10, 6], relativeTo: nil)
        root.addChild(light)
        root.addChild(camera)
        camera.look(at: .zero, from: [0, 12, 12], relativeTo: nil)
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
        } else if boardEnabled, s.phase != "lobby", let b = s.board {
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
        let made = SimpleMaterial(color: platformColor(hex), roughness: 0.6, isMetallic: false)
        materials[hex] = made
        return made
    }
}
