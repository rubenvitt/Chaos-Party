/**
 * Aufholhilfen (CHAOS-65, EXP-022). Smoke-Test immer; volle Tabelle nur mit
 *
 * ```sh
 * EXPERIMENTS=catchup pnpm exec vitest run packages/game-core/src/rules/experimentsCatchUp.test.ts --silent=false
 * ```
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from './defaults.ts';
import { runVariant, seedRange, toMarkdown, type ExperimentSetup } from './experiments.ts';
import {
  CATCH_UP_VARIANTS,
  catchUpExperiment,
  NO_CATCH_UP_RULES,
  runCatchUpExperiments,
  withBonusTrophies,
} from './experimentsCatchUp.ts';
import { m4Defaults } from './experimentsM4.ts';

const runtime = globalThis as {
  process?: { env?: Record<string, string | undefined> };
  console?: { log: (...values: unknown[]) => void };
};

describe('Aufholhilfen: Smoke-Test mit wenigen Seeds', () => {
  const small: ExperimentSetup = { seeds: seedRange(2), players: [2, 4], rounds: 2 };

  it('liefert eine vollständige Tabelle', () => {
    const table = catchUpExperiment(small, [3]);
    expect(table.rows.length).toBeGreaterThan(0);
    for (const row of table.rows) expect(row).toHaveLength(table.headers.length);
    expect(toMarkdown(table)).not.toContain('NaN');
  });
});

describe.runIf(runtime.process?.env?.EXPERIMENTS === 'catchup')(
  'Aufholhilfen: volle Tabelle (EXPERIMENTS=catchup)',
  () => {
    it('druckt die Tabelle als Markdown', { timeout: 3_600_000 }, () => {
      const md = runCatchUpExperiments();
      expect(md).not.toContain('NaN');
      runtime.console?.log(`\n${md}\n`);
    });
  },
);

describe('Aufholhilfen: Grundlagen', () => {
  it('Variante A ist die Basis ohne Aufholhilfe, T der neue Standard', () => {
    expect(NO_CATCH_UP_RULES).not.toHaveProperty('catchUp');
    expect(NO_CATCH_UP_RULES.trophy.placement).toBeUndefined();
    expect({
      ...NO_CATCH_UP_RULES,
      trophy: { ...NO_CATCH_UP_RULES.trophy, placement: 'nearest-to-last' },
    }).toEqual(DEFAULT_RULES);
    const [a, t] = CATCH_UP_VARIANTS;
    expect(a?.rules).toEqual(NO_CATCH_UP_RULES);
    expect(t?.rules).toEqual(DEFAULT_RULES);
  });

  it('Bonus-Trophäen: je Titel eine Trophäe an alle Besten, dann neu gewertet', () => {
    const [result] = runVariant(m4Defaults(), 3, { seeds: [7], rounds: 4 });
    if (!result) throw new Error('keine Partie');
    const bonus = withBonusTrophies(result, ['minigame-ace']);
    const best = Math.max(...result.finalPlayers.map((p) => p.minigameWins));
    for (const p of result.finalPlayers) {
      const after = bonus.ranking.find((e) => e.slot === p.slot)?.trophies;
      expect(after).toBe(p.trophies + (best > 0 && p.minigameWins === best ? 1 : 0));
    }
    expect(bonus.ranking.map((e) => e.place)).toEqual(
      [...bonus.ranking.map((e) => e.place)].sort((x, y) => x - y),
    );
  });
});
