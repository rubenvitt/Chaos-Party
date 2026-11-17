import { describe, expect, it } from 'vitest';
import type { GameState, MinigamePlacement, MinigameSpec, StepResult } from '../types.ts';
import { withRules, ZERO_PACING } from './defaults.ts';
import { createGame, step } from './machine.ts';
import {
  DEFAULT_MINIGAME_RESULT_GRACE_MS,
  minigameIntroMs,
  PLACEHOLDER_MINIGAME,
} from './minigame.ts';
import { loopBoard } from './testBoards.ts';
import { choose, NAMES, ofType, playerAt, run, start, TEST_RULES, tick } from './testUtils.ts';
import { toPublicView } from './view.ts';

const SPECS: readonly MinigameSpec[] = [
  { id: 'flink-flitzer', playMs: 20_000, scoring: 'higher' },
  { id: 'wackel-floss', playMs: 30_000, scoring: 'higher' },
  { id: 'zeit-zocker', playMs: 25_000, scoring: 'lower' },
];

const INTRO = 2_000;
const REPEAT_INTRO = 800;
const RESULTS = 3_000;

function game(
  options: {
    players?: number;
    rounds?: number;
    seed?: number;
    specs?: readonly MinigameSpec[];
  } = {},
) {
  const rules = withRules(
    {
      diceFaces: [1],
      economy: { minigameRewards: [10, 5, 3, 0] },
      pacing: {
        ...ZERO_PACING,
        minigameIntroMs: INTRO,
        minigameRepeatIntroMs: REPEAT_INTRO,
        minigameResultsMs: RESULTS,
      },
    },
    TEST_RULES,
  );
  return createGame({
    board: loopBoard(['start', 'start', 'start', 'start']),
    rules,
    rounds: options.rounds ?? 1,
    seed: options.seed ?? 3,
    players: ([1, 2, 3, 4] as const)
      .slice(0, options.players ?? 3)
      .map((slot) => ({ slot, name: NAMES[slot - 1] ?? 'X' })),
    minigames: options.specs ?? SPECS,
  });
}

/** Würfeln und Zeit laufen lassen, bis die Phase erreicht ist. */
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

function result(
  state: GameState,
  placements: MinigamePlacement[],
  at = state.now + 1_000,
): StepResult {
  const minigame = state.minigame;
  if (!minigame) throw new Error('kein Minispiel');
  return step(state, {
    type: 'minigame-result',
    minigameId: minigame.id,
    round: minigame.round,
    placements,
    highlights: ['Blau war blitzschnell'],
    at,
  });
}

