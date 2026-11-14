import { PLAYER_SLOTS, type ScenePlayer } from './scene/types.ts';

/**
 * Vorläufige Spielerfarben (hell, gut unterscheidbar, auch für Rot-Grün-Schwäche
 * über Helligkeit unterscheidbar). Wandert später ins Protokoll bzw. die Lobby.
 */
export const PLAYER_COLORS = {
  1: '#ff5a5f', // Korallenrot
  2: '#3ba7ff', // Himmelblau
  3: '#ffc83d', // Sonnengelb
  4: '#3ddc84', // Minzgrün
} as const;

/** Lokale Demo-Spieler für die ersten `count` Slots (bis die Lobby echte Spieler liefert). */
export function createLocalPlayers(count: number): ScenePlayer[] {
  return PLAYER_SLOTS.slice(0, Math.min(4, Math.max(0, count))).map((slot) => ({
    slot,
    color: PLAYER_COLORS[slot],
    label: `Spieler ${slot}`,
    connected: true,
  }));
}
