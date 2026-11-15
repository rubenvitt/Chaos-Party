/**
 * Reiner Katalog aller Minispiele (nur Steckbriefe, kein Babylon). Server, game-core-
 * Konfiguration und Controller nutzen ihn; der Host holt die Module aus `./index.ts`.
 *
 * Neues Minispiel: Ordner `src/<id>/` mit `info.ts` (rein) und `index.ts` (Modul), hier in
 * `MINIGAME_INFOS` und – wenn es in Partien vorkommen soll – in `ROTATION` eintragen, und in
 * `index.ts` das Modul registrieren.
 */
import type { MinigameInfo } from '@chaos-party/minigame-sdk';
import { PUMP_PARADE_INFO } from './pump-parade/info.ts';
import { WACKELTURM_INFO } from './wackelturm/info.ts';

export const MINIGAME_INFOS: readonly MinigameInfo[] = [PUMP_PARADE_INFO, WACKELTURM_INFO];

/**
 * Minispiele, die in echten Partien vorkommen (Reihenfolge egal; game-core mischt per Seed).
 * Solange keines eingetragen ist, läuft die Pump-Parade als Rückfall.
 */
export const ROTATION: readonly string[] = [WACKELTURM_INFO.id];

export function getMinigameInfo(id: string): MinigameInfo | undefined {
  return MINIGAME_INFOS.find((info) => info.id === id);
}

/** Steckbriefe der Rotation (oder der Rückfall). */
export function rotationInfos(): MinigameInfo[] {
  const infos = ROTATION.map((id) => getMinigameInfo(id)).filter(
    (info): info is MinigameInfo => info !== undefined,
  );
  return infos.length > 0 ? infos : [PUMP_PARADE_INFO];
}
