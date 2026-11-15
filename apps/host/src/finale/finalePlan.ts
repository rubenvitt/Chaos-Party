/**
 * Ablauf des Finales am PC (CHAOS-37) als reine Zeitfunktion: Trophäenzählung mit
 * Spannungsaufbau, dann Siegerbildschirm. Ohne React/DOM, unit-getestet.
 *
 * 1. **Intro** („Die Trophäenzählung!“ bzw. „Partie vorzeitig beendet“).
 * 2. **Aufdecken** – vom letzten Platz zum ersten, Spieler für Spieler: Karte hebt sich,
 *    Trophäen zählen hoch, danach die Münzen, zuletzt der Platz als Stempel.
 * 3. **Gleichstand** (nur wenn der Sieg nicht schon über Trophäen fiel): vor dem Aufdecken des
 *    Siegers eine Ansage, welches Kriterium entscheidet (`decidedBy`: Münzen, Minispiel-Siege)
 *    bzw. dass der Sieg geteilt ist.
 * 4. **Sieger** – Podest, Bonus-Titel, „Nochmal spielen“ (bleibt stehen).
 *
 * `finaleStateAt(plan, ms)` liefert den Zustand zu jeder Zeit; Sprünge (Überspringen,
 * schnelles Vorspulen im Test) sind damit trivial und deterministisch.
 */
import type { RankingCriterion, RankingEntryInfo, SlotNumber } from '@chaos-party/protocol';

export const INTRO_MS = 2200;
export const REVEAL_MS = 2800;
/** Der Sieger bekommt etwas länger (Trommelwirbel). */
export const WINNER_REVEAL_MS = 3400;
export const TIEBREAK_MS = 2600;

/** Zeitanteile innerhalb eines Aufdeckens. */
const TROPHIES_FROM = 0.14;
const TROPHIES_TO = 0.5;
const COINS_FROM = 0.56;
const COINS_TO = 0.84;
const PLACE_AT = 0.88;

export type TiebreakCriterion = Exclude<RankingCriterion, 'trophies'>;

export type FinaleBeat =
  | { readonly kind: 'intro'; readonly durationMs: number }
  | {
      readonly kind: 'reveal';
      readonly slot: SlotNumber;
      readonly place: number;
      readonly durationMs: number;
    }
  | {
      readonly kind: 'tiebreak';
      readonly criterion: TiebreakCriterion;
      /** Wer auf Platz 1 um den Sieg gleichauf lag (bzw. ihn teilt). */
      readonly slots: readonly SlotNumber[];
      readonly durationMs: number;
    }
  | { readonly kind: 'winner'; readonly durationMs: number };

export interface FinalePlan {
  readonly beats: readonly FinaleBeat[];
  /** Zeitpunkt, ab dem der Siegerbildschirm steht. */
  readonly winnerAtMs: number;
  readonly endedEarly: boolean;
}

export interface FinaleCard {
  readonly slot: SlotNumber;
  readonly place: number;
  readonly decidedBy: RankingCriterion;
  /** Karte aufgedeckt (oder gerade im Aufdecken). */
  readonly revealed: boolean;
  /** Gerade dran. */
  readonly active: boolean;
  /** Angezeigte (hochgezählte) Werte. */
  readonly trophies: number;
  readonly coins: number;
  readonly placeShown: boolean;
}

export interface FinaleState {
  readonly beatIndex: number;
  readonly beat: FinaleBeat;
  /** Fortschritt im aktuellen Abschnitt 0…1 (beim Sieger immer 1). */
  readonly progress: number;
  /** Karten in Slot-Reihenfolge. */
  readonly cards: readonly FinaleCard[];
  readonly done: boolean;
}

/**
 * Kriterium, um das der Sieg ging (`null` = klar über Trophäen). Mehrere Sieger → `shared`.
 */
export function winningCriterion(ranking: readonly RankingEntryInfo[]): TiebreakCriterion | null {
  const winners = ranking.filter((entry) => entry.place === 1);
  if (winners.length > 1) return 'shared';
  const decidedBy = winners[0]?.decidedBy;
  if (decidedBy === undefined || decidedBy === 'trophies') return null;
  return decidedBy;
}

/** Wer um den Sieg gleichauf lag: alle mit den Trophäen (und ggf. Münzen) des Siegers. */
function contenders(ranking: readonly RankingEntryInfo[], criterion: TiebreakCriterion) {
  const winner = ranking.find((entry) => entry.place === 1);
  if (!winner) return [];
  return ranking
    .filter((entry) => {
      if (entry.trophies !== winner.trophies) return false;
      if (criterion === 'coins') return true;
      return entry.coins === winner.coins;
    })
    .map((entry) => entry.slot)
    .sort((a, b) => a - b);
}

