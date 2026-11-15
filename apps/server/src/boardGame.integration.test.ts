/**
 * CHAOS-23: Deterministische Integrationstests für den kompletten Zugzyklus.
 *
 * Session (Server) + game-core + synthetische Controller und Host, künstliche Uhr im
 * 100-ms-Takt wie im echten Server. Jede ausgehende Nachricht wird mit dem echten
 * Protokoll-Parser geprüft. Die Bots antworten nur auf das, was der Server ihnen im
 * `context` anbietet – genau wie die echten Controller.
 *
 * Seeds sind fest und in `docs/progress.md` dokumentiert.
 */
import {
  createMessage,
  parseServerMessage,
  type BoardEvent,
  type BoardMessage,
  type ClientMessage,
  type ContextMessage,
  type ServerMessage,
  type SlotNumber,
} from '@chaos-party/protocol';
import { createRng } from '@chaos-party/game-core';
import { describe, expect, it } from 'vitest';
import { Session, type ConnectionId, type Outgoing, type SessionOptions } from './session.ts';

const CODE = 'ABCD';
const HOST = 100;
const TICK_MS = 100;
/** Bedenkzeit der Bots, bevor sie antworten (virtuelle ms). */
const THINK_MS = 300;
const HEARTBEAT_MS = 5_000;

/** Seeds der Integrationstests (dokumentiert in docs/progress.md). */
export const INTEGRATION_SEEDS = { two: 20261115, three: 7, four: 424242 } as const;

type ReactionPolicy = 'brace' | 'shield' | 'timeout' | 'late';

interface BotPolicy {
  /** Setzt Items ein, sobald angeboten (für Sabotage-Abdeckung). */
  readonly useItems: boolean;
  readonly reaction: ReactionPolicy;
}

interface Controller {
  readonly id: ConnectionId;
  readonly slots: SlotNumber[];
  token: string | null;
  seq: number;
  connected: boolean;
}

class Harness {
  clock = 1_000;
  readonly session: Session;
  readonly controllers = new Map<ConnectionId, Controller>();
  /** Letzter Kontext je Slot. */
  readonly contexts = new Map<SlotNumber, { context: ContextMessage; at: number }>();
  /** Alle `board`-Nachrichten an den Host, in Reihenfolge. */
  readonly boards: BoardMessage[] = [];
  /** Fehler je Verbindung. */
  readonly errors: { to: ConnectionId; code: string }[] = [];
  /** Prompts, auf die ein Bot schon geantwortet hat (Slot:PromptId). */
  private readonly answered = new Set<string>();
  /** Reaktionen, die absichtlich erst nach der Frist gesendet werden (Politik `late`). */
  private readonly lateReactions: { slot: SlotNumber; promptId: number; sendAt: number }[] = [];
  private readonly rng;

  constructor(
    options: Partial<SessionOptions>,
    private readonly policy: BotPolicy,
    botSeed = 1,
  ) {
    let tokens = 0;
    this.rng = createRng(botSeed);
    this.session = new Session({
      joinCode: CODE,
      now: () => this.clock,
      createToken: () => `token-${String(++tokens).padStart(16, '0')}`,
      logError: (error) => {
        throw error;
      },
      ...options,
    });
  }

  private handle(out: Outgoing[]): void {
    for (const action of out) {
      if (action.kind === 'close') {
        const controller = this.controllers.get(action.to);
        if (controller) controller.connected = false;
        continue;
      }
      const parsed = parseServerMessage(JSON.stringify(action.message));
      expect(parsed.ok, JSON.stringify(action.message)).toBe(true);
      this.receive(action.to, action.message);
    }
  }

  private receive(to: ConnectionId, message: ServerMessage): void {
    switch (message.type) {
      case 'board':
        if (to === HOST) this.boards.push(message);
        return;
      case 'context':
        this.contexts.set(message.slot, { context: message, at: this.clock });
        return;
      case 'welcome': {
        const controller = this.controllers.get(to);
        if (controller) controller.token = message.sessionToken;
        return;
      }
      case 'error':
        this.errors.push({ to, code: message.code });
        return;
      default:
        return;
    }
  }

