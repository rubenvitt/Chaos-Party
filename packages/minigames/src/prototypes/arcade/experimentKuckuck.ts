/**
 * EXP-016 (CHAOS-54): Kuckucks-Klatsche überarbeitet. Vergleicht die neue Fassung (echte
 * Logik, Varianten = Regel-Sätze) mit den alten Prototypen B1/B2 aus EXP-005 und mit
 * Sockenregen (A4*, echte Logik) als Messlatte. Erzeugt die Tabellen für
 * `docs/experiments.md`:
 *
 * ```sh
 * EXPERIMENTS=1 pnpm exec vitest run packages/minigames/src/prototypes/arcade/experimentKuckuck --silent=false
 * ```
 */
import { KUCKUCK_RULES, type KuckuckRules } from '../../kuckucks-klatsche/logic.ts';
import {
  BOT_PROFILES,
  metrics,
  num,
  pct,
  seedRange,
  toMarkdown,
  type BotProfile,
  type GameRecord,
  type PlayerCount,
  type Table,
} from './common.ts';
import { KUCKUCK_BASE, simulateKuckuck } from './kuckuck.ts';
import {
  simulateKuckucksKlatsche,
  type KuckuckSimRecord,
  type KuckuckStrategy,
} from './kuckucksKlatscheBot.ts';
import { simulateSockenregenLogic } from './sockenregenBot.ts';

export interface KuckuckVariant {
  readonly id: string;
  readonly label: string;
  /** Nur für Varianten der neuen Fassung (für Zusatzkennzahlen und Strategien). */
  readonly rules?: KuckuckRules;
  readonly run: (
    players: PlayerCount,
    seed: number,
    profiles?: readonly BotProfile[],
  ) => GameRecord | KuckuckSimRecord;
}

/** K2 ohne Mitternacht. */
const K1_RULES: KuckuckRules = { ...KUCKUCK_RULES, finaleWaitFactor: 1 };

function newVariant(id: string, label: string, rules: KuckuckRules): KuckuckVariant {
  return {
    id,
    label,
    rules,
    run: (players, seed, profiles) =>
      simulateKuckucksKlatsche(players, seed, { rules, ...(profiles ? { profiles } : {}) }),
  };
}

export const KUCKUCK_VARIANTS: readonly KuckuckVariant[] = [
  {
    id: 'B1',
    label: 'alt: eine Uhr, Schnellster +1',
    run: (players, seed, profiles) => simulateKuckuck(players, seed, KUCKUCK_BASE, profiles),
  },
  {
    id: 'B2',
    label: 'alt: eine Uhr, 2 / Rest 1',
    run: (players, seed, profiles) =>
      simulateKuckuck(
        players,
        seed,
        { ...KUCKUCK_BASE, fastestPoints: 2, othersPoints: 1 },
        profiles,
      ),
  },
  newVariant('K1', 'eigene Türen, Gong-Klau, Leerklatscher', K1_RULES),
  newVariant('K2', 'K1 + Mitternacht (gewählt)', KUCKUCK_RULES),
  newVariant('K3', 'K2, eigenes Fenster 0,6 s', { ...KUCKUCK_RULES, ownS: 0.6 }),
  newVariant('K4', 'K2, eigenes Fenster 1,0 s', { ...KUCKUCK_RULES, ownS: 1.0 }),
  newVariant('K5', 'K2 ohne Klauen', { ...KUCKUCK_RULES, steal: 0 }),
  newVariant('K6', 'K2, benommen nur 0,7 s (erste Fassung)', { ...KUCKUCK_RULES, dizzyS: 0.7 }),
  newVariant('K7', 'K2 ohne Benommenheit', { ...KUCKUCK_RULES, dizzyS: 0 }),
  newVariant('K8', 'K2 mit Finten-Beutel (2 je 7 Öffnungen)', { ...KUCKUCK_RULES, finteBag: 7 }),
  {
    id: 'A4*',
    label: 'Sockenregen (Messlatte)',
    run: (players, seed, profiles) => simulateSockenregenLogic(players, seed, profiles),
  },
];

export interface ExperimentSetup {
  readonly seeds: readonly number[];
  readonly players: readonly PlayerCount[];
}

export const KUCKUCK_SETUP: ExperimentSetup = { seeds: seedRange(300), players: [2, 3, 4] };

function isSim(record: GameRecord | KuckuckSimRecord): record is KuckuckSimRecord {
  return 'steals' in record;
}

function perGame(
  records: readonly (GameRecord | KuckuckSimRecord)[],
  key: keyof Omit<KuckuckSimRecord, keyof GameRecord>,
): string {
  const sims = records.filter(isSim);
  if (sims.length === 0) return '–';
  return num(sims.reduce((sum, record) => sum + record[key], 0) / sims.length);
}

