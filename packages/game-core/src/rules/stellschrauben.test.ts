/**
 * Regel-Stellschrauben aus CHAOS-24 (EXP-002/EXP-003): mehrere wandernde Trophäen
 * (`trophy.activeCount`), Start-Items (`items.startItems`) und Fallen beim Darüberlaufen
 * (`items.trapTrigger: 'pass'`). Dazu aus CHAOS-67 (EXP-018) die wachsende Sabotage
 * (`items.sabotageGrowthRounds`).
 */
import { describe, expect, it } from 'vitest';
import type { BoardEventKind, GameState, Slot } from '../types.ts';
import { withRules } from './defaults.ts';
import { sabotageAmount } from './economy.ts';
import { createGame } from './machine.ts';
import { loopBoard, TEST_BOARD } from './testBoards.ts';
import {
  activeSlot,
  chain,
  choose,
  newGame,
  ofType,
  patchPlayer,
  patchState,
  playerAt,
  settle,
  start,
  startToRoll,
  TEST_RULES,
  tick,
  type NewGameOptions,
} from './testUtils.ts';

describe('mehrere aktive Trophäen (trophy.activeCount)', () => {
  it('aktiviert so viele verschiedene Felder wie verlangt (seeded), höchstens alle', () => {
    const two = newGame({ seed: 3, rules: { trophy: { activeCount: 2 } } });
    expect(two.trophySpaces).toHaveLength(2);
    expect(new Set(two.trophySpaces).size).toBe(2);
    for (const id of two.trophySpaces) expect(['a1', 'b3', 'm2']).toContain(id);
    expect(newGame({ seed: 3, rules: { trophy: { activeCount: 2 } } }).trophySpaces).toEqual(
      two.trophySpaces,
    );
    const all = newGame({ rules: { trophy: { activeCount: 9 } } });
    expect([...all.trophySpaces].sort()).toEqual(['a1', 'b3', 'm2']);
    // Bei `fixed` zählt activeCount nicht.
    const fixed = newGame({ rules: { trophy: { mode: 'fixed', activeCount: 1 } } });
    expect(fixed.trophySpaces).toEqual(['a1', 'b3', 'm2']);
  });

  it('wirft bei activeCount < 1 oder nicht ganzzahlig', () => {
    for (const activeCount of [0, -1, 1.5]) {
      expect(() =>
        createGame({
          board: TEST_BOARD,
          rules: withRules({ trophy: { activeCount } }, TEST_RULES),
          rounds: 1,
          seed: 1,
          players: [{ slot: 1, name: 'A' }],
        }),
      ).toThrow(RangeError);
    }
  });

  it('nach dem Kauf wandert genau die gekaufte Trophäe auf ein freies Feld', () => {
    const s0 = startToRoll(
      newGame({ rules: { diceFaces: [1], trophy: { activeCount: 2 } } }),
    ).state;
    const slot = activeSlot(s0);
    const s = patchState(patchPlayer(s0, slot, { spaceId: 's05', coins: 30 }), {
      trophySpaces: ['a1', 'b3'],
    });
    const atFork = chain(s, (x) => choose(x, 'roll'), settle).state;
    expect(atFork.prompt?.kind).toBe('path');
    const offer = chain(atFork, (x) => choose(x, 'a1'), settle).state;
    expect(offer.prompt?.kind).toBe('trophy');
    const r = chain(offer, (x) => choose(x, 'buy'), settle);
    expect(ofType(r.events, 'trophy-moved')).toEqual([
      { type: 'trophy-moved', from: 'a1', to: 'm2' },
    ]);
    // b3 bleibt aktiv und an seinem Platz in der Liste.
    expect(r.state.trophySpaces).toEqual(['m2', 'b3']);
    expect(playerAt(r.state, slot).trophies).toBe(1);
  });

  it('Trophäen-Wirbel bewegt eine der aktiven Trophäen auf ein freies Feld', () => {
    const board = loopBoard(['event', 'trophy', 'trophy', 'trophy']);
    let seen: { from: string; to: string } | undefined;
    for (let seed = 1; seed <= 300 && !seen; seed++) {
      const before = startToRoll(
        newGame({ board, seed, rules: { diceFaces: [1], trophy: { activeCount: 2 } } }),
      ).state;
      const r = chain(before, (x) => choose(x, 'roll'), settle);
      const [event] = ofType(r.events, 'board-event');
      if (event?.event !== ('trophy-shuffle' satisfies BoardEventKind)) continue;
      const [moved] = ofType(r.events, 'trophy-moved');
      expect(moved).toBeDefined();
      if (!moved) return;
      expect(before.trophySpaces).toContain(moved.from);
      expect(before.trophySpaces).not.toContain(moved.to);
      expect(r.state.trophySpaces).toHaveLength(2);
      expect(r.state.trophySpaces).toContain(moved.to);
      expect(r.state.trophySpaces).not.toContain(moved.from);
      seen = moved;
    }
    expect(seen).toBeDefined();
  });
});

