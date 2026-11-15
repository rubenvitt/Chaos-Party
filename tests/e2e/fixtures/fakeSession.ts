/**
 * Nachgebauter Session-Server für Controller-E2E-Tests (ADR-006).
 *
 * Playwright fängt die WebSocket-Verbindung des Controllers zu `/ws` im Browser ab
 * (`page.routeWebSocket`); es wird **kein** echter Server gestartet. Der Fake
 * spricht gerade genug von ADR-003, um den Controller durch Lobby und Spiel zu
 * führen, und prüft jede empfangene Nachricht mit dem echten Protokoll-Parser.
 * So bleibt der Test unabhängig vom echten Server (CHAOS-9) und deterministisch.
 */
import type { Page, WebSocketRoute } from '@playwright/test';
import {
  createError,
  createMessage,
  encode,
  parseControllerMessage,
  PLAYER_SLOTS,
  type Action,
  type ControllerBoardInfo,
  type ControllerMessage,
  type ErrorCode,
  type Layout,
  type Phase,
  type PromptInfo,
  type ServerToControllerMessage,
  type SlotNumber,
} from '../../../packages/protocol/src/index.ts';

export { PROTOCOL_VERSION } from '../../../packages/protocol/src/index.ts';

export const VALID_CODE = 'ABCD';
export const FAKE_TOKEN = 'fake_session_token_0001';

export const LOBBY_ACTIONS: Action[] = ['ready'];
export const PLAY_ACTIONS: Action[] = ['move', 'button-a', 'button-b'];

type MessageOfType<T extends ControllerMessage['type']> = Extract<ControllerMessage, { type: T }>;

/* ---------------------------------------------------------------------------
 * Brettphase (M2, CHAOS-22): Bausteine für `context { phase: 'board', prompt, board }`
 * ------------------------------------------------------------------------- */

/** Persönlicher Stand mit sinnvollen Standardwerten. */
export function boardInfo(extra: Partial<ControllerBoardInfo> = {}): ControllerBoardInfo {
  return {
    gamePhase: 'roll',
    round: 2,
    rounds: 5,
    coins: 12,
    trophies: 1,
    items: ['double-dice', 'trap'],
    activeSlot: 1,
    ...extra,
  };
}

/** Prompts, wie sie die Regeln (`@chaos-party/game-core`) anbieten. */
export const PROMPTS = {
  roll: (id: number, slot: SlotNumber = 1): PromptInfo => ({
    id,
    slot,
    kind: 'roll',
    title: 'Du bist dran!',
    options: [
      { id: 'roll', label: 'Würfeln!' },
      { id: 'item:double-dice', label: 'Doppelwürfel' },
      { id: 'item:trap', label: 'Falle legen' },
    ],
    remainingMs: null,
  }),
  path: (id: number, slot: SlotNumber = 1): PromptInfo => ({
    id,
    slot,
    kind: 'path',
    title: 'Welcher Weg?',
    options: [
      { id: 's12', label: 'Pilzpfad', detail: 'links, kurz' },
      { id: 's20', label: 'Brückenweg', detail: 'rechts, Münzen' },
    ],
    remainingMs: null,
  }),
  trophy: (id: number, slot: SlotNumber = 1): PromptInfo => ({
    id,
    slot,
    kind: 'trophy',
    title: 'Trophäe kaufen?',
    options: [
      { id: 'buy', label: 'Kaufen', detail: '10 Münzen' },
      { id: 'skip', label: 'Weiter' },
    ],
    remainingMs: null,
  }),
  target: (id: number, slot: SlotNumber = 1): PromptInfo => ({
    id,
    slot,
    kind: 'target',
    title: 'Wen beklauen?',
    options: [
      { id: 'slot:2', label: 'Orange', slot: 2 },
      { id: 'slot:3', label: 'Grün', slot: 3 },
      { id: 'cancel', label: 'Abbrechen' },
    ],
    remainingMs: null,
  }),
  reaction: (id: number, slot: SlotNumber = 1, remainingMs = 3000): PromptInfo => ({
    id,
    slot,
    kind: 'reaction',
    title: 'Münzklau! Schnell!',
    options: [
      { id: 'shield', label: 'Schild!' },
      { id: 'brace', label: 'Festhalten!' },
    ],
    remainingMs,
  }),
} as const;

export class FakeSession {
  /** Alle gültigen Nachrichten des Controllers in Empfangsreihenfolge (über alle Verbindungen). */
  readonly received: ControllerMessage[] = [];
  /** Nachrichten, die der Protokoll-Parser abgelehnt hat (sollte leer bleiben). */
  readonly invalid: string[] = [];
  /** Erste Nachricht jeder Verbindung (Handshake). */
  readonly handshakes: ControllerMessage[] = [];
  private socket: WebSocketRoute | null = null;
  private firstOfConnection = false;
  private phase: Phase = 'lobby';
  /** Plätze der Verbindung aus `join { seats }` (geteiltes iPad: 2–4, CHAOS-13). */
  private seats = 1;
  private readonly readySlots = new Set<SlotNumber>();
  /** Letzter Brett-Kontext je Slot (wird nach einem Wiederverbinden erneut gesendet). */
  private readonly boardContexts = new Map<SlotNumber, ServerToControllerMessage>();
  /** Antwort des Tests auf eine Wahl (`choose`), z. B. nächster Kontext oder `invalid-choice`. */
  onChoose: ((message: MessageOfType<'choose'>) => void) | null = null;

