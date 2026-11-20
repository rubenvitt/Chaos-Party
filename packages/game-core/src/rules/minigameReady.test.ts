/**
 * CHAOS-214: Die Minispiel-Anleitung wartet, bis alle verbundenen Spieler „Bereit“ gedrückt
 * haben; Sicherheitsfrist, Verbindungsverlust und Pause.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, MinigameSpec, Slot } from '../types.ts';
import { withRules, ZERO_PACING } from './defaults.ts';
import { createGame, step } from './machine.ts';
import { loopBoard } from './testBoards.ts';
import { choose, NAMES, start, TEST_RULES, tick } from './testUtils.ts';
import { toPublicView } from './view.ts';

const SPECS: readonly MinigameSpec[] = [{ id: 'flink-flitzer', playMs: 20_000, scoring: 'higher' }];
const TIMEOUT = 30_000;
const MIN = 1_000;

function game(
  options: { timeoutMs?: number; minMs?: number; specs?: readonly MinigameSpec[] } = {},
) {
  const rules = withRules(
    {
      diceFaces: [1],
      pacing: {
        ...ZERO_PACING,
        minigameIntroMs: 2_000,
        minigameReadyTimeoutMs: options.timeoutMs ?? TIMEOUT,
        minigameReadyMinMs: options.minMs ?? MIN,
      },
    },
    TEST_RULES,
  );
  return createGame({
    board: loopBoard(['start', 'start', 'start', 'start']),
    rules,
    rounds: 2,
    seed: 5,
    players: ([1, 2, 3] as const).map((slot) => ({ slot, name: NAMES[slot - 1] ?? 'X' })),
    minigames: options.specs ?? SPECS,
  });
}

function toIntro(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 500 && current.phase !== 'minigame-intro'; i++) {
    current = current.prompt
      ? choose(current, 'roll').state
      : tick(current, current.resumeAt ?? current.now).state;
  }
  expect(current.phase).toBe('minigame-intro');
  return current;
}

/** Bis nach der Mindestdauer: Ab jetzt startet das letzte „Bereit“ sofort. */
function toOpenIntro(state: GameState): GameState {
  const intro = toIntro(state);
  return tick(intro, intro.now + MIN).state;
}

function ready(state: GameState, slot: Slot, at = state.now + 100) {
  return step(state, { type: 'minigame-ready', slot, at });
}

function readyAll(state: GameState, slots: readonly Slot[]): GameState {
  let current = state;
  for (const slot of slots) {
    const result = ready(current, slot);
    expect(result.ok).toBe(true);
    current = result.state;
  }
  return current;
}

