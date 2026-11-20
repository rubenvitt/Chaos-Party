import Foundation
import QuartzCore
import RealityKit

/// Figurenbibliothek (CHAOS-191): Jede Figur wird einmal als USDZ geladen (`figuren/<id>.usdz`, Clips aus
/// `<id>.clips.json`, CHAOS-140) und von Brett, Minispiel und Podest geteilt. Die Vorlage hängt nie in einer Szene;
/// jede Szene bekommt mit `instance` einen eigenen Klon samt Akzentfarbe.
@MainActor
struct FigureModel {
    static let characters = ["robot", "cactus", "raccoon", "sock"]

    let entity: Entity
    let clips: [String: AnimationResource]
    let durations: [String: Double]
    let loops: [String: Bool]

    /// Material „akzent“ in Slot-Farbe. Es liegt je Figur auf einem eigenen Mesh (USD-Prüfung, CHAOS-140); bei
    /// Figuren mit Skinning fasst RealityKit die Meshes zu einem Modell zusammen, die Mesh-Modelle behalten aber
    /// den Prim-Namen. Gefärbt wird darum das Material jedes Teils, dessen Mesh-Modell so heißt.
    private static let accentNodes: [String: String] = ["robot": "halsring", "cactus": "halstuch", "raccoon": "halstuch", "sock": "buendchen"]

    /// Alle Figuren aus `<ordner>/figuren`; fehlt der Ordner, leer (Kapseln statt Figuren).
    static func loadAll(folder: URL?) async -> [String: FigureModel] {
        guard let folder else { return [:] }
        let t0 = CACurrentMediaTime()
        var out: [String: FigureModel] = [:]
        for id in characters {
            let url = folder.appending(path: "figuren/\(id).usdz")
            guard FileManager.default.fileExists(atPath: url.path) else {
                hostLog("FEHLER figuren/\(id).usdz fehlt")
                continue
            }
            do {
                let entity = try await Entity(contentsOf: url)
                out[id] = FigureModel(entity: entity, table: folder.appending(path: "figuren/\(id).clips.json"))
            } catch {
                hostLog("FEHLER figuren/\(id).usdz laden: \(error)")
            }
        }
        hostLog(String(format: "Figuren geladen: %d in %.0f ms", out.count, (CACurrentMediaTime() - t0) * 1000))
        return out
    }

    /// Clips aus der Tabelle (alle Clips auf einer Zeitleiste) samt Länge; fehlt die Tabelle, die ganze Animation als `idle`.
    init(entity: Entity, table: URL) {
        self.entity = entity
        var clips: [String: AnimationResource] = [:], durations: [String: Double] = [:], loops: [String: Bool] = [:]
        if let owner = Self.animationOwner(in: entity) {
            let source = owner.availableAnimations[0]
            if let data = try? Data(contentsOf: table), let parsed = try? JSONDecoder().decode(Table.self, from: data) {
                for clip in parsed.clips {
                    guard let resource = try? AnimationResource.generate(with: source.definition.trimmed(start: clip.start, end: clip.end))
                    else { continue }
                    let loop = clip.loop ?? true
                    clips[clip.name] = loop ? resource.repeat() : resource
                    durations[clip.name] = clip.end - clip.start
                    loops[clip.name] = loop
                }
            } else {
                clips["idle"] = source.repeat()
            }
        } else {
            hostLog("FEHLER \(entity.name): keine Animation")
        }
        self.clips = clips
        self.durations = durations
        self.loops = loops
    }

    private struct Table: Decodable {
        struct Clip: Decodable { let name: String; let start: Double; let end: Double; let loop: Bool? }
        let clips: [Clip]
    }

    /// Eigener Klon der Vorlage, Akzent in Slot-Farbe (ohne Farbe bleibt das Material der Datei).
    func instance(color hex: String, character: String) -> Entity {
        let figure = entity.clone(recursive: true)
        guard !hex.isEmpty, let name = Self.accentNodes[character] else { return figure }
        var tinted = 0
        var stack = [figure]
        while let current = stack.popLast() {
            stack += current.children
            guard var model = current.components[ModelComponent.self] else { continue }
            let indices = Set(model.mesh.contents.models.filter { $0.id == name }.flatMap { $0.parts.map(\.materialIndex) })
            guard !indices.isEmpty else { continue }
            for index in indices where index < model.materials.count {
                var pbr = (model.materials[index] as? PhysicallyBasedMaterial) ?? PhysicallyBasedMaterial()
                pbr.baseColor = .init(tint: platformColor(hex))
                model.materials[index] = pbr
                tinted += 1
            }
            current.components.set(model)
        }
        if tinted == 0 { hostLog("FEHLER \(character): Akzent-Mesh \(name) nicht gefunden") }
        return figure
    }

    /// Spielt den Clip `name` auf einem Klon. Fehlt er, mit `fallback` `idle` (Minispiel, Podest), sonst nichts
    /// (Brett: der bisherige Clip läuft weiter). `false`, wenn nichts gestartet wurde.
    @discardableResult
    func play(_ name: String, on figure: Entity, transition: TimeInterval = 0.15, fallback: Bool = true) -> Bool {
        guard let clip = clips[name] ?? (fallback ? clips["idle"] : nil), let owner = Self.animationOwner(in: figure) else { return false }
        owner.playAnimation(clip, transitionDuration: transition)
        return true
    }

    private static func animationOwner(in entity: Entity) -> Entity? {
        BoardScene.find(in: entity, where: { !$0.availableAnimations.isEmpty })
    }
}
