/**
 * Auswertung der Messläufe (CHAOS-39): Kennzahlen je Szene flach machen, gegen die Baseline
 * vergleichen und als Markdown-Tabelle ausgeben.
 *
 * Zwei Arten von Schwellen (Begründung in `docs/performance.md`):
 * - **strukturell** (immer geprüft, rechnerunabhängig): WebGL-Kontexte und Render-Schleifen je
 *   Szene dürfen nicht steigen; Draw Calls höchstens +10 % (+5).
 * - **zeitlich** (nur mit `PERF_STRICT=1`, gleicher Rechner nötig): Bildabstand p95 und
 *   Render-Zeit p95 höchstens +25 % (+4 ms bzw. +2 ms), Heap-Höchstwert +20 % (+10 MB).
 */
import {
  compareToBaseline,
  type RegressionResult,
  type Tolerance,
} from '../../packages/metrics/src/index.ts';
import type { ScenePerf } from '../../apps/host/src/debug/perfMonitor.ts';

export const STRUCTURAL: Readonly<Record<string, Tolerance>> = {
  contextsMax: { relative: 0, absolute: 0 },
  renderLoopsMax: { relative: 0, absolute: 0 },
  drawCallsMedian: { relative: 0.1, absolute: 5 },
};

export const TIMING: Readonly<Record<string, Tolerance>> = {
  frameP95: { relative: 0.25, absolute: 4 },
  renderP95: { relative: 0.25, absolute: 2 },
  heapMaxMB: { relative: 0.2, absolute: 10 },
};

export type FlatMetrics = Record<string, number | null>;

const MB = 1024 * 1024;

/** Kennzahlen einer Szene als flache Werte (Schlüssel wie in `STRUCTURAL`/`TIMING`). */
export function flatten(scene: ScenePerf): FlatMetrics {
  return {
    frames: scene.frames,
    durationS: scene.durationMs / 1000,
    fps: scene.fps,
    frameMedian: scene.frameTime?.median ?? null,
    frameP95: scene.frameTime?.p95 ?? null,
    renderMedian: scene.renderMs?.median ?? null,
    renderP95: scene.renderMs?.p95 ?? null,
    drawCallsMedian: scene.drawCalls?.median ?? null,
    drawCallsMax: scene.drawCalls?.max ?? null,
    activeMeshesMedian: scene.activeMeshes?.median ?? null,
    inputToFrameMedian: scene.inputToFrame?.median ?? null,
    inputToFrameP95: scene.inputToFrame?.p95 ?? null,
    inputCount: scene.inputToFrame?.count ?? 0,
    boardToFrameMedian: scene.boardToFrame?.median ?? null,
    boardToFrameP95: scene.boardToFrame?.p95 ?? null,
    contextsMax: scene.contextsMax,
    renderLoopsMax: scene.renderLoopsMax,
    heapMaxMB: scene.heapMaxBytes === null ? null : scene.heapMaxBytes / MB,
    meshes: scene.resources?.meshes ?? null,
    materials: scene.resources?.materials ?? null,
    textures: scene.resources?.textures ?? null,
    textureMB: scene.resources ? scene.resources.textureBytes / MB : null,
  };
}

export interface SceneComparison {
  readonly scene: string;
  readonly results: readonly (RegressionResult & { readonly kind: 'strukturell' | 'zeitlich' })[];
}

/** Vergleicht jede Szene der Messung mit derselben Szene der Baseline. */
export function compareScenes(
  baseline: Readonly<Record<string, FlatMetrics>>,
  current: Readonly<Record<string, FlatMetrics>>,
): SceneComparison[] {
  return Object.keys(current).map((scene) => {
    const base = baseline[scene] ?? {};
    const now = current[scene] ?? {};
    return {
      scene,
      results: [
        ...compareToBaseline(base, now, STRUCTURAL).map((r) => ({
          ...r,
          kind: 'strukturell' as const,
        })),
        ...compareToBaseline(base, now, TIMING).map((r) => ({ ...r, kind: 'zeitlich' as const })),
      ],
    };
  });
}

function fmt(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '–'
    : value.toFixed(digits);
}

/** Markdown-Tabelle der Kennzahlen je Szene. */
export function sceneTable(scenes: Readonly<Record<string, FlatMetrics>>): string {
  const head =
    '| Szene | s | Frames | fps | Bildabstand p50/p95 ms | Render p50/p95 ms | Draw Calls p50/max | aktive Meshes | Eingabe→Frame p50/p95 ms (n) | Brett→Frame p50/p95 ms | Kontexte | Schleifen | Heap max MB | Texturen ~MB |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const rows = Object.entries(scenes).map(([scene, m]) =>
    [
      scene,
      fmt(m.durationS, 0),
      fmt(m.frames, 0),
      fmt(m.fps),
      `${fmt(m.frameMedian)} / ${fmt(m.frameP95)}`,
      `${fmt(m.renderMedian)} / ${fmt(m.renderP95)}`,
      `${fmt(m.drawCallsMedian, 0)} / ${fmt(m.drawCallsMax, 0)}`,
      fmt(m.activeMeshesMedian, 0),
      `${fmt(m.inputToFrameMedian)} / ${fmt(m.inputToFrameP95)} (${fmt(m.inputCount, 0)})`,
      `${fmt(m.boardToFrameMedian)} / ${fmt(m.boardToFrameP95)}`,
      fmt(m.contextsMax, 0),
      fmt(m.renderLoopsMax, 0),
      fmt(m.heapMaxMB),
      fmt(m.textureMB),
    ].join(' | '),
  );
  return [head, sep, ...rows.map((row) => `| ${row} |`)].join('\n');
}

/** Tabelle der Vergleiche; nur Abweichungen und fehlende Werte, damit sie lesbar bleibt. */
export function comparisonTable(comparisons: readonly SceneComparison[]): string {
  const rows = comparisons.flatMap((comparison) =>
    comparison.results.map(
      (r) =>
        `| ${comparison.scene} | ${r.metric} | ${r.kind} | ${fmt(r.baseline)} | ${fmt(r.current)} | ${fmt(r.limit)} | ${r.status} |`,
    ),
  );
  return [
    '| Szene | Kennzahl | Art | Baseline | jetzt | Grenze | Status |',
    '|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}
