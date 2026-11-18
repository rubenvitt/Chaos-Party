import CoreGraphics
import Foundation
import RealityKit

/// Baut die Testszene (Kamera, Sonne, Himmelslicht, Brett, Gras-/Blumen-Instanzen, Figuren) für ARView oder RealityRenderer.
@MainActor
struct SceneBuilder {
    let settings: Settings
    let log: (String) -> Void

    /// Suchreihenfolge: `--assets=<ordner>` (Entwicklung), dann der Ordner `export` im App-Bundle.
    func file(_ name: String) -> URL? {
        let dirs = [settings.assets.map { URL(fileURLWithPath: $0) },
                    Bundle.main.resourceURL?.appendingPathComponent("export")].compactMap { $0 }
        return dirs.map { $0.appendingPathComponent(name) }
            .first { FileManager.default.fileExists(atPath: $0.path) }
    }

    struct Built {
        let root: Entity
        let camera: PerspectiveCamera
        let instances: Int
        let clearColor: CGColor
        let sky: EnvironmentResource?
        let skyExponent: Float
    }

    func build() async throws -> Built {
        guard let metaURL = file("brett.szene.json") else { throw SpikeError.missing("brett.szene.json") }
        let meta = try JSONDecoder().decode(SceneMeta.self, from: Data(contentsOf: metaURL))
        let root = Entity()

        let camera = PerspectiveCamera()
        camera.camera.fieldOfViewInDegrees = meta.camera.fovY * 180 / .pi
        camera.camera.fieldOfViewOrientation = .vertical
        camera.camera.near = meta.camera.near
        camera.camera.far = meta.camera.far
        camera.look(at: vec(meta.camera.target), from: vec(meta.camera.position), relativeTo: nil)
        root.addChild(camera)

        if let sun = meta.sun {
            let light = DirectionalLight()
            light.light.color = color(sun.color)
            // Babylon-Intensität (≈ 1–3) grob auf Lux abgebildet, am Bevy-Bild abgeglichen.
            light.light.intensity = sun.intensity * Float(settings.sunScale)
            if settings.shadows {
                var shadow = DirectionalLightComponent.Shadow()
                shadow.shadowProjection = .automatic(maximumDistance: 80)
                // Kaskaden gibt es erst im SDK 27 (Xcode 27, Swift 6.4); die CI baut noch mit Xcode 26.
                #if compiler(>=6.4)
                if #available(macOS 27, iOS 27, tvOS 27, *) { shadow.cascades = .fixed(2) }
                #endif
                light.shadow = shadow
            }
            light.look(at: simd_normalize(vec(sun.direction)), from: .zero, relativeTo: nil)
            root.addChild(light)
        }

        let clear = meta.clearColor
        // Kein Umgebungslicht in RealityKit: Babylons Hemisphärenlicht als Himmel/Boden-Verlauf (IBL).
        var skyResource: EnvironmentResource?
        if let sky = meta.sky {
            skyResource = try await EnvironmentResource(
                equirectangular: hemisphereImage(sky: sky.color, ground: sky.ground ?? sky.color))
        }

        let board: Entity
        if let url = file("brett.usdz") {
            board = try await Entity(contentsOf: url)
        } else {
            log("brett.usdz fehlt – Platzhalter-Boden")
            board = ModelEntity(mesh: .generatePlane(width: 46, depth: 36),
                                materials: [SimpleMaterial(color: .init(red: 0.45, green: 0.6, blue: 0.3, alpha: 1), isMetallic: false)])
        }
        root.addChild(board)
        // Himmelskuppeln und Dunst (500 m, im Export schwarze Spiegelkugeln) würden das Brett verschatten
        // und liegen ohnehin hinter `far`: ausblenden, die Klarfarbe ersetzt sie.
        var stack = [board]
        while let entity = stack.popLast() {
            if ["himmel", "dunst"].contains(where: entity.name.hasPrefix) { entity.isEnabled = false } else { stack += entity.children }
        }

        let instanceCount = try await addInstances(to: board)

        let camPos = vec(meta.camera.position)
        for pawn in meta.pawns {
            let figure: Entity
            if let url = file("figuren/\(pawn.character).usdz") {
                figure = try await Entity(contentsOf: url)
            } else {
                log("figuren/\(pawn.character).usdz fehlt – Platzhalter")
                figure = ModelEntity(mesh: .generateBox(width: 0.8, height: 1.6, depth: 0.8),
                                     materials: [SimpleMaterial(color: .orange, isMetallic: false)])
            }
            let at = vec(pawn.position)
            // Figuren schauen zur Kamera (Vorderseite +z wie in glTF).
            figure.position = at
            figure.orientation = simd_quatf(angle: atan2(camPos.x - at.x, camPos.z - at.z), axis: [0, 1, 0])
            root.addChild(figure)
            if settings.idle { playIdle(figure, character: pawn.character) }
            HostClient.shared.pawns[pawn.slot] = figure
        }
        if let id = settings.closeUp { aimCloseUp(camera, at: id, meta: meta) }
        if settings.materials != "voll" { overrideMaterials(in: root) }
        return Built(root: root, camera: camera, instances: instanceCount,
                     clearColor: CGColor(red: CGFloat(clear[0]), green: CGFloat(clear[1]), blue: CGFloat(clear[2]), alpha: 1),
                     sky: skyResource, skyExponent: log2(max(meta.sky?.intensity ?? 0.35, 0.01) * Float(settings.skyScale)))
    }

