/**
 * EXP-005: Arcade-Konzepte im Vergleich (CHAOS-29/30). Läuft alle Prototypen mit festen
 * Seeds und Bot-Besetzungen und erzeugt die Tabellen für
 * `docs/experiments.md`:
 *
 * ```sh
 * EXPERIMENTS=1 pnpm exec vitest run packages/minigames/src/prototypes/arcade --silent=false
 * ```
 */
import { AUFZIEHTAKT_BASE, simulateAufziehtakt } from './aufziehtakt.ts';
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
import { SOCKENREGEN_BASE, simulateSockenregen } from './sockenregen.ts';
import { simulateSockenregenLogic } from './sockenregenBot.ts';

export interface ConceptVariant {
  readonly id: string;
  readonly label: string;
  readonly run: (
    players: PlayerCount,
    seed: number,
    profiles?: readonly BotProfile[],
  ) => GameRecord;
}

export const VARIANTS: readonly ConceptVariant[] = [
  {
    id: 'A1',
    label: 'Sockenregen, nur Stick',
    run: (players, seed, profiles) =>
      simulateSockenregen(players, seed, SOCKENREGEN_BASE, profiles),
  },
  {
    id: 'A2',
    label: 'Sockenregen + Hechtsprung (A)',
    run: (players, seed, profiles) =>
      simulateSockenregen(players, seed, { ...SOCKENREGEN_BASE, dash: true }, profiles),
  },
  {
    id: 'A3',
    label: 'A2 + Bügeleisen kostet 1 Socke',
    run: (players, seed, profiles) =>
      simulateSockenregen(
        players,
        seed,
        { ...SOCKENREGEN_BASE, dash: true, ironDrop: true },
        profiles,
      ),
  },
  {
    id: 'A4',
    label: 'A3 + Bügeleisen zielen auf Führung',
    run: (players, seed, profiles) =>
      simulateSockenregen(
        players,
        seed,
        {
          ...SOCKENREGEN_BASE,
          dash: true,
          ironDrop: true,
          ironTarget: 'leader',
        },
        profiles,
      ),
  },
  {
    id: 'A5',
    label: 'A4 + halbe Goldsocken beim Letzten',
    run: (players, seed, profiles) =>
      simulateSockenregen(
        players,
        seed,
        {
          ...SOCKENREGEN_BASE,
          dash: true,
          ironDrop: true,
          ironTarget: 'leader',
          goldNearLast: 0.5,
        },
        profiles,
      ),
  },
  {
    id: 'A4*',
    label: 'A4 auf der echten Spiellogik',
    run: (players, seed, profiles) => simulateSockenregenLogic(players, seed, profiles),
  },
  {
    id: 'B1',
    label: 'Kuckucks-Klatsche, Schnellster +1',
    run: (players, seed, profiles) => simulateKuckuck(players, seed, KUCKUCK_BASE, profiles),
  },
  {
    id: 'B2',
    label: 'Kuckucks-Klatsche, 2 / Rest 1',
    run: (players, seed, profiles) =>
      simulateKuckuck(
        players,
        seed,
        { ...KUCKUCK_BASE, fastestPoints: 2, othersPoints: 1 },
        profiles,
      ),
  },
  {
    id: 'C1',
    label: 'Aufzieh-Takt',
    run: (players, seed, profiles) =>
      simulateAufziehtakt(players, seed, AUFZIEHTAKT_BASE, profiles),
  },
];

