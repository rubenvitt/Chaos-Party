/**
 * Autoritative Session ohne Netzwerkcode (CHAOS-9, ADR-005).
 *
 * Die Session kennt nur Verbindungs-IDs und Rohtexte. Der WebSocket-Adapter
 * (`socket.ts`) meldet `connect`, `message` und `disconnect`; jede Methode
 * liefert die daraus folgenden Aktionen (`send`/`close`) zurück, die der
 * Adapter ausführt. Uhr und Token-Erzeugung sind injizierbar, damit
 * Unit-Tests deterministisch laufen.
 *
 * Ablauf und Prüfreihenfolge je Nachricht:
 * Rate-Limit → Parser (Größe, JSON, Version, Schema) → Rolle → Phase →
 * Slot-Besitz → angebotene Aktion → Sequenznummer → Wirkung.
 */
import {
  createError,
  createMessage,
  createSeqGuard,
  isIntentAllowed,
  LobbyMessageSchema,
  parseClientMessage,
  parseControllerMessage,
  parseHostMessage,
  PLAYER_SLOTS,
  SLOT_NUMBERS,
  type Action,
  type ContextMessage,
  type ControllerMessage,
  type ErrorCode,
  type HostMessage,
  type InputIntent,
  type JoinMessage,
  type Layout,
  type LobbyMessage,
  type LobbyPlayer,
  type Phase,
  type ProtocolError,
  type ReconnectMessage,
  type SeqGuard,
  type ServerMessage,
  type SlotIntentMessage,
  type SlotNumber,
} from '@chaos-party/protocol';
import { generateToken, isValidJoinCode } from './ids.ts';
import { DEFAULT_RATE_LIMIT, TokenBucket, type RateLimitOptions } from './rate-limit.ts';

export type ConnectionId = number;

/** Aktion, die der Adapter nach einem Ereignis ausführt. */
export type Outgoing =
  | { kind: 'send'; to: ConnectionId; message: ServerMessage }
  | { kind: 'close'; to: ConnectionId; code: number; reason: string };

/** WebSocket-Close-Codes der Anwendung (4000–4999). */
export const CLOSE_CODES = {
  /** Erste Nachricht war weder `join`/`reconnect` noch `host-hello`. */
  notJoined: 4001,
  /** Es ist bereits ein Host verbunden. */
  hostTaken: 4002,
  /** Dieselben Slots wurden per `reconnect` von einer neuen Verbindung übernommen. */
  replaced: 4003,
  /** Zu viele ungültige Nachrichten oder anhaltendes Fluten. */
  abuse: 4008,
} as const;

/** Nach so vielen ungültigen Nachrichten wird eine Verbindung geschlossen. */
export const DEFAULT_MAX_INVALID_MESSAGES = 20;

export interface SessionOptions {
  /** Join-Code (4–8 Zeichen `A–Z0–9`), vom Aufrufer erzeugt oder vorgegeben. */
  joinCode: string;
  /** LAN-URL für den QR-Code (CHAOS-11); fehlt sie, enthält `lobby` kein `joinUrl`. */
  joinUrl?: string | undefined;
  /** Weitere Join-Links (andere LAN-Adressen), beste zuerst; leer → Feld fehlt in `lobby`. */
  joinUrlAlternatives?: readonly string[] | undefined;
  /** Monotone Server-Uhr in ms (Standard: `performance.now()`). */
  now?: (() => number) | undefined;
  /** Erzeugt Controller-Tokens (Standard: 24 Zufallsbytes base64url). */
  createToken?: (() => string) | undefined;
  rateLimit?: Partial<RateLimitOptions> | undefined;
  maxInvalidMessages?: number | undefined;
  /** Protokoll für unerwartete Fehler (Standard: `console.error`). */
  logError?: ((error: unknown) => void) | undefined;
}

interface Connection {
  readonly id: ConnectionId;
  role: 'pending' | 'controller' | 'host';
  slots: SlotNumber[];
  token: string | undefined;
  seq: SeqGuard;
  bucket: TokenBucket;
  invalid: number;
  rejected: number;
  limitedSince: number | undefined;
  lastRejectedAt: number | undefined;
  lastRateErrorAt: number | undefined;
}

