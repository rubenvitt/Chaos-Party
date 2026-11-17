/**
 * Aufholhilfen für Zurückliegende (CHAOS-65, `docs/experiments.md` EXP-022). Basis ist der
 * M4-Stand mit echter Minispiel-Rotation (`m4Defaults`); Ausgangsbefund aus EXP-012: Der
 * alleinige Halbzeit-Führende gewinnt bei 10 Runden 59–73 % der Partien.
 *
 * ```sh
 * EXPERIMENTS=catchup pnpm exec vitest run packages/game-core/src/rules/experimentsCatchUp.test.ts --silent=false
 * ```
 *
 * Regelvarianten laufen über `RuleSet.catchUp` im echten Regelwerk. Bonus-Trophäen am Ende
 * (Titel vom Siegerbildschirm als Trophäe) werden nur hier nachgerechnet, ohne Regeländerung.
 * Näherungen mit Bots, kein Spaß-Beweis.
 */
import type {
  CatchUpRules,
  PlayerState,
  RankingEntry,
  RuleSet,
  TrophyPlacement,
} from '../types.ts';
import { DEFAULT_RULES } from './defaults.ts';
import { rankPlayers } from './economy.ts';
import {
  mean,
  num,
  pct,
  runVariant,
  seedRange,
  seedText,
  toMarkdown,
  type ExperimentSetup,
  type Table,
  type Variant,
} from './experiments.ts';
import { M4_SETUP, m4Defaults, scoringMetrics } from './experimentsM4.ts';
import type { SimulationResult } from './simulate.ts';

/** Titel vom Siegerbildschirm (`apps/host/src/finale/awards.ts`), hier als Bonus-Trophäe. */
export type BonusTitle = 'minigame-ace' | 'unlucky' | 'coin-magnet' | 'globetrotter' | 'trickster';

/**
 * Wert eines Titels, wie auf dem Siegerbildschirm. „Pechvogel“ = `coinsLost`, also nur
 * Verluste durch Minus-Felder, Klau und Fallen, ohne Trophäenkauf (CHAOS-123).
 */
function titleValue(title: BonusTitle, p: PlayerState): number {
  switch (title) {
    case 'minigame-ace':
      return p.minigameWins;
    case 'unlucky':
      return p.stats.coinsLost;
    case 'coin-magnet':
      return p.stats.coinsEarned;
    case 'globetrotter':
      return p.stats.spacesMoved;
    case 'trickster':
      return p.stats.itemsUsed;
  }
}

/** Je Titel eine Trophäe an alle mit dem höchsten Wert (> 0), dann neu werten. */
export function withBonusTrophies(
  result: SimulationResult,
  titles: readonly BonusTitle[],
): SimulationResult {
  const bonus = new Map<number, number>();
  for (const title of titles) {
    const values = result.finalPlayers.map((p) => titleValue(title, p));
    const best = Math.max(0, ...values);
    if (best <= 0) continue;
    result.finalPlayers.forEach((p, i) => {
      if (values[i] === best) bonus.set(p.slot, (bonus.get(p.slot) ?? 0) + 1);
    });
  }
  const players = result.finalPlayers.map((p) => ({
    ...p,
    trophies: p.trophies + (bonus.get(p.slot) ?? 0),
  }));
  const ranking: RankingEntry[] = rankPlayers(players);
  const [first, second] = ranking;
  return {
    ...result,
    ranking,
    standings: ranking.map((r) => ({
      slot: r.slot,
      place: r.place,
      coins: r.coins,
      trophies: r.trophies,
      coinsEarned: players.find((p) => p.slot === r.slot)?.stats.coinsEarned ?? 0,
    })),
    trophyGap: first && second ? first.trophies - second.trophies : null,
  };
}

export interface CatchUpVariant extends Variant {
  /** Bonus-Trophäen am Ende (nur nachgerechnet). */
  readonly bonusTitles?: readonly BonusTitle[];
}

/**
 * Standardregeln ohne Aufholhilfe als gemeinsame Basis: Trophäe wandert zufällig, keine
 * Münz-Hilfen. Wachsende Sabotage (EXP-018) und Trostpreis (EXP-019) gehören zur Basis.
 */
export const NO_CATCH_UP_RULES: RuleSet = {
  diceFaces: DEFAULT_RULES.diceFaces,
  economy: DEFAULT_RULES.economy,
  trophy: {
    price: DEFAULT_RULES.trophy.price,
    mode: DEFAULT_RULES.trophy.mode,
    activeCount: DEFAULT_RULES.trophy.activeCount,
  },
  items: DEFAULT_RULES.items,
  pacing: DEFAULT_RULES.pacing,
};

/** Variante = Basis ohne Aufholhilfe plus genau diese Hilfen. */
function catchUpVariant(
  id: string,
  label: string,
  catchUp?: CatchUpRules,
  placement?: TrophyPlacement,
): CatchUpVariant {
  return {
    ...m4Defaults(id, label),
    rules: {
      ...NO_CATCH_UP_RULES,
      ...(placement ? { trophy: { ...NO_CATCH_UP_RULES.trophy, placement } } : {}),
      ...(catchUp ? { catchUp } : {}),
    },
  };
}

