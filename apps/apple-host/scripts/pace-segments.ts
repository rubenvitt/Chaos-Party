// Längste Bauschritte je Minispiel (CHAOS-209): Jeder Abschnitt zwischen zwei `ctx.pace()` und
// jeder Schritt der Bühne danach (Klassifizieren, Kodieren der Geometrie) wird einzeln gemessen.
// Budget 0 heißt: `pace` gibt bei jedem Aufruf ab, jedes „Bild“ ist genau ein Bauschritt. Die
// Stellen (von → bis) kommen aus dem Stack der `pace`-Aufrufe am Anfang und Ende des Abschnitts.
//
//   node --experimental-transform-types --no-warnings --no-opt --no-sparkplug --no-maglev \
//     apps/apple-host/scripts/pace-segments.ts [--runs 3] [--top 5 | --over 4] [--only <id>]
//
// Die Flags machen Node zum reinen Interpreter, als Näherung an JavaScriptCore ohne JIT (EXP-024).
// Ohne sie misst das Skript mit JIT (nur Reihenfolge, keine Aussage zur Apple TV).
import { MINIGAME_MODULES } from '@chaos-party/minigames';
import type { MinigamePlayer, PrepareThrottle } from '@chaos-party/minigame-sdk/babylon';
import { loadHavokForNode } from '@chaos-party/minigame-sdk/testing';
import { createHeadlessStage } from '../src/stage.ts';

const PLAYERS: MinigamePlayer[] = [
  { slot: 1, name: 'Anna', color: '#0072B2', symbol: '●', character: 'raccoon' },
  { slot: 2, name: 'Ben', color: '#E69F00', symbol: '▲', character: 'sock' },
  { slot: 3, name: 'Cem', color: '#009E73', symbol: '■', character: 'raccoon' },
  { slot: 4, name: 'Dana', color: '#CC79A7', symbol: '◆', character: 'sock' },
];
/** Wie `main.ts` bei 60 Hz: so viele Zeichen Geometrie und so viele ms Kodieren je `renderState`. */
const GEOMETRY_CHARS_PER_FRAME = 256 * 1024;
const GEOMETRY_BUDGET_MS = 2;

const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const index = args.indexOf(name);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const top = option('--top', 5);
const runs = option('--runs', 1);
/** Mit `--over N` alle Abschnitte über N ms statt der `--top` längsten. */
const over = option('--over', Number.POSITIVE_INFINITY);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;

interface Segment {
  readonly where: string;
  readonly ms: number;
}

/** Erste Stelle im Stack außerhalb von Runner/Bühne/Skript: der `pace`-Aufruf des Minispiels. */
function caller(): string {
  const lines = (new Error().stack ?? '').split('\n').slice(2);
  for (const line of lines) {
    if (/pace-segments|node:internal|runner\.ts|<anonymous>|\.pace \(|at pace /.test(line))
      continue;
    const match = /(?:packages|apps)\/(.+?):(\d+):\d+\)?$/.exec(line.trim());
    if (match) return `${match[1]}:${match[2]}`;
  }
  return '?';
}

async function measure(havok: Awaited<ReturnType<typeof loadHavokForNode>>) {
  const report: { id: string; total: number; steps: number; worst: Segment[] }[] = [];
  for (const module of MINIGAME_MODULES) {
    if (only && module.info.id !== only) continue;
    const segments: Segment[] = [];
    let started = performance.now();
    let from = 'Start';
    const pacing: PrepareThrottle = {
      budgetMs: 0,
      now: () => performance.now(),
      nextFrame: () => {
        const ms = performance.now() - started;
        const here = caller();
        segments.push({ where: `${from} → ${here}`, ms });
        from = here;
        return new Promise((resolve) =>
          setImmediate(() => {
            started = performance.now();
            resolve();
          }),
        );
      },
    };
    started = performance.now();
    const stage = createHeadlessStage({
      module,
      players: PLAYERS,
      seed: 7,
      timeLimitMs: 30_000,
      havok: module.info.physics ? havok : null,
      onResult: () => undefined,
      log: (line) => {
        console.error(line);
      },
      pacing,
    });
    // Der erste Abschnitt („Start → …“) enthält den synchronen Teil (Szene, Laufzeit, Beginn von `prepare`).
    let guard = 0;
    while (!stage.ready && guard++ < 50_000) await new Promise((r) => setImmediate(r));
    // Kodieren wie in `renderState`, dazu JSON wie beim Ausliefern.
    for (let i = 0; i < 10_000; i++) {
      const t = performance.now();
      const geometry = stage.takeGeometry(GEOMETRY_CHARS_PER_FRAME, GEOMETRY_BUDGET_MS);
      const take = performance.now() - t;
      if (geometry.length === 0) break;
      const j = performance.now();
      const chars = JSON.stringify(geometry).length;
      segments.push({ where: `takeGeometry (${geometry.length} Stück)`, ms: take });
      segments.push({
        where: `JSON Geometrie ${Math.round(chars / 1024)} KiB`,
        ms: performance.now() - j,
      });
    }
    const s = performance.now();
    stage.start();
    stage.advance(1 / 60);
    segments.push({ where: 'start + erstes advance', ms: performance.now() - s });
    stage.dispose();
    const total = segments.reduce((sum, seg) => sum + seg.ms, 0);
    const sorted = [...segments].sort((a, b) => b.ms - a.ms);
    const worst = Number.isFinite(over)
      ? sorted.filter((seg) => seg.ms > over)
      : sorted.slice(0, top);
    report.push({ id: module.info.id, total, steps: segments.length, worst });
  }
  return report;
}

const havok = await loadHavokForNode();
const round = (ms: number) => Math.round(ms * 10) / 10;
for (let run = 1; run <= runs; run++) {
  const report = await measure(havok);
  console.log(`\nLauf ${run}:`);
  for (const entry of report) {
    console.log(`${entry.id}: ${entry.steps} Schritte, zusammen ${round(entry.total)} ms`);
    for (const seg of entry.worst)
      console.log(`  ${round(seg.ms).toFixed(1).padStart(6)} ms  ${seg.where}`);
  }
}