describe('Start-Items (items.startItems)', () => {
  const onlyShields = { 'double-dice': 0, 'coin-steal': 0, trap: 0, shield: 1 };

  it('jeder bekommt beim Start Items in Zugreihenfolge, mit Ereignissen', () => {
    const game = newGame({
      players: 3,
      rules: { items: { startItems: 2, weights: onlyShields } },
    });
    const r = start(game, 0);
    const order = r.state.turnOrder;
    const gained = ofType(r.events, 'item-gained');
    expect(gained.map((e) => e.slot)).toEqual([...order, ...order]);
    expect(gained.every((e) => e.item === 'shield')).toBe(true);
    for (const p of r.state.players) expect(p.items).toEqual(['shield', 'shield']);
    // Erst game-started, dann die Items, dann die erste Runde.
    const types = r.events.map((e) => e.type);
    expect(types[0]).toBe('game-started');
    expect(types.indexOf('round-started')).toBeGreaterThan(types.lastIndexOf('item-gained'));
  });

  it('respektiert die Kapazität; 0 = keine Start-Items', () => {
    const full = start(
      newGame({ rules: { items: { startItems: 5, capacity: 3, weights: onlyShields } } }),
      0,
    );
    for (const p of full.state.players) expect(p.items).toHaveLength(3);
    const none = start(newGame({ rules: { items: { startItems: 0 } } }), 0);
    expect(ofType(none.events, 'item-gained')).toEqual([]);
  });

  it('wirft bei negativer oder nicht ganzzahliger Zahl', () => {
    for (const startItems of [-1, 0.5]) {
      expect(() =>
        createGame({
          board: TEST_BOARD,
          rules: withRules({ items: { startItems } }, TEST_RULES),
          rounds: 1,
          seed: 1,
          players: [{ slot: 1, name: 'A' }],
        }),
      ).toThrow(RangeError);
    }
  });
});