/** Steckbrief-Entwurf je Konzept: Bedienung und Anleitung (≤ 3 Zeilen à 64 Zeichen). */
export const CONCEPT_SHEETS = [
  {
    id: 'A',
    title: 'Sockenregen',
    input: 'Stick (+ A)',
    interaction: 'hoch: gleiche Socken, Gedränge',
    ipad: 'mittel: Stick braucht Platz',
    instructions: [
      'Fang die Socken, die Waschmaschine Wumms rausschleudert!',
      'Rote Schatten = Bügeleisen. Ausweichen, sonst liegst du flach.',
      'A = Hechtsprung. Goldsocke zählt 3.',
    ],
  },
  {
    id: 'B',
    title: 'Kuckucks-Klatsche',
    input: 'nur A',
    interaction: 'mittel: Wettlauf um den Ersten',
    ipad: 'sehr gut: ein großer Knopf',
    instructions: [
      'Kommt der Kuckuck raus: sofort A!',
      'Ente, Socke oder Blume? Finger weg, sonst Minuspunkt.',
    ],
  },
  {
    id: 'C',
    title: 'Aufzieh-Takt',
    input: 'nur A',
    interaction: 'kaum: jeder spielt für sich',
    ipad: 'sehr gut: ein großer Knopf',
    instructions: [
      'Drück A, wenn der Ring deinen Schlüssel berührt.',
      'Genau = 2 Punkte, knapp = 1. Fünf Treffer am Stück: Bonus!',
    ],
  },
] as const;

export interface ExperimentSetup {
  readonly seeds: readonly number[];
  readonly players: readonly PlayerCount[];
}

export const DEFAULT_SETUP: ExperimentSetup = { seeds: seedRange(300), players: [2, 3, 4] };

export function conceptTable(setup: ExperimentSetup = DEFAULT_SETUP): Table {
  const rows: string[][] = [];
  for (const variant of VARIANTS) {
    for (const players of setup.players) {
      const records = setup.seeds.map((seed) => variant.run(players, seed));
      const m = metrics(records);
      rows.push([
        `${variant.id}: ${variant.label}`,
        String(players),
        num(m.durationS, 0),
        num(m.winnerScore),
        pct(m.gap),
        pct(m.tieForFirst),
        num(m.leadChanges),
        pct(m.comeback),
        pct(m.strongestWins),
        pct(m.weakestWins),
        pct(1 / players),
        num(m.actionsPer10s),
      ]);
    }
  }
  return {
    title: `EXP-005 Arcade-Konzepte (Seeds ${String(setup.seeds[0])}–${String(setup.seeds.at(-1))} je Zeile)`,
    headers: [
      'Variante',
      'Sp.',
      'Dauer s',
      'Punkte P1',
      'Abstand 1–2',
      'Gleichstand P1',
      'Führungswechsel',
      'Comeback',
      'Siege Profi',
      'Siege Neuling',
      'fair',
      'Aktionen/10 s',
    ],
    rows,
  };
}

/**
 * Knappe Besetzungen: Wie oft gewinnt der etwas Schwächere im Duell (Gut gegen Normal), und
 * wie eng wird es zwischen vier gleich starken Bots (4× Normal)?
 */
export function closeTable(setup: ExperimentSetup = DEFAULT_SETUP): Table {
  const { gut, normal } = BOT_PROFILES;
  const rows: string[][] = [];
  for (const variant of VARIANTS) {
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
    title: `EXP-005 Knappe Besetzungen (Seeds ${String(setup.seeds[0])}–${String(setup.seeds.at(-1))})`,
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

export function sheetTable(): Table {
  return {
    title: 'EXP-005 Bedienung und Verständlichkeit',
    headers: ['Konzept', 'Eingabe', 'Interaktion', 'iPad-Zone', 'Anleitung', 'längste Zeile'],
    rows: CONCEPT_SHEETS.map((sheet) => [
      `${sheet.id}: ${sheet.title}`,
      sheet.input,
      sheet.interaction,
      sheet.ipad,
      `${String(sheet.instructions.length)} Zeilen`,
      `${String(Math.max(...sheet.instructions.map((line) => line.length)))} Zeichen`,
    ]),
  };
}

export function runAllExperiments(setup: ExperimentSetup = DEFAULT_SETUP): string {
  return [
    toMarkdown(conceptTable(setup)),
    toMarkdown(closeTable(setup)),
    toMarkdown(sheetTable()),
  ].join('\n\n');
}