interface Player {
  readonly slot: SlotNumber;
  readonly color: string;
  readonly label: string;
  readonly token: string;
  /** Aktuelle Verbindung oder `null`, solange der Controller getrennt ist (Slot bleibt reserviert). */
  connectionId: ConnectionId | null;
  ready: boolean;
  /** Letzte Nachricht dieses Slots (Server-Uhr); Grundlage für Timeouts in CHAOS-12. */
  lastSeenAt: number;
}

export interface SessionPlayerSnapshot {
  slot: SlotNumber;
  label: string;
  connected: boolean;
  ready: boolean;
  connectionId: ConnectionId | null;
  lastSeenAt: number;
}

export interface SessionSnapshot {
  phase: Phase;
  hostConnected: boolean;
  connections: number;
  players: SessionPlayerSnapshot[];
  /** Geprüfte Eingaben, die verworfen wurden, weil kein Host verbunden war. */
  droppedInputs: number;
}

type InputMessage = Exclude<SlotIntentMessage, { type: 'ready' }>;

interface SlotContext {
  layout: Layout;
  actions: Action[];
}

const LOBBY_CONTEXT: SlotContext = { layout: 'lobby', actions: ['ready'] };
const WAIT_CONTEXT: SlotContext = { layout: 'wait', actions: [] };
const PLAY_CONTEXT: SlotContext = {
  layout: 'joystick-buttons',
  actions: ['move', 'button-a', 'button-b'],
};

export class Session {
  readonly joinCode: string;
  readonly joinUrl: string | undefined;
  readonly joinUrlAlternatives: readonly string[];

  private phaseValue: Phase = 'lobby';
  private hostId: ConnectionId | null = null;
  private droppedInputs = 0;
  private readonly connections = new Map<ConnectionId, Connection>();
  private readonly players = new Map<SlotNumber, Player>();
  private readonly tokens = new Map<string, SlotNumber[]>();

  private readonly now: () => number;
  private readonly createToken: () => string;
  private readonly rate: RateLimitOptions;
  private readonly maxInvalid: number;
  private readonly logError: (error: unknown) => void;

  /** Gesammelte Aktionen des laufenden Ereignisses. */
  private out: Outgoing[] = [];
  private lobbyDirty = false;

  constructor(options: SessionOptions) {
    if (!isValidJoinCode(options.joinCode)) {
      throw new Error(`Ungültiger Join-Code: ${options.joinCode} (erlaubt: 4–8 Zeichen A–Z, 0–9)`);
    }
    if (
      options.joinUrl !== undefined &&
      !LobbyMessageSchema.shape.joinUrl.safeParse(options.joinUrl).success
    ) {
      throw new Error(`Ungültige Join-URL: ${options.joinUrl}`);
    }
    this.joinCode = options.joinCode;
    const alternatives = [...(options.joinUrlAlternatives ?? [])];
    if (
      alternatives.length > 0 &&
      !LobbyMessageSchema.shape.joinUrlAlternatives.safeParse(alternatives).success
    ) {
      throw new Error(`Ungültige alternative Join-URLs: ${alternatives.join(', ')}`);
    }
    this.joinUrl = options.joinUrl;
    this.joinUrlAlternatives = alternatives;
    this.now = options.now ?? (() => performance.now());
    this.createToken = options.createToken ?? generateToken;
    this.rate = { ...DEFAULT_RATE_LIMIT, ...options.rateLimit };
    this.maxInvalid = options.maxInvalidMessages ?? DEFAULT_MAX_INVALID_MESSAGES;
    this.logError =
      options.logError ??
      ((error: unknown) => {
        console.error(error);
      });
  }

  get phase(): Phase {
    return this.phaseValue;
  }

  // -------------------------------------------------------------------------
  // Ereignisse vom Adapter
  // -------------------------------------------------------------------------

