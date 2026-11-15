import { describe, expect, it } from 'vitest';
import type { GameState, ItemKind, Slot } from '../types.ts';
import { step } from './machine.ts';
import { stealLoss } from './reaction.ts';
import { loopBoard } from './testBoards.ts';
import {
  activeSlot,
  choose,
  newGame,
  ofType,
  patchPlayer,
  patchState,
  playerAt,
  run,
  settle,
  startToRoll,
  tick,
} from './testUtils.ts';

const WINDOW = 3000;

interface Setup {
  readonly state: GameState;
  readonly attacker: Slot;
  readonly target: Slot;
  readonly openedAt: number;
}

/** Angreifer klaut beim Ziel; liefert den Zustand mit offenem Reaktionsfenster. */
function openWindow(targetItems: ItemKind[] = [], targetCoins = 10, stealAmount = 6): Setup {
  const s0 = startToRoll(
    newGame({
      board: loopBoard(['start', 'start']),
      rules: { items: { stealAmount }, pacing: { reactionWindowMs: WINDOW } },
    }),
  ).state;
  const attacker = activeSlot(s0);
  const target = (attacker === 1 ? 2 : 1) as Slot;
  let s = patchPlayer(s0, attacker, { items: ['coin-steal'] });
  s = patchPlayer(s, target, { items: targetItems, coins: targetCoins });
  s = settle(patchState(s, { phase: 'turn-start', prompt: null, resumeAt: s.now })).state;
  s = choose(s, 'item:coin-steal').state;
  const openedAt = s.now + 100;
  return { state: choose(s, `slot:${String(target)}`, openedAt).state, attacker, target, openedAt };
}

describe('Reaktionsfenster öffnen', () => {
  it('Item weg, item-used mit Ziel, reaction-opened, Prompt an das Ziel mit Frist', () => {
    const s0 = startToRoll(newGame({ board: loopBoard(['start']) })).state;
    const attacker = activeSlot(s0);
    const target = (attacker === 1 ? 2 : 1) as Slot;
    let s = patchPlayer(s0, attacker, { items: ['coin-steal'] });
    s = settle(patchState(s, { phase: 'turn-start', prompt: null, resumeAt: s.now })).state;
    s = choose(s, 'item:coin-steal').state;
    const r = choose(s, `slot:${String(target)}`, s.now + 100);
    const promptId = r.state.prompt?.id ?? -1;
    expect(r.events).toEqual([
      { type: 'item-used', slot: attacker, item: 'coin-steal', target },
      {
        type: 'reaction-opened',
        promptId,
        slot: target,
        attacker,
        item: 'coin-steal',
        deadline: s.now + 100 + WINDOW,
      },
    ]);
    expect(r.state.phase).toBe('reaction-window');
    expect(r.state.activeSlot).toBe(attacker);
    expect(playerAt(r.state, attacker).items).toEqual([]);
    expect(r.state.prompt).toMatchObject({
      slot: target,
      kind: 'reaction',
      defaultOption: 'none',
      deadline: s.now + 100 + WINDOW,
      options: [{ id: 'brace', label: 'Festhalten!' }],
    });
  });

  it('bietet Schild nur an, wenn das Ziel eines hat', () => {
    const { state } = openWindow(['shield']);
    expect(state.prompt?.options.map((o) => o.id)).toEqual(['shield', 'brace']);
    expect(state.prompt?.options[0]?.label).toBe('Schild!');
  });
});

