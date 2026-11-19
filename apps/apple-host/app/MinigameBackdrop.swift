import CoreGraphics
import Foundation
import RealityKit

/// Kulisse um die Spielfläche eines Minispiels (CHAOS-144), angelehnt an `createStageLook` im Browser-Host
/// (`apps/host/src/nature/stageLook.ts`): Wiese bis zum Horizont, auf Wunsch eine Picknickdecke mit Karomuster,
/// Laub- und Nadelbäume hinten und seitlich (Kameras blicken von −z in Babylon), Steine und Blumen. Gras-Halme und
/// Laternen fehlen noch (Folgeaufgabe Effekt-Feinschliff).
@MainActor
enum MinigameBackdrop {
    static func make(_ area: RenderState.Backdrop) -> Entity {
        let root = Entity()
        root.name = "minispiel-kulisse"
        let groundY = area.groundY ?? 0
        var rnd = SeededRandom(seed: 7)

        let ground = ModelEntity(mesh: .generatePlane(width: 900, depth: 900),
                                 materials: [plain("#8aa55a", roughness: 0.95)])
        ground.position = [0, groundY - 0.02, 0]
        root.addChild(ground)

        if area.surface == "decke" {
            let half = max(area.halfX, area.halfZ) + 2
            let blanket = ModelEntity(mesh: .generatePlane(width: half * 2, depth: half * 2), materials: [blanketMaterial()])
            blanket.position = [0, groundY + 0.03, 0]
            // Babylon dreht die Decke um +0,3 rad (linkshändig) = −0,3 rad in RealityKit.
            blanket.orientation = simd_quatf(angle: -0.3, axis: [0, 1, 0])
            root.addChild(blanket)
        }

        let island = (centerZ: Float(2), halfX: area.halfX + 10, halfZ: area.halfZ + 9)
        func rim(_ a: Float) -> Float {
            // Superellipse wie `terrain.rim` (Eckigkeit 3).
            let c = pow(abs(cos(a)) / island.halfX, 3), s = pow(abs(sin(a)) / island.halfZ, 3)
            return pow(c + s, -1.0 / 3)
        }
        func inArea(_ x: Float, _ z: Float, _ margin: Float) -> Bool {
            abs(x) < area.halfX + margin && abs(z) < area.halfZ + margin
        }
        let trunk = plain("#7a5230", roughness: 0.9)
        let leaves = [plain("#4f9a3c", roughness: 0.8), plain("#5fae45", roughness: 0.8), plain("#3f8a3a", roughness: 0.8)]
        let needles = plain("#2f6f3e", roughness: 0.85)
        for i in 0..<16 {
            let a = Float(i) / 16 * 2 * .pi + rnd.next() * 0.2
            if sin(a) < -0.2 { continue }
            let r = rim(a) - 1.6 - rnd.next() * 1.4
            let x = cos(a) * r, z = island.centerZ + sin(a) * r
            if inArea(x, z, 2.5) { continue }
            let scale = 0.9 + rnd.next() * 0.3
            let tree = rnd.next() < 0.55
                ? broadleaf(trunk: trunk, leaves: leaves[i % leaves.count], rnd: &rnd)
                : pine(trunk: trunk, needles: needles)
            tree.scale = SIMD3(repeating: scale * 1.6)
            tree.position = [x, groundY - 0.05, -z]
            tree.orientation = simd_quatf(angle: rnd.next() * 2 * .pi, axis: [0, 1, 0])
            root.addChild(tree)
        }
        let stone = plain("#9a9a92", roughness: 0.9)
        for _ in 0..<8 {
            let a = rnd.next() * 2 * .pi
            let r = rim(a) - 1 - rnd.next() * 2
            let x = cos(a) * r, z = island.centerZ + sin(a) * r
            if inArea(x, z, 1.5) { continue }
            let size = 0.3 + rnd.next() * 0.35
            let rock = ModelEntity(mesh: .generateSphere(radius: size), materials: [stone])
            rock.scale = [1.3, 0.6, 1]
            rock.position = [x, groundY, -z]
            root.addChild(rock)
        }
        let petals = ["#ffd23f", "#ff6f91", "#ffffff", "#9b8cff"].map { plain($0, roughness: 0.7) }
        let blossom = MeshResource.generateSphere(radius: 0.09)
        for _ in 0..<90 {
            let x = (rnd.next() * 2 - 1) * island.halfX * 0.9
            let z = island.centerZ + (rnd.next() * 2 - 1) * island.halfZ * 0.9
            if inArea(x, z, 0.8) || hypot(x / island.halfX, (z - island.centerZ) / island.halfZ) > 0.95 { continue }
            let flower = ModelEntity(mesh: blossom, materials: [petals[Int(rnd.next() * 3.99)]])
            flower.position = [x, groundY + 0.08, -z]
            root.addChild(flower)
        }
        return root
    }

