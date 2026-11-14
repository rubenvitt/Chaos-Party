import { describe, expect, it } from 'vitest';
import {
  createMessage,
  parseControllerMessage,
  type ProtocolError,
  type ServerToControllerMessage,
} from '@chaos-party/protocol';
import { controllerSocketUrl, createClient, type ClientHandlers } from './client.ts';
import { fakeSocketFactory } from './fakeSocket.test-util.ts';

/** Handler, die jeden Aufruf mitschreiben. */
function handlers() {
  const calls = {
    open: 0,
    messages: [] as ServerToControllerMessage[],
    closes: [] as { code: number; wasOpen: boolean }[],
    invalid: [] as ProtocolError[],
  };
  const h: ClientHandlers = {
    onOpen: () => {
      calls.open += 1;
    },
    onMessage: (message) => {
      calls.messages.push(message);
    },
    onClose: (info) => {
      calls.closes.push(info);
    },
    onInvalid: (error) => {
      calls.invalid.push(error);
    },
  };
  return { h, calls };
}

describe('controllerSocketUrl', () => {
  it('nutzt denselben Ursprung und /ws', () => {
    expect(controllerSocketUrl({ protocol: 'http:', host: '192.168.1.20:8787' })).toBe(
      'ws://192.168.1.20:8787/ws',
    );
    expect(controllerSocketUrl({ protocol: 'https:', host: 'pc.local' })).toBe('wss://pc.local/ws');
  });
});

describe('createClient', () => {
  it('vergibt streng steigende seq über alle Slots und sendet gültige Nachrichten', () => {
    const { factory, sockets } = fakeSocketFactory();
    const { h, calls } = handlers();
    const client = createClient('ws://x/ws', h, factory);
    const socket = sockets[0];
    if (!socket) throw new Error('kein Socket');

    expect(client.sendIntent({ type: 'ready', slot: 1 })).toBe(false); // noch nicht offen
    socket.open();
    expect(calls.open).toBe(1);

    client.sendIntent({ type: 'ready', slot: 1 });
    client.sendIntent({ type: 'move', slot: 2, x: 0.5, y: -0.5 });
    client.sendIntent({ type: 'press', slot: 1, button: 'a' });
    client.sendIntent({ type: 'release', slot: 1, button: 'a' });

    const seqs = socket.sentMessages().map((m) => m.seq);
    expect(seqs).toEqual([1, 2, 3, 4]);
    expect(client.lastSeq).toBe(4);
    for (const text of socket.sent) {
      expect(parseControllerMessage(text).ok).toBe(true);
    }
  });

  it('reicht nur gültige Server-Nachrichten weiter', () => {
    const { factory, sockets } = fakeSocketFactory();
    const { h, calls } = handlers();
    createClient('ws://x/ws', h, factory);
    const socket = sockets[0];
    if (!socket) throw new Error('kein Socket');
    socket.open();

    socket.receive(createMessage('heartbeat-ack', { t: 1 }));
    socket.receive('kein json');
    socket.receive({
      v: 1,
      type: 'context',
      slot: 9,
      phase: 'lobby',
      layout: 'lobby',
      actions: [],
    });
    socket.receive({ v: 2, type: 'heartbeat-ack', t: 1 });
    // Host-Nachricht ist für den Controller ungültig.
    socket.receive({ v: 1, type: 'lobby', joinCode: 'ABCD', phase: 'lobby', players: [] });

    expect(calls.messages.map((m) => m.type)).toEqual(['heartbeat-ack']);
    expect(calls.invalid.map((error) => error.code)).toEqual([
      'bad-message',
      'bad-message',
      'version-mismatch',
      'bad-message',
    ]);
  });

  it('meldet Schließen durch den Server, aber nicht durch uns', () => {
    const { factory, sockets } = fakeSocketFactory();
    const first = handlers();
    createClient('ws://x/ws', first.h, factory);
    sockets[0]?.open();
    sockets[0]?.drop(1001);
    expect(first.calls.closes).toEqual([{ code: 1001, wasOpen: true }]);

    const second = handlers();
    const client = createClient('ws://x/ws', second.h, factory);
    sockets[1]?.open();
    client.close();
    expect(sockets[1]?.closedByClient).toBe(true);
    sockets[1]?.drop();
    expect(second.calls.closes).toEqual([]);
    expect(client.isOpen).toBe(false);
    expect(client.sendIntent({ type: 'ready', slot: 1 })).toBe(false);
  });

  it('meldet fehlgeschlagenen Aufbau mit wasOpen=false', () => {
    const { factory, sockets } = fakeSocketFactory();
    const { h, calls } = handlers();
    createClient('ws://x/ws', h, factory);
    sockets[0]?.drop(1006);
    expect(calls.closes).toEqual([{ code: 1006, wasOpen: false }]);
  });
});