  send(id: ConnectionId, message: ClientMessage): void {
    this.handle(this.session.message(id, JSON.stringify(message)));
  }

  host(): void {
    this.handle(this.session.connect(HOST));
    this.send(HOST, createMessage('host-hello', {}));
  }

  /** Seiten-Reload am PC: Host-Verbindung weg, neuer Host meldet sich. */
  reloadHost(): void {
    this.handle(this.session.disconnect(HOST));
    this.host();
  }

  join(id: ConnectionId, seats = 1): void {
    this.handle(this.session.connect(id));
    const slotsBefore = new Set(this.session.snapshot().players.map((p) => p.slot));
    this.controllers.set(id, { id, slots: [], token: null, seq: 0, connected: true });
    this.send(id, createMessage('join', { joinCode: CODE, seats }));
    const slots = this.session
      .snapshot()
      .players.map((p) => p.slot)
      .filter((slot) => !slotsBefore.has(slot));
    const controller = this.controllers.get(id);
    if (controller) controller.slots.push(...slots);
  }

  ready(id: ConnectionId): void {
    const controller = this.controller(id);
    for (const slot of controller.slots) {
      this.send(id, createMessage('ready', { slot, seq: ++controller.seq }));
    }
  }

  start(rounds?: number): void {
    this.send(
      HOST,
      createMessage('start', rounds === undefined ? { mode: 'board' } : { mode: 'board', rounds }),
    );
  }

  disconnect(id: ConnectionId): void {
    this.controller(id).connected = false;
    this.handle(this.session.disconnect(id));
  }

  /** Neue Verbindung mit gespeichertem Token (wie der echte Controller nach Netzverlust). */
  reconnect(oldId: ConnectionId, newId: ConnectionId): void {
    const old = this.controller(oldId);
    if (!old.token) throw new Error('kein Token');
    this.controllers.delete(oldId);
    this.controllers.set(newId, {
      id: newId,
      slots: old.slots,
      token: old.token,
      seq: 0,
      connected: true,
    });
    this.handle(this.session.connect(newId));
    this.send(newId, createMessage('reconnect', { sessionToken: old.token }));
  }

  choose(id: ConnectionId, slot: SlotNumber, promptId: number, option: string): void {
    const controller = this.controller(id);
    this.send(id, createMessage('choose', { slot, seq: ++controller.seq, promptId, option }));
  }

  controller(id: ConnectionId): Controller {
    const controller = this.controllers.get(id);
    if (!controller) throw new Error(`Controller ${String(id)} fehlt`);
    return controller;
  }

  controllerOf(slot: SlotNumber): Controller {
    for (const controller of this.controllers.values()) {
      if (controller.slots.includes(slot)) return controller;
    }
    throw new Error(`kein Controller für Slot ${String(slot)}`);
  }

  tick(): void {
    this.clock += TICK_MS;
    // Herzschlag alle 5 s wie die echten Clients (sonst trennt der Server nach 15 s/30 s).
    if (this.clock % HEARTBEAT_MS === 0) {
      for (const controller of this.controllers.values()) {
        if (controller.connected) {
          this.send(controller.id, createMessage('heartbeat', { t: this.clock }));
        }
      }
      if (this.hostConnected) this.send(HOST, createMessage('heartbeat', { t: this.clock }));
    }
    this.handle(this.session.tick());
  }

  get hostConnected(): boolean {
    return this.session.snapshot().hostConnected;
  }

  get events(): BoardEvent[] {
    return this.boards.flatMap((board) => board.events);
  }

  get gamePhase(): string | undefined {
    return this.boards.at(-1)?.view.gamePhase;
  }

