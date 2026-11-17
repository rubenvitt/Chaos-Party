import Foundation

/// Startparameter wie beim Bevy-Spike, als `--name=wert` (macOS direkt, Simulator per `simctl launch … --name=wert`).
struct Settings {
    let raw: [String: String]

    init(arguments: [String] = ProcessInfo.processInfo.arguments) {
        var params: [String: String] = [:]
        for arg in arguments.dropFirst() where arg.hasPrefix("--") {
            let pair = arg.dropFirst(2).split(separator: "=", maxSplits: 1)
            guard let key = pair.first else { continue }
            params[String(key)] = pair.count > 1 ? String(pair[1]) : "1"
        }
        raw = params
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
