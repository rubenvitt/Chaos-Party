import CoreGraphics
import Foundation
import RealityKit

/// Lichtstimmung je Runde (CHAOS-193) wie der Natur-Look des Browser-Hosts (`apps/host/src/nature/lighting.ts`):
/// Sonne bzw. Mond mit Farbe und Höhe, Himmels- und Bodenlicht als Himmelslicht (IBL), Dunst als Hintergrund und
/// Horizont, Belichtung. Die Werte rechnet der JS-Kern (`src/lightMood.ts`), samt Überblendung beim Rundenwechsel.
///
/// Abgleich mit dem Browser-Host (`applyState`, Bildpaare in CHAOS-193):
/// - Sonne: Babylon-Intensität × 1600 lx (CHAOS-112/119), die Belichtung (`exposure`) als Faktor bezogen auf
///   Mittag (1,3). RealityKits Tonemapping hat keine Belichtung (erst ab tvOS 27, die App läuft ab 26).
/// - Himmelslicht: oben HDRI-Ersatz (`hdriSky`, Gewicht `hdriWeight` × `sky`) plus Bodenlicht-Himmel, unten der Boden des
///   Bodenlichts (`environmentImage`); je Stimmung einmal gebaut, gewechselt zur Hälfte der Überblendung wie das HDRI.
/// - Sonnenrichtung: Azimut fest wie `DEFAULT_SUN` (schräg von vorn links), Höhe aus der Stimmung.
@MainActor
final class SceneLight {
    let sun = DirectionalLight()
    /// Waagerechte Laufrichtung des Lichts in Szenen-Koordinaten (normiert).
    private let travel: SIMD2<Float>
    /// Abgleich von Himmelslicht und Sonne (Brett und Minispiel haben verschiedene Materialien).
    private let ambientScale: Float
    private let keyScale: Float
    private let fallback: (environment: EnvironmentResource?, exponent: Float, background: CGColor)
    private(set) var environment: EnvironmentResource?
    private(set) var exponent: Float
    private(set) var background: CGColor
    private(set) var current: RenderState.Light?
    private var environmentMood = ""
    /// Helligkeit der gebauten Umgebung (größter linearer Wert oben), siehe `environmentImage`.
    private var environmentScale: Float = 1

    /// Belichtung der Abgleiche (Mittag).
    static let referenceExposure: Float = 1.3
    /// Babylon-Intensität → Lux (CHAOS-112/119).
    static let luxPerUnit: Float = 1600
    /// Abgleich des Himmelslichts am Brett und auf der Minispiel-Bühne (am Babylon-Bild, CHAOS-193).
    static let boardAmbient: Float = 0.45
    /// Abgleich des Himmelslichts der Minispiel-Bühne (am Babylon-Bild, CHAOS-193).
    static let minigameAmbient: Float = 1.1
    /// Sonne mit Stimmung: Babylons ACES-Tonemapping drückt Sonnenseiten stärker als RealityKits, das Himmelslicht
    /// hellt dort mehr auf (Abgleich am Babylon-Bild, CHAOS-193).
    static let keyScale: Float = 0.6
    /// Minispiele: helle Lack-Oberflächen in der Sonne, darum etwas weniger Sonne als am Brett.
    static let minigameKeyScale: Float = 0.5
    /// Babylon-Lichtstärke (cd) einer Punktlichtquelle → Lumen (4π × Lux-Faktor).
    static let lumenPerCandela: Float = 4 * .pi * 1600

    private static var environments: [String: (resource: EnvironmentResource, scale: Float)] = [:]
    private static var building: [String: Task<(resource: EnvironmentResource, scale: Float)?, Never>] = [:]
    /// Ersatz für das Puresky-HDRI des Browser-Hosts: oben hell und fast neutral (auch das Mond-HDRI ist ein
    /// abgedunkelter Taghimmel), unten schwarz. Ohne es wirkten Nächte nur blau und Vorderseiten zu dunkel.
    static let hdriSky: [Float] = [0.8, 0.86, 0.94]
    /// Gewicht des HDRI gegenüber dem Bodenlicht. Babylon ohne HDRI nimmt 0,9; mit HDRI (Stufe „mittel“/„hoch“, wie am
    /// PC) hellt der Himmel Abend und Dämmerung deutlich stärker auf (Abgleich am Babylon-Bild, CHAOS-193).
    static let hdriWeight: Float = 1.4

