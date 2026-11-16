/**
 * EXP-016 (CHAOS-54). Der Smoke-Test läuft immer (wenige Seeds); die vollen Tabellen nur
 * mit Umgebungsvariable:
 *
 * ```sh
 * EXPERIMENTS=1 pnpm exec vitest run packages/minigames/src/prototypes/arcade/experimentKuckuck --silent=false
 * ```
 */
import { describe, expect, it } from 'vitest';
import { metrics, seedRange, toMarkdown } from './common.ts';
import {
  KUCKUCK_VARIANTS,
  kuckuckConceptTable,
  kuckuckStrategyTable,
  runKuckuckExperiment,
} from './experimentKuckuck.ts';
import { simulateKuckucksKlatsche } from './kuckucksKlatscheBot.ts';

describe('EXP-016: Grundlagen', () => {
  it.each(KUCKUCK_VARIANTS.map((variant) => [variant.id, variant] as const))(
    '%s ist deterministisch und liefert plausible Werte',
    (_, variant) => {
      for (const players of [2, 3, 4] as const) {
        const a = variant.run(players, 5);
        expect(variant.run(players, 5)).toEqual(a);
        expect(a.scores).toHaveLength(players);
        expect(a.scores.every((score) => Number.isInteger(score) && score >= 0)).toBe(true);
      }
      const m = metrics(seedRange(8).map((seed) => variant.run(4, seed)));
      expect(m.winnerScore).toBeGreaterThan(0);
    },
  );

  it('Dauerklatscher sammelt Leerklatscher und Finten', () => {
    const record = simulateKuckucksKlatsche(3, 4, { strategies: ['dauer', 'normal', 'normal'] });
    expect(record.empty).toBeGreaterThan(5);
    expect(record.fintes).toBeGreaterThan(0);
  });

  it('Tabellen sind vollständig', () => {
    const setup = { seeds: seedRange(2), players: [2, 4] as const };
    const table = kuckuckConceptTable(setup);
    expect(table.rows).toHaveLength(KUCKUCK_VARIANTS.length * 2);
    for (const row of table.rows) expect(row).toHaveLength(table.headers.length);
    expect(toMarkdown(table)).not.toContain('NaN');
    const strategies = kuckuckStrategyTable(setup);
    for (const row of strategies.rows) expect(row).toHaveLength(strategies.headers.length);
  });
});

describe.runIf(process.env.EXPERIMENTS === '1')('EXP-016: volle Tabellen (EXPERIMENTS=1)', () => {
  it('druckt alle Tabellen als Markdown', { timeout: 600_000 }, () => {
    const md = runKuckuckExperiment();
    expect(md).not.toContain('NaN');
    console.log(`\n${md}\n`);
  });
});