export function kuckuckConceptTable(setup: ExperimentSetup = KUCKUCK_SETUP): Table {
  const rows: string[][] = [];
  for (const variant of KUCKUCK_VARIANTS) {
    for (const players of setup.players) {
      const records = setup.seeds.map((seed) => variant.run(players, seed));
      const m = metrics(records);
      rows.push([
        `${variant.id}: ${variant.label}`,
        String(players),
        num(m.winnerScore),
        pct(m.gap),
        pct(m.tieForFirst),
        num(m.leadChanges),
        pct(m.comeback),
        pct(m.strongestWins),
        pct(m.weakestWins),
        pct(1 / players),
        num(m.actionsPer10s),
        perGame(records, 'steals'),
        perGame(records, 'fintes'),
        perGame(records, 'empty'),
      ]);
    }
  }
  return {
    title: `EXP-016 Kuckucks-Klatsche neu gegen alt (30 s, Seeds ${String(setup.seeds[0])}–${String(setup.seeds.at(-1))} je Zeile)`,
    headers: [
      'Variante',
      'Sp.',
      'Punkte P1',
      'Abstand 1–2',
      'Gleichstand P1',
      'Führungswechsel',
      'Comeback',
      'Siege Profi',
      'Siege Neuling',
      'fair',
      'Drücke/10 s',
      'Klau/Runde',
      'Finten/Runde',
      'Leer/Runde',
    ],
    rows,
  };
}

export function kuckuckCloseTable(setup: ExperimentSetup = KUCKUCK_SETUP): Table {
  const { gut, normal } = BOT_PROFILES;
  const rows: string[][] = [];
  for (const variant of KUCKUCK_VARIANTS) {
    const duel = metrics(setup.seeds.map((seed) => variant.run(2, seed, [gut, normal])));
    const equal = metrics(
      setup.seeds.map((seed) => variant.run(4, seed, [normal, normal, normal, normal])),
    );
    rows.push([
      `${variant.id}: ${variant.label}`,
      pct(duel.weakestWins),
      pct(duel.tieForFirst),
      num(duel.leadChanges),
      pct(equal.gap),
      pct(equal.tieForFirst),
      num(equal.leadChanges),
      pct(equal.comeback),
    ]);
  }
  return {
    title: `EXP-016 Knappe Besetzungen (Seeds ${String(setup.seeds[0])}–${String(setup.seeds.at(-1))})`,
    headers: [
      'Variante',
      'Duell: Siege Normal',
      'Duell: Gleichstand',
      'Duell: Führungswechsel',
      '4× Normal: Abstand 1–2',
      '4× Normal: Gleichstand P1',
      '4× Normal: Führungswechsel',
      '4× Normal: Comeback',
    ],
    rows,
  };
}

export const STRATEGIES: readonly KuckuckStrategy[] = ['normal', 'brav', 'raffzahn', 'dauer'];

/**
 * Eindringling gegen zwei normale Bots (3 Spieler, alle Profil „Normal“, Slot reihum): Lohnt
 * es sich, von der normalen Spielweise abzuweichen? Faktor = Siegquote / (1/3); > 1 heißt
 * die Strategie schlägt die normale Spielweise.
 */
export function kuckuckStrategyTable(setup: ExperimentSetup = KUCKUCK_SETUP): Table {
  const { normal } = BOT_PROFILES;
  const rows: string[][] = [];
  for (const variant of KUCKUCK_VARIANTS) {
    if (!variant.rules) continue;
    const rules = variant.rules;
    const cells = STRATEGIES.map((strategy) => {
      let wins = 0;
      for (const seed of setup.seeds) {
        const seat = seed % 3;
        const strategies = [0, 1, 2].map((index) => (index === seat ? strategy : 'normal'));
        const record = simulateKuckucksKlatsche(3, seed, {
          rules,
          profiles: [normal, normal, normal],
          strategies,
        });
        const best = Math.max(...record.scores);
        const winners = record.scores.flatMap((score, index) => (score === best ? [index] : []));
        if (winners.includes(seat)) wins += 1 / winners.length;
      }
      return num(wins / setup.seeds.length / (1 / 3), 2);
    });
    rows.push([`${variant.id}: ${variant.label}`, ...cells]);
  }
  return {
    title: `EXP-016 Eindringling gegen 2× normal (3 Sp., alle Profil Normal, Siegfaktor; 1,00 = fair; Seeds ${String(setup.seeds[0])}–${String(setup.seeds.at(-1))})`,
    headers: ['Variante', 'normal', 'brav (klaut nie)', 'Raffzahn (klaut alles)', 'Dauerklatscher'],
    rows,
  };
}

export function runKuckuckExperiment(setup: ExperimentSetup = KUCKUCK_SETUP): string {
  return [
    toMarkdown(kuckuckConceptTable(setup)),
    toMarkdown(kuckuckCloseTable(setup)),
    toMarkdown(kuckuckStrategyTable(setup)),
  ].join('\n\n');
}
