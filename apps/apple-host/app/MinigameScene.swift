import CoreGraphics
import Foundation
import QuartzCore
import RealityKit

/// Minispiele mit echter Grafik (CHAOS-144, ADR-019 §3 Nachtrag 2). Der JS-Kern schickt die echte Geometrie der
/// Minispiel-Meshes einmal je Minispiel (`minigame.geometry`) und je Bild nur Lage, Farbe und Material der Körper.
/// Swift baut daraus `MeshResource`s (asynchron, nicht im Bild-Takt), zeigt die Figuren als USDZ (CHAOS-140) mit ihren
/// Clips, baut die Kulisse um die Spielfläche (`look.backdrop`), stellt die Kamera des Minispiels und spielt Effekte.
/// Ohne angekommene Geometrie zeichnet es die Grundform des Körpers (Rückfall, auch ohne Assets).
///
/// Koordinaten: Babylon ist linkshändig. Lage `(x, y, z) → (x, y, -z)`, Quaternion `(x, y, z, w) → (-x, -y, z, w)`;
/// die Geometrie spiegelt `RenderState.Geometry.decoded()` (Babylons Vorderseiten im Uhrzeigersinn werden so zu
/// RealityKits Vorderseiten gegen den Uhrzeigersinn).
@MainActor
final class MinigameScene {
    let root = Entity()
    let camera = PerspectiveCamera()
    let sky: EnvironmentResource?
    let skyExponent: Float
    let clearColor: CGColor
    /// Abschnitt gewechselt (`<runde>-<id>-<stage>`): Bildschirmfotos (`--bild`).
    var onStage: ((String) -> Void)?

    private let world = Entity()
    private var backdrop: Entity?
    private var backdropKey = ""
    private var gameKey = ""
    private var stageKey = ""
    private var shown = false
    private var readySince: CFTimeInterval?
    private var meshes: [String: (resource: MeshResource, extent: SIMD3<Float>)] = [:]
    private var building = Set<String>()
    private var bodies: [String: BodyView] = [:]
    private var figures: [Int: FigureView] = [:]
    private var materials: [String: RealityKit.Material] = [:]
    private var lastEffect = 0
    private var shake: (until: CFTimeInterval, strength: Float) = (0, 0)
    private var cameraKey = ""
    /// Abgebautes, das der Render-Thread womöglich noch benutzt (siehe `reset`).
    private var retired: [(at: CFTimeInterval, objects: [AnyObject])] = []
    private var particles: [Particle] = []
    private var retiredParticles: [Entity] = []
    private var particleMaterials: [String: RealityKit.Material] = [:]
    private let particleMesh = MeshResource.generateSphere(radius: 1)
    private let models: [String: FigureModel]
    private let primitives: [String: MeshResource] = [
        "sphere": .generateSphere(radius: 0.5), "box": .generateBox(size: 1), "cylinder": .generateCylinder(height: 1, radius: 0.5),
    ]

    private struct BodyView {
        let entity: ModelEntity
        var meshKey: String
        var materialKey: String
    }

    private struct Particle {
        let entity: ModelEntity
        var velocity: SIMD3<Float>
        var age: Float = 0
        let life: Float
        let gravity: Float
        let size: Float
    }

    private struct FigureView {
        let entity: Entity
        let character: String
        var anim = ""
        var seq = -1
        var oneShotEnd: CFTimeInterval?
    }

    /// Sonne wie das Brett (`brett.szene.json`, rechtshändig), CHAOS-142.
    private static let sunDirection = SIMD3<Float>(-0.5456, -0.6825, 0.4863)

    init(models: [String: FigureModel], sky: EnvironmentResource?, skyExponent: Float, clearColor: CGColor) {
        self.models = models
        self.sky = sky
        self.skyExponent = skyExponent
        self.clearColor = clearColor
        root.addChild(world)
        camera.camera.near = 0.1
        camera.camera.far = 1000
        root.addChild(camera)
        let sun = DirectionalLight()
        sun.light.color = .init(red: 1, green: 0.98, blue: 0.94, alpha: 1)
        sun.light.intensity = 3.4 * 1600
        var shadow = DirectionalLightComponent.Shadow()
        shadow.shadowProjection = .automatic(maximumDistance: 45)
        sun.shadow = shadow
        sun.look(at: simd_normalize(Self.sunDirection), from: .zero, relativeTo: nil)
        root.addChild(sun)
    }

