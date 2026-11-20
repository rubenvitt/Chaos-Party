import CoreGraphics
import QuartzCore
import Foundation
import RealityKit

/// Brett mit echter Grafik (CHAOS-142) und Brett-Regie (CHAOS-143): Kulisse `brett.usdz`, Gras- und Blumen-Instanzen,
/// Figuren als USDZ auf Sockeln, Sonne und Himmelslicht wie im Babylon-Host. Was sich bewegt, liefert die Regie des
/// Browser-Hosts im JS-Kern (`renderState().board`): Hüpfen und Fliegen der Figuren, Popups, Kameraziel, Trophäen,
/// Fallen und Klänge. Hier wird nur gezeichnet, nachgebaut aus `apps/host/src/board/createBoardScene.ts`.
/// Assets aus `pnpm build:apple-assets` (CHAOS-140, `docs/apple-assets.md`), von `prepare.sh` nach `payload/szene/`; je Brett
/// eine Kulisse unter `bretter/<brett-id>/` (CHAOS-212), welche gerade gilt, entscheidet `Stage`.
///
/// Koordinaten: `brett.usdz` ist rechtshändig wie RealityKit und entsteht aus Babylon mit `(x, y, z) → (-x, y, z)`
/// (`apps/host/src/export/boardExport.ts`). Die Figuren stehen darum auf den Feld-Ankern `feld_<id>` des Bretts;
/// nur der Versatz zur Feldmitte (Babylon-Koordinaten aus `renderState`) wird gespiegelt, ebenso Blickrichtungen.
///
/// Der Export enthält Teile des Beispiel-Spielstands (Pokale auf s12/s24, eine Falle, Pfeil und Ring am Zug). Sie
/// werden beim Laden abgenommen und dienen als Vorlagen: Pokale und Fallen entstehen je nach `trophySpaces`/`traps`.
@MainActor
final class BoardScene {
    /// Brett-ID aus `brett.szene.json` (`board`), gleich dem Ordnernamen unter `bretter/`.
    let boardId: String
    let root = Entity()
    let camera = PerspectiveCamera()
    let sky: EnvironmentResource?
    let skyExponent: Float
    let clearColor: CGColor
    let instances: Int
    /// Neues Brett-Ereignis im Bild (Popup-Art, Flug, Rückenwind, Sabotage), für Ereignis-Bilder (`--ereignisbild`).
    var onEvent: ((String) -> Void)?

    private let anchors: [String: SIMD3<Float>]
    /// Figurenbibliothek (CHAOS-191), geteilt mit Minispiel und Podest.
    private let figures: [String: FigureModel]
    /// Höhe der Feldoberfläche (Anker), falls ein Feld fehlt.
    private let surfaceY: Float
    /// Brettmitte in Babylon-Koordinaten (wie `boardBounds` im Babylon-Host): Blickpunkt der Lobby-Übersicht.
    private var center: SIMD2<Float>
    private var focus: SIMD2<Float>?
    private var pawns: [Int: Pawn] = [:]
    private var missingAnchors = Set<String>()
    private let popups = PopupLayer()
    private let sounds = BoardSounds()
    private var time: Double = 0
    /// Popups, auf die eine Figur schon reagiert hat bzw. die schon gemeldet sind.
    private var reacted = Set<Int>()
    private var announced = Set<Int>()
    private var tailwindShown = false
    private var noticeShown = false

    private let trophyTemplate: Entity?
    private let trapTemplate: Entity?
    private var trophies: [String: Entity] = [:]
    private var traps: [String: Entity] = [:]
    private let activeRing: Entity?
    private let activeArrow: ModelEntity?
    /// Lichtstimmung je Runde und Laternen (CHAOS-193, `app/SceneLight.swift`).
    let sceneLight: SceneLight
    private let lanterns: LanternRig
    /// Windringe und Tausch-Ring (CHAOS-193, `app/BoardFlightFx.swift`).
    private let flightFx = BoardFlightFx()
    /// Grashalme des Bretts als Vorlage für die Minispiel-Kulisse (CHAOS-193).
    let grass: [GrassTemplate]

