import { describe, expect, it } from 'vitest';
import type { GameState, Slot } from '../types.ts';
import { DEFAULT_RULES, withRules } from './defaults.ts';
import { step } from './machine.ts';
import { loopBoard, TEST_BOARD } from './testBoards.ts';
import {
  activeSlot,
  newGame,
  ofType,
  patchPlayer,
  patchState,
  playerAt,
  run,
  settle,
  start,
  tick,
} from './testUtils.ts';

const GRACE = DEFAULT_RULES.pacing.disconnectGraceMs;

function connection(state: GameState, slot: Slot, connected: boolean, at: number) {
  return run(state, { type: 'connection', slot, connected, at });
}

/** Standard-Pacing, erster Würfel-Prompt offen. */
function atRollPrompt(): GameState {
  const s = start(newGame({ ruleSet: withRules({ diceFaces: [1] }) }), 0).state;
  return tick(s, s.resumeAt ?? 0).state;
}

describe('Disconnect mitten im Zug (CHAOS-23)', () => {
  it('in setup wird nur der Status gesetzt', () => {
    const r = connection(newGame(), 2, false, 0);
    expect(playerAt(r.state, 2).connected).toBe(false);
    expect(r.events).toEqual([]);
  });

  it('der aktive Spieler trennt sich: Frist = at + disconnectGraceMs, dann Auto-Wurf', () => {
    const s = atRollPrompt();
    const slot = activeSlot(s);
    expect(s.prompt?.deadline).toBeNull();
    const gone = connection(s, slot, false, 2000).state;
    expect(playerAt(gone, slot).connected).toBe(false);
    expect(gone.prompt?.deadline).toBe(2000 + GRACE);
    expect(gone.prompt?.id).toBe(s.prompt?.id);
    expect(tick(gone, 2000 + GRACE - 1).events).toEqual([]);
    const r = tick(gone, 2000 + GRACE);
    expect(r.events.slice(0, 2)).toEqual([
      { type: 'player-auto', slot, option: 'roll', reason: 'disconnected' },
      { type: 'dice-rolled', slot, faces: [1], total: 1 },
    ]);
  });

  it('Rückkehr vor Ablauf stellt die ursprüngliche Frist wieder her', () => {
    const s = atRollPrompt();
    const slot = activeSlot(s);
    const gone = connection(s, slot, false, 2000).state;
    const back = connection(gone, slot, true, 5000).state;
    expect(back.prompt?.deadline).toBeNull();
    expect(playerAt(back, slot).connected).toBe(true);
    const later = tick(back, 2000 + GRACE + 60_000);
    expect(later.events).toEqual([]);
    expect(later.state.prompt?.id).toBe(s.prompt?.id);
  });

  it('erneuter Disconnect verlängert die Frist nicht', () => {
    const s = atRollPrompt();
    const slot = activeSlot(s);
    const gone = connection(s, slot, false, 2000).state;
    const again = connection(gone, slot, false, 9000).state;
    expect(again.prompt?.deadline).toBe(2000 + GRACE);
  });

  it('Disconnect eines anderen Spielers ändert die Frist nicht', () => {
    const s = atRollPrompt();
    const other = (activeSlot(s) === 1 ? 2 : 1) as Slot;
    const r = connection(s, other, false, 2000);
    expect(r.state.prompt).toEqual(s.prompt);
    expect(playerAt(r.state, other).connected).toBe(false);
  });

  it('wer schon getrennt ist, bekommt bei Zugbeginn gleich die verkürzte Frist', () => {
    const s0 = start(newGame({ ruleSet: DEFAULT_RULES }), 0).state;
    const slot = activeSlot(s0);
    const gone = connection(s0, slot, false, 100).state;
    const promptAt = gone.resumeAt ?? 0;
    const prompted = tick(gone, promptAt).state;
    expect(prompted.prompt?.deadline).toBe(promptAt + GRACE);
  });

  it('getrennter Spieler: Wegwahl und Trophäe laufen per Standardoption', () => {
    const rules = withRules({ diceFaces: [3] });
    let s = start(newGame({ ruleSet: rules }), 0).state;
    const slot = activeSlot(s);
    s = patchState(patchPlayer(s, slot, { spaceId: 's05', coins: 50 }), { trophySpaces: ['a1'] });
    s = connection(s, slot, false, 0).state;
    const r = tick(s, 10 * GRACE);
    const autos = ofType(r.events, 'player-auto');
    expect(autos.map((e) => [e.option, e.reason])).toEqual([
      ['roll', 'disconnected'],
      ['a1', 'disconnected'],
      ['skip', 'disconnected'],
    ]);
    expect(ofType(r.events, 'trophy-bought')).toEqual([]);
    expect(playerAt(r.state, slot).spaceId).toBe('m1');
  });

  it('getrenntes Ziel im Reaktionsfenster: Frist bleibt das Fenster, Auflösung als disconnected', () => {
    const s0 = settle(
      start(newGame({ board: loopBoard(['start']), rules: { pacing: { reactionWindowMs: 3000 } } }))
        .state,
    ).state;
    const attacker = activeSlot(s0);
    const target = (attacker === 1 ? 2 : 1) as Slot;
    let s = patchPlayer(s0, attacker, { items: ['coin-steal'] });
    s = settle(patchState(s, { phase: 'turn-start', prompt: null, resumeAt: s.now })).state;
    s = connection(s, target, false, s.now).state;
    s = run(s, {
      type: 'choose',
      slot: attacker,
      promptId: s.prompt?.id ?? -1,
      option: 'item:coin-steal',
      at: s.now,
    }).state;
    s = run(s, {
      type: 'choose',
      slot: attacker,
      promptId: s.prompt?.id ?? -1,
      option: `slot:${String(target)}`,
      at: s.now,
    }).state;
    expect(s.prompt?.deadline).toBe(s.now + 3000);
    const r = tick(s, s.now + 3000);
    expect(ofType(r.events, 'player-auto')[0]).toEqual({
      type: 'player-auto',
      slot: target,
      option: 'none',
      reason: 'disconnected',
    });
    expect(ofType(r.events, 'reaction-resolved')[0]?.result).toBe('timeout');
  });

  it('alle Spieler getrennt: die Partie läuft trotzdem bis game-results', () => {
    let s = start(
      newGame({ board: TEST_BOARD, players: 3, rounds: 2, ruleSet: DEFAULT_RULES }),
      0,
    ).state;
    for (const p of s.players) s = connection(s, p.slot, false, 0).state;
    const r = step(s, { type: 'tick', at: 10_000_000 });
    expect(r.ok && r.state.phase).toBe('game-results');
  });
});
