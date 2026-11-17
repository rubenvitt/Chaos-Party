/**
 * Regel-Stellschrauben aus CHAOS-51 (EXP-018): Ziel einer wandernden Trophäe
 * (`trophy.placement`), Item für den Minispiel-Sieg (`items.minigameWinItems`) und Schild gegen
 * Fallen (`items.shieldBlocksTrap`). Alle fehlen in den Standardregeln = bisheriges Verhalten.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, MinigameSpec, Slot, TrophyPlacement } from '../types.ts';
import { DEFAULT_RULES, withRules, ZERO_PACING } from './defaults.ts';
import { createGame, step } from './machine.ts';
import { loopBoard } from './testBoards.ts';
import {
  activeSlot,
  chain,
  choose,
  NAMES,
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
} from './testUtils.ts';

describe('Standardregeln bleiben unverändert', () => {
  it('die neuen Stellschrauben fehlen in DEFAULT_RULES', () => {
    expect(DEFAULT_RULES.trophy.placement).toBeUndefined();
    expect(DEFAULT_RULES.items.minigameWinItems).toBeUndefined();
    expect(DEFAULT_RULES.items.minigameLastItems).toBe(1);
    expect(DEFAULT_RULES.items.shieldBlocksTrap).toBeUndefined();
  });
});

describe('Ziel einer wandernden Trophäe (trophy.placement)', () => {
  // l0 Start, Trophäen-Kandidaten l1, l4, l8, l10 (Rundkurs mit 11 Feldern).
  const BOARD = loopBoard([
    'trophy',
    'coins-plus',
    'coins-plus',
    'trophy',
    'coins-plus',
    'coins-plus',
    'coins-plus',
    'trophy',
    'coins-plus',
    'trophy',
  ]);

  /** Die aktive Person kauft die Trophäe auf l1; die andere steht auf `otherAt`. */
  function wanderAfterBuy(placement: TrophyPlacement | undefined, seed: number, otherAt: string) {
    const s = startToRoll(
      newGame({
        board: BOARD,
        seed,
        rules: { diceFaces: [1], trophy: { activeCount: 1, ...(placement ? { placement } : {}) } },
      }),
    ).state;
    const slot = activeSlot(s);
    const other = (slot === 1 ? 2 : 1) as Slot;
    const prepared = patchState(s, {
      trophySpaces: ['l1'],
      players: s.players.map((p) =>
        p.slot === other
          ? { ...p, spaceId: otherAt }
          : p.slot === slot
            ? { ...p, coins: 30, spaceId: 'l0' }
            : p,
      ),
    });
    const offer = chain(prepared, (x) => choose(x, 'roll'), settle);
    expect(offer.state.prompt?.kind).toBe('trophy');
    const bought = choose(offer.state, 'buy');
    const [moved] = ofType(bought.events, 'trophy-moved');
    return moved?.to;
  }

  const targets = (placement: TrophyPlacement | undefined, otherAt: string): Set<string> =>
    new Set(Array.from({ length: 40 }, (_, i) => wanderAfterBuy(placement, i + 1, otherAt) ?? '?'));

  it('random (fehlt): alle freien Kandidaten kommen vor', () => {
    expect(targets(undefined, 'l5')).toEqual(new Set(['l4', 'l8', 'l10']));
  });

  it('ahead: nur die nähere Hälfte, gemessen von der nächsten Figur vorwärts', () => {
    // Von l1 (Käuferin): l4 = 3, l8 = 7, l10 = 9; von l5: l8 = 3, l10 = 5, l4 = 10.
    // Minimum: l4 = 3, l8 = 3, l10 = 5 → Hälfte (2) = l4, l8.
    expect(targets('ahead', 'l5')).toEqual(new Set(['l4', 'l8']));
  });

  it('ahead-of-last: gemessen nur von der Letztplatzierten', () => {
    // Nach dem Kauf ist die andere Person (ohne Trophäe) allein Letzte: von l5 aus l8 = 3,
    // l10 = 5, l4 = 10 → l8, l10.
    expect(targets('ahead-of-last', 'l5')).toEqual(new Set(['l8', 'l10']));
  });

  it('wer auf dem Kandidaten steht, ist am weitesten davon entfernt (erst nach einer Runde)', () => {
    // Die andere steht auf l4: von ihr aus ist l4 eine ganze Runde (11) entfernt.
    expect(targets('ahead-of-last', 'l4')).toEqual(new Set(['l8', 'l10']));
  });
});

