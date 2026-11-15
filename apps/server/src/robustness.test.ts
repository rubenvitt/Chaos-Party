/**
 * CHAOS-38: Robustheit der Session gegen kaputte, unpassende und gefälschte Nachrichten für
 * alle v4-Nachrichten (ADR-005 Prüfreihenfolge, ADR-014), Rate-Limits und ein Fuzz-Lauf:
 * zufällige (seeded) Folgen gültiger und ungültiger Nachrichten mehrerer Clients über eine
 * ganze Partie – keine Ausnahme, kein `internal`, die Partie endet in `game-results`.
 */
import { createRng, type Rng } from '@chaos-party/game-core';
import { rankByScore } from '@chaos-party/minigame-sdk';
import { getMinigameInfo, rotationInfos } from '@chaos-party/minigames/catalog';
import {
  CHARACTER_IDS,
  createMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type SlotNumber,
} from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { CLOSE_CODES } from './session.ts';
import {
  assertContiguousEvents,
  CODE,
  Harness,
  HOST,
  INTEGRATION_SEEDS,
  pressInMinigame,
  setupGame,
  TICK_MS,
} from './testHarness.ts';

function lobbyHarness(players: number): Harness {
  const h = new Harness({ game: { seed: 5, rounds: 2, minigames: [] } });
  h.host();
  for (let id = 1; id <= players; id++) h.join(id);
  return h;
}

/** Fehlercodes an eine Verbindung seit `from`. */
function codesTo(h: Harness, to: number, from = 0): string[] {
  return h.errors.slice(from).flatMap((e) => (e.to === to ? [e.code] : []));
}

function raw(type: string, fields: Record<string, unknown> = {}): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, type, ...fields });
}

/** Host-Befehle (v4 + Start/Ergebnis), wie sie ein Controller fälschen könnte. */
const HOST_COMMANDS: ClientMessage[] = [
  createMessage('start', { mode: 'board' }),
  createMessage('configure', { rounds: 3 }),
  createMessage('pause', {}),
  createMessage('resume', {}),
  createMessage('end-game', {}),
  createMessage('rematch', {}),
  createMessage('minigame-result', {
    minigameId: 'pump-parade',
    round: 1,
    placements: [{ slot: 1, place: 1, score: 1 }],
  }),
];

