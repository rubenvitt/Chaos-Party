import CoreGraphics
import CoreText
import Foundation
import RealityKit
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Bausteine der Brett-Regie im nativen Host (CHAOS-143), nachgebaut aus `apps/host/src/board/createBoardScene.ts`:
/// Text-Karten als Billboards (Popups, Pfeil über dem Spieler am Zug), Popup-Schicht, Sockel und Slot-Symbol der Figuren.
/// Was gezeigt wird und wann, entscheidet die Regie im JS-Kern; hier wird nur gezeichnet.
enum BoardLook {
    /// Tinte der Umrisse (`INK`).
    static let ink = "#1b1530"
    /// Popup-Farben je Ton (`TONE_COLORS`), Würfel weiß.
    static let tones: [String: (bg: String, fg: String)] = [
        "good": ("#d4f5e6", "#00603f"), "bad": ("#ffe0e0", "#a3161c"), "gold": ("#ffe58a", "#6b4a00"), "neutral": ("#ffffff", ink),
    ]
    /// Pixel je Welt-Einheit der Text-Karten (`PX_PER_UNIT`).
    static let pxPerUnit: Float = 120
    /// Sockel-Radius und Höhe über dem Kopf (`PAWN`): Anker für Pfeil und Popups.
    static let pawnHeight: Float = 2.4
    static let pawnRadius: Float = 0.5
    /// Figur steht auf ihrem Sockel (`PAWN_LIFT`).
    static let pawnLift: Float = 0.12
    /// Schwebendes Slot-Symbol (`SYMBOL_Y`).
    static let symbolY: Float = 2.62
    /// Zug-Pfeil (`ARROW`).
    static let arrowSize: Float = 1.5
    static let arrowAbove: Float = 1.0
    static let arrowBob: Float = 0.15
    /// So lange lebt ein Popup (`POPUP_MS`); nur für das Aufräumen, den Fortschritt liefert die Regie.
    static let popupSeconds = 1.4
    /// Abstand gestapelter Popups (`POPUP_STACK_HEIGHT`, CHAOS-189).
    static let popupStackHeight: Float = 1.4
}

/// Text-Karte als Textur, wie `createLabel`: abgerundet, dicke Kontur, fette runde Schrift.
@MainActor
enum CardTexture {
    private static var cache: [String: (TextureResource, SIMD2<Float>)] = [:]

