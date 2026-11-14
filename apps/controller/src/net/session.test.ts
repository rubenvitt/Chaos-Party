import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createError, createMessage } from '@chaos-party/protocol';
import { selectScreen } from '../state/reducer.ts';
import { fakeSocketFactory, type FakeSocket } from './fakeSocket.test-util.ts';
import { createControllerSession } from './session.ts';
import { createMemoryTokenStore } from './tokenStore.ts';

const TOKEN = 'tok_ABCDEFGHIJKLMNOP';
const welcome = createMessage('welcome', {
  sessionToken: TOKEN,
  players: [{ slot: 1, color: '#0072B2', label: 'Blau' }],
});

function setup() {
  const { factory, sockets } = fakeSocketFactory();
  const tokens = createMemoryTokenStore();
  const warn = vi.fn();
  const session = createControllerSession({
    url: 'ws://pc:8787/ws',
    seats: 1,
    tokens,
    createSocket: factory,
    heartbeatMs: 1000,
    now: () => Date.now(),
    warn,
  });
  const socket = (i: number): FakeSocket => {
    const s = sockets[i];
    if (!s) throw new Error(`Socket ${String(i)} fehlt`);
    return s;
  };
  return { session, sockets, socket, tokens, warn };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createControllerSession', () => {
  it('tritt mit join { joinCode, seats } bei und merkt sich das Token', () => {
    const { session, socket, tokens } = setup();
    const listener = vi.fn();
    session.subscribe(listener);
    session.join('ABCD');
    expect(socket(0).url).toBe('ws://pc:8787/ws');
    socket(0).open();
    expect(socket(0).sentMessages()).toEqual([{ v: 1, type: 'join', joinCode: 'ABCD', seats: 1 }]);

    socket(0).receive(welcome);
    expect(tokens.load('ABCD')).toBe(TOKEN);
    expect(selectScreen(session.getState())).toBe('controller');
    expect(listener).toHaveBeenCalled();
  });

  it('nutzt ein gemerktes Token für reconnect', () => {
    const { session, socket, tokens } = setup();
    tokens.save('ABCD', TOKEN);
    session.join('ABCD');
    socket(0).open();
    expect(socket(0).sentMessages()).toEqual([{ v: 1, type: 'reconnect', sessionToken: TOKEN }]);
  });

  it('ignoriert ein Token eines anderen Codes', () => {
    const { session, socket, tokens } = setup();
    tokens.save('WXYZ', TOKEN);
    session.join('ABCD');
    socket(0).open();
    expect(socket(0).sentMessages()[0]?.type).toBe('join');
  });

  it('bad-token → Token vergessen und auf neuer Verbindung neu beitreten', () => {
    const { session, sockets, socket, tokens } = setup();
    tokens.save('ABCD', TOKEN);
    session.join('ABCD');
    socket(0).open();
    socket(0).receive(createError('bad-token', 'unbekannt'));
    expect(socket(0).closedByClient).toBe(true);
    expect(tokens.load('ABCD')).toBeNull();
    expect(sockets).toHaveLength(2);
    socket(1).open();
    expect(socket(1).sentMessages()[0]).toMatchObject({ type: 'join', joinCode: 'ABCD' });
    expect(selectScreen(session.getState())).toBe('connecting');
  });

  it('falscher Code → Code-Eingabe, Verbindung zu, neuer Code verbindet neu', () => {
    const { session, sockets, socket } = setup();
    session.join('ZZZZ');
    socket(0).open();
    socket(0).receive(createError('bad-join-code', 'gibt es nicht'));
    expect(socket(0).closedByClient).toBe(true);
    expect(selectScreen(session.getState())).toBe('code-entry');
    session.join('ABCD');
    expect(sockets).toHaveLength(2);
  });

  it('sendet Eingaben mit seq und Herzschläge im Takt', () => {
    const { session, socket } = setup();
    session.join('ABCD');
    socket(0).open();
    socket(0).receive(welcome);
    expect(session.sendIntent({ type: 'ready', slot: 1 })).toBe(true);
    vi.advanceTimersByTime(2500);
    const types = socket(0)
      .sentMessages()
      .map((m) => m.type);
    expect(types).toEqual(['join', 'ready', 'heartbeat', 'heartbeat']);
    expect(socket(0).sentMessages()[1]).toEqual({ v: 1, type: 'ready', slot: 1, seq: 1 });
  });

  it('Verbindungsverlust → Fehlerseite; retry verbindet mit Token neu und beginnt seq neu', () => {
    const { session, sockets, socket } = setup();
    session.join('ABCD');
    socket(0).open();
    socket(0).receive(welcome);
    session.sendIntent({ type: 'ready', slot: 1 });
    socket(0).drop();
    expect(session.getState().fatal).toBe('connection-lost');
    expect(session.sendIntent({ type: 'ready', slot: 1 })).toBe(false);
    // Kein Herzschlag mehr auf der toten Verbindung.
    vi.advanceTimersByTime(5000);
    expect(
      socket(0)
        .sentMessages()
        .filter((m) => m.type === 'heartbeat'),
    ).toHaveLength(0);

    session.retry();
    expect(sockets).toHaveLength(2);
    socket(1).open();
    expect(socket(1).sentMessages()[0]).toEqual({ v: 1, type: 'reconnect', sessionToken: TOKEN });
    socket(1).receive(welcome);
    session.sendIntent({ type: 'press', slot: 1, button: 'a' });
    expect(socket(1).sentMessages()[1]).toMatchObject({ type: 'press', seq: 1 });
  });

  it('verwirft ungültige Nachrichten mit Warnung, Zustand bleibt', () => {
    const { session, socket, warn } = setup();
    session.join('ABCD');
    socket(0).open();
    const before = session.getState();
    socket(0).receive({ v: 1, type: 'welcome', sessionToken: 'kurz', players: [] });
    expect(warn).toHaveBeenCalledOnce();
    expect(session.getState()).toBe(before);
  });

  it('dispose schließt die Verbindung ohne Fehlerseite', () => {
    const { session, socket } = setup();
    session.join('ABCD');
    socket(0).open();
    session.dispose();
    expect(socket(0).closedByClient).toBe(true);
    expect(session.getState().fatal).toBeNull();
  });
});
