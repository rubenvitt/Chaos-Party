/**
 * Bots für die **echte** Sockenregen-Logik (`../../sockenregen/logic.ts`). Gleiches Verhalten
 * wie im Prototyp A: Gefahren ausweichen (wenn bemerkt), bestes erreichbares Sockenziel
 * ansteuern, Hechtsprung bei Zeitnot. Dient der Kontrollzeile „A4 (Spiellogik)“ in EXP-005
 * und den Logiktests.
 */
import { createMinigameRng, type MinigameRng, type Slot } from '@chaos-party/minigame-sdk';
import { SockenregenLogic, type Item, type Runner } from '../../sockenregen/logic.ts';
import {
  BOT_PROFILES,
  LeadTracker,
  gaussian,
  lineup,
  reactionSample,
  type BotProfile,
  type GameRecord,
  type PlayerCount,
} from './common.ts';

const THINK_S = 0.15;

export class SockenregenBot {
  private readonly seen = new Map<number, { noticeAt: number; aware: boolean }>();
  private nextThink = 0;
  private target: number | null = null;
  decisions = 0;

  constructor(
    readonly slot: Slot,
    readonly profile: BotProfile,
    private readonly rng: MinigameRng,
  ) {}

  /** Entscheidet für den aktuellen Schritt: Stick und ob A gedrückt wird. */
  act(game: SockenregenLogic): { x: number; y: number; dash: boolean } | null {
    const me = game.runner(this.slot);
    if (!me) return null;
    const t = game.time;
    for (const item of game.items) {
      if (!this.seen.has(item.id)) {
        this.seen.set(item.id, {
          noticeAt: t + reactionSample(this.rng, this.profile.reactionMs) / 1000,
          aware: this.rng.next() < this.profile.awareness,
        });
      }
    }
    if (t < this.nextThink) return null;
    this.nextThink = t + THINK_S;
    if (game.isStunned(me)) return { x: 0, y: 0, dash: false };
    const { rules } = game;

    for (const item of game.items) {
      if (item.kind !== 'iron' || item.state !== 'flying' || !this.noticed(item, t, true)) continue;
      const d = Math.hypot(me.x - item.x, me.z - item.z);
      if (d < rules.ironRadius + 0.4 && item.landT - t < 1.0) {
        const away =
          d < 0.05 ? this.rng.next() * Math.PI * 2 : Math.atan2(me.z - item.z, me.x - item.x);
        this.target = null;
        return { ...this.steer(away), dash: false };
      }
    }

    const candidates: { item: Item; value: number }[] = [];
    for (const item of game.items) {
      if (item.kind === 'iron' || item.state === 'gone' || !this.noticed(item, t, false)) continue;
      const d = Math.hypot(me.x - item.x, me.z - item.z);
      const eta = d / rules.speed;
      const deadline = (item.state === 'flying' ? item.landT : t) + rules.groundS - t;
      if (eta > deadline) continue;
      const rival = Math.min(
        ...game.runners
          .filter((other) => other !== me)
          .map((other) => Math.hypot(other.x - item.x, other.z - item.z)),
      );
      const contested = rival + 0.8 < d ? 0.35 : 1;
      const points = item.kind === 'gold' ? rules.goldPoints : 1;
      candidates.push({ item, value: (points * contested) / (eta + 0.4) });
    }
    if (candidates.length === 0) {
      this.target = null;
      const d = Math.hypot(me.x, me.z);
      return d > 1
        ? { ...this.steer(Math.atan2(-me.z, -me.x)), dash: false }
        : { x: 0, y: 0, dash: false };
    }
    candidates.sort((a, b) => b.value - a.value);
    const choice =
      this.rng.next() < this.profile.judgement
        ? candidates[0]
        : candidates[Math.floor(this.rng.next() * Math.min(3, candidates.length))];
    if (!choice) return null;
    if (choice.item.id !== this.target) this.decisions++;
    this.target = choice.item.id;
    const d = Math.hypot(me.x - choice.item.x, me.z - choice.item.z);
    if (d < 0.15) return { x: 0, y: 0, dash: false };
    const stick = this.steer(Math.atan2(choice.item.z - me.z, choice.item.x - me.x));
    const hurry = choice.item.state === 'ground' || choice.item.landT - t < d / rules.speed;
    const dash = d > 2 && hurry && t >= me.dashReadyAt && this.rng.next() < this.profile.judgement;
    return { ...stick, dash };
  }

  private noticed(item: Item, t: number, needsAwareness: boolean): boolean {
    const seen = this.seen.get(item.id);
    if (!seen || t < seen.noticeAt) return false;
    return !needsAwareness || seen.aware;
  }

  /** Winkel in der x/z-Ebene → Stick (x, y = +z) mit Lenkungsrauschen. */
  private steer(angle: number): { x: number; y: number } {
    const noisy = angle + gaussian(this.rng) * this.profile.aimNoise;
    return { x: Math.cos(noisy), y: Math.sin(noisy) };
  }
}

/** Eine ganze Runde mit Bots auf der echten Logik (1/60-s-Schritte wie die Laufzeit). */
export function simulateSockenregenLogic(
  players: PlayerCount,
  seed: number,
  profiles: readonly BotProfile[] = lineup(players),
  durationMs = 30_000,
): GameRecord {
  const slots = ([1, 2, 3, 4] as const).slice(0, profiles.length);
  const game = new SockenregenLogic(slots, createMinigameRng(seed), durationMs);
  const bots = slots.map(
    (slot, index) =>
      new SockenregenBot(
        slot,
        profiles[index] ?? BOT_PROFILES.normal,
        createMinigameRng(seed * 31 + slot),
      ),
  );
  const lead = new LeadTracker((durationMs * 2) / 3);
  const score = (runner: Runner) => runner.score;
  while (!game.finished) {
    for (const bot of bots) {
      const action = bot.act(game);
      if (!action) continue;
      game.setStick(bot.slot, action.x, action.y);
      if (action.dash) game.dash(bot.slot);
    }
    game.step(1 / 60);
    lead.update(game.runners.map(score), game.time * 1000);
  }
  return {
    durationMs,
    scores: game.runners.map(score),
    leadChanges: lead.changes,
    leaderAtTwoThirds: lead.leaderAtTwoThirds,
    actions: bots.map((bot, index) => bot.decisions + (game.runners[index]?.dashes ?? 0)),
  };
}
