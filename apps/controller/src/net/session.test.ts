import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createError, createMessage } from '@chaos-party/protocol';
import { selectLink, selectScreen } from '../state/reducer.ts';
import { fakeSocketFactory, type FakeSocket } from './fakeSocket.test-util.ts';
import { CLOSE_REPLACED, createControllerSession } from './session.ts';
import { createMemoryTokenStore } from './tokenStore.ts';
import type { WakeReason } from './wake.ts';

const TOKEN = 'tok_ABCDEFGHIJKLMNOP';
const welcome = createMessage('welcome', {
  sessionToken: TOKEN,
  players: [{ slot: 1, color: '#0072B2', label: 'Blau' }],
});

function setup() {
  const { factory, sockets } = fakeSocketFactory();
  const tokens = createMemoryTokenStore();
  const warn = vi.fn();
  let wakeListener: ((reason: WakeReason) => void) | null = null;
  const session = createControllerSession({
    url: 'ws://pc:8787/ws',
    seats: 1,
    tokens,
    createSocket: factory,
    heartbeatMs: 1000,
    // Jitter-Mitte: Wartezeiten genau 0,5 s, 1 s, 2 s, 4 s, 5 s.
    random: () => 0.5,
    wake: (listener) => {
      wakeListener = listener;
      return () => {
        wakeListener = null;
      };
    },
    now: () => Date.now(),
    warn,
  });
  const socket = (i: number): FakeSocket => {
    const s = sockets[i];
    if (!s) throw new Error(`Socket ${String(i)} fehlt`);
    return s;
  };
  const last = () => socket(sockets.length - 1);
  const wake = (reason: WakeReason = 'visible') => {
    wakeListener?.(reason);
  };
  const hasWakeListener = () => wakeListener !== null;
  /** Beitreten und `welcome` erhalten. */
  const joined = () => {
    session.join('ABCD');
    last().open();
    last().receive(welcome);
  };
  return { session, sockets, socket, last, tokens, warn, wake, hasWakeListener, joined };
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
    expect(selectLink(session.getState())).toEqual({ kind: 'online', rttMs: null });
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

  it('falscher Code → Code-Eingabe, kein automatischer Versuch, neuer Code verbindet neu', () => {
    const { session, sockets, socket } = setup();
    session.join('ZZZZ');
    socket(0).open();
    socket(0).receive(createError('bad-join-code', 'gibt es nicht'));
    expect(socket(0).closedByClient).toBe(true);
    expect(selectScreen(session.getState())).toBe('code-entry');
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
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

  it('Verbindungsverlust → Controller bleibt, Overlay, automatisch neu mit Token; seq beginnt neu', () => {
    const { session, sockets, socket } = setup();
    session.join('ABCD');
    socket(0).open();
    socket(0).receive(welcome);
    session.sendIntent({ type: 'ready', slot: 1 });
    socket(0).drop();
    const lost = session.getState();
    expect(lost.fatal).toBeNull();
    expect(selectScreen(lost)).toBe('controller');
    expect(selectLink(lost)).toEqual({ kind: 'reconnecting', attempt: 1, hadSession: true });
    expect(session.sendIntent({ type: 'ready', slot: 1 })).toBe(false);

    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    // Vor dem `welcome` der neuen Verbindung gehen keine Eingaben raus.
    socket(1).open();
    expect(session.sendIntent({ type: 'press', slot: 1, button: 'a' })).toBe(false);
    expect(socket(1).sentMessages()).toEqual([{ v: 1, type: 'reconnect', sessionToken: TOKEN }]);
    socket(1).receive(welcome);
    expect(selectLink(session.getState())).toEqual({ kind: 'online', rttMs: null });
    session.sendIntent({ type: 'press', slot: 1, button: 'a' });
    expect(socket(1).sentMessages()[1]).toMatchObject({ type: 'press', seq: 1 });
    // Kein Herzschlag mehr auf der toten Verbindung.
    expect(
      socket(0)
        .sentMessages()
        .filter((m) => m.type === 'heartbeat'),
    ).toHaveLength(0);
  });

  it('wartet mit Backoff 0,5 s, 1 s, 2 s, 4 s, dann alle 5 s und zählt die Versuche', () => {
    const { session, sockets, socket, last, joined } = setup();
    joined();
    socket(0).drop();
    const waits = [500, 1000, 2000, 4000, 5000, 5000, 5000];
    waits.forEach((wait, index) => {
      expect(selectLink(session.getState())).toMatchObject({ attempt: index + 1 });
      vi.advanceTimersByTime(wait - 1);
      expect(sockets).toHaveLength(index + 1);
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(index + 2);
      // PC nicht erreichbar: Der Versuch scheitert, bevor der Socket offen ist.
      socket(index + 1).drop();
    });
    vi.advanceTimersByTime(5000);
    last().open();
    last().receive(welcome);
    expect(session.getState().attempt).toBe(0);
    // Der nächste Verlust beginnt wieder bei 0,5 s.
    last().drop();
    const before = sockets.length;
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(before + 1);
  });

  it('erkennt eine stille Verbindung nach 10 s ohne Server-Nachricht', () => {
    const { session, sockets, socket, joined } = setup();
    joined();
    // Mit Antworten auf die Herzschläge bleibt die Verbindung stehen.
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(1000);
      socket(0).receive(createMessage('heartbeat-ack', { t: Date.now() }));
    }
    expect(sockets).toHaveLength(1);
    expect(socket(0).closedByClient).toBe(false);
    // Server schweigt (WLAN weg, ohne Close): nach 10 s abbrechen und neu verbinden.
    vi.advanceTimersByTime(9999);
    expect(socket(0).closedByClient).toBe(false);
    vi.advanceTimersByTime(1);
    expect(socket(0).closedByClient).toBe(true);
    expect(selectLink(session.getState())).toMatchObject({ kind: 'reconnecting', attempt: 1 });
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
  });

  it('bricht einen hängenden Verbindungsaufbau nach 5 s ab', () => {
    const { session, sockets, socket } = setup();
    session.join('ABCD');
    vi.advanceTimersByTime(4999);
    expect(socket(0).closedByClient).toBe(false);
    vi.advanceTimersByTime(1);
    expect(socket(0).closedByClient).toBe(true);
    // Noch nie beigetreten: „PC nicht erreichbar“ über dem Verbinden-Bildschirm.
    expect(selectScreen(session.getState())).toBe('connecting');
    expect(selectLink(session.getState())).toEqual({
      kind: 'reconnecting',
      attempt: 1,
      hadSession: false,
    });
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
  });

  it('Aufwachen mit offener Verbindung: Herzschlag als Probe, ohne Antwort in 2 s neu verbinden', () => {
    const { session, sockets, socket, wake, joined } = setup();
    joined();
    wake('visible');
    expect(socket(0).sentMessages().at(-1)).toMatchObject({ type: 'heartbeat' });
    socket(0).receive(createMessage('heartbeat-ack', { t: Date.now() }));
    vi.advanceTimersByTime(2000);
    expect(socket(0).closedByClient).toBe(false);

    wake('online');
    vi.advanceTimersByTime(1999);
    expect(socket(0).closedByClient).toBe(false);
    vi.advanceTimersByTime(1);
    expect(socket(0).closedByClient).toBe(true);
    expect(selectLink(session.getState())).toMatchObject({ kind: 'reconnecting' });
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
  });

  it('Aufwachen während der Wartezeit verbindet sofort', () => {
    const { sockets, socket, wake, joined } = setup();
    joined();
    socket(0).drop();
    vi.advanceTimersByTime(400);
    wake('pageshow');
    expect(sockets).toHaveLength(2);
    // Der geplante Versuch entfällt.
    vi.advanceTimersByTime(4000);
    expect(sockets).toHaveLength(2);
  });

  it('„Jetzt neu verbinden“ bricht die Wartezeit ab', () => {
    const { session, sockets, socket, joined } = setup();
    joined();
    socket(0).drop();
    session.retry();
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(4000);
    expect(sockets).toHaveLength(2);
  });

  it('übernommener Platz (4003) → kein automatisches Zurückdrängeln; retry holt ihn zurück', () => {
    const { session, sockets, socket, wake, joined } = setup();
    joined();
    socket(0).drop(CLOSE_REPLACED);
    expect(session.getState().fatal).toBe('replaced');
    expect(selectScreen(session.getState())).toBe('error');
    vi.advanceTimersByTime(60_000);
    wake('visible');
    expect(sockets).toHaveLength(1);
    session.retry();
    expect(sockets).toHaveLength(2);
    socket(1).open();
    expect(socket(1).sentMessages()[0]).toMatchObject({ type: 'reconnect' });
  });

  it('abgelaufenes Token im laufenden Spiel → Neubeitritt abgelehnt → game-running', () => {
    const { session, sockets, socket, tokens } = setup();
    tokens.save('ABCD', TOKEN);
    session.join('ABCD');
    socket(0).open();
    socket(0).receive(createError('bad-token', 'abgelaufen'));
    socket(1).open();
    expect(socket(1).sentMessages()[0]).toMatchObject({ type: 'join' });
    socket(1).receive(createError('out-of-phase', 'Beitreten nur in der Lobby'));
    expect(session.getState().fatal).toBe('game-running');
    expect(socket(1).closedByClient).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
  });

  it('Spiel voll → aufgeben statt endlos versuchen; retry versucht es erneut', () => {
    const { session, sockets, socket } = setup();
    session.join('ABCD');
    socket(0).open();
    socket(0).receive(createError('session-full', 'voll'));
    expect(session.getState().fatal).toBe('session-full');
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    session.retry();
    expect(sockets).toHaveLength(2);
  });

  it('meldet einen Hinweis-Fehler nach dem Beitritt weiterhin als Toast', () => {
    const { session, socket, joined } = setup();
    joined();
    socket(0).receive(createError('out-of-phase', 'gerade nicht', 4));
    expect(session.getState().notice?.code).toBe('out-of-phase');
    expect(session.getState().fatal).toBeNull();
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

  it('dispose schließt die Verbindung, stoppt Versuche und meldet die Aufwach-Signale ab', () => {
    const { session, sockets, socket, hasWakeListener } = setup();
    session.join('ABCD');
    socket(0).open();
    expect(hasWakeListener()).toBe(true);
    session.dispose();
    expect(socket(0).closedByClient).toBe(true);
    expect(session.getState().fatal).toBeNull();
    expect(hasWakeListener()).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });
});
