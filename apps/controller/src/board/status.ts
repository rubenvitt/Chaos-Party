/**
 * Was ein Slot in der Brettphase ohne eigene Entscheidung zeigt (CHAOS-22). Rein, ohne DOM.
 *
 * Namen anderer Spieler kennt der Controller nicht zwingend (nur die eigenen Slots aus
 * `welcome`); für fremde Slots reichen Farbname und Symbol aus `PLAYER_SLOTS`.
 */
import {
  PLAYER_SLOTS,
  type ControllerBoardInfo,
  type GamePhaseName,
  type PlayerInfo,
  type SlotNumber,
} from '@chaos-party/protocol';

export const LOOK_AT_SCREEN = 'Schau auf den großen Bildschirm!';

export type WaitingView =
  /** Jemand anderes ist dran: dessen Farbe/Symbol groß. */
  | { readonly kind: 'other-turn'; readonly slot: SlotNumber; readonly name: string }
  /** Ich bin dran, aber gerade ohne Entscheidung (Würfel rollt, Figur läuft). */
  | { readonly kind: 'own-turn'; readonly slot: SlotNumber }
  | { readonly kind: 'minigame' }
  /** Endstand; `place` fehlt, wenn der Server ihn (noch) nicht mitschickt. */
  | { readonly kind: 'results'; readonly place: number | null }
  | { readonly kind: 'setup' }
  /** Rundenende mit eigenen Rückenwind-Münzen (CHAOS-125). */
  | { readonly kind: 'tailwind'; readonly coins: number }
  /** Rundenende o. Ä.: niemand ist dran. */
  | { readonly kind: 'watch' };

const MINIGAME_PHASES: ReadonlySet<GamePhaseName> = new Set([
  'minigame-intro',
  'minigame-play',
  'minigame-results',
]);

/** Anzeigename eines Slots: eigener Name aus `welcome`, sonst Farbname. */
export function slotName(slot: SlotNumber, players: readonly PlayerInfo[]): string {
  return players.find((p) => p.slot === slot)?.label ?? PLAYER_SLOTS[slot].label;
}

export function describeWaiting(
  board: ControllerBoardInfo | undefined,
  ownSlot: SlotNumber,
  players: readonly PlayerInfo[],
): WaitingView {
  if (!board) return { kind: 'watch' };
  if (board.gamePhase === 'game-results') return { kind: 'results', place: board.place ?? null };
  if (MINIGAME_PHASES.has(board.gamePhase)) return { kind: 'minigame' };
  if (board.gamePhase === 'setup') return { kind: 'setup' };
  if (board.gamePhase === 'round-end' && board.tailwind !== undefined && board.tailwind > 0) {
    return { kind: 'tailwind', coins: board.tailwind };
  }
  const active = board.activeSlot;
  if (active === null) return { kind: 'watch' };
  if (active === ownSlot) return { kind: 'own-turn', slot: active };
  return { kind: 'other-turn', slot: active, name: slotName(active, players) };
}

/** „Runde 2/5“; vor der ersten Runde „Runde 1/5“. */
export function roundLabel(board: ControllerBoardInfo): string {
  const round = Math.min(Math.max(board.round, 1), Math.max(board.rounds, 1));
  return `Runde ${String(round)}/${String(board.rounds)}`;
}

/** Erklärung unter „Rückenwind: +4 Münzen!“ (CHAOS-125). */
export const TAILWIND_LEAD = 'Du liegst bei den Trophäen hinten – das hilft beim Aufholen.';

/** „Rückenwind: +4 Münzen!“ / „Rückenwind: +1 Münze!“. */
export function tailwindHeadline(coins: number): string {
  return `Rückenwind: +${String(coins)} ${coins === 1 ? 'Münze' : 'Münzen'}!`;
}

/** Text zum Endplatz. */
export function placeHeadline(place: number | null): string {
  if (place === null) return 'Spiel vorbei!';
  return place === 1 ? 'Du hast gewonnen!' : 'Gut gespielt!';
}