    /// `direction`: Laufrichtung des Lichts ohne Stimmung (Lobby, Grundkörper); ihr waagerechter Anteil bleibt.
    init(direction: SIMD3<Float>, intensity: Float, color: PlatformColor, shadowDistance: Float, ambientScale: Float,
         keyScale: Float, environment: EnvironmentResource?, exponent: Float, background: CGColor) {
        let flat = SIMD2(direction.x, direction.z)
        travel = simd_length(flat) > 1e-4 ? simd_normalize(flat) : SIMD2(0, 1)
        self.ambientScale = ambientScale
        self.keyScale = keyScale
        defaultSun = (color, intensity, simd_normalize(direction))
        fallback = (environment, exponent, background)
        self.environment = environment
        self.exponent = exponent
        self.background = background
        sun.light.color = color
        sun.light.intensity = intensity
        var shadow = DirectionalLightComponent.Shadow()
        shadow.shadowProjection = .automatic(maximumDistance: shadowDistance)
        sun.shadow = shadow
        sun.look(at: simd_normalize(direction), from: .zero, relativeTo: nil)
    }

    private let defaultSun: (color: PlatformColor, intensity: Float, direction: SIMD3<Float>)

    /// Zurück zum Licht ohne Stimmung (Lobby).
    func reset() {
        guard current != nil else { return }
        current = nil
        environmentMood = ""
        sun.light.color = defaultSun.color
        sun.light.intensity = defaultSun.intensity
        sun.look(at: defaultSun.direction, from: .zero, relativeTo: nil)
        (environment, exponent, background) = fallback
    }

    /// Ein Bild: nur bei Änderung (während einer Überblendung je Bild).
    func apply(_ light: RenderState.Light?) {
        guard let light, light != current else { return }
        current = light
        let exposure = light.exposure / Self.referenceExposure
        sun.light.color = platformColor(light.keyTint)
        sun.light.intensity = light.keyIntensity * Self.luxPerUnit * exposure * keyScale
        let elevation = min(0.98, max(0.05, light.keyElevation))
        let flat = (1 - elevation * elevation).squareRoot()
        sun.look(at: SIMD3(travel.x * flat, -elevation, travel.y * flat), from: .zero, relativeTo: nil)
        if light.environment.mood != environmentMood { requestEnvironment(light.environment) }
        // Stärke folgt der gemischten Stimmung, bezogen auf die Stimmung, deren Umgebung gilt.
        let env = light.environment
        let own = max(0.001, (env.fillIntensity ?? light.fillIntensity) + Self.hdriWeight * (env.skyIntensity ?? light.skyIntensity))
        let mixed = light.fillIntensity + Self.hdriWeight * light.skyIntensity
        exponent = log2(max(0.001, environmentScale * mixed / own * exposure * ambientScale))
        background = cgColor(light.haze)
    }

    /// Himmelslicht der Stimmung: je Stimmung einmal gebaut (asynchron), bis dahin bleibt das bisherige.
    private func requestEnvironment(_ env: RenderState.Light.Environment) {
        environmentMood = env.mood
        if let ready = Self.environments[env.mood] {
            (environment, environmentScale) = ready
            return
        }
        let task = Self.building[env.mood] ?? Task { @MainActor in
            let (image, scale) = Self.environmentImage(env)
            guard let resource = try? await EnvironmentResource(equirectangular: image) else { return nil }
            return (resource, scale)
        }
        Self.building[env.mood] = task
        Task { @MainActor [weak self] in
            guard let made = await task.value else {
                hostLog("FEHLER Himmelslicht \(env.mood) nicht gebaut")
                return
            }
            Self.environments[env.mood] = made
            if let self, self.environmentMood == env.mood {
                (self.environment, self.environmentScale) = made
                if let light = self.current {
                    self.current = nil
                    self.apply(light)
                }
            }
        }
    }

    /// Himmelslicht wie Babylon mit HDRI: oben HDRI-Himmel (`sky`) plus Bodenlicht-Himmel (`fill`), unten nur der
    /// Boden des Bodenlichts. Linear gemischt, auf den hellsten Wert normiert (8 Bit); `scale` trägt die Helligkeit.
    static func environmentImage(_ env: RenderState.Light.Environment) -> (CGImage, Float) {
        let fill = env.fillIntensity ?? 0.35, sky = hdriWeight * (env.skyIntensity ?? 1)
        let up = (0..<3).map { linear(rgb(env.sky)[$0]) * fill + linear(hdriSky[$0]) * sky }
        let down = (0..<3).map { linear(rgb(env.ground)[$0]) * fill }
        let scale = max(0.001, up.max() ?? 1, down.max() ?? 0)
        return (hemisphereImage(sky: up.map { encoded($0 / scale) }, ground: down.map { encoded($0 / scale) }), scale)
    }

