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
 *
 * Zeitabhängiges (CHAOS-12, ADR-009) erledigt `tick()`, das der Adapter
 * regelmäßig aufruft: Handshake-Timeout, Herzschlag-Timeout für Controller und
 * Host sowie die Freigabe reservierter Slots nach der Lobby-Schonfrist.
 *
 * M4 (ADR-015): Figurenwahl und Rundenzahl in der Lobby, Pause/Fortsetzen/Beenden und
 * Revanche (zurück in die Lobby) sowie die Bestätigung von Minispiel-Ergebnissen. Verliert der
 * Host im laufenden Brettspiel die Verbindung, pausiert die Session die Partie selbst
 * (Auto-Pause, CHAOS-38) und setzt sie fort, sobald wieder ein Host da ist und Szene und
 * Figuren geladen hat (`host-ready`, CHAOS-68).
 */
import {
  CHARACTER_IDS,
  createError,
  createMessage,
  createSeqGuard,
  isIntentAllowed,
  LobbyMessageSchema,
  LobbySettingsSchema,
  pickFreeCharacter,
  parseClientMessage,
  parseControllerMessage,
  parseHostMessage,
  PLAYER_SLOTS,
  SLOT_NUMBERS,
  type Action,
  type CharacterId,
  type ContextMessage,
  type ControllerMessage,
  type ErrorCode,
  type HostMessage,
  type MinigameResultMessage,
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
  type StartMessage,
  type ChooseMessage,
  type PickCharacterMessage,
} from '@chaos-party/protocol';
import { randomInt } from 'node:crypto';
import { BoardGame, DEFAULT_GAME_SETTINGS, type BoardGameSettings } from './game.ts';
import { generateToken, isValidJoinCode } from './ids.ts';
import { DEFAULT_RATE_LIMIT, TokenBucket, type RateLimitOptions } from './rate-limit.ts';

export type ConnectionId = number;

/** Aktion, die der Adapter nach einem Ereignis ausführt. */
export type Outgoing =
  | { kind: 'send'; to: ConnectionId; message: ServerMessage }
  | {
      kind: 'close';
      to: ConnectionId;
      code: number;
      reason: string;
      /**
       * Gegenstelle gilt als tot (Herzschlag-Timeout): Socket sofort abbrechen, statt
       * bis zu 30 s auf den Close-Handshake zu warten.
       */
      terminate?: true;
    };

/** WebSocket-Close-Codes der Anwendung (4000–4999). */
export const CLOSE_CODES = {
  /** Erste Nachricht war weder `join`/`reconnect` noch `host-hello`. */
  notJoined: 4001,
  /** Es ist bereits ein Host verbunden. */
  hostTaken: 4002,
  /** Dieselben Slots wurden per `reconnect` von einer neuen Verbindung übernommen. */
  replaced: 4003,
  /** Innerhalb von `handshakeMs` kam kein `join`/`reconnect`/`host-hello` (CHAOS-12). */
  handshakeTimeout: 4004,
  /** Zu lange still: kein Herzschlag und keine andere Nachricht (CHAOS-12). */
  heartbeatTimeout: 4005,
  /** Zu viele ungültige Nachrichten oder anhaltendes Fluten. */
  abuse: 4008,
} as const;

/**
 * Zeitgrenzen der Session in ms (ADR-009). Alle sind injizierbar, damit Tests mit
 * künstlicher Uhr laufen.
 */
export interface SessionTimeouts {
  /** Verbindung ohne gültigen Handshake wird nach dieser Zeit geschlossen. */
  handshakeMs: number;
  /** Controller ohne jede Nachricht (Herzschlag alle 5 s) gilt danach als getrennt. */
  controllerSilenceMs: number;
  /** Host ohne jede Nachricht gilt danach als getrennt (großzügiger: Hintergrund-Tab am PC). */
  hostSilenceMs: number;
  /** In der Lobby bleibt der Slot eines getrennten Controllers so lange reserviert. */
  lobbyGraceMs: number;
  /**
   * Rückfall für die Auto-Pause (CHAOS-68): Meldet ein zurückgekehrter Host so lange nach
   * `host-hello` kein `host-ready`, setzt der Server trotzdem fort (Host ohne die Nachricht,
   * Szene lädt nie fertig).
   */
  hostReadyMs: number;
}

