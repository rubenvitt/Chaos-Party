/**
 * Balance-Ideen CHAOS-51 (EXP-018). Der Smoke-Test läuft immer (wenige Seeds); die vollen
 * Tabellen für `docs/experiments.md` nur mit Umgebungsvariable:
 *
 * ```sh
 * EXPERIMENTS=balance pnpm exec vitest run packages/game-core/src/rules/experimentsBalance.test.ts --silent=false
 * ```
 */
import { describe, expect, it } from 'vitest';
import {
  runVariant,
  seedRange,
  toMarkdown,
  type ExperimentSetup,
  type Variant,
} from './experiments.ts';
import {
  diceExperiment,
  placementExperiment,
  runBalanceExperiments,
  trapExperiment,
  TRAP_VARIANTS,
  winItemExperiment,
  WIN_ITEM_VARIANTS,
} from './experimentsBalance.ts';

const runtime = globalThis as {
  process?: { env?: Record<string, string | undefined> };
  console?: { log: (...values: unknown[]) => void };
};

function variant(list: readonly Variant[], id: string): Variant {
  const found = list.find((v) => v.id === id);
  if (!found) throw new Error(`Variante ${id} fehlt`);
  return found;
}

describe('EXP-018: Varianten wirken', () => {
  const seeds = { seeds: seedRange(20), rounds: 6 };

  it('Item für Minispiel-Sieg bzw. letzten Platz erhöht die gezogenen Items', () => {
    const count = (id: string): number =>
      runVariant(variant(WIN_ITEM_VARIANTS, id), 3, seeds).reduce(
        (s, r) => s + Object.values(r.itemsGained).reduce((a, b) => a + b, 0),
        0,
      );
    expect(count('B')).toBeGreaterThan(count('A'));
    expect(count('L')).toBeGreaterThan(count('A'));
  });

  it('Schild gegen Fallen fängt Fallen ab, ohne sie als Sabotage zu zählen', () => {
    const results = runVariant(variant(TRAP_VARIANTS, 'B'), 4, seeds);
    const blocked = results.reduce((s, r) => s + r.trapsBlocked, 0);
    expect(blocked).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.sabotageLosses.filter((l) => l.kind === 'trap')).toHaveLength(r.trapsTriggered);
    }
    // Stand: nie abgefangen.
    expect(
      runVariant(variant(TRAP_VARIANTS, 'A'), 4, seeds).every((r) => r.trapsBlocked === 0),
    ).toBe(true);
  });
});

describe('EXP-018: Smoke-Test mit wenigen Seeds', () => {
  const small: ExperimentSetup = { seeds: seedRange(2), players: [2, 4], rounds: 2 };

  it.each([
    ['Würfel', () => diceExperiment(small, [2])],
    ['Trophäen-Ziel', () => placementExperiment(small, [2])],
    ['Sieg-Item', () => winItemExperiment(small, [2])],
    ['Fallen', () => trapExperiment(small, [2])],
  ] as const)('%s liefert eine vollständige Tabelle', (_, experiment) => {
    const table = experiment();
    expect(table.rows.length).toBeGreaterThan(0);
    for (const row of table.rows) expect(row).toHaveLength(table.headers.length);
    expect(toMarkdown(table)).not.toContain('NaN');
  });
});

describe.runIf(runtime.process?.env?.EXPERIMENTS === 'balance')(
  'EXP-018: volle Tabellen (EXPERIMENTS=balance)',
  () => {
    it('druckt alle Tabellen als Markdown', { timeout: 1_800_000 }, () => {
      const md = runBalanceExperiments();
      expect(md).not.toContain('NaN');
      runtime.console?.log(`\n${md}\n`);
    });
  },
);
