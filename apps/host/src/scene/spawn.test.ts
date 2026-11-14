import { describe, expect, it } from 'vitest';
import { computeSpawnPoints } from './spawn.ts';
import { PLAYER_SLOTS } from './types.ts';

const AREA = { halfWidth: 7, halfDepth: 3.7, minDistance: 2.6 };

describe('computeSpawnPoints', () => {
  it('ist bei gleichem Seed identisch', () => {
    expect(computeSpawnPoints(2026, AREA)).toEqual(computeSpawnPoints(2026, AREA));
  });

  it('unterscheidet sich bei anderem Seed', () => {
    expect(computeSpawnPoints(1, AREA)).not.toEqual(computeSpawnPoints(2, AREA));
  });

  it('liefert vier Punkte im Bereich mit Mindestabstand', () => {
    for (let seed = 0; seed < 50; seed++) {
      const points = computeSpawnPoints(seed, AREA);
      const list = PLAYER_SLOTS.map((slot) => points[slot]);
      for (const p of list) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(AREA.halfWidth);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(AREA.halfDepth);
      }
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (!a || !b) throw new Error('Punkt fehlt');
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(AREA.minDistance);
        }
      }
    }
  });

  it('fällt bei zu engem Bereich auf verschiedene Ecken zurück', () => {
    const points = computeSpawnPoints(7, { halfWidth: 1, halfDepth: 1, minDistance: 50 });
    const keys = new Set(PLAYER_SLOTS.map((s) => `${points[s].x},${points[s].z}`));
    expect(keys.size).toBe(4);
  });
});
