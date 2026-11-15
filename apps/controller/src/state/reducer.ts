/**
 * Reiner Zustand des Controllers: Server-Nachrichten und Verbindungsereignisse
 * → UI-Zustand. Kein DOM, kein Netzwerk, keine Uhr (Zeitpunkte kommen im Ereignis).
 *
 * Der Zustand kennt beliebig viele Slots, damit der iPad-Modus (CHAOS-13) denselben
 * Reducer nutzt; das iPhone zeigt nur den ersten Slot aus `players`.
 */
import type {
  Action,
  ControllerBoardInfo,
  FeedbackKind,
  Layout,
  Phase,
  PlayerInfo,
  ServerToControllerMessage,
  SlotNumber,
} from '@chaos-party/protocol';
import { activatePrompt, type ActivePrompt } from '../board/countdown.ts';
import { errorSeverity, type UiErrorCode } from './errors.ts';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed';

export interface SlotContext {
  readonly phase: Phase;
  readonly layout: Layout;
  readonly actions: readonly Action[];
  /** Brettphase (CHAOS-22): offene Entscheidung samt lokaler Frist (nur Anzeige). */
  readonly prompt?: ActivePrompt;
  /** Brettphase: eigener Stand und wer dran ist. */
  readonly board?: ControllerBoardInfo;
}

/** Gesendete, noch unbeantwortete Wahl eines Slots: sperrt die Knöpfe dieses Prompts. */
export interface PendingChoice {
  readonly promptId: number;
  readonly option: string;
}

/** Kurzer Hinweis (Toast); `id` unterscheidet gleiche Codes hintereinander. */
export interface Notice {
  readonly code: UiErrorCode;
  readonly id: number;
}

/** Rückmeldung an einen Slot; `id` startet die Animation neu. */
export interface FeedbackPulse {
  readonly kind: FeedbackKind;
  readonly id: number;
}

export interface ControllerState {
  /** Gültiger Join-Code oder `null` (dann Code-Eingabe). */
  readonly joinCode: string | null;
  readonly connection: ConnectionStatus;
  /** `welcome` auf der aktuellen Verbindung erhalten. */
  readonly welcomed: boolean;
  /** Token der Sitzung (bleibt nach Verbindungsverlust für `reconnect` erhalten). */
  readonly sessionToken: string | null;
  readonly players: readonly PlayerInfo[];
  readonly contexts: Readonly<Partial<Record<SlotNumber, SlotContext>>>;
  readonly feedback: Readonly<Partial<Record<SlotNumber, FeedbackPulse>>>;
  /**
   * Gesendete Wahl je Slot (CHAOS-22). Gelöst durch einen Kontext mit anderem/keinem
   * Prompt, durch `invalid-choice` oder durch Verbindungsverlust (die Wahl kam evtl. nie an).
   */
  readonly choices: Readonly<Partial<Record<SlotNumber, PendingChoice>>>;
  /** Fehler, der den ganzen Bildschirm bestimmt (Code-Eingabe oder Fehlerseite). */
  readonly fatal: UiErrorCode | null;
  readonly notice: Notice | null;
  /** Letzte gemessene Rundlaufzeit (Herzschlag) in ms. */
  readonly rttMs: number | null;
  /**
   * Laufender automatischer Wiederverbindungsversuch seit dem letzten `welcome`
   * (1, 2, …); 0, solange die Verbindung steht oder der erste Versuch läuft (CHAOS-12).
   */
  readonly attempt: number;
  /** Fortlaufender Zähler für `id`s. */
  readonly counter: number;
}