export const DEFAULT_TIMEOUTS: Readonly<SessionTimeouts> = {
  handshakeMs: 5_000,
  controllerSilenceMs: 15_000,
  hostSilenceMs: 30_000,
  lobbyGraceMs: 60_000,
  hostReadyMs: 30_000,
};

/** Nach so vielen ungültigen Nachrichten wird eine Verbindung geschlossen. */
export const DEFAULT_MAX_INVALID_MESSAGES = 20;

/**
 * Takt, in dem `Session.tick()` Timeouts prüft (CHAOS-12, ADR-009) und das Brettspiel
 * weiterlaufen lässt (Pacing, Reaktionsfenster; M2, ADR-011). 100 ms: Fristen und
 * Animationstakt bleiben spürbar genau, die Last ist vernachlässigbar. Gilt für den
 * `ws`-Adapter (`socket.ts`) und den Apple-Host (`apps/apple-host`).
 */
export const DEFAULT_TICK_MS = 100;

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
  /** Zeitgrenzen für Handshake, Herzschlag und Lobby-Schonfrist (CHAOS-12). */
  timeouts?: Partial<SessionTimeouts> | undefined;
  /** Protokoll für unerwartete Fehler (Standard: `console.error`). */
  logError?: ((error: unknown) => void) | undefined;
  /** Brettspiel-Einstellungen (M2): Runden, fester Seed, Regeln, Brett. */
  game?: Partial<BoardGameSettings> | undefined;
  /** Seed-Quelle, wenn `game.seed` fehlt (Standard: kryptografischer Zufall). */
  randomSeed?: (() => number) | undefined;
  /** Wird bei jedem Partiestart aufgerufen (z. B. Seed im Terminal ausgeben). */
  onGameStart?: ((info: GameStartInfo) => void) | undefined;
}

export interface GameStartInfo {
  readonly seed: number;
  readonly rounds: number;
  readonly slots: readonly SlotNumber[];
}

interface Connection {
  readonly id: ConnectionId;
  role: 'pending' | 'controller' | 'host';
  slots: SlotNumber[];
  token: string | undefined;
  seq: SeqGuard;
  bucket: TokenBucket;
  /** Zeitpunkt des Verbindungsaufbaus (Handshake-Timeout). */
  readonly openedAt: number;
  /** Letzte Nachricht dieser Verbindung, egal welche (Herzschlag-Timeout). */
  lastSeenAt: number;
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
  /** Letzte Nachricht dieses Slots (Server-Uhr). */
  lastSeenAt: number;
  /** Seit wann der Slot ohne Verbindung ist (`null` = verbunden); Lobby-Schonfrist. */
  disconnectedAt: number | null;
  /** Gewählte Figur (v4) oder `null`; beim Start automatisch vergeben, bleibt über `rematch`. */
  character: CharacterId | null;
}

export interface SessionPlayerSnapshot {
  slot: SlotNumber;
  label: string;
  connected: boolean;
  ready: boolean;
  character: CharacterId | null;
  connectionId: ConnectionId | null;
  lastSeenAt: number;
  disconnectedAt: number | null;
}

export interface SessionSnapshot {
  phase: Phase;
  hostConnected: boolean;
  connections: number;
  players: SessionPlayerSnapshot[];
  /** Geprüfte Eingaben, die verworfen wurden, weil kein Host verbunden war. */
  droppedInputs: number;
  /** Laufendes Brettspiel (Phase `board`) oder `null`. */
  game: { seed: number; state: BoardGame['state'] } | null;
  /** Rundenzahl der nächsten Partie (Lobby-Einstellung, v4). */
  rounds: number;
  /**
   * Wer die laufende Pause ausgelöst hat: `host` (Befehl `pause`), `host-lost` (Auto-Pause,
   * weil der Host die Verbindung verlor, CHAOS-38) oder `null` (keine Pause).
   */
  pausedBy: PauseCause | null;
  /**
   * Auto-Pause wartet auf `host-ready` des zurückgekehrten Hosts (CHAOS-68): Host ist wieder
   * verbunden, lädt aber noch Szene und Figuren.
   */
  awaitingHostReady: boolean;
}

/** Auslöser einer Pause (nur Server-intern und Diagnose; das Protokoll kennt nur `paused`). */
export type PauseCause = 'host' | 'host-lost';