  static async attach(page: Page): Promise<FakeSession> {
    const fake = new FakeSession();
    await page.routeWebSocket(/\/ws$/, (ws) => {
      fake.accept(ws);
    });
    return fake;
  }

  /** Anzahl der WebSocket-Verbindungen, die der Controller geöffnet hat. */
  connections = 0;

  private accept(ws: WebSocketRoute) {
    this.connections += 1;
    this.socket = ws;
    this.firstOfConnection = true;
    ws.onMessage((raw) => {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      const result = parseControllerMessage(text);
      if (!result.ok) {
        this.invalid.push(text);
        return;
      }
      if (this.firstOfConnection) {
        this.firstOfConnection = false;
        this.handshakes.push(result.message);
      }
      this.received.push(result.message);
      this.handle(result.message);
    });
  }

  private handle(message: ControllerMessage) {
    switch (message.type) {
      case 'join':
        if (message.joinCode !== VALID_CODE) {
          this.sendError('bad-join-code', 'Unbekannter Join-Code');
          return;
        }
        this.seats = message.seats;
        this.welcome();
        return;
      case 'reconnect':
        if (message.sessionToken !== FAKE_TOKEN) {
          this.sendError('bad-token', 'Unbekanntes Token');
          return;
        }
        this.welcome();
        return;
      case 'ready':
        // Erst wenn alle Plätze bereit sind, beginnt das Spiel (bei einem Platz sofort).
        this.readySlots.add(message.slot);
        if (this.readySlots.size < this.seats) {
          this.sendContext('lobby', 'wait', [], message.slot);
          return;
        }
        this.phase = 'play';
        for (const slot of this.slots())
          this.sendContext('play', 'joystick-buttons', PLAY_ACTIONS, slot);
        return;
      case 'heartbeat':
        this.send(createMessage('heartbeat-ack', { t: message.t }));
        return;
      case 'choose':
        this.onChoose?.(message);
        return;
      default:
        return;
    }
  }

  /** Slots dieser Verbindung (1 … seats). */
  slots(): SlotNumber[] {
    return ([1, 2, 3, 4] as const).slice(0, this.seats);
  }

  private welcome() {
    const players = this.slots().map((slot) => {
      const { color, label } = PLAYER_SLOTS[slot];
      return { slot, color, label };
    });
    this.send(createMessage('welcome', { sessionToken: FAKE_TOKEN, players }));
    for (const slot of this.slots()) {
      const board = this.boardContexts.get(slot);
      if (this.phase === 'board' && board) this.send(board);
      else if (this.phase === 'play')
        this.sendContext('play', 'joystick-buttons', PLAY_ACTIONS, slot);
      else if (this.readySlots.has(slot)) this.sendContext('lobby', 'wait', [], slot);
      else this.sendContext('lobby', 'lobby', LOBBY_ACTIONS, slot);
    }
  }

  send(message: ServerToControllerMessage) {
    this.socket?.send(encode(message));
  }

  sendContext(phase: Phase, layout: Layout, actions: Action[], slot: SlotNumber = 1) {
    this.send(createMessage('context', { slot, phase, layout, actions }));
  }

  /**
   * Brettphase für einen Slot: Stand und optional eine offene Entscheidung (dann mit
   * Aktion `choose`). Wechselt die Sitzung in Phase `board`.
   */
  sendBoard(slot: SlotNumber, board: ControllerBoardInfo, prompt?: PromptInfo) {
    this.phase = 'board';
    const message = createMessage('context', {
      slot,
      phase: 'board',
      layout: 'board',
      actions: prompt ? ['choose'] : [],
      board,
      ...(prompt && { prompt }),
    });
    this.boardContexts.set(slot, message);
    this.send(message);
  }

  sendError(code: ErrorCode, text: string, seq?: number) {
    this.send(createError(code, text, seq));
  }

  /** Server beendet die Verbindung (z. B. PC-Neustart). */
  async drop() {
    await this.socket?.close({ code: 1001, reason: 'Server weg' });
  }

  ofType<T extends ControllerMessage['type']>(type: T): MessageOfType<T>[] {
    return this.received.filter((m): m is MessageOfType<T> => m.type === type);
  }

  /** Alle Slot-Eingaben (mit `seq`) in Empfangsreihenfolge. */
  intents(): Extract<ControllerMessage, { seq: number }>[] {
    return this.received.filter(
      (m): m is Extract<ControllerMessage, { seq: number }> => 'seq' in m,
    );
  }
}
