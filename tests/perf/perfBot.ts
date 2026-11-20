/**
 * Synthetischer Controller für die Messläufe (CHAOS-39): tritt per Node-WebSocket bei, wählt
 * eine Figur, tippt „bereit“, beantwortet jede Brett-Entscheidung und spielt Minispiele wie
 * ein Mensch mit Daumen auf dem Stick: `move` mit 30 Hz (Zufallsweg mit festem Seed), A und B
 * in festen Abständen – soweit das Minispiel sie anbietet. Dazu misst er die Rundlaufzeit
 * Bot → Server → Bot per `heartbeat` jede Sekunde (gleiche Uhr, Node-Prozess).
 *
 * Das ersetzt keine echten iPhones: Funk, Safari und Touch fehlen (Gerätecheckliste M4).
 */
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createRng } from '../../packages/game-core/src/index.ts';
import {
  createMessage,
  encode,
  parseServerToControllerMessage,
  type CharacterId,
  type ClientMessage,
  type ContextMessage,
  type SlotNumber,
} from '../../packages/protocol/src/index.ts';
import type { RunningServer } from '../e2e/fixtures/server.ts';

/** Takt der Stick-Eingaben (wie ein iPhone bei bewegtem Daumen, ADR-006: ~30/s). */
export const MOVE_INTERVAL_MS = 33;
const PRESS_A_EVERY_TICKS = 21; // ≈ 0,7 s
const PRESS_B_EVERY_TICKS = 45; // ≈ 1,5 s
const RELEASE_AFTER_TICKS = 4; // ≈ 130 ms gedrückt

export class PerfBot {
  private seq = 0;
  slot: SlotNumber | null = null;
  lastContext: ContextMessage | null = null;
  /** Rundlaufzeiten Bot → Server → Bot in ms. */
  readonly rtts: number[] = [];
  /** Gesendete Minispiel-Eingaben (move/press/release). */
  inputsSent = 0;
  private picked = false;
  private tick = 0;
  private readonly held = { a: -1, b: -1 };
  private stick = { x: 0, y: 0 };
  private readonly rng: () => number;
  private readonly timers: ReturnType<typeof setInterval>[] = [];

  private constructor(
    private readonly ws: WebSocket,
    private readonly character: CharacterId,
    seed: number,
  ) {
    const rng = createRng(seed);
    this.rng = () => rng.next();
    ws.addEventListener('message', (event: MessageEvent<unknown>) => {
      const parsed = parseServerToControllerMessage(event.data);
      if (!parsed.ok) return;
      const message = parsed.message;
      if (message.type === 'welcome') this.slot = message.players[0]?.slot ?? null;
      else if (message.type === 'context') this.onContext(message);
      else if (message.type === 'heartbeat-ack') {
        const rtt = performance.now() - message.t;
        if (rtt >= 0 && Number.isFinite(rtt)) this.rtts.push(rtt);
      }
    });
    this.timers.push(
      setInterval(() => {
        if (this.open) this.send(createMessage('heartbeat', { t: performance.now() }));
      }, 1000),
      setInterval(() => {
        this.playMinigame();
      }, MOVE_INTERVAL_MS),
    );
  }

  static async join(server: RunningServer, character: CharacterId, seed: number): Promise<PerfBot> {
    const ws = new WebSocket(server.wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => {
        resolve();
      });
      ws.addEventListener('error', () => {
        reject(new Error('Server nicht erreichbar'));
      });
    });
    const bot = new PerfBot(ws, character, seed);
    bot.send(createMessage('join', { joinCode: server.joinCode, seats: 1 }));
    return bot;
  }

  private get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  send(message: ClientMessage) {
    if (this.open) this.ws.send(encode(message));
  }

  private onContext(message: ContextMessage) {
    this.lastContext = message;
    if (message.phase === 'lobby') {
      if (!this.picked) {
        this.picked = true;
        this.send(
          createMessage('pick-character', {
            slot: message.slot,
            seq: ++this.seq,
            character: this.character,
          }),
        );
        return;
      }
      if (message.actions.includes('ready')) {
        this.send(createMessage('ready', { slot: message.slot, seq: ++this.seq }));
      }
      return;
    }
    // CHAOS-214: Minispiel-Anleitung wartet auf „Bereit“ aller.
    if (message.actions.includes('ready')) {
      this.send(createMessage('ready', { slot: message.slot, seq: ++this.seq }));
      return;
    }
    const prompt = message.prompt;
    if (!prompt || !message.actions.includes('choose')) return;
    const ids = prompt.options.map((option) => option.id);
    const option =
      ['roll', 'buy', 'brace', 'cancel'].find((id) => ids.includes(id)) ?? ids[0] ?? 'roll';
    this.send(
      createMessage('choose', { slot: message.slot, seq: ++this.seq, promptId: prompt.id, option }),
    );
  }

  /** Ein Takt im Minispiel: Stick weiterbewegen, Knöpfe drücken/loslassen. */
  private playMinigame() {
    const context = this.lastContext;
    const slot = this.slot;
    if (!context || slot === null || context.layout !== 'joystick-buttons') {
      this.held.a = -1;
      this.held.b = -1;
      return;
    }
    this.tick += 1;
    const actions = context.actions;
    if (actions.includes('move')) {
      // Zufallsweg mit Trägheit, Länge ≤ 1.
      const x = this.stick.x * 0.85 + (this.rng() * 2 - 1) * 0.35;
      const y = this.stick.y * 0.85 + (this.rng() * 2 - 1) * 0.35;
      const length = Math.hypot(x, y);
      this.stick = length > 1 ? { x: x / length, y: y / length } : { x, y };
      const round = (v: number) => Math.round(v * 1000) / 1000;
      this.input(
        createMessage('move', {
          slot,
          seq: ++this.seq,
          x: round(this.stick.x),
          y: round(this.stick.y),
        }),
      );
    }
    for (const [button, every] of [
      ['a', PRESS_A_EVERY_TICKS],
      ['b', PRESS_B_EVERY_TICKS],
    ] as const) {
      if (!actions.includes(button === 'a' ? 'button-a' : 'button-b')) continue;
      if (this.held[button] >= 0 && this.tick - this.held[button] >= RELEASE_AFTER_TICKS) {
        this.input(createMessage('release', { slot, seq: ++this.seq, button }));
        this.held[button] = -1;
      } else if (this.held[button] < 0 && this.tick % every === 0) {
        this.input(createMessage('press', { slot, seq: ++this.seq, button }));
        this.held[button] = this.tick;
      }
    }
  }

  private input(message: ClientMessage) {
    this.inputsSent += 1;
    this.send(message);
  }

  close() {
    for (const timer of this.timers) clearInterval(timer);
    this.ws.close();
  }
}

/** Verzögerung der Node-Ereignisschleife (Server und Bots laufen im Testprozess). */
export function startEventLoopMonitor() {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  return {
    /** p50/p99/max in ms. */
    stop() {
      histogram.disable();
      const ms = (ns: number) => ns / 1e6;
      return {
        p50: ms(histogram.percentile(50)),
        p99: ms(histogram.percentile(99)),
        max: ms(histogram.max),
      };
    },
  };
}
