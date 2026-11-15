import { describe, expect, it } from 'vitest';
import type { BoardEventKind, GameState, Slot } from '../types.ts';
import { BOARD_EVENT_KINDS, COIN_RAIN_AMOUNT, LUCKY_FIND_AMOUNT } from './spaces.ts';
import { loopBoard } from './testBoards.ts';
import {
  activeSlot,
  chain,
  choose,
  newGame,
  ofType,
  patchPlayer,
  playerAt,
  settle,
  startToRoll,
  type Run,
} from './testUtils.ts';

describe('Münzfelder und neutrale Felder', () => {
  function landOn(
    kind: 'coins-plus' | 'coins-minus' | 'start' | 'trophy',
    coins = 10,
  ): Run & {
    slot: Slot;
  } {
    const s0 = startToRoll(newGame({ board: loopBoard([kind]), rules: { diceFaces: [1] } })).state;
    const slot = activeSlot(s0);
    const s = patchPlayer(s0, slot, { coins });
    return { ...chain(s, (x) => choose(x, 'roll'), settle), slot };
  }

  it('coins-plus gibt coinsPlus', () => {
    const { events, slot } = landOn('coins-plus');
    expect(ofType(events, 'coins-changed')).toEqual([
      { type: 'coins-changed', slot, delta: 3, balance: 13, reason: 'space' },
    ]);
  });

  it('coins-minus nimmt coinsMinus, aber nie unter 0 (tatsächliches Delta)', () => {
    expect(ofType(landOn('coins-minus', 10).events, 'coins-changed')[0]).toMatchObject({
      delta: -3,
      balance: 7,
    });
    const low = landOn('coins-minus', 2);
    expect(ofType(low.events, 'coins-changed')[0]).toMatchObject({ delta: -2, balance: 0 });
    const broke = landOn('coins-minus', 0);
    expect(ofType(broke.events, 'coins-changed')).toEqual([]);
    expect(playerAt(broke.state, broke.slot).coins).toBe(0);
  });

  it('Start und Trophäenfeld (ohne Geld für den Kauf) bewirken nichts', () => {
    for (const kind of ['start', 'trophy'] as const) {
      const { events } = landOn(kind);
      expect(ofType(events, 'coins-changed')).toEqual([]);
      expect(events.map((e) => e.type)).toEqual([
        'dice-rolled',
        'moved',
        'turn-ended',
        'turn-started',
      ]);
    }
  });
});

describe('Brett-Ereignisse', () => {
  // l1 = Ereignis, dahinter Plus-Felder (für den Windstoß), zwei Trophäenfelder.
  const board = loopBoard(['event', 'coins-plus', 'coins-plus', 'trophy', 'trophy']);

  interface Found {
    readonly before: GameState;
    readonly run: Run;
    readonly slot: Slot;
  }

  /** Für jedes Ereignis den ersten Seed finden, bei dem es beim ersten Zug auftritt. */
  function findEvents(): Map<BoardEventKind, Found> {
    const found = new Map<BoardEventKind, Found>();
    for (let seed = 1; seed <= 300 && found.size < BOARD_EVENT_KINDS.length; seed++) {
      const before = startToRoll(newGame({ board, seed, rules: { diceFaces: [1] } })).state;
      const r = chain(before, (x) => choose(x, 'roll'), settle);
      const [event] = ofType(r.events, 'board-event');
      if (event && !found.has(event.event)) {
        found.set(event.event, { before, run: r, slot: activeSlot(before) });
      }
    }
    return found;
  }

  const found = findEvents();

  function get(kind: BoardEventKind): Found {
    const f = found.get(kind);
    if (!f) throw new Error(`Ereignis ${kind} nicht gefunden`);
    return f;
  }

  it('alle Ereignisarten kommen vor (seeded Auswahl)', () => {
    expect([...found.keys()].sort()).toEqual([...BOARD_EVENT_KINDS].sort());
  });

  it('Münzregen: alle Spieler bekommen Münzen', () => {
    const { run, before } = get('coin-rain');
    const changes = ofType(run.events, 'coins-changed');
    expect(changes.map((e) => [e.slot, e.delta, e.reason])).toEqual(
      before.players.map((p) => [p.slot, COIN_RAIN_AMOUNT, 'event']),
    );
  });

  it('Glücksfund: nur der Spieler am Zug bekommt Münzen', () => {
    const { run, slot } = get('lucky-find');
    expect(ofType(run.events, 'coins-changed')).toEqual([
      { type: 'coins-changed', slot, delta: LUCKY_FIND_AMOUNT, balance: 15, reason: 'event' },
    ]);
  });

  it('Windstoß: 1–2 Felder vorwärts als moved, ohne erneute Feldwirkung', () => {
    const { run, slot } = get('gust');
    const moves = ofType(run.events, 'moved');
    expect(moves).toHaveLength(2);
    const gust = moves[1];
    expect(gust?.slot).toBe(slot);
    expect([['l2'], ['l2', 'l3']]).toContainEqual(gust?.path);
    expect(playerAt(run.state, slot).spaceId).toBe(gust?.path[gust.path.length - 1]);
    expect(ofType(run.events, 'coins-changed')).toEqual([]);
  });

  it('Tausch: Plätze mit einem anderen Spieler, je ein moved mit einem Feld', () => {
    const { run, slot } = get('swap');
    const other = (slot === 1 ? 2 : 1) as Slot;
    expect(ofType(run.events, 'moved').slice(1)).toEqual([
      { type: 'moved', slot, path: ['l0'] },
      { type: 'moved', slot: other, path: ['l1'] },
    ]);
    expect(playerAt(run.state, slot).spaceId).toBe('l0');
    expect(playerAt(run.state, other).spaceId).toBe('l1');
  });

  it('Trophäen-Wirbel: die aktive Trophäe springt auf das andere Trophäenfeld', () => {
    const { run, before } = get('trophy-shuffle');
    const from = before.trophySpaces[0];
    const to = from === 'l4' ? 'l5' : 'l4';
    expect(ofType(run.events, 'trophy-moved')).toEqual([{ type: 'trophy-moved', from, to }]);
    expect(run.state.trophySpaces).toEqual([to]);
  });

  it('Ereignis-Reihenfolge: board-event vor seiner Wirkung', () => {
    const { run } = get('lucky-find');
    const types = run.events.map((e) => e.type);
    expect(types.indexOf('board-event')).toBeLessThan(types.indexOf('coins-changed'));
  });
});
