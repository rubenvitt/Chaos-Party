/**
 * Rotation für einen großen Katalog (CHAOS-85): Simulation mit 200 Dummy-Steckbriefen und
 * Integration über ganze Partien (deterministisch per Seed).
 */
import { describe, expect, it } from 'vitest';
import { createRng, shuffled } from '../rng.ts';
import type { GameState, MinigameRotationOptions, MinigameSpec } from '../types.ts';
import { withRules, ZERO_PACING } from './defaults.ts';
import { createGame } from './machine.ts';
import { playedMinigames } from './minigame.ts';
import {
  eligibleMinigames,
  fillMinigameBag,
  minigameWeight,
  pickMinigameIndex,
  rememberMinigame,
  SECRET_CHOICE_IPAD_WEIGHT,
} from './rotation.ts';
import { loopBoard } from './testBoards.ts';
import { choose, NAMES, start, TEST_RULES, tick } from './testUtils.ts';

const CATEGORIES = ['arcade', 'physics', 'hybrid'] as const;
const CONTROLS = ['A', 'AB', 'S', 'SA', 'SAB'] as const;
/** Kernverben: je Familie zwei eigene, dazu ein paar, die Familien teilen (wie im Katalog). */
const SHARED_VERBS = ['rempeln', 'zielen', 'laufen'] as const;

/**
 * 200 Dummy-Steckbriefe wie der Katalog (README §4): 20 Familien à 10, Familien 17–19 mit
 * Team-Spielformen, Familie 20 Mikro-Spiele (nicht in der normalen Rotation), Familie 12 mit
 * geheimer Wahl, jedes siebte Spiel „nur iPhone“, 2v2 nur zu viert, 1v3 ab drei.
 */
function dummyCatalog(): MinigameSpec[] {
  const specs: MinigameSpec[] = [];
  for (let family = 1; family <= 20; family++) {
    for (let n = 0; n < 10; n++) {
      const index = (family - 1) * 10 + n;
      const form =
        family === 17
          ? '1v3'
          : family === 18
            ? '2v2'
            : family === 19
              ? 'koop'
              : family === 20
                ? 'mikro'
                : 'ffa';
      const verb =
        n % 4 === 3
          ? (SHARED_VERBS[(family + n) % SHARED_VERBS.length] ?? 'laufen')
          : `verb-${String(family)}-${String(n % 2)}`;
      specs.push({
        id: `mg-${String(index + 1).padStart(3, '0')}`,
        playMs: 30_000,
        scoring: 'higher',
        category: CATEGORIES[(index * 7) % 3] ?? 'arcade',
        controls: CONTROLS[(index * 3 + family) % 5] ?? 'SA',
        family: `familie-${String(family)}`,
        verb,
        form,
        ...(form === '2v2' ? { minPlayers: 4 } : form === '1v3' ? { minPlayers: 3 } : {}),
        ...(index % 7 === 6 ? { ipadZone: false } : {}),
        ...(family === 12 ? { secretChoice: true } : {}),
      });
    }
  }
  return specs;
}

const CATALOG = dummyCatalog();
const BY_ID = new Map(CATALOG.map((spec) => [spec.id, spec]));

function specOf(id: string): MinigameSpec {
  const spec = BY_ID.get(id);
  if (!spec) throw new Error(`unbekannt: ${id}`);
  return spec;
}

/** Zieht wie `drawMinigame` in game-core (gleiche Bausteine), ohne den Rest der Partie. */
function simulate(
  seed: number,
  rounds: number,
  players = 4,
  options: MinigameRotationOptions = {},
  specs: readonly MinigameSpec[] = CATALOG,
): string[] {
  const rng = createRng(seed);
  const byId = new Map(specs.map((spec) => [spec.id, spec]));
  let bag: string[] = [];
  let last: string | null = null;
  let history: string[] = [];
  const drawn: string[] = [];
  for (let round = 0; round < rounds; round++) {
    if (bag.length === 0) {
      bag = fillMinigameBag(rng, eligibleMinigames(specs, players, options), options, last);
    }
    const [id] = bag.splice(pickMinigameIndex(bag, byId, history, options), 1);
    if (id === undefined) throw new Error('leerer Beutel');
    drawn.push(id);
    history = rememberMinigame(history, id);
    last = id;
  }
  return drawn;
}

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

/** Anteil je Wert einer Achse. */
function shares(ids: readonly string[], axis: (spec: MinigameSpec) => string) {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const key = axis(specOf(id));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map([...counts].map(([key, count]) => [key, count / ids.length]));
}

