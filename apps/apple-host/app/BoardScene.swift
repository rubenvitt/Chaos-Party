import CoreGraphics
import QuartzCore
import Foundation
import RealityKit

/// Brett mit echter Grafik (CHAOS-142): Kulisse `brett.usdz`, Gras- und Blumen-Instanzen, Figuren als USDZ,
/// Sonne und Himmelslicht wie im Babylon-Host, Kamera mit Übersicht und Fokus auf den aktiven Spieler.
/// Assets aus `pnpm build:apple-assets` (CHAOS-140, `docs/apple-assets.md`), von `prepare.sh` nach `payload/szene/`.
///
/// Koordinaten: `brett.usdz` ist rechtshändig wie RealityKit und entsteht aus Babylon mit `(x, y, z) → (-x, y, z)`
/// (`apps/host/src/export/boardExport.ts`). Die Figuren stehen darum auf den Feld-Ankern `feld_<id>` des Bretts;
/// nur der Versatz mehrerer Figuren auf einem Feld (Babylon-Koordinaten aus `renderState`) wird gespiegelt.
@MainActor
final class BoardScene {
    let root = Entity()
    let camera = PerspectiveCamera()
    let sky: EnvironmentResource?
    let skyExponent: Float
    let clearColor: CGColor
    let instances: Int

    private let anchors: [String: SIMD3<Float>]
    private let figures: [String: FigureTemplate]
    /// Brettmitte in Babylon-Koordinaten (wie `boardBounds` im Babylon-Host), für den Kamerafokus.
    private var center: SIMD2<Float>
    private var focus: SIMD2<Float>?
    private var pawns: [Int: Pawn] = [:]
    private var missingAnchors = Set<String>()

    // Babylon-Host (`apps/host/src/board/createBoardScene.ts`, `layout.ts`).
    private static let cameraOffset = SIMD3<Float>(0, 28, -17.5)
    private static let cameraAimZ: Float = -1.6
    private static let cameraFollow = SIMD2<Float>(0.12, 0.04)
    private static let cameraHalfLife: Double = 0.7
    private static let turnHalfLife: Double = 0.09
    private static let characterScale: Float = 1.3
    /// Laufgeschwindigkeit, bis die Brett-Regie (CHAOS-143) die Hüpfer des Babylon-Hosts übernimmt.
    private static let runSpeed: Float = 7
    /// Blick zur Kamera (Figur schaut nach +z, die Kamera steht bei -z).
    private static let faceCamera = Float.pi

    private struct Pawn {
        let entity: Entity
        let character: String
        var position: SIMD3<Float>
        var yaw: Float
        var animation = ""
    }

    struct FigureTemplate {
        let entity: Entity
        let clips: [String: AnimationResource]
    }

    private init(root board: Entity, meta: SceneMeta, anchors: [String: SIMD3<Float>], figures: [String: FigureTemplate],
                 sky: EnvironmentResource?, instances: Int) {
        self.anchors = anchors
        self.figures = figures
        self.sky = sky
        self.instances = instances
        skyExponent = log2(max(meta.sky?.intensity ?? 0.35, 0.01) * 2.5)
        let c = meta.clearColor
        clearColor = CGColor(red: CGFloat(c[0]), green: CGFloat(c[1]), blue: CGFloat(c[2]), alpha: 1)
        // Brettmitte aus den Feldern (Babylon: x gespiegelt).
        let xs = meta.fields.map { -$0.position[0] }, zs = meta.fields.map { $0.position[2] }
        center = xs.isEmpty ? .zero : [(xs.min()! + xs.max()!) / 2, (zs.min()! + zs.max()!) / 2]
        root.addChild(board)
        camera.camera.fieldOfViewInDegrees = meta.camera.fovY * 180 / .pi
        camera.camera.fieldOfViewOrientation = .vertical
        camera.camera.near = meta.camera.near
        camera.camera.far = meta.camera.far
        root.addChild(camera)
        if let sun = meta.sun {
            let light = DirectionalLight()
            light.light.color = .init(red: CGFloat(sun.color[0]), green: CGFloat(sun.color[1]), blue: CGFloat(sun.color[2]), alpha: 1)
            // Babylon-Intensität auf Lux, im Spike am Bevy-Bild abgeglichen (CHAOS-112/119).
            light.light.intensity = sun.intensity * 1600
            var shadow = DirectionalLightComponent.Shadow()
            shadow.shadowProjection = .automatic(maximumDistance: 80)
            light.shadow = shadow
            light.look(at: simd_normalize(vec(sun.direction)), from: .zero, relativeTo: nil)
            root.addChild(light)
        }
        placeCamera(dt: 0, active: nil)
    }

