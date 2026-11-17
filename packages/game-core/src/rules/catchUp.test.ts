/**
 * Aufholhilfen (CHAOS-65, EXP-022): Trophäen-Ziel `trophy.placement` (`nearest-to-last`,
 * `away-from-leader`) und die Münz-Hilfen in `RuleSet.catchUp`, jede einzeln. Ohne Angabe
 * bleibt alles wie vorher (das prüfen zusätzlich die Determinismus-Tests).
 */
import { describe, expect, it } from 'vitest';
import type { CatchUpRules, GameState, MinigameSpec, TrophyPlacement } from '../types.ts';
import { withRules, ZERO_PACING } from './defaults.ts';
import { createGame } from './machine.ts';
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
  run,
  settle,
  start,
  startToRoll,
  TEST_RULES,
  tick,
  type NewGameOptions,
} from './testUtils.ts';

/** Partie bis zum ersten Würfel-Prompt, aktiver Spieler am Gabelfeld `s05`. */
function atFork(options: NewGameOptions, coins: number, trophies = 0): GameState {
  const s = startToRoll(newGame({ players: 2, ...options })).state;
  return patchState(patchPlayer(s, activeSlot(s), { spaceId: 's05', coins, trophies }), {
    trophySpaces: ['a1'],
  });
}

/** Vom Gabelfeld über `a1` (aktive Trophäe) laufen, bis das Kaufangebot offen ist. */
function toTrophyOffer(s: GameState): GameState {
  const fork = chain(s, (x) => choose(x, 'roll'), settle).state;
  return chain(fork, (x) => choose(x, 'a1'), settle).state;
}

function otherSlot(s: GameState): 1 | 2 {
  return activeSlot(s) === 1 ? 2 : 1;
}

describe('Aufholhilfe trophy.placement: Ziel der wandernden Trophäe', () => {
  const rules = (placement?: TrophyPlacement): NewGameOptions => ({
    rules: {
      diceFaces: [1],
      trophy: { price: 20, activeCount: 1, ...(placement && { placement }) },
    },
  });

  /** Kauf auf `a1`, die bzw. der Letzte steht auf `lastAt`; Ziel der Trophäe je Seed. */
  function targets(placement: TrophyPlacement | undefined, lastAt: string): Set<string> {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      let s = atFork({ ...rules(placement), seed }, 30);
      s = patchPlayer(s, otherSlot(s), { spaceId: lastAt, trophies: 0 });
      const [moved] = ofType(choose(toTrophyOffer(s), 'buy').events, 'trophy-moved');
      seen.add(moved?.to ?? '?');
    }
    return seen;
  }

  it('ohne Hilfe: zufällig auf ein freies Feld (b3 oder m2)', () => {
    expect([...targets(undefined, 's00')].sort()).toEqual(['b3', 'm2']);
  });

  it('mit Hilfe: auf das nächste freie Feld vor der bzw. dem Letzten', () => {
    // Von s00: b3 nach 8 Feldern, m2 nach 9.
    expect([...targets('nearest-to-last', 's00')]).toEqual(['b3']);
    // Von m1: m2 nach 1 Feld.
    expect([...targets('nearest-to-last', 'm1')]).toEqual(['m2']);
  });

  it('Letzte nach dem Kauf zählt: kauft die Letzte selbst, wandert die Trophäe vor sie', () => {
    let s = atFork(rules('nearest-to-last'), 30, 1);
    // Die andere Person führt mit 3 Trophäen und steht kurz vor b3.
    s = patchPlayer(s, otherSlot(s), { spaceId: 'b2', trophies: 3, coins: 0 });
    // Die Käuferin hat danach 2 < 3 Trophäen, bleibt Letzte und steht auf a1.
    const [moved] = ofType(choose(toTrophyOffer(s), 'buy').events, 'trophy-moved');
    // Von a1: m2 nach 3 Feldern (a2, m1, m2), b3 erst nach einer ganzen Runde.
    expect(moved?.to).toBe('m2');
  });

  it('away-from-leader: auf das Feld, das von der Spitze am weitesten entfernt ist', () => {
    let s = atFork(rules('away-from-leader'), 30, 0);
    // Die Spitze (2 Trophäen) steht auf m1: m2 liegt 1 Feld vor ihr, b3 fast eine Runde.
    s = patchPlayer(s, otherSlot(s), { spaceId: 'm1', trophies: 2 });
    const [moved] = ofType(choose(toTrophyOffer(s), 'buy').events, 'trophy-moved');
    expect(moved?.to).toBe('b3');
  });
});

