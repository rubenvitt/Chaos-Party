/**
 * Integrationstests: echte `ws`-Clients gegen `createChaosServer` auf Port 0
 * (CHAOS-9). Gewartet wird auf konkrete Nachrichten mit Timeout, nicht auf Zeit.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createMessage,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
  type SlotNumber,
} from '@chaos-party/protocol';
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createChaosServer, type ChaosServer, type ChaosServerOptions } from './server.ts';
import { CLOSE_CODES } from './session.ts';

const CODE = 'TEST';
const TIMEOUT_MS = 2000;

type Message<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

/** Test-Controller/-Host mit Nachrichtenpuffer und gezieltem Warten. */
class TestClient {
  private readonly queue: ServerMessage[] = [];
  private readonly waiters: {
    match: (message: ServerMessage) => boolean;
    resolve: (message: ServerMessage) => void;
  }[] = [];
  readonly closed: Promise<{ code: number; reason: string }>;

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data: Buffer) => {
      const parsed = parseServerMessage(data.toString('utf8'));
      if (!parsed.ok)
        throw new Error(`Server sendete ungültige Nachricht: ${parsed.error.message}`);
      const message = parsed.message;
      const index = this.waiters.findIndex((waiter) => waiter.match(message));
      const waiter = index >= 0 ? this.waiters.splice(index, 1)[0] : undefined;
      if (waiter) waiter.resolve(message);
      else this.queue.push(message);
    });
    this.closed = new Promise((resolve) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString('utf8') });
      });
    });
  }

  static open(url: string): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const client = new TestClient(ws);
      ws.once('open', () => {
        resolve(client);
      });
      ws.once('error', reject);
    });
  }

  send(message: ClientMessage | Record<string, unknown> | string): void {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /** Wartet auf die nächste (auch bereits gepufferte) Nachricht, die `match` erfüllt. */
  next<T extends ServerMessage['type']>(
    type: T,
    match: (message: Message<T>) => boolean = () => true,
  ): Promise<Message<T>> {
    const test = (message: ServerMessage): message is Message<T> =>
      message.type === type && match(message as Message<T>);
    const index = this.queue.findIndex(test);
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0] as Message<T>);
    return new Promise((resolve, reject) => {
      const waiter = {
        match: test,
        resolve: (message: ServerMessage) => {
          clearTimeout(timer);
          resolve(message as Message<T>);
        },
      };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error(`Timeout: keine Nachricht ${type}`));
      }, TIMEOUT_MS);
      this.waiters.push(waiter);
    });
  }

  error(code: string): Promise<Message<'error'>> {
    return this.next('error', (message) => message.code === code);
  }

  /** Alle bisher gepufferten, nicht abgeholten Nachrichten eines Typs. */
  buffered(type: ServerMessage['type']): ServerMessage[] {
    return this.queue.filter((message) => message.type === type);
  }

  close(): void {
    this.ws.close();
  }
}

let workDir: string;
let server: ChaosServer;
let url: string;
const clients: TestClient[] = [];

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'chaos-ws-'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.ws.terminate();
  await server.close();
});

async function startServer(options: Partial<ChaosServerOptions> = {}) {
  server = createChaosServer({ staticDir: workDir, joinCode: CODE, ...options });
  const address = await server.listen(0, '127.0.0.1');
  url = `ws://127.0.0.1:${String(address.port)}/ws`;
}

async function open(): Promise<TestClient> {
  const client = await TestClient.open(url);
  clients.push(client);
  return client;
}

async function host(): Promise<TestClient> {
  const client = await open();
  client.send(createMessage('host-hello', {}));
  await client.next('lobby');
  return client;
}

async function controller(seats = 1): Promise<{ client: TestClient; welcome: Message<'welcome'> }> {
  const client = await open();
  client.send(createMessage('join', { joinCode: CODE, seats }));
  const welcome = await client.next('welcome');
  return { client, welcome };
}

const slotsOf = (welcome: Message<'welcome'>) => welcome.players.map((player) => player.slot);

async function startGame(hostClient: TestClient, controllers: TestClient[]) {
  hostClient.send(createMessage('start', { mode: 'arena' }));
  await hostClient.next('lobby', (lobby) => lobby.phase === 'play');
  for (const client of controllers) {
    await client.next('context', (context) => context.phase === 'play');
  }
}