  /** Bots beantworten offene Prompts nach ihrer Bedenkzeit. */
  answerPrompts(): void {
    for (const late of this.lateReactions.filter((entry) => this.clock >= entry.sendAt)) {
      this.lateReactions.splice(this.lateReactions.indexOf(late), 1);
      this.choose(this.controllerOf(late.slot).id, late.slot, late.promptId, 'brace');
    }
    for (const [slot, { context, at }] of this.contexts) {
      const prompt = context.prompt;
      if (!prompt || !context.actions.includes('choose')) continue;
      const controller = this.controllerOf(slot);
      if (!controller.connected) continue;
      const key = `${String(slot)}:${String(prompt.id)}`;
      if (this.answered.has(key)) continue;
      if (prompt.kind === 'reaction') {
        if (this.policy.reaction === 'timeout') continue;
        if (this.policy.reaction === 'late') {
          // Antwort erst nach Ablauf der Frist: Der Server muss sie abweisen.
          this.answered.add(key);
          this.lateReactions.push({
            slot,
            promptId: prompt.id,
            sendAt: at + (prompt.remainingMs ?? 0) + TICK_MS,
          });
          continue;
        }
        if (this.clock - at < THINK_MS) continue;
      } else if (this.clock - at < THINK_MS) continue;
      this.answered.add(key);
      this.choose(controller.id, slot, prompt.id, this.pick(prompt));
    }
  }

  private pick(prompt: NonNullable<ContextMessage['prompt']>): string {
    const ids = prompt.options.map((option) => option.id);
    switch (prompt.kind) {
      case 'roll': {
        const item = ids.find((id) => id.startsWith('item:'));
        return this.policy.useItems && item !== undefined ? item : 'roll';
      }
      case 'target':
        return ids.find((id) => id.startsWith('slot:')) ?? 'cancel';
      case 'trophy':
        return 'buy';
      case 'reaction':
        if (this.policy.reaction === 'shield' && ids.includes('shield')) return 'shield';
        return 'brace';
      case 'path':
      default:
        return ids[this.rng.int(0, ids.length - 1)] ?? ids[0] ?? 'roll';
    }
  }

  /** Spielt, bis das Ergebnis feststeht (oder die Grenze erreicht ist). */
  runToEnd(maxTicks = 200_000, onTick?: (h: Harness) => void): void {
    for (let i = 0; i < maxTicks && this.gamePhase !== 'game-results'; i++) {
      this.answerPrompts();
      onTick?.(this);
      this.tick();
    }
  }
}

function setupGame(
  players: number,
  seed: number,
  options: { rounds?: number; policy?: Partial<BotPolicy>; seats?: number[] } = {},
): Harness {
  const h = new Harness(
    { game: { seed, rounds: options.rounds ?? 3 } },
    { useItems: true, reaction: 'brace', ...options.policy },
    seed,
  );
  h.host();
  const seats = options.seats ?? Array.from({ length: players }, () => 1);
  seats.forEach((count, index) => {
    h.join(index + 1, count);
  });
  for (const id of h.controllers.keys()) h.ready(id);
  h.start();
  return h;
}

function expectContiguousEvents(h: Harness): void {
  let expected = 0;
  for (const board of h.boards) {
    if (board.events.length === 0) continue;
    expect(board.eventSeq).toBe(expected);
    expected += board.events.length;
  }
}

function turnsPerSlot(events: BoardEvent[]): Map<number, number> {
  const turns = new Map<number, number>();
  for (const event of events) {
    if (event.type === 'turn-started') turns.set(event.slot, (turns.get(event.slot) ?? 0) + 1);
  }
  return turns;
}

