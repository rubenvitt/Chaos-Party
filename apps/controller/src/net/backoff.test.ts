import { describe, expect, it } from 'vitest';
import { BACKOFF_MAX_MS, backoffDelay } from './backoff.ts';

describe('backoffDelay', () => {
  it('steigt 0,5 s → 1 s → 2 s → 4 s und bleibt dann bei 5 s', () => {
    const middle = () => 0.5;
    expect([1, 2, 3, 4, 5, 6, 50].map((attempt) => backoffDelay(attempt, middle))).toEqual([
      500, 1000, 2000, 4000, 5000, 5000, 5000,
    ]);
  });

  it('streut ±20 %, überschreitet aber nie 5 s', () => {
    expect(backoffDelay(1, () => 0)).toBe(400);
    expect(backoffDelay(1, () => 0.999_999)).toBe(600);
    expect(backoffDelay(4, () => 0.999_999)).toBe(4800);
    expect(backoffDelay(5, () => 0.999_999)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(9, () => 0)).toBe(4000);
    for (let attempt = 1; attempt < 20; attempt++) {
      const delay = backoffDelay(attempt);
      expect(delay).toBeGreaterThanOrEqual(400);
      expect(delay).toBeLessThanOrEqual(BACKOFF_MAX_MS);
    }
  });

  it('behandelt Versuch 0 und Unsinn wie den ersten Versuch', () => {
    expect(backoffDelay(0, () => 0.5)).toBe(500);
    expect(backoffDelay(-3, () => 0.5)).toBe(500);
  });
});
