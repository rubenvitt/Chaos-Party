/**
 * Gemeinsame Bausteine der Arcade-Prototypen (EXP-005, CHAOS-29/30): Bot-Profile,
 * Zufallsverteilungen, Spielprotokoll und Kennzahlen.
 *
 * Die Prototypen sind **reine Logik ohne Babylon**: grobe Modelle der Spielideen, gerade
 * genau genug, um Konzepte mit Bots zu vergleichen. Zahlen daraus sind Näherungen, kein
 * Beweis für Spaß.
 */
import type { MinigameRng } from '@chaos-party/minigame-sdk';

export type PlayerCount = 2 | 3 | 4;

/**
 * Bot-Profil: wie schnell und wie zuverlässig jemand spielt. Werte sind Annahmen für
 * Couch-Spieler (Reaktionszeit inkl. Bildschirm/Funk-Latenz), nicht gemessen.
 */
export interface BotProfile {
  readonly name: string;
  /** Mittlere Reaktionszeit (ms) auf ein neues Signal. */
  readonly reactionMs: number;
  /** Lenkungsungenauigkeit (Radiant, Standardabweichung). */
  readonly aimNoise: number;
  /** Zeitfehler beim Takt-Drücken (ms, Standardabweichung). */
  readonly timingSdMs: number;
  /** Wahrscheinlichkeit, auf eine Finte hereinzufallen / zu früh zu drücken. */
  readonly falseStart: number;
  /** Wahrscheinlichkeit, eine Gefahr rechtzeitig zu bemerken. */
  readonly awareness: number;
  /** Wahrscheinlichkeit, das beste statt eines zufälligen Ziels zu wählen. */
  readonly judgement: number;
  /** Wahrscheinlichkeit für einen Aussetzer (Takt verpasst, Knopf nicht gedrückt). */
  readonly lapse: number;
}

export const BOT_PROFILES = {
  profi: {
    name: 'Profi',
    reactionMs: 230,
    aimNoise: 0.05,
    timingSdMs: 35,
    falseStart: 0.06,
    awareness: 0.95,
    judgement: 0.9,
    lapse: 0.02,
  },
  gut: {
    name: 'Gut',
    reactionMs: 310,
    aimNoise: 0.1,
    timingSdMs: 55,
    falseStart: 0.12,
    awareness: 0.85,
    judgement: 0.75,
    lapse: 0.04,
  },
  normal: {
    name: 'Normal',
    reactionMs: 400,
    aimNoise: 0.18,
    timingSdMs: 80,
    falseStart: 0.2,
    awareness: 0.7,
    judgement: 0.6,
    lapse: 0.07,
  },
  neuling: {
    name: 'Neuling',
    reactionMs: 560,
    aimNoise: 0.3,
    timingSdMs: 120,
    falseStart: 0.32,
    awareness: 0.5,
    judgement: 0.4,
    lapse: 0.12,
  },
} as const satisfies Record<string, BotProfile>;

/**
 * Besetzung je Spielerzahl: immer der stärkste (Profi) und der schwächste (Neuling) Bot,
 * dazwischen aufgefüllt. Index 0 ist der Profi, der letzte Index der Neuling.
 */
export function lineup(players: PlayerCount): BotProfile[] {
  const { profi, gut, normal, neuling } = BOT_PROFILES;
  if (players === 2) return [profi, neuling];
  if (players === 3) return [profi, normal, neuling];
  return [profi, gut, normal, neuling];
}