    /// Ordner mit `brett.usdz`, `brett.szene.json`, `brett.instanzen.json` und `figuren/`.
    static func assetFolder(override: String?) -> URL? {
        let candidates = [override.map { URL(fileURLWithPath: $0) },
                          Bundle.main.url(forResource: "payload", withExtension: nil)?.appending(path: "szene")].compactMap { $0 }
        return candidates.first { FileManager.default.fileExists(atPath: $0.appending(path: "brett.szene.json").path) }
    }

    static func load(from folder: URL) async throws -> BoardScene {
        let t0 = CACurrentMediaTime()
        let meta = try JSONDecoder().decode(SceneMeta.self, from: Data(contentsOf: folder.appending(path: "brett.szene.json")))
        let board = try await Entity(contentsOf: folder.appending(path: "brett.usdz"))
        // Himmelskuppeln und Dunst sind im USDZ spiegelnde Kugeln: ausblenden, Klarfarbe und Himmelslicht ersetzen sie.
        var stack = [board]
        while let entity = stack.popLast() {
            if ["himmel", "dunst"].contains(where: entity.name.hasPrefix) { entity.isEnabled = false } else { stack += entity.children }
        }
        var anchors: [String: SIMD3<Float>] = [:]
        for field in meta.fields {
            if let node = board.findEntity(named: field.anchor) {
                anchors[field.id] = node.position(relativeTo: nil)
            } else {
                hostLog("FEHLER Feld-Anker \(field.anchor) fehlt in brett.usdz")
                anchors[field.id] = vec(field.position)
            }
        }
        let instances = try await addInstances(to: board, from: folder.appending(path: "brett.instanzen.json"))

        var figures: [String: FigureTemplate] = [:]
        for id in ["robot", "cactus", "raccoon", "sock"] {
            let url = folder.appending(path: "figuren/\(id).usdz")
            guard FileManager.default.fileExists(atPath: url.path) else {
                hostLog("FEHLER figuren/\(id).usdz fehlt")
                continue
            }
            let entity = try await Entity(contentsOf: url)
            figures[id] = FigureTemplate(entity: entity, clips: clips(of: entity, table: folder.appending(path: "figuren/\(id).clips.json")))
        }
        let sky = try? await EnvironmentResource(equirectangular: hemisphereImage(
            sky: meta.sky?.color ?? [0.83, 0.9, 0.96], ground: meta.sky?.ground ?? meta.sky?.color ?? [0.49, 0.54, 0.32]))
        let scene = BoardScene(root: board, meta: meta, anchors: anchors, figures: figures, sky: sky, instances: instances)
        hostLog(String(format: "Brett geladen: %d Felder, %d Figuren, %d Instanzen in %.0f ms",
                       anchors.count, figures.count, instances, (CACurrentMediaTime() - t0) * 1000))
        return scene
    }

    /// Lobby: Übersicht ohne Figuren.
    func showOverview(dt: Double) {
        for (_, pawn) in pawns { pawn.entity.removeFromParent() }
        pawns.removeAll()
        placeCamera(dt: dt, active: nil)
    }