export type ControllerEvent =
  | { readonly type: 'connect'; readonly joinCode: string }
  | { readonly type: 'socket-open' }
  /** Verbindung zu (oder tot erkannt). Kein Fehlerbildschirm: Die Sitzung verbindet neu. */
  | { readonly type: 'socket-closed' }
  /** Nächster automatischer Versuch ist geplant (CHAOS-12). */
  | { readonly type: 'reconnect-scheduled'; readonly attempt: number }
  /** Kein automatisches Wiederverbinden mehr; `reason` erklärt warum (Fehlerbildschirm). */
  | { readonly type: 'gave-up'; readonly reason: UiErrorCode }
  | {
      readonly type: 'server';
      readonly message: ServerToControllerMessage;
      /** Empfangszeit auf derselben Uhr wie `heartbeat.t`. */
      readonly receivedAt: number;
    }
  | { readonly type: 'notice-dismissed'; readonly id: number }
  /** Eine Wahl wurde gesendet (Sitzung, CHAOS-22): Knöpfe dieses Prompts sperren. */
  | {
      readonly type: 'choice-sent';
      readonly slot: SlotNumber;
      readonly promptId: number;
      readonly option: string;
    };

export function createInitialState(joinCode: string | null = null): ControllerState {
  return {
    joinCode,
    connection: 'idle',
    welcomed: false,
    sessionToken: null,
    players: [],
    contexts: {},
    feedback: {},
    choices: {},
    fatal: null,
    notice: null,
    rttMs: null,
    attempt: 0,
    counter: 0,
  };
}

export function reduce(state: ControllerState, event: ControllerEvent): ControllerState {
  switch (event.type) {
    case 'connect': {
      // Neuer Code = neue Sitzung; gleicher Code = Wiederverbinden mit altem Bild bis zum neuen Kontext.
      const base = event.joinCode === state.joinCode ? state : createInitialState(event.joinCode);
      return {
        ...base,
        joinCode: event.joinCode,
        connection: 'connecting',
        welcomed: false,
        fatal: null,
        notice: null,
      };
    }
    case 'socket-open':
      return { ...state, connection: 'open' };
    case 'socket-closed':
      // Spieler und Kontexte bleiben: Der Controller bleibt sichtbar, darüber die
      // Wiederverbinden-Anzeige (`selectLink`). Ein gesetzter Grund (z. B. falscher Code) bleibt.
      // Gesendete Wahlen entsperren: Ob sie ankamen, ist offen; der neue Kontext klärt es.
      return state.connection === 'closed' && !state.welcomed
        ? state
        : { ...state, connection: 'closed', welcomed: false, choices: {} };
    case 'reconnect-scheduled':
      return state.attempt === event.attempt ? state : { ...state, attempt: event.attempt };
    case 'gave-up':
      return { ...state, connection: 'closed', welcomed: false, attempt: 0, fatal: event.reason };
    case 'notice-dismissed':
      return state.notice?.id === event.id ? { ...state, notice: null } : state;
    case 'choice-sent': {
      // Nur für den Prompt sperren, der gerade angezeigt wird.
      if (state.contexts[event.slot]?.prompt?.info.id !== event.promptId) return state;
      return {
        ...state,
        choices: {
          ...state.choices,
          [event.slot]: { promptId: event.promptId, option: event.option },
        },
      };
    }
    case 'server':
      return reduceServerMessage(state, event.message, event.receivedAt);
  }
}