describe('Rotation mit 200 Dummy-Steckbriefen (CHAOS-85)', () => {
  it('wiederholt in 20 Runden kein Spiel und zieht nie Mikro-Spiele', () => {
    for (const seed of SEEDS) {
      for (const players of [2, 3, 4]) {
        const drawn = simulate(seed, 20, players);
        expect(new Set(drawn).size).toBe(20);
        expect(drawn.some((id) => specOf(id).form === 'mikro')).toBe(false);
      }
    }
  });

  it('nie dieselbe Familie oder dasselbe Kernverb direkt hintereinander', () => {
    for (const seed of SEEDS) {
      const drawn = simulate(seed, 20).map(specOf);
      for (let i = 1; i < drawn.length; i++) {
        expect(drawn[i]?.family).not.toBe(drawn[i - 1]?.family);
        expect(drawn[i]?.verb).not.toBe(drawn[i - 1]?.verb);
      }
    }
  });

  it('verteilt Kategorie, Bedienung, Familie und Spielform gleichmäßig', () => {
    const all = SEEDS.flatMap((seed) => simulate(seed, 20));
    const pool = eligibleMinigames(CATALOG, 4).map((spec) => spec.id);
    const axes: [string, (spec: MinigameSpec) => string][] = [
      ['Kategorie', (spec) => spec.category ?? ''],
      ['Bedienung', (spec) => spec.controls ?? ''],
      ['Familie', (spec) => spec.family ?? ''],
      ['Spielform', (spec) => spec.form ?? ''],
    ];
    for (const [, axis] of axes) {
      const expected = shares(pool, axis);
      const actual = shares(all, axis);
      // Jeder Wert kommt vor, und keiner weicht mehr als ein Viertel von seinem Katalog-Anteil ab.
      expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
      for (const [key, share] of expected) {
        expect(Math.abs((actual.get(key) ?? 0) - share)).toBeLessThan(share * 0.25);
      }
    }
    // Eine Partie mit 20 Runden sieht deutlich mehr verschiedene Familien als reines Mischen.
    const distinct = (ids: readonly MinigameSpec[]) => new Set(ids.map((spec) => spec.family)).size;
    let rotation = 0;
    let random = 0;
    for (const seed of SEEDS) {
      const families = distinct(simulate(seed, 20).map(specOf));
      expect(families).toBeGreaterThanOrEqual(17);
      rotation += families;
      random += distinct(shuffled(createRng(seed), eligibleMinigames(CATALOG, 4)).slice(0, 20));
    }
    // Familien kommen reihum: im Mittel fast alle 19 (reines Mischen: ≈ 13).
    expect(rotation / SEEDS.length).toBeGreaterThan(18.5);
    expect(random / SEEDS.length).toBeLessThan(14);
  });

  it('mischt über die Achsen: gleiche Kategorie oder Bedienung hintereinander seltener als Zufall', () => {
    let sameCategory = 0;
    let sameControls = 0;
    let randomCategory = 0;
    let randomControls = 0;
    let pairs = 0;
    for (const seed of SEEDS) {
      const drawn = simulate(seed, 20).map(specOf);
      const random = shuffled(createRng(seed + 10_000), eligibleMinigames(CATALOG, 4)).slice(0, 20);
      for (let i = 1; i < 20; i++) {
        pairs += 1;
        if (drawn[i]?.category === drawn[i - 1]?.category) sameCategory += 1;
        if (drawn[i]?.controls === drawn[i - 1]?.controls) sameControls += 1;
        if (random[i]?.category === random[i - 1]?.category) randomCategory += 1;
        if (random[i]?.controls === random[i - 1]?.controls) randomControls += 1;
      }
    }
    expect(sameCategory / pairs).toBeLessThan((randomCategory / pairs) * 0.5);
    expect(sameControls / pairs).toBeLessThan((randomControls / pairs) * 0.5);
  });

  it('filtert nach Spielerzahl und iPad-Zonen', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      for (const id of simulate(seed, 20, 2)) {
        expect(specOf(id).minPlayers ?? 1).toBeLessThanOrEqual(2);
      }
      for (const id of simulate(seed, 20, 3)) {
        expect(specOf(id).form).not.toBe('2v2');
      }
      for (const id of simulate(seed, 20, 4, { ipadZones: true })) {
        expect(specOf(id).ipadZone).not.toBe(false);
      }
    }
  });

  it('zieht geheime Wahl bei iPad-Zonen deutlich seltener, aber nicht nie', () => {
    const count = (options: MinigameRotationOptions) =>
      SEEDS.flatMap((seed) => simulate(seed, 20, 4, options)).filter(
        (id) => specOf(id).secretChoice === true,
      ).length;
    const normal = count({});
    const ipad = count({ ipadZones: true });
    expect(ipad).toBeGreaterThan(0);
    expect(ipad).toBeLessThan(normal * 0.5);
    expect(minigameWeight(specOf('mg-111'), { ipadZones: true })).toBe(SECRET_CHOICE_IPAD_WEIGHT);
    expect(minigameWeight(specOf('mg-111'))).toBe(1);
  });

  it('Sperrliste, Favoriten und letzte Partie', () => {
    const blocked = CATALOG.slice(0, 60).map((spec) => spec.id);
    const favorites = ['mg-071', 'mg-072', 'mg-073', 'mg-074', 'mg-075'];
    let favoriteDraws = 0;
    let plainDraws = 0;
    for (const seed of SEEDS) {
      const drawn = simulate(seed, 20, 4, { blocked });
      expect(drawn.some((id) => blocked.includes(id))).toBe(false);
      const withFavorites = simulate(seed, 20, 4, { favorites });
      favoriteDraws += withFavorites.filter((id) => favorites.includes(id)).length;
      plainDraws += simulate(seed, 20).filter((id) => favorites.includes(id)).length;
      // Die Spiele der letzten Partie kommen in der nächsten nicht vor (Vorrat reicht).
      const next = simulate(seed + 1, 20, 4, { recent: simulate(seed, 20) });
      expect(next.some((id) => simulate(seed, 20).includes(id))).toBe(false);
    }
    expect(favoriteDraws).toBeGreaterThan(plainDraws * 1.5);
  });

  it('fällt auf alle zurück, wenn ein Filter nichts übrig ließe', () => {
    const teams = CATALOG.filter((spec) => spec.form === '2v2');
    // Zu zweit taugt kein 2v2-Spiel: lieber eines davon als gar keins.
    expect(eligibleMinigames(teams, 2)).toHaveLength(10);
    // Alles gesperrt: die Sperrliste gilt nicht.
    expect(eligibleMinigames(teams, 4, { blocked: teams.map((spec) => spec.id) })).toHaveLength(10);
  });

  it('ohne Achsen und Optionen genau die Reihenfolge von vor CHAOS-85', () => {
    const plain: MinigameSpec[] = ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      playMs: 1_000,
      scoring: 'higher',
    }));
    for (const seed of SEEDS.slice(0, 50)) {
      // Altes Verfahren (M3): Fisher-Yates je Beutel, beim Neumischen nicht dasselbe vorn.
      const rng = createRng(seed);
      const expected: string[] = [];
      let bag: string[] = [];
      let last: string | null = null;
      for (let round = 0; round < 12; round++) {
        if (bag.length === 0) {
          bag = shuffled(
            rng,
            plain.map((spec) => spec.id),
          );
          if (bag[0] === last) bag.push(...bag.splice(0, 1));
        }
        last = bag.shift() ?? null;
        expected.push(last ?? '?');
      }
      expect(simulate(seed, 12, 4, {}, plain)).toEqual(expected);
    }
  });
});

