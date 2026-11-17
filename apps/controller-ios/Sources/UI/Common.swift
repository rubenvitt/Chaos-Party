// Look „Glas & Licht“ (CHAOS-59, `apps/controller/src/styles.css`) and small shared pieces.
import SwiftUI
import UIKit

// MARK: - Slots (packages/protocol/src/players.ts)

struct SlotStyle {
    let hex: String
    let label: String
    let symbol: String
    /// VoiceOver name of the symbol.
    let symbolName: String
    var color: Color { Color(hex: hex) }
    var onColor: Color { Color(hex: readableTextHex(on: hex)) }
}

enum Slots {
    static let all: [Int: SlotStyle] = [
        1: SlotStyle(hex: "#0072B2", label: "Blau", symbol: "●", symbolName: "Kreis"),
        2: SlotStyle(hex: "#E69F00", label: "Orange", symbol: "▲", symbolName: "Dreieck"),
        3: SlotStyle(hex: "#009E73", label: "Grün", symbol: "■", symbolName: "Quadrat"),
        4: SlotStyle(hex: "#CC79A7", label: "Rosa", symbol: "★", symbolName: "Stern"),
    ]
    static func style(_ slot: Int) -> SlotStyle {
        all[slot] ?? SlotStyle(hex: "#8F86C9", label: "Spieler \(slot)", symbol: "◆", symbolName: "Raute")
    }
}

// MARK: - Colors (ui/color.ts)

enum Palette {
    static let ink = Color(hex: "#f4f6f2")
    static let dim = Color(hex: "#f4f6f2").opacity(0.72)
    static let glass = Color.white.opacity(0.1)
    static let glassStrong = Color.white.opacity(0.18)
    static let line = Color.white.opacity(0.18)
    static let sun = Color(hex: "#ffd25e")
    static let mint = Color(hex: "#7be0c3")
    static let danger = Color(hex: "#e5484d")
}

extension Color {
    /// `#RRGGBB`; anything else is neutral grey.
    init(hex: String) {
        let value = UInt32(hex.dropFirst(), radix: 16) ?? 0x8F86C9
        self.init(
            red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255)
    }
}

private func luminance(_ hex: String) -> Double {
    guard hex.count == 7, let value = UInt32(hex.dropFirst(), radix: 16) else { return 0 }
    func channel(_ shift: UInt32) -> Double {
        let c = Double((value >> shift) & 0xFF) / 255
        return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
}

private func contrast(_ a: String, _ b: String) -> Double {
    let (la, lb) = (luminance(a), luminance(b))
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
}

/// White or ink, whichever reads better on `background` (`readableTextColor`).
func readableTextHex(on background: String) -> String {
    contrast(background, "#ffffff") >= contrast(background, "#1b1530") ? "#ffffff" : "#1b1530"
}

// MARK: - Backdrop and surfaces

/// Blurred nature world under a dark veil (`body` background in `styles.css`).
struct Backdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: "#c9b38f"), Color(hex: "#6f8a52"), Color(hex: "#3f5a33")],
                startPoint: .top, endPoint: .bottom)
            RadialGradient(
                colors: [Color(hex: "#5f8f4a"), .clear], center: UnitPoint(x: 0.2, y: 0.3),
                startRadius: 0, endRadius: 320)
            RadialGradient(
                colors: [Color(hex: "#7f9a4c"), .clear], center: UnitPoint(x: 0.5, y: 0.7),
                startRadius: 0, endRadius: 380)
            LinearGradient(
                colors: [
                    Color(red: 0.04, green: 0.055, blue: 0.047).opacity(0.5),
                    Color(red: 0.04, green: 0.055, blue: 0.047).opacity(0.8),
                ], startPoint: .top, endPoint: .bottom)
        }
        .ignoresSafeArea()
    }
}

extension View {
    /// Frosted glass surface with a fine light edge (`--glass`, `--glass-line`).
    func glass(_ radius: CGFloat = 22, strong: Bool = false) -> some View {
        background(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(.ultraThinMaterial.opacity(0.6))
                .overlay(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .fill(strong ? Palette.glassStrong : Palette.glass))
                .overlay(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(Palette.line))
        )
    }

    /// Player-colored primary surface with glow (`--primary-bg`, `--glow`).
    func primary(_ color: Color, radius: CGFloat) -> some View {
        background(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(LinearGradient(colors: [color.mix(with: .white, by: 0.18), color], startPoint: .top, endPoint: .bottom))
                .overlay(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(.white.opacity(0.25)))
                .shadow(color: color.opacity(0.55), radius: 17, y: 12)
        )
    }
}

/// Shrinks a little while pressed.
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.06), value: configuration.isPressed)
    }
}

/// Big pill button in the player color („Bereit!“, „Neu verbinden“).
struct PrimaryButton: View {
    let title: String
    let color: Color
    var onColor: Color = .white
    let action: () -> Void