describe('Unpassende und kaputte v4-Nachrichten (CHAOS-38)', () => {
  it('pick-character außerhalb der Lobby: out-of-phase, zählt nicht als Missbrauch', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    const c = h.controller(1);
    for (let i = 0; i < 30; i++) h.pickCharacter(1, c.slots[0] ?? 1, 'sock');
    expect(new Set(codesTo(h, 1))).toEqual(new Set(['out-of-phase']));
    expect(h.closes).toEqual([]);
    expect(h.boards.at(-1)?.view.players.find((p) => p.slot === 1)?.character).toBe('robot');
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    // Auch im Endstand.
    const before = h.errors.length;
    h.pickCharacter(1, 1, 'sock');
    expect(codesTo(h, 1, before)).toEqual(['out-of-phase']);
  });

  it('pause/resume/end-game/rematch in der Lobby: out-of-phase, Lobby unverändert', () => {
    const h = lobbyHarness(2);
    const lobbies = h.lobbies.length;
    h.pause();
    h.resume();
    h.endGame();
    h.rematch();
    expect(codesTo(h, HOST)).toEqual([
      'out-of-phase',
      'out-of-phase',
      'out-of-phase',
      'out-of-phase',
    ]);
    expect(h.lobbies.length).toBe(lobbies);
    expect(h.session.phase).toBe('lobby');
    expect(h.closes).toEqual([]);
  });

  it('rematch während der Partie und resume ohne Pause: out-of-phase; doppelte Pause: paused', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    h.runUntil((x) => x.openPrompt('roll') !== null);
    h.rematch();
    h.resume();
    h.pause();
    h.pause();
    expect(codesTo(h, HOST)).toEqual(['out-of-phase', 'out-of-phase', 'paused']);
    expect(h.session.phase).toBe('board');
    h.resume();
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    // end-game nach dem Endstand und Pause im Endstand.
    const before = h.errors.length;
    h.endGame();
    h.pause();
    expect(codesTo(h, HOST, before)).toEqual(['out-of-phase', 'out-of-phase']);
  });

  it('configure mit ungültiger Rundenzahl: bad-message, Einstellung bleibt; im Spiel out-of-phase', () => {
    const h = lobbyHarness(1);
    const rounds = h.session.snapshot().rounds;
    for (const value of [0, -1, 21, 2.5, '3', null, 1e9]) {
      h.sendRaw(HOST, raw('configure', { rounds: value }));
    }
    h.sendRaw(HOST, raw('configure', {}));
    h.sendRaw(HOST, raw('configure', { rounds: 3, extra: true }));
    expect(codesTo(h, HOST)).toEqual(Array.from({ length: 9 }, () => 'bad-message'));
    expect(h.session.snapshot().rounds).toBe(rounds);
    expect(h.lobby?.settings.rounds).toBe(rounds);
    // Grenzwerte sind gültig.
    h.configure(1);
    h.configure(20);
    expect(h.lobby?.settings.rounds).toBe(20);
    h.ready(1);
    h.start(1);
    const before = h.errors.length;
    h.configure(3);
    expect(codesTo(h, HOST, before)).toEqual(['out-of-phase']);
    expect(h.boards.at(-1)?.view.rounds).toBe(1);
  });

  it('pick-character mit unbekannter Figur oder falschem Schema: bad-message', () => {
    const h = lobbyHarness(1);
    h.sendRaw(1, raw('pick-character', { slot: 1, seq: 1, character: 'dragon' }));
    h.sendRaw(1, raw('pick-character', { slot: 1, seq: 2 }));
    h.sendRaw(1, raw('pick-character', { slot: 5, seq: 3, character: 'sock' }));
    h.sendRaw(1, raw('pick-character', { slot: 1, seq: -1, character: 'sock' }));
    expect(codesTo(h, 1)).toEqual(['bad-message', 'bad-message', 'bad-message', 'bad-message']);
    expect(h.lobby?.players[0]?.character).toBeNull();
  });

  it('Spoofing fremder Slots (pick-character, ready, choose, Eingaben): not-your-slot, ohne Wirkung', () => {
    const h = lobbyHarness(2);
    const c1 = h.controller(1);
    h.send(1, createMessage('pick-character', { slot: 2, seq: ++c1.seq, character: 'sock' }));
    h.send(1, createMessage('ready', { slot: 2, seq: ++c1.seq }));
    expect(codesTo(h, 1)).toEqual(['not-your-slot', 'not-your-slot']);
    expect(h.lobby?.players.find((p) => p.slot === 2)).toMatchObject({
      character: null,
      ready: false,
    });

    h.ready(1);
    h.ready(2);
    h.start(1);
    h.runUntil((x) => x.openPrompt() !== null);
    const open = h.openPrompt();
    if (!open) throw new Error('kein Prompt');
    const other: SlotNumber = open.slot === 1 ? 2 : 1;
    const thief = h.controllerOf(other);
    const before = h.errors.length;
    h.send(
      thief.id,
      createMessage('choose', {
        slot: open.slot,
        seq: ++thief.seq,
        promptId: open.prompt.id,
        option: open.prompt.options[0]?.id ?? 'roll',
      }),
    );
    h.send(thief.id, createMessage('press', { slot: open.slot, seq: ++thief.seq, button: 'a' }));
    expect(codesTo(h, thief.id, before)).toEqual(['not-your-slot', 'not-your-slot']);
    expect(h.session.snapshot().game?.state.prompt?.id).toBe(open.prompt.id);
  });

  it('Host-Befehle von Controllern: bad-message, zählen als Missbrauch → Close 4008, Partie unberührt', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    h.runUntil((x) => x.openPrompt('roll') !== null);
    const state = h.session.snapshot().game?.state;
    let sent = 0;
    while (h.controller(1).connected) {
      const command = HOST_COMMANDS[sent % HOST_COMMANDS.length];
      if (!command) throw new Error('kein Befehl');
      h.send(1, command);
      sent++;
    }
    expect(sent).toBe(20);
    expect(new Set(codesTo(h, 1))).toEqual(new Set(['bad-message']));
    expect(h.closes).toEqual([{ to: 1, code: CLOSE_CODES.abuse, reason: 'too-many-invalid' }]);
    // Keine Pause, kein Ende, keine Revanche; nur der Spieler ist jetzt getrennt.
    expect(h.session.snapshot().game?.state).toMatchObject({
      phase: state?.phase,
      paused: false,
      endedEarly: false,
    });
    expect(h.session.phase).toBe('board');
    // Der Controller kommt mit seinem Token zurück und spielt weiter.
    h.reconnect(1, 11);
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
  });

  it('Controller-Nachrichten vom Host: bad-message', () => {
    const h = lobbyHarness(1);
    h.send(HOST, createMessage('pick-character', { slot: 1, seq: 1, character: 'sock' }));
    h.send(HOST, createMessage('ready', { slot: 1, seq: 2 }));
    h.send(HOST, createMessage('choose', { slot: 1, seq: 3, promptId: 1, option: 'roll' }));
    h.send(HOST, createMessage('press', { slot: 1, seq: 4, button: 'a' }));
    h.send(HOST, createMessage('join', { joinCode: CODE, seats: 1 }));
    expect(codesTo(h, HOST)).toEqual(Array.from({ length: 5 }, () => 'bad-message'));
    expect(h.lobby?.players[0]).toMatchObject({ character: null, ready: false });
  });

  it('Rate-Limit: Flut von pick-character drosselt, eine Fehlermeldung je Sekunde, nach 5 s Close 4008', () => {
    const h = lobbyHarness(2);
    const open = () => h.controller(1).connected;
    let processed = 0;
    // 200 Nachrichten/s: über dem Budget (60/s), aber unter der Gesamtgrenze von 1000 Abweisungen.
    for (let tick = 0; tick < 100 && open(); tick++) {
      for (let n = 0; n < 20 && open(); n++) {
        const lobbiesBefore = h.lobbies.length;
        h.pickCharacter(1, 1, CHARACTER_IDS[n % 2] ?? 'sock');
        if (h.lobbies.length > lobbiesBefore) processed++;
      }
      h.tick();
    }
    const rateErrors = codesTo(h, 1).filter((code) => code === 'rate-limited');
    // Kapazität 120 + 60/s Nachschub; danach gedrosselt, höchstens ein Fehler pro Sekunde, nach
    // 5 s ununterbrochener Flut Close.
    expect(processed).toBeGreaterThanOrEqual(120);
    expect(processed).toBeLessThan(120 + 60 * 7);
    expect(rateErrors.length).toBeGreaterThanOrEqual(5);
    expect(rateErrors.length).toBeLessThanOrEqual(6);
    expect(h.closes).toEqual([{ to: 1, code: CLOSE_CODES.abuse, reason: 'rate-limited' }]);
    // Der andere Spieler ist unberührt und kann wählen.
    h.pickCharacter(2, 2, 'raccoon');
    expect(codesTo(h, 2)).toEqual([]);
  });

  it('Rate-Limit am Host im Spiel: flutender Host wird getrennt, Partie pausiert automatisch', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    h.runUntil((x) => x.openPrompt('roll') !== null);
    for (let i = 0; i < 2_000 && h.hostConnected; i++) {
      h.send(HOST, createMessage('heartbeat', { t: i }));
      if (i % 100 === 99) h.tick();
    }
    expect(h.hostConnected).toBe(false);
    expect(h.closes.at(-1)).toMatchObject({ to: HOST, code: CLOSE_CODES.abuse });
    expect(h.session.snapshot().pausedBy).toBe('host-lost');
    h.host();
    expect(h.session.snapshot().pausedBy).toBeNull();
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    assertContiguousEvents(h);
  });
});