describe('Reaktionsfenster auflösen', () => {
  it('Schild: verbraucht, nichts geklaut, danach würfelt der Angreifer weiter (ohne Items)', () => {
    const { state, attacker, target, openedAt } = openWindow(['shield', 'trap']);
    const r = choose(state, 'shield', openedAt + 500);
    expect(r.events.slice(0, 2)).toEqual([
      { type: 'reaction-resolved', slot: target, result: 'shield' },
      { type: 'item-used', slot: target, item: 'shield' },
    ]);
    expect(ofType(r.events, 'coins-stolen')).toEqual([]);
    expect(playerAt(r.state, target)).toMatchObject({ coins: 10, items: ['trap'] });
    expect(r.state.phase).toBe('roll');
    expect(r.state.prompt).toMatchObject({ slot: attacker, kind: 'roll' });
    expect(r.state.prompt?.options.map((o) => o.id)).toEqual(['roll']);
  });

  it('Festhalten: halber Verlust, abgerundet zugunsten des Ziels', () => {
    const { state, attacker, target, openedAt } = openWindow([], 10, 7);
    const r = choose(state, 'brace', openedAt + 2999);
    expect(r.events).toEqual(
      expect.arrayContaining([
        { type: 'reaction-resolved', slot: target, result: 'brace' },
        { type: 'coins-stolen', from: target, to: attacker, amount: 3 },
        { type: 'coins-changed', slot: target, delta: -3, balance: 7, reason: 'steal' },
        { type: 'coins-changed', slot: attacker, delta: 3, balance: 13, reason: 'steal' },
      ]),
    );
  });

  it('Fristablauf: voller Klau, player-auto mit timeout', () => {
    const { state, attacker, target, openedAt } = openWindow([], 10, 6);
    expect(tick(state, openedAt + WINDOW - 1).events).toEqual([]);
    const r = tick(state, openedAt + WINDOW);
    expect(r.events.slice(0, 3)).toEqual([
      { type: 'player-auto', slot: target, option: 'none', reason: 'timeout' },
      { type: 'reaction-resolved', slot: target, result: 'timeout' },
      { type: 'coins-changed', slot: target, delta: -6, balance: 4, reason: 'steal' },
    ]);
    expect(ofType(r.events, 'coins-stolen')).toEqual([
      { type: 'coins-stolen', from: target, to: attacker, amount: 6 },
    ]);
    expect(playerAt(r.state, attacker).coins).toBe(16);
  });

  it('Klau nimmt höchstens den Bestand; Münzen werden nie negativ', () => {
    const { state, target, openedAt } = openWindow([], 2, 6);
    const r = tick(state, openedAt + WINDOW);
    expect(ofType(r.events, 'coins-stolen')[0]?.amount).toBe(2);
    expect(playerAt(r.state, target).coins).toBe(0);
    const empty = openWindow([], 0, 6);
    const r0 = tick(empty.state, empty.openedAt + WINDOW);
    expect(ofType(r0.events, 'coins-stolen')[0]?.amount).toBe(0);
    expect(ofType(r0.events, 'coins-changed')).toEqual([]);
  });

  it('verspätete Wahl nach der Frist → stale-prompt, Klau läuft trotzdem voll', () => {
    const { state, target, openedAt } = openWindow(['shield']);
    const promptId = state.prompt?.id ?? -1;
    const late = step(state, {
      type: 'choose',
      slot: target,
      promptId,
      option: 'shield',
      at: openedAt + WINDOW + 50,
    });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe('stale-prompt');
    const r = tick(state, openedAt + WINDOW + 50);
    expect(ofType(r.events, 'reaction-resolved')[0]?.result).toBe('timeout');
    // Nach der Auflösung ist dieselbe Wahl ebenfalls veraltet.
    const again = step(r.state, {
      type: 'choose',
      slot: target,
      promptId,
      option: 'shield',
      at: r.state.now,
    });
    expect(!again.ok && again.error.code).toBe('stale-prompt');
  });

  it('falscher Slot (Angreifer) → not-your-turn', () => {
    const { state, attacker, openedAt } = openWindow(['shield']);
    const r = step(state, {
      type: 'choose',
      slot: attacker,
      promptId: state.prompt?.id ?? -1,
      option: 'brace',
      at: openedAt + 10,
    });
    expect(!r.ok && r.error.code).toBe('not-your-turn');
  });

  it('Schild ohne Schild → invalid-option; „none“ ist keine wählbare Option', () => {
    const { state, target, openedAt } = openWindow([]);
    for (const option of ['shield', 'none']) {
      const r = step(state, {
        type: 'choose',
        slot: target,
        promptId: state.prompt?.id ?? -1,
        option,
        at: openedAt + 10,
      });
      expect(!r.ok && r.error.code).toBe('invalid-option');
    }
  });

  it('mit Standard-Pacing zeigt der PC das Ergebnis spaceEventMs lang', () => {
    const { state, attacker, openedAt } = openWindow([]);
    const withPause = patchState(state, {
      config: {
        ...state.config,
        rules: {
          ...state.config.rules,
          pacing: { ...state.config.rules.pacing, spaceEventMs: 1500 },
        },
      },
    });
    const r = run(withPause, {
      type: 'choose',
      slot: withPause.prompt?.slot ?? 1,
      promptId: withPause.prompt?.id ?? -1,
      option: 'brace',
      at: openedAt + 10,
    });
    expect(r.state.phase).toBe('reaction-window');
    expect(r.state.prompt).toBeNull();
    expect(r.state.resumeAt).toBe(openedAt + 10 + 1500);
    const next = tick(r.state, openedAt + 10 + 1500);
    expect(next.state.prompt).toMatchObject({ slot: attacker, kind: 'roll' });
  });
});

describe('stealLoss', () => {
  it('rundet beim Festhalten ab und begrenzt auf den Bestand', () => {
    expect(stealLoss(6, 10, 'timeout')).toBe(6);
    expect(stealLoss(6, 10, 'brace')).toBe(3);
    expect(stealLoss(7, 10, 'brace')).toBe(3);
    expect(stealLoss(6, 5, 'brace')).toBe(2);
    expect(stealLoss(6, 4, 'timeout')).toBe(4);
    expect(stealLoss(6, 0, 'timeout')).toBe(0);
    expect(stealLoss(6, 10, 'shield')).toBe(0);
  });
});
