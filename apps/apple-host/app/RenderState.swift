import Foundation

/// `renderState()` of the JS core (ADR-019 §2). Source of truth: `apps/apple-host/src/contract.ts`
/// (`RenderStateSchema`); examples in `harness/Fixtures/render-state`, decoded by the harness in CI.
/// Lenient on purpose: everything the renderer can live without is optional, unknown fields are ignored.
/// Shared by the app and the harness, so it must only depend on Foundation.
struct RenderState: Decodable, Equatable {
    var phase: String
    var lobby: Lobby?
    var board: Board?
    var minigame: Minigame?

    struct Lobby: Decodable, Equatable {
        var joinUrl: String?
        var joinCode: String?
        var players: [Player]?
        /// Einstellungen der nächsten Partie (CHAOS-166); null, bis die Host-Rolle ihre erste `lobby` hat.
        var settings: LobbySettings?
    }

    /// Server-Stand der Lobby-Einstellungen; ändern über `hostCommand("configure:…")`.
    struct LobbySettings: Decodable, Equatable {
        var rounds: Int?
        /// Vorschläge für die Rundenwahl, aufsteigend (Server: 10, 16, 20).
        var roundPresets: [Int]?
        /// „Mehr Zeit zum Reagieren“ (CHAOS-124): Reaktionsfenster 5 s statt 3 s.
        var moreReactionTime: Bool?
    }

    struct Player: Decodable, Equatable {
        var slot: Int
        var name: String?
        var color: String?
        var connected: Bool?
        var ready: Bool?
        var character: String?
    }

    struct Board: Decodable, Equatable {
        var round: Int?
        var rounds: Int?
        var activeSlot: Int?
        var spaces: [Space]?
        var pawns: [Pawn]?
        var messages: [String]?
        /// Big banner at the top centre (CHAOS-157), e.g. „Sabotage wird stärker!“; 4 s, else null.
        var notice: Notice?
    }

    struct Notice: Decodable, Equatable {
        var title: String
        var detail: String?
    }

    /// World coordinates as in the Babylon host (left-handed: flip z for RealityKit).
    struct Space: Decodable, Equatable {
        var id: String
        var x: Float
        var z: Float
        /// `SpaceKind` from game-core: start, coins-plus, coins-minus, event, item, trophy.
        var kind: String?
    }

    struct Pawn: Decodable, Equatable {
        var slot: Int
        var spaceId: String?
        var x: Float
        var z: Float
        var character: String?
    }

    struct Minigame: Decodable, Equatable {
        var id: String
        /// intro, play, results
        var stage: String?
        var elapsedMs: Double?
        var bodies: [Body]?
        var hud: String?
    }

    /// One mesh of the headless minigame scene: centre of its world bounding box, world rotation (x, y, z, w),
    /// local extent × scale. Shapes: sphere, box, cylinder.
    struct Body: Decodable, Equatable {
        var id: String
        var shape: String
        var pos: [Float]
        var rot: [Float]?
        var size: [Float]?
        var color: String?
    }

    /// The phases the contract knows (`CONTRACT_PHASES`).
    static let phases: Set<String> = ["lobby", "board", "minigame", "final", "paused"]

    static func decode(_ json: String) throws -> RenderState {
        try JSONDecoder().decode(RenderState.self, from: Data(json.utf8))
    }
}
