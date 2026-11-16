/**
 * Synthetischer Controller für Host-Specs (M4, CHAOS-36/37): tritt per Node-WebSocket bei,
 * wählt auf Wunsch eine Figur, tippt „bereit“ und beantwortet im Brettspiel jede Entscheidung
 * (bevorzugt würfeln/kaufen/festhalten). Hält die Verbindung mit Herzschlägen am Leben.
 * Ohne echte Controller-Seite: Die prüfen die Controller-Specs.
 */
import {
  createMessage,
  encode,
  parseServerToControllerMessage,
  type CharacterId,
  type ClientMessage,
  type ContextMessage,
  type SlotNumber,
} from '../../../packages/protocol/src/index.ts';
import type { RunningServer } from './server.ts';

export interface LobbyBotOptions {
  /** Figur, die der Bot nach dem Beitritt wählt (sonst keine Wahl). */
  readonly character?: CharacterId;
  /** In der Lobby automatisch „bereit“ tippen (Standard: ja). */
  readonly autoReady?: boolean;
  /** Im Brettspiel Entscheidungen beantworten (Standard: ja). */
  readonly autoChoose?: boolean;
  readonly name?: string;
}

export class LobbyBot {
  private seq = 0;
  slot: SlotNumber | null = null;
  lastContext: ContextMessage | null = null;
  autoReady: boolean;
  private picked = false;
  private readonly heartbeat = setInterval(() => {
    if (this.ws.readyState === WebSocket.OPEN) this.send(createMessage('heartbeat', { t: 1 }));
  }, 4000);

  private constructor(
    private readonly ws: WebSocket,
    private readonly options: LobbyBotOptions,
  ) {
    this.autoReady = options.autoReady ?? true;
    ws.addEventListener('message', (event: MessageEvent<unknown>) => {
      const parsed = parseServerToControllerMessage(event.data);
      if (!parsed.ok) return;
      const message = parsed.message;
      if (message.type === 'welcome') this.slot = message.players[0]?.slot ?? null;
      else if (message.type === 'context') this.onContext(message);
    });
  }

  static async join(server: RunningServer, options: LobbyBotOptions = {}): Promise<LobbyBot> {
    const ws = new WebSocket(server.wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => {
        resolve();
      });
      ws.addEventListener('error', () => {
        reject(new Error('Server nicht erreichbar'));
      });
    });
    const bot = new LobbyBot(ws, options);
    bot.send(
      createMessage('join', {
        joinCode: server.joinCode,
        seats: 1,
        ...(options.name ? { names: [options.name] } : {}),
      }),
    );
    return bot;
  }

  send(message: ClientMessage) {
    this.ws.send(encode(message));
  }

  /** „Bereit“ tippen (falls angeboten). */
  ready() {
    const context = this.lastContext;
    if (context?.actions.includes('ready')) {
      this.send(createMessage('ready', { slot: context.slot, seq: ++this.seq }));
    }
  }

  pick(character: CharacterId) {
    if (this.slot === null) throw new Error('Bot hat noch keinen Platz');
    this.send(createMessage('pick-character', { slot: this.slot, seq: ++this.seq, character }));
  }

  private onContext(message: ContextMessage) {
    this.lastContext = message;
    if (message.phase === 'lobby') {
      if (this.options.character && !this.picked) {
        this.picked = true;
        this.send(
          createMessage('pick-character', {
            slot: message.slot,
            seq: ++this.seq,
            character: this.options.character,
          }),
        );
        return;
      }
      if (this.autoReady && message.actions.includes('ready')) this.ready();
      return;
    }
    if (this.options.autoChoose === false) return;
    const prompt = message.prompt;
    if (!prompt || !message.actions.includes('choose')) return;
    const ids = prompt.options.map((option) => option.id);
    const option =
      ['roll', 'buy', 'brace', 'cancel'].find((id) => ids.includes(id)) ?? ids[0] ?? 'roll';
    this.send(
      createMessage('choose', { slot: message.slot, seq: ++this.seq, promptId: prompt.id, option }),
    );
  }

  close() {
    clearInterval(this.heartbeat);
    this.ws.close();
  }
}
