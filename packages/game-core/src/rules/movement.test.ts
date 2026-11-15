import { describe, expect, it } from 'vitest';
import type { BoardDefinition, GameState } from '../types.ts';
import { withRules } from './defaults.ts';
import { TEST_BOARD } from './testBoards.ts';
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
  tick,
  type NewGameOptions,
} from './testUtils.ts';

/** Partie bis zum ersten Würfel-Prompt, aktiver Spieler optional präpariert. */
function atRoll(
  options: NewGameOptions,
  patch: Parameters<typeof patchPlayer>[2] = {},
  statePatch: Partial<GameState> = {},
): GameState {
  const s = startToRoll(newGame(options)).state;
  return patchState(patchPlayer(s, activeSlot(s), patch), statePatch);
}

describe('Würfel', () => {
  it('nimmt je Würfel eine Seite aus diceFaces, gleichverteilt über viele Seeds', () => {
    const seen = new Map<number, number>();
    for (let seed = 1; seed <= 600; seed++) {
      const s = atRoll({ seed });
      const [rolled] = ofType(choose(s, 'roll').events, 'dice-rolled');
      const face = rolled?.faces[0] ?? -1;
      expect(rolled?.faces).toHaveLength(1);
      expect(rolled?.total).toBe(face);
      seen.set(face, (seen.get(face) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const count of seen.values()) expect(count).toBeGreaterThan(60);
  });

  it('respektiert eigene Würfelseiten', () => {
    const s = atRoll({ rules: { diceFaces: [0, 7] } });
    const [rolled] = ofType(choose(s, 'roll').events, 'dice-rolled');
    expect([0, 7]).toContain(rolled?.total);
  });

  it('Wurf 0 bleibt stehen und löst das aktuelle Feld aus', () => {
    const s = atRoll({ rules: { diceFaces: [0] } }, { spaceId: 's01' });
    const r = chain(s, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'moved')).toEqual([]);
    expect(ofType(r.events, 'coins-changed')[0]).toMatchObject({ delta: 3, reason: 'space' });
  });
});

describe('Bewegung und Verzweigung', () => {
  it('läuft Feld für Feld und landet ohne Wegwahl, wenn die Schritte an der Verzweigung enden', () => {
    const s = atRoll({ rules: { diceFaces: [5] } });
    const slot = activeSlot(s);
    const r = chain(s, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'moved')).toEqual([
      { type: 'moved', slot, path: ['s01', 's02', 's03', 's04', 's05'] },
    ]);
    expect(ofType(r.events, 'path-chosen')).toEqual([]);
    expect(playerAt(r.state, slot).spaceId).toBe('s05');
  });

  it('fragt an der Verzweigung mit Restschritten nach dem Weg und läuft dann weiter', () => {
    const s = atRoll({ rules: { diceFaces: [7] } });
    const slot = activeSlot(s);
    const atFork = chain(s, (x) => choose(x, 'roll'), settle);
    expect(atFork.state.phase).toBe('choose-path');
    expect(playerAt(atFork.state, slot).spaceId).toBe('s05');
    expect(atFork.state.prompt).toMatchObject({
      kind: 'path',
      slot,
      defaultOption: 'a1',
      deadline: null,
      options: [
        { id: 'a1', label: 'Pilzpfad' },
        { id: 'b1', label: 'Felsweg' },
      ],
    });
    const after = chain(atFork.state, (x) => choose(x, 'b1'), settle);
    expect(after.events.slice(0, 2)).toEqual([
      { type: 'path-chosen', slot, spaceId: 'b1' },
      { type: 'moved', slot, path: ['b1', 'b2'] },
    ]);
    expect(playerAt(after.state, slot).spaceId).toBe('b2');
  });

  it('fragt sofort, wenn der Zug auf einer Verzweigung beginnt', () => {
    const s = atRoll({ rules: { diceFaces: [2] } }, { spaceId: 's05' });
    const r = chain(s, (x) => choose(x, 'roll'), settle);
    expect(ofType(r.events, 'moved')).toEqual([]);
    expect(r.state.phase).toBe('choose-path');
  });

  it('Wegnamen ohne label heißen „Weg 1/2“', () => {
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
    const s = atRoll({ board, rules: { diceFaces: [1] } });
    const r = chain(s, (x) => choose(x, 'roll'), settle);
    expect(r.state.prompt?.options).toEqual([
      { id: 'g1', label: 'Weg 1' },
      { id: 'g2', label: 'Weg 2' },
    ]);
  });

  it('moved hält resumeAt = Pfadlänge × stepMs', () => {
    const rules = withRules({ diceFaces: [3] });
    const s = atRoll({ ruleSet: rules });
    const t = s.now + 100;
    const rolled = choose(s, 'roll', t).state;
    const moved = tick(rolled, t + rules.pacing.rollMs);
    expect(moved.state.resumeAt).toBe(t + rules.pacing.rollMs + 3 * rules.pacing.stepMs);
    expect(moved.state.phase).toBe('move');
  });
});

