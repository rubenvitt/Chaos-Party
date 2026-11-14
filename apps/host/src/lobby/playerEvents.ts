/**
 * Verbindungsereignisse der Spieler aus zwei aufeinanderfolgenden Lobby-Schnappschüssen
 * (CHAOS-12, ADR-009). Rein und unit-getestet; `PlayerToasts` zeigt sie groß am PC an.
 */
import type { HostPlayer } from '../players.ts';
import type { PlayerSlot } from '../scene/types.ts';

export type PlayerEventKind = 'lost' | 'back' | 'released';

export interface PlayerEvent {
  readonly kind: PlayerEventKind;
  readonly slot: PlayerSlot;
  readonly label: string;
  readonly color: string;
  readonly symbol: string;
}

/**
 * - `lost`: war verbunden, ist jetzt getrennt,
 * - `back`: war getrennt, ist wieder verbunden,
 * - `released`: getrennter Spieler ist verschwunden (Lobby-Schonfrist abgelaufen, Platz frei).
 *
 * Ohne vorherigen Schnappschuss (Seite neu geladen, Host neu verbunden) gibt es keine
 * Ereignisse – sonst meldete jeder Neustart alle Getrennten erneut.
 */
export function diffPlayers(
  previous: readonly HostPlayer[] | null,
  next: readonly HostPlayer[],
): PlayerEvent[] {
  if (previous === null) return [];
  const before = new Map(previous.map((player) => [player.slot, player]));
  const events: PlayerEvent[] = [];
  for (const player of next) {
    const old = before.get(player.slot);
    if (!old) continue;
    if (old.connected && !player.connected) events.push(toEvent('lost', player));
    else if (!old.connected && player.connected) events.push(toEvent('back', player));
  }
  const now = new Set(next.map((player) => player.slot));
  for (const old of previous) {
    if (!now.has(old.slot) && !old.connected) events.push(toEvent('released', old));
  }
  return events.sort((a, b) => a.slot - b.slot);
}

export function playerEventText(event: PlayerEvent): string {
  switch (event.kind) {
    case 'lost':
      return `${event.label} hat die Verbindung verloren`;
    case 'back':
      return `${event.label} ist wieder da`;
    case 'released':
      return `Platz von ${event.label} ist wieder frei`;
  }
}

function toEvent(kind: PlayerEventKind, player: HostPlayer): PlayerEvent {
  return {
    kind,
    slot: player.slot,
    label: player.label,
    color: player.color,
    symbol: player.symbol,
  };
}