    /// Figuren als USDZ (`figuren/<id>.usdz`, Clips aus `<id>.clips.json`); fehlt der Ordner, Kapseln.
    static func loadModels(folder: URL?) async -> [String: FigureModel] {
        guard let folder else { return [:] }
        var out: [String: FigureModel] = [:]
        for id in ["robot", "cactus", "raccoon", "sock"] {
            let url = folder.appending(path: "figuren/\(id).usdz")
            guard FileManager.default.fileExists(atPath: url.path), let entity = try? await Entity(contentsOf: url) else {
                hostLog("FEHLER Minispiel-Figur \(id) fehlt")
                continue
            }
            out[id] = FigureModel(entity: entity, table: folder.appending(path: "figuren/\(id).clips.json"))
        }
        return out
    }

    /// Ein Bild des Minispiels.
    func apply(_ m: RenderState.Minigame, players: [RenderState.Player], dt: Double) {
        let now = CACurrentMediaTime()
        let game = "\(m.round ?? 0)-\(m.id)"
        if game != gameKey { reset(game) }
        let stage = "\(game)-\(m.stage ?? "")"
        if stage != stageKey {
            stageKey = stage
            onStage?(stage)
        }
        for g in m.geometry ?? [] where meshes[g.id] == nil && !building.contains(g.id) { build(g, game: game) }
        if let b = m.backdrop { placeBackdrop(b) }
        if m.ready == true, readySince == nil { readySince = now }
        // Erst zeigen, wenn die Geometrie da ist (kein Aufploppen von Grundformen); spätestens nach 3 s.
        if !shown, let since = readySince, meshes.count >= (m.geometryTotal ?? 0) || now - since > 3 {
            shown = true
            hostLog(String(format: "Minispiel %@: %d Geometrien gebaut, sichtbar %.0f ms nach dem Aufbau", m.id, meshes.count,
                           (now - since) * 1000))
        }
        world.isEnabled = shown
        placeCamera(m.camera, now: now)
        updateBodies(m.bodies ?? [])
        let colors = Dictionary(players.map { ($0.slot, $0.color ?? "") }, uniquingKeysWith: { a, _ in a })
        updateFigures(m.figures ?? [], colors: colors, now: now)
        for effect in m.effects ?? [] where effect.seq > lastEffect {
            lastEffect = effect.seq
            play(effect, now: now)
        }
        moveParticles(dt: Float(min(dt, 0.1)))
    }

    /// Das Minispiel ist vorbei (Brett, Lobby): Das nächste baut neu auf, auch bei gleicher Runde und gleichem Spiel
    /// (Revanche). Abgebaut wird erst beim nächsten Minispiel, unsichtbar.
    func leave() {
        gameKey = ""
    }

    private func reset(_ game: String) {
        gameKey = game
        stageKey = ""
        shown = false
        readySince = nil
        // Entfernte Entitäten und Meshes noch ein paar Sekunden halten: RealityRenderer hat bis zu drei Bilder im Flug,
        // ein sofort freigegebener Puffer brachte den Render-Thread im Simulator zum Absturz (re::BufferSlice::isValid).
        let now = CACurrentMediaTime()
        retired.removeAll { now - $0.at > 3 }
        let removed: [AnyObject] = Array(world.children) + meshes.values.map(\.resource)
        retired.append((now, removed))
        for child in Array(world.children) { child.removeFromParent() }
        bodies.removeAll()
        figures.removeAll()
        meshes.removeAll()
        building.removeAll()
        lastEffect = 0
        particles.removeAll()
        cameraKey = ""
        shake = (0, 0)
    }

    // MARK: Geometrie

    /// Dekodieren abseits des Hauptthreads, `MeshResource` asynchron: kein Ruckeln beim Wechsel Brett → Minispiel.
    private func build(_ g: RenderState.Geometry, game: String) {
        building.insert(g.id)
        let t0 = CACurrentMediaTime()
        Task { @MainActor [weak self] in
            let decoded = await Task.detached(priority: .userInitiated) { g.decoded() }.value
            guard let self, self.gameKey == game else { return }
            guard let decoded else {
                hostLog("FEHLER Geometrie \(g.id) nicht dekodierbar")
                return
            }
            var descriptor = MeshDescriptor(name: g.id)
            descriptor.positions = MeshBuffers.Positions(decoded.positions)
            descriptor.normals = MeshBuffers.Normals(decoded.normals)
            descriptor.primitives = .triangles(decoded.indices)
            do {
                let resource = try await MeshResource(from: [descriptor])
                guard self.gameKey == game else { return }
                self.meshes[g.id] = (resource, decoded.extent)
                let ms = (CACurrentMediaTime() - t0) * 1000
                if ms > 30 { hostLog(String(format: "Geometrie %@ (%d Ecken) in %.0f ms", g.id, g.vertices, ms)) }
            } catch {
                hostLog("FEHLER Geometrie \(g.id): \(error)")
            }
        }
    }

