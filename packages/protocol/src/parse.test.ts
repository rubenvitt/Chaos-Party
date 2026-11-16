import { describe, expect, it } from 'vitest';
import {
  createError,
  createMessage,
  encode,
  handshakeRole,
  parseClientMessage,
  parseControllerMessage,
  parseHostMessage,
  parseServerMessage,
  parseServerToControllerMessage,
  parseServerToHostMessage,
} from './parse.ts';
import { MAX_MESSAGE_LENGTH } from './schemas.ts';
import type { ClientMessage, ParseResult, ServerMessage } from './types.ts';
import { PROTOCOL_VERSION } from './version.ts';

const TOKEN = 'abcdefghijklmnop_QRSTUV-123';

const validClientMessages: ClientMessage[] = [
  createMessage('join', { joinCode: 'AB12', seats: 1 }),
  createMessage('join', { joinCode: 'ZX9Q7', seats: 2, names: ['Mia', 'Ole'] }),
  createMessage('reconnect', { sessionToken: TOKEN }),
  createMessage('ready', { slot: 1, seq: 0 }),
  createMessage('move', { slot: 2, seq: 1, x: 0.5, y: -0.5 }),
  createMessage('move', { slot: 4, seq: 2, x: 1, y: 0 }),
  createMessage('move', { slot: 3, seq: 3, x: Math.SQRT1_2, y: Math.SQRT1_2 }),
  createMessage('press', { slot: 1, seq: 4, button: 'a' }),
  createMessage('release', { slot: 1, seq: 5, button: 'b' }),
  createMessage('gesture', { slot: 2, seq: 6, kind: 'swipe-left' }),
  createMessage('reaction', { slot: 3, seq: 7, windowId: 42 }),
  createMessage('heartbeat', { t: 123456.789 }),
  createMessage('heartbeat', { t: -5 }),
  createMessage('host-hello', {}),
  createMessage('start', {}),
];

const validServerMessages: ServerMessage[] = [
  createMessage('welcome', {
    sessionToken: TOKEN,
    players: [
      { slot: 1, color: '#0072B2', label: 'Blau' },
      { slot: 2, color: '#E69F00', label: 'Ole' },
    ],
  }),
  createMessage('context', {
    slot: 1,
    phase: 'play',
    layout: 'joystick-buttons',
    actions: ['move', 'button-a', 'button-b'],
  }),
  createMessage('context', { slot: 2, phase: 'lobby', layout: 'wait', actions: [] }),
  createMessage('feedback', { slot: 3, kind: 'hit' }),
  createError('stale-seq', 'Veraltete Eingabe', 17),
  createError('version-mismatch', 'Bitte Seite neu laden'),
  createMessage('heartbeat-ack', { t: 99 }),
  createMessage('lobby', {
    joinCode: 'AB12',
    joinUrl: 'http://192.168.0.10:8787/?code=AB12',
    phase: 'lobby',
    players: [
      { slot: 1, color: '#0072B2', label: 'Blau', connected: true, ready: false, character: null },
    ],
    settings: { rounds: 5, roundPresets: [3, 5, 8] },
  }),
  createMessage('lobby', {
    joinCode: 'AB12',
    phase: 'play',
    players: [],
    settings: { rounds: 5, roundPresets: [3, 5, 8] },
  }),
  createMessage('lobby', {
    joinCode: 'AB12',
    joinUrl: 'http://192.168.0.10:8787/?code=AB12',
    joinUrlAlternatives: ['http://10.0.0.4:8787/?code=AB12', 'http://[fd00::4]:8787/?code=AB12'],
    phase: 'lobby',
    players: [],
    settings: { rounds: 5, roundPresets: [3, 5, 8] },
  }),
  createMessage('input', {
    intent: { type: 'move', slot: 1, seq: 3, x: 0, y: 1 },
    at: 1500.25,
  }),
  createMessage('input', {
    intent: { type: 'reaction', slot: 2, seq: 9, windowId: 0 },
    at: 0,
  }),
];

function expectError<T>(result: ParseResult<T>, code: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
    expect(result.error.message.length).toBeGreaterThan(0);
    expect(result.error.message.length).toBeLessThanOrEqual(200);
  }
}

/** Gültige Basisnachricht mit überschriebenen Feldern (für Manipulationstests). */
function tamper(base: object, patch: Record<string, unknown>): string {
  return JSON.stringify({ ...base, ...patch });
}