function reduceServerMessage(
  state: ControllerState,
  message: ServerToControllerMessage,
  receivedAt: number,
): ControllerState {
  switch (message.type) {
    case 'welcome': {
      // Nach einem Neubeitritt (Token abgelaufen) können die Slots andere sein:
      // Kontexte und Rückmeldungen fremder Slots verwerfen, eigene bis zum neuen `context` behalten.
      const slots = new Set<SlotNumber>(message.players.map((player) => player.slot));
      const keep = <T>(record: Readonly<Partial<Record<SlotNumber, T>>>) =>
        Object.fromEntries(
          Object.entries(record).filter(([slot]) => slots.has(Number(slot) as SlotNumber)),
        ) as Partial<Record<SlotNumber, T>>;
      return {
        ...state,
        welcomed: true,
        sessionToken: message.sessionToken,
        players: message.players,
        contexts: keep(state.contexts),
        feedback: keep(state.feedback),
        choices: {},
        fatal: null,
        attempt: 0,
      };
    }
    case 'context': {
      // Ein Kontext ersetzt den vorherigen vollständig (auch `prompt`/`board`).
      const previous = state.contexts[message.slot]?.prompt;
      const prompt =
        message.prompt === undefined
          ? undefined
          : activatePrompt(message.prompt, previous, receivedAt);
      const context: SlotContext = {
        phase: message.phase,
        layout: message.layout,
        actions: message.actions,
        ...(prompt !== undefined && { prompt }),
        ...(message.board !== undefined && { board: message.board }),
      };
      const pending = state.choices[message.slot];
      const keepLock = pending !== undefined && prompt?.info.id === pending.promptId;
      return {
        ...state,
        contexts: { ...state.contexts, [message.slot]: context },
        choices:
          keepLock || pending === undefined ? state.choices : without(state.choices, message.slot),
      };
    }
    case 'feedback': {
      const id = state.counter + 1;
      return {
        ...state,
        counter: id,
        feedback: { ...state.feedback, [message.slot]: { kind: message.kind, id } },
      };
    }
    case 'error': {
      const severity = errorSeverity(message.code);
      if (severity === 'silent') return state;
      if (severity === 'toast') {
        const id = state.counter + 1;
        // Wahl abgelehnt (zu spät, veraltet): Sperre lösen, damit neu gewählt werden kann.
        const choices = message.code === 'invalid-choice' ? {} : state.choices;
        return { ...state, counter: id, notice: { code: message.code, id }, choices };
      }
      if (severity === 'code') {
        return {
          ...state,
          joinCode: null,
          welcomed: false,
          sessionToken: null,
          fatal: message.code,
        };
      }
      return { ...state, fatal: message.code };
    }
    case 'heartbeat-ack': {
      const rtt = receivedAt - message.t;
      return Number.isFinite(rtt) && rtt >= 0 ? { ...state, rttMs: rtt } : state;
    }
  }
}

function without<T>(
  record: Readonly<Partial<Record<SlotNumber, T>>>,
  slot: SlotNumber,
): Partial<Record<SlotNumber, T>> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => Number(key) !== slot));
}

export type Screen = 'code-entry' | 'connecting' | 'error' | 'controller';

/**
 * Welcher Bildschirm gezeigt wird – eine Stelle für App und Tests. Nach einem
 * Verbindungsverlust bleibt der Controller stehen (Spieler bekannt); die
 * Wiederverbinden-Anzeige liegt darüber (`selectLink`, CHAOS-12).
 */
export function selectScreen(state: ControllerState): Screen {
  if (state.joinCode === null) return 'code-entry';
  if (state.fatal !== null) return 'error';
  if (!state.welcomed && state.players.length === 0) return 'connecting';
  return 'controller';
}

/**
 * Verbindungsanzeige (CHAOS-12):
 * - `hidden`: Code-Eingabe oder Fehlerbildschirm – nichts anzeigen,
 * - `connecting`: erster Verbindungsaufbau (der Verbinden-Bildschirm erklärt es),
 * - `online`: beigetreten, Verbindung offen (kleine Pille),
 * - `reconnecting`: Verbindung weg, automatische Versuche laufen (großes Overlay);
 *   `hadSession` unterscheidet „Verbindung verloren“ von „PC nicht erreichbar“.
 */
export type LinkView =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'connecting' }
  | { readonly kind: 'online'; readonly rttMs: number | null }
  | { readonly kind: 'reconnecting'; readonly attempt: number; readonly hadSession: boolean };

export function selectLink(state: ControllerState): LinkView {
  if (state.joinCode === null || state.fatal !== null) return { kind: 'hidden' };
  if (state.welcomed && state.connection === 'open') return { kind: 'online', rttMs: state.rttMs };
  const hadSession = state.players.length > 0;
  if (hadSession || state.attempt > 0) {
    return { kind: 'reconnecting', attempt: state.attempt, hadSession };
  }
  return { kind: 'connecting' };
}

/** Fehlertext für die Code-Eingabe (nur bei falschem Code). */
export function selectCodeEntryError(state: ControllerState): UiErrorCode | null {
  return state.fatal === 'bad-join-code' ? state.fatal : null;
}