// ---------------------------------------------------------------------------
// Fuzz
// ---------------------------------------------------------------------------

const OPTIONS = ['roll', 'buy', 'skip', 'cancel', 'brace', 'shield', 'none', 'slot:1', 'item:trap'];
const GARBAGE = [
  '',
  '{',
  'null',
  '[]',
  '42',
  '{"v":4}',
  '{"v":3,"type":"heartbeat","t":1}',
  '{"v":4,"type":"nope"}',
  '{"v":4,"type":"choose","slot":"1"}',
  '{"v":4,"type":"move","slot":1,"seq":1,"x":5,"y":0}',
  '{"__proto__":{"admin":true},"v":4,"type":"heartbeat","t":1}',
  'x'.repeat(70_000),
  '\u0000￿',
];

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.int(0, items.length - 1)];
  if (item === undefined) throw new Error('leere Liste');
  return item;
}

/** Zufällige Controller-Nachricht: meist schemagültig, oft unpassend, manchmal Müll. */
function junkFromController(rng: Rng, own: SlotNumber[], seq: () => number): string {
  const slot = rng.int(0, 3) === 0 ? (rng.int(1, 4) as SlotNumber) : pick(rng, own);
  const roll = rng.int(0, 13);
  switch (roll) {
    case 0:
      return pick(rng, GARBAGE);
    case 1:
      return JSON.stringify(
        createMessage('choose', {
          slot,
          seq: seq(),
          promptId: rng.int(0, 40),
          option: pick(rng, OPTIONS),
        }),
      );
    case 2:
      return JSON.stringify(createMessage('press', { slot, seq: seq(), button: 'a' }));
    case 3:
      return JSON.stringify(createMessage('release', { slot, seq: seq(), button: 'b' }));
    case 4:
      return JSON.stringify(
        createMessage('move', { slot, seq: seq(), x: rng.next() * 2 - 1, y: rng.next() * 2 - 1 }),
      );
    case 5:
      return JSON.stringify(
        createMessage('pick-character', { slot, seq: seq(), character: pick(rng, CHARACTER_IDS) }),
      );
    case 6:
      return JSON.stringify(createMessage('ready', { slot, seq: seq() }));
    case 7:
      return JSON.stringify(createMessage('heartbeat', { t: rng.int(0, 1e6) }));
    case 8:
      // Veraltete Sequenznummer.
      return JSON.stringify(createMessage('press', { slot, seq: 0, button: 'a' }));
    case 9:
      return JSON.stringify(createMessage('reconnect', { sessionToken: 'token-0000000000000099' }));
    case 10:
      return JSON.stringify(createMessage('join', { joinCode: CODE, seats: 1 }));
    case 11:
      return JSON.stringify(pick(rng, HOST_COMMANDS));
    case 12:
      return JSON.stringify(createMessage('gesture', { slot, seq: seq(), kind: 'swipe-up' }));
    default:
      return JSON.stringify(
        createMessage('reaction', { slot, seq: seq(), windowId: rng.int(0, 9) }),
      );
  }
}