describe('Aufholhilfe discount: Rabatt mit Rückstand', () => {
  const opts: NewGameOptions = {
    rules: {
      diceFaces: [1],
      trophy: { price: 20, activeCount: 1 },
      catchUp: { discount: { behind: 2, price: 10 } },
    },
  };

  it('ab 2 Trophäen Rückstand: Angebot und Kauf zum Rabattpreis', () => {
    let s = atFork(opts, 12);
    s = patchPlayer(s, otherSlot(s), { trophies: 2 });
    const offer = toTrophyOffer(s);
    expect(offer.phase).toBe('trophy-offer');
    expect(offer.prompt?.options[0]).toMatchObject({ id: 'buy', detail: '10 Münzen' });
    const slot = activeSlot(offer);
    const [paid] = ofType(choose(offer, 'buy').events, 'coins-changed');
    expect(paid).toMatchObject({ slot, delta: -10, balance: 2, reason: 'trophy' });
  });

  it('1 Trophäe Rückstand reicht nicht: voller Preis, mit 12 Münzen kein Angebot', () => {
    let s = atFork(opts, 12);
    s = patchPlayer(s, otherSlot(s), { trophies: 1 });
    expect(toTrophyOffer(s).phase).not.toBe('trophy-offer');
  });

  it('die Spitze zahlt immer den vollen Preis', () => {
    const offer = toTrophyOffer(atFork(opts, 25, 3));
    expect(offer.prompt?.options[0]).toMatchObject({ id: 'buy', detail: '20 Münzen' });
  });
});

const SPECS: readonly MinigameSpec[] = [{ id: 'flink-flitzer', playMs: 20_000, scoring: 'higher' }];

/** Partie auf einem Brett ohne Feldwirkung; Slot 1 gewinnt jedes Minispiel. */
function minigameGame(rounds: number, catchUp: CatchUpRules): GameState {
  return createGame({
    board: loopBoard(['start', 'start', 'start', 'start']),
    rules: withRules(
      {
        diceFaces: [1],
        economy: { minigameRewards: [10, 5, 3, 0] },
        items: { startItems: 0 },
        pacing: ZERO_PACING,
        catchUp,
      },
      TEST_RULES,
    ),
    rounds,
    seed: 3,
    players: ([1, 2, 3] as const).map((slot) => ({ slot, name: NAMES[slot - 1] ?? 'X' })),
    minigames: SPECS,
  });
}

/** Eine Runde bis einschließlich `round-ended` spielen; liefert alle Ereignisse ab dem Minispiel. */
function playRound(state: GameState): {
  state: GameState;
  events: ReturnType<typeof run>['events'];
} {
  let s = state;
  for (let i = 0; i < 500 && s.phase !== 'minigame-play'; i++) {
    s = s.prompt ? choose(s, 'roll').state : tick(s, s.resumeAt ?? s.now).state;
  }
  const minigame = s.minigame;
  if (!minigame) throw new Error('kein Minispiel');
  const result = run(s, {
    type: 'minigame-result',
    minigameId: minigame.id,
    round: minigame.round,
    placements: [
      { slot: 1, place: 1, score: 9 },
      { slot: 2, place: 2, score: 5 },
      { slot: 3, place: 3, score: 1 },
    ],
    at: s.now + 500,
  });
  const ended = tick(result.state, result.state.resumeAt ?? result.state.now);
  return { state: ended.state, events: [...result.events, ...ended.events] };
}

describe('Aufholhilfe tailwind: Rückenwind-Münzen nach dem Minispiel', () => {
  it('je Trophäe Rückstand Münzen, gedeckelt; nicht nach dem letzten Minispiel', () => {
    let s = start(minigameGame(2, { tailwind: { perTrophy: 2, max: 6 } }), 0).state;
    s = patchPlayer(s, 1, { trophies: 4 });
    s = patchPlayer(s, 2, { trophies: 3 });
    s = patchPlayer(s, 3, { trophies: 0 });
    const first = playRound(s);
    const tail = ofType(first.events, 'coins-changed').filter((e) => e.reason === 'event');
    expect(tail.map((e) => [e.slot, e.delta])).toEqual([
      [2, 2],
      [3, 6],
    ]);
    // Rückenwind kommt vor dem Rundenende (zählt im Zwischenstand).
    const types = first.events.map((e) => e.type);
    expect(types.lastIndexOf('coins-changed')).toBeLessThan(types.indexOf('round-ended'));
    const last = playRound(first.state);
    expect(ofType(last.events, 'coins-changed').filter((e) => e.reason === 'event')).toEqual([]);
  });
});

describe('Aufholhilfe finale: Minispiel-Münzen in den letzten Runden vervielfacht', () => {
  it('nur in den letzten `rounds` Runden', () => {
    let s = start(minigameGame(3, { finale: { rounds: 1, factor: 2 } }), 0).state;
    const rewardsOf = (events: ReturnType<typeof run>['events']) =>
      ofType(events, 'coins-changed')
        .filter((e) => e.reason === 'minigame')
        .map((e) => [e.slot, e.delta]);
    const r1 = playRound(s);
    expect(rewardsOf(r1.events)).toEqual([
      [1, 10],
      [2, 5],
      [3, 3],
    ]);
    s = playRound(r1.state).state;
    const r3 = playRound(s);
    expect(rewardsOf(r3.events)).toEqual([
      [1, 20],
      [2, 10],
      [3, 6],
    ]);
    expect(playerAt(r3.state, 1).minigameWins).toBe(3);
  });
});