describe('Schild gegen Falle (items.shieldBlocksTrap)', () => {
  const PLUS = loopBoard(['coins-plus', 'coins-plus', 'coins-plus']);

  function trapped(shieldBlocksTrap: boolean | undefined, items: GameState['players'][0]['items']) {
    const s = startToRoll(
      newGame({
        board: PLUS,
        rules: {
          diceFaces: [1],
          items: shieldBlocksTrap === undefined ? {} : { shieldBlocksTrap },
        },
      }),
    ).state;
    const slot = activeSlot(s);
    const other = (slot === 1 ? 2 : 1) as Slot;
    const prepared = patchState(patchPlayer(s, slot, { coins: 10, items: [...items] }), {
      traps: [{ spaceId: 'l1', owner: other }],
    });
    return { r: chain(prepared, (x) => choose(x, 'roll'), settle), slot, other };
  }

  it('an: Schild wird verbraucht, keine Münzen weg, Falle ist weg', () => {
    const { r, slot, other } = trapped(true, ['double-dice', 'shield']);
    expect(ofType(r.events, 'trap-triggered')).toEqual([
      { type: 'trap-triggered', slot, owner: other, spaceId: 'l1', amount: 0 },
    ]);
    expect(ofType(r.events, 'item-used')).toEqual([{ type: 'item-used', slot, item: 'shield' }]);
    expect(playerAt(r.state, slot).items).toEqual(['double-dice']);
    // Nur das Plus-Feld (+3), kein Verlust an die Besitzerin.
    expect(playerAt(r.state, slot).coins).toBe(13);
    expect(r.state.traps).toEqual([]);
  });

  it('an, aber ohne Schild: normale Falle', () => {
    const { r, slot } = trapped(true, ['double-dice']);
    expect(ofType(r.events, 'trap-triggered')[0]?.amount).toBe(TEST_RULES.items.trapAmount);
    expect(playerAt(r.state, slot).items).toEqual(['double-dice']);
  });

  it('aus (fehlt): der Schild hilft nicht gegen Fallen', () => {
    const { r, slot } = trapped(undefined, ['shield']);
    expect(ofType(r.events, 'trap-triggered')[0]?.amount).toBe(TEST_RULES.items.trapAmount);
    expect(ofType(r.events, 'item-used')).toEqual([]);
    expect(playerAt(r.state, slot).items).toEqual(['shield']);
  });
});

