import Foundation

// CHAOS-147: Aus TestFlight startet die Apple-TV-App ohne Startparameter. Damit sich der hochskalierte Pfad
// (CHAOS-114) trotzdem messen lässt, gibt es eine feste Liste von Varianten, wählbar über die Siri Remote
// (Play/Pause, siehe `VariantMenu` in App.swift). Die Wahl bleibt in `UserDefaults` gespeichert.

/// Eine Messvariante. `id` folgt den Namen in `messreihe-atv.sh`.
struct Variant: Identifiable, Equatable {
    let id: String
    let upscale: Bool
    /// Nur mit `upscale`: interne Auflösung je Achse und Skalierer.
    let scale: Double
    let scaler: String

    /// Die Startparameter, die eine Variante ausmachen. Alles andere (`sekunden`, `server` …) bleibt unberührt.
    static let keys: Set<String> = ["hochskalieren", "skala", "skalierer"]

    static let native = Variant(id: "arview", upscale: false, scale: 1, scaler: "metalfx")
    static let all: [Variant] = [
        native,
        Variant(id: "hoch-0.5-metalfx", upscale: true, scale: 0.5, scaler: "metalfx"),
        Variant(id: "hoch-0.5-bilinear", upscale: true, scale: 0.5, scaler: "bilinear"),
        Variant(id: "hoch-0.667-metalfx", upscale: true, scale: 0.667, scaler: "metalfx"),
        Variant(id: "hoch-0.667-bilinear", upscale: true, scale: 0.667, scaler: "bilinear"),
    ]

    static func named(_ id: String) -> Variant? { all.first { $0.id == id } }

    /// Startparameter wie in `messreihe-atv.sh`, ohne `--`.
    var arguments: [String: String] {
        guard upscale else { return [:] }
        return ["hochskalieren": "1", "skala": String(scale), "skalierer": scaler]
    }

    var label: String { Variant.describe(upscale: upscale, scale: scale, scaler: scaler) }

    /// Anzeige im Menü und im HUD, z. B. „Nativ (ARView)“ oder „Hochskaliert ×0,5, MetalFX“.
    static func describe(upscale: Bool, scale: Double, scaler: String) -> String {
        guard upscale else { return "Nativ (ARView)" }
        let factor = String(format: "%.3g", scale).replacingOccurrences(of: ".", with: ",")
        let name = scaler == "metalfx" ? "MetalFX" : scaler == "bilinear" ? "bilinear" : scaler
        return "Hochskaliert ×\(factor), \(name)"
    }
}

/// Gespeicherte Wahl aus dem Menü.
enum VariantStore {
    static let key = "messvariante"

    static func load(_ defaults: UserDefaults = .standard) -> Variant? {
        defaults.string(forKey: key).flatMap(Variant.named)
    }

    static func save(_ variant: Variant, _ defaults: UserDefaults = .standard) {
        defaults.set(variant.id, forKey: key)
    }
}

/// Ein Lauf der App: aktuelle Einstellungen und ein Zähler, der bei jeder Wahl im Menü steigt. Die Ansicht hängt
/// ihre Identität daran (`.id(generation)`), so entstehen Szene und `Meter` neu, auch bei derselben Variante.
struct SpikeRun {
    private(set) var settings: Settings
    private(set) var generation = 0

    init(settings: Settings) { self.settings = settings }

    /// Startparameter haben Vorrang; ohne einen einzigen `--`-Parameter gilt die gespeicherte Wahl.
    static func atLaunch(arguments: [String] = ProcessInfo.processInfo.arguments,
                         defaults: UserDefaults = .standard) -> SpikeRun {
        SpikeRun(settings: Settings(arguments: arguments, stored: VariantStore.load(defaults)))
    }

    mutating func choose(_ variant: Variant, defaults: UserDefaults = .standard) {
        VariantStore.save(variant, defaults)
        settings = settings.with(variant)
        generation += 1
    }
}
