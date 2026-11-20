/**
 * Brett-Mechaniken des Frostgipfels im Regelkern (CHAOS-198, ADR-022): Eisfelder, Seilbahn und
 * Lawinen. Seeded und mit festen Würfeln, damit jeder Weg bekannt ist.
 */
import { describe, expect, it } from 'vitest';
import {
  avalancheAt,
  avalancheWarning,
  FROSTGIPFEL,
  MOUNTAIN_STATION,
  VALLEY_STATION,
} from '../board/index.ts';
import type { GameState, Slot } from '../types.ts';
import { DEFAULT_RULES } from './defaults.ts';
import { closeDraft, openDraft } from './internal.ts';
import { simulateGame } from './simulate.ts';
import { applyBoardEvent } from './spaces.ts';
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
  TEST_RULES,
  type NewGameOptions,
} from './testUtils.ts';

const PLUS = TEST_RULES.economy.coinsPlus;

/** Partie auf dem Frostgipfel bis zum ersten Würfel-Prompt, aktive Figur auf `spaceId`. */
function atRoll(spaceId: string, options: NewGameOptions & { coins?: number } = {}): GameState {
  const s = startToRoll(newGame({ board: FROSTGIPFEL, rounds: 12, ...options })).state;
  const patch = options.coins === undefined ? { spaceId } : { spaceId, coins: options.coins };
  return patchPlayer(s, activeSlot(s), patch);
}

/** Würfeln (feste Würfel aus `diceFaces`) und bis zum nächsten Prompt laufen. */
function roll(s: GameState) {
  return chain(s, (x) => choose(x, 'roll'), settle);
}

describe('Eisfelder', () => {
  it('wer auf Eis landet, rutscht ein Feld weiter und bekommt dort die Feldwirkung', () => {
    // g07 → g08 (Eis) → g09 (Minus-Feld).
    const s = atRoll('g07', { rules: { diceFaces: [1] } });
    const slot = activeSlot(s);
    const before = playerAt(s, slot).coins;
    const r = roll(s);
    const moved = ofType(r.events, 'moved').filter((e) => e.slot === slot);
    expect(moved.map((e) => e.path)).toEqual([['g08'], ['g09']]);
    expect(playerAt(r.state, slot).spaceId).toBe('g09');
    const coins = ofType(r.events, 'coins-changed').filter((e) => e.slot === slot);
    expect(coins).toEqual([
      expect.objectContaining({ delta: -TEST_RULES.economy.coinsMinus, reason: 'space' }),
    ]);
    expect(playerAt(r.state, slot).coins).toBe(before - TEST_RULES.economy.coinsMinus);
  });

  it('auf der Rodelbahn rutscht man über mehrere Eisfelder bis aufs feste Feld', () => {
    // f39 ist Gabel C: Rodelbahn wählen, mit 1 Schritt auf r1, dann r2, r3 → r4 (Plus).
    const s = atRoll('f38', { rules: { diceFaces: [2] } });
    const slot = activeSlot(s);
    const atFork = roll(s);
    expect(atFork.state.phase).toBe('choose-path');
    const r = chain(atFork.state, (x) => choose(x, 'r1'), settle);
    const moved = ofType(r.events, 'moved').filter((e) => e.slot === slot);
    expect(moved.map((e) => e.path)).toEqual([['r1'], ['r2', 'r3', 'r4']]);
    expect(playerAt(r.state, slot).spaceId).toBe('r4');
    expect(ofType(r.events, 'coins-changed')).toContainEqual(
      expect.objectContaining({ slot, delta: PLUS, reason: 'space' }),
    );
  });

  it('wer über Eis läuft, rutscht nicht', () => {
    const s = atRoll('g07', { rules: { diceFaces: [3] } });
    const slot = activeSlot(s);
    const r = roll(s);
    expect(ofType(r.events, 'moved').filter((e) => e.slot === slot)).toHaveLength(1);
    expect(playerAt(r.state, slot).spaceId).toBe('g10');
  });

  it('die Rutschpartie verlängert die Anzeige um ihre Schritte', () => {
    const stepMs = 400;
    const spaceEventMs = 1000;
    const s = atRoll('g07', { rules: { diceFaces: [1], pacing: { stepMs, spaceEventMs } } });
    // Würfeln, Würfelanimation (0), Lauf (1 Feld) bis zur Feldwirkung.
    let r = chain(s, (x) => choose(x, 'roll'));
    while (r.state.phase !== 'space-event') r = tick(r.state, r.state.resumeAt ?? r.state.now);
    expect((r.state.resumeAt ?? 0) - r.state.now).toBe(spaceEventMs + stepMs);
  });

  it('Windstoß auf Eis rutscht nicht nach', () => {
    const s = atRoll('g06', { seed: 3 });
    const ctx = openDraft(s);
    applyBoardEvent(ctx, 'gust');
    const after = closeDraft(ctx);
    const moved = ofType(ctx.events, 'moved');
    expect(moved).toHaveLength(1);
    expect(playerAt(after, activeSlot(s)).spaceId).toBe(moved[0]?.path.at(-1));
  });
});

