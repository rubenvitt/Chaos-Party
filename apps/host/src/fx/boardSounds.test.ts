import type { BoardEvent } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { boardEventSound } from './boardSounds.ts';

const name = (event: BoardEvent) => boardEventSound(event)?.name ?? null;

describe('boardEventSound', () => {
  it('ordnet die Brett-Ereignisse den Klängen zu', () => {
    expect(name({ type: 'turn-started', slot: 1, round: 1 })).toBe('turn');
    expect(name({ type: 'dice-rolled', slot: 1, faces: [4], total: 4 })).toBe('dice');
    expect(name({ type: 'coins-changed', slot: 1, delta: 3, balance: 13, reason: 'space' })).toBe(
      'coin-gain',
    );
    expect(name({ type: 'coins-changed', slot: 1, delta: -3, balance: 7, reason: 'space' })).toBe(
      'coin-loss',
    );
    expect(name({ type: 'coins-stolen', from: 1, to: 2, amount: 5 })).toBe('steal');
    expect(name({ type: 'trap-triggered', slot: 1, owner: 2, spaceId: 's03', amount: 4 })).toBe(
      'trap',
    );
    expect(name({ type: 'item-used', slot: 1, item: 'shield' })).toBe('shield');
    expect(name({ type: 'reaction-resolved', slot: 1, result: 'shield' })).toBe('shield');
    expect(name({ type: 'trophy-bought', slot: 1, spaceId: 's12' })).toBe('trophy');
  });

  it('keine Doppel-Klänge: Münzänderungen mit eigenem Ereignis bleiben stumm', () => {
    for (const reason of ['trophy', 'steal', 'trap'] as const) {
      expect(name({ type: 'coins-changed', slot: 1, delta: -5, balance: 0, reason })).toBeNull();
    }
    expect(name({ type: 'coins-changed', slot: 1, delta: 0, balance: 0, reason: 'space' })).toBe(
      null,
    );
    // Minispiel-Klänge spielt die Bühne.
    expect(name({ type: 'minigame-started', minigame: 'pump-parade' })).toBeNull();
    expect(name({ type: 'moved', slot: 1, path: ['s01', 's02'] })).toBeNull();
  });

  it('Falle legen ist leiser als Falle auslösen', () => {
    const placed = boardEventSound({ type: 'trap-placed', slot: 1, spaceId: 's04' });
    expect(placed?.name).toBe('trap');
    expect(placed?.options?.volume).toBeLessThan(1);
  });
});
