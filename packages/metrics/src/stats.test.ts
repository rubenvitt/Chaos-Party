import { describe, expect, it } from 'vitest';
import { median, percentile, summarize } from './stats.ts';

describe('median', () => {
  it('ist null für eine leere Reihe', () => {
    expect(median([])).toBeNull();
  });

  it('nimmt bei ungerader Anzahl den mittleren Wert (unsortierte Eingabe)', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([7])).toBe(7);
  });

  it('mittelt bei gerader Anzahl die beiden mittleren Werte', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('ignoriert nicht endliche Werte', () => {
    expect(median([Number.NaN, 2, Number.POSITIVE_INFINITY, 4])).toBe(3);
    expect(median([Number.NaN])).toBeNull();
  });

  it('verändert die Eingabe nicht', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('percentile (Nearest-Rank)', () => {
  const oneToHundred = Array.from({ length: 100 }, (_, i) => i + 1);

  it('ist null für eine leere Reihe', () => {
    expect(percentile([], 95)).toBeNull();
  });

  it('liefert bei 1…100 genau p', () => {
    expect(percentile(oneToHundred, 95)).toBe(95);
    expect(percentile(oneToHundred, 50)).toBe(50);
    expect(percentile(oneToHundred, 100)).toBe(100);
    expect(percentile(oneToHundred, 1)).toBe(1);
  });

  it('liefert bei 20 Werten den zweitgrößten als p95, bei weniger als 20 den größten', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    expect(percentile(twenty, 95)).toBe(190);
    expect(percentile([5, 1, 3], 95)).toBe(5);
  });

  it('begrenzt p auf 0…100', () => {
    expect(percentile([3, 1, 2], 0)).toBe(1);
    expect(percentile([3, 1, 2], -5)).toBe(1);
    expect(percentile([3, 1, 2], 150)).toBe(3);
  });

  it('liefert immer einen gemessenen Wert', () => {
    expect(percentile([10, 20], 95)).toBe(20);
    expect(percentile([10, 20], 50)).toBe(10);
  });
});

describe('summarize', () => {
  it('ist null für eine leere Reihe', () => {
    expect(summarize([])).toBeNull();
    expect(summarize([Number.NaN])).toBeNull();
  });

  it('fasst eine bekannte Reihe zusammen', () => {
    expect(summarize([16, 17, 15, 50, 16])).toEqual({
      count: 5,
      median: 16,
      p95: 50,
      min: 15,
      max: 50,
      mean: 22.8,
    });
  });
});