describe('WebSocket-Server (CHAOS-9)', () => {
  it('lässt mehrere Controller gleichzeitig beitreten und vergibt verschiedene Slots', async () => {
    await startServer();
    const hostClient = await host();
    const joined = await Promise.all([controller(), controller(), controller()]);
    const slots = joined.flatMap(({ welcome }) => slotsOf(welcome)).sort();
    expect(slots).toEqual([1, 2, 3]);
    const tokens = new Set(joined.map(({ welcome }) => welcome.sessionToken));
    expect(tokens.size).toBe(3);
    await hostClient.next('lobby', (lobby) => lobby.players.length === 3);
    for (const { client, welcome } of joined) {
      const context = await client.next('context');
      expect(context).toMatchObject({
        slot: welcome.players[0]?.slot,
        layout: 'lobby',
        actions: ['ready'],
      });
    }
  });

  it('leitet gleichzeitige Eingaben von iPhone und geteiltem iPad mit richtigen Slots weiter', async () => {
    await startServer();
    const hostClient = await host();
    const phone = await controller(1);
    const ipad = await controller(2);
    expect(slotsOf(phone.welcome)).toEqual([1]);
    expect(slotsOf(ipad.welcome)).toEqual([2, 3]);
    await startGame(hostClient, [phone.client, ipad.client]);

    const perSlot = 20;
    for (let seq = 1; seq <= perSlot; seq++) {
      phone.client.send(createMessage('move', { slot: 1, seq, x: 0.1, y: 0 }));
      ipad.client.send(createMessage('move', { slot: 2, seq: seq * 2, x: 0.2, y: 0 }));
      ipad.client.send(createMessage('move', { slot: 3, seq: seq * 2 + 1, x: 0.3, y: 0 }));
    }
    const received: Record<SlotNumber, number[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (let i = 0; i < perSlot * 3; i++) {
      const input = await hostClient.next('input');
      expect(input.intent.type).toBe('move');
      if (input.intent.type === 'move') {
        expect(input.intent.x).toBeCloseTo(input.intent.slot / 10);
      }
      received[input.intent.slot].push(input.intent.seq);
    }
    // Reihenfolge pro Verbindung bleibt erhalten.
    expect(received[1]).toEqual(Array.from({ length: perSlot }, (_, i) => i + 1));
    expect(received[2]).toEqual(Array.from({ length: perSlot }, (_, i) => (i + 1) * 2));
    expect(received[3]).toEqual(Array.from({ length: perSlot }, (_, i) => (i + 1) * 2 + 1));
  });

  it('weist Spoofing, Doppel-Join, falschen Code, volle Session und Phasenfehler ab', async () => {
    await startServer();
    const hostClient = await host();
    const first = await controller(1);
    await controller(1);

    first.client.send(createMessage('ready', { slot: 2, seq: 1 }));
    expect((await first.client.error('not-your-slot')).seq).toBe(1);

    first.client.send(createMessage('join', { joinCode: CODE, seats: 1 }));
    await first.client.error('bad-message');

    const wrong = await open();
    wrong.send(createMessage('join', { joinCode: 'NOPE', seats: 1 }));
    await wrong.error('bad-join-code');

    const ipad = await open();
    ipad.send(createMessage('join', { joinCode: CODE, seats: 3 }));
    await ipad.error('session-full');
    ipad.send(createMessage('join', { joinCode: CODE, seats: 2 }));
    expect(slotsOf(await ipad.next('welcome'))).toEqual([3, 4]);

    const fifth = await open();
    fifth.send(createMessage('join', { joinCode: CODE, seats: 1 }));
    await fifth.error('session-full');

    first.client.send(createMessage('move', { slot: 1, seq: 2, x: 1, y: 0 }));
    await first.client.error('out-of-phase');
    await hostClient.next('lobby', (lobby) => lobby.players.length === 4);
    expect(hostClient.buffered('input')).toEqual([]);
  });

  it('weist veraltete Sequenznummern ab', async () => {
    await startServer();
    const hostClient = await host();
    const { client } = await controller();
    await startGame(hostClient, [client]);
    client.send(createMessage('press', { slot: 1, seq: 10, button: 'a' }));
    client.send(createMessage('release', { slot: 1, seq: 10, button: 'a' }));
    client.send(createMessage('release', { slot: 1, seq: 11, button: 'a' }));
    expect((await client.error('stale-seq')).seq).toBe(10);
    expect((await hostClient.next('input')).intent).toMatchObject({ type: 'press', seq: 10 });
    expect((await hostClient.next('input')).intent).toMatchObject({ type: 'release', seq: 11 });
  });

  it('übersteht kaputte, unbekannte, falsch versionierte und zu große Nachrichten', async () => {
    await startServer();
    const { client } = await controller();
    client.send('{kaputt');
    await client.error('bad-message');
    client.send({ v: 3, type: 'teleport' });
    await client.error('bad-message');
    client.send({ v: 99, type: 'heartbeat', t: 1 });
    await client.error('version-mismatch');
    client.send('"' + 'x'.repeat(5000) + '"');
    await client.error('too-large');
    client.ws.send(Buffer.from([1, 2, 3]), { binary: true });
    await client.error('bad-message');
    // Verbindung lebt noch.
    client.send(createMessage('heartbeat', { t: 7 }));
    expect((await client.next('heartbeat-ack')).t).toBe(7);

    // Frames über maxPayload schließt `ws` mit 1009; der Server läuft weiter.
    client.send('x'.repeat(20 * 1024));
    expect((await client.closed).code).toBe(1009);
    const health = await fetch(url.replace('ws://', 'http://').replace('/ws', '/health'));
    expect(health.status).toBe(200);
  });

  it('schließt Verbindungen, die ohne Handshake senden', async () => {
    await startServer();
    const client = await open();
    client.send(createMessage('heartbeat', { t: 1 }));
    await client.error('not-joined');
    expect((await client.closed).code).toBe(CLOSE_CODES.notJoined);
  });

  it('drosselt Fluten und trennt bei anhaltendem Missbrauch', async () => {
    await startServer({ rateLimit: { maxRejected: 100 } });
    const { client } = await controller();
    for (let i = 0; i < 400; i++) client.send(createMessage('heartbeat', { t: i }));
    await client.error('rate-limited');
    expect((await client.closed).code).toBe(CLOSE_CODES.abuse);
  });

  it('trennt nach zu vielen ungültigen Nachrichten', async () => {
    await startServer();
    const { client } = await controller();
    for (let i = 0; i < 25; i++) client.send('nope');
    expect((await client.closed).code).toBe(CLOSE_CODES.abuse);
  });

  it('weist einen zweiten Host ab und lässt nach Trennung einen neuen zu', async () => {
    await startServer();
    const first = await host();
    const second = await open();
    second.send(createMessage('host-hello', {}));
    await second.error('host-taken');
    expect((await second.closed).code).toBe(CLOSE_CODES.hostTaken);

    first.close();
    await first.closed;
    // Der Server verarbeitet `close` asynchron: neu versuchen, bis die Übernahme klappt.
    for (let attempt = 0; ; attempt++) {
      const next = await open();
      next.send(createMessage('host-hello', {}));
      const reply = await Promise.race([next.next('lobby'), next.closed]);
      if ('type' in reply) break;
      expect(attempt).toBeLessThan(20);
    }
  });

  it('meldet getrennte Controller und stellt sie per Token wieder her', async () => {
    await startServer();
    const hostClient = await host();
    const { client, welcome } = await controller(2);
    await hostClient.next('lobby', (lobby) => lobby.players.length === 2);

    client.close();
    const lobby = await hostClient.next('lobby', (l) => l.players.every((p) => !p.connected));
    expect(lobby.players.map((p) => p.slot)).toEqual([1, 2]);

    const bad = await open();
    bad.send(createMessage('reconnect', { sessionToken: 'falsches-token-0123456789' }));
    await bad.error('bad-token');

    const again = await open();
    again.send(createMessage('reconnect', { sessionToken: welcome.sessionToken }));
    const rewelcome = await again.next('welcome');
    expect(rewelcome).toEqual(welcome);
    await again.next('context', (c) => c.slot === 2);
    await hostClient.next('lobby', (l) => l.players.every((p) => p.connected));

    // Ein zweiter Reconnect mit demselben Token verdrängt die vorige Verbindung.
    const third = await open();
    third.send(createMessage('reconnect', { sessionToken: welcome.sessionToken }));
    await third.next('welcome');
    expect((await again.closed).code).toBe(CLOSE_CODES.replaced);
  });

  it('liefert weiterhin /health und lehnt andere WebSocket-Pfade ab', async () => {
    await startServer();
    const base = url.replace('ws://', 'http://').replace('/ws', '');
    expect((await fetch(`${base}/health`)).status).toBe(200);
    await expect(TestClient.open(`${base.replace('http', 'ws')}/anders`)).rejects.toThrow(/404/);
    expect(server.joinCode).toBe(CODE);
  });

  it('beendet beim Schließen alle offenen Verbindungen', async () => {
    await startServer();
    const { client } = await controller();
    const hostClient = await host();
    await server.close();
    expect((await client.closed).code).toBe(1006);
    expect((await hostClient.closed).code).toBe(1006);
    // afterEach schließt erneut: muss harmlos sein.
  });
});

describe('Reconnect und Herzschlag (CHAOS-12)', () => {
  /** Kurze Zeitgrenzen für echte Sockets; die Zahlenwerte selbst prüft `session.test.ts`. */
  const FAST = { tickMs: 20 };

  it('Abbruch per terminate → Host sieht getrennt → Reconnect mit Token → Eingaben fließen wieder', async () => {
    await startServer();
    const hostClient = await host();
    const { client, welcome } = await controller();
    await startGame(hostClient, [client]);
    client.send(createMessage('move', { slot: 1, seq: 41, x: 0.5, y: 0 }));
    expect((await hostClient.next('input')).intent).toMatchObject({ slot: 1, seq: 41 });

    // Harter Abbruch ohne Close-Frame (WLAN weg, Safari eingefroren und beendet).
    client.ws.terminate();
    await hostClient.next('lobby', (lobby) => lobby.players[0]?.connected === false);

    const again = await open();
    again.send(createMessage('reconnect', { sessionToken: welcome.sessionToken }));
    expect(await again.next('welcome')).toEqual(welcome);
    expect(await again.next('context')).toMatchObject({ slot: 1, layout: 'joystick-buttons' });
    await hostClient.next('lobby', (lobby) => lobby.players[0]?.connected === true);
    // Neue Verbindung, neuer Sequenzwächter: seq 1 ist wieder gültig.
    again.send(createMessage('move', { slot: 1, seq: 1, x: -0.5, y: 0 }));
    expect((await hostClient.next('input')).intent).toMatchObject({ slot: 1, seq: 1, x: -0.5 });
  });

  it('trennt stille Controller per Herzschlag-Timeout und meldet es dem Host', async () => {
    await startServer({ ...FAST, timeouts: { controllerSilenceMs: 150 } });
    // Der Host hat die Standard-Grenze (30 s); der Controller schweigt nach dem Beitritt.
    const hostClient = await host();
    const { client } = await controller();
    await hostClient.next('lobby', (lobby) => lobby.players[0]?.connected === true);
    // Der Server bricht ab (terminate) → beim Client kommt 1006 an.
    expect((await client.closed).code).toBe(1006);
    await hostClient.next('lobby', (lobby) => lobby.players[0]?.connected === false);
    expect(server.session.snapshot().players[0]?.connected).toBe(false);
  });

  it('hält Controller mit Herzschlag dauerhaft verbunden', async () => {
    await startServer({ ...FAST, timeouts: { controllerSilenceMs: 150 } });
    const { client } = await controller();
    for (let i = 0; i < 8; i++) {
      client.send(createMessage('heartbeat', { t: i }));
      expect((await client.next('heartbeat-ack')).t).toBe(i);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(client.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('schließt Verbindungen ohne Handshake mit 4004', async () => {
    await startServer({ ...FAST, timeouts: { handshakeMs: 100 } });
    const client = await open();
    expect(await client.closed).toEqual({
      code: CLOSE_CODES.handshakeTimeout,
      reason: 'handshake-timeout',
    });
  });

  it('Reconnect nach Ablauf der Lobby-Schonfrist → bad-token, Neubeitritt bekommt den Platz', async () => {
    await startServer({ ...FAST, timeouts: { lobbyGraceMs: 100 } });
    const hostClient = await host();
    const { client, welcome } = await controller();
    await hostClient.next('lobby', (lobby) => lobby.players.length === 1);
    client.close();
    await hostClient.next('lobby', (lobby) => lobby.players[0]?.connected === false);
    await hostClient.next('lobby', (lobby) => lobby.players.length === 0);

    const late = await open();
    late.send(createMessage('reconnect', { sessionToken: welcome.sessionToken }));
    await late.error('bad-token');
    late.send(createMessage('join', { joinCode: CODE, seats: 1 }));
    const fresh = await late.next('welcome');
    expect(slotsOf(fresh)).toEqual([1]);
    expect(fresh.sessionToken).not.toBe(welcome.sessionToken);
  });

  it('weist ein Token eines früheren Servers (Neustart) ab', async () => {
    await startServer();
    const { welcome } = await controller();
    await server.close();
    await startServer();
    const client = await open();
    client.send(createMessage('reconnect', { sessionToken: welcome.sessionToken }));
    await client.error('bad-token');
  });
});
