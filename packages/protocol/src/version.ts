/**
 * Ganzzahlige Protokollversion. Erhöhen bei jeder inkompatiblen Änderung.
 * v2 (M2, ADR-011): Phase `board`, `choose`, `prompt`/`board` im Kontext, `board` an den Host.
 */
export const PROTOCOL_VERSION = 2;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Prüft, ob eine Gegenstelle dieselbe Protokollversion spricht. */
export function isCompatibleVersion(version: unknown): version is ProtocolVersion {
  return version === PROTOCOL_VERSION;
}
