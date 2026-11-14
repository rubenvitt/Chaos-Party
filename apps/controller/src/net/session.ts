/**
 * Sitzung eines Controllers: verbindet Client (Transport), Token-Speicher und
 * Reducer (Zustand) und bietet React einen abonnierbaren Zustand
 * (`subscribe`/`getState` für `useSyncExternalStore`).
 *
 * Ablauf (ADR-003/ADR-006):
 * 1. `join(code)` öffnet die Verbindung.
 * 2. Nach dem Öffnen: gemerktes Token für diesen Code → `reconnect`, sonst `join { seats }`.
 * 3. `welcome` → Token merken. `bad-token` → Token vergessen, neue Verbindung mit `join`.
 * 4. Verbindungsverlust → Zustand `connection-lost`; `retry()` verbindet neu (mit Token).
 *
 * CHAOS-12 ersetzt das manuelle `retry()` durch automatisches Wiederverbinden mit
 * Backoff – die Stelle ist mit „CHAOS-12“ markiert.
 */
import { createMessage, type ServerToControllerMessage } from '@chaos-party/protocol';
import {
  createInitialState,
  reduce,
  type ControllerEvent,
  type ControllerState,
} from '../state/reducer.ts';
import {
  browserSocketFactory,
  createClient,
  type ControllerClient,
  type SlotIntent,
  type SocketFactory,
} from './client.ts';
import type { TokenStore } from './tokenStore.ts';

/** Abstand der Herzschläge (Rundlaufzeit, Lebenszeichen für den Server). */
export const HEARTBEAT_INTERVAL_MS = 5000;

export interface ControllerSessionOptions {
  url: string;
  /** Plätze dieser Verbindung: iPhone 1, geteiltes iPad 2–4 (CHAOS-13). */
  seats: number;
  tokens: TokenStore;
  createSocket?: SocketFactory;
  heartbeatMs?: number;
  /** Uhr für Herzschläge (ms). */
  now?: () => number;
  /** Meldet verworfene Server-Nachrichten (Standard: `console.warn`). */
  warn?: (text: string) => void;
}

export interface ControllerSession {
  readonly getState: () => ControllerState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Mit einem Join-Code verbinden (auch erneut nach falschem Code). */
  readonly join: (joinCode: string) => void;
  /** Nach Verbindungsverlust mit demselben Code (und Token) neu verbinden. */
  readonly retry: () => void;
  /** Slot-Eingabe senden; `false`, wenn gerade keine Verbindung besteht. */
  readonly sendIntent: (intent: SlotIntent) => boolean;
  /** Toast schließen. */
  readonly dismissNotice: (id: number) => void;
  /** Verbindung schließen und Timer stoppen. */
  readonly dispose: () => void;
}

export function createControllerSession(options: ControllerSessionOptions): ControllerSession {
  const createSocket = options.createSocket ?? browserSocketFactory;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS;
  const now = options.now ?? (() => performance.now());
  const warn =
    options.warn ??
    ((text: string) => {
      console.warn(text);
    });

  let state = createInitialState();
  const listeners = new Set<() => void>();
  let client: ControllerClient | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let handshake: 'join' | 'reconnect' = 'join';

  function dispatch(event: ControllerEvent) {
    const next = reduce(state, event);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }

  function stopHeartbeat() {
    if (heartbeat !== null) clearInterval(heartbeat);
    heartbeat = null;
  }

  function closeClient() {
    stopHeartbeat();
    client?.close();
    client = null;
  }

  function open(joinCode: string) {
    closeClient();
    dispatch({ type: 'connect', joinCode });
    const current = createClient(
      options.url,
      {
        onOpen() {
          dispatch({ type: 'socket-open' });
          const token = options.tokens.load(joinCode);
          if (token !== null) {
            handshake = 'reconnect';
            current.send(createMessage('reconnect', { sessionToken: token }));
          } else {
            handshake = 'join';
            current.send(createMessage('join', { joinCode, seats: options.seats }));
          }
          heartbeat = setInterval(() => {
            current.send(createMessage('heartbeat', { t: now() }));
          }, heartbeatMs);
        },
        onMessage(message) {
          handleMessage(joinCode, message);
        },
        onClose() {
          stopHeartbeat();
          client = null;
          dispatch({ type: 'socket-closed' });
          // CHAOS-12: hier automatisch mit Backoff neu verbinden (Token liegt im Speicher).
        },
        onInvalid(error) {
          warn(`Ungültige Server-Nachricht verworfen (${error.code}): ${error.message}`);
        },
      },
      createSocket,
    );
    client = current;
  }

  function handleMessage(joinCode: string, message: ServerToControllerMessage) {
    if (message.type === 'welcome') {
      options.tokens.save(joinCode, message.sessionToken);
    }
    if (message.type === 'error') {
      if (message.code === 'bad-token' && handshake === 'reconnect') {
        // Altes Token gilt nicht mehr (Server neu gestartet, Platz vergeben): neu beitreten.
        options.tokens.clear();
        open(joinCode);
        return;
      }
      if (message.code === 'bad-join-code' || message.code === 'session-full') {
        options.tokens.clear();
        dispatch({ type: 'server', message, receivedAt: now() });
        closeClient();
        dispatch({ type: 'socket-closed' });
        return;
      }
    }
    dispatch({ type: 'server', message, receivedAt: now() });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    join(joinCode) {
      open(joinCode);
    },
    retry() {
      if (state.joinCode !== null) open(state.joinCode);
    },
    sendIntent(intent) {
      return client?.sendIntent(intent) ?? false;
    },
    dismissNotice(id) {
      dispatch({ type: 'notice-dismissed', id });
    },
    dispose() {
      closeClient();
    },
  };
}