describe('Item für Minispiel-Sieg und letzten Platz (items.minigameWinItems/LastItems)', () => {
  const SPECS: readonly MinigameSpec[] = [
    { id: 'flink-flitzer', playMs: 20_000, scoring: 'higher' },
  ];

  function play(
    minigameWinItems: number | undefined,
    startItems: number,
    minigameLastItems?: number,
    placements = [
      // Geteilter Sieg von 1 und 3.
      { slot: 1 as const, place: 1, score: 9 },
      { slot: 3 as const, place: 1, score: 9 },
      { slot: 2 as const, place: 3, score: 1 },
    ],
  ) {
    const rules = withRules(
      {
        diceFaces: [1],
        items: {
          startItems,
          capacity: 3,
          ...(minigameWinItems === undefined ? {} : { minigameWinItems }),
          ...(minigameLastItems === undefined ? {} : { minigameLastItems }),
        },
        pacing: ZERO_PACING,
      },
      TEST_RULES,
    );
    let state = start(
      createGame({
        board: loopBoard(['start', 'start', 'start', 'start']),
        rules,
        rounds: 1,
        seed: 5,
        players: ([1, 2, 3] as const).map((slot) => ({ slot, name: NAMES[slot - 1] ?? 'X' })),
        minigames: SPECS,
      }),
      0,
    ).state;
    for (let i = 0; i < 500 && state.phase !== 'minigame-play'; i++) {
      state = state.prompt
        ? choose(state, 'roll').state
        : tick(state, state.resumeAt ?? state.now).state;
    }
    const minigame = state.minigame;
    if (!minigame) throw new Error('kein Minispiel');
    const r = step(state, {
      type: 'minigame-result',
      minigameId: minigame.id,
      round: minigame.round,
      placements,
      at: state.now + 500,
    });
    if (!r.ok) throw new Error(r.error.message);
    return r;
  }

  it('fehlt: kein Item nach dem Minispiel', () => {
    expect(ofType(play(undefined, 0).events, 'item-gained')).toEqual([]);
  });

  it('1: jede Siegerin (auch geteilt) bekommt ein Item, die anderen nichts', () => {
    const r = play(1, 0);
    expect(ofType(r.events, 'item-gained').map((e) => e.slot)).toEqual([1, 3]);
    expect(playerAt(r.state, 1).items).toHaveLength(1);
    expect(playerAt(r.state, 2).items).toHaveLength(0);
    // Erst das Ergebnis, dann die Items (Host zeigt die Ergebniskarte zuerst).
    const types = r.events.map((e) => e.type);
    expect(types.indexOf('minigame-results')).toBeLessThan(types.indexOf('item-gained'));
  });

  it('respektiert die Kapazität', () => {
    const r = play(2, 3);
    expect(ofType(r.events, 'item-gained')).toEqual([]);
    expect(playerAt(r.state, 1).items).toHaveLength(3);
  });

  it('Trostpreis: der letzte Platz bekommt ein Item, zusammen mit dem Sieg-Item', () => {
    const r = play(1, 0, 1);
    expect(ofType(r.events, 'item-gained').map((e) => e.slot)).toEqual([1, 3, 2]);
    const last = play(undefined, 0, 2);
    expect(ofType(last.events, 'item-gained').map((e) => e.slot)).toEqual([2, 2]);
    // Im Stand (für Host-Neuladen und Controller): Items an der Belohnung des Slots.
    const rewards = last.state.minigame?.rewards ?? [];
    expect(rewards.find((reward) => reward.slot === 2)?.items).toEqual(
      ofType(last.events, 'item-gained').map((e) => e.item),
    );
    expect(rewards.find((reward) => reward.slot === 1)?.items).toBeUndefined();
  });

  it('Trostpreis: geteilter letzter Platz bekommt beides, alle gleichauf bekommt niemand', () => {
    const shared = play(undefined, 0, 1, [
      { slot: 2, place: 1, score: 9 },
      { slot: 1, place: 2, score: 1 },
      { slot: 3, place: 2, score: 1 },
    ]);
    expect(ofType(shared.events, 'item-gained').map((e) => e.slot)).toEqual([1, 3]);
    const tie = play(undefined, 0, 1, [
      { slot: 1, place: 1, score: 5 },
      { slot: 2, place: 1, score: 5 },
      { slot: 3, place: 1, score: 5 },
    ]);
    expect(ofType(tie.events, 'item-gained')).toEqual([]);
  });

  it('wirft bei negativer oder gebrochener Zahl', () => {
    for (const items of [
      { minigameWinItems: -1 },
      { minigameWinItems: 0.5 },
      { minigameLastItems: -1 },
    ]) {
      expect(() =>
        createGame({
          board: loopBoard(['start']),
          rules: withRules({ items }, TEST_RULES),
          rounds: 1,
          seed: 1,
          players: [{ slot: 1, name: 'A' }],
        }),
      ).toThrow(RangeError);
    }
  });
});
