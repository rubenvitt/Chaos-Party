import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createError, createMessage, PROTOCOL_VERSION } from '@chaos-party/protocol';
import { fakeSocketFactory, type FakeSocket } from './fakeSocket.test-util.ts';
import { createControllerSession } from './session.ts';
import { createMemoryTokenStore } from './tokenStore.ts';

/** Wahl in der Brettphase (CHAOS-22): `choose` mit steigender `seq`, Sperre in der Sitzung. */

const TOKEN = 'tok_ABCDEFGHIJKLMNOP';

function setup() {
  const { factory, sockets } = fakeSocketFactory();
  const session = createControllerSession({
    url: 'ws://pc:8787/ws',
    seats: 2,
    tokens: createMemoryTokenStore(),
    createSocket: factory,
    heartbeatMs: 60_000,
    random: () => 0.5,
    wake: null,
    now: () => 1000,
    warn: vi.fn(),
  });
  session.join('ABCD');
  const socket = (): FakeSocket => {
    const s = sockets.at(-1);
    if (!s) throw new Error('kein Socket');
    return s;
  };
  socket().open();
  socket().receive(
    createMessage('welcome', {
      sessionToken: TOKEN,
      players: [
        { slot: 1, color: '#0072B2', label: 'Blau' },
        { slot: 2, color: '#E69F00', label: 'Orange' },
      ],
    }),
  );
  return { session, socket };
}

function promptContext(slot: 1 | 2, id: number) {
  return createMessage('context', {
    slot,
    phase: 'board',
    layout: 'board',
    actions: ['choose'],
    prompt: {
      id,
      slot,
      kind: 'roll',
      title: 'Du bist dran!',
      options: [{ id: 'roll', label: 'Würfeln!' }],
      remainingMs: 4000,
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Sitzung – choose', () => {
  it('sendet choose mit steigender seq über alle Slots und sperrt den Prompt', () => {
    const { session, socket } = setup();
    socket().receive(promptContext(1, 4));
    socket().receive(promptContext(2, 9));

    expect(session.sendIntent({ type: 'choose', slot: 1, promptId: 4, option: 'roll' })).toBe(true);
    expect(session.sendIntent({ type: 'press', slot: 2, button: 'a' })).toBe(true);
    expect(session.sendIntent({ type: 'choose', slot: 2, promptId: 9, option: 'roll' })).toBe(true);

    const chooses = socket()
      .sentMessages()
      .filter((m) => m.type !== 'join');
    expect(chooses).toEqual([
      { v: PROTOCOL_VERSION, type: 'choose', slot: 1, seq: 1, promptId: 4, option: 'roll' },
      { v: PROTOCOL_VERSION, type: 'press', slot: 2, seq: 2, button: 'a' },
      { v: PROTOCOL_VERSION, type: 'choose', slot: 2, seq: 3, promptId: 9, option: 'roll' },
    ]);
    expect(session.getState().choices).toEqual({
      1: { promptId: 4, option: 'roll' },
      2: { promptId: 9, option: 'roll' },
    });
  });

  it('zweite Wahl für denselben Prompt wird nicht gesendet; nach invalid-choice wieder', () => {
    const { session, socket } = setup();
    socket().receive(promptContext(1, 4));
    const choose = { type: 'choose', slot: 1, promptId: 4, option: 'roll' } as const;

    expect(session.sendIntent(choose)).toBe(true);
    expect(session.sendIntent(choose)).toBe(false);
    expect(
      socket()
        .sentMessages()
        .filter((m) => m.type === 'choose'),
    ).toHaveLength(1);

    socket().receive(createError('invalid-choice', 'zu spät', 1));
    expect(session.getState().choices).toEqual({});
    expect(session.getState().notice?.code).toBe('invalid-choice');
    expect(session.sendIntent(choose)).toBe(true);
    const seqs = socket()
      .sentMessages()
      .filter((m) => m.type === 'choose')
      .map((m) => m.seq);
    expect(seqs).toEqual([1, 2]);
  });

  it('ohne Verbindung wird nichts gesperrt', () => {
    const { session, socket } = setup();
    socket().receive(promptContext(1, 4));
    socket().drop(1001);
    expect(session.sendIntent({ type: 'choose', slot: 1, promptId: 4, option: 'roll' })).toBe(
      false,
    );
    expect(session.getState().choices).toEqual({});
    session.dispose();
  });
});
