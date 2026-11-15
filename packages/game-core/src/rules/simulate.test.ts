import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from './defaults.ts';
import { simulateGame, summarizeSimulations } from './simulate.ts';
import { TEST_BOARD } from './testBoards.ts';

describe('simulateGame', () => {
  it('ist deterministisch je Seed und unterscheidet Seeds', () => {
    const a = simulateGame({ board: TEST_BOARD, rounds: 5, seed: 11, players: 4 });
    const b = simulateGame({ board: TEST_BOARD, rounds: 5, seed: 11, players: 4 });
    const c = simulateGame({ board: TEST_BOARD, rounds: 5, seed: 12, players: 4 });
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
  });

  for (const players of [2, 3, 4] as const) {
    it(`liefert plausible Kennzahlen mit ${String(players)} Spielern`, () => {
      const r = simulateGame({ board: TEST_BOARD, rounds: 6, seed: players, players });
      expect(r.turns).toBe(players * 6);
      expect(r.turnDurationsMs).toHaveLength(r.turns);
      expect(r.spacesPerTurn).toHaveLength(r.turns);
      expect(r.avgSpacesPerTurn).toBeGreaterThan(1);
      expect(r.avgSpacesPerTurn).toBeLessThanOrEqual(12);
      expect(r.durationMs).toBeGreaterThan(r.turnDurationsMs.reduce((s, d) => s + d, 0));
      expect(r.avgTurnMs).toBeGreaterThan(DEFAULT_RULES.pacing.turnStartMs);
      expect(r.standings).toHaveLength(players);
      expect(r.ranking[0]?.place).toBe(1);
      for (const p of r.standings) expect(p.coins).toBeGreaterThanOrEqual(0);
      expect(r.trophyGap).toBe((r.ranking[0]?.trophies ?? 0) - (r.ranking[1]?.trophies ?? 0));
      expect(r.trophiesBought).toBe(r.standings.reduce((s, p) => s + p.trophies, 0));
      // Jeder Münzklau öffnet genau ein Reaktionsfenster.
      expect(r.reactions.shield + r.reactions.brace + r.reactions.timeout).toBe(r.coinSteals);
      expect(r.itemsUsed['coin-steal']).toBe(r.coinSteals);
      expect(r.itemsUsed.trap).toBe(r.trapsPlaced);
      expect(r.trapsTriggered).toBeLessThanOrEqual(r.trapsPlaced);
    });
  }

  it('ohne Item-Einsatz gibt es keine Sabotage', () => {
    const r = simulateGame({
      board: TEST_BOARD,
      rounds: 5,
      seed: 3,
      players: 3,
      policy: { itemUseChance: 0 },
    });
    expect(r.coinSteals + r.trapsPlaced + r.itemsUsed['double-dice']).toBe(0);
  });

  it('Reaktionen nach der Frist zählen als verspätet, das Fenster endet mit timeout', () => {
    const r = simulateGame({
      board: TEST_BOARD,
      rounds: 8,
      seed: 5,
      players: 4,
      policy: { itemUseChance: 1, reactionChance: 1, reactionDelayMs: [5000, 6000] },
    });
    expect(r.coinSteals).toBeGreaterThan(0);
    expect(r.lateReactions).toBe(r.coinSteals);
    expect(r.reactions.timeout).toBe(r.coinSteals);
  });

  it('schnelle Reaktionen landen im Fenster (shield/brace statt timeout)', () => {
    const r = simulateGame({
      board: TEST_BOARD,
      rounds: 8,
      seed: 5,
      players: 4,
      policy: { itemUseChance: 1, reactionChance: 1, reactionDelayMs: [100, 200] },
    });
    expect(r.coinSteals).toBeGreaterThan(0);
    expect(r.reactions.timeout).toBe(0);
    expect(r.lateReactions).toBe(0);
  });

  it('Entscheidungszeit verlängert die Partie', () => {
    const fast = simulateGame({
      board: TEST_BOARD,
      rounds: 4,
      seed: 9,
      players: 2,
      policy: { decisionMs: [0, 0], itemUseChance: 0 },
    });
    const slow = simulateGame({
      board: TEST_BOARD,
      rounds: 4,
      seed: 9,
      players: 2,
      policy: { decisionMs: [3000, 3000], itemUseChance: 0 },
    });
    expect(slow.durationMs).toBeGreaterThan(fast.durationMs);
  });
});

describe('summarizeSimulations', () => {
  it('mittelt Kennzahlen über mehrere Partien', () => {
    const results = [1, 2, 3, 4].map((seed) =>
      simulateGame({ board: TEST_BOARD, rounds: 5, seed, players: 3 }),
    );
    const summary = summarizeSimulations(results);
    expect(summary.games).toBe(4);
    expect(summary.avgDurationMs).toBeCloseTo(results.reduce((s, r) => s + r.durationMs, 0) / 4, 6);
    const shares = summary.reactionShares;
    const total = shares.shield + shares.brace + shares.timeout;
    expect(total === 0 || Math.abs(total - 1) < 1e-9).toBe(true);
    expect(summarizeSimulations([]).games).toBe(0);
  });
});
