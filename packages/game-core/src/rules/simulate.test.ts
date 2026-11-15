import { describe, expect, it } from 'vitest';
import type { BoardDefinition } from '../types.ts';
import { DEFAULT_RULES, withRules } from './defaults.ts';
import { createRng } from '../rng.ts';
import { sampleDelay, simulateGame, summarizeSimulations } from './simulate.ts';
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

describe('Kennzahlen für die Experimente (CHAOS-24)', () => {
  it('Sabotage-Verluste: je Klau/Falle ein Eintrag mit Bestand davor', () => {
    const r = simulateGame({
      board: TEST_BOARD,
      rounds: 8,
      seed: 5,
      players: 4,
      policy: { itemUseChance: 1, reactionChance: 0 },
    });
    const steals = r.sabotageLosses.filter((l) => l.kind === 'steal');
    const traps = r.sabotageLosses.filter((l) => l.kind === 'trap');
    // Ohne Reaktion und ohne Schild: jeder Klau führt zu einem Eintrag.
    expect(steals).toHaveLength(r.coinSteals);
    expect(traps).toHaveLength(r.trapsTriggered);
    expect(steals.reduce((s, l) => s + l.amount, 0)).toBe(r.coinsStolen);
    expect(traps.reduce((s, l) => s + l.amount, 0)).toBe(r.coinsLostToTraps);
    for (const l of r.sabotageLosses) {
      expect(l.amount).toBeLessThanOrEqual(l.before);
      expect(l.amount).toBeGreaterThanOrEqual(0);
    }
  });

  it('Reaktionsfenster: Wartezeit je Fenster, höchstens die Fensterdauer', () => {
    const r = simulateGame({
      board: TEST_BOARD,
      rounds: 8,
      seed: 5,
      players: 4,
      policy: { itemUseChance: 1, reactionChance: 1, reactionDelayMs: [500, 5000] },
    });
    expect(r.reactionWaitsMs).toHaveLength(r.coinSteals);
    for (const wait of r.reactionWaitsMs) {
      expect(wait).toBeGreaterThanOrEqual(500);
      expect(wait).toBeLessThanOrEqual(DEFAULT_RULES.pacing.reactionWindowMs);
    }
  });

  it('trophyPathChance: Bots steuern an der Verzweigung die Trophäe an', () => {
    // Gabel f: oben x1 (Trophäe) oder unten y1 → y2 (keine Trophäe), beide treffen sich in m.
    const board: BoardDefinition = {
      id: 'gabel',
      name: 'Gabel',
      start: 'st',
      spaces: [
        { id: 'st', kind: 'start', position: { x: 0, z: 0 }, next: ['f'] },
        { id: 'f', kind: 'coins-plus', position: { x: 1, z: 0 }, next: ['x1', 'y1'] },
        { id: 'x1', kind: 'trophy', position: { x: 2, z: 1 }, next: ['m'] },
        { id: 'y1', kind: 'coins-plus', position: { x: 2, z: -1 }, next: ['y2'] },
        { id: 'y2', kind: 'coins-plus', position: { x: 3, z: -1 }, next: ['m'] },
        { id: 'm', kind: 'coins-plus', position: { x: 4, z: 0 }, next: ['st'] },
      ],
    };
    const rules = withRules({
      diceFaces: [1, 2],
      trophy: { mode: 'fixed', price: 1 },
      economy: { startCoins: 100 },
    });
    const bought = (trophyPathChance: number): number =>
      Array.from({ length: 20 }, (_, i) =>
        simulateGame({
          board,
          rules,
          rounds: 6,
          seed: i + 1,
          players: 2,
          policy: { trophyPathChance, itemUseChance: 0 },
        }),
      ).reduce((sum, r) => sum + r.trophiesBought, 0);
    expect(bought(1)).toBeGreaterThan(bought(0) * 1.3);
  });

  it('sampleDelay: Bereich gleichverteilt, log-normal mit Untergrenze, deterministisch', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const uniform = sampleDelay(rng, [100, 200]);
      expect(uniform).toBeGreaterThanOrEqual(100);
      expect(uniform).toBeLessThanOrEqual(200);
    }
    const model = { medianMs: 1500, sigma: 0.4, minMs: 600 };
    const a = Array.from(
      { length: 2000 },
      (
        (r) => () =>
          sampleDelay(r, model)
      )(createRng(7)),
    );
    const b = Array.from(
      { length: 2000 },
      (
        (r) => () =>
          sampleDelay(r, model)
      )(createRng(7)),
    );
    expect(a).toEqual(b);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(600);
    const sorted = [...a].sort((x, y) => x - y);
    const median = sorted[1000] ?? 0;
    expect(median).toBeGreaterThan(1350);
    expect(median).toBeLessThan(1650);
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
