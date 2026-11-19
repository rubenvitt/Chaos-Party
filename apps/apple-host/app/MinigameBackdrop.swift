import CoreGraphics
import Foundation
import RealityKit

/// Grashalm des Bretts (`gras-*` aus `brett.instanzen.json`) als Vorlage für die Minispiel-Kulisse (CHAOS-193):
/// Modell (Material doppelseitig) und Lage des Grundmeshs im Export (Achsdrehung aus Blender).
struct GrassTemplate {
    let model: ModelComponent
    let local: simd_float4x4
}

/// Kulisse um die Spielfläche eines Minispiels (CHAOS-144, CHAOS-193), angelehnt an `createStageLook` im Browser-Host
/// (`apps/host/src/nature/stageLook.ts`): Wiese, auf Wunsch eine Picknickdecke mit Karomuster, Laub- und Nadelbäume
/// hinten und seitlich (Kameras blicken von −z in Babylon), Steine, Blumen, Grashalme (die Halme des Bretts als
/// Instanzen) und vier Laternen an den Ecken (nachts leuchtend, `LanternRig`).
///
/// Horizont (CHAOS-193): Babylon verdeckt das Ende der Wiese mit Nebel in Dunstfarbe und einer Dunst-Scheibe. Hier
/// geht die Wiese zum Rand hin in Dunst über (Farb- und Leucht-Textur wie EXP2-Nebel mit fester Dichte), dahinter
/// schließt eine Himmelskuppel mit Verlauf vom Dunst am Horizont nach oben ab. Im flachen Blick (Kuckucks-Klatsche)
/// bleibt so keine Kante zwischen Wiese und Hintergrund.
@MainActor
final class MinigameBackdrop {
    let root = Entity()
    private let ground: ModelEntity
    private let fog: ModelEntity
    private let dome: ModelEntity
    private let lanterns: LanternRig
    private var lookKey = ""
    private(set) var grassBlades = 0

    /// Halme der Kulisse. Babylon nimmt bei Stufe „hoch“ 30 000 (`STAGE_GRASS`); weniger hält die Bildrate auf tvOS.
    static let grassTarget = 12_000
    static let groundSize: Float = 900
    static let domeRadius: Float = 500
    /// Dunst wie Babylons EXP2-Nebel (`hazeDensity` bei ≈ 15 m Kameraabstand): bei 100 m halb, ab 250 m ganz Dunst.
    static let hazeDensity: Float = 0.008
    /// Dunkler als die alte Wiese (`#8aa55a`): Babylons Wiese ist eine dunkle Gras-Textur mit Relief.
    static let groundColor = "#5d7238"