describe('Trophäe', () => {
  const opts = (dice: number, mode: 'wandering' | 'fixed' = 'wandering'): NewGameOptions => ({
    rules: { diceFaces: [dice], trophy: { price: 20, mode } },
  });

  function toA1(dice: number, coins: number, mode?: 'wandering' | 'fixed'): GameState {
    const s = atRoll(opts(dice, mode), { spaceId: 's05', coins }, { trophySpaces: ['a1'] });
    const fork = chain(s, (x) => choose(x, 'roll'), settle).state;
    return chain(fork, (x) => choose(x, 'a1'), settle).state;
  }

  it('bietet beim Passieren mit genug Münzen den Kauf an (Standard: weiterlaufen)', () => {
    const offer = toA1(3, 25);
    expect(offer.phase).toBe('trophy-offer');
    expect(offer.prompt).toMatchObject({
      kind: 'trophy',
      defaultOption: 'skip',
      options: [
        { id: 'buy', label: 'Kaufen', detail: '20 Münzen' },
        { id: 'skip', label: 'Weiterlaufen' },
      ],
    });
    expect(playerAt(offer, activeSlot(offer)).spaceId).toBe('a1');
  });

  it('Kauf: Münzen − Preis, Trophäe + 1, Trophäe wandert, Restschritte laufen weiter', () => {
    const offer = toA1(3, 25);
    const slot = activeSlot(offer);
    const r = chain(offer, (x) => choose(x, 'buy'), settle);
    expect(r.events.slice(0, 3)).toEqual([
      { type: 'coins-changed', slot, delta: -20, balance: 5, reason: 'trophy' },
      { type: 'trophy-bought', slot, spaceId: 'a1' },
      { type: 'trophy-moved', from: 'a1', to: r.state.trophySpaces[0] },
    ]);
    expect(['b3', 'm2']).toContain(r.state.trophySpaces[0]);
    expect(playerAt(r.state, slot).trophies).toBe(1);
    expect(ofType(r.events, 'moved')).toEqual([{ type: 'moved', slot, path: ['a2', 'm1'] }]);
    expect(playerAt(r.state, slot).spaceId).toBe('m1');
  });

  it('Weiterlaufen ohne Kauf ändert nichts an Münzen und Trophäe', () => {
    const offer = toA1(3, 25);
    const slot = activeSlot(offer);
    const r = chain(offer, (x) => choose(x, 'skip'), settle);
    expect(ofType(r.events, 'trophy-bought')).toEqual([]);
    expect(r.state.trophySpaces).toEqual(['a1']);
    expect(playerAt(r.state, slot).trophies).toBe(0);
  });

  it('Landen auf der Trophäe bietet ebenfalls an; danach Feldereignis ohne Wirkung', () => {
    const offer = toA1(1, 20);
    expect(offer.phase).toBe('trophy-offer');
    const slot = activeSlot(offer);
    const r = chain(offer, (x) => choose(x, 'buy'), settle);
    expect(playerAt(r.state, slot)).toMatchObject({ spaceId: 'a1', coins: 0, trophies: 1 });
    expect(ofType(r.events, 'coins-changed').filter((e) => e.reason === 'space')).toEqual([]);
  });

  it('zu wenig Münzen: kein Angebot, einfach vorbei', () => {
    const s = atRoll(opts(3), { spaceId: 's05', coins: 19 }, { trophySpaces: ['a1'] });
    const fork = chain(s, (x) => choose(x, 'roll'), settle).state;
    const r = chain(fork, (x) => choose(x, 'a1'), settle);
    expect(ofType(r.events, 'moved')[0]?.path).toEqual(['a1', 'a2', 'm1']);
    expect(r.state.phase).not.toBe('trophy-offer');
  });

  it('inaktives Trophäenfeld bietet nichts an', () => {
    const s = atRoll(opts(3), { spaceId: 's05', coins: 50 }, { trophySpaces: ['m2'] });
    const fork = chain(s, (x) => choose(x, 'roll'), settle).state;
    const r = chain(fork, (x) => choose(x, 'a1'), settle);
    expect(ofType(r.events, 'trophy-bought')).toEqual([]);
  });

  it('fixed: alle Trophäenfelder aktiv, nach dem Kauf wandert nichts', () => {
    const s = atRoll(opts(1, 'fixed'), { spaceId: 's05', coins: 30 });
    expect(s.trophySpaces).toEqual(['a1', 'b3', 'm2']);
    const fork = chain(s, (x) => choose(x, 'roll'), settle).state;
    const offer = chain(fork, (x) => choose(x, 'a1'), settle).state;
    const r = chain(offer, (x) => choose(x, 'buy'), settle);
    expect(ofType(r.events, 'trophy-moved')).toEqual([]);
    expect(r.state.trophySpaces).toEqual(['a1', 'b3', 'm2']);
  });

  it('wandernde Trophäe springt seeded immer auf ein anderes Trophäenfeld', () => {
    const targets = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = atRoll(
        { ...opts(1), seed },
        { spaceId: 's05', coins: 30 },
        { trophySpaces: ['a1'] },
      );
      const fork = chain(s, (x) => choose(x, 'roll'), settle).state;
      const offer = chain(fork, (x) => choose(x, 'a1'), settle).state;
      const [moved] = ofType(choose(offer, 'buy').events, 'trophy-moved');
      expect(moved?.from).toBe('a1');
      expect(moved?.to).not.toBe('a1');
      targets.add(moved?.to ?? '');
    }
    expect([...targets].sort()).toEqual(['b3', 'm2']);
  });

  it('mit Standard-Pacing folgt nach einem Kauf eine Anzeige-Pause von spaceEventMs', () => {
    const rules = withRules({ diceFaces: [3] });
    let s = atRoll({ ruleSet: rules }, { spaceId: 's05', coins: 30 }, { trophySpaces: ['a1'] });
    s = choose(s, 'roll').state;
    s = settle(s).state;
    s = choose(s, 'a1').state;
    s = settle(s).state;
    expect(s.phase).toBe('trophy-offer');
    const bought = choose(s, 'buy', s.now);
    expect(bought.state.resumeAt).toBe(s.now + rules.pacing.spaceEventMs);
    expect(ofType(bought.events, 'moved')).toEqual([]);
  });
});

describe('Basis-Brett', () => {
  it('TEST_BOARD hat alle Feldtypen, eine Verzweigung und Trophäenfelder', () => {
    const kinds = new Set(TEST_BOARD.spaces.map((s) => s.kind));
    expect([...kinds].sort()).toEqual([
      'coins-minus',
      'coins-plus',
      'event',
      'item',
      'start',
      'trophy',
    ]);
    expect(TEST_BOARD.spaces.some((s) => s.next.length >= 2)).toBe(true);
  });
});