    var body: some View {
        SwiftUI.Button(action: action) {
            Text(title)
                .font(.largeTitle.bold())
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(onColor)
                .padding(.horizontal, 36)
                .frame(minWidth: 220, minHeight: 88)
                .primary(color, radius: 44)
        }
        .buttonStyle(PressStyle())
    }
}

/// Secondary glass button.
struct GlassButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        SwiftUI.Button(action: action) {
            Text(title)
                .font(.headline)
                .foregroundStyle(Palette.ink)
                .padding(.horizontal, 22)
                .frame(minHeight: 50)
                .glass(25, strong: true)
        }
        .buttonStyle(PressStyle())
    }
}

/// Three pulsing dots (`.wait-dots`).
struct WaitDots: View {
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.35)) { context in
            let step = Int(context.date.timeIntervalSinceReferenceDate / 0.35) % 3
            HStack(spacing: 12) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Palette.ink)
                        .frame(width: 16, height: 16)
                        .opacity(index == step ? 1 : 0.35)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Slot symbol in a colored disc; carries the player identity without relying on color.
struct SlotSymbol: View {
    let slot: Int
    var size: CGFloat = 40

    var body: some View {
        let style = Slots.style(slot)
        Text(style.symbol)
            .font(.system(size: size * 0.5, weight: .bold))
            .foregroundStyle(style.onColor)
            .frame(width: size, height: size)
            .background(Circle().fill(style.color))
            .overlay(Circle().strokeBorder(.white.opacity(0.35)))
            .accessibilityHidden(true)
    }
}

// MARK: - Icons (board/items.ts, ui/icons.tsx → SF Symbols)

struct GameIcon: View {
    let name: String
    var size: CGFloat = 28

    var body: some View {
        let (symbol, color) = Self.symbols[name] ?? ("questionmark.circle.fill", Palette.ink)
        Image(systemName: symbol)
            .resizable()
            .scaledToFit()
            .symbolRenderingMode(.monochrome)
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }

    private static let symbols: [String: (String, Color)] = [
        "coin": ("centsign.circle.fill", Palette.sun),
        "trophy": ("trophy.fill", Palette.sun),
        "dice": ("die.face.3.fill", .white),
        "double-dice": ("dice.fill", Palette.sun),
        "coin-steal": ("hand.raised.fill", Color(hex: "#ff5a5f")),
        "trap": ("exclamationmark.triangle.fill", Color(hex: "#e8e8f0")),
        "shield": ("shield.fill", Palette.mint),
        "brace": ("figure.stand", .white),
        "arrow": ("arrow.right", .white),
        "skip": ("forward.fill", .white),
        "cancel": ("xmark", Palette.ink),
        "star": ("star.fill", Palette.sun),
    ]
}

extension ItemKind {
    /// Short German name (`ITEM_INFO`); unknown items keep their wire name.
    var displayName: String {
        switch self {
        case .doubleDice: "Doppelwürfel"
        case .coinSteal: "Münzklau"
        case .trap: "Falle"
        case .shield: "Schild"
        default: rawValue
        }
    }
}

// MARK: - Character portraits (ui/CharacterPortrait.tsx)

@MainActor
private enum PortraitImages {
    static var cache: [String: UIImage] = [:]

    static func image(_ name: String) -> UIImage? {
        if let image = cache[name] { return image }
        guard let path = Bundle.main.path(forResource: name, ofType: "webp"),
            let image = UIImage(contentsOfFile: path)
        else { return nil }
        cache[name] = image
        return image
    }
}

/// Render with the accent area tinted in `accent` (multiply over the white accent mask).
struct Portrait: View {
    let character: CharacterId
    let accent: Color

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: "#fff6df"), Color(hex: "#d8efff")], startPoint: .top,
                endPoint: .bottom)
            if let image = PortraitImages.image(character.rawValue) {
                Image(uiImage: image).resizable().scaledToFit()
                if let mask = PortraitImages.image("\(character.rawValue)-akzent") {
                    accent
                        .mask(Image(uiImage: mask).resizable().scaledToFit())
                        .blendMode(.multiply)
                }
            } else {
                Text(character.displayName.prefix(1))
                    .font(.largeTitle.bold())
                    .foregroundStyle(Color(hex: "#1b1530"))
            }
        }
        .compositingGroup()
        .accessibilityHidden(true)
    }
}

extension CharacterId {
    /// `defaultCharacterFor`: slot n suggests the n-th character.
    static func defaultFor(slot: Int) -> CharacterId {
        known.indices.contains(slot - 1) ? known[slot - 1] : .robot
    }
}

/// Own character of a slot (`state/character.ts`).
func ownCharacter(slot: Int, context: SlotContext?) -> CharacterId {
    context?.board?.character ?? context?.lobby?.character ?? .defaultFor(slot: slot)
}

/// „Schau auf den großen Bildschirm!“ (`LOOK_AT_SCREEN`).
let lookAtScreen = "Schau auf den großen Bildschirm!"
