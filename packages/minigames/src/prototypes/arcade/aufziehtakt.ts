/**
 * Prototyp C „Aufzieh-Takt“ (Timing): Jede Figur hat einen Aufziehschlüssel. Ein Ring
 * schrumpft auf den Schlüssel zu; wer A genau dann drückt, wenn er ihn berührt, dreht den
 * Schlüssel („Perfekt“ 2, „Gut“ 1). Fünf Treffer am Stück geben einen Bonuspunkt. Der Takt
 * wird schneller. Nur Knopf A, alle spielen gleichzeitig, aber jeder für sich.
 */
import { createMinigameRng } from '@chaos-party/minigame-sdk';
import {
  LeadTracker,
  gaussian,
  lineup,
  type BotProfile,
  type GameRecord,
  type PlayerCount,
} from './common.ts';

export interface AufziehtaktParams {
  readonly durationMs: number;
  readonly startBeatS: number;
  readonly endBeatS: number;
  readonly perfectMs: number;
  readonly goodMs: number;
  readonly comboLength: number;
}

export const AUFZIEHTAKT_BASE: AufziehtaktParams = {
  durationMs: 30_000,
  startBeatS: 0.9,
  endBeatS: 0.55,
  perfectMs: 45,
  goodMs: 110,
  comboLength: 5,
};

export function simulateAufziehtakt(
  players: PlayerCount,
  seed: number,
  params: AufziehtaktParams = AUFZIEHTAKT_BASE,
  profiles: readonly BotProfile[] = lineup(players),
): GameRecord {
  const botRng = createMinigameRng(seed ^ 0x5eed);
  const scores = profiles.map(() => 0);
  const combos = profiles.map(() => 0);
  const actions = profiles.map(() => 0);
  const lead = new LeadTracker((params.durationMs * 2) / 3);
  const end = params.durationMs / 1000;
  let t = 1;
  while (t < end) {
    profiles.forEach((profile, index) => {
      if (botRng.next() < profile.lapse) {
        combos[index] = 0;
        return;
      }
      actions[index] = (actions[index] ?? 0) + 1;
      const error = Math.abs(gaussian(botRng) * profile.timingSdMs);
      const points = error <= params.perfectMs ? 2 : error <= params.goodMs ? 1 : 0;
      if (points === 0) {
        combos[index] = 0;
        return;
      }
      const combo = (combos[index] ?? 0) + 1;
      combos[index] = combo;
      scores[index] = (scores[index] ?? 0) + points + (combo % params.comboLength === 0 ? 1 : 0);
    });
    lead.update(scores, t * 1000);
    const progress = t / end;
    t += params.startBeatS + (params.endBeatS - params.startBeatS) * progress;
  }
  return {
    durationMs: params.durationMs,
    scores,
    leadChanges: lead.changes,
    leaderAtTwoThirds: lead.leaderAtTwoThirds,
    actions,
  };
}
