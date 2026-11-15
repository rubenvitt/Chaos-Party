/**
 * Neuester Brett-Stand des Servers für die Minispiel-Bühne (M3, CHAOS-26).
 *
 * Die Regie (`board/director.ts`) zeigt Stände erst, wenn ihre Ereignisse animiert sind –
 * richtig fürs Brett. Die Minispiel-Bühne braucht dagegen den **neuesten** Stand mit
 * Empfangszeit: Phasenwechsel (Intro → Spiel → Ergebnis) und Restzeiten gelten ab Empfang,
 * auch wenn das Brett gerade nicht gerendert wird. Dazu sammelt der Feed die Münzgewinne des
 * laufenden Minispiels aus `coins-changed` (Grund `minigame`), denn `BoardView` enthält sie
 * nicht.
 *
 * `eventSeq` wird wie in der Regie beachtet: Doppeltes zählt nicht doppelt.
 */
import type { BoardMessage, BoardView, SlotNumber } from '@chaos-party/protocol';

export interface MinigameRewards {
  /** Runde des Minispiels, zu dem die Gewinne gehören. */
  readonly round: number;
  readonly bySlot: Readonly<Partial<Record<SlotNumber, number>>>;
}

export interface BoardFeedSnapshot {
  readonly view: BoardView | null;
  /** Empfangszeit des Stands (`now()`, Standard `performance.now()`). */
  readonly receivedAt: number;
  /** Münzgewinne des aktuellen Minispiels (oder `null`, wenn keine bekannt). */
  readonly rewards: MinigameRewards | null;
}

export interface BoardFeed {
  receive(message: BoardMessage): void;
  getSnapshot(): BoardFeedSnapshot;
  subscribe(listener: () => void): () => void;
}

const EMPTY: BoardFeedSnapshot = { view: null, receivedAt: 0, rewards: null };

export function createBoardFeed(now: () => number = () => performance.now()): BoardFeed {
  let snapshot = EMPTY;
  let nextSeq: number | null = null;
  const listeners = new Set<() => void>();

  return {
    receive(message) {
      const { view, events, eventSeq } = message;
      const end = eventSeq + events.length;
      // Veraltete Nachricht (älter als das schon Gesehene): ignorieren.
      if (nextSeq !== null && end < nextSeq) return;
      const fresh =
        nextSeq === null || eventSeq >= nextSeq ? events : events.slice(nextSeq - eventSeq);
      nextSeq = Math.max(end, nextSeq ?? 0);

      const round = view.minigame?.round ?? view.round;
      let rewards = snapshot.rewards;
      if (rewards && view.minigame && rewards.round !== view.minigame.round) rewards = null;
      for (const event of fresh) {
        if (event.type === 'minigame-started') {
          rewards = { round, bySlot: {} };
        } else if (event.type === 'coins-changed' && event.reason === 'minigame') {
          const base = rewards?.round === round ? rewards.bySlot : {};
          rewards = {
            round,
            bySlot: { ...base, [event.slot]: (base[event.slot] ?? 0) + event.delta },
          };
        }
      }
      snapshot = { view, receivedAt: now(), rewards };
      for (const listener of [...listeners]) listener();
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
