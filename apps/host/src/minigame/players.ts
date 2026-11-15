import { defaultCharacterFor, type Slot } from '@chaos-party/minigame-sdk';
import type { MinigamePlayer } from '@chaos-party/minigame-sdk/babylon';
import { PLAYER_SLOTS } from '@chaos-party/protocol';

/** Spieler der lokalen Vorschau: Slot-Farbe, Symbol und Standardfigur. */
export function previewPlayers(count: number): MinigamePlayer[] {
  return ([1, 2, 3, 4] as const).slice(0, count).map((slot: Slot) => ({
    slot,
    name: PLAYER_SLOTS[slot].label,
    color: PLAYER_SLOTS[slot].color,
    symbol: PLAYER_SLOTS[slot].symbol,
    character: defaultCharacterFor(slot),
  }));
}
