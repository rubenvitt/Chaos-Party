import { createMinigameRng, type Slot } from '@chaos-party/minigame-sdk';
import { describe, expect, it } from 'vitest';
import {
  BOT_PROFILES,
  BotSenses,
  lineup,
  lineupWithTroublemaker,
  matchMetrics,
  noisyStick,
  reactionSample,
  runBotMatch,
  type BotMatchAdapter,
  type MinigameBot,
} from './bots.ts';

/**
 * Spielzeug-Spiel für die Schnittstelle: Ein Licht geht an, wer zuerst A drückt, bekommt den
 * Punkt. Bots drücken nach ihrer Reaktionszeit.
 */
interface ToyGame {
  time: number;
  readonly limit: number;
  lightAt: number;
  lightId: number;
  readonly scores: Map<Slot, number>;
  readonly slots: readonly Slot[];
}

class ToyBot implements MinigameBot<ToyGame> {
  decisions = 0;
  private readonly senses;
  constructor(
    readonly slot: Slot,
    readonly profile: (typeof BOT_PROFILES)[keyof typeof BOT_PROFILES],
    rng: ReturnType<typeof createMinigameRng>,
  ) {
    this.senses = new BotSenses<number>(profile, rng);
  }
  act(game: ToyGame) {
    if (game.lightAt < 0) return null;
    this.senses.see(game.lightId, game.lightAt);
    if (!this.senses.noticed(game.lightId, game.time)) return null;
    this.decisions++;
    return { press: ['a'] as const };
  }
}

const toyAdapter: BotMatchAdapter<ToyGame> = {
  create: (slots, _rng, durationMs) => ({
    time: 0,
    limit: durationMs / 1000,
    lightAt: -1,
    lightId: 0,
    scores: new Map(slots.map((slot) => [slot, 0])),
    slots,
  }),
  bot: (slot, profile, rng) => new ToyBot(slot, profile as typeof BOT_PROFILES.normal, rng),
  apply: (game, slot, action) => {
    if (!action.press?.includes('a') || game.lightAt < 0) return;
    game.scores.set(slot, (game.scores.get(slot) ?? 0) + 1);
    game.lightAt = -1;
  },
  step: (game, dt) => {
    game.time += dt;
    if (game.lightAt < 0 && Math.round(game.time * 60) % 90 === 0) {
      game.lightAt = game.time;
      game.lightId++;
    }
  },
  finished: (game) => game.time >= game.limit - 1e-6,
  scores: (game) => game.slots.map((slot) => game.scores.get(slot) ?? 0),
  elapsedMs: (game) => game.time * 1000,
};

describe('Bot-Profile', () => {
  it('Besetzung: Profi vorn, Neuling hinten; Störenfried ersetzt den Zweiten', () => {
    expect(lineup(2).map((p) => p.name)).toEqual(['Profi', 'Neuling']);
    expect(lineup(4).map((p) => p.name)).toEqual(['Profi', 'Gut', 'Normal', 'Neuling']);
    expect(lineupWithTroublemaker(4).map((p) => p.name)).toEqual([
      'Profi',
      'Störenfried',
      'Normal',
      'Neuling',
    ]);
    expect(lineupWithTroublemaker(2).map((p) => p.name)).toEqual(['Störenfried', 'Neuling']);
    expect(BOT_PROFILES.stoerenfried.mischief).toBeGreaterThan(0.5);
  });

  it('Reaktionszeiten streuen um den Mittelwert, Lenkung ist verrauscht', () => {
    const rng = createMinigameRng(3);
    const samples = Array.from({ length: 400 }, () => reactionSample(rng, 400));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(360);
    expect(mean).toBeLessThan(440);
    const stick = noisyStick(0, BOT_PROFILES.profi, rng);
    expect(Math.hypot(stick.x, stick.y)).toBeCloseTo(1);
    expect(stick.x).toBeGreaterThan(0.9);
  });

  it('Wahrnehmung: erst nach der Reaktionszeit, Gefahren nur mit Aufmerksamkeit', () => {
    const senses = new BotSenses<string>(
      { ...BOT_PROFILES.normal, reactionMs: 300, awareness: 0 },
      createMinigameRng(1),
    );
    senses.see('x', 0);
    expect(senses.noticed('x', 0)).toBe(false);
    expect(senses.noticed('x', 2)).toBe(true);
    expect(senses.noticed('x', 2, true)).toBe(false);
    expect(senses.noticed('y', 2)).toBe(false);
    senses.forget('x');
    expect(senses.noticed('x', 2)).toBe(false);
  });
});

describe('Bot-Partie über die gemeinsame Schnittstelle', () => {
  it('ist deterministisch und der Profi gewinnt das Reaktionsspiel meistens', () => {
    const first = runBotMatch(toyAdapter, 4, lineup(4), 20_000);
    expect(runBotMatch(toyAdapter, 4, lineup(4), 20_000)).toEqual(first);
    expect(first.scores.reduce((a, b) => a + b, 0)).toBeGreaterThan(5);
    const records = Array.from({ length: 20 }, (_, seed) =>
      runBotMatch(toyAdapter, seed + 1, lineup(3), 20_000),
    );
    const metrics = matchMetrics(records);
    expect(metrics.durationS).toBe(20);
    expect(metrics.strongestWins).toBeGreaterThan(metrics.weakestWins);
    expect(metrics.actionsPer10s).toBeGreaterThan(0);
    expect(matchMetrics([]).winnerScore).toBe(0);
  });
});
