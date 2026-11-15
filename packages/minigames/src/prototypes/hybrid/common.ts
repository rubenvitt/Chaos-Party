/**
 * Gemeinsamer Rahmen der Hybrid-Prototypen (EXP-007, CHAOS-29/CHAOS-32): Bot-Profile,
 * Kennzahlen einer Partie, Auswertung über viele Seeds und Markdown-Tabellen.
 *
 * Reines TypeScript ohne Babylon. Die Prototypen rechnen mit festem Schritt (1/60 s) und
 * seeded Zufall – gleiche Seeds, gleiche Zahlen.
 */
import { createMinigameRng, type MinigameRng, type Slot } from '@chaos-party/minigame-sdk';

export const STEP = 1 / 60;

/** Taktische Grundhaltung eines Bots. */
export type Strategy = 'vorsichtig' | 'gierig' | 'zufaellig' | 'raufbold';
export const STRATEGIES: readonly Strategy[] = ['vorsichtig', 'gierig', 'zufaellig', 'raufbold'];

export interface BotProfile {
  readonly strategy: Strategy;
  /** Geschicklichkeit 0–1: Reaktionszeit, Lenkgenauigkeit, Timing. */
  readonly skill: number;
}

/** Ergebnis einer simulierten Partie. */
export interface GameRecord {
  /** Endpunkte je Sitz (Reihenfolge wie die Bots). */
  readonly scores: readonly number[];
  /** Dauer in Sekunden. */
  readonly seconds: number;
  /** Zuschauer-Momente (Turm kippt, Geysir trifft, Rempler sitzt …). */
  readonly dramaticMoments: number;
  /** Diskrete Eingaben je Sitz und Sekunde (Knopfdrücke + deutliche Stick-Wechsel). */
  readonly inputsPerSecond: number;
  /** Anteil der Knopfdrücke, die B waren (wird B überhaupt gebraucht?). */
  readonly bShare: number;
  /** Wie oft wechselte die Führung (nach gesicherten Punkten)? */
  readonly leadChanges: number;
}

export interface Concept<P> {
  readonly id: string;
  readonly title: string;
  readonly instructions: readonly string[];
  readonly controls: { readonly joystick: string; readonly a: string; readonly b: string | null };
  readonly durationSeconds: number;
  play(bots: readonly BotProfile[], seed: number, params: P): GameRecord;
}

/** Zählt Eingaben eines Sitzes so, wie ein Mensch sie erleben würde. */
export class InputCounter {
  private lastX = 0;
  private lastY = 0;
  count = 0;
  bPresses = 0;
  presses = 0;

  stick(x: number, y: number): void {
    if (Math.hypot(x - this.lastX, y - this.lastY) > 0.5) {
      this.count++;
      this.lastX = x;
      this.lastY = y;
    }
  }

  press(button: 'a' | 'b'): void {
    this.count++;
    this.presses++;
    if (button === 'b') this.bPresses++;
  }
}

/** Führungswechsel: Wer allein vorn liegt, wechselt. */
export class LeadTracker {
  private leader = -1;
  changes = 0;

  update(scores: readonly number[]): void {
    let best = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let tie = false;
    for (const [index, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        best = index;
        tie = false;
      } else if (score === bestScore) {
        tie = true;
      }
    }
    if (tie || bestScore <= 0) return;
    if (this.leader !== -1 && best !== this.leader) this.changes++;
    this.leader = best;
  }
}

export function seedRange(count: number, start = 1): number[] {
  return Array.from({ length: count }, (_, index) => start + index);
}

export function slotsFor(count: number): Slot[] {
  return ([1, 2, 3, 4] as const).slice(0, count);
}

/** Bot-Zufall getrennt vom Spielzufall (eigener Seed je Sitz). */
export function botRng(seed: number, seat: number): MinigameRng {
  return createMinigameRng((seed * 7919 + seat * 104_729 + 17) >>> 0);
}

