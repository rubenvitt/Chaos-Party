/**
 * Synthetischer Host für Controller-Specs gegen den **echten** Server (M4, CHAOS-36/37/38).
 *
 * Eine WebSocket-Verbindung aus dem Testprozess, die sich als Host meldet und die
 * Host-Befehle von Protokoll v4 sendet (`configure`, `start`, `pause`, `resume`, `end-game`,
 * `rematch`). So prüfen Controller-Specs Lobby, Pause, Endstand und Revanche am echten
 * Vertrag, ohne die Host-Seite (Babylon, Software-Rendering) zu öffnen. Was der Host am
 * Bildschirm zeigt, prüfen die Host-Specs.
 */
import {
  createMessage,
  encode,
  type HostMessage,
  type ServerToHostMessage,
} from '../../../packages/protocol/src/index.ts';
import type { RunningServer } from './server.ts';

export class SyntheticHost {
  /** Alle Nachrichten vom Server (ungeprüft geparst, nur für Wartebedingungen). */
  readonly received: ServerToHostMessage[] = [];
  private readonly heartbeat: ReturnType<typeof setInterval>;

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        this.received.push(JSON.parse(event.data) as ServerToHostMessage);
      }
    });
    // Herzschlag, damit der Server den Host nicht nach Stille trennt (ADR-009).
    this.heartbeat = setInterval(() => {
      this.send(createMessage('heartbeat', { t: Date.now() }));
    }, 2000);
  }

  static async connect(server: RunningServer): Promise<SyntheticHost> {
    const ws = new WebSocket(server.wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => {
        resolve();
      });
      ws.addEventListener('error', () => {
        reject(new Error('Server nicht erreichbar'));
      });
    });
    const host = new SyntheticHost(ws);
    host.send(createMessage('host-hello', {}));
    return host;
  }

  send(message: HostMessage) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encode(message));
  }

  configure(rounds: number) {
    this.send(createMessage('configure', { rounds }));
  }

  start(rounds?: number) {
    this.send(createMessage('start', rounds === undefined ? {} : { rounds }));
  }

  pause() {
    this.send(createMessage('pause', {}));
  }

  resume() {
    this.send(createMessage('resume', {}));
  }

  endGame() {
    this.send(createMessage('end-game', {}));
  }

  rematch() {
    this.send(createMessage('rematch', {}));
  }

  /** Letzter Lobby-Stand, den der Server dem Host geschickt hat. */
  lastLobby(): Extract<ServerToHostMessage, { type: 'lobby' }> | undefined {
    return this.received.findLast(
      (m): m is Extract<ServerToHostMessage, { type: 'lobby' }> => m.type === 'lobby',
    );
  }

  close() {
    clearInterval(this.heartbeat);
    this.ws.close();
  }
}