    // Lobby-Übersicht wie `BASE_OFFSET` in `apps/host/src/board/camera.ts`; im Spiel kommt die Pose aus der Regie.
    private static let cameraOffset = SIMD3<Float>(0, 28, -17.5)
    private static let cameraAimZ: Float = -1.6
    private static let cameraHalfLife: Double = 0.7
    private static let turnHalfLife: Double = 0.09
    private static let characterScale: Float = 1.3
    /// Blick zur Kamera (Figur schaut nach +z, die Kamera steht bei -z).
    private static let faceCamera = Float.pi
    /// Im Stand lehnt sich die Figur zur hoch stehenden Kamera zurück (`STAND_TILT`), im Windstoß nach vorn.
    private static let standTilt: Float = -0.32
    private static let gustTilt: Float = 0.4
    /// Ereignisse für Bilder: Popup-Art → Name.
    private static let eventNames = ["coins": "muenzen", "dice": "wuerfel", "item": "item", "trap": "falle", "trophy": "trophaee",
                                     "event": "ereignis", "shield": "schild", "steal": "klau"]

    private struct Pawn {
        let root: Entity
        /// Drehknoten der Figur (Blickrichtung und Neigung), auf dem Sockel.
        let facing: Entity
        let figure: Entity
        let symbol: Entity
        let character: String
        var yaw: Float
        var tilt: Float
        var animation = ""
        /// Einmal-Clip (Reaktion, Flug) läuft bis dahin.
        var oneShotUntil: Double = 0
        var flying: String?
        var connected = true
    }

    private init(root board: Entity, meta: SceneMeta, anchors: [String: SIMD3<Float>], figures: [String: FigureModel],
                 sky: EnvironmentResource?, instances: Int, grass: [GrassTemplate]) {
        boardId = meta.board ?? Stage.defaultBoardId
        self.anchors = anchors
        self.grass = grass
        self.figures = figures
        self.sky = sky
        self.instances = instances
        surfaceY = anchors.values.first?.y ?? 0.3
        let exponent = log2(max(meta.sky?.intensity ?? 0.35, 0.01) * 2.5)
        skyExponent = exponent
        let c = meta.clearColor
        let background = CGColor(red: CGFloat(c[0]), green: CGFloat(c[1]), blue: CGFloat(c[2]), alpha: 1)
        clearColor = background
        // Brettmitte aus den Feldern (Babylon: x gespiegelt).
        let xs = meta.fields.map { -$0.position[0] }, zs = meta.fields.map { $0.position[2] }
        center = xs.isEmpty ? .zero : [(xs.min()! + xs.max()!) / 2, (zs.min()! + zs.max()!) / 2]
        // Teile des Beispiel-Spielstands abnehmen; der erste Pokal und die erste Falle werden Vorlagen.
        trophyTemplate = Self.detach(from: board, prefix: "pokal_s", anchors: anchors)
        trapTemplate = Self.detach(from: board, prefix: "falle_s", anchors: anchors)
        _ = Self.detach(from: board, prefix: "am_zug_pfeil", anchors: anchors)
        activeRing = board.findEntity(named: "am_zug_ring")
        activeRing?.isEnabled = false
        activeArrow = CardTexture.arrow().map { billboard($0, size: [BoardLook.arrowSize, BoardLook.arrowSize], name: "am-zug-pfeil") }
        // Ohne Stimmung (Lobby): Sonne aus dem Export, Babylon-Intensität auf Lux (CHAOS-112/119). Die Stimmung der
        // Runde setzt `sceneLight` je Bild (CHAOS-193).
        let sun = meta.sun ?? SceneMeta.Sun(direction: [-0.5456, -0.6825, 0.4863], intensity: 3.4, color: [1, 0.98, 0.94])
        sceneLight = SceneLight(direction: vec(sun.direction), intensity: sun.intensity * SceneLight.luxPerUnit,
                                color: .init(red: CGFloat(sun.color[0]), green: CGFloat(sun.color[1]), blue: CGFloat(sun.color[2]), alpha: 1),
                                shadowDistance: 80, ambientScale: SceneLight.boardAmbient, keyScale: SceneLight.keyScale,
                                environment: sky, exponent: exponent,
                                background: background)
        // Laternen-Glas aus dem Export (`lantern` in `apps/host/src/nature/geometry.ts`).
        var glass: [Entity] = []
        var stack = [board]
        while let entity = stack.popLast() {
            let name = entity.name.lowercased()
            if name.hasPrefix("laterne_glas") || name.hasPrefix("laterne-glas"),
               let model = Self.find(in: entity, where: { $0.components.has(ModelComponent.self) }) {
                glass.append(model)
            } else {
                stack += entity.children
            }
        }
        lanterns = LanternRig(glass: glass)
        root.addChild(board)
        root.addChild(popups.root)
        root.addChild(flightFx.root)
        root.addChild(sceneLight.sun)
        root.addChild(lanterns.root)
        if let activeArrow {
            activeArrow.isEnabled = false
            root.addChild(activeArrow)
        }
        camera.camera.fieldOfViewInDegrees = meta.camera.fovY * 180 / .pi
        camera.camera.fieldOfViewOrientation = .vertical
        camera.camera.near = meta.camera.near
        camera.camera.far = meta.camera.far
        root.addChild(camera)
        placeCamera(dt: 0, target: center)
    }

