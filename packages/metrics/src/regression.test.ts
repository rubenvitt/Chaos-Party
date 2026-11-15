import { describe, expect, it } from 'vitest';
import { compareToBaseline, regressionLimit } from './regression.ts';

describe('regressionLimit', () => {
  it('Baseline · (1 + relativ) + absolut', () => {
    expect(regressionLimit(10, { relative: 0.25, absolute: 2 })).toBe(14.5);
    expect(regressionLimit(4, { relative: 0, absolute: 0 })).toBe(4);
  });

  it('negative Toleranzen zählen als 0 (Grenze nie unter der Baseline)', () => {
    expect(regressionLimit(10, { relative: -0.5, absolute: -3 })).toBe(10);
  });
});

describe('compareToBaseline', () => {
  const tolerances = {
    frameP95: { relative: 0.25, absolute: 2 },
    drawCalls: { relative: 0.1, absolute: 0 },
    contexts: { relative: 0, absolute: 0 },
  };

  it('meldet Regression nur oberhalb der Grenze', () => {
    const results = compareToBaseline(
      { frameP95: 20, drawCalls: 100, contexts: 1 },
      { frameP95: 27, drawCalls: 111, contexts: 1 },
      tolerances,
    );
    expect(results.map((r) => [r.metric, r.status])).toEqual([
      ['frameP95', 'ok'],
      ['drawCalls', 'regression'],
      ['contexts', 'ok'],
    ]);
    expect(results[0]?.limit).toBe(27);
    expect(results[1]?.limit).toBeCloseTo(110);
  });

  it('Verbesserungen bestehen', () => {
    const [result] = compareToBaseline(
      { contexts: 2 },
      { contexts: 1 },
      { contexts: tolerances.contexts },
    );
    expect(result?.status).toBe('ok');
  });

  it('fehlende oder nicht endliche Werte → „fehlt“ statt stillem Bestehen', () => {
    const results = compareToBaseline(
      { frameP95: null, drawCalls: 50 },
      { frameP95: 10, drawCalls: Number.NaN },
      tolerances,
    );
    expect(results.map((r) => r.status)).toEqual(['fehlt', 'fehlt', 'fehlt']);
    expect(results[0]?.limit).toBeNull();
  });
});