describe('Minispiel-Anleitung wartet auf „Bereit“ (CHAOS-214)', () => {
  it('startet erst, wenn alle bereit sind, und genau dann', () => {
    let state = toIntro(start(game(), 0).state);
    expect(state.minigame?.ready).toEqual([]);
    const enteredAt = state.now;
    expect(state.resumeAt).toBe(enteredAt + MIN);
    state = tick(state, enteredAt + MIN).state;
    expect(state.phase).toBe('minigame-intro');
    expect(state.resumeAt).toBe(enteredAt + TIMEOUT);
    state = readyAll(state, [2, 1]);
    expect(state.phase).toBe('minigame-intro');
    expect(state.minigame?.ready).toEqual([1, 2]);
    expect(toPublicView(state).minigame?.ready).toEqual([1, 2]);
    // Längst über die alte feste Anleitungszeit hinaus: wartet weiter.
    state = tick(state, state.now + 10_000).state;
    expect(state.phase).toBe('minigame-intro');
    const last = ready(state, 3, state.now + 50);
    expect(last.ok).toBe(true);
    expect(last.state.phase).toBe('minigame-play');
    expect(last.state.minigame?.playStartedAt).toBe(state.now + 50);
  });

  it('alle früh bereit: startet erst nach der Mindestdauer', () => {
    let state = toIntro(start(game(), 0).state);
    const enteredAt = state.now;
    state = readyAll(state, [1, 2, 3]);
    expect(state.phase).toBe('minigame-intro');
    state = tick(state, enteredAt + MIN - 1).state;
    expect(state.phase).toBe('minigame-intro');
    state = tick(state, enteredAt + MIN).state;
    expect(state.phase).toBe('minigame-play');
    expect(state.minigame?.playStartedAt).toBe(enteredAt + MIN);
  });

  it('Mindestdauer länger als die Frist: die Frist zählt', () => {
    let state = toIntro(start(game({ minMs: 50_000 }), 0).state);
    const enteredAt = state.now;
    expect(state.resumeAt).toBe(enteredAt + TIMEOUT);
    state = tick(state, enteredAt + TIMEOUT).state;
    expect(state.phase).toBe('minigame-play');
  });

  it('doppeltes Bereit ist harmlos, außerhalb der Anleitung abgewiesen', () => {
    let state = toOpenIntro(start(game(), 0).state);
    state = readyAll(state, [1, 1]);
    expect(state.minigame?.ready).toEqual([1]);
    state = readyAll(state, [2, 3]);
    expect(state.phase).toBe('minigame-play');
    const late = ready(state, 1);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe('wrong-phase');
    const unknown = ready(toOpenIntro(start(game(), 0).state), 4);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe('unknown-player');
  });

  it('startet nach der Sicherheitsfrist auch ohne alle', () => {
    let state = toIntro(start(game(), 0).state);
    const enteredAt = state.now;
    state = readyAll(state, [1]);
    state = tick(state, enteredAt + TIMEOUT - 1).state;
    expect(state.phase).toBe('minigame-intro');
    state = tick(state, enteredAt + TIMEOUT).state;
    expect(state.phase).toBe('minigame-play');
    expect(state.minigame?.playStartedAt).toBe(enteredAt + TIMEOUT);
  });

  it('getrennte Spieler zählen als bereit', () => {
    let state = toOpenIntro(start(game(), 0).state);
    state = readyAll(state, [1, 2]);
    const lost = step(state, { type: 'connection', slot: 3, connected: false, at: state.now + 10 });
    expect(lost.ok).toBe(true);
    expect(lost.state.phase).toBe('minigame-play');
  });

  it('niemand verbunden: startet nach der Mindestdauer', () => {
    let state = start(game(), 0).state;
    for (const slot of [1, 2, 3] as const) {
      state = step(state, { type: 'connection', slot, connected: false, at: state.now }).state;
    }
    state = toIntro(state);
    const enteredAt = state.now;
    state = tick(state, enteredAt + MIN).state;
    expect(state.phase).toBe('minigame-play');
  });

  it('wer vor der Anleitung getrennt ist, hält nichts auf; Rückkehr wartet wieder', () => {
    let state = start(game(), 0).state;
    state = step(state, { type: 'connection', slot: 3, connected: false, at: state.now }).state;
    state = toOpenIntro(state);
    state = readyAll(state, [1]);
    // Slot 3 kommt zurück, bevor 2 bereit ist: jetzt muss auch 3 drücken.
    state = step(state, { type: 'connection', slot: 3, connected: true, at: state.now + 10 }).state;
    state = readyAll(state, [2]);
    expect(state.phase).toBe('minigame-intro');
    state = readyAll(state, [3]);
    expect(state.phase).toBe('minigame-play');
  });

  it('Pause friert das Warten ein, Bereit erst nach dem Fortsetzen', () => {
    let state = toOpenIntro(start(game(), 0).state);
    const enteredAt = state.now;
    state = readyAll(state, [1, 2]);
    state = step(state, { type: 'pause', at: state.now + 100 }).state;
    const paused = ready(state, 3);
    expect(paused.ok).toBe(false);
    if (!paused.ok) expect(paused.error.code).toBe('paused');
    // Pause länger als die Sicherheitsfrist: keine Frist läuft ab.
    state = tick(state, enteredAt + TIMEOUT * 2).state;
    expect(state.phase).toBe('minigame-intro');
    state = step(state, { type: 'resume', at: state.now }).state;
    expect(state.phase).toBe('minigame-intro');
    state = readyAll(state, [3]);
    expect(state.phase).toBe('minigame-play');
  });

  it('getrennt während der Pause: startet beim Fortsetzen', () => {
    let state = toOpenIntro(start(game(), 0).state);
    state = readyAll(state, [1, 2]);
    state = step(state, { type: 'pause', at: state.now + 100 }).state;
    state = step(state, {
      type: 'connection',
      slot: 3,
      connected: false,
      at: state.now + 10,
    }).state;
    expect(state.phase).toBe('minigame-intro');
    state = step(state, { type: 'resume', at: state.now + 10 }).state;
    expect(state.phase).toBe('minigame-play');
  });

  it('ohne Sicherheitsfrist (0) bleibt die feste Anleitungszeit', () => {
    let state = toIntro(start(game({ timeoutMs: 0 }), 0).state);
    expect(state.minigame?.ready).toBeUndefined();
    expect(toPublicView(state).minigame).not.toHaveProperty('ready');
    expect(state.resumeAt).toBe(state.now + 2_000);
    expect(ready(state, 1).ok).toBe(false);
    state = tick(state, state.now + 2_000).state;
    expect(state.phase).toBe('minigame-play');
  });

  it('der Platzhalter ohne Steckbrief wartet nicht', () => {
    const state = toIntro(start(game({ specs: [] }), 0).state);
    expect(state.minigame?.ready).toBeUndefined();
  });
});