describe('Seilbahn', () => {
  it('bietet an der Talstation die Seilbahn mit Fahrpreis an, kostenloser Weg zuerst', () => {
    const s = atRoll('f03', { rules: { diceFaces: [3] }, coins: 20 });
    const r = roll(s);
    expect(r.state.phase).toBe('choose-path');
    expect(r.state.prompt?.options).toEqual([
      { id: 'f05', label: 'Talweg' },
      { id: MOUNTAIN_STATION, label: 'Seilbahn', detail: '8 Münzen' },
    ]);
    expect(r.state.prompt?.defaultOption).toBe('f05');
  });

  it('kostet beim Einsteigen und fährt in einem Schritt zur Bergstation', () => {
    const s = atRoll('f03', { rules: { diceFaces: [3] }, coins: 20 });
    const slot = activeSlot(s);
    const atFork = roll(s);
    const r = chain(atFork.state, (x) => choose(x, MOUNTAIN_STATION), settle);
    expect(ofType(r.events, 'coins-changed')[0]).toEqual(
      expect.objectContaining({ slot, delta: -8, balance: 12, reason: 'event' }),
    );
    // Von f04 noch zwei Schritte: Bergstation g06, dann g07 (Trophäenfeld, ohne Trophäe dort).
    expect(ofType(r.events, 'moved').find((e) => e.slot === slot)?.path).toEqual([
      MOUNTAIN_STATION,
      'g07',
    ]);
  });

  it('wer zu wenig Münzen hat, bekommt keine Wahl und nimmt den Talweg', () => {
    const s = atRoll('f03', { rules: { diceFaces: [3] }, coins: 7 });
    const slot = activeSlot(s);
    const r = roll(s);
    expect(ofType(r.events, 'path-chosen')).toEqual([]);
    expect(ofType(r.events, 'moved').find((e) => e.slot === slot)?.path).toEqual([
      VALLEY_STATION,
      'f05',
      'f06',
    ]);
  });

  it('ein Windstoß an der Talstation fährt nie gratis Seilbahn', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = atRoll(VALLEY_STATION, { seed, coins: 50 });
      const ctx = openDraft(s);
      applyBoardEvent(ctx, 'gust');
      expect(ofType(ctx.events, 'moved')[0]?.path[0]).toBe('f05');
    }
  });
});

describe('Lawinen', () => {
  it('gehen nach jeder dritten Runde ab, abwechselnd Gletscherpfad und Nordhang', () => {
    const zones = Array.from({ length: 13 }, (_, i) => avalancheAt(FROSTGIPFEL, i + 1)?.name);
    expect(zones).toEqual([
      undefined,
      undefined,
      undefined,
      'Gletscherpfad',
      undefined,
      undefined,
      'Nordhang',
      undefined,
      undefined,
      'Gletscherpfad',
      undefined,
      undefined,
      'Nordhang',
    ]);
  });

  it('werden eine Runde vorher angesagt, nach der letzten Runde nicht mehr', () => {
    expect(avalancheWarning(FROSTGIPFEL, 3, 12)?.name).toBe('Gletscherpfad');
    expect(avalancheWarning(FROSTGIPFEL, 4, 12)).toBeUndefined();
    expect(avalancheWarning(FROSTGIPFEL, 6, 12)?.name).toBe('Nordhang');
    expect(avalancheWarning(FROSTGIPFEL, 6, 6)).toBeUndefined();
  });

  /** Ende von Runde `round`: Spieler auf `spaces`, dann den Rundenwechsel abspielen. */
  function roundChange(round: number, spaces: readonly string[], coins = 10) {
    let s = newGame({ board: FROSTGIPFEL, players: spaces.length, rounds: 12 });
    s = startToRoll(s).state;
    spaces.forEach((spaceId, i) => {
      s = patchPlayer(s, (i + 1) as Slot, { spaceId, coins });
    });
    s = patchState(s, {
      phase: 'round-end',
      round,
      prompt: null,
      activeSlot: null,
      resumeAt: s.now,
    });
    return tick(s, s.now);
  }

  it('wer zu Beginn von Runde 4 am Gletscherpfad steht, verliert 5 Münzen', () => {
    const r = roundChange(3, ['f20', 'f12', 'f23']);
    expect(ofType(r.events, 'round-started')[0]?.round).toBe(4);
    // Reihenfolge = Zugreihenfolge (per Seed).
    const losses = ofType(r.events, 'coins-changed').sort((a, b) => a.slot - b.slot);
    expect(losses).toEqual([
      expect.objectContaining({ slot: 1, delta: -5, balance: 5, reason: 'space' }),
      expect.objectContaining({ slot: 3, delta: -5, balance: 5, reason: 'space' }),
    ]);
    expect(playerAt(r.state, 1).spaceId).toBe('f20');
  });

  it('nimmt nie mehr, als man hat, und trifft in Runde 7 den Nordhang', () => {
    const r = roundChange(6, ['r5', 'f20'], 3);
    expect(ofType(r.events, 'coins-changed')).toEqual([
      expect.objectContaining({ slot: 1, delta: -3, balance: 0 }),
    ]);
  });

  it('ohne Lawine in der Runde passiert nichts', () => {
    expect(ofType(roundChange(4, ['f20', 'r5']).events, 'coins-changed')).toEqual([]);
  });
});

describe('Ganze Partien auf dem Frostgipfel', () => {
  it('laufen durch und nutzen Eis, Seilbahn und Lawinen', () => {
    let slides = 0;
    let rides = 0;
    let hits = 0;
    let avalanches = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const result = simulateGame({
        board: FROSTGIPFEL,
        rules: DEFAULT_RULES,
        seed,
        players: 4,
        rounds: 12,
      });
      expect(result.rounds).toBe(12);
      expect(result.avalanches).toBe(3);
      slides += result.iceSlides;
      rides += result.cableRides;
      hits += result.avalancheHits;
      avalanches += result.avalanches;
    }
    expect(slides).toBeGreaterThan(0);
    expect(rides).toBeGreaterThan(0);
    expect(hits).toBeGreaterThan(0);
    expect(avalanches).toBe(36);
  });

  it('ist mit gleichem Seed gleich (deterministisch)', () => {
    const options = {
      board: FROSTGIPFEL,
      rules: DEFAULT_RULES,
      seed: 7,
      players: 3 as const,
      rounds: 6,
    };
    expect(simulateGame(options)).toEqual(simulateGame(options));
  });
});
