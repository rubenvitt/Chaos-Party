import { describe, expect, it } from 'vitest';
import { createRng, pickOne, pickWeighted, shuffled } from './rng.ts';

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

describe('Zufallshelfer', () => {
  it('pickOne zieht nur aus der Liste und lehnt leere Listen ab', () => {
    const rng = createRng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickOne(rng, ['a', 'b', 'c']));
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
    expect(() => pickOne(rng, [])).toThrow(RangeError);
  });

  it('shuffled mischt deterministisch und lässt die Eingabe unverändert', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8] as const;
    const a = shuffled(createRng(11), input);
    const b = shuffled(createRng(11), input);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([...input]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const other = shuffled(createRng(12), input);
    expect(other).not.toEqual(a);
  });

  it('pickWeighted folgt den Gewichten und ignoriert Gewicht 0', () => {
    const rng = createRng(3);
    const counts = { a: 0, b: 0, c: 0 };
    const draws = 30_000;
    for (let i = 0; i < draws; i++) {
      const v = pickWeighted(rng, [
        ['a', 3],
        ['b', 1],
        ['c', 0],
      ] as const);
      if (v !== null) counts[v]++;
    }
    expect(counts.c).toBe(0);
    expect(counts.a / draws).toBeCloseTo(0.75, 1);
    expect(counts.b / draws).toBeCloseTo(0.25, 1);
  });

  it('pickWeighted liefert null ohne positives Gewicht und verbraucht dann keinen Zufall', () => {
    const rng = createRng(9);
    const before = rng.state();
    expect(pickWeighted(rng, [['x', 0]] as const)).toBeNull();
    expect(rng.state()).toBe(before);
    expect(() => pickWeighted(rng, [['x', Number.NaN]] as const)).toThrow(RangeError);
  });
});
