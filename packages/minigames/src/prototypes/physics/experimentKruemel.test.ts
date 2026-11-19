/**
 * EXP-023 Krümel-Kehraus (CHAOS-79). Ohne `EXPERIMENTS=1` nur ein Smoke-Test (je eine
 * Variante kurz); die vollen Tabellen für `docs/experiments.md` mit:
 *
 * ```sh
 * EXPERIMENTS=1 pnpm exec vitest run packages/minigames/src/prototypes/physics/experimentKruemel --silent=false
 * ```
 */
import { describe, expect, it } from 'vitest';
import {
  closeTable,
  intruderTable,
  KRUEMEL_VARIANTS,
  mainTable,
  seatTable,
  seedCount,
  simulateKruemel,
  weakSeats,
} from './experimentKruemel.ts';

const FULL = process.env.EXPERIMENTS === '1';

describe('EXP-023 Krümel-Kehraus: Smoke', () => {
  it('alter Prototyp und gewählte Fassung laufen mit Bots stabil durch', async () => {
    for (const id of ['B', 'R3']) {
      const variant = KRUEMEL_VARIANTS.find((entry) => entry.id === id);
      if (!variant) throw new Error(id);
      const { seats } = weakSeats(3, 1);
      const record = await simulateKruemel(variant, 1, seats);
      expect(record.seats).toHaveLength(3);
      expect(record.unstable).toBe(0);
      expect(record.counters.scored ?? 0).toBeGreaterThan(0);
    }
  }, 60_000);
});

/**
 * Die Messung lässt sich in Teile zerlegen: `KRUEMEL_TABLES=main,close,seat,intruder`
 * (Standard: alle) und `KRUEMEL_ONLY=R3,R4` (Standard: alle Varianten). Früher nötig, weil der
 * Headless-Harness je Lauf Speicher verlor; seit CHAOS-126 laufen alle Tabellen in einem Prozess.
 */
describe.runIf(FULL)('EXP-023 Krümel-Kehraus: Tabellen', () => {
  it('Haupttabelle, knappe Besetzungen, Ecken, Eindringling', async () => {
    const seeds = seedCount();
    const tables = new Set(
      (process.env.KRUEMEL_TABLES ?? 'main,close,seat,intruder').split(',').map((t) => t.trim()),
    );
    const only = process.env.KRUEMEL_ONLY?.split(',').map((id) => id.trim());
    const variants = KRUEMEL_VARIANTS.filter((variant) => !only || only.includes(variant.id));
    const chosen = KRUEMEL_VARIANTS.find((variant) => variant.id === 'R3');
    if (!chosen) throw new Error('R3 fehlt');
    const parts: string[] = [];
    if (tables.has('main')) {
      parts.push(
        `**EXP-023 Krümel-Kehraus alt gegen neu (30 s, Seeds 1–${seeds} je Zeile)**`,
        await mainTable(variants, seeds),
      );
    }
    if (tables.has('close')) {
      parts.push(
        `**EXP-023 Knappe Besetzungen (Seeds 1–${seeds})**`,
        await closeTable(variants, seeds),
      );
    }
    if (tables.has('seat')) {
      parts.push(
        `**EXP-023 Siegquote je Ecke, alle Bots normal (R3, Seeds 1–${seeds})**`,
        await seatTable(chosen, seeds),
      );
    }
    if (tables.has('intruder')) {
      parts.push(
        `**EXP-023 Eindringling gegen 2× normal (3 Sp., Siegfaktor; 1,00 = fair; Seeds 1–${seeds})**`,
        await intruderTable(
          variants.filter((variant) => variant.rules),
          seeds,
        ),
      );
    }
    console.log(`\n${parts.join('\n\n')}\n`);
    expect(parts.length).toBeGreaterThan(0);
  }, 3_600_000);
});