describe('Falle beim Darüberlaufen (items.trapTrigger)', () => {
  const PLUS_BOARD = loopBoard(['coins-plus', 'coins-plus', 'coins-plus', 'coins-plus']);

  function withTrap(
    options: NewGameOptions,
    trapOwner: 'fremd' | 'eigen',
    coins = 10,
    trapAt = 'l1',
  ): { state: GameState; slot: Slot; other: Slot } {
    const s = startToRoll(newGame({ board: PLUS_BOARD, ...options })).state;
    const slot = activeSlot(s);
    const other = (slot === 1 ? 2 : 1) as Slot;
    const state = patchState(patchPlayer(s, slot, { coins }), {
      traps: [{ spaceId: trapAt, owner: trapOwner === 'fremd' ? other : slot }],
    });
    return { state, slot, other };
  }

  const pass = (dice: number, pacing = {}): NewGameOptions => ({
    rules: { diceFaces: [dice], items: { trapTrigger: 'pass' }, pacing },
  });

  it('pass: hält auf der fremden Falle an, löst aus, zeigt es an und läuft weiter', () => {
    const { state, slot, other } = withTrap(pass(3, { stepMs: 100, spaceEventMs: 700 }), 'fremd');
    const t = state.now;
    const rolled = choose(state, 'roll', t);
    expect(ofType(rolled.events, 'moved')).toEqual([{ type: 'moved', slot, path: ['l1'] }]);
    expect(rolled.state.resumeAt).toBe(t + 100);

    const trapped = tick(rolled.state, t + 100);
    expect(ofType(trapped.events, 'trap-triggered')).toEqual([
      { type: 'trap-triggered', slot, owner: other, spaceId: 'l1', amount: 5 },
    ]);
    expect(ofType(trapped.events, 'coins-changed').map((e) => [e.slot, e.delta])).toEqual([
      [slot, -5],
      [other, 5],
    ]);
    expect(trapped.state.traps).toEqual([]);
    expect(trapped.state.phase).toBe('move');
    expect(trapped.state.resumeAt).toBe(t + 100 + 700);

    const walked = tick(trapped.state, t + 800);
    expect(ofType(walked.events, 'moved')).toEqual([{ type: 'moved', slot, path: ['l2', 'l3'] }]);
    const landed = settle(walked.state);
    expect(ofType(landed.events, 'coins-changed')[0]).toMatchObject({
      slot,
      delta: 3,
      reason: 'space',
    });
    expect(playerAt(landed.state, slot).spaceId).toBe('l3');
  });

  it('land (Standard der Testregeln): Darüberlaufen löst nicht aus', () => {
    const { state } = withTrap({ rules: { diceFaces: [3] } }, 'fremd');
    const r = chain(state, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'trap-triggered')).toEqual([]);
    expect(r.state.traps).toHaveLength(1);
  });

  it('pass: eigene Falle löst nicht aus, die Bewegung läuft in einem Stück', () => {
    const { state, slot } = withTrap(pass(3), 'eigen');
    const r = chain(state, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'trap-triggered')).toEqual([]);
    expect(ofType(r.events, 'moved')[0]).toEqual({ type: 'moved', slot, path: ['l1', 'l2', 'l3'] });
    expect(r.state.traps).toHaveLength(1);
  });

  it('pass: Landen auf der Falle löst genau einmal aus (in der Feldwirkung)', () => {
    const { state } = withTrap(pass(1), 'fremd');
    const r = chain(state, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'trap-triggered')).toHaveLength(1);
    expect(ofType(r.events, 'moved')).toHaveLength(1);
  });

  it('pass: Falle auf der aktiven Trophäe – erst die Falle, dann das Kaufangebot', () => {
    const board = loopBoard(['trophy', 'coins-plus', 'coins-plus']);
    const s = startToRoll(
      newGame({
        board,
        rules: { diceFaces: [3], items: { trapTrigger: 'pass' }, trophy: { mode: 'fixed' } },
      }),
    ).state;
    const slot = activeSlot(s);
    const other = (slot === 1 ? 2 : 1) as Slot;
    const prepared = patchState(patchPlayer(s, slot, { coins: 30 }), {
      traps: [{ spaceId: 'l1', owner: other }],
    });
    const offer = chain(prepared, (x) => choose(x, 'roll'), settle);
    expect(ofType(offer.events, 'trap-triggered')).toHaveLength(1);
    expect(offer.state.prompt?.kind).toBe('trophy');
    expect(playerAt(offer.state, slot).coins).toBe(25);
    const r = chain(offer.state, (x) => choose(x, 'skip'), settle);
    expect(ofType(r.events, 'moved')[0]?.path).toEqual(['l2', 'l3']);
  });

  it('pass: ohne Geld für die Trophäe läuft es nach der Falle einfach weiter', () => {
    const board = loopBoard(['trophy', 'coins-plus', 'coins-plus']);
    const s = startToRoll(
      newGame({
        board,
        rules: { diceFaces: [3], items: { trapTrigger: 'pass' }, trophy: { mode: 'fixed' } },
      }),
    ).state;
    const slot = activeSlot(s);
    const other = (slot === 1 ? 2 : 1) as Slot;
    // 22 Münzen: vor der Falle genug für die Trophäe (20), danach nicht mehr.
    const prepared = patchState(patchPlayer(s, slot, { coins: 22 }), {
      traps: [{ spaceId: 'l1', owner: other }],
    });
    const r = chain(prepared, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'trap-triggered')).toHaveLength(1);
    expect(r.events.some((e) => e.type === 'trophy-bought')).toBe(false);
    expect(playerAt(r.state, slot).spaceId).toBe('l3');
  });
});

