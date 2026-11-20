import CoreGraphics
import Foundation
import QuartzCore
import SwiftUI

/// `--ereignisbild=<pfad>` (nur zusammen mit `--bild`, CHAOS-143): Bild je Brett-Ereignis für den Abgleich mit dem
/// Babylon-Host. Kurz nach einem neuen Popup, Flug, Rückenwind oder Sabotage-Ansage wird das 3D-Bild genommen und das
/// HUD (SwiftUI, sonst nicht im Bild) darübergelegt: `<pfad>-<nnn>-<ereignis>.png`, höchstens `perKind` je Ereignisart.
@MainActor
enum EventSnapshots {
    static let perKind = 3
    /// Popup in voller Größe, Flug etwa in der Mitte.
    static let delay = 0.35

    static func attach(stage: Stage, loop: RenderLoop, runtime: HostRuntime) {
        guard let path = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix("--ereignisbild=") })?.dropFirst(15).description,
              !path.isEmpty else { return }
        var counts: [String: Int] = [:]
        var n = 0
        var busyUntil = 0.0
        stage.onBoardEvent = { [weak loop, weak runtime] kind in
            // Eine Aufnahme zur Zeit: Eine zweite Anfrage im selben Moment (Platztausch: zwei Figuren) ersetzte die erste.
            let now = CACurrentMediaTime()
            guard counts[kind, default: 0] < perKind, now >= busyUntil else { return }
            busyUntil = now + delay + 0.2
            counts[kind, default: 0] += 1
            n += 1
            let file = "\(path)-\(String(format: "%03d", n))-\(kind).png"
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                loop?.capture { image in
                    DispatchQueue.main.async {
                        let hud = runtime?.overlay.board
                        writePNG(compose(image, hud: hud, markers: runtime?.markers.markers ?? []) ?? image, to: file)
                    }
                }
            }
        }
    }

    /// 3D-Bild mit dem HUD darüber: gerendert in 1920×1080 und wie in der App eingepasst (mittig, ohne Verzerren).
    static func compose(_ image: CGImage, hud: BoardOverlay?, markers: [RenderState.EdgeMarker] = []) -> CGImage? {
        guard let hud else { return image }
        let renderer = ImageRenderer(content: ZStack {
            BoardHudView(board: hud)
            EdgeMarkersView(markers: markers, hud: hud.hud)
        }.frame(width: 1920, height: 1080).foregroundStyle(.white))
        let scale = min(CGFloat(image.width) / 1920, CGFloat(image.height) / 1080)
        renderer.scale = scale
        guard let overlay = renderer.cgImage,
              let ctx = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        let size = CGSize(width: 1920 * scale, height: 1080 * scale)
        ctx.draw(overlay, in: CGRect(x: (CGFloat(image.width) - size.width) / 2, y: (CGFloat(image.height) - size.height) / 2,
                                     width: size.width, height: size.height))
        return ctx.makeImage()
    }
}