/** Standardnormalverteilt (Box-Muller). */
export function gaussian(rng: MinigameRng): number {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Log-normal um `mean` (ms) mit Streuung `sigma` (Reaktionszeiten sind rechtsschief). */
export function reactionSample(rng: MinigameRng, mean: number, sigma = 0.25): number {
  return mean * Math.exp(sigma * gaussian(rng) - (sigma * sigma) / 2);
}

/**
 * Protokoll einer simulierten Runde. `scores[i]` gehört zu Bot `i` aus `lineup`.
 */
export interface GameRecord {
  readonly durationMs: number;
  readonly scores: readonly number[];
  /** Wie oft wechselte die alleinige Führung (Gleichstand zählt nicht als Wechsel). */
  readonly leadChanges: number;
  /** Alleiniger Führender nach 2/3 der Spielzeit (`null` bei Gleichstand). */
  readonly leaderAtTwoThirds: number | null;
  /** Bedeutsame Aktionen je Spieler (Ziele/Knöpfe), für „wie viel zu tun“. */
  readonly actions: readonly number[];
}

/** Verfolgt Führungswechsel während einer Simulation. */
export class LeadTracker {
  private leader: number | null = null;
  private atTwoThirds: number | null = null;
  private snapshotTaken = false;
  changes = 0;

  constructor(private readonly twoThirdsMs: number) {}

  update(scores: readonly number[], nowMs: number): void {
    if (!this.snapshotTaken && nowMs >= this.twoThirdsMs) {
      this.snapshotTaken = true;
      this.atTwoThirds = uniqueLeader(scores);
    }
    const current = uniqueLeader(scores);
    if (current !== null && current !== this.leader) {
      if (this.leader !== null) this.changes++;
      this.leader = current;
    }
  }

  get leaderAtTwoThirds(): number | null {
    return this.atTwoThirds;
  }
}

export function uniqueLeader(scores: readonly number[]): number | null {
  const best = Math.max(...scores);
  const leaders = scores.flatMap((score, index) => (score === best ? [index] : []));
  return leaders.length === 1 && best > 0 ? (leaders[0] ?? null) : null;
}

export interface ConceptMetrics {
  readonly durationS: number;
  readonly winnerScore: number;
  /** Mittlerer relativer Abstand Platz 1–2: (P1 − P2) / P1. */
  readonly gap: number;
  /** Anteil Runden mit geteiltem ersten Platz. */
  readonly tieForFirst: number;
  readonly leadChanges: number;
  /** Anteil Runden, in denen der Sieger nach 2/3 der Zeit nicht allein führte. */
  readonly comeback: number;
  /** Siegquote des stärksten Bots (Gleichstand anteilig). */
  readonly strongestWins: number;
  /** Siegquote des schwächsten Bots (Gleichstand anteilig). */
  readonly weakestWins: number;
  /** Aktionen je Spieler und 10 s. */
  readonly actionsPer10s: number;
}

export function metrics(records: readonly GameRecord[]): ConceptMetrics {
  let duration = 0;
  let winnerScore = 0;
  let gap = 0;
  let ties = 0;
  let leadChanges = 0;
  let comeback = 0;
  let strongest = 0;
  let weakest = 0;
  let actions = 0;
  for (const record of records) {
    const { scores } = record;
    const sorted = [...scores].sort((a, b) => b - a);
    const best = sorted[0] ?? 0;
    const second = sorted[1] ?? 0;
    const winners = scores.flatMap((score, index) => (score === best ? [index] : []));
    duration += record.durationMs / 1000;
    winnerScore += best;
    gap += best > 0 ? (best - second) / best : 0;
    if (winners.length > 1) ties++;
    leadChanges += record.leadChanges;
    if (record.leaderAtTwoThirds === null || !winners.includes(record.leaderAtTwoThirds)) {
      comeback++;
    }
    if (winners.includes(0)) strongest += 1 / winners.length;
    if (winners.includes(scores.length - 1)) weakest += 1 / winners.length;
    const totalActions = record.actions.reduce((sum, value) => sum + value, 0);
    actions += totalActions / scores.length / (record.durationMs / 10_000);
  }
  const n = Math.max(1, records.length);
  return {
    durationS: duration / n,
    winnerScore: winnerScore / n,
    gap: gap / n,
    tieForFirst: ties / n,
    leadChanges: leadChanges / n,
    comeback: comeback / n,
    strongestWins: strongest / n,
    weakestWins: weakest / n,
    actionsPer10s: actions / n,
  };
}

export interface Table {
  readonly title: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export function toMarkdown(table: Table): string {
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  return [
    `**${table.title}**`,
    '',
    line(table.headers),
    line(table.headers.map(() => '---')),
    ...table.rows.map(line),
  ].join('\n');
}

/** Deutsche Zahl mit fester Nachkommazahl. */
export function num(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',');
}

export function pct(value: number): string {
  return `${Math.round(value * 100)} %`;
}

/** `count` aufeinanderfolgende Seeds ab `first`. */
export function seedRange(count: number, first = 1): number[] {
  return Array.from({ length: count }, (_, index) => first + index);
}

/** Abstand zwischen zwei Punkten in der Ebene. */
export function distance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