describe('Minispiele in den Regeln (M3)', () => {
  it('zieht je Runde ein Minispiel per Seed, ohne Wiederholung bis alle dran waren', () => {
    let state = start(game({ rounds: 6, players: 2 }), 0).state;
    const played: string[] = [];
    for (let round = 1; round <= 6; round++) {
      state = driveTo(state, 'minigame-intro');
      played.push(state.minigame?.id ?? '?');
      state = driveTo(state, 'minigame-play');
      const ids = state.minigame?.id ?? '';
      const lower = ids === 'zeit-zocker';
      state = run(state, {
        type: 'minigame-result',
        minigameId: ids,
        round: state.minigame?.round ?? 0,
        placements: [
          { slot: 1, place: 1, score: lower ? 1 : 9 },
          { slot: 2, place: 2, score: lower ? 9 : 1 },
        ],
        at: state.now + 500,
      }).state;
    }
    expect(new Set(played.slice(0, 3)).size).toBe(3);
    expect(new Set(played.slice(3, 6)).size).toBe(3);
    expect(played[3]).not.toBe(played[2]);
    // Gleicher Seed → gleiche Reihenfolge.
    let again = start(game({ rounds: 6, players: 2 }), 0).state;
    again = driveTo(again, 'minigame-intro');
    expect(again.minigame?.id).toBe(played[0]);
  });

  it('zeigt bei Wiederholung in der Partie die kurze Anleitung (CHAOS-66)', () => {
    let state = start(game({ rounds: 6, players: 2 }), 0).state;
    const seen: { id: string; repeat: boolean; introMs: number }[] = [];
    for (let round = 1; round <= 6; round++) {
      state = driveTo(state, 'minigame-intro');
      const minigame = state.minigame;
      if (!minigame) throw new Error('kein Minispiel');
      seen.push({
        id: minigame.id,
        repeat: minigame.repeat,
        introMs: (state.resumeAt ?? 0) - state.now,
      });
      expect(toPublicView(state).minigame?.repeat).toBe(minigame.repeat);
      state = driveTo(state, 'minigame-play');
      state = run(state, {
        type: 'minigame-result',
        minigameId: minigame.id,
        round: minigame.round,
        placements: [
          { slot: 1, place: 1, score: 5 },
          { slot: 2, place: 2, score: minigame.id === 'zeit-zocker' ? 9 : 1 },
        ],
        at: state.now + 500,
      }).state;
    }
    // Runden 1–3: jedes Minispiel zum ersten Mal, volle Anleitung; danach nur Wiederholungen.
    expect(seen.map((s) => s.repeat)).toEqual([false, false, false, true, true, true]);
    expect(seen.map((s) => s.introMs)).toEqual([
      INTRO,
      INTRO,
      INTRO,
      REPEAT_INTRO,
      REPEAT_INTRO,
      REPEAT_INTRO,
    ]);
    for (const entry of seen.slice(3)) {
      expect(seen.slice(0, 3).some((first) => first.id === entry.id)).toBe(true);
    }
  });

  it('ohne `minigameRepeatIntroMs` bleibt es bei der vollen Anleitung', () => {
    const pacing = { ...ZERO_PACING, minigameIntroMs: INTRO };
    delete (pacing as { minigameRepeatIntroMs?: number }).minigameRepeatIntroMs;
    expect(minigameIntroMs(pacing, true)).toBe(INTRO);
    expect(minigameIntroMs({ ...pacing, minigameRepeatIntroMs: 500 }, true)).toBe(500);
    expect(minigameIntroMs({ ...pacing, minigameRepeatIntroMs: 500 }, false)).toBe(INTRO);
  });

  it('übernimmt ein gültiges Ergebnis mit Gleichstand: gleicher Platz, gleiche Münzen', () => {
    let state = start(game(), 0).state;
    state = driveTo(state, 'minigame-intro');
    const minigame = state.minigame;
    expect(minigame?.playStartedAt).toBeNull();
    expect(toPublicView(state).minigame?.elapsedMs).toBeNull();
    state = driveTo(state, 'minigame-play');
    expect(toPublicView(state, state.now + 1234).minigame?.elapsedMs).toBe(1234);
    const coins = ([1, 2, 3] as const).map((slot) => playerAt(state, slot).coins);
    const lower = state.minigame?.id === 'zeit-zocker';
    const r = result(state, [
      { slot: 2, place: 1, score: lower ? 3 : 7 },
      { slot: 1, place: 1, score: lower ? 3 : 7 },
      { slot: 3, place: 3, score: lower ? 8 : 2 },
    ]);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.state.phase).toBe('minigame-results');
    const [event] = ofType(r.events, 'minigame-results');
    expect(event?.ranking).toEqual([1, 2, 3]);
    expect(event?.aborted).toBe(false);
    expect(r.state.minigame?.highlights).toEqual(['Blau war blitzschnell']);
    expect(playerAt(r.state, 1).coins - (coins[0] ?? 0)).toBe(10);
    expect(playerAt(r.state, 2).coins - (coins[1] ?? 0)).toBe(10);
    expect(playerAt(r.state, 3).coins - (coins[2] ?? 0)).toBe(3);
    // Ergebnisanzeige läuft, dann weiter (eine Runde → Endstand).
    expect(tick(r.state, r.state.now + RESULTS - 1).state.phase).toBe('minigame-results');
    expect(tick(r.state, r.state.now + RESULTS).state.phase).toBe('game-results');
  });

  it('weist falsche Ergebnisse ab und lässt den Zustand unverändert', () => {
    let state = start(game(), 0).state;
    state = driveTo(state, 'minigame-intro');
    const early = result(state, [
      { slot: 1, place: 1, score: 1 },
      { slot: 2, place: 1, score: 1 },
      { slot: 3, place: 1, score: 1 },
    ]);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe('wrong-phase');
    state = driveTo(state, 'minigame-play');
    const at = state.now + 10;
    const cases: StepResult[] = [
      // Slot fehlt
      result(
        state,
        [
          { slot: 1, place: 1, score: 1 },
          { slot: 2, place: 2, score: 0 },
        ],
        at,
      ),
      // Platzlücke
      result(
        state,
        [
          { slot: 1, place: 1, score: 3 },
          { slot: 2, place: 3, score: 2 },
          { slot: 3, place: 3, score: 2 },
        ],
        at,
      ),
      // falsche Runde
      step(state, {
        type: 'minigame-result',
        minigameId: state.minigame?.id ?? '',
        round: 99,
        placements: [],
        at,
      }),
      // falsches Minispiel
      step(state, {
        type: 'minigame-result',
        minigameId: 'gibts-nicht',
        round: state.minigame?.round ?? 0,
        placements: [
          { slot: 1, place: 1, score: 1 },
          { slot: 2, place: 1, score: 1 },
          { slot: 3, place: 1, score: 1 },
        ],
        at,
      }),
    ];
    for (const r of cases) {
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('invalid-result');
        expect(r.state).toBe(state);
      }
    }
  });

  it('bricht nach Spielzeit + Schonfrist ohne Ergebnis ab: keine Münzen, weiter im Ablauf', () => {
    let state = start(game(), 0).state;
    state = driveTo(state, 'minigame-play');
    const playMs = state.minigame?.playMs ?? 0;
    const startedAt = state.minigame?.playStartedAt ?? 0;
    const coins = playerAt(state, 1).coins;
    const before = tick(state, startedAt + playMs + DEFAULT_MINIGAME_RESULT_GRACE_MS - 1);
    expect(before.state.phase).toBe('minigame-play');
    const after = tick(state, startedAt + playMs + DEFAULT_MINIGAME_RESULT_GRACE_MS);
    expect(after.state.phase).toBe('minigame-results');
    expect(after.state.minigame?.aborted).toBe(true);
    const [event] = ofType(after.events, 'minigame-results');
    expect(event).toEqual({ type: 'minigame-results', ranking: [], placements: [], aborted: true });
    expect(playerAt(after.state, 1).coins).toBe(coins);
    // Zu spät gemeldetes Ergebnis wird abgewiesen.
    const late = result(after.state, [
      { slot: 1, place: 1, score: 1 },
      { slot: 2, place: 1, score: 1 },
      { slot: 3, place: 1, score: 1 },
    ]);
    expect(late.ok).toBe(false);
  });

  it('ohne konfigurierte Minispiele bleibt der Platzhalter aus M2', () => {
    let state = start(game({ specs: [] }), 0).state;
    state = driveTo(state, 'minigame-intro');
    expect(state.minigame?.id).toBe(PLACEHOLDER_MINIGAME);
    expect(state.minigame?.repeat).toBe(false);
    state = driveTo(state, 'minigame-results');
    expect(state.minigame?.placements?.length).toBe(3);
  });

  it('lehnt doppelte oder ungültige Minispiel-IDs in der Konfiguration ab', () => {
    expect(() => game({ specs: [...SPECS.slice(0, 1), ...SPECS.slice(0, 1)] })).toThrow();
    expect(() => game({ specs: [{ id: 'X', playMs: 5000, scoring: 'higher' }] })).toThrow();
  });
});