describe('gültige Nachrichten', () => {
  it.each(validClientMessages.map((m) => [m.type, m] as const))(
    'Client %s übersteht encode → parse unverändert',
    (_type, message) => {
      const result = parseClientMessage(encode(message));
      expect(result).toEqual({ ok: true, message });
    },
  );

  it.each(validServerMessages.map((m) => [m.type, m] as const))(
    'Server %s übersteht encode → parse unverändert',
    (_type, message) => {
      const result = parseServerMessage(encode(message));
      expect(result).toEqual({ ok: true, message });
    },
  );

  it('akzeptiert bereits geparste Objekte', () => {
    const message = createMessage('ready', { slot: 2, seq: 10 });
    expect(parseControllerMessage({ ...message })).toEqual({ ok: true, message });
  });

  it('createMessage setzt die aktuelle Version', () => {
    expect(createMessage('start', {})).toEqual({ v: PROTOCOL_VERSION, type: 'start' });
  });

  it('createError kürzt zu lange Texte', () => {
    const error = createError('internal', 'x'.repeat(500));
    expect(error.message).toHaveLength(200);
    expect(parseServerMessage(encode(error)).ok).toBe(true);
  });
});

describe('Rollen', () => {
  it('Controller-Parser lehnt Host-Nachrichten ab', () => {
    expectError(parseControllerMessage(encode(createMessage('start', {}))), 'bad-message');
    expectError(parseControllerMessage(encode(createMessage('host-hello', {}))), 'bad-message');
  });

  it('Host-Parser lehnt Controller-Eingaben ab', () => {
    const move = createMessage('move', { slot: 1, seq: 1, x: 0, y: 0 });
    expectError(parseHostMessage(encode(move)), 'bad-message');
    expect(parseHostMessage(encode(createMessage('heartbeat', { t: 1 }))).ok).toBe(true);
  });

  it('trennt Server-Nachrichten nach Empfänger', () => {
    const lobby = createMessage('lobby', {
      joinCode: 'AB12',
      phase: 'lobby',
      players: [],
      settings: { rounds: 5, roundPresets: [3, 5, 8] },
    });
    const feedback = createMessage('feedback', { slot: 1, kind: 'win' });
    expectError(parseServerToControllerMessage(encode(lobby)), 'bad-message');
    expectError(parseServerToHostMessage(encode(feedback)), 'bad-message');
    expect(parseServerToHostMessage(encode(lobby)).ok).toBe(true);
    expect(parseServerToControllerMessage(encode(feedback)).ok).toBe(true);
  });

  it.each([
    [createMessage('join', { joinCode: 'AB12', seats: 1 }), 'controller'],
    [createMessage('reconnect', { sessionToken: TOKEN }), 'controller'],
    [createMessage('host-hello', {}), 'host'],
    [createMessage('heartbeat', { t: 0 }), null],
    [createMessage('move', { slot: 1, seq: 0, x: 0, y: 0 }), null],
    [createMessage('start', {}), null],
  ] as const)('handshakeRole(%j) = %s', (message, role) => {
    expect(handshakeRole(message)).toBe(role);
  });
});

describe('kaputte Eingaben', () => {
  it.each([
    ['leerer String', ''],
    ['kein JSON', '{v:1'],
    ['Zahl', '42'],
    ['null', 'null'],
    ['Array', '[{"v":4,"type":"start"}]'],
    ['String-JSON', '"start"'],
  ])('%s → bad-message', (_name, raw) => {
    expectError(parseClientMessage(raw), 'bad-message');
  });

  it.each([undefined, null, 1, true, Symbol('x'), () => 1, [], new Uint8Array(4)])(
    'Nicht-Objekt %s → bad-message',
    (raw) => {
      expectError(parseClientMessage(raw), 'bad-message');
    },
  );

  it('zu lange Nachricht → too-large, ohne JSON zu lesen', () => {
    const raw = JSON.stringify({ v: 4, type: 'heartbeat', t: 1, pad: 'x'.repeat(5000) });
    expect(raw.length).toBeGreaterThan(MAX_MESSAGE_LENGTH);
    expectError(parseClientMessage(raw), 'too-large');
    expectError(parseClientMessage('{'.repeat(MAX_MESSAGE_LENGTH + 1)), 'too-large');
  });

  it('Nachricht genau an der Grenze wird noch gelesen', () => {
    const base = '{"v":4,"type":"heartbeat","t":1}';
    const raw = base + ' '.repeat(MAX_MESSAGE_LENGTH - base.length);
    expect(raw.length).toBe(MAX_MESSAGE_LENGTH);
    expect(parseClientMessage(raw).ok).toBe(true);
  });

  it('unbekannter Typ → bad-message', () => {
    expectError(parseClientMessage('{"v":4,"type":"teleport","slot":1}'), 'bad-message');
    expectError(parseClientMessage('{"v":4}'), 'bad-message');
    expectError(
      parseServerMessage('{"v":4,"type":"join","joinCode":"AB12","seats":1}'),
      'bad-message',
    );
  });
});

