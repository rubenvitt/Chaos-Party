import { describe, expect, it } from 'vitest';
import { createRng } from './rng.ts';

describe('createRng', () => {
  it('liefert bei gleichem Seed dieselbe Folge', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('liefert bei anderem Seed eine andere Folge', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('bleibt in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('kann über state() fortgesetzt werden', () => {
    const a = createRng(99);
    a.next();
    a.next();
    const resumed = createRng(a.state());
    expect(resumed.next()).toBe(a.next());
  });

  it('würfelt 1–6 inklusive Grenzen und ungefähr gleichverteilt', () => {
    const rng = createRng(2026);
    const counts = new Map<number, number>();
    const rolls = 60_000;
    for (let i = 0; i < rolls; i++) {
      const v = rng.int(1, 6);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const count of counts.values()) {
      expect(count / rolls).toBeCloseTo(1 / 6, 1);
    }
  });

  it('lehnt ungültige Eingaben ab', () => {
    expect(() => createRng(1.5)).toThrow(RangeError);
    const rng = createRng(1);
    expect(() => rng.int(3, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
  });
});