/** Zufällige Host-Nachricht (ohne Pause/Ende; die steuert der Fuzz-Host gezielt). */
function junkFromHost(rng: Rng, round: number): string {
  switch (rng.int(0, 7)) {
    case 0:
      return pick(rng, GARBAGE);
    case 1:
      return JSON.stringify(createMessage('configure', { rounds: rng.int(1, 20) }));
    case 2:
      return raw('configure', { rounds: rng.int(-5, 30) });
    case 3:
      return JSON.stringify(createMessage('start', { mode: 'board' }));
    case 4:
      return JSON.stringify(createMessage('host-hello', {}));
    case 5:
      return JSON.stringify(createMessage('resume', {}));
    case 6:
      return JSON.stringify(
        createMessage('minigame-result', {
          minigameId: pick(
            rng,
            rotationInfos().map((info) => info.id),
          ),
          round: rng.int(1, round + 1),
          placements: [{ slot: 1, place: 1, score: rng.int(0, 9) }],
        }),
      );
    default:
      return JSON.stringify(
        createMessage('pick-character', { slot: 1, seq: 1, character: 'sock' }),
      );
  }
}

interface FuzzStats {
  junk: number;
  kicked: number;
  reconnects: number;
  hostReloads: number;
  pauses: number;
}

function fuzz(seed: number): { h: Harness; stats: FuzzStats } {
  const rng = createRng(seed);
  const h = new Harness(
    {
      game: {
        seed,
        rounds: 2,
        minigames: rotationInfos().map((info) => ({
          id: info.id,
          playMs: info.durationMs,
          scoring: info.scoring,
        })),
      },
    },
    { useItems: true, reaction: 'shield' },
    seed,
  );
  h.host();
  h.join(1);
  h.join(2);
  h.join(3, 2);
  for (const id of [...h.controllers.keys()]) h.ready(id);
  h.start();
  expect(h.session.phase).toBe('board');

  const stats: FuzzStats = { junk: 0, kicked: 0, reconnects: 0, hostReloads: 0, pauses: 0 };
  let nextId = 1_000;
  const played = new Map<number, number>();
  const sentResult = new Set<number>();
  const pressed = new Map<SlotNumber, number>();
  let manualPauseTicks = 0;

  h.runToEnd(150_000, (x) => {
    // Host: ist er weg (Missbrauch, Herzschlag, Reload), kommt er wieder.
    if (!x.hostConnected) {
      stats.hostReloads++;
      x.host();
    } else if (rng.int(0, 1_499) === 0) {
      stats.hostReloads++;
      x.reloadHost();
    }
    const view = x.boards.at(-1)?.view;
    if (view?.paused) {
      // Eigene Pause nach ein paar Sekunden fortsetzen (eine Auto-Pause endet mit `host()`).
      if (manualPauseTicks > 0) manualPauseTicks--;
      else x.resume();
    } else if (view && view.gamePhase !== 'game-results' && rng.int(0, 399) === 0) {
      stats.pauses++;
      manualPauseTicks = rng.int(1, 80);
      x.pause();
    }
    if (rng.int(0, 99) === 0) x.sendRaw(HOST, junkFromHost(rng, view?.round ?? 1));
    // Selten: Revanche mitten im Spiel (muss out-of-phase sein).
    if (rng.int(0, 999) === 0 && view?.gamePhase !== 'game-results') x.rematch();
    // Sehr selten: später Beitritt über eine neue Verbindung.
    if (rng.int(0, 1_999) === 0) {
      const id = nextId++;
      x.connect(id);
      x.send(id, createMessage('join', { joinCode: CODE, seats: 1 }));
    }

    for (const controller of [...x.controllers.values()]) {
      if (!controller.connected) {
        if (rng.int(0, 29) === 0) {
          stats.reconnects++;
          x.reconnect(controller.id, nextId++);
        }
        continue;
      }
      if (rng.int(0, 1_999) === 0) {
        x.disconnect(controller.id);
        continue;
      }
      if (rng.int(0, 19) === 0) {
        stats.junk++;
        x.sendRaw(
          controller.id,
          junkFromController(rng, controller.slots, () =>
            rng.int(0, 9) === 0 ? rng.int(0, controller.seq) : ++controller.seq,
          ),
        );
        if (!x.controller(controller.id).connected) stats.kicked++;
      }
    }

    // Minispiel: Bots drücken, der Host zählt nur ungepauste Zeit und meldet das Ergebnis.
    pressInMinigame(x, pressed);
    const now = x.boards.at(-1)?.view;
    const minigame = now?.minigame;
    if (now?.gamePhase === 'minigame-play' && minigame && !now.paused) {
      const time = (played.get(minigame.round) ?? 0) + TICK_MS;
      played.set(minigame.round, time);
      if (time >= minigame.playMs && !sentResult.has(minigame.round)) {
        sentResult.add(minigame.round);
        const info = getMinigameInfo(minigame.id);
        x.send(
          HOST,
          createMessage('minigame-result', {
            minigameId: minigame.id,
            round: minigame.round,
            placements: rankByScore(
              now.players.map((p) => ({ slot: p.slot, score: rng.int(0, 3) })),
              info?.scoring,
            ),
          }),
        );
      }
    }
    if (x.gamePhase === 'round-end') pressed.clear();
  });
  return { h, stats };
}

describe('Fuzz: zufällige Nachrichten mehrerer Clients über eine ganze Partie (CHAOS-38)', () => {
  it.each([1, 2, 3, 2026])('Seed %i: keine Ausnahme, kein internal, Partie endet', (seed) => {
    const { h, stats } = fuzz(seed);
    expect(h.gamePhase).toBe('game-results');
    expect(h.errors.filter((e) => e.code === 'internal')).toEqual([]);
    assertContiguousEvents(h);
    // Der Fuzz hat wirklich gestört.
    expect(stats.junk).toBeGreaterThan(100);
    expect(stats.kicked).toBeGreaterThan(0);
    expect(stats.reconnects).toBeGreaterThan(0);
    expect(stats.hostReloads + stats.pauses).toBeGreaterThan(0);
    // Endstand ist vollständig und plausibel.
    const view = h.boards.at(-1)?.view;
    expect(view?.ranking).toHaveLength(4);
    for (const player of view?.players ?? []) expect(player.coins).toBeGreaterThanOrEqual(0);
  });

  it('gleicher Fuzz-Seed → gleicher Ablauf', () => {
    expect(fuzz(7).h.events).toEqual(fuzz(7).h.events);
  });
});