    init(area: RenderState.Backdrop, grass: [GrassTemplate]) {
        root.name = "minispiel-kulisse"
        let groundY = area.groundY ?? 0
        var rnd = SeededRandom(seed: 7)

        ground = ModelEntity(mesh: .generatePlane(width: Self.groundSize, depth: Self.groundSize),
                             materials: [Self.plain(Self.groundColor, roughness: 0.95)])
        ground.name = "wiese"
        ground.position = [0, groundY - 0.02, 0]
        ground.components.set(DynamicLightShadowComponent(castsShadow: false))
        root.addChild(ground)

        fog = ModelEntity(mesh: .generatePlane(width: Self.groundSize, depth: Self.groundSize), materials: [])
        fog.name = "dunst"
        fog.position = [0, groundY, 0]
        fog.components.set(DynamicLightShadowComponent(castsShadow: false))
        root.addChild(fog)

        dome = ModelEntity(mesh: Self.domeMesh(radius: Self.domeRadius), materials: [UnlitMaterial(color: platformColor("#d4e6f4"))])
        dome.name = "himmel"
        dome.position = [0, groundY, 0]
        dome.components.set(DynamicLightShadowComponent(castsShadow: false))
        root.addChild(dome)

        if area.surface == "decke" {
            let half = max(area.halfX, area.halfZ) + 2
            let blanket = ModelEntity(mesh: .generatePlane(width: half * 2, depth: half * 2), materials: [Self.blanketMaterial()])
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
        func inIsland(_ x: Float, _ z: Float, _ margin: Float) -> Bool {
            let dz = z - island.centerZ
            let r = hypot(x, dz)
            return r < 1e-3 || r < rim(atan2(dz, x)) - margin
        }
        let blanketHalf = max(area.halfX, area.halfZ) + 2
        func inArea(_ x: Float, _ z: Float, _ margin: Float) -> Bool {
            if abs(x) < area.halfX + margin && abs(z) < area.halfZ + margin { return true }
            guard area.surface == "decke" else { return false }
            // Picknickdecke, um 0,3 rad gedreht (Babylon-Koordinaten wie `onBlanket`).
            let lx = x * cos(0.3) - z * sin(0.3), lz = x * sin(0.3) + z * cos(0.3)
            return abs(lx) < blanketHalf + margin && abs(lz) < blanketHalf + margin
        }
        let trunk = Self.plain("#7a5230", roughness: 0.9)
        let leaves = [Self.plain("#4f9a3c", roughness: 0.8), Self.plain("#5fae45", roughness: 0.8), Self.plain("#3f8a3a", roughness: 0.8)]
        let needles = Self.plain("#2f6f3e", roughness: 0.85)
        for i in 0..<16 {
            let a = Float(i) / 16 * 2 * .pi + rnd.next() * 0.2
            if sin(a) < -0.2 { continue }
            let r = rim(a) - 1.6 - rnd.next() * 1.4
            let x = cos(a) * r, z = island.centerZ + sin(a) * r
            if inArea(x, z, 2.5) { continue }
            let scale = 0.9 + rnd.next() * 0.3
            let tree = rnd.next() < 0.55
                ? Self.broadleaf(trunk: trunk, leaves: leaves[i % leaves.count], rnd: &rnd)
                : Self.pine(trunk: trunk, needles: needles)
            tree.scale = SIMD3(repeating: scale * 1.6)
            tree.position = [x, groundY - 0.05, -z]
            tree.orientation = simd_quatf(angle: rnd.next() * 2 * .pi, axis: [0, 1, 0])
            root.addChild(tree)
        }
        let stone = Self.plain("#9a9a92", roughness: 0.9)
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
        // Laternen an den Ecken der Spielfläche wie `createStageLook` (Arm zeigt zur Mitte).
        var glass: [Entity] = []
        for (sx, sz) in [(Float(-1), Float(1)), (1, 1), (-1, -0.4), (1, -0.4)] {
            let x = sx * (area.halfX + 1.6), z = sz * (area.halfZ + 1.2)
            let lantern = Self.lantern()
            lantern.position = [x, groundY - 0.03, -z]
            lantern.orientation = simd_quatf(angle: sx < 0 ? 0 : .pi, axis: [0, 1, 0])
            root.addChild(lantern)
            if let pane = lantern.findEntity(named: "laterne-glas") { glass.append(pane) }
        }
        lanterns = LanternRig(glass: glass, maxLights: 4)
        root.addChild(lanterns.root)

        let petals = ["#ffd23f", "#ff6f91", "#ffffff", "#9b8cff"].map { Self.plain($0, roughness: 0.7) }
        let blossom = MeshResource.generateSphere(radius: 0.09)
        for _ in 0..<90 {
            let x = (rnd.next() * 2 - 1) * island.halfX * 0.9
            let z = island.centerZ + (rnd.next() * 2 - 1) * island.halfZ * 0.9
            if inArea(x, z, 0.8) || hypot(x / island.halfX, (z - island.centerZ) / island.halfZ) > 0.95 { continue }
            let flower = ModelEntity(mesh: blossom, materials: [petals[Int(rnd.next() * 3.99)]])
            flower.position = [x, groundY + 0.08, -z]
            root.addChild(flower)
        }

        // Grashalme wie `scatterGrass`: Büschel nach Rauschen, drei Sorten in Flecken, nicht auf der Spielfläche.
        if !grass.isEmpty {
            var lists = Array(repeating: [simd_float4x4](), count: grass.count)
            var tries = 0
            while grassBlades < Self.grassTarget && tries < Self.grassTarget * 5 {
                tries += 1
                let x = (rnd.next() * 2 - 1) * island.halfX * 1.1
                let z = island.centerZ + (rnd.next() * 2 - 1) * island.halfZ * 1.1
                if !inIsland(x, z, 0.35) || inArea(x, z, 0.3) { continue }
                if Self.noise(x * 0.35, z * 0.35, seed: 7) < 0.33 && rnd.next() < 0.55 { continue }
                let s = 0.65 + rnd.next() * 0.75
                let rotation = simd_quatf(angle: rnd.next() * 2 * .pi, axis: [0, 1, 0])
                    * simd_quatf(angle: (rnd.next() - 0.5) * 0.35, axis: [1, 0, 0])
                    * simd_quatf(angle: (rnd.next() - 0.5) * 0.35, axis: [0, 0, 1])
                let transform = Transform(scale: [s, s * (0.8 + rnd.next() * 0.6), s], rotation: rotation,
                                          translation: [x, groundY - 0.02, -z])
                let patch = Self.noise(x * 0.22, z * 0.22, seed: 11) + (rnd.next() - 0.5) * 0.25
                let sort = min(grass.count - 1, patch < 0.42 ? 1 : patch > 0.58 ? 2 : 0)
                lists[sort].append(transform.matrix)
                grassBlades += 1
            }
            for (index, template) in grass.enumerated() where !lists[index].isEmpty {
                let list = lists[index]
                do {
                    let data = try LowLevelInstanceData(instanceCount: list.count)
                    data.withMutableTransforms { transforms in
                        for (i, m) in list.enumerated() { transforms[i] = m * template.local }
                    }
                    let blades = Entity()
                    blades.name = "gras-\(index)"
                    blades.components.set(template.model)
                    blades.components.set(DynamicLightShadowComponent(castsShadow: false))
                    blades.components.set(try MeshInstancesComponent(mesh: template.model.mesh, instances: data))
                    root.addChild(blades)
                } catch {
                    hostLog("FEHLER Grashalme der Kulisse: \(error)")
                }
            }
        }
    }

    /// Dunst, Himmel und Laternen der Stimmung (je Minispiel fest, nur bei Änderung).
    func apply(_ light: RenderState.Light?) {
        let haze = light?.haze ?? "#d4e6f4"
        let sky = light?.fillSky ?? haze
        let key = "\(haze)|\(sky)|\(light?.lampsOn ?? 0)|\(light?.lanternIntensity ?? 0)"
        guard key != lookKey else { return }
        lookKey = key
        lanterns.apply(light)
        if let material = Self.hazeVeil(haze: haze) { fog.model?.materials = [material] }
        if let material = Self.skyDome(haze: haze, sky: sky) { dome.model?.materials = [material] }
    }

    // MARK: Horizont

    /// Dunstschleier über der Wiese wie EXP2-Nebel: unbeleuchtet in Dunstfarbe, Deckkraft nach Abstand zur Mitte. Ohne
    /// Tonemapping wie Kuppel und Hintergrund, damit am Horizont keine Kante bleibt.
    private static func hazeVeil(haze: String) -> RealityKit.Material? {
        let size = 256
        var pixels = [UInt8](repeating: 255, count: size * size * 4)
        for j in 0..<size {
            for i in 0..<size {
                let x = (Float(i) + 0.5) / Float(size) - 0.5, z = (Float(j) + 0.5) / Float(size) - 0.5
                let d = hypot(x, z) * groundSize
                let w = UInt8(max(0, min(255, (1 - exp(-pow(d * hazeDensity, 2))) * 255)))
                let p = (j * size + i) * 4
                (pixels[p], pixels[p + 1], pixels[p + 2], pixels[p + 3]) = (w, w, w, 255)
            }
        }
        guard let mask = texture(pixels, width: size, height: size) else { return nil }
        var veil = UnlitMaterial(applyPostProcessToneMap: false)
        veil.color = .init(tint: platformColor(haze))
        veil.blending = .transparent(opacity: .init(scale: 1, texture: .init(mask)))
        return veil
    }

    /// Himmelskuppel: unten und am Horizont Dunst, nach oben zur Himmelsfarbe (leicht dunkler); ohne Tonemapping.
    private static func skyDome(haze: String, sky: String) -> RealityKit.Material? {
        let height = 128
        let h = rgb(haze), s = rgb(sky)
        let zenith = (0..<3).map { (h[$0] * 0.4 + s[$0] * 0.6) * 0.9 }
        var pixels = [UInt8](repeating: 255, count: 4 * height * 4)
        for j in 0..<height {
            // v = 0 oben (Zenit), 0,5 Horizont, 1 unten.
            let elevation = 1 - 2 * (Float(j) + 0.5) / Float(height)
            let k = elevation <= 0 ? 0 : min(1, pow(elevation / 0.45, 0.8))
            for i in 0..<4 {
                let p = (j * 4 + i) * 4
                for c in 0..<3 { pixels[p + c] = UInt8(max(0, min(255, (h[c] * (1 - k) + zenith[c] * k) * 255))) }
            }
        }
        guard let gradient = texture(pixels, width: 4, height: height) else { return nil }
        var dome = UnlitMaterial(applyPostProcessToneMap: false)
        dome.color = .init(tint: .white, texture: .init(gradient))
        dome.faceCulling = .none
        return dome
    }

    /// Textur ohne Mipmaps (glatte Verläufe; Mipmaps mischten im flachen Blick den ganzen Verlauf).
    private static func texture(_ pixels: [UInt8], width: Int, height: Int) -> TextureResource? {
        guard let provider = CGDataProvider(data: Data(pixels) as CFData),
              let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue), provider: provider,
                                  decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return nil }
        do {
            return try TextureResource(image: image, options: .init(semantic: .color, mipmapsMode: .none))
        } catch {
            hostLog("FEHLER Textur der Kulisse: \(error)")
            return nil
        }
    }

    /// Kugel mit Texturkoordinaten nach Höhe (v = 0 Zenit, 1 Nadir), Normalen nach innen.
    private static func domeMesh(radius: Float, rings: Int = 24, segments: Int = 32) -> MeshResource {
        var positions: [SIMD3<Float>] = [], normals: [SIMD3<Float>] = [], uvs: [SIMD2<Float>] = [], indices: [UInt32] = []
        for r in 0...rings {
            let v = Float(r) / Float(rings)
            let polar = v * .pi
            for s in 0...segments {
                let u = Float(s) / Float(segments)
                let a = u * 2 * .pi
                let dir = SIMD3<Float>(sin(polar) * cos(a), cos(polar), sin(polar) * sin(a))
                positions.append(dir * radius)
                normals.append(-dir)
                uvs.append([u, 1 - v])
            }
        }
        let row = UInt32(segments + 1)
        for r in 0..<UInt32(rings) {
            for s in 0..<UInt32(segments) {
                let a = r * row + s, b = (r + 1) * row + s
                indices += [a, b, a + 1, a + 1, b, b + 1]
            }
        }
        var descriptor = MeshDescriptor(name: "himmel")
        descriptor.positions = MeshBuffers.Positions(positions)
        descriptor.normals = MeshBuffers.Normals(normals)
        descriptor.textureCoordinates = MeshBuffers.TextureCoordinates(uvs)
        descriptor.primitives = .triangles(indices)
        return (try? MeshResource.generate(from: [descriptor])) ?? .generateSphere(radius: radius)
    }

    // MARK: Requisiten

    /// Laterne aus Pfosten, Arm, Dach und Glas wie `lantern` in `apps/host/src/nature/geometry.ts`; Arm nach +x.
    private static func lantern() -> Entity {
        let root = Entity()
        root.name = "laterne"
        let wood = plain("#9c8572", roughness: 0.85)
        var iron = PhysicallyBasedMaterial()
        iron.baseColor = .init(tint: platformColor("#2b2a28"))
        iron.metallic = 0.8
        iron.roughness = 0.45
        let post = ModelEntity(mesh: .generateCylinder(height: 1.5, radius: 0.05), materials: [wood])
        post.position = [0, 0.75, 0]
        let arm = ModelEntity(mesh: .generateBox(width: 0.42, height: 0.05, depth: 0.05), materials: [iron])
        arm.position = [0.18, 1.45, 0]
        let roof = ModelEntity(mesh: .generateCone(height: 0.12, radius: 0.13), materials: [iron])
        roof.position = [0.36, 1.36, 0]
        var pane = PhysicallyBasedMaterial()
        pane.baseColor = .init(tint: platformColor("#fff1d6"))
        pane.roughness = 0.2
        pane.blending = .transparent(opacity: 0.9)
        let glass = ModelEntity(mesh: .generateCylinder(height: 0.24, radius: 0.088), materials: [pane])
        glass.name = "laterne-glas"
        glass.position = [0.36, 1.18, 0]
        for part in [post, arm, roof, glass] { root.addChild(part) }
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


    /// Glattes Rauschen 0…1 (Ersatz für `fbm`): Büschel und Flecken statt Salz und Pfeffer.
    static func noise(_ x: Float, _ z: Float, seed: Float) -> Float {
        let a = sin(x * 1.3 + seed) * cos(z * 1.1 - seed * 0.7)
        let b = sin((x + z) * 0.53 + seed * 1.9) * cos((x - z) * 0.71 + seed)
        return 0.5 + 0.3 * a + 0.2 * b
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