    // MARK: Körper

    private func updateBodies(_ list: [RenderState.Body]) {
        var seen = Set<String>()
        for b in list where b.pos.count == 3 {
            seen.insert(b.id)
            let size = (b.size?.count == 3) ? SIMD3(b.size![0], b.size![1], b.size![2]) : SIMD3<Float>(repeating: 1)
            let geometry = b.mesh.flatMap { meshes[$0] }
            let meshKey = geometry != nil ? "g:\(b.mesh!)" : "p:\(b.shape)"
            var scale = size
            if let geometry {
                for axis in 0..<3 { scale[axis] = geometry.extent[axis] > 1e-4 ? size[axis] / geometry.extent[axis] : 1 }
            }
            let materialKey = "\(b.color ?? "#cccccc")|\(b.alpha ?? 1)|\(b.glow ?? "")|\(b.finish ?? "")|\(b.twoSided == true)"
            let r = b.rot ?? [0, 0, 0, 1]
            let rotation = r.count == 4 ? simd_quatf(ix: -r[0], iy: -r[1], iz: r[2], r: r[3]) : simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
            let transform = Transform(scale: scale, rotation: rotation, translation: [b.pos[0], b.pos[1], -b.pos[2]])
            let mesh = geometry?.resource ?? primitives[b.shape] ?? primitives["box"]!
            if var view = bodies[b.id] {
                if view.meshKey != meshKey, var model = view.entity.model {
                    model.mesh = mesh
                    view.entity.model = model
                    view.meshKey = meshKey
                }
                if view.materialKey != materialKey {
                    view.entity.model?.materials = [material(b, key: materialKey)]
                    view.materialKey = materialKey
                }
                view.entity.transform = transform
                bodies[b.id] = view
            } else {
                let entity = ModelEntity(mesh: mesh, materials: [material(b, key: materialKey)])
                entity.name = b.id
                entity.transform = transform
                world.addChild(entity)
                bodies[b.id] = BodyView(entity: entity, meshKey: meshKey, materialKey: materialKey)
            }
        }
        for (id, view) in bodies where !seen.contains(id) {
            view.entity.removeFromParent()
            retiredParticles.append(view.entity)
            bodies[id] = nil
        }
    }

    /// Wie der Look des Browser-Hosts (`plainOptions` in `apps/host/src/nature/stageLook.ts`).
    private func material(_ b: RenderState.Body, key: String) -> RealityKit.Material {
        if let cached = materials[key] { return cached }
        var pbr = PhysicallyBasedMaterial()
        pbr.baseColor = .init(tint: platformColor(b.color ?? "#cccccc"))
        switch b.finish ?? "lack" {
        case "matt": pbr.roughness = 0.85
        case "glanz":
            pbr.roughness = 0.15
            pbr.clearcoat = 0.9
        case "metall":
            pbr.roughness = 0.25
            pbr.metallic = 1.0
        case "stoff": pbr.roughness = 0.95
        default:
            pbr.roughness = 0.4
            pbr.clearcoat = 0.35
        }
        if let glow = b.glow {
            pbr.emissiveColor = .init(color: platformColor(glow))
            pbr.emissiveIntensity = 1
        }
        if let alpha = b.alpha, alpha < 0.999 {
            pbr.blending = .transparent(opacity: .init(floatLiteral: max(0, alpha)))
        }
        if b.twoSided == true { pbr.faceCulling = .none }
        materials[key] = pbr
        return pbr
    }

    // MARK: Figuren