describe('Wachsende Sabotage (items.sabotageGrowthRounds)', () => {
  const items = (sabotageGrowthRounds: number) =>
    withRules({ items: { stealAmount: 5, trapAmount: 4, sabotageGrowthRounds } }, TEST_RULES).items;

  it('0: feste Werte in jeder Runde', () => {
    for (const round of [0, 1, 6, 20]) {
      expect(sabotageAmount(items(0), 'coin-steal', round)).toBe(5);
      expect(sabotageAmount(items(0), 'trap', round)).toBe(4);
    }
  });

  it('5: Runde 1–5 Grundwert, 6–10 +1, 11–15 +2, 16–20 +3; vor Runde 1 Grundwert', () => {
    const steal = [0, 1, 5, 6, 10, 11, 15, 16, 20].map((r) =>
      sabotageAmount(items(5), 'coin-steal', r),
    );
    expect(steal).toEqual([5, 5, 5, 6, 6, 7, 7, 8, 8]);
    const trap = [1, 5, 6, 11, 16].map((r) => sabotageAmount(items(5), 'trap', r));
    expect(trap).toEqual([4, 4, 5, 6, 7]);
  });

  function stealInRound(round: number) {
    const s0 = startToRoll(
      newGame({
        board: loopBoard(['start', 'start']),
        rounds: 20,
        rules: { items: { stealAmount: 5, sabotageGrowthRounds: 5 } },
      }),
    ).state;
    const attacker = activeSlot(s0);
    const target = (attacker === 1 ? 2 : 1) as Slot;
    let s = patchPlayer(s0, attacker, { items: ['coin-steal'] });
    s = patchPlayer(s, target, { items: [], coins: 20 });
    s = settle(patchState(s, { round, phase: 'turn-start', prompt: null, resumeAt: s.now })).state;
    return { state: s, attacker, target };
  }

  it('Würfel-Prompt zeigt den Klau-Wert der aktuellen Runde', () => {
    const detail = (round: number) =>
      stealInRound(round).state.prompt?.options.find((o) => o.id === 'item:coin-steal')?.detail;
    expect(detail(5)).toBe('Bis zu 5 Münzen klauen');
    expect(detail(6)).toBe('Bis zu 6 Münzen klauen');
  });

  it('Klau in Runde 11 nimmt 7 Münzen (Fristablauf), Festhalten halbiert das', () => {
    const { state, attacker, target } = stealInRound(11);
    const opened = choose(choose(state, 'item:coin-steal').state, `slot:${String(target)}`).state;
    const deadline = opened.prompt?.deadline ?? 0;
    const full = tick(opened, deadline);
    expect(ofType(full.events, 'coins-stolen')).toEqual([
      { type: 'coins-stolen', from: target, to: attacker, amount: 7 },
    ]);
    const braced = choose(opened, 'brace');
    expect(ofType(braced.events, 'coins-stolen')[0]?.amount).toBe(3);
  });

  it('Falle zahlt den Wert der Runde, in der sie auslöst', () => {
    const board = loopBoard(['coins-plus', 'coins-plus', 'coins-plus']);
    const s = startToRoll(
      newGame({
        board,
        rounds: 20,
        rules: { diceFaces: [1], items: { trapAmount: 4, sabotageGrowthRounds: 5 } },
      }),
    ).state;
    const slot = activeSlot(s);
    const other = (slot === 1 ? 2 : 1) as Slot;
    const prepared = patchState(patchPlayer(s, slot, { coins: 20 }), {
      round: 16,
      traps: [{ spaceId: 'l1', owner: other }],
    });
    const r = chain(prepared, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'trap-triggered')).toEqual([
      { type: 'trap-triggered', slot, owner: other, spaceId: 'l1', amount: 7 },
    ]);
  });

  it('wirft bei negativer oder nicht ganzzahliger Zahl', () => {
    for (const sabotageGrowthRounds of [-1, 2.5]) {
      expect(() =>
        createGame({
          board: TEST_BOARD,
          rules: withRules({ items: { sabotageGrowthRounds } }, TEST_RULES),
          rounds: 1,
          seed: 1,
          players: [{ slot: 1, name: 'A' }],
        }),
      ).toThrow(RangeError);
    }
  });
});
