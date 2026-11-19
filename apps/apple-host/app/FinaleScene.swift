import CoreGraphics
import CoreText
import Foundation
import QuartzCore
import RealityKit
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Siegerpodest (CHAOS-145) wie `apps/host/src/finale/podiumStage.ts`: Holzblöcke in Gold, Silber, Bronze und Lila,
/// Höhe nach Platz (geteilte Plätze gleich hoch), Deckel in Slot-Farbe, Platzziffer vorn, darauf die Figuren als USDZ.
/// Platz 1 jubelt, der letzte schmollt, die anderen hüpfen, alle 2,6 s erneut, mit Konfetti über dem Sieger. Natur bei
/// Nacht: Insel aus der Minispiel-Kulisse, Mondlicht und ein warmer Spot von vorn oben.
///
/// Aufstellung (x, Höhe, Clip) kommt aus dem JS-Kern (`renderState().final.podium`, `podiumLayout.ts`); hier wird
/// nur gebaut und gezeichnet. Babylon-Koordinaten: z spiegeln, die Kamera steht in RealityKit bei +z.
@MainActor
final class PodiumScene {
    let root = Entity()
    let camera = PerspectiveCamera()
    let sky: EnvironmentResource?
    let skyExponent: Float = 0
    /// Nachthimmel wie `.finale--winner` im Browser-Host.
    let clearColor = CGColor(red: 0x1e / 255, green: 0x27 / 255, blue: 0x42 / 255, alpha: 1)

    private let world = Entity()
    /// Kulisse der Lichtung (hält Laternen und Texturen am Leben).
    private var backdropView: MinigameBackdrop?
    private let models: [String: FigureModel]
    private let sounds = BoardSounds()
    private var key = ""
    private var figures: [(entry: RenderState.PodiumEntry, entity: Entity)] = []
    private var cheerTimer: Double = 0
    private var shown = false
    /// Abgebautes, das der Render-Thread womöglich noch benutzt (wie `MinigameScene.reset`).
    private var retired: [(at: CFTimeInterval, objects: [AnyObject])] = []
    private var confetti: [(entity: ModelEntity, velocity: SIMD3<Float>, age: Float, life: Float)] = []
    private var confettiMaterials: [String: RealityKit.Material] = [:]
    private let confettiMesh = MeshResource.generateBox(width: 1, height: 0.15, depth: 1)

    /// `CHARACTER_SCALE` und `CHEER_EVERY_MS` aus `podiumStage.ts`.
    private static let characterScale: Float = 1.5
    private static let cheerEvery: Double = 2.6
    private static let fov: Float = 0.62
    /// Rechts liegt der Endstand (`FinaleOverlay`): Das Podest steht mittig in der linken Bildfläche.
    static let panelShare: Float = 640 / 1920

    init(models: [String: FigureModel]) {
        self.models = models
        sky = try? EnvironmentResource(equirectangular: hemisphereImage(sky: [0.2, 0.26, 0.45], ground: [0.12, 0.16, 0.1]))
        root.addChild(world)
        camera.camera.fieldOfViewInDegrees = Self.fov * 180 / .pi
        camera.camera.fieldOfViewOrientation = .vertical
        camera.camera.near = 0.5
        camera.camera.far = 500
        root.addChild(camera)
        // Mondlicht von schräg hinten oben (bläulich), dazu der Spot aufs Podest.
        let moon = DirectionalLight()
        moon.light.color = .init(red: 0.7, green: 0.78, blue: 1, alpha: 1)
        moon.light.intensity = 2600
        var shadow = DirectionalLightComponent.Shadow()
        shadow.shadowProjection = .automatic(maximumDistance: 30)
        moon.shadow = shadow
        moon.look(at: .zero, from: [-4, 10, -6], relativeTo: nil)
        root.addChild(moon)
        let spot = SpotLight()
        spot.light.color = .init(red: 1, green: 0xe3 / 255, blue: 0xbd / 255, alpha: 1)
        spot.light.intensity = 260_000
        spot.light.innerAngleInDegrees = 40
        spot.light.outerAngleInDegrees = 70
        spot.light.attenuationRadius = 30
        spot.shadow = SpotLightComponent.Shadow()
        spot.look(at: [0, 1.2, 0], from: [0, 9, 7], relativeTo: nil)
        root.addChild(spot)
    }

    /// Ein Bild des Finales: Podest bei Bedarf neu bauen (andere Aufstellung), Jubel-Takt, Konfetti, Klänge.
    /// `visible`: Siegerbildschirm (vorher steht das Podest schon, unsichtbar, wie im Browser-Host).
    func apply(_ final: RenderState.Final, visible: Bool, dt: Double) {
        let entries = final.podium ?? []
        let key = entries.map { "\($0.slot):\($0.place):\($0.character ?? ""):\($0.color ?? "")" }.joined(separator: ",")
        if key != self.key { build(entries, key: key) }
        sounds.play(final.sounds ?? [])
        if visible, !shown {
            cheerTimer = 0
            celebrate()
        }
        shown = visible
        guard visible else { return }
        cheerTimer += dt
        if cheerTimer >= Self.cheerEvery {
            cheerTimer = 0
            celebrate()
        }
        moveConfetti(dt: Float(min(dt, 0.1)))
    }

