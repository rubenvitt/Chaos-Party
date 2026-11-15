/**
 * Ganzzahlige Protokollversion. Erhöhen bei jeder inkompatiblen Änderung.
 * v2 (M2, ADR-011): Phase `board`, `choose`, `prompt`/`board` im Kontext, `board` an den Host.
 * v3 (M3, ADR-012): echte Minispiele – `minigame` im Brett-Stand und im Controller-Kontext,
 * `minigame-result` vom Host, Eingaben (`move`/`press`/`release`) in der Brettphase während
 * `minigame-play`, erweiterte Ereignisse `minigame-started`/`minigame-results`.
 * v4 (M4, ADR-014): Charakterwahl (`pick-character`, `LobbyPlayer.character`,
 * `BoardPlayer.character`, Kontext `lobby`, Fehler `character-taken`), Lobby-Einstellungen
 * (`lobby.settings`, `configure`), Pause/Ende (`pause`/`resume`/`end-game`, `BoardView.paused`/
 * `endedEarly`, Fehler `paused`), Revanche (`rematch`), Wertung mit Minispiel-Siegen
 * (`RankingEntry.minigameWins`/`decidedBy`, `BoardPlayer.minigameWins`/`stats`),
 * `BoardView.minigame.rewards`, Minispiel-Kontext `tied`/`aborted`/`reward`, Bestätigung
 * `minigame-result-ack`, `game-ended.endedEarly`.
 */
export const PROTOCOL_VERSION = 4;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Prüft, ob eine Gegenstelle dieselbe Protokollversion spricht. */
export function isCompatibleVersion(version: unknown): version is ProtocolVersion {
  return version === PROTOCOL_VERSION;
}
