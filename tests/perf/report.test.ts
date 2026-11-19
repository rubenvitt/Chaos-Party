import { describe, expect, it } from 'vitest';
import {
  compareScenes,
  MIN_FRAMES_FOR_MEDIAN,
  MIN_FRAMES_FOR_P95,
  type FlatMetrics,
} from './report.ts';

const BASE: FlatMetrics = {
  frames: 200,
  frameMedian: 300,
  frameP95: 500,
  renderMedian: 8,
  renderP95: 14,
  drawCallsMedian: 100,
  contextsMax: 1,
  renderLoopsMax: 1,
  heapRetainedMB: 50,
};

function statusOf(frames: number, current: Partial<FlatMetrics>) {
  const [comparison] = compareScenes({ szene: BASE }, { szene: { ...BASE, frames, ...current } });
  return Object.fromEntries((comparison?.results ?? []).map((r) => [r.metric, r.status] as const));
}

describe('compareScenes (CHAOS-165)', () => {
  it('vergleicht p95 ab MIN_FRAMES_FOR_P95 Bildern', () => {
    const status = statusOf(MIN_FRAMES_FOR_P95, { renderP95: 47 });
    expect(status.renderP95).toBe('regression');
    expect(status.renderMedian).toBe('ok');
  });

  it('meldet einen Ausreißer im p95 bei wenigen Bildern nicht als Regression', () => {
    const status = statusOf(MIN_FRAMES_FOR_P95 - 1, { renderP95: 47, frameP95: 900 });
    expect(status.renderP95).toBe('zu wenige Bilder');
    expect(status.frameP95).toBe('zu wenige Bilder');
  });

  it('erkennt bei wenigen Bildern eine echte Verlangsamung über den Median', () => {
    const status = statusOf(30, { renderMedian: 16, frameMedian: 450 });
    expect(status.renderMedian).toBe('regression');
    expect(status.frameMedian).toBe('regression');
  });

  it('vergleicht unter MIN_FRAMES_FOR_MEDIAN Bildern auch keinen Median', () => {
    const status = statusOf(MIN_FRAMES_FOR_MEDIAN - 1, { renderMedian: 40 });
    expect(status.renderMedian).toBe('zu wenige Bilder');
    expect(status.heapRetainedMB).toBe('ok');
  });

  it('prüft strukturelle Kennzahlen unabhängig von der Bildzahl', () => {
    expect(statusOf(3, { drawCallsMedian: 200 }).drawCallsMedian).toBe('regression');
  });
});