    /// Finale vorbei (Revanche): beim nächsten Finale neu bauen, Klang-IDs zählen dort wieder ab 1.
    func leave() {
        key = ""
        shown = false
        sounds.reset()
    }

    /// Kamera so weit weg, dass alle Blöcke samt Figuren in die linke Bildfläche passen (`placeCamera`).
    func placeCamera(aspect: Float) {
        let xs = figures.map(\.entry.x)
        let halfWidth = ((xs.max() ?? 0) - (xs.min() ?? 0)) / 2 + 1.7
        let visible = 1 - Self.panelShare
        let tanH = tan(Self.fov / 2) * max(0.5, aspect)
        let distance = max(9.5, halfWidth / (visible * tanH))
        // Mitte der linken Fläche liegt bei −panelShare (Bildbreite −1…1): Kamera nach rechts schieben.
        let shift = Self.panelShare * distance * tanH
        camera.look(at: [shift, 1.85, 0], from: [shift, 2.2 + distance * 0.11, distance], relativeTo: nil)
    }

    // MARK: Aufbau

    private func build(_ entries: [RenderState.PodiumEntry], key: String) {
        let now = CACurrentMediaTime()
        retired.removeAll { now - $0.at > 3 }
        retired.append((now, Array(world.children) + confetti.map(\.entity)))
        for child in Array(world.children) { child.removeFromParent() }
        figures.removeAll()
        confetti.removeAll()
        self.key = key
        guard !entries.isEmpty else { return }
        let xs = entries.map(\.x)
        let halfX = ((xs.max() ?? 0) - (xs.min() ?? 0)) / 2 + 1.6
        // Lichtung auf der Insel: frei und eben unter dem Podest (`look.backdrop`).
        // Nacht wie `SCENE_MOODS.finale`: Laternen leuchten, Wiese und Kuppel gehen in Nachtdunst über (CHAOS-193).
        let backdrop = MinigameBackdrop(area: RenderState.Backdrop(halfX: halfX, halfZ: 1.6, groundY: 0, surface: "wiese"), grass: [])
        backdrop.apply(.fixedNight)
        world.addChild(backdrop.root)
        backdropView = backdrop
        for entry in entries {
            let top = buildBlock(entry)
            let figure = models[entry.character ?? "robot"]?.instance(color: entry.color ?? "", character: entry.character ?? "robot")
                ?? Self.capsule(color: entry.color ?? "#cccccc")
            figure.position = top
            figure.scale = SIMD3(repeating: Self.characterScale)
            world.addChild(figure)
            figures.append((entry, figure))
        }
        placeCamera(aspect: 16 / 9)
        hostLog("Podest gebaut: \(entries.count) Plätze")
    }

    /// Sockel aus Stein, Holzblock im Farbton des Platzes, Deckel in Slot-Farbe, Platzziffer vorn (`buildBlock`).
    private func buildBlock(_ entry: RenderState.PodiumEntry) -> SIMD3<Float> {
        let block = Entity()
        block.name = "podest-\(entry.slot)"
        block.position = [entry.x, 0, 0]
        let h = entry.height
        let foot = ModelEntity(mesh: .generateBox(width: 2.1, height: 0.14, depth: 2.1, cornerRadius: 0.03),
                               materials: [MinigameBackdrop.plain("#8c8f86", roughness: 0.95)])
        foot.position.y = 0.05
        var wood = PhysicallyBasedMaterial()
        wood.baseColor = .init(tint: platformColor(entry.blockColor ?? "#cfc6f2"))
        wood.roughness = 0.7
        let body = ModelEntity(mesh: .generateBox(width: 1.9, height: h, depth: 1.9, cornerRadius: 0.04), materials: [wood])
        body.position.y = h / 2 + 0.1
        var lidPaint = PawnParts.paint(entry.color ?? "#cccccc", glow: true)
        lidPaint.emissiveIntensity = 0.25
        let lid = ModelEntity(mesh: .generateBox(width: 2.0, height: 0.14, depth: 2.0, cornerRadius: 0.04), materials: [lidPaint])
        lid.position.y = h + 0.14
        for part in [foot, body, lid] { block.addChild(part) }
        if let texture = PodiumNumber.texture(entry.place) {
            var material = UnlitMaterial(texture: texture)
            material.blending = .transparent(opacity: .init(floatLiteral: 1))
            let size = min(1.2, h * 0.92)
            let number = ModelEntity(mesh: .generatePlane(width: size, height: size), materials: [material])
            // Babylon: vorn bei z = −0,97 (zur Kamera); RealityKit: +z.
            number.position = [0, h / 2 + 0.12, 0.97]
            block.addChild(number)
        }
        world.addChild(block)
        return [entry.x, h + 0.21, 0]
    }