describe('Rotation in ganzen Partien (CHAOS-85)', () => {
  const rules = withRules({ diceFaces: [1], pacing: ZERO_PACING }, TEST_RULES);

  /** Partie bis zum Ende laufen lassen (Minispiele laufen ab), Reihenfolge der Minispiele. */
  function playGame(seed: number, options?: MinigameRotationOptions, players = 4): string[] {
    let state: GameState = start(
      createGame({
        board: loopBoard(['start', 'start', 'start', 'start']),
        rules,
        rounds: 20,
        seed,
        players: ([1, 2, 3, 4] as const)
          .slice(0, players)
          .map((slot) => ({ slot, name: NAMES[slot - 1] ?? 'X' })),
        minigames: CATALOG,
        ...(options === undefined ? {} : { minigameRotation: options }),
      }),
      0,
    ).state;
    const drawn: string[] = [];
    for (let i = 0; i < 5_000 && state.phase !== 'game-results'; i++) {
      const next = state.prompt ? choose(state, 'roll') : tick(state, state.resumeAt ?? state.now);
      for (const event of next.events) {
        if (event.type === 'minigame-started') drawn.push(event.minigame);
      }
      state = next.state;
    }
    expect(state.phase).toBe('game-results');
    expect(playedMinigames(state)).toEqual(drawn);
    return drawn;
  }

  it('gleicher Seed → gleiche Reihenfolge; 20 Runden ohne Wiederholung', () => {
    const first = playGame(7);
    expect(first).toHaveLength(20);
    expect(new Set(first).size).toBe(20);
    expect(playGame(7)).toEqual(first);
    expect(playGame(8)).not.toEqual(first);
  });

  it('Optionen stehen im Zustand und wirken: iPad-Zonen, Sperrliste, letzte Partie', () => {
    const first = playGame(11, { ipadZones: true });
    expect(first.every((id) => specOf(id).ipadZone !== false)).toBe(true);
    const blocked = first.slice(0, 5);
    const second = playGame(12, { recent: first, blocked });
    expect(second.some((id) => first.includes(id))).toBe(false);
    const state = createGame({
      board: loopBoard(['start']),
      rules,
      rounds: 1,
      seed: 1,
      players: [{ slot: 1, name: 'A' }],
      minigames: CATALOG,
      minigameRotation: { blocked, favorites: ['mg-001'] },
    });
    expect(state.config.minigameRotation).toEqual({ blocked, favorites: ['mg-001'] });
  });
});
