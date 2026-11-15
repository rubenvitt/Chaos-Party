import { describe, expect, it } from 'vitest';
import type { GameState, ItemKind, Slot } from '../types.ts';
import { loopBoard } from './testBoards.ts';
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
  startToRoll,
  type NewGameOptions,
} from './testUtils.ts';

const PLUS_BOARD = loopBoard(['coins-plus', 'coins-plus', 'coins-plus', 'coins-plus']);

function atRoll(
  options: NewGameOptions,
  items: ItemKind[] = [],
  statePatch: Partial<GameState> = {},
): GameState {
  const s = startToRoll(newGame({ board: PLUS_BOARD, ...options })).state;
  return patchState(patchPlayer(s, activeSlot(s), { items }), statePatch);
}

/**
 * Würfel-Prompt neu aufbauen (er wird beim Öffnen berechnet), damit er präparierte Items
 * anbietet: zurück auf einen sofort fälligen Zugbeginn.
 */
function reprompt(state: GameState): GameState {
  return settle(patchState(state, { phase: 'turn-start', prompt: null, resumeAt: state.now }))
    .state;
}

function rollPromptWith(items: ItemKind[], options: NewGameOptions = {}): GameState {
  return reprompt(atRoll(options, items));
}

const ids = (state: GameState): string[] => state.prompt?.options.map((o) => o.id) ?? [];

describe('Item-Feld und Kapazität', () => {
  const itemBoard = loopBoard(['item', 'item', 'item']);

  it('zieht gewichtet ein Item (nur Gewicht > 0)', () => {
    const s = startToRoll(
      newGame({
        board: itemBoard,
        rules: {
          diceFaces: [1],
          items: { weights: { 'double-dice': 0, 'coin-steal': 0, trap: 1, shield: 0 } },
        },
      }),
    ).state;
    const slot = activeSlot(s);
    const r = chain(s, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'item-gained')).toEqual([{ type: 'item-gained', slot, item: 'trap' }]);
    expect(playerAt(r.state, slot).items).toEqual(['trap']);
  });

  it('verteilt über viele Seeds alle Items mit positivem Gewicht', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const s = startToRoll(newGame({ board: itemBoard, seed, rules: { diceFaces: [1] } })).state;
      const r = chain(s, (x) => choose(x, 'roll'), settle);
      for (const e of ofType(r.events, 'item-gained')) seen.add(e.item);
    }
    expect([...seen].sort()).toEqual(['coin-steal', 'double-dice', 'shield', 'trap']);
  });

  it('bei voller Kapazität gibt es kein Item', () => {
    const s = atRoll({ board: itemBoard, rules: { diceFaces: [1], items: { capacity: 2 } } }, [
      'shield',
      'shield',
    ]);
    const r = chain(s, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'item-gained')).toEqual([]);
    expect(playerAt(r.state, activeSlot(s)).items).toEqual(['shield', 'shield']);
  });

  it('ohne positive Gewichte gibt es kein Item', () => {
    const s = startToRoll(
      newGame({
        board: itemBoard,
        rules: {
          diceFaces: [1],
          items: { weights: { 'double-dice': 0, 'coin-steal': 0, trap: 0, shield: 0 } },
        },
      }),
    ).state;
    const r = chain(s, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'item-gained')).toEqual([]);
  });
});