    /// `--nah=<figur>` (CHAOS-140): Kamera auf Augenhöhe vor die Figur, aus der Richtung der Brettkamera,
    /// zu der die Figur schaut. Sichtfeld, near und far bleiben wie bei der Brettkamera.
    private func aimCloseUp(_ camera: PerspectiveCamera, at id: String, meta: SceneMeta) {
        guard let pawn = meta.pawns.first(where: { $0.character == id }) else {
            log("--nah=\(id): keine solche Figur (\(meta.pawns.map(\.character).joined(separator: ", "))), Brettkamera bleibt")
            return
        }
        let at = vec(pawn.position)
        var toCamera = vec(meta.camera.position) - at
        toCamera.y = 0
        let dir = simd_length(toCamera) > 0.001 ? simd_normalize(toCamera) : SIMD3<Float>(0, 0, 1)
        let eye = at + dir * settings.closeUpDistance + SIMD3<Float>(0, 1.25, 0)
        camera.look(at: at + SIMD3<Float>(0, 0.8, 0), from: eye, relativeTo: nil)
        log("Nahkamera vor \(id), Abstand \(settings.closeUpDistance) m")
    }

    /// Babylon-Thin-Instances als `MeshInstancesComponent` (ein Draw je Mesh-Teil, GPU-Instanzen).
    private func addInstances(to board: Entity) async throws -> Int {
        guard let url = file("brett.instanzen.json") else { log("brett.instanzen.json fehlt"); return 0 }
        let list = try await Task.detached { try JSONDecoder().decode([InstancedMesh].self, from: Data(contentsOf: url)) }.value
        var total = 0
        for entry in list where !entry.matrices.isEmpty {
            guard let (source, local) = try await baseModel(named: entry.mesh, in: board) else { continue }
            let keep = Int((Float(entry.matrices.count) * settings.grass).rounded())
            guard keep > 0 else { continue }
            let step = Float(entry.matrices.count) / Float(keep)
            let data = try LowLevelInstanceData(instanceCount: keep)
            data.withMutableTransforms { transforms in
                for i in 0..<keep {
                    let m = entry.matrices[min(entry.matrices.count - 1, Int(Float(i) * step))]
                    let world = simd_float4x4(columns: (SIMD4(m[0], m[1], m[2], m[3]), SIMD4(m[4], m[5], m[6], m[7]),
                                                        SIMD4(m[8], m[9], m[10], m[11]), SIMD4(m[12], m[13], m[14], m[15])))
                    transforms[i] = world * local
                }
            }
            let instanced = Entity()
            instanced.name = "instanzen-\(entry.mesh)"
            // Gras und Blumen sind in Babylon doppelseitig.
            var model = source
            model.materials = model.materials.map { material in
                guard var pbr = material as? PhysicallyBasedMaterial else { return material }
                pbr.faceCulling = .none
                return pbr
            }
            instanced.components.set(model)
            // Wie in Babylon: Gras und Blumen werfen keine Schatten (nur Bäume, Requisiten, Figuren).
            instanced.components.set(DynamicLightShadowComponent(castsShadow: false))
            // Ohne eigene `bounds`: mit expliziter Hülle stürzt RealityKit im tvOS-27-Simulator ab
            // (bad_variant_access in OcclusionCullingQueryNode); RealityKit berechnet sie sonst selbst.
            instanced.components.set(try MeshInstancesComponent(mesh: source.mesh, instances: data))
            board.addChild(instanced)
            total += keep
        }
        log("Instanzen: \(list.count) Gruppen, \(total) gerendert (Anteil \(settings.grass))")
        return total
    }

