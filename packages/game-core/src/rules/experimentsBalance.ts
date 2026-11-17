/**
 * Zurückgestellte Balance-Ideen aus EXP-001 … EXP-004, geprüft mit dem M4-Stand (CHAOS-51,
 * `docs/experiments.md` EXP-018): Würfel 2–7, Ziel der wandernden Trophäe, Item für den
 * Minispiel-Sieg, Schild gegen Fallen und sichtbare gegen versteckte Fallen.
 *
 * ```sh
 * EXPERIMENTS=balance pnpm exec vitest run packages/game-core/src/rules/experimentsBalance.test.ts --silent=false
 * ```
 *
 * Basis sind die aktuellen `DEFAULT_RULES` mit Minispiel-Rotation (wie EXP-011 … EXP-013).
 * Bot-Näherungen, kein Spaß-Beweis.
 */
import {
  itemMetrics,
  mean,
  num,
  pct,
  runVariant,
  seedText,
  toMarkdown,
  type ExperimentSetup,
  type Table,
  type Variant,
} from './experiments.ts';
import {
  durationMetrics,
  M4_SETUP,
  m4Defaults,
  m4Variant,
  sabotageMetrics,
  scoringMetrics,
} from './experimentsM4.ts';
import type { SimulationResult } from './simulate.ts';

/** Züge je gekaufter Trophäe (Kehrwert der Kaufrate; hoch = Trophäen liegen lange herum). */
export function turnsPerTrophy(results: readonly SimulationResult[]): number {
  const turns = results.reduce((s, r) => s + r.turns, 0);
  const bought = results.reduce((s, r) => s + r.trophiesBought, 0);
  return bought === 0 ? Infinity : turns / bought;
}

/** Abstand Erster zu Letztem in Trophäen am Ende (Mittel). */
export function trophySpread(results: readonly SimulationResult[]): number {
  return mean(
    results.map((r) => {
      const trophies = r.standings.map((p) => p.trophies);
      return trophies.length === 0 ? 0 : Math.max(...trophies) - Math.min(...trophies);
    }),
  );
}

// ---------------------------------------------------------------------------
// A: Würfel 2–7 (EXP-001 D)
// ---------------------------------------------------------------------------

export const DICE_VARIANTS: readonly Variant[] = [
  m4Defaults('A', 'W6 1–6 (Stand M4)'),
  m4Variant('B', 'Würfel 2–7', { diceFaces: [2, 3, 4, 5, 6, 7] }),
];

