import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, withRules, ZERO_PACING } from './defaults.ts';
import { rankPlayers } from './economy.ts';

describe('rankPlayers', () => {
  it('sortiert nach Trophäen, dann Münzen', () => {
    expect(
      rankPlayers([
        { slot: 1, trophies: 1, coins: 50 },
        { slot: 2, trophies: 2, coins: 0 },
        { slot: 3, trophies: 1, coins: 60 },
      ]),
    ).toEqual([
      { slot: 2, place: 1, trophies: 2, coins: 0 },
      { slot: 3, place: 2, trophies: 1, coins: 60 },
      { slot: 1, place: 3, trophies: 1, coins: 50 },
    ]);
  });

  it('Gleichstand in Trophäen und Münzen = gleicher Platz, danach wird übersprungen', () => {
    expect(
      rankPlayers([
        { slot: 4, trophies: 1, coins: 10 },
        { slot: 1, trophies: 1, coins: 10 },
        { slot: 2, trophies: 3, coins: 0 },
        { slot: 3, trophies: 0, coins: 99 },
      ]).map((r) => [r.slot, r.place]),
    ).toEqual([
      [2, 1],
      [1, 2],
      [4, 2],
      [3, 4],
    ]);
  });

  it('alle gleich = alle auf Platz 1', () => {
    const ranking = rankPlayers([
      { slot: 2, trophies: 0, coins: 5 },
      { slot: 1, trophies: 0, coins: 5 },
    ]);
    expect(ranking.map((r) => [r.slot, r.place])).toEqual([
      [1, 1],
      [2, 1],
    ]);
  });

  it('leere Liste → leere Rangfolge', () => {
    expect(rankPlayers([])).toEqual([]);
  });
});

describe('DEFAULT_RULES und withRules', () => {
  it('enthält die per Experiment festgelegten Werte (CHAOS-24, EXP-001 … EXP-004)', () => {
    expect(DEFAULT_RULES).toEqual({
      diceFaces: [1, 2, 3, 4, 5, 6],
      economy: { startCoins: 10, coinsPlus: 3, coinsMinus: 3, minigameRewards: [10, 5, 3, 0] },
      trophy: { price: 15, mode: 'wandering', activeCount: 3 },
      items: {
        capacity: 3,
        startItems: 1,
        weights: { 'double-dice': 3, 'coin-steal': 3, trap: 3, shield: 2 },
        stealAmount: 5,
        trapAmount: 4,
        trapTrigger: 'pass',
      },
      pacing: {
        turnStartMs: 1200,
        rollMs: 1000,
        stepMs: 350,
        spaceEventMs: 1500,
        turnEndMs: 600,
        minigameIntroMs: 2500,
        minigamePlayMs: 3000,
        minigameResultsMs: 3000,
        roundEndMs: 1500,
        reactionWindowMs: 3000,
        disconnectGraceMs: 15000,
      },
    });
  });

  it('überschreibt gezielt und lässt den Rest', () => {
    const rules = withRules({
      economy: { coinsPlus: 4 },
      items: { weights: { shield: 0 } },
      pacing: ZERO_PACING,
    });
    expect(rules.economy).toEqual({ ...DEFAULT_RULES.economy, coinsPlus: 4 });
    expect(rules.items.weights).toEqual({ ...DEFAULT_RULES.items.weights, shield: 0 });
    expect(rules.pacing.stepMs).toBe(0);
    expect(rules.pacing.reactionWindowMs).toBe(3000);
    expect(rules.trophy).toEqual(DEFAULT_RULES.trophy);
  });
});