    /// Nimmt alle Knoten `<prefix><feld>` aus dem Brett; liefert den ersten als Vorlage, Lage relativ zu seinem Feld-Anker.
    private static func detach(from board: Entity, prefix: String, anchors: [String: SIMD3<Float>]) -> Entity? {
        var found: [Entity] = []
        var stack = [board]
        while let entity = stack.popLast() {
            if entity.name.hasPrefix(prefix) { found.append(entity) } else { stack += entity.children }
        }
        var template: Entity?
        for entity in found {
            // Weltlage übernehmen: Der Export hängt unter einem gedrehten Knoten (z oben).
            let world = entity.transformMatrix(relativeTo: nil)
            entity.removeFromParent()
            guard template == nil else { continue }
            entity.setTransformMatrix(world, relativeTo: nil)
            // `pokal_s12` → Feld s12, `falle_s15_2` → Feld s15.
            let field = entity.name.dropFirst(prefix.count - 1).split(separator: "_").first.map(String.init) ?? ""
            entity.position -= anchors[field] ?? entity.position
            template = entity
        }
        return template
    }

    /// Asset-Ordner mit `figuren/` und `bretter/<brett-id>/` (CHAOS-212); gilt, wenn das Standardbrett darin liegt.
    static func assetFolder(override: String?) -> URL? {
        let candidates = [override.map { URL(fileURLWithPath: $0) },
                          Bundle.main.url(forResource: "payload", withExtension: nil)?.appending(path: "szene")].compactMap { $0 }
        return candidates.first { boardFolder(in: $0, id: Stage.defaultBoardId) != nil }
    }

    /// Ordner der Kulisse eines Bretts (`brett.usdz`, `brett.szene.json`, `brett.instanzen.json`) oder `nil`, wenn sie fehlt.
    static func boardFolder(in root: URL, id: String) -> URL? {
        // Brett-IDs sind `[a-z0-9-]` (game-core `validateBoard`); alles andere nie als Pfad benutzen.
        guard !id.isEmpty, id.allSatisfy({ $0.isLowercase || $0.isNumber || $0 == "-" }), id.allSatisfy(\.isASCII) else { return nil }
        let folder = root.appending(path: "bretter").appending(path: id)
        return FileManager.default.fileExists(atPath: folder.appending(path: "brett.szene.json").path) ? folder : nil
    }