    static func card(text: String, bg: String, fg: String, border: String = BoardLook.ink, height: Float) -> (TextureResource, SIMD2<Float>)? {
        let key = "\(text)|\(bg)|\(fg)|\(border)|\(height)"
        if let hit = cache[key] { return hit }
        let fontPx = CGFloat((height * BoardLook.pxPerUnit).rounded())
        let font = roundedFont(size: fontPx)
        let attributed = NSAttributedString(string: text, attributes: [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): cgColor(fg),
        ])
        let line = CTLineCreateWithAttributedString(attributed)
        var ascent: CGFloat = 0, descent: CGFloat = 0
        let textWidth = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, nil))
        let padX = (fontPx * 0.45).rounded(), padY = (fontPx * 0.28).rounded()
        let borderPx = max(4, (fontPx * 0.09).rounded())
        let width = Int(ceil(textWidth + 2 * padX + 2 * borderPx))
        let heightPx = Int(ceil(fontPx * 1.15 + 2 * padY + 2 * borderPx))
        guard let ctx = context(width: width, height: heightPx) else { return nil }
        let rect = CGRect(x: borderPx / 2, y: borderPx / 2, width: CGFloat(width) - borderPx, height: CGFloat(heightPx) - borderPx)
        let radius = min(CGFloat(heightPx) / 2, fontPx * 0.5)
        let path = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
        ctx.addPath(path)
        ctx.setFillColor(cgColor(bg))
        ctx.fillPath()
        ctx.addPath(path)
        ctx.setStrokeColor(cgColor(border))
        ctx.setLineWidth(borderPx)
        ctx.strokePath()
        ctx.textPosition = CGPoint(x: (CGFloat(width) - textWidth) / 2, y: (CGFloat(heightPx) - ascent - descent) / 2 + descent - fontPx * 0.03)
        CTLineDraw(line, ctx)
        guard let image = ctx.makeImage(), let texture = texture(image) else { return nil }
        let result = (texture, SIMD2<Float>(Float(width) / BoardLook.pxPerUnit, Float(heightPx) / BoardLook.pxPerUnit))
        cache[key] = result
        return result
    }

    /// Pfeil nach unten über dem Spieler am Zug (`buildActiveMarker`): gelb mit dunkler Kontur.
    static func arrow() -> TextureResource? {
        let size = 128
        guard let ctx = context(width: size, height: size) else { return nil }
        let s = CGFloat(size)
        // CoreGraphics zählt y von unten: Spitze unten heißt kleines y.
        let points: [(CGFloat, CGFloat)] = [(0.32, 0.08), (0.68, 0.08), (0.68, 0.45), (0.9, 0.45), (0.5, 0.92), (0.1, 0.45), (0.32, 0.45)]
        let path = CGMutablePath()
        for (i, p) in points.enumerated() {
            let point = CGPoint(x: p.0 * s, y: (1 - p.1) * s)
            if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        ctx.addPath(path)
        ctx.setFillColor(cgColor("#ffe24a"))
        ctx.fillPath()
        ctx.addPath(path)
        ctx.setLineJoin(.round)
        ctx.setLineWidth(9)
        ctx.setStrokeColor(cgColor(BoardLook.ink))
        ctx.strokePath()
        return ctx.makeImage().flatMap(texture)
    }

    private static func context(width: Int, height: Int) -> CGContext? {
        CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    }

    private static func texture(_ image: CGImage) -> TextureResource? {
        do { return try TextureResource(image: image, options: .init(semantic: .color)) } catch {
            hostLog("FEHLER Text-Textur: \(error)")
            return nil
        }
    }

    private static func roundedFont(size: CGFloat) -> CTFont {
        #if os(macOS)
        let base = NSFont.systemFont(ofSize: size, weight: .black)
        return (base.fontDescriptor.withDesign(.rounded).flatMap { NSFont(descriptor: $0, size: size) } ?? base) as CTFont
        #else
        let base = UIFont.systemFont(ofSize: size, weight: .black)
        return (base.fontDescriptor.withDesign(.rounded).map { UIFont(descriptor: $0, size: size) } ?? base) as CTFont
        #endif
    }
}

func cgColor(_ hex: String) -> CGColor { platformColor(hex).cgColor }

/// Fläche, die immer zur Kamera zeigt (Billboard), mit Textur; über dem Brett gezeichnet (nicht von Bäumen verdeckt).
@MainActor
func billboard(_ texture: TextureResource, size: SIMD2<Float>, name: String) -> ModelEntity {
    // Ohne Tonemapping: Karten in ihren echten Farben wie im Babylon-Host (dort ohne Licht, `disableLighting`).
    var material = UnlitMaterial(applyPostProcessToneMap: false)
    material.color = .init(tint: .white, texture: .init(texture))
    material.blending = .transparent(opacity: .init(floatLiteral: 1))
    material.readsDepth = false
    let entity = ModelEntity(mesh: .generatePlane(width: size.x, height: size.y), materials: [material])
    entity.name = name
    entity.components.set(DynamicLightShadowComponent(castsShadow: false))
    return entity
}

/// Popups über Figuren und Feldern (`syncPopups`): schnell auftauchen, langsam steigen, am Ende ausblenden.
@MainActor
final class PopupLayer {
    let root = Entity()
    private var live: [Int: ModelEntity] = [:]