describe('Würfel-Prompt mit Items', () => {
  it('bietet je einsetzbarem Item eine Option, Schild nie', () => {
    const s = rollPromptWith(['shield', 'trap', 'double-dice', 'coin-steal', 'trap']);
    expect(ids(s)).toEqual(['roll', 'item:double-dice', 'item:coin-steal', 'item:trap']);
    expect(s.prompt?.options.find((o) => o.id === 'item:coin-steal')).toMatchObject({
      label: 'Münzklau',
      detail: 'Bis zu 6 Münzen klauen',
    });
  });

  it('Doppelwürfel: Item weg, neuer Prompt nur mit Würfeln, dann zwei Würfel', () => {
    const s = rollPromptWith(['double-dice', 'trap']);
    const slot = activeSlot(s);
    const used = choose(s, 'item:double-dice');
    expect(used.events).toEqual([{ type: 'item-used', slot, item: 'double-dice' }]);
    expect(used.state.prompt?.id).toBe((s.prompt?.id ?? 0) + 1);
    expect(used.state.prompt?.title).toBe('Zwei Würfel bereit!');
    expect(ids(used.state)).toEqual(['roll']);
    expect(playerAt(used.state, slot).items).toEqual(['trap']);
    const [rolled] = ofType(choose(used.state, 'roll').events, 'dice-rolled');
    expect(rolled?.faces).toHaveLength(2);
    expect(rolled?.total).toBe((rolled?.faces[0] ?? 0) + (rolled?.faces[1] ?? 0));
  });

  it('Falle: liegt auf dem eigenen Feld, höchstens ein Item pro Zug', () => {
    const s = rollPromptWith(['trap', 'double-dice']);
    const slot = activeSlot(s);
    const here = playerAt(s, slot).spaceId;
    const placed = choose(s, 'item:trap');
    expect(placed.events).toEqual([
      { type: 'item-used', slot, item: 'trap' },
      { type: 'trap-placed', slot, spaceId: here },
    ]);
    expect(placed.state.traps).toEqual([{ spaceId: here, owner: slot }]);
    expect(placed.state.phase).toBe('roll');
    expect(ids(placed.state)).toEqual(['roll']);
  });

  it('Falle wird nicht angeboten, wenn auf dem Feld schon eine liegt', () => {
    const base = atRoll({}, ['trap']);
    const here = playerAt(base, activeSlot(base)).spaceId;
    const other = (activeSlot(base) === 1 ? 2 : 1) as Slot;
    const s = reprompt(patchState(base, { traps: [{ spaceId: here, owner: other }] }));
    expect(ids(s)).toEqual(['roll']);
  });

  it('Münzklau: Zielwahl mit Namen/Slots, „Zurück“ behält das Item', () => {
    const s = rollPromptWith(['coin-steal'], { players: 3 });
    const slot = activeSlot(s);
    const target = choose(s, 'item:coin-steal');
    expect(target.events).toEqual([]);
    expect(target.state.phase).toBe('choose-target');
    const others = s.players.filter((p) => p.slot !== slot);
    expect(target.state.prompt).toMatchObject({
      kind: 'target',
      slot,
      defaultOption: 'cancel',
      deadline: null,
      options: [
        ...others.map((p) => ({
          id: `slot:${String(p.slot)}`,
          label: p.name,
          slot: p.slot,
          detail: '10 Münzen',
        })),
        { id: 'cancel', label: 'Zurück' },
      ],
    });
    const back = choose(target.state, 'cancel');
    expect(back.state.phase).toBe('roll');
    expect(ids(back.state)).toContain('item:coin-steal');
    expect(playerAt(back.state, slot).items).toEqual(['coin-steal']);
  });

  it('Münzklau gegen sich selbst ist keine gültige Option', () => {
    const s = rollPromptWith(['coin-steal']);
    const slot = activeSlot(s);
    const target = choose(s, 'item:coin-steal').state;
    expect(ids(target)).not.toContain(`slot:${String(slot)}`);
  });
});

describe('Fallen auslösen', () => {
  function landOnTrap(owner: 'fremd' | 'eigen', coins: number): ReturnType<typeof chain> {
    const s = atRoll({ rules: { diceFaces: [1] } });
    const slot = activeSlot(s);
    const other = (slot === 1 ? 2 : 1) as Slot;
    const prepared = patchState(patchPlayer(s, slot, { coins }), {
      traps: [{ spaceId: 'l1', owner: owner === 'fremd' ? other : slot }],
    });
    return chain(prepared, (x) => choose(x, 'roll'), settle);
  }

  it('fremde Falle: zahlt trapAmount an die Besitzerin, Falle verschwindet, dann Feldwirkung', () => {
    const r = landOnTrap('fremd', 10);
    const trap = ofType(r.events, 'trap-triggered')[0];
    expect(trap).toMatchObject({ spaceId: 'l1', amount: 5 });
    const changes = ofType(r.events, 'coins-changed');
    expect(changes.slice(0, 2).map((e) => [e.slot, e.delta, e.reason])).toEqual([
      [trap?.slot, -5, 'trap'],
      [trap?.owner, 5, 'trap'],
    ]);
    expect(changes[2]).toMatchObject({ slot: trap?.slot, delta: 3, reason: 'space' });
    expect(r.state.traps).toEqual([]);
  });

  it('fremde Falle nimmt höchstens den Bestand (nie negativ)', () => {
    const r = landOnTrap('fremd', 2);
    expect(ofType(r.events, 'trap-triggered')[0]?.amount).toBe(2);
    expect(ofType(r.events, 'coins-changed')[0]).toMatchObject({ delta: -2, balance: 0 });
  });

  it('eigene Falle löst nicht aus und bleibt liegen', () => {
    const r = landOnTrap('eigen', 10);
    expect(ofType(r.events, 'trap-triggered')).toEqual([]);
    expect(r.state.traps).toHaveLength(1);
  });
});