type InputMessage = Exclude<
  SlotIntentMessage,
  { type: 'ready' } | { type: 'choose' } | { type: 'pick-character' }
>;

interface SlotContext {
  layout: Layout;
  actions: Action[];
  prompt?: ContextMessage['prompt'];
  board?: ContextMessage['board'];
  minigame?: ContextMessage['minigame'];
  lobby?: ContextMessage['lobby'];
}

const WAIT_CONTEXT: SlotContext = { layout: 'wait', actions: [] };
const PLAY_CONTEXT: SlotContext = {
  layout: 'joystick-buttons',
  actions: ['move', 'button-a', 'button-b'],
};

/** Ein Prompt-Kontext ändert sich nur bei neuer Entscheidung, nicht mit der Restzeit. */
function contextKey(context: SlotContext): string {
  const { prompt, ...rest } = context;
  return JSON.stringify({ ...rest, promptId: prompt?.id ?? null });
}

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
  private readonly timeouts: SessionTimeouts;
  private readonly logError: (error: unknown) => void;
  private readonly gameSettings: BoardGameSettings;
  private readonly randomSeed: () => number;
  private readonly onGameStart: ((info: GameStartInfo) => void) | undefined;
  /** Laufendes Brettspiel (Phase `board`). */
  private game: BoardGame | null = null;
  /** Rundenzahl der nächsten Partie (`configure`, `start.rounds`). */
  private rounds: number;
  /** Zuletzt gesendeter Kontext je Slot (nur bei Änderung neu senden). */
  private readonly contextKeys = new Map<SlotNumber, string>();
  /** Auslöser der laufenden Pause (`null` = keine). */
  private pauseCause: PauseCause | null = null;
  /**
   * Frist, bis zu der eine Auto-Pause auf `host-ready` des zurückgekehrten Hosts wartet
   * (CHAOS-68); `null` = es wartet nichts.
   */
  private hostReadyDeadline: number | null = null;

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
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
    this.logError =
      options.logError ??
      ((error: unknown) => {
        console.error(error);
      });
    this.gameSettings = { ...DEFAULT_GAME_SETTINGS, ...options.game };
    const settings = {
      rounds: this.gameSettings.rounds,
      roundPresets: [...this.gameSettings.roundPresets],
    };
    if (!LobbySettingsSchema.safeParse(settings).success) {
      throw new Error(`Ungültige Spiel-Einstellungen: ${JSON.stringify(settings)}`);
    }
    this.rounds = this.gameSettings.rounds;
    this.randomSeed = options.randomSeed ?? (() => randomInt(0, 2 ** 31));
    this.onGameStart = options.onGameStart;
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
        openedAt: now,
        lastSeenAt: now,
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
      // Jede Nachricht ist ein Lebenszeichen – auch ungültige oder gedrosselte.
      conn.lastSeenAt = now;
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

  /**
   * Zeitabhängige Prüfungen (CHAOS-12, ADR-009); der Adapter ruft das etwa
   * sekündlich auf. Schließt Verbindungen ohne Handshake und stille Verbindungen
   * (→ Spieler `connected: false`) und gibt in der Lobby Slots frei, deren
   * Controller länger als die Schonfrist weg ist (Token wird ungültig).
   */
  tick(): Outgoing[] {
    return this.run(null, () => {
      const now = this.now();
      for (const conn of [...this.connections.values()]) {
        if (conn.role === 'pending') {
          if (now - conn.openedAt >= this.timeouts.handshakeMs) {
            this.kick(conn, CLOSE_CODES.handshakeTimeout, 'handshake-timeout');
          }
          continue;
        }
        const limit =
          conn.role === 'host' ? this.timeouts.hostSilenceMs : this.timeouts.controllerSilenceMs;
        if (now - conn.lastSeenAt >= limit) {
          this.kick(conn, CLOSE_CODES.heartbeatTimeout, 'heartbeat-timeout', true);
        }
      }
      if (this.phaseValue === 'lobby') this.releaseExpiredSlots(now);
      if (this.hostReadyDeadline !== null && now >= this.hostReadyDeadline) {
        // Rückfall (CHAOS-68): Host meldet sich nicht bereit – weiter wie vor CHAOS-68.
        this.resumeAfterHostLoss();
      }
      this.game?.apply({ type: 'tick', at: now });
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
        character: player.character,
        connectionId: player.connectionId,
        lastSeenAt: player.lastSeenAt,
        disconnectedAt: player.disconnectedAt,
      })),
      droppedInputs: this.droppedInputs,
      game: this.game ? { seed: this.game.seed, state: this.game.state } : null,
      rounds: this.rounds,
      pausedBy: this.game?.paused ? this.pauseCause : null,
      awaitingHostReady: this.hostReadyDeadline !== null,
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
        this.sendBoardSnapshot(conn.id);
        return;
      case 'heartbeat':
        this.send(conn.id, createMessage('heartbeat-ack', { t: message.t }));
        return;
      case 'host-ready':
        // Szene und Figuren geladen (CHAOS-68). Wartet keine Auto-Pause darauf: nichts zu tun.
        if (this.hostReadyDeadline !== null) this.resumeAfterHostLoss();
        return;
      default:
        break;
    }
    if (!isIntentAllowed(this.phaseValue, message.type)) {
      if (message.type === 'minigame-result') this.ackResult(conn, message, 'out-of-phase');
      this.reject(conn, 'out-of-phase', `${message.type} ist in ${this.phaseValue} nicht erlaubt`);
      return;
    }
    switch (message.type) {
      case 'start':
        this.start(conn, message);
        return;
      case 'minigame-result':
        this.minigameResult(conn, message);
        return;
      case 'configure':
        // Rundenzahl der nächsten Partie (Schema prüft 1–MAX_ROUNDS); Lobby und Controller zeigen sie.
        if (this.rounds !== message.rounds) {
          this.rounds = message.rounds;
          this.lobbyDirty = true;
        }
        return;
      case 'pause':
      case 'resume':
      case 'end-game':
        this.control(conn, message.type);
        return;
      case 'rematch':
        this.rematch(conn);
        return;
    }
  }

  /** Ergebnis des laufenden Minispiels vom Host (M3): game-core prüft es vollständig. */
  private minigameResult(host: Connection, message: MinigameResultMessage): void {
    if (!this.game) {
      this.ackResult(host, message, 'out-of-phase');
      this.reject(host, 'out-of-phase', 'Kein Spiel läuft');
      return;
    }
    const result = this.game.apply({
      type: 'minigame-result',
      minigameId: message.minigameId,
      round: message.round,
      placements: message.placements,
      ...(message.highlights === undefined ? {} : { highlights: message.highlights }),
      at: this.now(),
    });
    if (result.ok) {
      this.ackResult(host, message, null);
      return;
    }
    // Abgelehnt (zu spät, doppelt, ungültig): Host bekommt den Grund, Partie läuft weiter.
    this.ackResult(host, message, 'invalid-result');
    this.reject(host, 'invalid-result', result.error.message);
  }

  /** Bestätigung auf `minigame-result` (v4, CHAOS-55); `code === null` = angenommen. */
  private ackResult(
    host: Connection,
    message: MinigameResultMessage,
    code: ErrorCode | null,
  ): void {
    this.send(
      host.id,
      createMessage('minigame-result-ack', {
        minigameId: message.minigameId,
        round: message.round,
        accepted: code === null,
        ...(code === null ? {} : { code }),
      }),
    );
  }

  /**
   * Pause, Fortsetzen und vorzeitiges Ende (v4, CHAOS-36). game-core verschiebt die Fristen;
   * die Session sorgt dafür, dass in der Pause keine Eingaben an den Host gehen.
   */
  private control(host: Connection, type: 'pause' | 'resume' | 'end-game'): void {
    const game = this.game;
    if (!game) {
      this.reject(host, 'out-of-phase', 'Kein Spiel läuft');
      return;
    }
    if (type === 'pause' && game.paused && this.pauseCause === 'host-lost') {
      // Host pausiert, während die Auto-Pause noch auf sein `host-ready` wartet (CHAOS-68):
      // daraus wird seine eigene Pause, die bis `resume` bleibt.
      this.pauseCause = 'host';
      this.hostReadyDeadline = null;
      return;
    }
    const result = game.apply({ type: type === 'end-game' ? 'end' : type, at: this.now() });
    if (result.ok) {
      this.pauseCause = game.paused ? 'host' : null;
      this.hostReadyDeadline = null;
      return;
    }
    this.reject(
      host,
      result.error.code === 'paused' ? 'paused' : 'out-of-phase',
      result.error.message,
    );
  }

  /**
   * Revanche (v4, CHAOS-37): nach dem Endstand zurück in die Lobby. Spieler, Tokens und
   * Figuren bleiben, `ready` wird zurückgesetzt; getrennte Plätze bekommen eine frische
   * Lobby-Schonfrist. Die nächste Partie zieht beim Start einen neuen Seed.
   */
  private rematch(host: Connection): void {
    if (!this.game?.finished) {
      this.reject(host, 'out-of-phase', 'Revanche erst nach dem Endstand');
      return;
    }
    const now = this.now();
    this.game = null;
    this.pauseCause = null;
    this.hostReadyDeadline = null;
    this.phaseValue = 'lobby';
    this.contextKeys.clear();
    for (const player of this.sortedPlayers()) {
      player.ready = false;
      if (player.connectionId === null) player.disconnectedAt = now;
      else this.sendContext(player.connectionId, player.slot);
    }
    this.lobbyDirty = true;
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
    this.awaitHostReady();
    this.sendBoardSnapshot(conn.id);
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
      this.contextKeys.delete(slot);
      this.players.set(slot, {
        slot,
        color: style.color,
        label: message.names?.[index] ?? style.label,
        token,
        connectionId: conn.id,
        ready: false,
        lastSeenAt: now,
        disconnectedAt: null,
        character: null,
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
        player.disconnectedAt = null;
      }
      if (this.game?.hasSlot(slot)) {
        this.game.apply({ type: 'connection', slot, connected: true, at: now });
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

    if (message.type === 'choose') {
      this.choose(conn, player, message, now);
      return;
    }

    if (message.type === 'pick-character') {
      this.pickCharacter(conn, player, message);
      return;
    }

    if (this.game?.paused) {
      // Pause (ADR-015): Minispiel-Eingaben gehen nicht an den Host.
      this.reject(conn, 'paused', 'Spiel ist pausiert', seq);
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

  /**
   * Figur wählen/umwählen (v4, CHAOS-36, ADR-015). Eine von einem anderen Slot gewählte
   * Figur → `character-taken` (normaler Wettlauf, kein Missbrauch). Umwählen setzt `ready`
   * zurück, damit niemand mit einer Figur startet, die er gerade nicht mehr will.
   */
  private pickCharacter(conn: Connection, player: Player, message: PickCharacterMessage): void {
    const { seq, character } = message;
    if (!conn.seq.accept(seq)) {
      this.reject(conn, 'stale-seq', 'Veraltete Sequenznummer', seq);
      return;
    }
    if (player.character === character) return;
    const owner = this.sortedPlayers().find(
      (other) => other.slot !== player.slot && other.character === character,
    );
    if (owner) {
      this.reject(conn, 'character-taken', `Figur ${character} ist schon vergeben`, seq);
      // Aktuellen Stand (vergebene Figuren) erneut schicken.
      this.contextKeys.delete(player.slot);
      return;
    }
    player.character = character;
    player.ready = false;
    this.lobbyDirty = true;
  }

  /**
   * Spieler ohne Figur bekommen beim Start eine freie (v4): Standardfigur des Slots, sonst
   * die erste freie; in Slot-Reihenfolge, damit es deterministisch ist.
   */
  private assignCharacters(players: Player[]): void {
    const taken = new Set<CharacterId>();
    for (const player of this.players.values()) {
      if (player.character !== null) taken.add(player.character);
    }
    for (const player of players) {
      if (player.character !== null) continue;
      const character = pickFreeCharacter(player.slot, taken);
      if (character === null) throw new Error('Keine freie Figur mehr');
      player.character = character;
      taken.add(character);
      this.lobbyDirty = true;
    }
  }

  private start(host: Connection, message: StartMessage): void {
    const connected = this.sortedPlayers().filter((player) => player.connectionId !== null);
    if (connected.length === 0) {
      this.reject(host, 'out-of-phase', 'Mindestens ein verbundener Spieler nötig');
      return;
    }
    if (message.rounds !== undefined) this.rounds = message.rounds;
    this.assignCharacters(connected);
    if ((message.mode ?? 'board') === 'board') {
      this.startBoardGame(connected, this.rounds);
    } else {
      this.phaseValue = 'play';
    }
    for (const player of this.sortedPlayers()) {
      if (player.connectionId !== null) this.sendContext(player.connectionId, player.slot);
    }
    this.lobbyDirty = true;
  }

  /**
   * Brettspiel mit allen verbundenen Spielern starten (M2). Reservierte, aber getrennte
   * Slots spielen nicht mit; ihre Controller sehen nach dem Wiederverbinden „warten“.
   */
  private startBoardGame(players: Player[], rounds: number): void {
    const seed = this.gameSettings.seed ?? this.randomSeed();
    const settings = { ...this.gameSettings, rounds };
    const game = new BoardGame(
      players.map((player) => ({
        slot: player.slot,
        name: player.label,
        character: player.character ?? pickFreeCharacter(player.slot, []) ?? CHARACTER_IDS[0],
      })),
      settings,
      seed,
    );
    const started = game.apply({ type: 'start', at: this.now() });
    if (!started.ok) throw new Error(`Spielstart abgelehnt: ${started.error.message}`);
    this.game = game;
    this.phaseValue = 'board';
    this.contextKeys.clear();
    this.onGameStart?.({ seed, rounds: settings.rounds, slots: players.map((p) => p.slot) });
  }

  private choose(conn: Connection, player: Player, message: ChooseMessage, now: number): void {
    const { seq } = message;
    if (this.game?.paused) {
      this.reject(conn, 'paused', 'Spiel ist pausiert', seq);
      return;
    }
    if (!this.contextFor(player).actions.includes('choose')) {
      this.reject(conn, 'invalid-choice', 'Gerade ist keine Entscheidung offen', seq);
      return;
    }
    if (!conn.seq.accept(seq)) {
      this.reject(conn, 'stale-seq', 'Veraltete Sequenznummer', seq);
      return;
    }
    const result = this.game?.apply({
      type: 'choose',
      slot: player.slot,
      promptId: message.promptId,
      option: message.option,
      at: now,
    });
    if (result && !result.ok) {
      // Kommt im normalen Ablauf vor (Frist abgelaufen, doppelt getippt): zählt nicht als Missbrauch.
      this.reject(conn, 'invalid-choice', result.error.message, seq);
      // Den aktuellen Stand erneut schicken, damit der Controller die Sperre löst.
      this.contextKeys.delete(player.slot);
    }
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

  private kick(conn: Connection, code: number, reason: string, terminate = false): void {
    this.out.push(
      terminate
        ? { kind: 'close', to: conn.id, code, reason, terminate: true }
        : { kind: 'close', to: conn.id, code, reason },
    );
    this.detach(conn.id);
  }

  /**
   * Lobby: Slots, deren Controller länger als `lobbyGraceMs` getrennt ist, werden
   * frei; das Token wird ungültig (`reconnect` → `bad-token`). Ein Token hält alle
   * Slots einer Verbindung (iPad), sie werden gemeinsam frei. Im Spiel bleiben
   * Reservierungen bis zum Ende der Partie (M1: kein Ende) bestehen.
   */
  private releaseExpiredSlots(now: number): void {
    for (const [token, slots] of [...this.tokens]) {
      const players = slots.flatMap((slot) => {
        const player = this.players.get(slot);
        return player ? [player] : [];
      });
      const expired = players.every(
        (player) =>
          player.connectionId === null &&
          player.disconnectedAt !== null &&
          now - player.disconnectedAt >= this.timeouts.lobbyGraceMs,
      );
      if (!expired) continue;
      // Mit dem Slot wird auch seine Figur frei (ADR-015).
      for (const slot of slots) {
        this.players.delete(slot);
        this.contextKeys.delete(slot);
      }
      this.tokens.delete(token);
      this.lobbyDirty = true;
    }
  }

  private detach(id: ConnectionId): void {
    const conn = this.connections.get(id);
    if (!conn) return;
    this.connections.delete(id);
    if (conn.role === 'host' && this.hostId === id) {
      this.hostId = null;
      // Ging er schon beim Laden wieder verloren, wartet die Auto-Pause auf den nächsten Host.
      this.hostReadyDeadline = null;
      this.pauseForHostLoss();
    }
    if (conn.role === 'controller') {
      const now = this.now();
      for (const slot of conn.slots) {
        const player = this.players.get(slot);
        if (player?.connectionId === id) {
          player.connectionId = null;
          player.disconnectedAt = now;
          if (this.game?.hasSlot(slot)) {
            this.game.apply({ type: 'connection', slot, connected: false, at: now });
          }
        }
      }
      this.lobbyDirty = true;
    }
  }

  /**
   * Auto-Pause (CHAOS-38, ADR-015 Nachtrag): Ohne Host sieht niemand das Brett, Minispiele
   * laufen nicht und Ergebnisse kämen nie an. Darum pausiert die Session eine laufende Partie,
   * sobald der Host weg ist (Neuladen, Absturz, Herzschlag-Timeout). game-core verschiebt beim
   * Fortsetzen alle Fristen; ein laufendes Minispiel wird so nicht abgebrochen. Sobald wieder
   * ein Host da ist und Szene und Figuren geladen hat (`host-ready`, CHAOS-68), geht es weiter
   * (`resumeAfterHostLoss`); eine Pause, die der Host selbst ausgelöst hat, bleibt dagegen bis
   * zu seinem `resume` bestehen.
   *
   * Pausiert wird zum zuletzt verarbeiteten Zeitpunkt (`state.now`), nicht zu „jetzt“: Sonst
   * erzeugte der Pause-Schritt Übergänge, die seit dem letzten Takt fällig wurden, und deren
   * Ereignisse gingen ohne Host verloren (Lücke in `eventSeq`). So entstehen sie erst nach
   * `resume`, wenn ein Host zusieht.
   */
  private pauseForHostLoss(): void {
    const game = this.game;
    if (this.phaseValue !== 'board' || !game || game.paused || game.finished) return;
    const result = game.apply({ type: 'pause', at: game.state.now });
    if (result.ok) this.pauseCause = 'host-lost';
  }

  /**
   * Neuer Host nach einer Auto-Pause (CHAOS-68, ADR-015 Nachtrag 3): Er bekommt den Stand noch
   * pausiert und lädt in Ruhe Brett bzw. Minispiel-Bühne samt Figuren. Erst sein `host-ready`
   * setzt fort; meldet er sich nicht binnen `hostReadyMs`, setzt `tick` trotzdem fort.
   */
  private awaitHostReady(): void {
    if (!this.game?.paused || this.pauseCause !== 'host-lost') return;
    this.hostReadyDeadline = this.now() + this.timeouts.hostReadyMs;
  }

  /**
   * Auto-Pause beenden, sobald der zurückgekehrte Host bereit ist (`host-ready`) oder die
   * Rückfallfrist abläuft. Die Restzeiten gelten vom Moment des Abrisses; die Zeit ohne Host
   * und die Ladezeit zählen für niemanden. Ein laufendes Minispiel läuft mit der Restzeit weiter.
   */
  private resumeAfterHostLoss(): void {
    this.hostReadyDeadline = null;
    const game = this.game;
    if (!game?.paused || this.pauseCause !== 'host-lost') return;
    const result = game.apply({ type: 'resume', at: this.now() });
    if (!result.ok)
      throw new Error(`Fortsetzen nach Host-Verlust abgelehnt: ${result.error.message}`);
    this.pauseCause = null;
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
    if (this.phaseValue === 'board') return this.boardContextFor(player.slot);
    return this.lobbyContextFor(player);
  }

  /**
   * Lobby (v4): Figurenwahl bleibt auch nach `ready` möglich (setzt `ready` zurück).
   * `takenCharacters` = Figuren anderer Slots in `CHARACTER_IDS`-Reihenfolge, `takenBy`
   * dieselben mit Besitzer-Slot (Controller färbt sie in der Besitzerfarbe, CHAOS-40).
   */
  private lobbyContextFor(player: Player): SlotContext {
    const owners = new Map<CharacterId, SlotNumber>();
    for (const other of this.players.values()) {
      if (other.slot !== player.slot && other.character !== null) {
        owners.set(other.character, other.slot);
      }
    }
    const takenBy = CHARACTER_IDS.flatMap((character) => {
      const slot = owners.get(character);
      return slot === undefined ? [] : [{ character, slot }];
    });
    const lobby = {
      character: player.character,
      takenCharacters: takenBy.map((entry) => entry.character),
      takenBy,
      rounds: this.rounds,
    };
    return player.ready
      ? { layout: 'wait', actions: ['pick-character'], lobby }
      : { layout: 'lobby', actions: ['ready', 'pick-character'], lobby };
  }

  /**
   * Brettphase: eigener Stand, und `choose` nur mit offenem Prompt dieses Slots. Während
   * eines Minispiels (M3) Anleitung/Ergebnis, im Spiel Joystick + Knöpfe laut Steckbrief.
   * In der Pause (v4) weder Prompt noch Eingaben; `board.paused` sagt es dem Controller.
   */
  private boardContextFor(slot: SlotNumber): SlotContext {
    const game = this.game;
    const board = game?.infoFor(slot);
    if (!game || !board) return WAIT_CONTEXT;
    const minigame = game.minigameFor(slot);
    // Pause (ADR-015): nichts anbieten; Stand und Minispiel-Info bleiben sichtbar.
    if (game.paused) {
      return minigame
        ? { layout: 'board', actions: [], board, minigame }
        : { layout: 'board', actions: [], board };
    }
    if (minigame?.stage === 'play') {
      return { layout: 'joystick-buttons', actions: game.minigameActions(), board, minigame };
    }
    if (minigame) return { layout: 'board', actions: [], board, minigame };
    const prompt = game.promptFor(slot, this.now());
    return prompt
      ? { layout: 'board', actions: ['choose'], prompt, board }
      : { layout: 'board', actions: [], board };
  }

  private sendContext(to: ConnectionId, slot: SlotNumber): void {
    const player = this.players.get(slot);
    if (!player) return;
    const context = this.contextFor(player);
    this.contextKeys.set(slot, contextKey(context));
    const message: ContextMessage = createMessage('context', {
      slot,
      phase: this.phaseValue,
      layout: context.layout,
      actions: [...context.actions],
      ...(context.prompt === undefined ? {} : { prompt: context.prompt }),
      ...(context.board === undefined ? {} : { board: context.board }),
      ...(context.minigame === undefined ? {} : { minigame: context.minigame }),
      ...(context.lobby === undefined ? {} : { lobby: context.lobby }),
    });
    this.send(to, message);
  }

  /** Neuer Host (oder erneutes Hallo) im laufenden Brettspiel: vollständiger Stand. */
  private sendBoardSnapshot(to: ConnectionId): void {
    if (this.phaseValue !== 'board' || !this.game) return;
    this.send(to, createMessage('board', this.game.snapshotMessage(this.now())));
  }

  /**
   * Nach jedem Ereignis: in der Brettphase neue Spielereignisse an den Host; in jeder Phase
   * geänderte Kontexte an die Controller (nur bei Änderung, nicht bei bloß weiterlaufender
   * Frist). In der Lobby ändern sich Kontexte z. B., wenn jemand eine Figur wählt (v4).
   */
  private syncContexts(): void {
    const game = this.game;
    if (this.phaseValue === 'board' && game) {
      const messages = game.drainBoardMessages(this.now());
      if (this.hostId !== null) {
        for (const body of messages) this.send(this.hostId, createMessage('board', body));
      }
    }
    for (const player of this.sortedPlayers()) {
      if (player.connectionId === null) continue;
      const key = contextKey(this.contextFor(player));
      if (this.contextKeys.get(player.slot) !== key) {
        this.sendContext(player.connectionId, player.slot);
      }
    }
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
      character: player.character,
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
      settings: { rounds: this.rounds, roundPresets: [...this.gameSettings.roundPresets] },
    });
  }

  private send(to: ConnectionId, message: ServerMessage): void {
    this.out.push({ kind: 'send', to, message });
  }

  /** Führt ein Ereignis aus; Ausnahmen werden protokolliert und als `internal` gemeldet. */
  private run(id: ConnectionId | null, handler: () => void): Outgoing[] {
    // `out` und `lobbyDirty` sind zwischen Ereignissen immer leer bzw. false.
    try {
      handler();
      this.syncContexts();
    } catch (error) {
      this.logError(error);
      if (id !== null && this.connections.has(id)) {
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