export function diceExperiment(
  setup: ExperimentSetup = M4_SETUP,
  roundCounts: readonly number[] = [5, 10],
  variants: readonly Variant[] = DICE_VARIANTS,
): Table {
  const rows: string[][] = [];
  for (const rounds of roundCounts) {
    for (const v of variants) {
      for (const players of setup.players) {
        const results = runVariant(v, players, { seeds: setup.seeds, rounds });
        const s = scoringMetrics(results);
        rows.push([
          String(rounds),
          `${v.id}: ${v.label}`,
          String(players),
          num(durationMetrics(results).minutes),
          num(mean(results.map((r) => r.avgSpacesPerTurn))),
          num(s.trophiesPerGame, 2),
          pct(s.noTrophyShare),
          pct(s.decidedBy.trophies),
          pct(s.midLeaderWins),
        ]);
      }
    }
  }
  return {
    title: `EXP-018 A Würfel 2–7 mit Rotation (${seedText(setup)})`,
    headers: [
      'Runden',
      'Variante',
      'Sp.',
      'min',
      'Felder/Zug',
      'Trophäen/Partie',
      'ohne Trophäe',
      'Sieg per Trophäen',
      'Führender (Hälfte) gewinnt',
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// B: Ziel der wandernden Trophäe (EXP-002, EXP-012 „Aufholhilfe“)
// ---------------------------------------------------------------------------

export const PLACEMENT_VARIANTS: readonly Variant[] = [
  m4Defaults('A', 'zufällig (Stand M4)'),
  m4Variant('B', 'vor die Spieler', { trophy: { placement: 'ahead' } }),
  m4Variant('C', 'vor die Letzten', { trophy: { placement: 'ahead-of-last' } }),
];

export function placementExperiment(
  setup: ExperimentSetup = M4_SETUP,
  roundCounts: readonly number[] = [5, 10, 20],
  variants: readonly Variant[] = PLACEMENT_VARIANTS,
): Table {
  const rows: string[][] = [];
  for (const rounds of roundCounts) {
    for (const v of variants) {
      for (const players of setup.players) {
        const results = runVariant(v, players, { seeds: setup.seeds, rounds });
        const s = scoringMetrics(results);
        rows.push([
          String(rounds),
          `${v.id}: ${v.label}`,
          String(players),
          num(s.trophiesPerGame, 2),
          num(turnsPerTrophy(results)),
          pct(s.noTrophyShare),
          num(trophySpread(results), 2),
          pct(s.decidedBy.trophies),
          pct(s.midLeaderWins),
          pct(s.midLastWins),
          pct(1 / players),
        ]);
      }
    }
  }
  return {
    title: `EXP-018 B Ziel der wandernden Trophäe (${seedText(setup)})`,
    headers: [
      'Runden',
      'Variante',
      'Sp.',
      'Trophäen/Partie',
      'Züge je Trophäe',
      'ohne Trophäe',
      'Abstand Erste–Letzte',
      'Sieg per Trophäen',
      'Führender (Hälfte) gewinnt',
      'Letzter (Hälfte) gewinnt',
      'fair 1/n',
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// C: Item für den Minispiel-Sieg (EXP-003)
// ---------------------------------------------------------------------------

const PROFI = { minigameSkill: { 1: 10 } } as const;

export const WIN_ITEM_VARIANTS: readonly Variant[] = [
  m4Defaults('A', 'kein Item (Stand M4)'),
  m4Variant('B', '1 Item für den Sieg', { items: { minigameWinItems: 1 } }),
  m4Variant('L', '1 Item für den letzten Platz', { items: { minigameLastItems: 1 } }),
  { ...m4Defaults('P', 'Stand, Slot 1 Profi (+10)'), policy: PROFI },
  m4Variant(
    'Q',
    '1 Item für den Sieg, Slot 1 Profi',
    { items: { minigameWinItems: 1 } },
    {
      policy: PROFI,
    },
  ),
  m4Variant(
    'R',
    '1 Item für den letzten Platz, Slot 1 Profi',
    { items: { minigameLastItems: 1 } },
    {
      policy: PROFI,
    },
  ),
];

export function winItemExperiment(
  setup: ExperimentSetup = M4_SETUP,
  roundCounts: readonly number[] = [10, 20],
  variants: readonly Variant[] = WIN_ITEM_VARIANTS,
): Table {
  const rows: string[][] = [];
  for (const rounds of roundCounts) {
    for (const v of variants) {
      for (const players of setup.players) {
        const results = runVariant(v, players, { seeds: setup.seeds, rounds });
        const s = scoringMetrics(results);
        const sab = sabotageMetrics(results);
        rows.push([
          String(rounds),
          `${v.id}: ${v.label}`,
          String(players),
          num(durationMetrics(results).minutes),
          num(itemMetrics(results).itemsPerPlayer, 1),
          num(sab.sabotagePerGame, 2),
          num(sab.sabotagePerRound, 2),
          pct(sab.lostShareOfEarned),
          num(s.trophiesPerGame, 2),
          pct(s.midLeaderWins),
          pct(s.slot1WinShare),
          pct(1 / players),
        ]);
      }
    }
  }
  return {
    title: `EXP-018 C Item für den Minispiel-Sieg oder den letzten Platz (${seedText(setup)})`,
    headers: [
      'Runden',
      'Variante',
      'Sp.',
      'min',
      'Items/Spieler',
      'Sabotagen/Partie',
      'je Runde',
      'Verlust/Einnahmen',
      'Trophäen/Partie',
      'Führender (Hälfte) gewinnt',
      'Siege Slot 1',
      'fair 1/n',
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// D: Schild gegen Fallen, sichtbare gegen versteckte Fallen (EXP-003)
// ---------------------------------------------------------------------------

/** Sichtbare Fallen: Bots meiden sie an Gabeln meist (75 %), wenn ein Weg frei bleibt. */
const VISIBLE = { avoidTrapChance: 0.75 } as const;

export const TRAP_VARIANTS: readonly Variant[] = [
  m4Defaults('A', 'Schild nur gegen Klau, Fallen egal (Stand M4)'),
  m4Variant('B', 'Schild auch gegen Fallen', { items: { shieldBlocksTrap: true } }),
  { ...m4Defaults('C', 'Fallen sichtbar, Bots weichen aus'), policy: VISIBLE },
  m4Variant('D', 'B + C', { items: { shieldBlocksTrap: true } }, { policy: VISIBLE }),
];

export function trapExperiment(
  setup: ExperimentSetup = M4_SETUP,
  roundCounts: readonly number[] = [10],
  variants: readonly Variant[] = TRAP_VARIANTS,
): Table {
  const rows: string[][] = [];
  for (const rounds of roundCounts) {
    for (const v of variants) {
      for (const players of setup.players) {
        const results = runVariant(v, players, { seeds: setup.seeds, rounds });
        const items = itemMetrics(results);
        const sab = sabotageMetrics(results);
        const placed = items.trapsPlacedPerGame;
        const shields = mean(results.map((r) => r.reactions.shield));
        rows.push([
          String(rounds),
          `${v.id}: ${v.label}`,
          String(players),
          num(placed, 2),
          num(items.trapsTriggeredPerGame, 2),
          num(mean(results.map((r) => r.trapsBlocked)), 2),
          pct(
            placed === 0
              ? 0
              : (items.trapsTriggeredPerGame + mean(results.map((r) => r.trapsBlocked))) / placed,
          ),
          num(shields, 2),
          num(sab.sabotagePerGame, 2),
          pct(sab.lostShareOfEarned),
          num(sab.worstVictimCoins),
        ]);
      }
    }
  }
  return {
    title: `EXP-018 D Schild gegen Fallen, sichtbare Fallen (${seedText(setup)})`,
    headers: [
      'Runden',
      'Variante',
      'Sp.',
      'Fallen gelegt',
      'ausgelöst',
      'per Schild abgewehrt',
      'getroffen/gelegt',
      'Schild gegen Klau',
      'Sabotagen/Partie',
      'Verlust/Einnahmen',
      'Spitzenopfer Münzen',
    ],
    rows,
  };
}

/** Alle EXP-018-Tabellen als Markdown. */
export function runBalanceExperiments(setup: ExperimentSetup = M4_SETUP): string {
  return [
    diceExperiment(setup),
    placementExperiment(setup),
    winItemExperiment(setup),
    trapExperiment(setup),
  ]
    .map(toMarkdown)
    .join('\n\n');
}
