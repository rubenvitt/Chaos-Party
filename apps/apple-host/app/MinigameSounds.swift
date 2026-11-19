import AVFoundation
import Foundation
import QuartzCore

/// Klänge der Minispiele (CHAOS-190). Die Rezepte kommen fertig aus dem JS-Kern (`renderState().minigame.sounds`):
/// `ctx.fx.sound` der Minispiele, „minigame-start“ und Countdown-„tick“ in der Anleitung, „cheer“ im Ergebnis, wie im
/// Browser-Host. Synthetisiert wird mit derselben Synthese wie die Brett-Klänge (`BoardSounds.synthesize`).
///
/// Anders als auf dem Brett kommen hier viele Klänge kurz hintereinander. Darum eigene Stimmen: Ein Klang geht nur an
/// eine Stimme, deren letzter Puffer abgespielt ist; sind alle belegt, entfällt er (wie `MAX_VOICES` im Browser-Host).
/// In eine belegte Stimme eingereiht, käme er zu spät und der Ton liefe dem Spiel hinterher.
///
/// Summe: Der Browser-Host legt einen Kompressor auf den Master; hier begrenzt Apples Peak-Limiter hinter dem Mischer, damit
/// viele gleichzeitige Klänge (Kuckucks-Klatsche mit vier Spielern) nicht übersteuern.
///
/// `--stumm` schaltet die Klänge ab. Die Audio-Engine startet erst beim ersten Klang.
@MainActor
final class MinigameSounds {
    /// Gleichzeitige Klänge; mehr verwirft der Browser-Host erst bei 32 Stimmen (ein Klang hat 1–5 Stimmen).
    static let voices = 16
    /// So viele Puffer hält der Zwischenspeicher; Minispiele variieren die Tonhöhe auch zufällig.
    private static let cacheLimit = 96

    private let synth = BoardSounds()
    private let muted = CommandLine.arguments.contains("--stumm")
    private var engine: AVAudioEngine?
    private var players: [AVAudioPlayerNode] = []
    private var busyUntil: [CFTimeInterval] = []
    private var failed = false
    private var cache: [String: AVAudioPCMBuffer] = [:]
    /// Gezeigtes Minispiel (`<runde>-<id>`) und höchste gespielte ID darin.
    private var gameKey = ""
    private var lastId = 0
    private var gamePlayed = 0
    private var gameDropped = 0
    private var gameNames: [String: Int] = [:]
    /// Gespielte Klänge seit dem Start (auch stumm gezählt).
    private(set) var played = 0

    /// Je Bild: das gezeigte Minispiel (Spiel oder Pause), `nil` außerhalb (Brett, Lobby, Finale).
    func apply(_ m: RenderState.Minigame?) {
        guard let m else {
            finish()
            return
        }
        let key = "\(m.round ?? 0)-\(m.id)"
        if key != gameKey {
            finish()
            gameKey = key
        }
        play(m.sounds ?? [])
    }

    /// Messzeile je Minispiel (Belege ohne Lautsprecher: Simulator, `--bild`).
    private func finish() {
        guard !gameKey.isEmpty else { return }
        let names = gameNames.sorted { $0.key < $1.key }.map { "\($0.key)×\($0.value)" }.joined(separator: " ")
        hostLog("Minispiel-Klänge \(gameKey): \(gamePlayed) gespielt, \(gameDropped) verworfen\(muted ? " (stumm)" : "") – \(names)")
        gameKey = ""
        lastId = 0
        gamePlayed = 0
        gameDropped = 0
        gameNames = [:]
    }

    private func play(_ cues: [RenderState.SoundCue]) {
        for cue in cues.sorted(by: { $0.id < $1.id }) where cue.id > lastId {
            lastId = cue.id
            played += 1
            gamePlayed += 1
            gameNames[cue.name, default: 0] += 1
            guard !muted, !failed else { continue }
            let key = "\(cue.name)|\(cue.voices)"
            if cache[key] == nil {
                if cache.count >= Self.cacheLimit { cache.removeAll(keepingCapacity: true) }
                cache[key] = synth.synthesize(cue.voices)
            }
            guard let buffer = cache[key] else { continue }
            if engine == nil { start() }
            let now = CACurrentMediaTime()
            guard let index = busyUntil.firstIndex(where: { $0 <= now }) else {
                gameDropped += 1
                continue
            }
            busyUntil[index] = now + Double(buffer.frameLength) / buffer.format.sampleRate
            let player = players[index]
            player.scheduleBuffer(buffer, at: nil, options: [])
            if !player.isPlaying { player.play() }
        }
    }

    private func start() {
        #if os(tvOS) || os(iOS)
        try? AVAudioSession.sharedInstance().setCategory(.ambient)
        #endif
        let engine = AVAudioEngine()
        let format = AVAudioFormat(standardFormatWithSampleRate: BoardSounds.sampleRate, channels: 1)!
        var nodes: [AVAudioPlayerNode] = []
        for _ in 0..<Self.voices {
            let node = AVAudioPlayerNode()
            engine.attach(node)
            engine.connect(node, to: engine.mainMixerNode, format: format)
            nodes.append(node)
        }
        let limiter = AVAudioUnitEffect(audioComponentDescription: AudioComponentDescription(
            componentType: kAudioUnitType_Effect, componentSubType: kAudioUnitSubType_PeakLimiter,
            componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0))
        // Format des Ausgangs (meist Stereo) auf beiden Seiten des Limiters: So bleibt die Lautstärke wie ohne ihn und wie bei
        // den Brett-Klängen. Ohne gültiges Ausgabeformat (kein Gerät) bleibt es beim Standard-Weg; `connect` würfe sonst.
        let outFormat = engine.outputNode.inputFormat(forBus: 0)
        if outFormat.channelCount > 0, outFormat.sampleRate > 0 {
            engine.attach(limiter)
            engine.connect(engine.mainMixerNode, to: limiter, format: outFormat)
            engine.connect(limiter, to: engine.outputNode, format: outFormat)
        }
        do {
            try engine.start()
            self.engine = engine
            players = nodes
            busyUntil = Array(repeating: 0, count: nodes.count)
        } catch {
            failed = true
            hostLog("Minispiel-Klänge aus: Audio-Engine startet nicht (\(error.localizedDescription))")
        }
    }
}
