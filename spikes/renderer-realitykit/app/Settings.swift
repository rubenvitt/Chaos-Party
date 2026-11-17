import Foundation

/// Startparameter wie beim Bevy-Spike, als `--name=wert` (macOS direkt, Simulator per `simctl launch … --name=wert`).
/// Ohne einen einzigen `--`-Parameter gilt die im Menü gespeicherte Messvariante (CHAOS-147, `Variants.swift`).
struct Settings {
    /// Woher die Werte stammen; das HUD zeigt es neben der Variante.
    enum Source: String {
        case standard = "Standard"
        case launch = "Startparameter"
        case stored = "gespeichert"
        case menu = "Menü"
    }

    let raw: [String: String]
    let source: Source

    init(arguments: [String] = ProcessInfo.processInfo.arguments, stored: Variant? = nil) {
        var params: [String: String] = [:]
        for arg in arguments.dropFirst() where arg.hasPrefix("--") {
            let pair = arg.dropFirst(2).split(separator: "=", maxSplits: 1)
            guard let key = pair.first else { continue }
            params[String(key)] = pair.count > 1 ? String(pair[1]) : "1"
        }
        if params.isEmpty, let stored {
            raw = stored.arguments
            source = .stored
        } else {
            raw = params
            source = params.isEmpty ? .standard : .launch
        }
    }

    private init(raw: [String: String], source: Source) {
        self.raw = raw
        self.source = source
    }

    /// Wahl im Menü: ersetzt nur die Schlüssel der Variante, übrige Startparameter bleiben.
    func with(_ variant: Variant) -> Settings {
        var next = raw.filter { !Variant.keys.contains($0.key) }
        next.merge(variant.arguments) { _, new in new }
        return Settings(raw: next, source: .menu)
    }

    /// Aktive Variante als Text, aus den wirksamen Werten (auch bei Startparametern, die keiner Variante entsprechen).
    var variantLabel: String {
        // Wie in `SpikeView.makeView`: `hochskalieren` geht vor `durchsatz`.
        !upscale && throughput ? "Offscreen (Durchsatz)" : Variant.describe(upscale: upscale, scale: scale, scaler: scaler)
    }

    /// Entspricht die Einstellung dieser Variante? (Häkchen im Menü)
    func matches(_ variant: Variant) -> Bool {
        guard upscale == variant.upscale else { return false }
        return upscale ? abs(scale - variant.scale) < 0.001 && scaler == variant.scaler : !throughput
    }

    private func num(_ key: String, _ fallback: Double) -> Double { raw[key].flatMap(Double.init) ?? fallback }
    private func flag(_ key: String, _ fallback: Bool) -> Bool {
        raw[key].map { ["1", "true", "ja"].contains($0) } ?? fallback
    }

    var seconds: Double { max(1, num("sekunden", 20)) }
    var warmup: Double { max(0, num("aufwaermen", 3)) }
    var shadows: Bool { flag("schatten", true) }
    var grass: Float { Float(min(1, max(0, num("gras", 1)))) }
    /// Fenstergröße in Bildpunkten (nur macOS), wie `breite`/`hoehe` bei Bevy.
    var width: Double { num("breite", 1920) }
    var height: Double { num("hoehe", 1080) }
    /// Abgleich Babylon → RealityKit: Sonne in Lux je Babylon-Intensität, Himmelslicht als Faktor.
    var sunScale: Double { num("sonne", 1600) }
    var skyScale: Double { num("himmel", 2.5) }
    /// Offscreen-Messung mit `RealityRenderer` ohne vsync (siehe `Meter`).
    var throughput: Bool { flag("durchsatz", false) }
    /// Nur offscreen steuerbar: 0/1 aus, sonst 4×.
    var msaa: Int { Int(num("msaa", 4)) }
    var screenshot: String? { raw["bild"] }
    var assets: String? { raw["assets"] }
    var server: String? { raw["server"] }
    /// Mit `--sekunden` beendet sich die App nach der Messung, außer `--bleiben=1`.
    var quitAfterMeasurement: Bool { raw["sekunden"] != nil && !flag("bleiben", false) }
    /// Undokumentierte ARView-Schalter: automatische Bildrate aus, Wunschrate setzen (z. B. 120).
    var preferredFrameRate: Float? { raw["bildrate"].flatMap(Float.init) }

    // CHAOS-114: hochskalierter Pfad und Diagnose-Schalter.
    /// Eigene Render-Schleife: `RealityRenderer` in interner Auflösung, hochskaliert auf die volle Anzeige (`UpscaleLoop`).
    var upscale: Bool { flag("hochskalieren", false) }
    /// Interne Auflösung als Anteil der Anzeige je Achse: 0,5 = 1920×1080 bei 4K, 0,667 = 2560×1440, 1 = nativ.
    var scale: Double { min(1, max(0.25, num("skala", 0.5))) }
    /// `metalfx` (MetalFX Spatial, auf tvOS erst ab 27.2) oder `bilinear` (eigener Shader).
    var scaler: String { raw["skalierer"] ?? "metalfx" }
    /// Bilder gleichzeitig in Arbeit (1–3). 1 = streng nacheinander wie `--durchsatz=1`.
    var framesInFlight: Int { Int(min(3, max(1, num("imflug", 2)))) }
    /// Nur `RealityRenderer` (offscreen, hochskaliert): Tonemapping aus.
    var toneMapping: Bool { flag("tonemapping", true) }
    /// Himmelslicht (IBL). `0` lässt die Lichtressource weg.
    var ibl: Bool { flag("ibl", true) }
    /// `voll` (Standard), `einfach` (ein PBR-Material ohne Texturen für alles) oder `unbeleuchtet` (UnlitMaterial).
    var materials: String { raw["material"] ?? "voll" }
}

/// Beschreibung der Testszene aus dem Babylon-Export (`brett.szene.json`, rechtshändig, y oben).
struct SceneMeta: Decodable {
    struct Camera: Decodable { let position, target: [Float]; let fovY, near, far: Float }
    struct Light: Decodable { let direction: [Float]; let intensity: Float; let color: [Float] }
    struct Sky: Decodable { let intensity: Float; let color: [Float]; let ground: [Float]? }
    struct Pawn: Decodable { let slot: Int; let character: String; let position: [Float] }
    let camera: Camera
    let sun: Light?
    let sky: Sky?
    let clearColor: [Float]
    let pawns: [Pawn]
}

/// Thin Instances (`brett.instanzen.json`): Weltmatrizen spaltenweise, 16 Werte.
struct InstancedMesh: Decodable {
    let mesh: String
    let matrices: [[Float]]
}

func percentile(_ sorted: [Double], _ p: Double) -> Double {
    guard !sorted.isEmpty else { return .nan }
    return sorted[min(sorted.count - 1, Int((Double(sorted.count - 1) * p).rounded()))]
}
