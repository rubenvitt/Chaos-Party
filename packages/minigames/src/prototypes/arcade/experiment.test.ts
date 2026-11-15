/**
 * EXP-005 (CHAOS-29/30). Der Smoke-Test läuft immer (wenige Seeds); die vollen Tabellen nur
 * mit Umgebungsvariable:
 *
 * ```sh
 * EXPERIMENTS=1 pnpm exec vitest run packages/minigames/src/prototypes/arcade --silent=false
 * ```
 */
import { MINIGAME_TEXT_LIMITS } from '@chaos-party/minigame-sdk';
import { describe, expect, it } from 'vitest';
import { lineup, metrics, seedRange, toMarkdown, uniqueLeader } from './common.ts';
import {
  CONCEPT_SHEETS,
  VARIANTS,
  conceptTable,
  runAllExperiments,
  sheetTable,
} from './experiment.ts';

describe('EXP-005: Grundlagen', () => {
  it('Besetzung enthält immer Profi (vorn) und Neuling (hinten)', () => {
    for (const players of [2, 3, 4] as const) {
      const bots = lineup(players);
      expect(bots).toHaveLength(players);
      expect(bots[0]?.name).toBe('Profi');
      expect(bots.at(-1)?.name).toBe('Neuling');
    }
  });

  it('uniqueLeader erkennt Gleichstand und Nullstand', () => {
    expect(uniqueLeader([0, 0])).toBeNull();
    expect(uniqueLeader([2, 2, 1])).toBeNull();
    expect(uniqueLeader([1, 3, 2])).toBe(1);
  });

  it('Anleitungen der Konzepte passen in die Textgrenzen', () => {
    for (const sheet of CONCEPT_SHEETS) {
      expect(sheet.instructions.length).toBeLessThanOrEqual(MINIGAME_TEXT_LIMITS.instructions);
      for (const line of sheet.instructions) {
        expect(line.length).toBeLessThanOrEqual(MINIGAME_TEXT_LIMITS.instruction);
      }
    }
  });

  it.each(VARIANTS.map((variant) => [variant.id, variant] as const))(
    '%s ist deterministisch und liefert plausible Werte',
    (_, variant) => {
      for (const players of [2, 3, 4] as const) {
        const a = variant.run(players, 5);
        expect(variant.run(players, 5)).toEqual(a);
        expect(a.scores).toHaveLength(players);
        expect(a.scores.every((score) => Number.isInteger(score) && score >= 0)).toBe(true);
      }
      const m = metrics(seedRange(10).map((seed) => variant.run(4, seed)));
      expect(m.winnerScore).toBeGreaterThan(0);
      expect(m.weakestWins).toBeGreaterThanOrEqual(0);
      expect(m.strongestWins).toBeLessThanOrEqual(1);
    },
  );

  it('Tabellen sind vollständig', () => {
    const table = conceptTable({ seeds: seedRange(2), players: [2, 4] });
    expect(table.rows).toHaveLength(VARIANTS.length * 2);
    for (const row of table.rows) expect(row).toHaveLength(table.headers.length);
    expect(toMarkdown(table)).not.toContain('NaN');
    expect(sheetTable().rows).toHaveLength(CONCEPT_SHEETS.length);
  });
});

describe.runIf(process.env.EXPERIMENTS === '1')('EXP-005: volle Tabellen (EXPERIMENTS=1)', () => {
  it('druckt alle Tabellen als Markdown', { timeout: 600_000 }, () => {
    const md = runAllExperiments();
    expect(md).not.toContain('NaN');
    console.log(`\n${md}\n`);
  });
});