/** Reihenfolge des Aufdeckens: schlechtester Platz zuerst, bei gleichem Platz nach Slot. */
export function revealOrder(ranking: readonly RankingEntryInfo[]): RankingEntryInfo[] {
  return [...ranking].sort((a, b) => b.place - a.place || b.slot - a.slot);
}

export function buildFinalePlan(
  ranking: readonly RankingEntryInfo[],
  endedEarly: boolean,
): FinalePlan {
  const beats: FinaleBeat[] = [{ kind: 'intro', durationMs: INTRO_MS }];
  const criterion = winningCriterion(ranking);
  let announced = false;
  for (const entry of revealOrder(ranking)) {
    if (entry.place === 1 && criterion !== null && !announced) {
      announced = true;
      beats.push({
        kind: 'tiebreak',
        criterion,
        slots: contenders(ranking, criterion),
        durationMs: TIEBREAK_MS,
      });
    }
    beats.push({
      kind: 'reveal',
      slot: entry.slot,
      place: entry.place,
      durationMs: entry.place === 1 ? WINNER_REVEAL_MS : REVEAL_MS,
    });
  }
  const winnerAtMs = beats.reduce((sum, beat) => sum + beat.durationMs, 0);
  beats.push({ kind: 'winner', durationMs: Number.POSITIVE_INFINITY });
  return { beats, winnerAtMs, endedEarly };
}

function ramp(progress: number, from: number, to: number): number {
  if (progress <= from) return 0;
  if (progress >= to) return 1;
  return (progress - from) / (to - from);
}

/** Zustand des Finales `elapsedMs` nach seinem Beginn (`Infinity` = übersprungen). */
export function finaleStateAt(
  plan: FinalePlan,
  ranking: readonly RankingEntryInfo[],
  elapsedMs: number,
): FinaleState {
  let start = 0;
  let beatIndex = plan.beats.length - 1;
  for (let index = 0; index < plan.beats.length; index++) {
    const beat = plan.beats[index];
    if (!beat) continue;
    if (elapsedMs < start + beat.durationMs) {
      beatIndex = index;
      break;
    }
    start += beat.durationMs;
  }
  const beat = plan.beats[beatIndex] ?? { kind: 'winner', durationMs: Number.POSITIVE_INFINITY };
  const done = beat.kind === 'winner';
  const progress = done
    ? 1
    : Math.min(1, Math.max(0, (elapsedMs - start) / Math.max(1, beat.durationMs)));

  const finished = new Set<SlotNumber>();
  for (let index = 0; index < beatIndex; index++) {
    const earlier = plan.beats[index];
    if (earlier?.kind === 'reveal') finished.add(earlier.slot);
  }

  const cards = [...ranking]
    .sort((a, b) => a.slot - b.slot)
    .map((entry): FinaleCard => {
      const base = { slot: entry.slot, place: entry.place, decidedBy: entry.decidedBy };
      if (finished.has(entry.slot)) {
        return {
          ...base,
          revealed: true,
          active: false,
          trophies: entry.trophies,
          coins: entry.coins,
          placeShown: true,
        };
      }
      if (beat.kind === 'reveal' && beat.slot === entry.slot) {
        return {
          ...base,
          revealed: true,
          active: true,
          trophies: Math.round(entry.trophies * ramp(progress, TROPHIES_FROM, TROPHIES_TO)),
          coins: Math.round(entry.coins * ramp(progress, COINS_FROM, COINS_TO)),
          placeShown: progress >= PLACE_AT,
        };
      }
      return { ...base, revealed: false, active: false, trophies: 0, coins: 0, placeShown: false };
    });

  return { beatIndex, beat, progress, cards, done };
}

/** Klänge des Finales (Namen aus `fx/sounds.ts`). */
export type FinaleCue = 'turn' | 'trophy' | 'coin' | 'pop' | 'win' | 'cheer';

/**
 * Klänge für den Übergang `prev` → `next` (je Frame/Tick aufgerufen): jede hochgezählte
 * Trophäe, Münzen-Zählung beginnt, Platz-Stempel, Gleichstand-Ansage, Sieger.
 * Höchstens ein Klang je Art und Übergang, damit schnelles Vorspulen nicht dröhnt.
 */
export function finaleCues(prev: FinaleState | null, next: FinaleState): FinaleCue[] {
  const cues = new Set<FinaleCue>();
  if (next.beatIndex !== prev?.beatIndex) {
    if (next.beat.kind === 'tiebreak' || next.beat.kind === 'reveal') cues.add('turn');
    if (next.beat.kind === 'winner') {
      cues.add('win');
      cues.add('cheer');
    }
  }
  for (const card of next.cards) {
    const before = prev?.cards.find((c) => c.slot === card.slot);
    if (!before) continue;
    if (card.trophies > before.trophies) cues.add('trophy');
    if (before.coins === 0 && card.coins > 0) cues.add('coin');
    if (card.placeShown && !before.placeShown && next.beat.kind === 'reveal') cues.add('pop');
  }
  return [...cues];
}
