/**
 * Hilfen für die Regel-Tests: Partie anlegen, Befehle anwenden (mit Prüfung auf `ok`),
 * Zustand gezielt präparieren. Nur für Tests gedacht.
 */
import type {
  BoardDefinition,
  GameCommand,
  GameEvent,
  GameState,
  PlayerState,
  Prompt,
  RuleSet,
  Slot,
  StepResult,
} from '../types.ts';
import { withRules, ZERO_PACING, type RuleOverrides } from './defaults.ts';
import { createGame, step } from './machine.ts';
import { TEST_BOARD } from './testBoards.ts';

export interface Run {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export interface NewGameOptions {
  readonly board?: BoardDefinition;
  /** Abweichungen von den Standardregeln; Pacing ist ohne Angabe 0. */
  readonly rules?: RuleOverrides;
  /** Volles Regelwerk (hat Vorrang vor `rules`). */
  readonly ruleSet?: RuleSet;
  readonly players?: number;
  readonly rounds?: number;
  readonly seed?: number;
}

export const NAMES = ['Rot', 'Blau', 'Grün', 'Gelb'] as const;

export function newGame(options: NewGameOptions = {}): GameState {
  const count = options.players ?? 2;
  const rules =
    options.ruleSet ??
    withRules({
      ...options.rules,
      pacing: { ...ZERO_PACING, ...options.rules?.pacing },
    });
  return createGame({
    board: options.board ?? TEST_BOARD,
    rules,
    rounds: options.rounds ?? 1,
    seed: options.seed ?? 1,
    players: ([1, 2, 3, 4] as const)
      .slice(0, count)
      .map((slot) => ({ slot, name: NAMES[slot - 1] ?? 'X' })),
  });
}

export function expectOk(result: StepResult): Run {
  if (!result.ok) {
    throw new Error(`Befehl abgewiesen: ${result.error.code} (${result.error.message})`);
  }
  return { state: result.state, events: result.events };
}

export function run(state: GameState, command: GameCommand): Run {
  return expectOk(step(state, command));
}

export function start(state: GameState, at = 0): Run {
  return run(state, { type: 'start', at });
}

export function tick(state: GameState, at: number): Run {
  return run(state, { type: 'tick', at });
}

/** Aktuellen Prompt mit `option` beantworten (vom richtigen Slot). */
export function choose(state: GameState, option: string, at: number = state.now): Run {
  const prompt = state.prompt;
  if (!prompt) throw new Error(`Kein Prompt offen (Phase ${state.phase})`);
  return run(state, { type: 'choose', slot: prompt.slot, promptId: prompt.id, option, at });
}

/** Mehrere Schritte nacheinander; Ereignisse werden gesammelt. */
export function chain(state: GameState, ...steps: ((s: GameState) => Run)[]): Run {
  let current = state;
  const events: GameEvent[] = [];
  for (const fn of steps) {
    const next = fn(current);
    current = next.state;
    events.push(...next.events);
  }
  return { state: current, events };
}

/** So lange zum nächsten `resumeAt` ticken, bis ein Prompt offen ist oder die Partie endet. */
export function settle(state: GameState): Run {
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < 10_000 && current.prompt === null && current.resumeAt !== null; i++) {
    const next = tick(current, current.resumeAt);
    current = next.state;
    events.push(...next.events);
  }
  return { state: current, events };
}

/** Spieler gezielt ändern (Testaufbau). */
export function patchPlayer(
  state: GameState,
  slot: Slot,
  patch: Partial<Omit<PlayerState, 'slot'>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.slot === slot ? { ...p, ...patch } : p)),
  };
}

export function patchState(state: GameState, patch: Partial<GameState>): GameState {
  return { ...state, ...patch };
}

export function playerAt(state: GameState, slot: Slot): PlayerState {
  const player = state.players.find((p) => p.slot === slot);
  if (!player) throw new Error(`Spieler ${String(slot)} fehlt`);
  return player;
}

export function activeSlot(state: GameState): Slot {
  if (state.activeSlot === null) throw new Error('Niemand am Zug');
  return state.activeSlot;
}

export function ofType<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/**
 * Feste Test-Strategie ohne Schleifen: im Würfel-Prompt die letzte Option (Items zuerst),
 * beim Ziel den ersten Spieler, beim Weg den letzten, Trophäe kaufen, „Festhalten!“.
 */
export function scriptedOption(prompt: Prompt): string {
  const ids = prompt.options.map((o) => o.id);
  const first = ids[0] ?? prompt.defaultOption;
  const last = ids[ids.length - 1] ?? prompt.defaultOption;
  switch (prompt.kind) {
    case 'roll':
    case 'path':
    case 'reaction':
      return last;
    case 'target':
    case 'trophy':
      return first;
  }
}

/** Bis zum ersten Würfel-Prompt (Pacing 0: direkt nach `start`). */
export function startToRoll(state: GameState): Run {
  return chain(state, (s) => start(s), settle);
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