  /** Neue Verbindung; ihre Rolle steht erst mit der ersten Nachricht fest. */
  connect(id: ConnectionId): Outgoing[] {
    return this.run(id, () => {
      if (this.connections.has(id)) throw new Error(`Verbindung ${id} existiert bereits`);
      const now = this.now();
      this.connections.set(id, {
        id,
        role: 'pending',
        slots: [],
        token: undefined,
        seq: createSeqGuard(),
        bucket: new TokenBucket(this.rate.ratePerSecond, this.rate.burstSeconds, now),
        invalid: 0,
        rejected: 0,
        limitedSince: undefined,
        lastRejectedAt: undefined,
        lastRateErrorAt: undefined,
      });
    });
  }

  /** Eine Textnachricht der Verbindung. Wirft nie; unbekannte IDs werden ignoriert. */
  message(id: ConnectionId, raw: string): Outgoing[] {
    return this.run(id, () => {
      const conn = this.connections.get(id);
      if (!conn) return;
      const now = this.now();
      if (!this.withinRateLimit(conn, now)) return;
      switch (conn.role) {
        case 'pending':
          this.handlePending(conn, raw, now);
          return;
        case 'controller':
          this.handleController(conn, raw, now);
          return;
        case 'host':
          this.handleHost(conn, raw);
          return;
      }
    });
  }

  /** Verbindung ist zu. Idempotent (auch nach einem von der Session ausgelösten `close`). */
  disconnect(id: ConnectionId): Outgoing[] {
    return this.run(id, () => {
      this.detach(id);
    });
  }

  /** Lesender Zustand für Tests, Diagnose und spätere Spiellogik. */
  snapshot(): SessionSnapshot {
    return {
      phase: this.phaseValue,
      hostConnected: this.hostId !== null,
      connections: this.connections.size,
      players: this.sortedPlayers().map((player) => ({
        slot: player.slot,
        label: player.label,
        connected: player.connectionId !== null,
        ready: player.ready,
        connectionId: player.connectionId,
        lastSeenAt: player.lastSeenAt,
      })),
      droppedInputs: this.droppedInputs,
    };
  }

  // -------------------------------------------------------------------------
  // Rollen
  // -------------------------------------------------------------------------

