import { describe, expect, it } from 'vitest';
import { INPUT_INTENT_TYPES, isInputIntentType, isIntentAllowed } from './phase.ts';
import type { ClientMessageType, Phase } from './types.ts';

/** Erwartete Matrix: Nachrichtentyp → erlaubt in [lobby, play]. */
const MATRIX: Record<ClientMessageType, [lobby: boolean, play: boolean]> = {
  join: [true, false],
  reconnect: [true, true],
  ready: [true, false],
  move: [false, true],
  press: [false, true],
  release: [false, true],
  gesture: [false, true],
  reaction: [false, true],
  heartbeat: [true, true],
  'host-hello': [true, true],
  start: [true, false],
};

const PHASE_INDEX: Record<Phase, 0 | 1> = { lobby: 0, play: 1 };

describe('isIntentAllowed', () => {
  const cases = Object.entries(MATRIX).flatMap(([type, allowed]) =>
    (Object.keys(PHASE_INDEX) as Phase[]).map(
      (phase) => [phase, type as ClientMessageType, allowed[PHASE_INDEX[phase]]] as const,
    ),
  );

  it.each(cases)('%s / %s → %s', (phase, type, expected) => {
    expect(isIntentAllowed(phase, type)).toBe(expected);
  });
});

describe('isInputIntentType', () => {
  it('erkennt genau die weitergeleiteten Spieleingaben', () => {
    expect(INPUT_INTENT_TYPES).toEqual(['move', 'press', 'release', 'gesture', 'reaction']);
    for (const type of INPUT_INTENT_TYPES) {
      expect(isInputIntentType(type)).toBe(true);
      expect(isIntentAllowed('play', type)).toBe(true);
      expect(isIntentAllowed('lobby', type)).toBe(false);
    }
    for (const type of ['join', 'ready', 'heartbeat', 'start', 'toString', '__proto__']) {
      expect(isInputIntentType(type)).toBe(false);
    }
  });
});
