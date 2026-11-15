import { describe, expect, it } from 'vitest';
import type { GameCommand, GameState, StepResult } from '../types.ts';
import { DEFAULT_RULES, withRules, ZERO_PACING } from './defaults.ts';
import { createGame, step } from './machine.ts';
import { loopBoard, plainBoard, TEST_BOARD } from './testBoards.ts';
import {
  activeSlot,
  chain,
  choose,
  deepFreeze,
  newGame,
  ofType,
  playerAt,
  run,
  scriptedOption,
  settle,
  start,
  startToRoll,
  TEST_RULES,
  tick,
} from './testUtils.ts';

// game-core kennt keine Laufzeit-Typen (types: []); structuredClone gibt es in Node ≥ 17.
const cloneStructured = (globalThis as unknown as { structuredClone: <T>(value: T) => T })
  .structuredClone;

function expectError(result: StepResult, code: string, before: GameState): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
  expect(result.error.message.length).toBeGreaterThan(0);
  expect(result.state).toBe(before);
}

describe('createGame', () => {
  it('legt die Partie in setup an: alle auf dem Start, Startmünzen, keine Items', () => {
    const state = newGame({ players: 3, rounds: 4 });
    expect(state.phase).toBe('setup');
    expect(state.round).toBe(0);
    expect(state.rounds).toBe(4);
    expect(state.activeSlot).toBeNull();
    expect(state.prompt).toBeNull();
    expect(state.resumeAt).toBeNull();
    expect(state.ranking).toBeNull();
    expect(state.boardId).toBe(TEST_BOARD.id);
    expect(state.players.map((p) => p.slot)).toEqual([1, 2, 3]);
    for (const player of state.players) {
      expect(player.spaceId).toBe(TEST_BOARD.start);
      expect(player.coins).toBe(TEST_RULES.economy.startCoins);
      expect(player.trophies).toBe(0);
      expect(player.items).toEqual([]);
      expect(player.connected).toBe(true);
    }
  });

  it('aktiviert bei wandering genau ein Trophäenfeld (seeded), bei fixed alle', () => {
    const wandering = newGame({ seed: 7 });
    expect(wandering.trophySpaces).toHaveLength(1);
    expect(['a1', 'b3', 'm2']).toContain(wandering.trophySpaces[0]);
    expect(newGame({ seed: 7 }).trophySpaces).toEqual(wandering.trophySpaces);
    const seen = new Set(
      Array.from({ length: 30 }, (_, i) => newGame({ seed: i }).trophySpaces[0]),
    );
    expect(seen.size).toBeGreaterThan(1);
    const fixed = newGame({ rules: { trophy: { mode: 'fixed' } } });
    expect(fixed.trophySpaces).toEqual(['a1', 'b3', 'm2']);
    expect(newGame({ board: plainBoard() }).trophySpaces).toEqual([]);
  });

  it('wirft bei ungültiger Konfiguration', () => {
    const base = {
      board: TEST_BOARD,
      rules: DEFAULT_RULES,
      rounds: 3,
      seed: 1,
      players: [{ slot: 1 as const, name: 'A' }],
    };
    expect(() => createGame({ ...base, rounds: 0 })).toThrow(RangeError);
    expect(() => createGame({ ...base, rounds: 1.5 })).toThrow(RangeError);
    expect(() => createGame({ ...base, players: [] })).toThrow(RangeError);
    expect(() =>
      createGame({
        ...base,
        players: [
          { slot: 1, name: 'A' },
          { slot: 1, name: 'B' },
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createGame({ ...base, players: [{ slot: 5 as unknown as 1, name: 'A' }] }),
    ).toThrow(RangeError);
    expect(() => createGame({ ...base, seed: 0.5 })).toThrow(RangeError);
    expect(() => createGame({ ...base, board: { ...TEST_BOARD, start: 'fehlt' } })).toThrow(
      RangeError,
    );
    expect(() =>
      createGame({
        ...base,
        board: {
          ...TEST_BOARD,
          spaces: [{ id: 's00', kind: 'start', next: ['weg'], position: { x: 0, z: 0 } }],
        },
      }),
    ).toThrow(RangeError);
    expect(() => createGame({ ...base, rules: withRules({ diceFaces: [] }) })).toThrow(RangeError);
  });
});

describe('Phasenübergänge mit Standard-Pacing', () => {
  const rules = withRules({ diceFaces: [2] }, TEST_RULES);
  const board = loopBoard(['coins-plus', 'coins-plus', 'coins-plus', 'coins-plus']);

  it('start → turn-start → roll → move → space-event → turn-end → nächster Zug', () => {
    const game = newGame({ board, ruleSet: rules, players: 2 });
    const { pacing } = rules;

    const started = start(game, 1000);
    expect(started.events.map((e) => e.type)).toEqual([
      'game-started',
      'round-started',
      'turn-started',
    ]);
    const s1 = started.state;
    expect(s1.phase).toBe('turn-start');
    expect([...s1.turnOrder].sort()).toEqual([1, 2]);
    expect(s1.activeSlot).toBe(s1.turnOrder[0]);
    expect(s1.round).toBe(1);
    expect(s1.resumeAt).toBe(1000 + pacing.turnStartMs);
    expect(s1.now).toBe(1000);

    // Kurz vor Ablauf passiert nichts.
    const early = tick(s1, 1000 + pacing.turnStartMs - 1);
    expect(early.events).toEqual([]);
    expect(early.state.phase).toBe('turn-start');

    const s2 = tick(early.state, 1000 + pacing.turnStartMs).state;
    expect(s2.phase).toBe('roll');
    expect(s2.prompt).toMatchObject({
      id: 1,
      slot: s1.activeSlot,
      kind: 'roll',
      defaultOption: 'roll',
      deadline: null,
    });
    expect(s2.resumeAt).toBeNull();

    const rolled = choose(s2, 'roll', 3000);
    expect(rolled.events).toEqual([
      { type: 'dice-rolled', slot: s1.activeSlot, faces: [2], total: 2 },
    ]);
    expect(rolled.state.phase).toBe('move');
    expect(rolled.state.prompt).toBeNull();
    expect(rolled.state.resumeAt).toBe(3000 + pacing.rollMs);

    const moved = tick(rolled.state, 3000 + pacing.rollMs);
    expect(moved.events).toEqual([{ type: 'moved', slot: s1.activeSlot, path: ['l1', 'l2'] }]);
    expect(moved.state.resumeAt).toBe(3000 + pacing.rollMs + 2 * pacing.stepMs);
    expect(playerAt(moved.state, activeSlot(s1)).spaceId).toBe('l2');

    const landedAt = 3000 + pacing.rollMs + 2 * pacing.stepMs;
    const landed = tick(moved.state, landedAt);
    expect(landed.state.phase).toBe('space-event');
    expect(landed.events).toEqual([
      { type: 'coins-changed', slot: s1.activeSlot, delta: 3, balance: 13, reason: 'space' },
    ]);
    expect(landed.state.resumeAt).toBe(landedAt + pacing.spaceEventMs);

    const ended = tick(landed.state, landedAt + pacing.spaceEventMs);
    expect(ended.state.phase).toBe('turn-end');
    expect(ended.events).toEqual([{ type: 'turn-ended', slot: s1.activeSlot }]);

    const next = tick(ended.state, landedAt + pacing.spaceEventMs + pacing.turnEndMs);
    expect(next.state.phase).toBe('turn-start');
    expect(next.state.activeSlot).toBe(s1.turnOrder[1]);
    expect(next.events).toEqual([{ type: 'turn-started', slot: s1.turnOrder[1], round: 1 }]);
  });

  it('ein später Tick arbeitet alle fälligen Übergänge mit ihren geplanten Zeitpunkten ab', () => {
    const game = newGame({ board, ruleSet: rules, players: 2 });
    const s = start(game, 0).state;
    const rolled = choose(tick(s, 5000).state, 'roll', 5000).state;
    // Ein einziger Tick weit in der Zukunft: Bewegung, Feld, Zugende, nächster Zugbeginn.
    const jumped = tick(rolled, 60_000);
    expect(jumped.events.map((e) => e.type)).toEqual([
      'moved',
      'coins-changed',
      'turn-ended',
      'turn-started',
    ]);
    expect(jumped.state.phase).toBe('roll');
    expect(jumped.state.now).toBe(60_000);
    // Gleicher Endzustand wie mit vielen kleinen Ticks.
    let fine = rolled;
    for (let t = 5000; t <= 60_000; t += 100) fine = tick(fine, t).state;
    expect(fine).toEqual(jumped.state);
  });

  it('Minispiel-Phasen und Rundenende mit activeSlot null, dann nächste Runde', () => {
    const game = newGame({ board, ruleSet: rules, players: 2, rounds: 2 });
    let state = start(game, 0).state;
    const phases: string[] = [];
    const events: string[] = [];
    for (let i = 0; i < 200 && state.round < 2; i++) {
      const r = state.prompt ? choose(state, 'roll') : tick(state, state.resumeAt ?? state.now);
      state = r.state;
      phases.push(state.phase);
      events.push(...r.events.map((e) => e.type));
      if (state.phase.startsWith('minigame') || state.phase === 'round-end') {
        expect(state.activeSlot).toBeNull();
      }
    }
    expect(phases).toEqual(
      expect.arrayContaining(['minigame-intro', 'minigame-play', 'minigame-results', 'round-end']),
    );
    const order = ['minigame-started', 'minigame-results', 'round-ended', 'round-started'];
    expect(events.filter((e) => order.includes(e))).toEqual(order);
    expect(state.round).toBe(2);
    expect(state.phase).toBe('turn-start');
  });
});

describe('Minispiel-Platzhalter', () => {
  it('verteilt Münzen laut minigameRewards nach seeded Rangfolge', () => {
    const game = newGame({
      board: loopBoard(['start', 'start', 'start']),
      players: 4,
      rules: { diceFaces: [1], economy: { minigameRewards: [10, 5, 3, 0] } },
    });
    let state = startToRoll(game).state;
    const all = [];
    while (state.phase !== 'game-results') {
      const r = chain(state, (s) => choose(s, 'roll'), settle);
      state = r.state;
      all.push(...r.events);
    }
    const [results] = ofType(all, 'minigame-results');
    expect(results).toBeDefined();
    expect([...(results?.ranking ?? [])].sort()).toEqual([1, 2, 3, 4]);
    const rewards = ofType(all, 'coins-changed').filter((e) => e.reason === 'minigame');
    expect(rewards.map((e) => [e.slot, e.delta])).toEqual([
      [results?.ranking[0], 10],
      [results?.ranking[1], 5],
      [results?.ranking[2], 3],
    ]);
    expect(playerAt(state, results?.ranking[0] ?? 1).coins).toBe(20);
  });
});

describe('Fehler werden abgewiesen, Zustand bleibt unverändert', () => {
  it('time-went-back bei Zeit vor now oder ungültiger Zeit', () => {
    const s = start(newGame(), 500).state;
    expectError(step(s, { type: 'tick', at: 499 }), 'time-went-back', s);
    expectError(step(s, { type: 'tick', at: Number.NaN }), 'time-went-back', s);
    const game = newGame();
    expectError(step(game, { type: 'start', at: -1 }), 'time-went-back', game);
  });

  it('wrong-phase: start außerhalb setup, choose ohne offenen Prompt', () => {
    const s = start(newGame({ ruleSet: DEFAULT_RULES }), 0).state;
    expectError(step(s, { type: 'start', at: 0 }), 'wrong-phase', s);
    expect(s.prompt).toBeNull();
    expectError(
      step(s, { type: 'choose', slot: 1, promptId: 1, option: 'roll', at: 0 }),
      'wrong-phase',
      s,
    );
    const setup = newGame();
    expectError(
      step(setup, { type: 'choose', slot: 1, promptId: 1, option: 'roll', at: 0 }),
      'wrong-phase',
      setup,
    );
  });

  it('not-your-turn, stale-prompt, invalid-option, unknown-player', () => {
    const s = startToRoll(newGame({ players: 2 })).state;
    const prompt = s.prompt;
    if (!prompt) throw new Error('Prompt erwartet');
    const other = prompt.slot === 1 ? 2 : 1;
    const base = { type: 'choose' as const, at: s.now };
    expectError(
      step(s, { ...base, slot: other, promptId: prompt.id, option: 'roll' }),
      'not-your-turn',
      s,
    );
    expectError(
      step(s, { ...base, slot: prompt.slot, promptId: prompt.id + 5, option: 'roll' }),
      'stale-prompt',
      s,
    );
    expectError(
      step(s, { ...base, slot: prompt.slot, promptId: prompt.id, option: 'item:trap' }),
      'invalid-option',
      s,
    );
    expectError(
      step(s, { ...base, slot: prompt.slot, promptId: prompt.id, option: 'quatsch' }),
      'invalid-option',
      s,
    );
    expectError(
      step(s, { ...base, slot: 4, promptId: prompt.id, option: 'roll' }),
      'unknown-player',
      s,
    );
    expectError(
      step(s, { type: 'connection', slot: 3, connected: false, at: s.now }),
      'unknown-player',
      s,
    );
  });

  it('eine alte Prompt-ID nach dem Weiterspielen ist stale-prompt', () => {
    const s = startToRoll(newGame({ ruleSet: DEFAULT_RULES })).state;
    const first = s.prompt;
    if (!first) throw new Error('Prompt erwartet');
    const after = choose(s, 'roll').state;
    expectError(
      step(after, {
        type: 'choose',
        slot: first.slot,
        promptId: first.id,
        option: 'roll',
        at: after.now,
      }),
      'stale-prompt',
      after,
    );
  });
});

describe('Determinismus, Reinheit und Serialisierbarkeit', () => {
  function playScript(seed: number): { states: GameState[]; events: unknown[] } {
    let state = newGame({ seed, players: 3, rounds: 2, ruleSet: DEFAULT_RULES });
    const states: GameState[] = [];
    const events: unknown[] = [];
    const apply = (command: GameCommand): void => {
      const r = run(state, command);
      state = r.state;
      states.push(state);
      events.push(...r.events);
    };
    apply({ type: 'start', at: 0 });
    let t = 0;
    while (state.phase !== 'game-results') {
      t = Math.max(t + 250, state.now);
      const prompt = state.prompt;
      if (prompt && prompt.kind !== 'reaction') {
        const option = scriptedOption(prompt);
        apply({ type: 'choose', slot: prompt.slot, promptId: prompt.id, option, at: t });
      } else {
        apply({ type: 'tick', at: t });
      }
    }
    return { states, events };
  }

  it('gleicher Seed + gleiche Befehle → identische Ereignisse und Zustände', () => {
    const a = playScript(42);
    const b = playScript(42);
    expect(a.events).toEqual(b.events);
    expect(a.states).toEqual(b.states);
  });

  it('anderer Seed → anderer Ablauf', () => {
    expect(playScript(1).events).not.toEqual(playScript(2).events);
  });

  it('verändert den Eingangszustand nie (tief eingefroren)', () => {
    let state = deepFreeze(newGame({ seed: 3, players: 4, rounds: 2 }));
    state = deepFreeze(start(state).state);
    while (state.phase !== 'game-results') {
      const prompt = state.prompt;
      const r = prompt
        ? choose(state, scriptedOption(prompt))
        : tick(state, state.resumeAt ?? state.now + 1000);
      state = deepFreeze(r.state);
    }
    expect(state.ranking).not.toBeNull();
  });

  it('Zustand bleibt JSON-serialisierbar und läuft nach dem Rundweg identisch weiter', () => {
    const { states } = playScript(5);
    for (const state of states) {
      const roundTrip = JSON.parse(JSON.stringify(state)) as GameState;
      expect(roundTrip).toStrictEqual(state);
      expect(cloneStructured(state)).toStrictEqual(state);
    }
    // Weiterspielen aus der JSON-Kopie ergibt dasselbe wie aus dem Original.
    const mid = states[Math.floor(states.length / 2)];
    if (!mid) throw new Error('Zustand erwartet');
    const copy = JSON.parse(JSON.stringify(mid)) as GameState;
    const at = mid.now + 10_000;
    expect(step(copy, { type: 'tick', at })).toEqual(step(mid, { type: 'tick', at }));
  });
});

describe('komplette Partien bis game-results', () => {
  for (const players of [2, 3, 4]) {
    it(`${String(players)} Spieler, Pacing 0`, () => {
      let state = newGame({ players, rounds: 3, seed: 100 + players });
      const all = [];
      const r0 = start(state);
      state = r0.state;
      all.push(...r0.events);
      for (let i = 0; i < 10_000 && state.phase !== 'game-results'; i++) {
        const prompt = state.prompt;
        const r = prompt
          ? choose(state, scriptedOption(prompt))
          : tick(state, state.resumeAt ?? state.now);
        state = r.state;
        all.push(...r.events);
      }
      expect(state.phase).toBe('game-results');
      expect(state.resumeAt).toBeNull();
      expect(state.prompt).toBeNull();
      expect(state.activeSlot).toBeNull();
      expect(state.round).toBe(3);
      expect(ofType(all, 'turn-started')).toHaveLength(players * 3);
      expect(ofType(all, 'round-ended').map((e) => e.round)).toEqual([1, 2, 3]);
      const [ended] = ofType(all, 'game-ended');
      expect(ended?.ranking).toEqual(state.ranking);
      expect(state.ranking).toHaveLength(players);
      for (const p of state.players) expect(p.coins).toBeGreaterThanOrEqual(0);
      // Danach passiert nichts mehr.
      const later = tick(state, state.now + 100_000);
      expect(later.events).toEqual([]);
      expect(later.state.phase).toBe('game-results');
    });

    it(`${String(players)} Spieler, Standard-Pacing mit 100-ms-Ticks`, () => {
      let state = start(
        newGame({ players, rounds: 2, seed: 7 * players, ruleSet: DEFAULT_RULES }),
        0,
      ).state;
      let t = 0;
      let rolls = 0;
      while (state.phase !== 'game-results' && t < 2_000_000) {
        t += 100;
        const prompt = state.prompt;
        if (prompt && prompt.kind !== 'reaction' && prompt.deadline === null) {
          if (prompt.kind === 'roll') rolls++;
          state = choose(state, scriptedOption(prompt), t).state;
        } else {
          state = tick(state, t).state;
        }
      }
      expect(state.phase).toBe('game-results');
      expect(rolls).toBeGreaterThanOrEqual(players * 2);
      expect(state.ranking?.map((r) => r.slot).sort()).toEqual(state.players.map((p) => p.slot));
    });
  }

  it('1 Spieler (Demo) läuft ebenfalls durch', () => {
    const game = newGame({ players: 1, rounds: 2, rules: { pacing: ZERO_PACING } });
    let state = startToRoll(game).state;
    while (state.phase !== 'game-results') {
      state = chain(state, (s) => choose(s, s.prompt?.options[0]?.id ?? 'roll'), settle).state;
    }
    expect(state.ranking).toEqual([
      { slot: 1, place: 1, trophies: state.players[0]?.trophies, coins: state.players[0]?.coins },
    ]);
  });
});