/** Normalverteilt (Box-Muller) mit Mittel 0. */
export function gauss(rng: MinigameRng, sigma: number): number {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

export interface Table {
  readonly title: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export function toMarkdown(table: Table): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  return [
    `**${table.title}**`,
    '',
    line(table.headers),
    line(table.headers.map(() => '---')),
    ...table.rows.map(line),
  ].join('\n');
}

export const pct = (value: number): string => `${Math.round(value * 100)} %`;
export const num = (value: number, digits = 1): string =>
  value.toFixed(digits).replace('.', ',').replace('-0,0', '0,0');

/** Gewinner einer Partie (alle mit Höchstpunktzahl, gerundet wie `rankByScore`). */
export function winners(scores: readonly number[]): number[] {
  const rounded = scores.map((score) => Math.round(score));
  const best = Math.max(...rounded);
  return rounded.flatMap((score, index) => (score === best ? [index] : []));
}

export interface FairnessMetrics {
  readonly seconds: number;
  readonly winnerScore: number;
  /** (Platz 1 − Platz 2) / Platz 1, Mittel. */
  readonly relativeGap: number;
  /** Anteil Partien mit geteiltem ersten Platz. */
  readonly tieShare: number;
  readonly drama: number;
  readonly inputsPerSecond: number;
  readonly bShare: number;
  readonly leadChanges: number;
}

export function fairness(records: readonly GameRecord[]): FairnessMetrics {
  const n = records.length || 1;
  let gap = 0;
  let ties = 0;
  let winnerScore = 0;
  for (const record of records) {
    const sorted = record.scores.map((s) => Math.round(s)).sort((a, b) => b - a);
    const first = sorted[0] ?? 0;
    const second = sorted[1] ?? 0;
    winnerScore += first;
    gap += first > 0 ? (first - second) / first : 0;
    if (winners(record.scores).length > 1) ties++;
  }
  const mean = (pick: (record: GameRecord) => number) =>
    records.reduce((sum, record) => sum + pick(record), 0) / n;
  return {
    seconds: mean((record) => record.seconds),
    winnerScore: winnerScore / n,
    relativeGap: gap / n,
    tieShare: ties / n,
    drama: mean((record) => record.dramaticMoments),
    inputsPerSecond: mean((record) => record.inputsPerSecond),
    bShare: mean((record) => record.bShare),
    leadChanges: mean((record) => record.leadChanges),
  };
}

/** Siegquote eines Sitzes; geteilte Siege zählen anteilig. */
export function winShare(records: readonly GameRecord[], seat: number): number {
  let share = 0;
  for (const record of records) {
    const best = winners(record.scores);
    if (best.includes(seat)) share += 1 / best.length;
  }
  return share / (records.length || 1);
}

/**
 * Strategie-Turnier: an jedem Tisch zufällige Strategien bei gleicher Geschicklichkeit.
 * Liefert je Strategie den Siegfaktor = Siegquote / fairer Anteil (1,0 = fair).
 */
export function strategyTournament<P>(
  concept: Concept<P>,
  params: P,
  players: number,
  seeds: readonly number[],
  skill = 0.7,
): Map<Strategy, number> {
  const wins = new Map<Strategy, number>();
  const seats = new Map<Strategy, number>();
  for (const seed of seeds) {
    const rng = createMinigameRng(seed * 31 + players);
    const bots = Array.from({ length: players }, () => ({
      strategy: rng.pick(STRATEGIES),
      skill,
    }));
    const record = concept.play(bots, seed, params);
    const best = winners(record.scores);
    bots.forEach((bot, seat) => {
      seats.set(bot.strategy, (seats.get(bot.strategy) ?? 0) + 1);
      if (best.includes(seat)) {
        wins.set(bot.strategy, (wins.get(bot.strategy) ?? 0) + 1 / best.length);
      }
    });
  }
  const factors = new Map<Strategy, number>();
  for (const strategy of STRATEGIES) {
    const seated = seats.get(strategy) ?? 0;
    factors.set(strategy, seated > 0 ? ((wins.get(strategy) ?? 0) / seated) * players : 0);
  }
  return factors;
}

/**
 * Reine Tische: Wie schneidet Strategie X ab, wenn alle anderen Y spielen? Ergebnis =
 * Siegfaktor von X (1,0 = fair). Zeigt, ob eine Strategie gegen alles gewinnt (dominant).
 */
export function invasion<P>(
  concept: Concept<P>,
  params: P,
  players: number,
  seeds: readonly number[],
  invader: Strategy,
  resident: Strategy,
  skill = 0.7,
): number {
  const records = seeds.map((seed) => {
    const bots: BotProfile[] = Array.from({ length: players }, (_, seat) => ({
      strategy: seat === seed % players ? invader : resident,
      skill,
    }));
    return { record: concept.play(bots, seed, params), seat: seed % players };
  });
  let share = 0;
  for (const { record, seat } of records) {
    const best = winners(record.scores);
    if (best.includes(seat)) share += 1 / best.length;
  }
  return (share / records.length) * players;
}

/**
 * Außenseiter: ein ungeschickter Bot (skill 0,2) gegen geschickte (0,9), Strategien
 * zufällig. Liefert seine Siegquote und den fairen Anteil 1/n zum Vergleich.
 */
export function underdog<P>(
  concept: Concept<P>,
  params: P,
  players: number,
  seeds: readonly number[],
): number {
  const records: GameRecord[] = [];
  for (const seed of seeds) {
    const rng = createMinigameRng(seed * 13 + players);
    const bots = Array.from({ length: players }, (_, seat) => ({
      strategy: rng.pick(STRATEGIES),
      skill: seat === 0 ? 0.2 : 0.9,
    }));
    records.push(concept.play(bots, seed, params));
  }
  return winShare(records, 0);
}

/** Gemischte Tische: zufällige Strategien und Geschicklichkeit (Normalfall am Sofa). */
export function mixedTables<P>(
  concept: Concept<P>,
  params: P,
  players: number,
  seeds: readonly number[],
): GameRecord[] {
  return seeds.map((seed) => {
    const rng = createMinigameRng(seed * 101 + players);
    const bots = Array.from({ length: players }, () => ({
      strategy: rng.pick(STRATEGIES),
      skill: 0.3 + rng.next() * 0.65,
    }));
    return concept.play(bots, seed, params);
  });
}