    /// Ein Bild des Bretts: Figuren auf ihren Feldern, Kamera zum aktiven Spieler.
    func apply(_ board: RenderState.Board, players: [RenderState.Player], dt: Double) {
        let spaces = Dictionary((board.spaces ?? []).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let colors = Dictionary(players.map { ($0.slot, $0.color ?? "") }, uniquingKeysWith: { a, _ in a })
        var seen = Set<Int>()
        for p in board.pawns ?? [] {
            seen.insert(p.slot)
            let target = position(of: p, spaces: spaces)
            let character = p.character ?? "robot"
            if let pawn = pawns[p.slot], pawn.character != character {
                pawn.entity.removeFromParent()
                pawns[p.slot] = nil
            }
            if pawns[p.slot] == nil {
                guard let made = makePawn(character: character, color: colors[p.slot] ?? "", at: target) else { continue }
                pawns[p.slot] = made
            }
            step(slot: p.slot, to: target, dt: dt)
        }
        for slot in pawns.keys where !seen.contains(slot) {
            pawns[slot]?.entity.removeFromParent()
            pawns[slot] = nil
        }
        let active = board.activeSlot.flatMap { pawns[$0] }.map { SIMD2<Float>(-$0.position.x, $0.position.z) }
        placeCamera(dt: dt, active: active)
    }

    /// Feld-Anker plus gespiegelter Versatz (mehrere Figuren auf einem Feld).
    private func position(of pawn: RenderState.Pawn, spaces: [String: RenderState.Space]) -> SIMD3<Float> {
        if let id = pawn.spaceId, let anchor = anchors[id], let space = spaces[id] {
            return anchor + SIMD3(-(pawn.x - space.x), 0, pawn.z - space.z)
        }
        let key = pawn.spaceId ?? "–"
        if !missingAnchors.contains(key) {
            missingAnchors.insert(key)
            hostLog("FEHLER kein Feld-Anker für \(key) – Figur nach renderState-Koordinaten")
        }
        return SIMD3(-pawn.x, anchors.values.first?.y ?? 0.3, pawn.z)
    }

    private func makePawn(character: String, color: String, at position: SIMD3<Float>) -> Pawn? {
        guard let template = figures[character] ?? figures.values.first else { return nil }
        let entity = template.entity.clone(recursive: true)
        entity.scale = SIMD3(repeating: Self.characterScale)
        tint(entity, color: color, character: character)
        entity.position = position
        entity.orientation = simd_quatf(angle: Self.faceCamera, axis: [0, 1, 0])
        root.addChild(entity)
        var pawn = Pawn(entity: entity, character: character, position: position, yaw: Self.faceCamera)
        play(&pawn, "idle")
        return pawn
    }

    /// Läuft geradlinig zum Ziel (Laufen-Clip, Blick in Laufrichtung), danach Ruhe und Blick zur Kamera.
    private func step(slot: Int, to target: SIMD3<Float>, dt: Double) {
        guard var pawn = pawns[slot] else { return }
        let delta = target - pawn.position
        let distance = simd_length(SIMD2(delta.x, delta.z))
        let heading: Float
        if distance > 0.02 {
            let travel = min(distance, Self.runSpeed * Float(dt))
            pawn.position += delta * (travel / max(distance, 0.0001))
            heading = atan2(delta.x, delta.z)
            play(&pawn, "run")
        } else {
            pawn.position = target
            heading = Self.faceCamera
            play(&pawn, "idle")
        }
        var turn = (heading - pawn.yaw).truncatingRemainder(dividingBy: 2 * .pi)
        if turn > .pi { turn -= 2 * .pi }
        if turn < -.pi { turn += 2 * .pi }
        pawn.yaw += turn * Float(1 - pow(0.5, dt / Self.turnHalfLife))
        pawn.entity.position = pawn.position
        pawn.entity.orientation = simd_quatf(angle: pawn.yaw, axis: [0, 1, 0])
        pawns[slot] = pawn
    }

    private func play(_ pawn: inout Pawn, _ name: String) {
        guard pawn.animation != name, let clip = figures[pawn.character]?.clips[name],
              let owner = Self.find(in: pawn.entity, where: { !$0.availableAnimations.isEmpty }) else { return }
        pawn.animation = name
        owner.playAnimation(clip, transitionDuration: 0.2)
    }

    /// Kamera wie im Babylon-Host: Brettmitte, zum aktiven Spieler leicht verschoben, exponentiell nachgezogen.
    private func placeCamera(dt: Double, active: SIMD2<Float>?) {
        let target = active.map { center + ($0 - center) * Self.cameraFollow } ?? center
        if let current = focus, dt > 0 {
            focus = current + (target - current) * Float(1 - pow(0.5, dt / Self.cameraHalfLife))
        } else {
            focus = target
        }
        let f = focus ?? target
        let z = f.y + Self.cameraAimZ
        // Babylon → Brett: x spiegeln.
        let eye = SIMD3<Float>(-(f.x + Self.cameraOffset.x), Self.cameraOffset.y, z + Self.cameraOffset.z)
        camera.look(at: [-f.x, 0, z], from: eye, relativeTo: nil)
    }

    /// Material „akzent“ in Slot-Farbe. Es liegt je Figur auf einem eigenen Mesh (USD-Prüfung, CHAOS-140); bei
    /// Figuren mit Skinning fasst RealityKit die Meshes zu einem Modell zusammen, die Mesh-Modelle behalten aber
    /// den Prim-Namen. Gefärbt wird darum das Material jedes Teils, dessen Mesh-Modell so heißt.
    private static let accentNodes: [String: String] = ["robot": "halsring", "cactus": "halstuch", "raccoon": "halstuch", "sock": "buendchen"]

    private func tint(_ figure: Entity, color hex: String, character: String) {
        guard !hex.isEmpty, let name = Self.accentNodes[character] else { return }
        var tinted = 0
        var stack = [figure]
        while let entity = stack.popLast() {
            stack += entity.children
            guard var model = entity.components[ModelComponent.self] else { continue }
            let indices = Set(model.mesh.contents.models.filter { $0.id == name }.flatMap { $0.parts.map(\.materialIndex) })
            guard !indices.isEmpty else { continue }
            for index in indices where index < model.materials.count {
                var pbr = (model.materials[index] as? PhysicallyBasedMaterial) ?? PhysicallyBasedMaterial()
                pbr.baseColor = .init(tint: platformColor(hex))
                model.materials[index] = pbr
                tinted += 1
            }
            entity.components.set(model)
        }
        if tinted == 0 { hostLog("FEHLER \(character): Akzent-Mesh \(name) nicht gefunden") }
    }

    // MARK: Laden

    /// Clips aus `<id>.clips.json` (alle Clips auf einer Zeitleiste, CHAOS-140); fehlt die Tabelle, die ganze Animation als `idle`.
    private static func clips(of figure: Entity, table: URL) -> [String: AnimationResource] {
        guard let owner = find(in: figure, where: { !$0.availableAnimations.isEmpty }) else {
            hostLog("FEHLER \(figure.name): keine Animation")
            return [:]
        }
        let source = owner.availableAnimations[0]
        guard let data = try? Data(contentsOf: table), let parsed = try? JSONDecoder().decode(FigureClips.self, from: data) else {
            return ["idle": source.repeat()]
        }
        var result: [String: AnimationResource] = [:]
        for clip in parsed.clips {
            guard let resource = try? AnimationResource.generate(with: source.definition.trimmed(start: clip.start, end: clip.end))
            else { continue }
            result[clip.name] = clip.loop == false ? resource : resource.repeat()
        }
        return result
    }

    private struct FigureClips: Decodable {
        struct Clip: Decodable { let name: String; let start: Double; let end: Double; let loop: Bool? }
        let clips: [Clip]
    }

    /// Babylon-Thin-Instances (Gras, Blumen) als `MeshInstancesComponent`: ein Draw je Mesh-Teil.
    private static func addInstances(to board: Entity, from url: URL) async throws -> Int {
        guard FileManager.default.fileExists(atPath: url.path) else { hostLog("FEHLER brett.instanzen.json fehlt"); return 0 }
        let list = try await Task.detached { try JSONDecoder().decode([InstancedMesh].self, from: Data(contentsOf: url)) }.value
        var total = 0
        for entry in list where !entry.matrices.isEmpty {
            let key = normalized(entry.mesh)
            guard let node = find(in: board, where: { normalized($0.name) == key }),
                  let model = find(in: node, where: { $0.components.has(ModelComponent.self) }),
                  var component = model.components[ModelComponent.self] else {
                hostLog("FEHLER Grundmesh \(entry.mesh) fehlt im Brett")
                continue
            }
            // Lage des Grundmeshs im Brett (enthält die Achsdrehung aus dem Blender-Export); die Matrizen sind Weltmatrizen.
            let local = model.transformMatrix(relativeTo: board)
            node.isEnabled = false
            let data = try LowLevelInstanceData(instanceCount: entry.matrices.count)
            data.withMutableTransforms { transforms in
                for (i, m) in entry.matrices.enumerated() {
                    let world = simd_float4x4(columns: (SIMD4(m[0], m[1], m[2], m[3]), SIMD4(m[4], m[5], m[6], m[7]),
                                                        SIMD4(m[8], m[9], m[10], m[11]), SIMD4(m[12], m[13], m[14], m[15])))
                    transforms[i] = world * local
                }
            }
            // Gras und Blumen sind in Babylon doppelseitig und werfen keine Schatten.
            component.materials = component.materials.map { material in
                guard var pbr = material as? PhysicallyBasedMaterial else { return material }
                pbr.faceCulling = .none
                return pbr
            }
            let instanced = Entity()
            instanced.name = "instanzen-\(entry.mesh)"
            instanced.components.set(component)
            instanced.components.set(DynamicLightShadowComponent(castsShadow: false))
            instanced.components.set(try MeshInstancesComponent(mesh: component.mesh, instances: data))
            board.addChild(instanced)
            total += entry.matrices.count
        }
        return total
    }

    static func find(in entity: Entity, where match: (Entity) -> Bool) -> Entity? {
        if match(entity) { return entity }
        for child in entity.children { if let hit = find(in: child, where: match) { return hit } }
        return nil
    }

    private static func normalized(_ name: String) -> String {
        name.lowercased().replacingOccurrences(of: "-", with: "_").replacingOccurrences(of: ".", with: "_")
    }
}

/// `brett.szene.json` (rechtshändig, Meter, y oben).
struct SceneMeta: Decodable {
    struct Camera: Decodable { let position: [Float]; let target: [Float]; let fovY: Float; let near: Float; let far: Float }
    struct Sun: Decodable { let direction: [Float]; let intensity: Float; let color: [Float] }
    struct Sky: Decodable { let intensity: Float; let color: [Float]; let ground: [Float]? }
    struct Field: Decodable { let id: String; let anchor: String; let kind: String?; let position: [Float] }
    let camera: Camera
    let sun: Sun?
    let sky: Sky?
    let clearColor: [Float]
    let fields: [Field]
}

/// `brett.instanzen.json`: Grundmesh und Weltmatrizen (spaltenweise, 16 Werte).
struct InstancedMesh: Decodable {
    let mesh: String
    let matrices: [[Float]]
}

func vec(_ v: [Float]) -> SIMD3<Float> { v.count >= 3 ? SIMD3(v[0], v[1], v[2]) : .zero }

func platformColor(_ hex: String) -> PlatformColor {
    let v = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0xcccccc
    return PlatformColor(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255,
                         blue: CGFloat(v & 0xff) / 255, alpha: 1)
}

/// Babylons Hemisphärenlicht als Himmelslicht (IBL): obere Hälfte Himmelsfarbe, untere Bodenfarbe, weicher Horizont.
func hemisphereImage(sky: [Float], ground: [Float]) -> CGImage {
    let w = 64, h = 32
    var pixels = [UInt8](repeating: 255, count: w * h * 4)
    for y in 0..<h {
        let t = Float(min(max((Float(y) / Float(h - 1) - 0.4) / 0.2, 0), 1)) // 0 = Himmel, 1 = Boden
        for x in 0..<w {
            for c in 0..<3 {
                pixels[(y * w + x) * 4 + c] = UInt8(max(0, min(255, (sky[c] * (1 - t) + ground[c] * t) * 255)))
            }
        }
    }
    let ctx = CGContext(data: &pixels, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    return ctx.makeImage()!
}