    private func updateFigures(_ list: [RenderState.Figure], colors: [Int: String], now: CFTimeInterval) {
        var seen = Set<Int>()
        for f in list where f.pos.count == 3 {
            seen.insert(f.slot)
            let character = f.character ?? "raccoon"
            if let view = figures[f.slot], view.character != character {
                view.entity.removeFromParent()
                figures[f.slot] = nil
            }
            if figures[f.slot] == nil {
                let color = colors[f.slot] ?? ""
                let entity = models[character]?.instance(color: color, character: character) ?? Self.capsule(color: color)
                world.addChild(entity)
                figures[f.slot] = FigureView(entity: entity, character: character)
            }
            guard var view = figures[f.slot] else { continue }
            let r = f.rot ?? [0, 0, 0, 1]
            let babylon = r.count == 4 ? simd_quatf(ix: -r[0], iy: -r[1], iz: r[2], r: r[3]) : simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
            // Babylon-Figuren blicken nach +Z (linkshändig) = -z in RealityKit; die USDZ-Figuren blicken nach +z.
            view.entity.orientation = babylon * simd_quatf(angle: .pi, axis: [0, 1, 0])
            view.entity.position = [f.pos[0], f.pos[1], -f.pos[2]]
            let s = f.scale ?? [1, 1, 1]
            view.entity.scale = s.count == 3 ? SIMD3(abs(s[0]), abs(s[1]), abs(s[2])) : .one
            view.entity.isEnabled = f.visible ?? true
            animate(&view, anim: f.anim ?? "idle", seq: f.animSeq ?? 0, now: now)
            figures[f.slot] = view
        }
        for (slot, view) in figures where !seen.contains(slot) {
            view.entity.removeFromParent()
            figures[slot] = nil
        }
    }

    /// Ohne USDZ (`OHNE_ASSETS=1`): Kapsel in Slot-Farbe, Füße bei y = 0.
    private static func capsule(color: String) -> Entity {
        let holder = Entity()
        let body = ModelEntity(mesh: .generateBox(width: 0.8, height: 1.6, depth: 0.8, cornerRadius: 0.4),
                               materials: [SimpleMaterial(color: platformColor(color.isEmpty ? "#cccccc" : color), isMetallic: false)])
        body.position.y = 0.8
        holder.addChild(body)
        return holder
    }

    /// Schleifen-Clips (idle, run) nur bei Wechsel neu starten; Einmal-Clips (jump, hit, cheer …) bei jedem `play`,
    /// danach zurück zu idle (wie `CharacterHandle.play` im Browser-Host).
    private func animate(_ view: inout FigureView, anim: String, seq: Int, now: CFTimeInterval) {
        guard let model = models[view.character] else { return }
        let loops = model.loops[anim] ?? true
        if anim != view.anim || (!loops && seq != view.seq) {
            view.anim = anim
            view.seq = seq
            model.play(anim, on: view.entity)
            view.oneShotEnd = loops ? nil : now + (model.durations[anim] ?? 1)
        } else {
            view.seq = seq
        }
        if let end = view.oneShotEnd, now >= end {
            view.oneShotEnd = nil
            model.play("idle", on: view.entity)
        }
    }

    // MARK: Kamera und Effekte

    private func placeCamera(_ c: RenderState.Camera?, now: CFTimeInterval) {
        guard let c, c.pos.count == 3, c.target.count == 3 else { return }
        var eye = SIMD3<Float>(c.pos[0], c.pos[1], -c.pos[2])
        let target = SIMD3<Float>(c.target[0], c.target[1], -c.target[2])
        if now < shake.until {
            let k = shake.strength * Float((shake.until - now) / 0.35) * 0.3
            eye += SIMD3(Float.random(in: -k...k), Float.random(in: -k...k), Float.random(in: -k...k))
        }
        let fov = (c.fov ?? 0.8) * 180 / .pi
        let axis = c.fovAxis ?? "vertical"
        let key = "\(fov)|\(axis)"
        if key != cameraKey {
            cameraKey = key
            camera.camera.fieldOfViewInDegrees = fov
            camera.camera.fieldOfViewOrientation = axis == "horizontal" ? .horizontal : .vertical
        }
        camera.look(at: target, from: eye, relativeTo: nil)
    }

    private func play(_ e: RenderState.Effect, now: CFTimeInterval) {
        if e.kind == "shake" {
            shake = (now + 0.35, max(shake.strength * 0.5, min(1, e.strength ?? 0.3)))
            return
        }
        guard let p = e.pos, p.count == 3, particles.count < 400 else { return }
        let preset = MinigameEffects.preset(kind: e.kind, color: e.color)
        let origin = SIMD3<Float>(p[0], p[1], -p[2])
        for index in 0..<preset.count {
            let hex = preset.colors[index % preset.colors.count]
            let material = particleMaterials[hex] ?? {
                let made = UnlitMaterial(color: platformColor(hex))
                particleMaterials[hex] = made
                return made
            }()
            let entity = ModelEntity(mesh: particleMesh, materials: [material])
            entity.position = origin
            entity.scale = SIMD3(repeating: preset.size)
            world.addChild(entity)
            var direction = SIMD3<Float>(Float.random(in: -1...1), Float.random(in: 0.2...1.2), Float.random(in: -1...1))
            direction = simd_normalize(direction)
            particles.append(Particle(entity: entity, velocity: direction * preset.speed * Float.random(in: 0.6...1),
                                      life: preset.life * Float.random(in: 0.7...1), gravity: preset.gravity, size: preset.size))
        }
    }