describe('Brettspiel über die Session (CHAOS-23)', () => {
  it.each([
    [2, INTEGRATION_SEEDS.two],
    [3, INTEGRATION_SEEDS.three],
    [4, INTEGRATION_SEEDS.four],
  ])('%i Spieler spielen 3 komplette Runden bis zum Endstand (Seed %i)', (players, seed) => {
    const h = setupGame(players, seed);
    expect(h.session.phase).toBe('board');
    h.runToEnd();

    const last = h.boards.at(-1);
    expect(last?.view.gamePhase).toBe('game-results');
    expect(last?.view.ranking).toHaveLength(players);
    expectContiguousEvents(h);

    const events = h.events;
    expect(events[0]?.type).toBe('game-started');
    expect(events.filter((e) => e.type === 'round-ended')).toHaveLength(3);
    expect(events.filter((e) => e.type === 'minigame-results')).toHaveLength(3);
    expect(events.at(-1)?.type).toBe('game-ended');
    // Jeder Spieler war in jeder Runde genau einmal dran.
    expect([...turnsPerSlot(events).values()]).toEqual(Array.from({ length: players }, () => 3));
    // Würfeln und Laufen kamen bei jedem Zug vor.
    expect(events.filter((e) => e.type === 'dice-rolled').length).toBe(players * 3);
    expect(events.some((e) => e.type === 'moved')).toBe(true);
    // Münzen nie negativ, Endstand passt zum Ranking.
    for (const view of h.boards.map((b) => b.view)) {
      for (const player of view.players) expect(player.coins).toBeGreaterThanOrEqual(0);
    }
    // Controller sehen am Ende ihren Platz.
    for (const slot of last?.view.turnOrder ?? []) {
      expect(h.contexts.get(slot)?.context.board?.place).toBeGreaterThanOrEqual(1);
    }
    // Keine unerwarteten Fehler im normalen Ablauf.
    expect(h.errors).toEqual([]);
  });

  it('gleicher Seed → gleicher Ablauf, anderer Seed → anderer Ablauf', () => {
    const run = (seed: number) => {
      const h = setupGame(3, seed);
      h.runToEnd();
      return h.events;
    };
    const a = run(INTEGRATION_SEEDS.three);
    const b = run(INTEGRATION_SEEDS.three);
    expect(b).toEqual(a);
    expect(run(INTEGRATION_SEEDS.three + 1)).not.toEqual(a);
  });

  it('gemischte Aufstellung: iPhone + geteiltes iPad mit zwei Zonen', () => {
    const h = setupGame(3, INTEGRATION_SEEDS.three, { seats: [1, 2], rounds: 2 });
    expect(h.controllers.get(2)?.slots).toEqual([2, 3]);
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    expect([...turnsPerSlot(h.events).keys()].sort()).toEqual([1, 2, 3]);
    expect(h.errors).toEqual([]);
  });

  it('Disconnect mitten im Zug: Auto-Wahl nach der Schonfrist, Rückkehr mit Token, Partie endet', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 2 });
    let disconnected = false;
    let reconnected = false;
    let disconnectedAt = 0;
    h.runToEnd(200_000, (harness) => {
      if (!disconnected) {
        // Sobald Slot 2 würfeln soll: Verbindung weg.
        const prompt = harness.contexts.get(2)?.context.prompt;
        if (prompt?.kind === 'roll') {
          harness.disconnect(2);
          disconnected = true;
          disconnectedAt = harness.clock;
        }
        return;
      }
      if (!reconnected && harness.events.some((e) => e.type === 'player-auto' && e.slot === 2)) {
        harness.reconnect(2, 22);
        reconnected = true;
      }
    });

    expect([disconnected, reconnected]).toEqual([true, true]);
    const auto = h.events.find((e) => e.type === 'player-auto');
    expect(auto).toMatchObject({ slot: 2, reason: 'disconnected', option: 'roll' });
    // Während der Trennung zeigt der Host den Spieler als getrennt.
    expect(
      h.boards.some((b) => b.view.players.find((p) => p.slot === 2)?.connected === false),
    ).toBe(true);
    // Die Auto-Wahl kam frühestens nach der Schonfrist (Standard 15 s).
    const autoBoardIndex = h.boards.findIndex((b) =>
      b.events.some((e) => e.type === 'player-auto'),
    );
    expect(autoBoardIndex).toBeGreaterThan(-1);
    expect(h.clock - disconnectedAt).toBeGreaterThanOrEqual(15_000);
    expect(h.gamePhase).toBe('game-results');
    expect(h.boards.at(-1)?.view.players.every((p) => p.connected)).toBe(true);
  });

  it('Reaktionsfenster: Festhalten halbiert den Klau, Timeout klaut voll, späte Wahl wird abgewiesen', () => {
    const results = new Map<ReactionPolicy, BoardEvent[]>();
    const errors = new Map<ReactionPolicy, string[]>();
    for (const reaction of ['brace', 'timeout', 'late'] as const) {
      const h = setupGame(3, INTEGRATION_SEEDS.three, { rounds: 10, policy: { reaction } });
      h.runToEnd();
      expect(h.gamePhase).toBe('game-results');
      results.set(reaction, h.events);
      errors.set(
        reaction,
        h.errors.map((e) => e.code),
      );
    }
    const resolved = (policy: ReactionPolicy) =>
      (results.get(policy) ?? []).flatMap((e) =>
        e.type === 'reaction-resolved' ? [e.result] : [],
      );
    expect(resolved('brace').length).toBeGreaterThan(0);
    expect(resolved('brace').every((result) => result === 'brace')).toBe(true);
    expect(resolved('timeout').every((result) => result === 'timeout')).toBe(true);
    // Verspätete Reaktion: Fenster schließt per Timeout, die Wahl bekommt `invalid-choice`.
    expect(resolved('late').every((result) => result === 'timeout')).toBe(true);
    expect(errors.get('late')).toContain('invalid-choice');
    expect(errors.get('brace')).toEqual([]);
  });

  it('Aktionen außerhalb der Reihe werden abgewiesen, ohne die Verbindung zu gefährden', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    // Warten, bis jemand würfeln soll.
    for (let i = 0; i < 100 && ![...h.contexts.values()].some((c) => c.context.prompt); i++) {
      h.tick();
    }
    const active = [...h.contexts.entries()].find(([, c]) => c.context.prompt);
    expect(active).toBeDefined();
    if (!active) return;
    const [activeSlot, { context }] = active;
    const promptId = context.prompt?.id ?? 0;
    const other: SlotNumber = activeSlot === 1 ? 2 : 1;

    // Der andere Spieler versucht, für den aktuellen Prompt zu wählen.
    h.choose(h.controllerOf(other).id, other, promptId, 'roll');
    expect(h.errors.at(-1)).toEqual({ to: h.controllerOf(other).id, code: 'invalid-choice' });
    // Falsche Option und veraltete Prompt-ID beim aktiven Spieler.
    h.choose(h.controllerOf(activeSlot).id, activeSlot, promptId, 'teleport');
    expect(h.errors.at(-1)?.code).toBe('invalid-choice');
    h.choose(h.controllerOf(activeSlot).id, activeSlot, promptId + 5, 'roll');
    expect(h.errors.at(-1)?.code).toBe('invalid-choice');
    // Arena-Eingaben in der Brettphase sind out-of-phase.
    const c = h.controllerOf(activeSlot);
    h.send(c.id, createMessage('move', { slot: activeSlot, seq: ++c.seq, x: 1, y: 0 }));
    expect(h.errors.at(-1)?.code).toBe('out-of-phase');
    // Danach geht es normal weiter.
    h.choose(c.id, activeSlot, promptId, 'roll');
    expect(h.events.some((e) => e.type === 'dice-rolled')).toBe(true);
    expect(h.controllerOf(activeSlot).connected).toBe(true);
  });

  it('neu verbundener Host bekommt sofort den vollständigen Brett-Stand', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    for (let i = 0; i < 30; i++) h.tick();
    h.reloadHost();
    const snapshot = h.boards.at(-1);
    expect(snapshot?.events).toEqual([]);
    expect(snapshot?.view.players).toHaveLength(2);
  });

  it('Start im Arena-Modus bleibt die M1-Arena', () => {
    const h = new Harness({}, { useItems: false, reaction: 'brace' });
    h.host();
    h.join(1);
    h.send(HOST, createMessage('start', { mode: 'arena' }));
    expect(h.session.phase).toBe('play');
    expect(h.contexts.get(1)?.context.layout).toBe('joystick-buttons');
    expect(h.boards).toEqual([]);
  });
});