const W2: CatchUpRules['tailwind'] = { perTrophy: 2, max: 6 };
const W3: CatchUpRules['tailwind'] = { perTrophy: 3, max: 9 };

export const CATCH_UP_VARIANTS: readonly CatchUpVariant[] = [
  catchUpVariant('A', 'Basis (keine Aufholhilfe)'),
  catchUpVariant('T', 'Trophäe wandert vor die Letzten', undefined, 'nearest-to-last'),
  catchUpVariant('H', 'nähere Hälfte vor den Letzten (EXP-019)', undefined, 'ahead-of-last'),
  catchUpVariant('T2', 'Trophäe wandert weg von der Spitze', undefined, 'away-from-leader'),
  catchUpVariant('R', 'Rabatt: Preis 10 ab 2 Trophäen Rückstand', {
    discount: { behind: 2, price: 10 },
  }),
  catchUpVariant('W', 'Rückenwind: 2 Münzen je Trophäe Rückstand, max. 6', { tailwind: W2 }),
  catchUpVariant('W3', 'Rückenwind: 3 Münzen je Trophäe Rückstand, max. 9', { tailwind: W3 }),
  catchUpVariant('F', 'Finale-Fieber: letzte 3 Runden Minispiel-Münzen ×2', {
    finale: { rounds: 3, factor: 2 },
  }),
  {
    ...catchUpVariant('X', 'Bonus-Trophäen: Minispiel-Ass + Pechvogel'),
    bonusTitles: ['minigame-ace', 'unlucky'],
  },
  catchUpVariant('TW', 'T + W', { tailwind: W2 }, 'nearest-to-last'),
  catchUpVariant('T2W', 'T2 + W', { tailwind: W2 }, 'away-from-leader'),
  catchUpVariant('TW3', 'T + W3', { tailwind: W3 }, 'nearest-to-last'),
];

/** Varianten laufen lassen; Bonus-Trophäen werden danach eingerechnet. */
export function runCatchUpVariant(
  v: CatchUpVariant,
  players: 2 | 3 | 4,
  setup: Pick<ExperimentSetup, 'seeds' | 'rounds'>,
): SimulationResult[] {
  const results = runVariant(v, players, setup);
  const titles = v.bonusTitles;
  return titles ? results.map((r) => withBonusTrophies(r, titles)) : results;
}

/**
 * 1000 Seeds je Zeile: Die Unterschiede zwischen den Varianten liegen bei 5–15 Prozentpunkten,
 * mit 200 Seeds (EXP-012) schwankt die Siegquote des Führenden um ±4 Punkte.
 */
export const CATCH_UP_SETUP: ExperimentSetup = { ...M4_SETUP, seeds: seedRange(1000) };

export const CATCH_UP_ROUND_COUNTS: readonly number[] = [10, 20];

/** Minispiel-Profi in Slot 1 (+10 von 40 Punkten), wie EXP-012 Variante S. */
export const PRO_SKILL = { 1: 10 } as const;

export function catchUpExperiment(
  setup: ExperimentSetup = CATCH_UP_SETUP,
  roundCounts: readonly number[] = CATCH_UP_ROUND_COUNTS,
  variants: readonly CatchUpVariant[] = CATCH_UP_VARIANTS,
): Table {
  const rows: string[][] = [];
  for (const rounds of roundCounts) {
    for (const v of variants) {
      for (const players of setup.players) {
        const results = runCatchUpVariant(v, players, { seeds: setup.seeds, rounds });
        const m = scoringMetrics(results);
        const pro = scoringMetrics(
          runCatchUpVariant({ ...v, policy: { ...v.policy, minigameSkill: PRO_SKILL } }, players, {
            seeds: setup.seeds,
            rounds,
          }),
        );
        rows.push([
          String(rounds),
          `${v.id}: ${v.label}`,
          String(players),
          pct(m.midLeaderWins),
          pct(m.midLastWins),
          pct(1 / players),
          num(m.trophiesPerGame, 2),
          pct(m.noTrophyShare),
          pct(m.decidedBy.trophies),
          num(mean(results.map((r) => r.trophyGap ?? 0)), 2),
          pct(pro.slot1WinShare),
        ]);
      }
    }
  }
  return {
    title: `EXP-022 Aufholhilfen mit Rotation (${seedText(setup)})`,
    headers: [
      'Runden',
      'Variante',
      'Sp.',
      'Führender (Hälfte) gewinnt',
      'Letzter (Hälfte) gewinnt',
      'fair 1/n',
      'Trophäen/Partie',
      'ohne Trophäe',
      'Sieg per Trophäen',
      'Abstand P1–P2',
      'Profi gewinnt',
    ],
    rows,
  };
}

export function runCatchUpExperiments(setup: ExperimentSetup = CATCH_UP_SETUP): string {
  return toMarkdown(catchUpExperiment(setup));
}
