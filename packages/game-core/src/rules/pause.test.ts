/**
 * M4 (CHAOS-36/37, ADR-014): Pause, Fortsetzen, vorzeitiges Ende, Minispiel-Siege,
 * Belohnungen je Slot und Statistik.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, MinigameSpec, Slot } from '../types.ts';
import { withRules, ZERO_PACING } from './defaults.ts';
import { createGame, step } from './machine.ts';
import { DEFAULT_MINIGAME_RESULT_GRACE_MS } from './minigame.ts';
import { loopBoard } from './testBoards.ts';
import {
  choose,
  newGame,
  NAMES,
  ofType,
  run,
  scriptedOption,
  start,
  TEST_RULES,
  tick,
  type Run,
} from './testUtils.ts';
import { toPublicView } from './view.ts';

const SPEC: MinigameSpec = { id: 'flink-flitzer', playMs: 20_000, scoring: 'higher' };
const INTRO = 2_000;
const RESULTS = 3_000;
const PAUSE = 100_000;

function minigameGame(players = 3, rounds = 1): GameState {
  return createGame({
    board: loopBoard(['start', 'start', 'start', 'start']),
    rules: withRules(
      {
        diceFaces: [1],
        economy: { minigameRewards: [10, 5, 3, 0] },
        pacing: { ...ZERO_PACING, minigameIntroMs: INTRO, minigameResultsMs: RESULTS },
      },
      TEST_RULES,
    ),
    rounds,
    seed: 3,
    players: ([1, 2, 3, 4] as const)
      .slice(0, players)
      .map((slot) => ({ slot, name: NAMES[slot - 1] ?? 'X' })),
    minigames: [SPEC],
  });
}

function driveTo(state: GameState, phase: GameState['phase']): GameState {
  let current = state;
  for (let i = 0; i < 500 && current.phase !== phase; i++) {
    current = current.prompt
      ? choose(current, 'roll').state
      : tick(current, current.resumeAt ?? current.now).state;
  }
  if (current.phase !== phase) throw new Error(`Phase ${phase} nicht erreicht (${current.phase})`);
  return current;
}

function pause(state: GameState, at: number): Run {
  return run(state, { type: 'pause', at });
}

function resume(state: GameState, at: number): Run {
  return run(state, { type: 'resume', at });
}

describe('Pause (M4)', () => {
  it('friert automatische Phasen ein und verschiebt resumeAt beim Fortsetzen', () => {
    const s0 = start(newGame({ ruleSet: TEST_RULES }), 1_000).state;
    expect(s0.phase).toBe('turn-start');
    const due = s0.resumeAt ?? 0;
    const paused = pause(s0, 1_500);
    expect(paused.events).toEqual([]);
    expect(paused.state).toMatchObject({ paused: true, pausedAt: 1_500 });
    // Lange Pause: nichts passiert, Restzeit steht.
    const later = tick(paused.state, 1_500 + PAUSE);
    expect(later.events).toEqual([]);
    expect(later.state.phase).toBe('turn-start');
    expect(toPublicView(later.state).remainingMs).toBe(due - 1_500);
    const resumed = resume(later.state, 1_500 + PAUSE);
    expect(resumed.state).toMatchObject({ paused: false, pausedAt: null, resumeAt: due + PAUSE });
    expect(toPublicView(resumed.state).remainingMs).toBe(due - 1_500);
    expect(tick(resumed.state, due + PAUSE - 1).state.phase).toBe('turn-start');
    expect(tick(resumed.state, due + PAUSE).state.phase).toBe('roll');
  });

  it('friert Prompt-Fristen ein (getrennter Spieler: Schonfrist läuft erst nach der Pause weiter)', () => {
    let s = start(newGame({ ruleSet: TEST_RULES }), 0).state;
    s = tick(s, s.resumeAt ?? 0).state;
    const slot = s.prompt?.slot ?? 1;
    s = run(s, { type: 'connection', slot, connected: false, at: s.now }).state;
    const deadline = s.prompt?.deadline ?? 0;
    expect(deadline).toBe(s.now + TEST_RULES.pacing.disconnectGraceMs);
    const pausedAt = s.now + 5_000;
    s = pause(s, pausedAt).state;
    // Weit über die Frist hinaus (Frist liegt 10 s nach Pausenbeginn).
    const frozen = tick(s, pausedAt + PAUSE - 1);
    expect(ofType(frozen.events, 'player-auto')).toEqual([]);
    expect(toPublicView(frozen.state).prompt?.remainingMs).toBe(deadline - pausedAt);
    s = resume(frozen.state, pausedAt + PAUSE).state;
    expect(s.prompt?.deadline).toBe(deadline + PAUSE);
    expect(ofType(tick(s, deadline + PAUSE - 1).events, 'player-auto')).toEqual([]);
    const auto = tick(s, deadline + PAUSE);
    expect(ofType(auto.events, 'player-auto')).toEqual([
      { type: 'player-auto', slot, option: 'roll', reason: 'disconnected' },
    ]);
  });

  it('Trennung während der Pause: Schonfrist zählt ab Pausenbeginn und wird verschoben', () => {
    let s = start(newGame({ ruleSet: TEST_RULES }), 0).state;
    s = tick(s, s.resumeAt ?? 0).state;
    const slot = s.prompt?.slot ?? 1;
    const pausedAt = s.now + 1_000;
    s = pause(s, pausedAt).state;
    s = run(s, { type: 'connection', slot, connected: false, at: pausedAt + 50_000 }).state;
    expect(s.prompt?.deadline).toBe(pausedAt + TEST_RULES.pacing.disconnectGraceMs);
    s = resume(s, pausedAt + PAUSE).state;
    expect(s.prompt?.deadline).toBe(pausedAt + PAUSE + TEST_RULES.pacing.disconnectGraceMs);
  });

  it('friert Minispiel-Spielzeit und Schonfrist ein; Abbruch erst nach Pausendauer', () => {
    const play = driveTo(start(minigameGame(), 0).state, 'minigame-play');
    const playStart = play.minigame?.playStartedAt ?? 0;
    const expiry = playStart + SPEC.playMs + DEFAULT_MINIGAME_RESULT_GRACE_MS;
    expect(play.resumeAt).toBe(expiry);
    let s = pause(play, playStart + 5_000).state;
    s = tick(s, playStart + 5_000 + PAUSE - 1).state; // weit über Spielzeit + Schonfrist
    expect(s.phase).toBe('minigame-play');
    expect(toPublicView(s).minigame?.elapsedMs).toBe(5_000);
    s = resume(s, playStart + 5_000 + PAUSE).state;
    expect(s.minigame?.playStartedAt).toBe(playStart + PAUSE);
    expect(toPublicView(s).minigame?.elapsedMs).toBe(5_000);
    expect(tick(s, expiry + PAUSE - 1).state.phase).toBe('minigame-play');
    const expired = tick(s, expiry + PAUSE);
    expect(expired.state.phase).toBe('minigame-results');
    expect(expired.state.minigame).toMatchObject({ aborted: true, rewards: [] });
  });

  it('nimmt ein Minispiel-Ergebnis in der Pause an; die Ergebnisanzeige läuft erst danach', () => {
    const play = driveTo(start(minigameGame(2), 0).state, 'minigame-play');
    const pausedAt = (play.minigame?.playStartedAt ?? 0) + SPEC.playMs;
    let s = pause(play, pausedAt).state;
    const accepted = run(s, {
      type: 'minigame-result',
      minigameId: SPEC.id,
      round: 1,
      placements: [
        { slot: 1, place: 1, score: 5 },
        { slot: 2, place: 2, score: 1 },
      ],
      at: pausedAt + 1_000,
    });
    s = accepted.state;
    expect(s.phase).toBe('minigame-results');
    expect(s.paused).toBe(true);
    expect(s.resumeAt).toBe(pausedAt + RESULTS);
    s = tick(s, pausedAt + PAUSE).state;
    expect(s.phase).toBe('minigame-results');
    s = resume(s, pausedAt + PAUSE).state;
    expect(s.resumeAt).toBe(pausedAt + PAUSE + RESULTS);
  });

  it('weist choose in der Pause, doppelte Pause und Fortsetzen ohne Pause ab', () => {
    const s0 = start(newGame({ ruleSet: TEST_RULES }), 0).state;
    const atRoll = tick(s0, s0.resumeAt ?? 0).state;
    const prompt = atRoll.prompt;
    if (!prompt) throw new Error('kein Prompt');
    const paused = pause(atRoll, atRoll.now).state;
    const chosen = step(paused, {
      type: 'choose',
      slot: prompt.slot,
      promptId: prompt.id,
      option: 'roll',
      at: paused.now + 10,
    });
    expect(chosen.ok ? null : chosen.error.code).toBe('paused');
    const again = step(paused, { type: 'pause', at: paused.now });
    expect(again.ok ? null : again.error.code).toBe('paused');
    const notPaused = step(atRoll, { type: 'resume', at: atRoll.now });
    expect(notPaused.ok ? null : notPaused.error.code).toBe('not-paused');
    // Nach dem Fortsetzen gilt derselbe Prompt weiter.
    const resumed = resume(paused, paused.now + 1_000).state;
    expect(choose(resumed, 'roll').events.some((e) => e.type === 'dice-rolled')).toBe(true);
  });

  it('Pause nur während der Partie (nicht in setup, nicht nach dem Endstand)', () => {
    const setup = newGame();
    const before = step(setup, { type: 'pause', at: 0 });
    expect(before.ok ? null : before.error.code).toBe('wrong-phase');
    const ended = run(start(newGame()).state, { type: 'end', at: 10 }).state;
    const after = step(ended, { type: 'pause', at: 20 });
    expect(after.ok ? null : after.error.code).toBe('wrong-phase');
  });

  it('Pause ändert den Ablauf nicht: gleiche Ereignisse wie ohne Pause (Determinismus)', () => {
    const play = (withPause: boolean) => {
      let s = start(newGame({ ruleSet: TEST_RULES, players: 3, rounds: 2, seed: 99 }), 0).state;
      const kinds: string[] = [];
      let offset = 0;
      for (let i = 0; i < 5_000 && s.phase !== 'game-results'; i++) {
        if (withPause && i === 7) {
          s = pause(s, s.now).state;
          s = resume(s, s.now + 60_000).state;
          offset += 60_000;
        }
        const next = s.prompt
          ? choose(s, scriptedOption(s.prompt))
          : tick(s, s.resumeAt ?? s.now + 100);
        s = next.state;
        kinds.push(...next.events.map((e) => JSON.stringify({ ...e, deadline: undefined })));
      }
      return { kinds, ranking: s.ranking, end: s.now - offset };
    };
    const plain = play(false);
    const paused = play(true);
    expect(paused.kinds).toEqual(plain.kinds);
    expect(paused.ranking).toEqual(plain.ranking);
    expect(paused.end).toBe(plain.end);
  });
});

describe('Vorzeitiges Ende (M4)', () => {
  it('springt nach game-results mit Endstand aus dem aktuellen Stand und endedEarly', () => {
    let s = start(newGame({ ruleSet: TEST_RULES, players: 3, rounds: 5 }), 0).state;
    s = tick(s, s.resumeAt ?? 0).state;
    const ended = run(s, { type: 'end', at: s.now + 10 });
    expect(ended.state).toMatchObject({
      phase: 'game-results',
      endedEarly: true,
      prompt: null,
      resumeAt: null,
      activeSlot: null,
      paused: false,
    });
    expect(ended.state.round).toBe(1);
    const [event] = ofType(ended.events, 'game-ended');
    expect(event?.endedEarly).toBe(true);
    expect(event?.ranking).toEqual(ended.state.ranking);
    expect(ended.state.ranking).toHaveLength(3);
    expect(toPublicView(ended.state).endedEarly).toBe(true);
    // Danach läuft keine Zeit mehr, ein zweites Ende ist falsch.
    expect(tick(ended.state, 1_000_000).events).toEqual([]);
    const again = step(ended.state, { type: 'end', at: 1_000_000 });
    expect(again.ok ? null : again.error.code).toBe('wrong-phase');
  });

  it('beendet auch eine pausierte Partie und ein laufendes Minispiel (ohne Münzen)', () => {
    const play = driveTo(start(minigameGame(2), 0).state, 'minigame-play');
    const coins = play.players.map((p) => p.coins);
    const paused = pause(play, play.now + 1_000).state;
    const ended = run(paused, { type: 'end', at: paused.now + 5_000 });
    expect(ended.state).toMatchObject({ phase: 'game-results', paused: false, minigame: null });
    expect(ended.state.players.map((p) => p.coins)).toEqual(coins);
    expect(ofType(ended.events, 'coins-changed')).toEqual([]);
  });

  it('normales Ende hat endedEarly: false', () => {
    let s = start(newGame({ players: 2, rounds: 1, rules: { pacing: ZERO_PACING } })).state;
    for (let i = 0; i < 1_000 && s.phase !== 'game-results'; i++) {
      s = s.prompt ? choose(s, scriptedOption(s.prompt)).state : tick(s, s.resumeAt ?? s.now).state;
    }
    expect(s).toMatchObject({ phase: 'game-results', endedEarly: false });
  });

  it('end in setup ist falsch', () => {
    const result = step(newGame(), { type: 'end', at: 0 });
    expect(result.ok ? null : result.error.code).toBe('wrong-phase');
  });
});

describe('Minispiel-Siege, Belohnungen und Statistik (M4)', () => {
  function finish(placements: { slot: Slot; place: number; score: number }[], players = 3) {
    const play = driveTo(start(minigameGame(players), 0).state, 'minigame-play');
    return run(play, {
      type: 'minigame-result',
      minigameId: SPEC.id,
      round: 1,
      placements,
      at: play.now + 1_000,
    });
  }

  it('zählt 1. Plätze als Siege (Gleichstand für alle) und speichert die Belohnung je Slot', () => {
    const result = finish([
      { slot: 2, place: 1, score: 9 },
      { slot: 3, place: 1, score: 9 },
      { slot: 1, place: 3, score: 2 },
    ]);
    const wins = result.state.players.map((p) => [p.slot, p.minigameWins]);
    expect(wins).toEqual([
      [1, 0],
      [2, 1],
      [3, 1],
    ]);
    expect(result.state.minigame?.rewards).toEqual([
      { slot: 2, coins: 10 },
      { slot: 3, coins: 10 },
      { slot: 1, coins: 3 },
    ]);
    expect(toPublicView(result.state).minigame?.rewards).toEqual(result.state.minigame?.rewards);
    expect(toPublicView(result.state).players.map((p) => p.minigameWins)).toEqual([0, 1, 1]);
  });

  it('rewards ist null vor dem Ergebnis und leer bei Abbruch', () => {
    const play = driveTo(start(minigameGame(), 0).state, 'minigame-play');
    expect(play.minigame?.rewards).toBeNull();
    const expired = tick(play, play.resumeAt ?? 0).state;
    expect(expired.minigame?.rewards).toEqual([]);
    expect(expired.players.every((p) => p.minigameWins === 0)).toBe(true);
  });

  it('Siege entscheiden den Endstand bei Gleichstand in Trophäen und Münzen', () => {
    // Startmünzen gleich, Belohnungen für Platz 1 und 2 gleich → Münzen gleich, Siege entscheiden.
    const rules = withRules(
      {
        diceFaces: [1],
        economy: { minigameRewards: [0, 0, 0, 0] },
        pacing: { ...ZERO_PACING, minigameIntroMs: INTRO, minigameResultsMs: RESULTS },
      },
      TEST_RULES,
    );
    let s = start(
      createGame({
        board: loopBoard(['start', 'start', 'start', 'start']),
        rules,
        rounds: 1,
        seed: 3,
        players: [
          { slot: 1, name: 'Rot' },
          { slot: 2, name: 'Blau' },
        ],
        minigames: [SPEC],
      }),
      0,
    ).state;
    s = driveTo(s, 'minigame-play');
    s = run(s, {
      type: 'minigame-result',
      minigameId: SPEC.id,
      round: 1,
      placements: [
        { slot: 2, place: 1, score: 4 },
        { slot: 1, place: 2, score: 1 },
      ],
      at: s.now + 10,
    }).state;
    s = driveTo(s, 'game-results');
    expect(s.ranking).toEqual([
      {
        slot: 2,
        place: 1,
        trophies: 0,
        coins: s.players[1]?.coins,
        minigameWins: 1,
        decidedBy: 'minigame-wins',
      },
      {
        slot: 1,
        place: 2,
        trophies: 0,
        coins: s.players[0]?.coins,
        minigameWins: 0,
        decidedBy: 'minigame-wins',
      },
    ]);
  });

  it('zählt Statistik aus den Ereignissen (Münzen, Felder, Items)', () => {
    let s = start(newGame({ ruleSet: TEST_RULES, players: 3, rounds: 3, seed: 5 }), 0).state;
    const events = [];
    for (let i = 0; i < 5_000 && s.phase !== 'game-results'; i++) {
      const next = s.prompt
        ? choose(s, scriptedOption(s.prompt))
        : tick(s, s.resumeAt ?? s.now + 100);
      s = next.state;
      events.push(...next.events);
    }
    for (const player of s.players) {
      const changes = ofType(events, 'coins-changed').filter((e) => e.slot === player.slot);
      expect(player.stats.coinsEarned).toBe(
        changes.filter((e) => e.delta > 0).reduce((sum, e) => sum + e.delta, 0),
      );
      expect(player.stats.coinsLost).toBe(
        changes.filter((e) => e.delta < 0).reduce((sum, e) => sum - e.delta, 0),
      );
      expect(player.stats.spacesMoved).toBe(
        ofType(events, 'moved')
          .filter((e) => e.slot === player.slot)
          .reduce((sum, e) => sum + e.path.length, 0),
      );
      expect(player.stats.itemsUsed).toBe(
        ofType(events, 'item-used').filter((e) => e.slot === player.slot).length,
      );
      expect(player.coins).toBe(
        TEST_RULES.economy.startCoins + player.stats.coinsEarned - player.stats.coinsLost,
      );
    }
    expect(s.players.some((p) => p.stats.spacesMoved > 0)).toBe(true);
  });
});