    /// `anchor`: Weltpunkt der Figur bzw. des Felds (Oberfläche), `nil` = nicht zeigen.
    func update(_ popups: [RenderState.Popup], camera: simd_quatf, anchor: (RenderState.Popup) -> SIMD3<Float>?) {
        var seen = Set<Int>()
        for popup in popups {
            seen.insert(popup.id)
            var entity = live[popup.id]
            if entity == nil {
                let dice = popup.kind == "dice"
                let colors = dice ? (bg: "#ffffff", fg: BoardLook.ink) : (BoardLook.tones[popup.tone] ?? BoardLook.tones["neutral"]!)
                guard let (texture, size) = CardTexture.card(text: popup.text, bg: colors.bg, fg: colors.fg, height: dice ? 1.1 : 0.8)
                else { continue }
                let made = billboard(texture, size: size, name: "popup-\(popup.id)")
                root.addChild(made)
                live[popup.id] = made
                entity = made
            }
            guard let entity else { continue }
            guard let at = anchor(popup) else { entity.isEnabled = false; continue }
            entity.isEnabled = true
            let t = popup.progress
            let pop = min(1, t / 0.12)
            entity.scale = SIMD3(repeating: 0.6 + 0.4 * pop)
            // Gestapelte Popups (CHAOS-189) entlang der Bildschirm-Senkrechten, wie `syncPopups`.
            let stack = camera.act(SIMD3<Float>(0, 1, 0)) * (Float(popup.stack ?? 0) * BoardLook.popupStackHeight)
            entity.position = at + SIMD3(0, BoardLook.pawnHeight + 1.2 + t * 0.9, 0) + stack
            entity.orientation = camera
            entity.components.set(OpacityComponent(opacity: t > 0.75 ? max(0, 1 - (t - 0.75) / 0.25) : 1))
        }
        for (id, entity) in live where !seen.contains(id) {
            entity.removeFromParent()
            live[id] = nil
        }
    }
}

/// Sockel in Slot-Farbe mit dunklem Rand und schwebendes Slot-Symbol (● ▲ ■ ★), wie `createPawn`.
@MainActor
enum PawnParts {
    static func base(color hex: String) -> Entity {
        let root = Entity()
        root.name = "sockel"
        let rim = ModelEntity(mesh: .generateCylinder(height: 0.08, radius: BoardLook.pawnRadius + 0.13), materials: [paint(BoardLook.ink)])
        rim.position.y = 0.04
        let base = ModelEntity(mesh: .generateCylinder(height: 0.12, radius: BoardLook.pawnRadius + 0.08), materials: [paint(hex, glow: true)])
        base.position.y = 0.08
        let ring = ModelEntity(mesh: .generateCylinder(height: 0.02, radius: BoardLook.pawnRadius + 0.05), materials: [paint("#ffffff")])
        ring.position.y = 0.145
        let inner = ModelEntity(mesh: .generateCylinder(height: 0.025, radius: BoardLook.pawnRadius - 0.02), materials: [paint(hex, glow: true)])
        inner.position.y = 0.146
        for part in [rim, base, ring, inner] { root.addChild(part) }
        return root
    }

    static func symbol(slot: Int, color hex: String) -> Entity {
        let material = paint(hex, glow: true)
        let root = Entity()
        root.name = "symbol"
        switch slot {
        case 1:
            root.addChild(ModelEntity(mesh: .generateSphere(radius: 0.13), materials: [material]))
        case 2:
            let cone = ModelEntity(mesh: .generateCone(height: 0.3, radius: 0.16), materials: [material])
            root.addChild(cone)
        case 3:
            root.addChild(ModelEntity(mesh: .generateBox(size: 0.24), materials: [material]))
        default:
            for angle in [Float(0), .pi / 3, -.pi / 3] {
                let bar = ModelEntity(mesh: .generateBox(width: 0.34, height: 0.1, depth: 0.1), materials: [material])
                bar.orientation = simd_quatf(angle: angle, axis: [0, 0, 1])
                root.addChild(bar)
            }
        }
        root.scale = SIMD3(repeating: 1.9)
        return root
    }

    /// Lackiertes Spielmaterial (`material(hex)`: Klarlack, Signalfarben etwas leuchtend).
    static func paint(_ hex: String, glow: Bool = false) -> PhysicallyBasedMaterial {
        var m = PhysicallyBasedMaterial()
        m.baseColor = .init(tint: platformColor(hex))
        m.roughness = 0.4
        m.clearcoat = 0.5
        if glow { m.emissiveColor = .init(color: platformColor(hex)); m.emissiveIntensity = 0.12 }
        return m
    }
}