    /// Partikel fliegen, fallen und schrumpfen; danach weg.
    private func moveParticles(dt: Float) {
        // Entfernte Partikel ein paar Bilder länger halten (Render-Thread, siehe `reset`).
        if retiredParticles.count > 200 { retiredParticles.removeFirst(retiredParticles.count - 200) }
        guard !particles.isEmpty else { return }
        var alive: [Particle] = []
        alive.reserveCapacity(particles.count)
        for var particle in particles {
            particle.age += dt
            if particle.age >= particle.life {
                particle.entity.removeFromParent()
                retiredParticles.append(particle.entity)
                continue
            }
            particle.velocity.y -= particle.gravity * dt
            particle.entity.position += particle.velocity * dt
            particle.entity.scale = SIMD3(repeating: particle.size * (1 - particle.age / particle.life * 0.7))
            alive.append(particle)
        }
        particles = alive
    }

    // MARK: Kulisse

    private func placeBackdrop(_ b: RenderState.Backdrop) {
        let key = "\(b.halfX)|\(b.halfZ)|\(b.groundY ?? 0)|\(b.surface ?? "wiese")"
        guard key != backdropKey else { return }
        backdropKey = key
        backdrop?.removeFromParent()
        let made = MinigameBackdrop.make(b)
        root.addChild(made)
        backdrop = made
    }
}

/// Eine Figur als USDZ mit ihren Clips (wie `BoardScene`, eigene Kopie: Brett und Minispiel teilen keine Entitäten).
@MainActor
struct FigureModel {
    let entity: Entity
    let clips: [String: AnimationResource]
    let durations: [String: Double]
    let loops: [String: Bool]

    /// Akzent-Mesh je Figur (Material `akzent` in Slot-Farbe), wie `BoardScene.accentNodes`.
    private static let accentNodes: [String: String] = ["robot": "halsring", "cactus": "halstuch", "raccoon": "halstuch", "sock": "buendchen"]

    init(entity: Entity, table: URL) {
        self.entity = entity
        var clips: [String: AnimationResource] = [:], durations: [String: Double] = [:], loops: [String: Bool] = [:]
        if let owner = BoardScene.find(in: entity, where: { !$0.availableAnimations.isEmpty }) {
            let source = owner.availableAnimations[0]
            if let data = try? Data(contentsOf: table), let parsed = try? JSONDecoder().decode(Table.self, from: data) {
                for clip in parsed.clips {
                    guard let resource = try? AnimationResource.generate(with: source.definition.trimmed(start: clip.start, end: clip.end))
                    else { continue }
                    let loop = clip.loop ?? true
                    clips[clip.name] = loop ? resource.repeat() : resource
                    durations[clip.name] = clip.end - clip.start
                    loops[clip.name] = loop
                }
            } else {
                clips["idle"] = source.repeat()
            }
        }
        self.clips = clips
        self.durations = durations
        self.loops = loops
    }

    private struct Table: Decodable {
        struct Clip: Decodable { let name: String; let start: Double; let end: Double; let loop: Bool? }
        let clips: [Clip]
    }

    func instance(color hex: String, character: String) -> Entity {
        let figure = entity.clone(recursive: true)
        guard !hex.isEmpty, let name = Self.accentNodes[character] else { return figure }
        var stack = [figure]
        while let current = stack.popLast() {
            stack += current.children
            guard var model = current.components[ModelComponent.self] else { continue }
            let indices = Set(model.mesh.contents.models.filter { $0.id == name }.flatMap { $0.parts.map(\.materialIndex) })
            guard !indices.isEmpty else { continue }
            for index in indices where index < model.materials.count {
                var pbr = (model.materials[index] as? PhysicallyBasedMaterial) ?? PhysicallyBasedMaterial()
                pbr.baseColor = .init(tint: platformColor(hex))
                model.materials[index] = pbr
            }
            current.components.set(model)
        }
        return figure
    }

    func play(_ name: String, on figure: Entity) {
        guard let clip = clips[name] ?? clips["idle"],
              let owner = BoardScene.find(in: figure, where: { !$0.availableAnimations.isEmpty }) else { return }
        owner.playAnimation(clip, transitionDuration: 0.15)
    }
}