    private static func linear(_ c: Float) -> Float { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
    private static func encoded(_ c: Float) -> Float { c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1 / 2.4) - 0.055 }
}

/// Laternen (CHAOS-193): Glas leuchtet ab einem Viertel der Dämmerung in Laternenfarbe, Punktlichter mit Stärke und
/// Reichweite der Stimmung (wie `NightRig` in `apps/host/src/nature/lighting.ts`). Bei Tag aus.
@MainActor
final class LanternRig {
    private struct Lantern {
        let glass: Entity
        let day: [RealityKit.Material]
        let light: PointLight?
    }

    /// Hält die Punktlichter; in die Szene hängen (Lage wie das Glas relativ zur Wurzel seiner Hierarchie).
    let root = Entity()
    private var lanterns: [Lantern] = []
    /// Abgleich der Laternen am Babylon-Bild (Nacht, CHAOS-193): kleinere Lichtkegel.
    static let calibration: Float = 0.35
    private var glowing = false
    private var glowColor = ""

    /// `glass`: Glaskörper der Laternen (mit `ModelComponent`); die Lichter stehen an der Stelle des Glases, bezogen
    /// auf die Wurzel seiner Hierarchie (`root` dort mit Einheitslage einhängen).
    init(glass: [Entity], maxLights: Int = 6) {
        for (index, entity) in glass.enumerated() {
            var light: PointLight?
            if index < maxLights {
                let made = PointLight()
                made.light.intensity = 0
                made.isEnabled = false
                made.position = entity.position(relativeTo: nil)
                root.addChild(made)
                light = made
            }
            lanterns.append(Lantern(glass: entity, day: entity.components[ModelComponent.self]?.materials ?? [], light: light))
        }
    }

    var count: Int { lanterns.count }

    func apply(_ light: RenderState.Light?) {
        let on = light?.lampsOn ?? 0
        let lit = on >= 0.25
        let color = light?.lanternColor ?? "#ff9c4a"
        if lit != glowing || (lit && color != glowColor) {
            glowing = lit
            glowColor = color
            let glow = UnlitMaterial(color: platformColor(color))
            for lantern in lanterns {
                guard var model = lantern.glass.components[ModelComponent.self] else { continue }
                model.materials = lit ? Array(repeating: glow, count: max(1, lantern.day.count)) : lantern.day
                lantern.glass.components.set(model)
            }
        }
        let exposure = (light?.exposure ?? SceneLight.referenceExposure) / SceneLight.referenceExposure
        let intensity = (light?.lanternIntensity ?? 0) * SceneLight.lumenPerCandela * exposure * Self.calibration
        for lantern in lanterns {
            guard let point = lantern.light else { continue }
            point.isEnabled = intensity > 1
            guard intensity > 1, let light else { continue }
            point.light.intensity = intensity
            point.light.attenuationRadius = max(0.5, light.lanternRange)
            point.light.color = platformColor(color)
        }
    }
}

extension RenderState.Light {
    /// Nacht wie `LIGHT_MOODS.nacht` in `apps/host/src/lighting/moods.ts` – für Szenen ohne Stimmung aus dem Kern:
    /// Siegerpodest (`SCENE_MOODS.finale`) und das Aufwärmen. Eigene Umgebungs-ID, damit sie nicht die echte Nacht ersetzt.
    static let fixedNight = RenderState.Light(
        mood: "nacht", keyIntensity: 0.8, keyTint: "#7f9cff", keyElevation: 0.6, skyIntensity: 0.5, fillIntensity: 0.22,
        fillSky: "#2c3a70", fillGround: "#12170f",
        environment: .init(mood: "nacht-fest", sky: "#2c3a70", ground: "#12170f", skyIntensity: 0.5, fillIntensity: 0.22),
        haze: "#1e2742", exposure: 1.9, lampsOn: 1, lanternColor: "#ff9c4a", lanternIntensity: 14, lanternRange: 7, grassTip: "#7f9c5e")
}

/// `#rrggbb` → [r, g, b] (0…1, sRGB).
func rgb(_ hex: String) -> [Float] {
    let v = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0xcccccc
    return [Float((v >> 16) & 0xff) / 255, Float((v >> 8) & 0xff) / 255, Float(v & 0xff) / 255]
}

