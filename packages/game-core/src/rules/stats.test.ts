import { describe, expect, it } from 'vitest';
import type { CoinReason, GameEvent, PlayerStats, Slot } from '../types.ts';
import type { Ctx } from './internal.ts';
import { tallyStats } from './stats.ts';

const coins = (slot: Slot, delta: number, reason: CoinReason): GameEvent => ({
  type: 'coins-changed',
  slot,
  delta,
  balance: 50,
  reason,
});

function tally(events: GameEvent[]): PlayerStats {
  const stats = { coinsEarned: 0, coinsLost: 0, spacesMoved: 0, itemsUsed: 0 };
  // Nur die Felder, die `tallyStats` liest.
  const ctx = { d: { players: [{ slot: 1, stats }] }, events } as unknown as Ctx;
  tallyStats(ctx);
  return stats;
}

describe('tallyStats', () => {
  it('Pechvogel-Verluste: Minus-Feld, Klau und Falle zählen, Trophäenkauf nicht (CHAOS-123)', () => {
    const stats = tally([
      coins(1, -3, 'space'),
      coins(1, -5, 'steal'),
      coins(1, -4, 'trap'),
      coins(1, -20, 'trophy'),
      coins(1, 7, 'minigame'),
      coins(1, 2, 'steal'),
    ]);
    expect(stats.coinsLost).toBe(12);
    expect(stats.coinsEarned).toBe(9);
  });

  it('Trophäenkauf allein ergibt keinen Verlust', () => {
    expect(tally([coins(1, -20, 'trophy')]).coinsLost).toBe(0);
  });
});