  private handlePending(conn: Connection, raw: string, now: number): void {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this.invalid(conn, parsed.error);
      return;
    }
    const message = parsed.message;
    switch (message.type) {
      case 'host-hello':
        this.hostHello(conn);
        return;
      case 'join':
        if (!isIntentAllowed(this.phaseValue, 'join')) {
          this.invalid(conn, {
            code: 'out-of-phase',
            message: 'Beitreten ist nur in der Lobby möglich',
          });
          return;
        }
        this.join(conn, message, now);
        return;
      case 'reconnect':
        this.reconnect(conn, message, now);
        return;
      default:
        this.send(conn.id, createError('not-joined', 'Zuerst join, reconnect oder host-hello'));
        this.kick(conn, CLOSE_CODES.notJoined, 'not-joined');
    }
  }

  private handleController(conn: Connection, raw: string, now: number): void {
    const parsed = parseControllerMessage(raw);
    if (!parsed.ok) {
      this.invalid(conn, parsed.error);
      return;
    }
    const message: ControllerMessage = parsed.message;
    this.touch(conn, now);
    switch (message.type) {
      case 'heartbeat':
        this.send(conn.id, createMessage('heartbeat-ack', { t: message.t }));
        return;
      case 'join':
      case 'reconnect':
        this.invalid(conn, {
          code: 'bad-message',
          message: 'Diese Verbindung ist bereits beigetreten',
        });
        return;
      default:
        this.slotIntent(conn, message, now);
    }
  }

  private handleHost(conn: Connection, raw: string): void {
    const parsed = parseHostMessage(raw);
    if (!parsed.ok) {
      this.invalid(conn, parsed.error);
      return;
    }
    const message: HostMessage = parsed.message;
    switch (message.type) {
      case 'host-hello':
        // Wiederholtes Hallo: Schnappschuss erneut senden.
        this.send(conn.id, this.lobbyMessage());
        return;
      case 'heartbeat':
        this.send(conn.id, createMessage('heartbeat-ack', { t: message.t }));
        return;
      case 'start':
        this.start(conn);
        return;
    }
  }

  // -------------------------------------------------------------------------
  // Handshake
  // -------------------------------------------------------------------------

  private hostHello(conn: Connection): void {
    if (this.hostId !== null) {
      this.send(conn.id, createError('host-taken', 'Es ist bereits ein Host verbunden'));
      this.kick(conn, CLOSE_CODES.hostTaken, 'host-taken');
      return;
    }
    conn.role = 'host';
    this.hostId = conn.id;
    this.lobbyDirty = true;
  }

  private join(conn: Connection, message: JoinMessage, now: number): void {
    if (message.joinCode !== this.joinCode) {
      this.invalid(conn, { code: 'bad-join-code', message: 'Falscher Join-Code' });
      return;
    }
    const free = SLOT_NUMBERS.filter((slot) => !this.players.has(slot));
    if (message.seats > free.length) {
      this.invalid(conn, {
        code: 'session-full',
        message: `Nur noch ${free.length} Platz/Plätze frei`,
      });
      return;
    }
    const slots = free.slice(0, message.seats);
    const token = this.uniqueToken();
    slots.forEach((slot, index) => {
      const style = PLAYER_SLOTS[slot];
      this.players.set(slot, {
        slot,
        color: style.color,
        label: message.names?.[index] ?? style.label,
        token,
        connectionId: conn.id,
        ready: false,
        lastSeenAt: now,
      });
    });
    this.tokens.set(token, slots);
    this.attach(conn, token, slots, now);
  }

  private reconnect(conn: Connection, message: ReconnectMessage, now: number): void {
    const slots = this.tokens.get(message.sessionToken);
    if (!slots) {
      this.invalid(conn, { code: 'bad-token', message: 'Unbekanntes Session-Token' });
      return;
    }
    // Eine noch offene alte Verbindung (z. B. hängender Tab) verliert die Slots.
    for (const slot of slots) {
      const previous = this.players.get(slot)?.connectionId;
      if (previous !== undefined && previous !== null && previous !== conn.id) {
        const old = this.connections.get(previous);
        if (old) this.kick(old, CLOSE_CODES.replaced, 'replaced');
      }
    }
    for (const slot of slots) {
      const player = this.players.get(slot);
      if (player) {
        player.connectionId = conn.id;
        player.lastSeenAt = now;
      }
    }
    this.attach(conn, message.sessionToken, slots, now);
  }

  /** Bindet Slots an eine Verbindung und begrüßt sie. */
  private attach(conn: Connection, token: string, slots: SlotNumber[], now: number): void {
    conn.role = 'controller';
    conn.token = token;
    conn.slots = [...slots];
    conn.seq = createSeqGuard();
    conn.bucket.setRate(
      this.rate.ratePerSecond * Math.max(1, slots.length),
      this.rate.burstSeconds,
      now,
    );
    const players = slots.flatMap((slot) => {
      const player = this.players.get(slot);
      return player ? [{ slot, color: player.color, label: player.label }] : [];
    });
    this.send(conn.id, createMessage('welcome', { sessionToken: token, players }));
    for (const slot of slots) this.sendContext(conn.id, slot);
    this.lobbyDirty = true;
  }

  // -------------------------------------------------------------------------
  // Eingaben
  // -------------------------------------------------------------------------

  private slotIntent(conn: Connection, message: SlotIntentMessage, now: number): void {
    const { seq } = message;
    if (!isIntentAllowed(this.phaseValue, message.type)) {
      this.reject(
        conn,
        'out-of-phase',
        `${message.type} ist in ${this.phaseValue} nicht erlaubt`,
        seq,
      );
      return;
    }
    if (!conn.slots.includes(message.slot)) {
      this.invalid(
        conn,
        { code: 'not-your-slot', message: `Slot ${message.slot} gehört nicht dir` },
        seq,
      );
      return;
    }
    const player = this.players.get(message.slot);
    if (!player) return;

    if (message.type === 'ready') {
      if (!conn.seq.accept(seq)) {
        this.reject(conn, 'stale-seq', 'Veraltete Sequenznummer', seq);
        return;
      }
      if (!player.ready) {
        player.ready = true;
        this.sendContext(conn.id, player.slot);
        this.lobbyDirty = true;
      }
      return;
    }

    const action = actionOf(message);
    if (!this.contextFor(player).actions.includes(action)) {
      this.reject(conn, 'out-of-phase', `${action} wird gerade nicht angeboten`, seq);
      return;
    }
    if (!conn.seq.accept(seq)) {
      this.reject(conn, 'stale-seq', 'Veraltete Sequenznummer', seq);
      return;
    }
    if (this.hostId === null) {
      // Ohne Host gibt es niemanden, der die Eingabe auswertet: still verwerfen.
      this.droppedInputs++;
      return;
    }
    this.send(this.hostId, createMessage('input', { intent: toIntent(message), at: now }));
  }

  private start(host: Connection): void {
    if (this.phaseValue !== 'lobby') {
      this.reject(host, 'out-of-phase', 'Spiel läuft bereits');
      return;
    }
    const connected = [...this.players.values()].filter((player) => player.connectionId !== null);
    if (connected.length === 0) {
      this.reject(host, 'out-of-phase', 'Mindestens ein verbundener Spieler nötig');
      return;
    }
    this.phaseValue = 'play';
    for (const player of this.sortedPlayers()) {
      if (player.connectionId !== null) this.sendContext(player.connectionId, player.slot);
    }
    this.lobbyDirty = true;
  }

  // -------------------------------------------------------------------------
  // Missbrauchsschutz
  // -------------------------------------------------------------------------

  private withinRateLimit(conn: Connection, now: number): boolean {
    if (conn.bucket.take(now)) return true;
    conn.rejected++;
    // Eine Flut-Phase endet erst, wenn eine volle Fehlerperiode lang nichts abgewiesen wurde;
    // einzelne durchgelassene Nachrichten (Budget tröpfelt nach) beenden sie nicht.
    if (
      conn.limitedSince === undefined ||
      conn.lastRejectedAt === undefined ||
      now - conn.lastRejectedAt > this.rate.errorIntervalMs
    ) {
      conn.limitedSince = now;
    }
    conn.lastRejectedAt = now;
    if (
      conn.rejected >= this.rate.maxRejected ||
      now - conn.limitedSince >= this.rate.maxOverBudgetMs
    ) {
      this.kick(conn, CLOSE_CODES.abuse, 'rate-limited');
      return false;
    }
    if (
      conn.lastRateErrorAt === undefined ||
      now - conn.lastRateErrorAt >= this.rate.errorIntervalMs
    ) {
      conn.lastRateErrorAt = now;
      this.send(conn.id, createError('rate-limited', 'Zu viele Nachrichten'));
    }
    return false;
  }

  /** Abgewiesene Nachricht, die auf Manipulation oder einen Fehler im Client hindeutet. */
  private invalid(conn: Connection, error: ProtocolError, seq?: number): void {
    this.send(conn.id, createError(error.code, error.message, seq));
    conn.invalid++;
    if (conn.invalid >= this.maxInvalid) {
      this.kick(conn, CLOSE_CODES.abuse, 'too-many-invalid');
    }
  }

  /** Abgewiesene Nachricht, die im normalen Ablauf vorkommen kann (Phasenwechsel, Reihenfolge). */
  private reject(conn: Connection, code: ErrorCode, message: string, seq?: number): void {
    this.send(conn.id, createError(code, message, seq));
  }

  // -------------------------------------------------------------------------
  // Hilfen
  // -------------------------------------------------------------------------

  private kick(conn: Connection, code: number, reason: string): void {
    this.out.push({ kind: 'close', to: conn.id, code, reason });
    this.detach(conn.id);
  }

  private detach(id: ConnectionId): void {
    const conn = this.connections.get(id);
    if (!conn) return;
    this.connections.delete(id);
    if (conn.role === 'host' && this.hostId === id) {
      this.hostId = null;
    }
    if (conn.role === 'controller') {
      for (const slot of conn.slots) {
        const player = this.players.get(slot);
        if (player?.connectionId === id) player.connectionId = null;
      }
      this.lobbyDirty = true;
    }
  }

  private touch(conn: Connection, now: number): void {
    for (const slot of conn.slots) {
      const player = this.players.get(slot);
      if (player) player.lastSeenAt = now;
    }
  }

  private uniqueToken(): string {
    for (let attempt = 0; attempt < 8; attempt++) {
      const token = this.createToken();
      if (!this.tokens.has(token)) return token;
    }
    throw new Error('Konnte kein eindeutiges Token erzeugen');
  }

  private contextFor(player: Player): SlotContext {
    if (this.phaseValue === 'play') return PLAY_CONTEXT;
    return player.ready ? WAIT_CONTEXT : LOBBY_CONTEXT;
  }

  private sendContext(to: ConnectionId, slot: SlotNumber): void {
    const player = this.players.get(slot);
    if (!player) return;
    const context = this.contextFor(player);
    const message: ContextMessage = createMessage('context', {
      slot,
      phase: this.phaseValue,
      layout: context.layout,
      actions: [...context.actions],
    });
    this.send(to, message);
  }

  private sortedPlayers(): Player[] {
    return [...this.players.values()].sort((a, b) => a.slot - b.slot);
  }

  private lobbyMessage(): LobbyMessage {
    const players: LobbyPlayer[] = this.sortedPlayers().map((player) => ({
      slot: player.slot,
      color: player.color,
      label: player.label,
      connected: player.connectionId !== null,
      ready: player.ready,
    }));
    // Optionale Felder nur setzen, wenn vorhanden (strikte Schemas, exactOptionalPropertyTypes).
    return createMessage('lobby', {
      joinCode: this.joinCode,
      ...(this.joinUrl === undefined ? {} : { joinUrl: this.joinUrl }),
      ...(this.joinUrlAlternatives.length === 0
        ? {}
        : { joinUrlAlternatives: [...this.joinUrlAlternatives] }),
      phase: this.phaseValue,
      players,
    });
  }

  private send(to: ConnectionId, message: ServerMessage): void {
    this.out.push({ kind: 'send', to, message });
  }

  /** Führt ein Ereignis aus; Ausnahmen werden protokolliert und als `internal` gemeldet. */
  private run(id: ConnectionId, handler: () => void): Outgoing[] {
    // `out` und `lobbyDirty` sind zwischen Ereignissen immer leer bzw. false.
    try {
      handler();
    } catch (error) {
      this.logError(error);
      if (this.connections.has(id)) {
        this.send(id, createError('internal', 'Interner Serverfehler'));
      }
    }
    if (this.lobbyDirty && this.hostId !== null) {
      this.send(this.hostId, this.lobbyMessage());
    }
    const out = this.out;
    this.out = [];
    this.lobbyDirty = false;
    return out;
  }
}

/** Welche angebotene Aktion eine Eingabe voraussetzt. */
function actionOf(message: InputMessage): Action {
  switch (message.type) {
    case 'move':
      return 'move';
    case 'press':
    case 'release':
      return message.button === 'a' ? 'button-a' : 'button-b';
    case 'gesture':
      return 'gesture';
    case 'reaction':
      return 'reaction';
  }
}

/** Eingabe ohne Umschlag; Felder werden explizit übernommen. */
function toIntent(message: InputMessage): InputIntent {
  switch (message.type) {
    case 'move':
      return { type: 'move', slot: message.slot, seq: message.seq, x: message.x, y: message.y };
    case 'press':
      return { type: 'press', slot: message.slot, seq: message.seq, button: message.button };
    case 'release':
      return { type: 'release', slot: message.slot, seq: message.seq, button: message.button };
    case 'gesture':
      return { type: 'gesture', slot: message.slot, seq: message.seq, kind: message.kind };
    case 'reaction':
      return {
        type: 'reaction',
        slot: message.slot,
        seq: message.seq,
        windowId: message.windowId,
      };
  }
}
