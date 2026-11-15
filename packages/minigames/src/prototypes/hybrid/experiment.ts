/**
 * EXP-007: Hybrid-Konzepte im Vergleich (CHAOS-29/CHAOS-32). Erzeugt die Tabellen für
 * `docs/experiments.md`.
 */
import { MINIGAME_TEXT_LIMITS } from '@chaos-party/minigame-sdk';
import {
  fairness,
  invasion,
  mixedTables,
  num,
  pct,
  seedRange,
  strategyTournament,
  STRATEGIES,
  toMarkdown,
  underdog,
  type Concept,
  type Strategy,
  type Table,
} from './common.ts';
import { GEYSIR_CONCEPT, GEYSIR_VARIANTS } from './geysir.ts';
import { WACKELTURM_CONCEPT, WACKELTURM_VARIANTS } from './wackelturm-sim.ts';

export interface ExperimentSetup {
  readonly seeds: readonly number[];
  readonly players: readonly number[];
}

export const DEFAULT_SETUP: ExperimentSetup = { seeds: seedRange(200), players: [2, 3, 4] };

interface AnyVariant {
  readonly label: string;
  readonly concept: Concept<never>;
  readonly params: never;
}

/** Alle Varianten beider Konzepte (Typen vereinheitlicht für die Tabellen). */
export function allVariants(): AnyVariant[] {
  const a = WACKELTURM_VARIANTS.map((variant) => ({
    label: variant.label,
    concept: WACKELTURM_CONCEPT,
    params: variant.params as never,
  }));
  const b = GEYSIR_VARIANTS.map((variant) => ({
    label: variant.label,
    concept: GEYSIR_CONCEPT,
    params: variant.params as never,
  }));
  return [...a, ...b];
}

const STRATEGY_LABEL: Record<Strategy, string> = {
  vorsichtig: 'vorsichtig',
  gierig: 'gierig',
  zufaellig: 'zufällig',
  raufbold: 'Raufbold',
};

/** Tabelle 1: Spielverlauf an gemischten Tischen. */
export function flowTable(setup: ExperimentSetup = DEFAULT_SETUP): Table {
  const rows: string[][] = [];
  for (const variant of allVariants()) {
    for (const players of setup.players) {
      const records = mixedTables(variant.concept, variant.params, players, setup.seeds);
      const m = fairness(records);
      rows.push([
        variant.label,
        String(players),
        num(m.seconds, 0),
        num(m.winnerScore),
        pct(m.relativeGap),
        pct(m.tieShare),
        num(m.leadChanges),
        num(m.drama),
        num(m.inputsPerSecond),
        pct(m.bShare),
      ]);
    }
  }
  return {
    title: `EXP-007 Verlauf (gemischte Tische, Seeds ${String(setup.seeds[0])}–${String(setup.seeds.at(-1))})`,
    headers: [
      'Variante',
      'Sp.',
      'Dauer s',
      'Sieger-Punkte',
      'Abstand 1–2',
      'Gleichstand',
      'Führungswechsel',
      'Momente',
      'Eingaben/s',
      'B-Anteil',
    ],
    rows,
  };
}

/** Tabelle 2: Strategie-Turnier (Siegfaktor, 1,0 = fair) und Außenseiter-Chance. */
export function strategyTable(setup: ExperimentSetup = DEFAULT_SETUP): Table {
  const rows: string[][] = [];
  for (const variant of allVariants()) {
    for (const players of setup.players) {
      const factors = strategyTournament(variant.concept, variant.params, players, setup.seeds);
      const weak = underdog(variant.concept, variant.params, players, setup.seeds);
      rows.push([
        variant.label,
        String(players),
        ...STRATEGIES.map((strategy) => num(factors.get(strategy) ?? 0, 2)),
        `${pct(weak)} (fair ${pct(1 / players)})`,
      ]);
    }
  }
  return {
    title: 'EXP-007 Strategien (Siegfaktor bei gleicher Geschicklichkeit 0,7; 1,00 = fair)',
    headers: [
      'Variante',
      'Sp.',
      ...STRATEGIES.map((strategy) => STRATEGY_LABEL[strategy]),
      'Außenseiter (0,2 vs 0,9) gewinnt',
    ],
    rows,
  };
}

/**
 * Tabelle 3: Eindringling gegen Monokultur (3 Spieler). Zeile = eine Strategie, Spalte = die
 * zwei anderen spielen das. Ein Wert > 1 heißt: Abweichen lohnt sich. Eine Strategie, die in
 * jeder Spalte > 1 hat, wäre dominant.
 */
export function invasionTable(
  setup: ExperimentSetup = DEFAULT_SETUP,
  keys: readonly string[] = ['A4', 'A6', 'B2', 'B4'],
): Table {
  const rows: string[][] = [];
  const chosen = allVariants().filter((v) => keys.some((key) => v.label.startsWith(`${key}:`)));
  for (const variant of chosen) {
    for (const invader of STRATEGIES) {
      rows.push([
        variant.label.split(':')[0] ?? variant.label,
        STRATEGY_LABEL[invader],
        ...STRATEGIES.map((resident) =>
          num(invasion(variant.concept, variant.params, 3, setup.seeds, invader, resident), 2),
        ),
      ]);
    }
  }
  return {
    title: 'EXP-007 Eindringling gegen Monokultur (3 Spieler, Siegfaktor; 1,00 = fair)',
    headers: ['Var.', 'Eindringling', ...STRATEGIES.map((s) => `gegen 2× ${STRATEGY_LABEL[s]}`)],
    rows,
  };
}

/** Tabelle 4: Bedienung und Verständlichkeit (statisch). */
export function clarityTable(): Table {
  const concepts = [WACKELTURM_CONCEPT, GEYSIR_CONCEPT] as const;
  return {
    title: 'EXP-007 Bedienung und Anleitung',
    headers: ['Konzept', 'Bedienung', 'Anleitung (Zeilen, längste)', 'Regel-Begriffe'],
    rows: concepts.map((concept) => {
      const longest = Math.max(...concept.instructions.map((line) => line.length));
      const controls = [concept.controls.joystick, concept.controls.a, concept.controls.b]
        .filter((label): label is string => label !== null)
        .join(' / ');
      return [
        concept.title,
        controls,
        `${String(concept.instructions.length)}, ${String(longest)}/${String(MINIGAME_TEXT_LIMITS.instruction)} Zeichen`,
        concept.id === 'A'
          ? 'Berg, Nest, Turmbonus, Wackeln, Rempeln (5)'
          : 'Becken, Topf, Multiplikator, Teilen, Ausbruch, Ritt, Schubsen (7)',
      ];
    }),
  };
}

export function runAllExperiments(setup: ExperimentSetup = DEFAULT_SETUP): string {
  return [flowTable(setup), strategyTable(setup), invasionTable(setup), clarityTable()]
    .map(toMarkdown)
    .join('\n\n');
}
