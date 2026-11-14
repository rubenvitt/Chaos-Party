/**
 * Reiner Zustand des Controllers: Server-Nachrichten und Verbindungsereignisse
 * → UI-Zustand. Kein DOM, kein Netzwerk, keine Uhr (Zeitpunkte kommen im Ereignis).
 *
 * Der Zustand kennt beliebig viele Slots, damit der iPad-Modus (CHAOS-13) denselben
 * Reducer nutzt; das iPhone zeigt nur den ersten Slot aus `players`.
 */
import type {
  Action,
  FeedbackKind,
  Layout,
  Phase,
  PlayerInfo,
  ServerToControllerMessage,
  SlotNumber,
} from '@chaos-party/protocol';
import { errorSeverity, type UiErrorCode } from './errors.ts';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed';

export interface SlotContext {
  readonly phase: Phase;
  readonly layout: Layout;
  readonly actions: readonly Action[];
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
  /** Fehler, der den ganzen Bildschirm bestimmt (Code-Eingabe oder Fehlerseite). */
  readonly fatal: UiErrorCode | null;
  readonly notice: Notice | null;
  /** Letzte gemessene Rundlaufzeit (Herzschlag) in ms. */
  readonly rttMs: number | null;
  /** Fortlaufender Zähler für `id`s. */
  readonly counter: number;
}

export type ControllerEvent =
  | { readonly type: 'connect'; readonly joinCode: string }
  | { readonly type: 'socket-open' }
  | { readonly type: 'socket-closed' }
  | {
      readonly type: 'server';
      readonly message: ServerToControllerMessage;
      /** Empfangszeit auf derselben Uhr wie `heartbeat.t`. */
      readonly receivedAt: number;
    }
  | { readonly type: 'notice-dismissed'; readonly id: number };

export function createInitialState(joinCode: string | null = null): ControllerState {
  return {
    joinCode,
    connection: 'idle',
    welcomed: false,
    sessionToken: null,
    players: [],
    contexts: {},
    feedback: {},
    fatal: null,
    notice: null,
    rttMs: null,
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
    case 'socket-closed': {
      const lost: UiErrorCode =
        state.sessionToken === null ? 'connection-failed' : 'connection-lost';
      return {
        ...state,
        connection: 'closed',
        welcomed: false,
        // Ein bereits gesetzter Grund (z. B. falscher Code) bleibt die bessere Erklärung.
        fatal: state.fatal ?? lost,
      };
    }
    case 'notice-dismissed':
      return state.notice?.id === event.id ? { ...state, notice: null } : state;
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
    case 'welcome':
      return {
        ...state,
        welcomed: true,
        sessionToken: message.sessionToken,
        players: message.players,
        fatal: null,
      };
    case 'context':
      return {
        ...state,
        contexts: {
          ...state.contexts,
          [message.slot]: {
            phase: message.phase,
            layout: message.layout,
            actions: message.actions,
          },
        },
      };
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
        return { ...state, counter: id, notice: { code: message.code, id } };
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

export type Screen = 'code-entry' | 'connecting' | 'error' | 'controller';

/** Welcher Bildschirm gezeigt wird – eine Stelle für App und Tests. */
export function selectScreen(state: ControllerState): Screen {
  if (state.joinCode === null) return 'code-entry';
  if (state.fatal !== null) return 'error';
  if (!state.welcomed) return 'connecting';
  return 'controller';
}

/** Fehlertext für die Code-Eingabe (nur bei falschem Code). */
export function selectCodeEntryError(state: ControllerState): UiErrorCode | null {
  return state.fatal === 'bad-join-code' ? state.fatal : null;
}
