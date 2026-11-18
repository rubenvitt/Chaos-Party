/**
 * Regressionstest CHAOS-126: Viele Headless-Läufe in einem Prozess dürfen den Heap nicht
 * wachsen lassen. Vorher hielt Babylons `TimingTools.SetImmediate`-Warteschlange jede
 * entsorgte Szene fest (≈ 3,6 MB je Lauf bei Kuckucks-Klatsche), weil die Schleife nur
 * Mikrotasks abwartete; `runMinigameHeadless` leert sie jetzt mit `flushBabylonTimers()`.
 *
 * Kuckucks-Klatsche ist das schnellste Minispiel und hatte das größte Leck. `gc` holt sich der
 * Test selbst (kein `--expose-gc` nötig).
 */
import { runMinigameHeadless } from '@chaos-party/minigame-sdk/testing';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { kuckucksKlatsche } from './kuckucks-klatsche/index.ts';

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

const WARMUP = 10;
const RUNS = 100;
/** Akzeptanzkriterium CHAOS-126: Zuwachs je Lauf < 0,1 MB. */
const MAX_GROWTH_PER_RUN_BYTES = 100_000;

describe('Headless-Harness: Speicher (CHAOS-126)', () => {
  it(`${RUNS} Läufe ohne Heap-Zuwachs`, async () => {
    let seed = 1;
    for (let i = 0; i < WARMUP; i++) {
      await runMinigameHeadless(kuckucksKlatsche, { seed: seed++, timeLimitMs: 3_000 });
    }
    gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < RUNS; i++) {
      await runMinigameHeadless(kuckucksKlatsche, { seed: seed++, timeLimitMs: 3_000 });
    }
    gc();
    const growthPerRun = (process.memoryUsage().heapUsed - before) / RUNS;
    expect(growthPerRun).toBeLessThan(MAX_GROWTH_PER_RUN_BYTES);
  }, 120_000);
});