    // MARK: Jubel und Konfetti

    private func celebrate() {
        for (entry, entity) in figures {
            models[entry.character ?? "robot"]?.play(entry.anim ?? "jump", on: entity)
            if entry.place == 1 { burst(at: entity.position + [0, 2.2, 0]) }
        }
    }

    private func burst(at origin: SIMD3<Float>) {
        let preset = MinigameEffects.preset(kind: "confetti", color: nil)
        for index in 0..<(preset.count * 2) where confetti.count < 200 {
            let hex = preset.colors[index % preset.colors.count]
            let material = confettiMaterials[hex] ?? {
                let made = UnlitMaterial(color: platformColor(hex))
                confettiMaterials[hex] = made
                return made
            }()
            let entity = ModelEntity(mesh: confettiMesh, materials: [material])
            entity.position = origin
            entity.scale = SIMD3(repeating: preset.size * 1.6)
            entity.orientation = simd_quatf(angle: Float.random(in: 0...(2 * .pi)), axis: simd_normalize(SIMD3(Float.random(in: -1...1), 1, Float.random(in: -1...1))))
            world.addChild(entity)
            let direction = simd_normalize(SIMD3<Float>(Float.random(in: -1...1), Float.random(in: 0.3...1.3), Float.random(in: -1...1)))
            confetti.append((entity, direction * preset.speed * Float.random(in: 0.6...1), 0, preset.life * 1.5 * Float.random(in: 0.7...1)))
        }
    }

    private func moveConfetti(dt: Float) {
        guard !confetti.isEmpty else { return }
        var alive: [(entity: ModelEntity, velocity: SIMD3<Float>, age: Float, life: Float)] = []
        var removed: [AnyObject] = []
        for var piece in confetti {
            piece.age += dt
            if piece.age >= piece.life {
                piece.entity.removeFromParent()
                removed.append(piece.entity)
                continue
            }
            piece.velocity.y -= 3 * dt
            piece.velocity *= 1 - min(1, 1.2 * dt)
            piece.entity.position += piece.velocity * dt
            piece.entity.orientation = simd_quatf(angle: 4 * dt, axis: [0.3, 1, 0.2]) * piece.entity.orientation
            alive.append(piece)
        }
        if !removed.isEmpty { retired.append((CACurrentMediaTime(), removed)) }
        confetti = alive
    }

    /// Ohne USDZ (`OHNE_ASSETS=1`): Kapsel in Slot-Farbe, Füße bei y = 0.
    private static func capsule(color: String) -> Entity {
        let holder = Entity()
        let body = ModelEntity(mesh: .generateBox(width: 0.8, height: 1.6, depth: 0.8, cornerRadius: 0.4),
                               materials: [SimpleMaterial(color: platformColor(color), isMetallic: false)])
        body.position.y = 0.8
        holder.addChild(body)
        return holder
    }
}

/// Platzziffer wie `plate()` im Browser-Host: weiße, fette, runde Ziffer mit dicker dunkler Kontur, Hintergrund frei.
@MainActor
enum PodiumNumber {
    private static var cache: [Int: TextureResource] = [:]

    static func texture(_ place: Int) -> TextureResource? {
        if let hit = cache[place] { return hit }
        let size = 256
        guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        #if os(macOS)
        let base = NSFont.systemFont(ofSize: 190, weight: .black)
        let font = (base.fontDescriptor.withDesign(.rounded).flatMap { NSFont(descriptor: $0, size: 190) } ?? base) as CTFont
        #else
        let base = UIFont.systemFont(ofSize: 190, weight: .black)
        let font = (base.fontDescriptor.withDesign(.rounded).map { UIFont(descriptor: $0, size: 190) } ?? base) as CTFont
        #endif
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: String(place), attributes: [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(red: 1, green: 1, blue: 1, alpha: 1),
        ]))
        var ascent: CGFloat = 0, descent: CGFloat = 0
        let width = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, nil))
        ctx.textPosition = CGPoint(x: (CGFloat(size) - width) / 2, y: (CGFloat(size) - ascent + descent) / 2)
        ctx.setLineJoin(.round)
        ctx.setLineWidth(22)
        ctx.setStrokeColor(CGColor(red: 0x1b / 255, green: 0x15 / 255, blue: 0x30 / 255, alpha: 1))
        ctx.setTextDrawingMode(.stroke)
        CTLineDraw(line, ctx)
        ctx.textPosition = CGPoint(x: (CGFloat(size) - width) / 2, y: (CGFloat(size) - ascent + descent) / 2)
        ctx.setTextDrawingMode(.fill)
        CTLineDraw(line, ctx)
        guard let image = ctx.makeImage(), let texture = try? TextureResource(image: image, options: .init(semantic: .color))
        else { return nil }
        cache[place] = texture
        return texture
    }
}
