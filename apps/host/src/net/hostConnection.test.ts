import { createMessage, encode } from '@chaos-party/protocol';
import { describe, expect, it, vi } from 'vitest';
import {
  CLOSE_HOST_TAKEN,
  connectHost,
  type ConnectionStatus,
  type HostConnectionHandlers,
  type SocketLike,
} from './hostConnection.ts';

class FakeSocket implements SocketLike {
  readyState = 0;
  readonly sent: string[] = [];
  closedWith: number | undefined;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
  }
  // Steuerung durch den Test
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(data: unknown) {
    this.onmessage?.({ data });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const LOBBY = createMessage('lobby', {
  joinCode: 'AB12',
  joinUrl: 'http://192.168.0.2:8787/?code=AB12',
  phase: 'lobby',
  players: [{ slot: 1, color: '#0072B2', label: 'Blau', connected: true, ready: false }],
});

function setup(handlers: HostConnectionHandlers = {}) {
  const sockets: FakeSocket[] = [];
  const timers: { cb: () => void; ms: number; cleared: boolean }[] = [];
  const statuses: ConnectionStatus[] = [];
  const warnings: string[] = [];
  const connection = connectHost(
    'ws://pc:8787/ws',
    {
      onStatus: (s) => statuses.push(s),
      ...handlers,
    },
    {
      createSocket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      setTimer: (cb, ms) => {
        const timer = { cb, ms, cleared: false };
        timers.push(timer);
        return timer;
      },
      clearTimer: (handle) => {
        (handle as { cleared: boolean }).cleared = true;
      },
      warn: (message) => warnings.push(message),
    },
  );
  const last = () => {
    const socket = sockets.at(-1);
    if (!socket) throw new Error('kein Socket');
    return socket;
  };
  const fireTimers = () => {
    for (const timer of timers.splice(0)) if (!timer.cleared) timer.cb();
  };
  return { connection, sockets, timers, statuses, warnings, last, fireTimers };
}

describe('connectHost', () => {
  it('meldet sich mit host-hello an und gilt mit der ersten Lobby als verbunden', () => {
    const onLobby = vi.fn();
    const t = setup({ onLobby });
    expect(t.connection.status).toBe('connecting');
    t.last().open();
    expect(t.last().sent).toEqual([encode(createMessage('host-hello', {}))]);
    expect(t.connection.status).toBe('connecting');
    t.last().receive(encode(LOBBY));
    expect(t.connection.status).toBe('connected');
    expect(onLobby).toHaveBeenCalledWith(LOBBY);
    expect(t.statuses).toEqual(['connected']);
  });

  it('reicht geprüfte Eingaben und Fehler weiter', () => {
    const onInput = vi.fn();
    const onServerError = vi.fn();
    const t = setup({ onInput, onServerError });
    t.last().open();
    const intent = { type: 'move', slot: 2, seq: 4, x: 0.5, y: 0 } as const;
    t.last().receive(encode(createMessage('input', { intent, at: 1234 })));
    expect(onInput).toHaveBeenCalledWith(intent, 1234);
    t.last().receive(encode(createMessage('error', { code: 'out-of-phase', message: 'nein' })));
    expect(onServerError).toHaveBeenCalledOnce();
  });

  it('ignoriert ungültige und binäre Nachrichten mit Warnung', () => {
    const onInput = vi.fn();
    const t = setup({ onInput });
    t.last().open();
    t.last().receive('{"v":1,"type":"input","intent":{"type":"move","slot":9}}');
    t.last().receive(new ArrayBuffer(4));
    t.last().receive(encode(createMessage('feedback', { slot: 1, kind: 'hit' })));
    expect(onInput).not.toHaveBeenCalled();
    expect(t.warnings).toHaveLength(2);
  });

  it('versucht es nach einer Trennung alle 2 s erneut', () => {
    const t = setup();
    t.last().open();
    t.last().receive(encode(LOBBY));
    t.last().drop();
    expect(t.connection.status).toBe('disconnected');
    expect(t.timers).toHaveLength(1);
    expect(t.timers[0]?.ms).toBe(2000);
    t.fireTimers();
    expect(t.sockets).toHaveLength(2);
    // Server weiterhin weg: nächster Versuch wird geplant, Status bleibt getrennt.
    t.last().drop();
    expect(t.timers).toHaveLength(1);
    t.fireTimers();
    t.last().open();
    t.last().receive(encode(LOBBY));
    expect(t.connection.status).toBe('connected');
    expect(t.statuses).toEqual(['connected', 'disconnected', 'connected']);
  });

  it('erkennt einen bereits verbundenen anderen Host (4002) und wartet', () => {
    const t = setup();
    t.last().open();
    t.last().drop(CLOSE_HOST_TAKEN);
    expect(t.connection.status).toBe('host-taken');
    expect(t.timers).toHaveLength(1);
  });

  it('sendet start nur, wenn verbunden', () => {
    const t = setup();
    expect(t.connection.sendStart()).toBe(false);
    t.last().open();
    expect(t.connection.sendStart()).toBe(false);
    t.last().receive(encode(LOBBY));
    expect(t.connection.sendStart()).toBe(true);
    expect(t.last().sent.at(-1)).toBe(encode(createMessage('start', {})));
  });

  it('close() trennt endgültig ohne neuen Versuch', () => {
    const t = setup();
    t.last().open();
    t.last().drop();
    t.connection.close();
    expect(t.timers[0]?.cleared).toBe(true);
    t.fireTimers();
    expect(t.sockets).toHaveLength(1);

    const u = setup();
    u.last().open();
    u.connection.close();
    expect(u.last().closedWith).toBe(1000);
    u.last().drop();
    expect(u.timers).toHaveLength(0);
  });

  it('schließt einen Socket im Aufbau erst nach dem Öffnen (keine Browser-Fehlermeldung)', () => {
    const t = setup();
    const socket = t.last();
    t.connection.close();
    expect(socket.closedWith).toBeUndefined();
    socket.open();
    expect(socket.closedWith).toBe(1000);
    expect(socket.sent).toEqual([]);
  });

  it('plant einen neuen Versuch, wenn schon das Anlegen des Sockets scheitert', () => {
    const timers: (() => void)[] = [];
    let attempts = 0;
    const connection = connectHost(
      'ws://pc/ws',
      {},
      {
        createSocket: () => {
          attempts++;
          throw new Error('kaputt');
        },
        setTimer: (cb) => timers.push(cb),
        warn: () => undefined,
      },
    );
    expect(attempts).toBe(1);
    expect(timers).toHaveLength(1);
    connection.close();
  });
});
