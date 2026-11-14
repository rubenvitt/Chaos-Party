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
  type ControllerMessage,
  type ErrorCode,
  type Layout,
  type Phase,
  type ServerToControllerMessage,
} from '../../../packages/protocol/src/index.ts';

export const VALID_CODE = 'ABCD';
export const FAKE_TOKEN = 'fake_session_token_0001';

export const LOBBY_ACTIONS: Action[] = ['ready'];
export const PLAY_ACTIONS: Action[] = ['move', 'button-a', 'button-b'];

type MessageOfType<T extends ControllerMessage['type']> = Extract<ControllerMessage, { type: T }>;

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
        this.phase = 'play';
        this.sendContext('play', 'joystick-buttons', PLAY_ACTIONS);
        return;
      case 'heartbeat':
        this.send(createMessage('heartbeat-ack', { t: message.t }));
        return;
      default:
        return;
    }
  }

  private welcome() {
    const { color, label } = PLAYER_SLOTS[1];
    this.send(
      createMessage('welcome', { sessionToken: FAKE_TOKEN, players: [{ slot: 1, color, label }] }),
    );
    if (this.phase === 'lobby') this.sendContext('lobby', 'lobby', LOBBY_ACTIONS);
    else this.sendContext('play', 'joystick-buttons', PLAY_ACTIONS);
  }

  send(message: ServerToControllerMessage) {
    this.socket?.send(encode(message));
  }

  sendContext(phase: Phase, layout: Layout, actions: Action[]) {
    this.send(createMessage('context', { slot: 1, phase, layout, actions }));
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
