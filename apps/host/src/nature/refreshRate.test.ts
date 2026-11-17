import { beforeEach, describe, expect, it } from 'vitest';
import { seeded } from './noise.ts';
import {
  createRefreshEstimator,
  estimateRefreshHz,
  recordFrameInterval,
  REFRESH,
  resetSessionRefresh,
  sessionRefreshHz,
  startRefreshProbe,
} from './refreshRate.ts';

/** `count` Bildabstände um `ms` mit ±`jitter` ms Zittern (deterministisch). */
function intervals(ms: number, count: number, jitter = 1.5, seed = 7): number[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ms + (random() * 2 - 1) * jitter);
}

describe('Bildwiederholrate schätzen (CHAOS-76)', () => {
  beforeEach(resetSessionRefresh);

  it('erkennt 60, 30, 50 und 144 Hz trotz Zittern', () => {
    expect(estimateRefreshHz(intervals(1000 / 60, 60))).toBeCloseTo(60, -0.5);
    expect(estimateRefreshHz(intervals(1000 / 30, 60))).toBeCloseTo(30, -0.5);
    expect(estimateRefreshHz(intervals(20, 60))).toBeCloseTo(50, -0.5);
    expect(estimateRefreshHz(intervals(1000 / 144, 60, 0.4))).toBeCloseTo(144, -1);
  });

  it('lange Bilder (Laden, langsame GPU) verschieben die Rate nicht', () => {
    // 60 Hz, aber ein Drittel der Bilder verpasst den Takt (33 ms) und einige hängen (120 ms).
    const mixed = [
      ...intervals(1000 / 60, 36),
      ...intervals(1000 / 30, 18, 1.5, 8),
      ...intervals(120, 6, 10, 9),
    ];
    expect(estimateRefreshHz(mixed)).toBeCloseTo(60, -0.5);
  });

  it('einzelne kurze Ausreißer sind kein schnellerer Bildschirm', () => {
    // 30 Hz mit wenigen verkürzten Abständen (Callback kam nach einem verspäteten früher).
    const noisy = [...intervals(1000 / 30, 56), 8, 12, 16, 20];
    expect(estimateRefreshHz(noisy)).toBeCloseTo(30, -0.5);
  });

  it('ohne stabilen Takt, mit zu wenigen Bildern oder nur Pausen: keine Schätzung', () => {
    const random = seeded(3);
    const chaotic = Array.from({ length: 60 }, () => 10 + random() * 90);
    expect(estimateRefreshHz(chaotic)).toBeNull();
    expect(estimateRefreshHz(intervals(1000 / 60, 10))).toBeNull();
    expect(estimateRefreshHz(Array.from({ length: 60 }, () => 2000))).toBeNull();
    expect(estimateRefreshHz(Array.from({ length: 60 }, () => 0))).toBeNull();
  });

  it('Schätzer merkt sich die höchste Rate; langsamere Pakete senken sie nicht', () => {
    const estimator = createRefreshEstimator();
    expect(estimator.hz).toBeNull();
    const changes: number[] = [];
    for (const ms of intervals(1000 / 60, REFRESH.batch)) {
      const next = estimator.sample(ms);
      if (next !== null) changes.push(next);
    }
    expect(changes).toHaveLength(1);
    expect(estimator.hz).toBeCloseTo(60, -0.5);
    for (const ms of intervals(1000 / 30, REFRESH.batch * 3)) estimator.sample(ms);
    expect(estimator.hz).toBeCloseTo(60, -0.5);
    // Pausen und Unsinn zählen nicht ins Paket.
    expect(estimator.sample(Number.NaN)).toBeNull();
    expect(estimator.sample(-5)).toBeNull();
    expect(estimator.sample(5000)).toBeNull();
  });

  it('Sitzung: Abstände sammeln, zurücksetzen', () => {
    expect(sessionRefreshHz()).toBeNull();
    for (const ms of intervals(1000 / 30, REFRESH.batch)) recordFrameInterval(ms);
    expect(sessionRefreshHz()).toBeCloseTo(30, -0.5);
    resetSessionRefresh();
    expect(sessionRefreshHz()).toBeNull();
  });

  it('Startmessung zählt rAF-Abstände und hört danach auf', () => {
    let time = 0;
    let calls = 0;
    const queue: ((time: number) => void)[] = [];
    startRefreshProbe((callback) => {
      calls += 1;
      queue.push(callback);
    });
    while (queue.length > 0) {
      const callback = queue.shift();
      time += 1000 / 30;
      callback?.(time);
    }
    expect(calls).toBe(REFRESH.probeMinFrames);
    expect(sessionRefreshHz()).toBeCloseTo(30, 0);
  });

  it('Startmessung ohne erkennbaren Takt endet nach der Höchstzahl', () => {
    const random = seeded(11);
    let time = 0;
    let calls = 0;
    const queue: ((time: number) => void)[] = [];
    startRefreshProbe((callback) => {
      calls += 1;
      queue.push(callback);
    });
    while (queue.length > 0) {
      const callback = queue.shift();
      time += 10 + random() * 90;
      callback?.(time);
    }
    expect(calls).toBe(REFRESH.probeMaxFrames);
    expect(sessionRefreshHz()).toBeNull();
  });
});