    private static func broadleaf(trunk: RealityKit.Material, leaves: RealityKit.Material, rnd: inout SeededRandom) -> Entity {
        let tree = Entity()
        let stem = ModelEntity(mesh: .generateCylinder(height: 1.4, radius: 0.13), materials: [trunk])
        stem.position.y = 0.7
        tree.addChild(stem)
        for (dx, dy, dz, radius) in [(Float(0), Float(1.75), Float(0), Float(0.75)), (0.42, 1.5, 0.15, 0.5), (-0.38, 1.55, -0.2, 0.52),
                                     (0.05, 2.2, 0.05, 0.5)] {
            let crown = ModelEntity(mesh: .generateSphere(radius: radius * (0.9 + rnd.next() * 0.2)), materials: [leaves])
            crown.position = [dx, dy, dz]
            tree.addChild(crown)
        }
        return tree
    }

    private static func pine(trunk: RealityKit.Material, needles: RealityKit.Material) -> Entity {
        let tree = Entity()
        let stem = ModelEntity(mesh: .generateCylinder(height: 0.8, radius: 0.1), materials: [trunk])
        stem.position.y = 0.4
        tree.addChild(stem)
        for (y, radius, height) in [(Float(1.0), Float(0.75), Float(1.1)), (1.55, 0.58, 0.95), (2.05, 0.4, 0.8)] {
            let cone = ModelEntity(mesh: .generateCone(height: height, radius: radius), materials: [needles])
            cone.position.y = y
            tree.addChild(cone)
        }
        return tree
    }

    static func plain(_ hex: String, roughness: Float) -> RealityKit.Material {
        var pbr = PhysicallyBasedMaterial()
        pbr.baseColor = .init(tint: platformColor(hex))
        pbr.roughness = .init(floatLiteral: roughness)
        return pbr
    }

    /// Karomuster wie `blanketTexture` im Browser-Host, dreimal wiederholt.
    private static func blanketMaterial() -> RealityKit.Material {
        var pbr = PhysicallyBasedMaterial()
        pbr.roughness = 0.9
        let size = 512, stripe = 64
        let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        if let ctx {
            ctx.setFillColor(CGColor(red: 0xf3 / 255, green: 0xec / 255, blue: 0xe0 / 255, alpha: 1))
            ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
            ctx.setFillColor(CGColor(red: 176 / 255, green: 72 / 255, blue: 62 / 255, alpha: 0.55))
            for i in stride(from: 0, to: size, by: stripe * 2) {
                ctx.fill(CGRect(x: i, y: 0, width: stripe, height: size))
                ctx.fill(CGRect(x: 0, y: i, width: size, height: stripe))
            }
            ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.18))
            for i in stride(from: 0, to: size, by: 8) {
                ctx.fill(CGRect(x: i, y: 0, width: 2, height: size))
                ctx.fill(CGRect(x: 0, y: i, width: size, height: 2))
            }
            if let image = ctx.makeImage(), let texture = try? TextureResource(image: image, options: .init(semantic: .color)) {
                pbr.baseColor = .init(texture: .init(texture))
                pbr.textureCoordinateTransform = .init(scale: [3, 3])
                return pbr
            }
        }
        pbr.baseColor = .init(tint: platformColor("#e8d9c4"))
        return pbr
    }
}

/// Partikel für `ctx.fx.burst` (`VFX_IDS` im minigame-sdk), angelehnt an `apps/host/src/fx/particles.ts`. Bewusst kleine
/// Kugeln, die Swift selbst bewegt, statt `ParticleEmitterComponent`: Emitter, die nach dem Ausbruch entfernt wurden,
/// brachten RealityKit im tvOS-Simulator zum Absturz (`re::bucketVFXMeshPart`, EXC_BAD_ACCESS).
enum MinigameEffects {
    struct Preset {
        let count: Int
        let speed: Float
        let gravity: Float
        let life: Float
        let size: Float
        let colors: [String]
    }

    static func preset(kind: String, color: String?) -> Preset {
        let tint = color.map { [$0] }
        switch kind {
        case "confetti":
            return Preset(count: 36, speed: 4.5, gravity: 5, life: 1.6, size: 0.07,
                          colors: ["#ff5d73", "#4cc9f0", "#ffd23f", "#8ac926", "#c77dff"])
        case "sparkle", "stars":
            return Preset(count: 16, speed: 2.2, gravity: 0.5, life: 0.7, size: 0.05, colors: tint ?? [kind == "stars" ? "#ffe066" : "#fff7c2"])
        case "splash":
            return Preset(count: 18, speed: 3.2, gravity: 9, life: 0.8, size: 0.06, colors: tint ?? ["#bfe6ff"])
        case "dust", "smoke":
            return Preset(count: 10, speed: 0.9, gravity: -0.6, life: 0.9, size: 0.14, colors: tint ?? ["#d9cbb3"])
        default: // impact
            return Preset(count: 14, speed: 3, gravity: 4, life: 0.5, size: 0.05, colors: tint ?? ["#fff3d6"])
        }
    }
}

/// Fester Zufall für die Kulisse (gleiche Kulisse bei jedem Start).
struct SeededRandom {
    private var state: UInt64
    init(seed: UInt64) { state = seed &* 6364136223846793005 &+ 1442695040888963407 }
    mutating func next() -> Float {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return Float(state >> 40) / Float(1 << 24)
    }
}
