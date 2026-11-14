import { PLAYER_SLOTS as SLOT_STYLES, type LobbyPlayer } from '@chaos-party/protocol';
import { PLAYER_SLOTS, type PlayerSlot, type ScenePlayer } from './scene/types.ts';

/** Spieler, wie HUD und Lobby ihn anzeigen: Szenendaten plus Symbol und Bereitschaft. */
export interface HostPlayer extends ScenePlayer {
  /** Farbunabhängige Kennung aus dem Protokoll (●, ▲, ■, ★). */
  readonly symbol: string;
  readonly ready: boolean;
}

/** Symbol eines Slots (Farben und Bezeichnungen kommen aus `@chaos-party/protocol`). */
export function slotSymbol(slot: PlayerSlot): string {
  return SLOT_STYLES[slot].symbol;
}

/** Lokale Demo-Spieler für die ersten `count` Slots (`?local=1`, Tastatur). */
export function createLocalPlayers(count: number): HostPlayer[] {
  return PLAYER_SLOTS.slice(0, Math.min(4, Math.max(0, count))).map((slot) => ({
    slot,
    color: SLOT_STYLES[slot].color,
    label: SLOT_STYLES[slot].label,
    symbol: SLOT_STYLES[slot].symbol,
    connected: true,
    ready: true,
  }));
}

/**
 * Spieler aus dem `lobby`-Schnappschuss des Servers: nur beigetretene Slots,
 * Farbe und Bezeichnung so, wie der Server sie vergeben hat. Getrennte Spieler
 * bleiben sichtbar (halbtransparent, ohne Eingaben), bis CHAOS-12 Timeouts regelt.
 */
export function playersFromLobby(players: readonly LobbyPlayer[]): HostPlayer[] {
  return [...players]
    .sort((a, b) => a.slot - b.slot)
    .map((p) => ({
      slot: p.slot,
      color: p.color,
      label: p.label,
      symbol: slotSymbol(p.slot),
      connected: p.connected,
      ready: p.ready,
    }));
}
