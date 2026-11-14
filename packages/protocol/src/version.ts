/** Ganzzahlige Protokollversion. Erhöhen bei jeder inkompatiblen Änderung. */
export const PROTOCOL_VERSION = 1;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Prüft, ob eine Gegenstelle dieselbe Protokollversion spricht. */
export function isCompatibleVersion(version: unknown): version is ProtocolVersion {
  return version === PROTOCOL_VERSION;
}
