/**
 * Gemeinsamer Vertrag zwischen Controller, Server und Host.
 *
 * Nachrichtentypen, Schemas und Laufzeitvalidierung folgen in CHAOS-7.
 * Hier steht vorerst nur die Protokollversion, damit alle Apps denselben
 * Vertrag importieren und der Workspace-Verbund getestet ist.
 */

/** Ganzzahlige Protokollversion. Erhöhen bei jeder inkompatiblen Änderung. */
export const PROTOCOL_VERSION = 1;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Prüft, ob eine Gegenstelle dieselbe Protokollversion spricht. */
export function isCompatibleVersion(version: unknown): version is ProtocolVersion {
  return version === PROTOCOL_VERSION;
}