describe('Versionen', () => {
  it.each([
    ['v: 1', '{"v":1,"type":"start"}'],
    ['v: 5', '{"v":5,"type":"start"}'],
    ['v: 0', '{"v":0,"type":"start"}'],
    ['v als String', '{"v":"1","type":"start"}'],
    ['v: null', '{"v":null,"type":"start"}'],
    ['v: 1.5', '{"v":1.5,"type":"start"}'],
  ])('%s → version-mismatch', (_name, raw) => {
    expectError(parseClientMessage(raw), 'version-mismatch');
    expectError(parseServerMessage(raw), 'version-mismatch');
  });

  it('fehlende Version → bad-message', () => {
    expectError(parseClientMessage('{"type":"start"}'), 'bad-message');
  });

  it('Versionsfehler gewinnt vor Schemafehlern', () => {
    expectError(parseClientMessage('{"v":5,"type":"move","slot":9,"seq":-1}'), 'version-mismatch');
  });
});

describe('manipulierte Nachrichten', () => {
  const move = createMessage('move', { slot: 1, seq: 1, x: 0, y: 0 });
  const press = createMessage('press', { slot: 1, seq: 1, button: 'a' });
  const join = createMessage('join', { joinCode: 'AB12', seats: 1 });
  const ready = createMessage('ready', { slot: 1, seq: 1 });

  it.each([
    ['Slot 0', tamper(ready, { slot: 0 })],
    ['Slot 5', tamper(ready, { slot: 5 })],
    ['Slot 1.5', tamper(ready, { slot: 1.5 })],
    ['Slot als String', tamper(ready, { slot: '1' })],
    ['Slot fehlt', JSON.stringify({ v: 4, type: 'ready', seq: 1 })],
    ['seq negativ', tamper(ready, { seq: -1 })],
    ['seq gebrochen', tamper(ready, { seq: 1.5 })],
    ['seq zu groß', tamper(ready, { seq: Number.MAX_SAFE_INTEGER + 2 })],
    ['seq fehlt', JSON.stringify({ v: 4, type: 'ready', slot: 1 })],
    ['x > 1', tamper(move, { x: 1.01 })],
    ['y < -1', tamper(move, { y: -2 })],
    ['Vektor zu lang', tamper(move, { x: 0.9, y: 0.9 })],
    ['x als String', tamper(move, { x: '0' })],
    ['x null (aus NaN/Infinity in JSON)', JSON.stringify({ ...move, x: Number.NaN })],
    ['y fehlt', JSON.stringify({ v: 4, type: 'move', slot: 1, seq: 1, x: 0 })],
    ['x riesig', '{"v":4,"type":"move","slot":1,"seq":1,"x":1e400,"y":0}'],
    ['unbekannter Knopf', tamper(press, { button: 'c' })],
    ['unbekannte Geste', tamper({ ...ready, type: 'gesture' }, { kind: 'shake' })],
    ['windowId negativ', tamper({ ...ready, type: 'reaction' }, { windowId: -1 })],
    ['Zusatzfeld', tamper(press, { admin: true })],
    ['fremde Spieler-ID als Zusatzfeld', tamper(press, { playerId: 'p2' })],
    ['Join-Code klein', tamper(join, { joinCode: 'ab12' })],
    ['Join-Code zu kurz', tamper(join, { joinCode: 'AB1' })],
    ['Join-Code zu lang', tamper(join, { joinCode: 'ABCDEFGHI' })],
    ['seats 0', tamper(join, { seats: 0 })],
    ['seats 5', tamper(join, { seats: 5 })],
    ['mehr Namen als Plätze', tamper(join, { seats: 1, names: ['A', 'B'] })],
    ['leerer Name', tamper(join, { names: [''] })],
    ['Name zu lang', tamper(join, { names: ['x'.repeat(17)] })],
    ['Name mit Steuerzeichen', tamper(join, { names: ['A\u0000B'] })],
    ['Name mit Bidi-Override', tamper(join, { names: ['A\u202EB'] })],
    ['Name mit Rand-Leerraum', tamper(join, { names: [' Mia'] })],
    ['Token zu kurz', JSON.stringify({ v: 4, type: 'reconnect', sessionToken: 'abc' })],
    [
      'Token mit Sonderzeichen',
      JSON.stringify({ v: 4, type: 'reconnect', sessionToken: `${TOKEN}<>` }),
    ],
    ['Heartbeat ohne t', '{"v":4,"type":"heartbeat"}'],
    ['Heartbeat t als String', '{"v":4,"type":"heartbeat","t":"now"}'],
  ])('%s → bad-message', (_name, raw) => {
    expectError(parseClientMessage(raw), 'bad-message');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'nicht endliche Zahl %s im Objekt → bad-message',
    (value) => {
      expectError(parseClientMessage({ ...move, x: value }), 'bad-message');
      expectError(parseClientMessage({ ...ready, seq: value }), 'bad-message');
      expectError(parseClientMessage({ v: 4, type: 'heartbeat', t: value }), 'bad-message');
    },
  );

  it('Joystick knapp über 1 innerhalb der Toleranz wird angenommen', () => {
    const r = 1 + 0.0005;
    const raw = tamper(move, { x: Math.SQRT1_2 * r, y: Math.SQRT1_2 * r });
    expect(parseClientMessage(raw).ok).toBe(true);
  });

  it('__proto__ und constructor als Schlüssel werden abgelehnt und verschmutzen nichts', () => {
    const raws = [
      '{"v":4,"type":"heartbeat","t":1,"__proto__":{"polluted":true}}',
      '{"v":4,"type":"heartbeat","t":1,"constructor":{"prototype":{"polluted":true}}}',
      '{"v":4,"type":"join","joinCode":"AB12","seats":1,"names":["A"],"__proto__":{"seats":4}}',
    ];
    for (const raw of raws) {
      expectError(parseClientMessage(raw), 'bad-message');
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('Fehlermeldung bleibt kurz, auch bei langen fremden Schlüsseln', () => {
    const raw = tamper(press, { ['k'.repeat(3000)]: 1 });
    expectError(parseClientMessage(raw), 'bad-message');
  });
});

describe('manipulierte Server-Nachrichten', () => {
  const welcome = createMessage('welcome', {
    sessionToken: TOKEN,
    players: [{ slot: 1, color: '#0072B2', label: 'Blau' }],
  });

  it.each([
    ['doppelte Slots', tamper(welcome, { players: [welcome.players[0], welcome.players[0]] })],
    ['keine Spieler', tamper(welcome, { players: [] })],
    ['Farbe kein Hex', tamper(welcome, { players: [{ slot: 1, color: 'red', label: 'A' }] })],
    [
      'Lobby mit javascript:-Link',
      JSON.stringify({
        v: 4,
        type: 'lobby',
        joinCode: 'AB12',
        joinUrl: 'javascript:alert(1)',
        phase: 'lobby',
        players: [],
      }),
    ],
    [
      'Lobby mit javascript:-Alternative',
      JSON.stringify({
        v: 4,
        type: 'lobby',
        joinCode: 'AB12',
        joinUrlAlternatives: ['javascript:alert(1)'],
        phase: 'lobby',
        players: [],
      }),
    ],
    [
      'Lobby mit zu vielen Alternativen',
      JSON.stringify({
        v: 4,
        type: 'lobby',
        joinCode: 'AB12',
        joinUrlAlternatives: Array.from({ length: 9 }, (_, i) => `http://10.0.0.${String(i)}/`),
        phase: 'lobby',
        players: [],
      }),
    ],
    [
      'Input mit ungültigem Intent',
      JSON.stringify({ v: 4, type: 'input', intent: { type: 'join', slot: 1, seq: 1 }, at: 1 }),
    ],
    [
      'Input mit Version im Intent',
      JSON.stringify({
        v: 4,
        type: 'input',
        intent: { v: 4, type: 'press', slot: 1, seq: 1, button: 'a' },
        at: 1,
      }),
    ],
    [
      'Context mit unbekannter Phase',
      JSON.stringify({
        v: 4,
        type: 'context',
        slot: 1,
        phase: 'arena',
        layout: 'wait',
        actions: [],
      }),
    ],
    [
      'Error mit unbekanntem Code',
      JSON.stringify({ v: 4, type: 'error', code: 'oops', message: '' }),
    ],
  ])('%s → bad-message', (_name, raw) => {
    expectError(parseServerMessage(raw), 'bad-message');
  });
});
