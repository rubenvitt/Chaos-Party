/**
 * Drehende Felder im Regelkern (CHAOS-199, ADR-022): Das Karussell des Rummelplatzes führt
 * jede Runde zu einem anderen Ausgang. Seeded und mit festen Würfeln, damit jeder Weg bekannt ist.
 */
import { describe, expect, it } from 'vitest';
import { CAROUSEL_SPACE, RUMMELPLATZ } from '../board/index.ts';
import type { BoardDefinition, GameState } from '../types.ts';
import { simulateGame } from './simulate.ts';
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
import { DEFAULT_RULES } from './defaults.ts';
import { applyBoardEvent } from './spaces.ts';
import { openDraft, closeDraft } from './internal.ts';

/** Partie auf dem Rummelplatz bis zum ersten Würfel-Prompt, aktive Figur auf `spaceId`. */
function atRoll(spaceId: string, round: number, options: NewGameOptions = {}): GameState {
  const s = startToRoll(newGame({ board: RUMMELPLATZ, rounds: 5, ...options })).state;
  return patchState(patchPlayer(s, activeSlot(s), { spaceId }), { round });
}

const EXITS = { 1: 's68', 2: 's73', 3: 's77', 4: 's68' } as const;

describe('Karussell (drehendes Feld)', () => {
  for (const [round, exit] of Object.entries(EXITS)) {
    it(`nimmt in Runde ${round} den Ausgang ${exit}, ohne nach dem Weg zu fragen`, () => {
      // Von s41 sind es zwei Schritte bis aufs Karussell, der dritte geht durch den Ausgang.
      const s = atRoll('s41', Number(round), { rules: { diceFaces: [4] } });
      const slot = activeSlot(s);
      const r = chain(s, (x) => choose(x, 'roll'), settle);
      expect(ofType(r.events, 'path-chosen')).toEqual([]);
      expect(ofType(r.events, 'moved')[0]?.path).toEqual([
        's42',
        CAROUSEL_SPACE,
        exit,
        expect.any(String),
      ]);
      expect(r.state.phase).not.toBe('choose-path');
      expect(playerAt(r.state, slot).spaceId).not.toBe(CAROUSEL_SPACE);
    });
  }

  it('wer auf dem Karussell steht, verlässt es durch den Ausgang der neuen Runde', () => {
    const s = atRoll(CAROUSEL_SPACE, 2, { rules: { diceFaces: [1] } });
    const r = chain(s, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'moved')[0]?.path).toEqual(['s73']);
  });

  it('sagt an Gabel B, wohin das Karussell gerade dreht', () => {
    for (const [round, target] of [
      [1, 'Spiegelkabinett'],
      [2, 'Startplatz'],
      [3, 'Geisterbahn'],
    ] as const) {
      const s = atRoll('s30', round, { rules: { diceFaces: [3] } });
      const r = chain(s, (x) => choose(x, 'roll'), settle);
      expect(r.state.phase).toBe('choose-path');
      expect(r.state.prompt?.options).toEqual([
        { id: 's32', label: 'Zuckerwattenallee' },
        { id: 's40', label: 'Karussell', detail: `Karussell → ${target}` },
      ]);
    }
  });

  it('Windstoß auf dem Karussell folgt dem Ausgang der Runde statt dem Zufall', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = atRoll(CAROUSEL_SPACE, 3, { seed });
      const ctx = openDraft(s);
      applyBoardEvent(ctx, 'gust');
      const after = closeDraft(ctx);
      const path = ofType(ctx.events, 'moved')[0]?.path ?? [];
      expect(path[0]).toBe('s77');
      expect(playerAt(after, activeSlot(s)).spaceId).toBe(path.at(-1));
    }
  });

  it('ganze Bot-Partien auf dem Rummelplatz laufen durch und nutzen alle drei Ausgänge', () => {
    const used = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const result = simulateGame({
        board: RUMMELPLATZ,
        rules: DEFAULT_RULES,
        seed,
        players: 4,
        rounds: 12,
      });
      expect(result.rounds).toBe(12);
      for (const exit of Object.keys(result.rotationExits)) used.add(exit);
    }
    expect([...used].sort()).toEqual(['s68', 's73', 's77']);
  });
});

describe('Brett ohne Drehung bleibt unverändert', () => {
  it('Wegwahl ohne Karussell hat keinen Zusatz', () => {
    const board: BoardDefinition = {
      id: 'gabel',
      name: 'Gabel',
      start: 'g0',
      spaces: [
        { id: 'g0', kind: 'start', next: ['g1', 'g2'], position: { x: 0, z: 0 } },
        { id: 'g1', kind: 'coins-plus', next: ['g0'], position: { x: 1, z: 0 } },
        { id: 'g2', kind: 'coins-minus', next: ['g0'], position: { x: 1, z: 1 } },
      ],
    };
    const s = startToRoll(newGame({ board, rules: { diceFaces: [1] } })).state;
    const r = chain(s, (x) => choose(x, 'roll'), settle);
    expect(r.state.prompt?.options.every((o) => o.detail === undefined)).toBe(true);
  });
});
