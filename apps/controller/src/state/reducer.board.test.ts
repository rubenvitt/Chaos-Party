import { describe, expect, it } from 'vitest';
import {
  createError,
  createMessage,
  type ControllerBoardInfo,
  type PromptInfo,
  type ServerToControllerMessage,
} from '@chaos-party/protocol';
import {
  createInitialState,
  reduce,
  type ControllerEvent,
  type ControllerState,
} from './reducer.ts';

/** Brettphase im Reducer (CHAOS-22): Prompt, Stand, Countdown-Zeit, Sperre nach dem Senden. */

const TOKEN = 'tok_ABCDEFGHIJKLMNOP';

function server(message: ServerToControllerMessage, receivedAt = 0): ControllerEvent {
  return { type: 'server', message, receivedAt };
}

function run(events: ControllerEvent[], start: ControllerState) {
  return events.reduce(reduce, start);
}

const joined = run(
  [
    { type: 'connect', joinCode: 'ABCD' },
    { type: 'socket-open' },
    server(
      createMessage('welcome', {
        sessionToken: TOKEN,
        players: [
          { slot: 1, color: '#0072B2', label: 'Blau' },
          { slot: 2, color: '#E69F00', label: 'Orange' },
        ],
      }),
    ),
  ],
  createInitialState(),
);

const board: ControllerBoardInfo = {
  gamePhase: 'choose-path',
  round: 1,
  rounds: 5,
  coins: 4,
  trophies: 0,
  items: ['trap'],
  activeSlot: 1,
  paused: false,
  character: 'robot',
  minigameWins: 0,
};

function prompt(id: number, remainingMs: number | null = null, slot: 1 | 2 = 1): PromptInfo {
  return {
    id,
    slot,
    kind: 'path',
    title: 'Welcher Weg?',
    options: [
      { id: 's1', label: 'Links' },
      { id: 's2', label: 'Rechts' },
    ],
    remainingMs,
  };
}

function boardContext(slot: 1 | 2, p?: PromptInfo, info: ControllerBoardInfo = board) {
  return createMessage('context', {
    slot,
    phase: 'board',
    layout: 'board',
    actions: p ? ['choose'] : [],
    board: info,
    ...(p && { prompt: p }),
  });
}

const sent = (slot: 1 | 2, promptId: number, option: string): ControllerEvent => ({
  type: 'choice-sent',
  slot,
  promptId,
  option,
});

describe('reduce – Brettphase', () => {
  it('übernimmt prompt (mit lokaler Frist) und board je Slot', () => {
    const state = reduce(joined, server(boardContext(1, prompt(3, 5000)), 1000));
    const ctx = state.contexts[1];
    expect(ctx?.layout).toBe('board');
    expect(ctx?.board).toEqual(board);
    expect(ctx?.prompt).toEqual({ info: prompt(3, 5000), deadlineAt: 6000, totalMs: 5000 });
    expect(state.contexts[2]).toBeUndefined();
  });

  it('ein neuer Kontext ersetzt den alten vollständig (auch prompt/board)', () => {
    const withPrompt = reduce(joined, server(boardContext(1, prompt(3))));
    const waiting = reduce(withPrompt, server(boardContext(1)));
    expect(waiting.contexts[1]?.prompt).toBeUndefined();
    const lobby = reduce(
      waiting,
      server(createMessage('context', { slot: 1, phase: 'lobby', layout: 'lobby', actions: [] })),
    );
    expect(lobby.contexts[1]).toEqual({ phase: 'lobby', layout: 'lobby', actions: [] });
  });

  it('gleicher Prompt erneut: volle Balkenlänge bleibt, Frist neu', () => {
    const first = reduce(joined, server(boardContext(1, prompt(3, 3000)), 0));
    const again = reduce(first, server(boardContext(1, prompt(3, 1000)), 2000));
    expect(again.contexts[1]?.prompt).toMatchObject({ deadlineAt: 3000, totalMs: 3000 });
  });

  it('Wahl gesendet → gesperrt; derselbe Prompt hält die Sperre, ein neuer löst sie', () => {
    const open = reduce(joined, server(boardContext(1, prompt(3))));
    const locked = reduce(open, sent(1, 3, 's2'));
    expect(locked.choices[1]).toEqual({ promptId: 3, option: 's2' });

    const resent = reduce(locked, server(boardContext(1, prompt(3), { ...board, coins: 9 })));
    expect(resent.choices[1]).toEqual({ promptId: 3, option: 's2' });

    const next = reduce(resent, server(boardContext(1, prompt(4))));
    expect(next.choices[1]).toBeUndefined();
    const none = reduce(resent, server(boardContext(1)));
    expect(none.choices[1]).toBeUndefined();
  });

  it('Sperre nur für den angezeigten Prompt und nur für den eigenen Slot', () => {
    const open = run(
      [server(boardContext(1, prompt(3))), server(boardContext(2, prompt(8, null, 2)))],
      joined,
    );
    expect(reduce(open, sent(1, 2, 's1'))).toBe(open);
    expect(reduce(joined, sent(1, 3, 's1'))).toBe(joined);
    const locked = reduce(open, sent(2, 8, 's1'));
    expect(locked.choices).toEqual({ 2: { promptId: 8, option: 's1' } });
    // Kontext für Slot 1 lässt die Sperre von Slot 2 in Ruhe.
    expect(reduce(locked, server(boardContext(1, prompt(5)))).choices[2]).toBeDefined();
  });

  it('invalid-choice: Hinweis und alle Sperren gelöst', () => {
    const locked = run([server(boardContext(1, prompt(3))), sent(1, 3, 's1')], joined);
    const rejected = reduce(locked, server(createError('invalid-choice', 'zu spät', 7)));
    expect(rejected.notice?.code).toBe('invalid-choice');
    expect(rejected.choices).toEqual({});
    // Andere Hinweise lassen die Sperre stehen.
    const limited = reduce(locked, server(createError('rate-limited', 'langsam')));
    expect(limited.choices[1]).toBeDefined();
  });

  it('Verbindungsverlust und neues welcome lösen Sperren (Wahl kam evtl. nie an)', () => {
    const locked = run([server(boardContext(1, prompt(3))), sent(1, 3, 's1')], joined);
    expect(reduce(locked, { type: 'socket-closed' }).choices).toEqual({});
    expect(
      reduce(
        locked,
        server(
          createMessage('welcome', {
            sessionToken: TOKEN,
            players: [{ slot: 1, color: '#0072B2', label: 'Blau' }],
          }),
        ),
      ).choices,
    ).toEqual({});
  });
});
