/**
 * Prototyp B „Kuckucks-Klatsche“ (Reflex): Eine schiefe Kuckucksuhr öffnet ihr Türchen.
 * Kommt der Kuckuck heraus, so schnell wie möglich A drücken. Kommt eine Finte (Gummiente,
 * Socke, Kaktusblüte), Finger still halten. Wer zu früh oder auf die Finte drückt, verliert
 * einen Punkt. Nur Knopf A.
 */
import { createMinigameRng } from '@chaos-party/minigame-sdk';
import {
  LeadTracker,
  lineup,
  reactionSample,
  type BotProfile,
  type GameRecord,
  type PlayerCount,
} from './common.ts';

export interface KuckuckParams {
  readonly durationMs: number;
  /** Wartezeit bis zum Türchen (s, gleichverteilt). */
  readonly waitMinS: number;
  readonly waitMaxS: number;
  /** Anteil echter Kuckucke (Rest Finten). */
  readonly realChance: number;
  /** So lange zählt ein Druck nach dem Kuckuck (s). */
  readonly windowS: number;
  readonly pauseS: number;
  /** Punkte für den Schnellsten; alle anderen im Fenster bekommen `othersPoints`. */
  readonly fastestPoints: number;
  readonly othersPoints: number;
  readonly penalty: number;
}

export const KUCKUCK_BASE: KuckuckParams = {
  durationMs: 30_000,
  waitMinS: 1.2,
  waitMaxS: 3.2,
  realChance: 0.7,
  windowS: 1.0,
  pauseS: 0.8,
  fastestPoints: 1,
  othersPoints: 0,
  penalty: 1,
};

/** Wahrscheinlichkeit je Runde, vor dem Türchen ungeduldig zu drücken (× falseStart). */
const ANTICIPATION = 0.08;

export function simulateKuckuck(
  players: PlayerCount,
  seed: number,
  params: KuckuckParams = KUCKUCK_BASE,
  profiles: readonly BotProfile[] = lineup(players),
): GameRecord {
  const rng = createMinigameRng(seed);
  const botRng = createMinigameRng(seed ^ 0x5eed);
  const scores = profiles.map(() => 0);
  const actions = profiles.map(() => 0);
  const lead = new LeadTracker((params.durationMs * 2) / 3);
  const end = params.durationMs / 1000;
  const wait = () => params.waitMinS + rng.next() * (params.waitMaxS - params.waitMinS);
  let reveal = wait();
  while (reveal + params.windowS <= end) {
    const real = rng.next() < params.realChance;
    // Ungeduldige drücken vor dem Türchen.
    const early = profiles.map((profile) => botRng.next() < profile.falseStart * ANTICIPATION);
    const presses: { index: number; at: number }[] = [];
    profiles.forEach((profile, index) => {
      if (early[index]) {
        actions[index] = (actions[index] ?? 0) + 1;
        scores[index] = Math.max(0, (scores[index] ?? 0) - params.penalty);
        return;
      }
      const reaction = reactionSample(botRng, profile.reactionMs) / 1000;
      if (real) {
        if (botRng.next() < profile.lapse) return;
        if (reaction <= params.windowS) presses.push({ index, at: reaction });
      } else if (botRng.next() < profile.falseStart) {
        actions[index] = (actions[index] ?? 0) + 1;
        scores[index] = Math.max(0, (scores[index] ?? 0) - params.penalty);
      }
    });
    presses.sort((a, b) => a.at - b.at);
    presses.forEach((press, rank) => {
      actions[press.index] = (actions[press.index] ?? 0) + 1;
      scores[press.index] =
        (scores[press.index] ?? 0) + (rank === 0 ? params.fastestPoints : params.othersPoints);
    });
    const t = reveal + params.windowS + params.pauseS;
    lead.update(scores, t * 1000);
    reveal = t + wait();
  }
  lead.update(scores, params.durationMs);
  return {
    durationMs: params.durationMs,
    scores,
    leadChanges: lead.changes,
    leaderAtTwoThirds: lead.leaderAtTwoThirds,
    actions,
  };
}
