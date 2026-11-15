/**
 * Ganzzahlige Protokollversion. Erhöhen bei jeder inkompatiblen Änderung.
 * v2 (M2, ADR-011): Phase `board`, `choose`, `prompt`/`board` im Kontext, `board` an den Host.
 * v3 (M3, ADR-012): echte Minispiele – `minigame` im Brett-Stand und im Controller-Kontext,
 * `minigame-result` vom Host, Eingaben (`move`/`press`/`release`) in der Brettphase während
 * `minigame-play`, erweiterte Ereignisse `minigame-started`/`minigame-results`.
 */
export const PROTOCOL_VERSION = 3;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Prüft, ob eine Gegenstelle dieselbe Protokollversion spricht. */
export function isCompatibleVersion(version: unknown): version is ProtocolVersion {
  return version === PROTOCOL_VERSION;
}