    /// `folder`: Kulisse eines Bretts (`boardFolder`). `figures`: die Figurenbibliothek (`FigureModel.loadAll`), einmal geladen
    /// für alle Szenen (CHAOS-191).
    static func load(from folder: URL, figures: [String: FigureModel]) async throws -> BoardScene {
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
        let (instances, grass) = try await addInstances(to: board, from: folder.appending(path: "brett.instanzen.json"))

        let sky = try? await EnvironmentResource(equirectangular: hemisphereImage(
            sky: meta.sky?.color ?? [0.83, 0.9, 0.96], ground: meta.sky?.ground ?? meta.sky?.color ?? [0.49, 0.54, 0.32]))
        let scene = BoardScene(root: board, meta: meta, anchors: anchors, figures: figures, sky: sky, instances: instances, grass: grass)
        hostLog(String(format: "Brett %@ geladen: %d Felder, %d Figuren, %d Instanzen in %.0f ms", scene.boardId,
                       anchors.count, figures.count, instances, (CACurrentMediaTime() - t0) * 1000))
        return scene
    }

    /// Lobby: Übersicht ohne Figuren.
    func showOverview(dt: Double) {
        sceneLight.reset()
        lanterns.apply(nil)
        flightFx.clear()
        for (_, pawn) in pawns { pawn.root.removeFromParent() }
        pawns.removeAll()
        sync(trophies: [])
        sync(traps: [], colors: [:])
        popups.update([], camera: camera.orientation) { _ in nil }
        activeRing?.isEnabled = false
        activeArrow?.isEnabled = false
        sounds.reset()
        reacted.removeAll()
        announced.removeAll()
        placeCamera(dt: dt, target: center)
    }

