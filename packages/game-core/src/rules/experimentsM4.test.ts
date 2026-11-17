/**
 * Balance-Experimente M4 (CHAOS-40). Der Smoke-Test läuft immer (wenige Seeds); die vollen
 * Tabellen für `docs/experiments.md` (EXP-011 … EXP-013) nur mit Umgebungsvariable:
 *
 * ```sh
 * EXPERIMENTS=m4 pnpm exec vitest run packages/game-core/src/rules/experimentsM4.test.ts --silent=false
 * ```
 */
import { describe, expect, it } from 'vitest';
import { rotationInfos } from '@chaos-party/minigames/catalog';
import { seedRange, toMarkdown, type ExperimentSetup } from './experiments.ts';
import {
  durationExperiment,
  durationMetrics,
  FINALE_MS,
  m4Defaults,
  m4EconomyExperiment,
  ROTATION_SPECS,
  runM4Experiments,
  sabotageExperiment,
  sabotageGrowthExperiment,
  sabotageMetrics,
  scoringExperiment,
  scoringMetrics,
} from './experimentsM4.ts';
import { runVariant } from './experiments.ts';

const runtime = globalThis as {
  process?: { env?: Record<string, string | undefined> };
  console?: { log: (...values: unknown[]) => void };
};

describe('M4-Experimente: Grundlagen', () => {
  it('ROTATION_SPECS entspricht der Katalog-Rotation (IDs, Spielzeit, Wertung)', () => {
    expect(
      rotationInfos().map((info) => ({
        id: info.id,
        playMs: info.durationMs,
        scoring: info.scoring,
      })),
    ).toEqual(ROTATION_SPECS);
  });

  it('Partien mit Rotation spielen echte Minispiele und haben einen Zwischenstand', () => {
    const results = runVariant(m4Defaults(), 3, { seeds: seedRange(3), rounds: 4 });
    for (const r of results) {
      expect(r.minigamesPlayed).toBe(4);
      expect(r.midRanking).toHaveLength(3);
      // Je Runde mindestens Intro + Spielzeit + Ergebnis + Rundenende.
      expect(r.durationMs).toBeGreaterThan(4 * (7_000 + 30_000 + 6_000 + 1_500));
    }
    const d = durationMetrics(results);
    expect(d.minutes * 60_000).toBeGreaterThan(FINALE_MS);
    expect(d.minigameShare).toBeGreaterThan(0.3);
    expect(d.minigameShare).toBeLessThan(1);
    const s = scoringMetrics(results);
    const decided = Object.values(s.decidedBy).reduce((a, b) => a + b, 0);
    expect(decided).toBeCloseTo(1, 9);
    const sab = sabotageMetrics(results);
    expect(sab.lostShareOfEarned).toBeGreaterThanOrEqual(0);
    expect(sab.lostShareOfEarned).toBeLessThan(1);
  });
});

describe('M4-Experimente: Smoke-Test mit wenigen Seeds', () => {
  const small: ExperimentSetup = { seeds: seedRange(2), players: [2, 4], rounds: 2 };

  it.each([
    ['Dauer', () => durationExperiment(small, [2])],
    ['Wertung', () => scoringExperiment(small, [2])],
    ['Ökonomie', () => m4EconomyExperiment(small, [2])],
    ['Sabotage', () => sabotageExperiment(small, [2])],
    ['Wachsende Sabotage', () => sabotageGrowthExperiment(small, [3])],
  ] as const)('%s liefert eine vollständige Tabelle', (_, experiment) => {
    const table = experiment();
    expect(table.rows.length).toBeGreaterThan(0);
    for (const row of table.rows) expect(row).toHaveLength(table.headers.length);
    expect(toMarkdown(table)).not.toContain('NaN');
  });
});

describe.runIf(runtime.process?.env?.EXPERIMENTS === 'growth')(
  'EXP-018: wachsende Sabotage (EXPERIMENTS=growth, CHAOS-67)',
  () => {
    it('druckt die Tabelle als Markdown', { timeout: 1_200_000 }, () => {
      const md = toMarkdown(sabotageGrowthExperiment());
      expect(md).not.toContain('NaN');
      runtime.console?.log(`\n${md}\n`);
    });
  },
);

describe.runIf(runtime.process?.env?.EXPERIMENTS === 'm4')(
  'M4-Experimente: volle Tabellen (EXPERIMENTS=m4)',
  () => {
    it('druckt alle Tabellen als Markdown', { timeout: 1_200_000 }, () => {
      const md = runM4Experiments();
      expect(md).not.toContain('NaN');
      runtime.console?.log(`\n${md}\n`);
    });
  },
);
