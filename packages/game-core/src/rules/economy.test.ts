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
      { slot: 2, place: 1, trophies: 2, coins: 0, minigameWins: 0, decidedBy: 'trophies' },
      { slot: 3, place: 2, trophies: 1, coins: 60, minigameWins: 0, decidedBy: 'coins' },
      { slot: 1, place: 3, trophies: 1, coins: 50, minigameWins: 0, decidedBy: 'coins' },
    ]);
  });

  it('Gleichstand in Trophäen, Münzen und Siegen = gleicher Platz, danach wird übersprungen', () => {
    expect(
      rankPlayers([
        { slot: 4, trophies: 1, coins: 10, minigameWins: 1 },
        { slot: 1, trophies: 1, coins: 10, minigameWins: 1 },
        { slot: 2, trophies: 3, coins: 0, minigameWins: 0 },
        { slot: 3, trophies: 0, coins: 99, minigameWins: 3 },
      ]).map((r) => [r.slot, r.place, r.decidedBy]),
    ).toEqual([
      [2, 1, 'trophies'],
      [1, 2, 'shared'],
      [4, 2, 'shared'],
      [3, 4, 'trophies'],
    ]);
  });

  it('Minispiel-Siege entscheiden bei Gleichstand in Trophäen und Münzen (CHAOS-37)', () => {
    expect(
      rankPlayers([
        { slot: 1, trophies: 2, coins: 7, minigameWins: 1 },
        { slot: 2, trophies: 2, coins: 7, minigameWins: 3 },
        { slot: 3, trophies: 2, coins: 9, minigameWins: 0 },
        { slot: 4, trophies: 0, coins: 40, minigameWins: 4 },
      ]),
    ).toEqual([
      { slot: 3, place: 1, trophies: 2, coins: 9, minigameWins: 0, decidedBy: 'coins' },
      { slot: 2, place: 2, trophies: 2, coins: 7, minigameWins: 3, decidedBy: 'minigame-wins' },
      { slot: 1, place: 3, trophies: 2, coins: 7, minigameWins: 1, decidedBy: 'minigame-wins' },
      { slot: 4, place: 4, trophies: 0, coins: 40, minigameWins: 4, decidedBy: 'trophies' },
    ]);
  });

  it('jede Stufe einzeln: Trophäen schlagen Münzen, Münzen schlagen Siege', () => {
    const [first, second] = rankPlayers([
      { slot: 1, trophies: 0, coins: 99, minigameWins: 9 },
      { slot: 2, trophies: 1, coins: 0, minigameWins: 0 },
    ]);
    expect([first?.slot, second?.slot]).toEqual([2, 1]);
    const [a, b] = rankPlayers([
      { slot: 1, trophies: 1, coins: 3, minigameWins: 9 },
      { slot: 2, trophies: 1, coins: 4, minigameWins: 0 },
    ]);
    expect([a?.slot, a?.decidedBy, b?.slot, b?.decidedBy]).toEqual([2, 'coins', 1, 'coins']);
  });

  it('alle gleich = alle auf Platz 1, geteilt', () => {
    const ranking = rankPlayers([
      { slot: 2, trophies: 0, coins: 5 },
      { slot: 1, trophies: 0, coins: 5 },
    ]);
    expect(ranking.map((r) => [r.slot, r.place, r.decidedBy])).toEqual([
      [1, 1, 'shared'],
      [2, 1, 'shared'],
    ]);
  });

  it('ein Spieler: Platz 1 durch Trophäen; leere Liste → leere Rangfolge', () => {
    expect(rankPlayers([{ slot: 3, trophies: 0, coins: 0 }])).toEqual([
      { slot: 3, place: 1, trophies: 0, coins: 0, minigameWins: 0, decidedBy: 'trophies' },
    ]);
    expect(rankPlayers([])).toEqual([]);
  });
});

describe('DEFAULT_RULES und withRules', () => {
  it('enthält die per Experiment festgelegten Werte (CHAOS-24, EXP-001 … EXP-004, EXP-018, EXP-019) und M3-Minispielzeiten', () => {
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
        sabotageGrowthRounds: 5,
        trapTrigger: 'pass',
        minigameLastItems: 1,
      },
      pacing: {
        turnStartMs: 1200,
        rollMs: 1000,
        stepMs: 350,
        spaceEventMs: 1500,
        turnEndMs: 600,
        minigameIntroMs: 7000,
        minigamePlayMs: 3000,
        minigameResultsMs: 6000,
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
