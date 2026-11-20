/**
 * Bot für „Hallo Baukasten“ über die gemeinsame Bot-Schnittstelle (ADR-020): läuft zum
 * erreichbaren Glühwürmchen, das er bemerkt hat, und hechtet bei Zeitnot. Der Störenfried
 * stellt sich manchmal der Führung in den Weg.
 */
import {
  BotSenses,
  noisyStick,
  type BotAction,
  type BotMatchAdapter,
  type BotProfile,
  type MinigameBot,
} from '@chaos-party/minigame-kit';
import type { MinigameRng, Slot } from '@chaos-party/minigame-sdk';
import { HALLO_RULES, HalloLogic } from './logic.ts';

/** Bots entscheiden etwa sechsmal je Sekunde, nicht in jedem Schritt. */
const THINK_STEPS = 9;

export class HalloBot implements MinigameBot<HalloLogic> {
  private readonly senses: BotSenses;
  decisions = 0;

  constructor(
    readonly slot: Slot,
    readonly profile: BotProfile,
    private readonly rng: MinigameRng,
  ) {
    this.senses = new BotSenses(profile, rng);
  }

  act(game: HalloLogic): BotAction | null {
    const me = game.hopper(this.slot);
    const now = game.clock.time;
    if (!me || Math.round(now * 60) % THINK_STEPS !== 0) return null;
    for (const fly of game.flies) this.senses.see(fly.id, fly.warnAt);
    const leader = game.board.leader();
    const rival = leader !== null && leader !== this.slot ? game.hopper(leader) : undefined;
    if (rival && this.rng.next() < (this.profile.mischief ?? 0)) {
      return this.toward(Math.atan2(rival.z - me.z, rival.x - me.x));
    }
    const reachable = game.flies
      .filter((fly) => this.senses.noticed(fly.id, now))
      .map((fly) => ({ fly, eta: Math.hypot(fly.x - me.x, fly.z - me.z) / HALLO_RULES.speed }))
      .filter(({ fly, eta }) => eta < fly.arriveAt - now + 0.3)
      .sort((a, b) => a.eta - b.eta);
    const choice = this.rng.next() < this.profile.judgement ? reachable[0] : reachable.at(-1);
    if (!choice || choice.eta < 0.05) return { stick: { x: 0, y: 0 } };
    this.decisions++;
    const action = this.toward(Math.atan2(choice.fly.z - me.z, choice.fly.x - me.x));
    return choice.eta > choice.fly.arriveAt - now ? { ...action, press: ['a'] } : action;
  }

  private toward(angle: number): BotAction {
    return { stick: noisyStick(angle, this.profile, this.rng) };
  }
}

/** „Hallo Baukasten“ für `runBotMatch` (Fairness-Messung ohne Extra-Code). */
export const HALLO_BOT_ADAPTER: BotMatchAdapter<HalloLogic> = {
  create: (slots, rng, durationMs) => new HalloLogic(slots, rng, durationMs),
  bot: (slot, profile, rng) => new HalloBot(slot, profile, rng),
  apply: (game, slot, action) => {
    if (action.stick) game.setStick(slot, action.stick.x, action.stick.y);
    if (action.press?.includes('a')) game.dash(slot);
  },
  step: (game, dt) => void game.step(dt),
  finished: (game) => game.finished,
  scores: (game) => game.board.entries().map((entry) => entry.score),
  elapsedMs: (game) => game.clock.time * 1000,
};