    /// Grundmesh einer Instanzgruppe: Knoten im Brett (USD-Namen ohne `-`), sonst `instanz-<mesh>.usdz`,
    /// sonst Platzhalter. Liefert das Modell und seine Lage im Brett.
    private func baseModel(named name: String, in board: Entity) async throws -> (ModelComponent, simd_float4x4)? {
        let key = normalized(name)
        var node: Entity? = find(in: board) { normalized($0.name) == key }
        var detached = false
        if node == nil, let url = file("instanz-\(name).usdz") {
            node = try await Entity(contentsOf: url)
            detached = true
        }
        guard let node else {
            log("Grundmesh \(name) nicht gefunden – Platzhalter")
            let box = MeshResource.generateBox(width: 0.06, height: 0.35, depth: 0.06)
            return (ModelComponent(mesh: box, materials: [SimpleMaterial(color: .green, isMetallic: false)]), matrix_identity_float4x4)
        }
        guard let model = find(in: node, where: { $0.components.has(ModelComponent.self) }),
              let component = model.components[ModelComponent.self] else { return nil }
        // Lage des Meshs im Brett (enthält die Achsdrehung aus dem Blender-Export, z oben → y oben).
        // Annahme wie bei Bevy: das Grundmesh lag im GLB im Ursprung, die Matrizen sind Weltmatrizen.
        let local = model.transformMatrix(relativeTo: detached ? node : board)
        // Wie Bevy: das Grundmesh selbst ausblenden, nur die Instanzen zeigen.
        if !detached { node.isEnabled = false }
        return (component, local)
    }

    /// CHAOS-114, Diagnose: alle Materialien durch eines ohne Texturen ersetzen (`--material=einfach|unbeleuchtet`).
    /// Der Unterschied zur vollen Szene zeigt, was Texturen und Materialvielfalt an Pixelkosten tragen.
    private func overrideMaterials(in root: Entity) {
        let replacement: any Material
        if settings.materials == "unbeleuchtet" {
            replacement = UnlitMaterial(color: .gray)
        } else {
            var pbr = PhysicallyBasedMaterial()
            pbr.baseColor = .init(tint: .gray)
            pbr.roughness = 0.8
            pbr.metallic = 0.0
            pbr.faceCulling = .none
            replacement = pbr
        }
        var models = 0, slots = 0
        var stack = [root]
        while let entity = stack.popLast() {
            stack += entity.children
            guard var model = entity.components[ModelComponent.self] else { continue }
            // Auch Teile ohne Material (Vertexfarben aus dem Konverter, darunter Gras) bekommen das Ersatzmaterial.
            let count = max(1, model.materials.count)
            slots += count
            model.materials = Array(repeating: replacement, count: count)
            entity.components.set(model)
            models += 1
        }
        log("Materialien ersetzt (\(settings.materials)): \(models) Modelle, \(slots) Material-Slots")
    }

    /// Seit CHAOS-140 liegen alle Clips einer Figur nacheinander auf einer Zeitleiste;
    /// `figuren/<id>.clips.json` sagt, wo `idle` liegt. Ohne Tabelle (ältere Exporte) läuft die
    /// ganze Animation.
    private struct FigureClips: Decodable {
        struct Clip: Decodable { let name: String; let start: Double; let end: Double }
        let clips: [Clip]
    }

    private func playIdle(_ figure: Entity, character: String) {
        guard let owner = find(in: figure, where: { !$0.availableAnimations.isEmpty }) else {
            log("\(figure.name): keine Animation"); return
        }
        let source = owner.availableAnimations.first { $0.name?.lowercased().contains("idle") == true }
            ?? owner.availableAnimations[0]
        if let url = file("figuren/\(character).clips.json"),
           let table = try? JSONDecoder().decode(FigureClips.self, from: Data(contentsOf: url)),
           let idle = table.clips.first(where: { $0.name == "idle" }),
           let clip = try? AnimationResource.generate(with: source.definition.trimmed(start: idle.start, end: idle.end)) {
            owner.playAnimation(clip.repeat())
            return
        }
        owner.playAnimation(source.repeat())
    }

    private func find(in entity: Entity, where match: (Entity) -> Bool) -> Entity? {
        if match(entity) { return entity }
        for child in entity.children { if let hit = find(in: child, where: match) { return hit } }
        return nil
    }

    private func normalized(_ name: String) -> String {
        name.lowercased().replacingOccurrences(of: "-", with: "_").replacingOccurrences(of: ".", with: "_")
    }
}

enum SpikeError: Error { case missing(String) }

func vec(_ v: [Float]) -> SIMD3<Float> { SIMD3(v[0], v[1], v[2]) }

func color(_ c: [Float]) -> DirectionalLightComponent.Color {
    .init(red: CGFloat(c[0]), green: CGFloat(c[1]), blue: CGFloat(c[2]), alpha: 1)
}

/// Kleines Equirect-Bild: obere Hälfte Himmelsfarbe, untere Bodenfarbe, weicher Übergang am Horizont.
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