    /// Ein Bild des Bretts nach der Regie: Figuren auf ihren Bahnen, Popups, Marker, Kamera, Klänge.
    func apply(_ board: RenderState.Board, players: [RenderState.Player], dt: Double) {
        time += dt
        let spaces = Dictionary((board.spaces ?? []).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let colors = Dictionary(players.map { ($0.slot, $0.color ?? "") }, uniquingKeysWith: { a, _ in a })
        var seen = Set<Int>()
        for p in board.pawns ?? [] {
            seen.insert(p.slot)
            let target = position(of: p, spaces: spaces)
            let character = p.character ?? "robot"
            if let pawn = pawns[p.slot], pawn.character != character {
                pawn.root.removeFromParent()
                pawns[p.slot] = nil
            }
            if pawns[p.slot] == nil {
                guard let made = makePawn(slot: p.slot, character: character, color: colors[p.slot] ?? "", at: target) else { continue }
                pawns[p.slot] = made
            }
            pose(slot: p.slot, p, at: target, dt: dt)
        }
        for slot in pawns.keys where !seen.contains(slot) {
            pawns[slot]?.root.removeFromParent()
            pawns[slot] = nil
        }
        let popupList = board.popups ?? []
        react(to: popupList)

        let activeSlot = board.hud?.players?.first { $0.active == true }?.slot
        if let pose = board.camera, pose.pos.count == 3, pose.target.count == 3 {
            setCamera(pose)
        } else {
            placeCamera(dt: dt, target: center)
        }
        let facingCamera = camera.orientation(relativeTo: nil)
        syncActive(activeSlot.flatMap { pawns[$0] }, camera: facingCamera)
        sync(trophies: board.trophySpaces ?? [])
        sync(traps: board.traps ?? [], colors: colors)
        popups.update(popupList, camera: facingCamera) { [anchors, pawns] popup in
            if let slot = popup.slot { return pawns[slot]?.root.position(relativeTo: nil) }
            return popup.spaceId.flatMap { anchors[$0] }
        }
        sounds.play(board.sounds ?? [])
        sceneLight.apply(board.light)
        lanterns.apply(board.light)
        flightFx.update(board.pawns ?? [], colors: colors, anchors: anchors, surfaceY: surfaceY) { [pawns] slot in pawns[slot]?.root }
        announce(board, popups: popupList)
    }

    /// Feld-Anker plus gespiegelter Versatz (mehrere Figuren auf einem Feld, Bahn beim Hüpfen und Fliegen) plus Höhe.
    private func position(of pawn: RenderState.Pawn, spaces: [String: RenderState.Space]) -> SIMD3<Float> {
        let lift = pawn.y ?? 0
        if let id = pawn.spaceId, let anchor = anchors[id], let space = spaces[id] {
            return anchor + SIMD3(-(pawn.x - space.x), lift, pawn.z - space.z)
        }
        let key = pawn.spaceId ?? "–"
        if !missingAnchors.contains(key) {
            missingAnchors.insert(key)
            hostLog("FEHLER kein Feld-Anker für \(key) – Figur nach renderState-Koordinaten")
        }
        return SIMD3(-pawn.x, surfaceY + lift, pawn.z)
    }

    private func makePawn(slot: Int, character: String, color: String, at position: SIMD3<Float>) -> Pawn? {
        guard let template = figures[character] ?? figures.values.first else { return nil }
        let pawnRoot = Entity()
        pawnRoot.name = "figur-\(slot)"
        pawnRoot.position = position
        let slotColor = color.isEmpty ? "#cccccc" : color
        pawnRoot.addChild(PawnParts.base(color: slotColor))
        let facing = Entity()
        facing.position.y = BoardLook.pawnLift
        let figure = template.instance(color: color, character: character)
        figure.scale = SIMD3(repeating: Self.characterScale)
        facing.addChild(figure)
        pawnRoot.addChild(facing)
        let symbol = PawnParts.symbol(slot: slot, color: slotColor)
        symbol.position.y = BoardLook.symbolY
        pawnRoot.addChild(symbol)
        root.addChild(pawnRoot)
        var pawn = Pawn(root: pawnRoot, facing: facing, figure: figure, symbol: symbol, character: character,
                        yaw: Self.faceCamera, tilt: Self.standTilt)
        facing.orientation = Self.orientation(yaw: pawn.yaw, tilt: pawn.tilt)
        play(&pawn, "idle")
        return pawn
    }

    /// Lage und Haltung je Bild wie `syncPawns`: im Flug direkt nach der Regie (samt Drehung), beim Hüpfen in
    /// Laufrichtung, im Stand zur Kamera und leicht zurückgelehnt.
    private func pose(slot: Int, _ p: RenderState.Pawn, at target: SIMD3<Float>, dt: Double) {
        guard var pawn = pawns[slot] else { return }
        pawn.root.position = target
        let factor = Float(dt <= 0 ? 0 : 1 - pow(0.5, dt / Self.turnHalfLife))
        if let hop = p.hop, hop.style != "walk" {
            pawn.yaw = -(p.heading ?? 0)
            pawn.tilt = hop.style == "gust" ? Self.gustTilt : 0
            if pawn.flying != hop.style {
                pawn.flying = hop.style
                playOnce(&pawn, hop.style == "gust" ? "fall" : "jump")
                onEvent?(hop.style == "gust" ? "windstoss" : "platztausch")
            }
        } else if p.hop != nil {
            pawn.flying = nil
            turn(&pawn, to: p.heading.map { -$0 } ?? pawn.yaw, tilt: 0, factor: factor)
            play(&pawn, "run")
        } else {
            pawn.flying = nil
            turn(&pawn, to: Self.faceCamera, tilt: Self.standTilt, factor: factor)
            if pawn.animation == "run" || (time >= pawn.oneShotUntil && pawn.animation != "idle") { play(&pawn, "idle") }
        }
        pawn.facing.orientation = Self.orientation(yaw: pawn.yaw, tilt: pawn.tilt)
        // Symbol schwebt leicht (wie `SYMBOL_Y + 0.06 * sin(simMs / 300 + slot)`).
        pawn.symbol.position.y = BoardLook.symbolY + 0.06 * Float(sin(time * 1000 / 300 + Double(slot)))
        let connected = p.connected ?? true
        if connected != pawn.connected {
            pawn.connected = connected
            if connected { pawn.root.components.remove(OpacityComponent.self) } else { pawn.root.components.set(OpacityComponent(opacity: 0.35)) }
        }
        pawns[slot] = pawn
    }

    private func turn(_ pawn: inout Pawn, to heading: Float, tilt: Float, factor: Float) {
        var delta = (heading - pawn.yaw).truncatingRemainder(dividingBy: 2 * .pi)
        if delta > .pi { delta -= 2 * .pi }
        if delta < -.pi { delta += 2 * .pi }
        pawn.yaw += delta * factor
        pawn.tilt += (tilt - pawn.tilt) * factor
    }

    private static func orientation(yaw: Float, tilt: Float) -> simd_quatf {
        simd_quatf(angle: yaw, axis: [0, 1, 0]) * simd_quatf(angle: tilt, axis: [1, 0, 0])
    }

    /// Reaktion der Figur auf ein neues Popup über ihr (die Regie liefert `reaction`); während des Hüpfens hat `run` Vorrang.
    private func react(to list: [RenderState.Popup]) {
        let ids = Set(list.map(\.id))
        reacted.formIntersection(ids)
        for popup in list where !reacted.contains(popup.id) {
            reacted.insert(popup.id)
            guard let slot = popup.slot, let reaction = popup.reaction, var pawn = pawns[slot], pawn.animation != "run" else { continue }
            playOnce(&pawn, reaction)
            pawns[slot] = pawn
        }
    }

    /// Meldet neue Ereignisse im Bild (Popup-Art, Rückenwind, Sabotage) für `--ereignisbild`.
    private func announce(_ board: RenderState.Board, popups list: [RenderState.Popup]) {
        guard let onEvent else { return }
        announced.formIntersection(Set(list.map(\.id)))
        for popup in list where !announced.contains(popup.id) {
            announced.insert(popup.id)
            onEvent(Self.eventNames[popup.kind] ?? popup.kind)
        }
        let tailwind = board.hud?.tailwind != nil
        if tailwind, !tailwindShown { onEvent("rueckenwind") }
        tailwindShown = tailwind
        let notice = board.notice != nil
        if notice, !noticeShown { onEvent("sabotage") }
        noticeShown = notice
    }

    private func play(_ pawn: inout Pawn, _ name: String) {
        guard pawn.animation != name, figures[pawn.character]?.play(name, on: pawn.figure, transition: 0.2, fallback: false) == true else { return }
        pawn.animation = name
    }

    /// Einmal-Clip (Reaktion, Flug); danach geht die Figur im Stand zurück zu `idle`.
    private func playOnce(_ pawn: inout Pawn, _ name: String) {
        guard let model = figures[pawn.character], model.play(name, on: pawn.figure, fallback: false) else { return }
        pawn.animation = name
        pawn.oneShotUntil = time + (model.durations[name] ?? 0.8)
    }

    /// Ring am Boden und Pfeil über dem Kopf des Spielers am Zug (`syncActive`).
    private func syncActive(_ pawn: Pawn?, camera facing: simd_quatf) {
        guard let pawn else {
            activeRing?.isEnabled = false
            activeArrow?.isEnabled = false
            return
        }
        let p = pawn.root.position
        activeRing?.isEnabled = true
        activeRing?.setPosition(SIMD3(p.x, surfaceY + 0.04, p.z), relativeTo: nil)
        activeArrow?.isEnabled = true
        activeArrow?.position = SIMD3(p.x, p.y + BoardLook.pawnHeight + BoardLook.arrowAbove + BoardLook.arrowBob * Float(sin(time * 1000 / 180)), p.z)
        activeArrow?.orientation = facing
    }

    /// Pokal je Trophäenfeld, dreht sich und schwebt (`syncTrophies`).
    private func sync(trophies active: [String]) {
        let wanted = Set(active)
        for (id, node) in trophies where !wanted.contains(id) {
            node.removeFromParent()
            trophies[id] = nil
        }
        guard let template = trophyTemplate else { return }
        for id in active {
            guard let anchor = anchors[id] else { continue }
            let node = trophies[id] ?? {
                let made = template.clone(recursive: true)
                made.name = "pokal-\(id)"
                root.addChild(made)
                trophies[id] = made
                return made
            }()
            node.position = SIMD3(anchor.x + template.position.x, anchor.y + 0.15 + 0.08 * Float(sin(time * 1000 / 400)), anchor.z + template.position.z)
            node.orientation = simd_quatf(angle: -Float(time * 1000 / 900), axis: [0, 1, 0]) * template.orientation
        }
    }

    /// Versteckte Fallen, Mitte in Besitzerfarbe (`syncTraps`).
    private func sync(traps list: [RenderState.Trap], colors: [Int: String]) {
        let wanted = Dictionary(list.map { ("\($0.spaceId)|\($0.owner)", $0) }, uniquingKeysWith: { a, _ in a })
        for (key, node) in traps where wanted[key] == nil {
            node.removeFromParent()
            traps[key] = nil
        }
        guard let template = trapTemplate else { return }
        for (key, trap) in wanted where traps[key] == nil {
            guard let anchor = anchors[trap.spaceId] else { continue }
            let node = template.clone(recursive: true)
            node.name = "falle-\(key)"
            node.position = anchor + template.position
            if let center = node.findEntity(named: "falle_mitte"), var model = Self.find(in: center, where: { $0.components.has(ModelComponent.self) })?
                .components[ModelComponent.self] {
                let color = colors[trap.owner].flatMap { $0.isEmpty ? nil : $0 } ?? "#cccccc"
                model.materials = model.materials.map { _ in PawnParts.paint(color, glow: true) }
                Self.find(in: center, where: { $0.components.has(ModelComponent.self) })?.components.set(model)
            }
            root.addChild(node)
            traps[key] = node
        }
    }

    /// Pose aus der gemeinsamen Kamera-Regie (`apps/host/src/board/camera.ts`, CHAOS-194), schon nachgezogen.
    private func setCamera(_ pose: RenderState.Camera) {
        // Babylon → Brett: x spiegeln.
        let eye = SIMD3<Float>(-pose.pos[0], pose.pos[1], pose.pos[2])
        let target = SIMD3<Float>(-pose.target[0], pose.target[1], pose.target[2])
        camera.look(at: target, from: eye, relativeTo: nil)
        // Übergang zur Lobby-Übersicht startet hier.
        focus = SIMD2(pose.target[0], pose.target[2] - Self.cameraAimZ)
    }

    /// Lobby: Übersicht auf die Brettmitte, exponentiell nachgezogen.
    private func placeCamera(dt: Double, target: SIMD2<Float>) {
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

    // MARK: Laden

    /// Babylon-Thin-Instances (Gras, Blumen) als `MeshInstancesComponent`: ein Draw je Mesh-Teil.
    /// Liefert die Zahl der Instanzen und die Grashalme (`gras-*`) als Vorlage für die Minispiel-Kulisse (CHAOS-193).
    private static func addInstances(to board: Entity, from url: URL) async throws -> (Int, [GrassTemplate]) {
        guard FileManager.default.fileExists(atPath: url.path) else { hostLog("FEHLER brett.instanzen.json fehlt"); return (0, []) }
        let list = try await Task.detached { try JSONDecoder().decode([InstancedMesh].self, from: Data(contentsOf: url)) }.value
        var total = 0
        var grass: [GrassTemplate] = []
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
            if key.hasPrefix("gras") { grass.append(GrassTemplate(model: component, local: local)) }
        }
        return (total, grass)
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
    /// Brett-ID (CHAOS-212); fehlt in Exporten vor `version` 2.
    let board: String?
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
