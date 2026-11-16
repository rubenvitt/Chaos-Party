/**
 * Sitzung eines Controllers: verbindet Client (Transport), Token-Speicher und
 * Reducer (Zustand) und bietet React einen abonnierbaren Zustand
 * (`subscribe`/`getState` für `useSyncExternalStore`).
 *
 * Ablauf (ADR-003/ADR-006/ADR-009):
 * 1. `join(code)` öffnet die Verbindung.
 * 2. Nach dem Öffnen: gemerktes Token für diesen Code → `reconnect`, sonst `join { seats }`.
 * 3. `welcome` → Token merken. `bad-token` → Token vergessen, neue Verbindung mit `join`.
 * 4. Verbindungsverlust (Close, keine Server-Nachricht seit 10 s, Aufbau hängt > 5 s)
 *    → automatisch neu verbinden mit Backoff (0,5 s, 1 s, 2 s, 4 s, dann alle 5 s, ±20 %).
 *    Sichtbar-Werden der Seite, `online` und Rückkehr aus dem Back-Forward-Cache prüfen
 *    die Verbindung sofort (iOS-Sperrbildschirm/App-Wechsel, B7).
 * 5. Endgültig aufgegeben wird nur, wenn Weiterversuchen nichts bringt: falscher Code,
 *    Spiel voll, neue Version, Spiel läuft schon (Neubeitritt unmöglich) oder der Platz
 *    wurde von einem anderen Tab/Gerät übernommen (Close 4003 – sonst verdrängten sich
 *    zwei Tabs gegenseitig). `retry()` versucht es dann manuell erneut.
 *
 * Die Sitzung ist platzunabhängig: Ein geteiltes iPad (CHAOS-13) nutzt sie mit `seats` > 1;
 * alle Slots einer Verbindung gehen gemeinsam verloren und kommen gemeinsam zurück.
 */
import { createMessage, type ServerToControllerMessage } from '@chaos-party/protocol';
import {
  createInitialState,
  reduce,
  type ControllerEvent,
  type ControllerState,
} from '../state/reducer.ts';
import type { UiErrorCode } from '../state/errors.ts';
import type { LatencyMeter } from '../debug/latencyMeter.ts';
import { backoffDelay } from './backoff.ts';
import {
  browserSocketFactory,
  createClient,
  type ControllerClient,
  type SlotIntent,
  type SocketFactory,
} from './client.ts';
import type { TokenStore } from './tokenStore.ts';
import { browserWakeSource, type WakeSource } from './wake.ts';

/** Abstand der Herzschläge (Rundlaufzeit, Lebenszeichen für den Server, der nach 15 s trennt). */
export const HEARTBEAT_INTERVAL_MS = 5000;
/** Herzschlag-Abstand mit `?debug=1`: mehr RTT-Messwerte für die Debug-Anzeige (CHAOS-45). */
export const DEBUG_HEARTBEAT_INTERVAL_MS = 1000;
/** So lange darf der Verbindungsaufbau dauern (iOS wartet bei unerreichbarem PC sonst ewig). */
export const CONNECT_TIMEOUT_MS = 5000;
/** Ohne jede Server-Nachricht (Herzschlag-Antwort alle 5 s) gilt die Verbindung danach als tot. */
export const DEAD_AFTER_MS = 10_000;
/** Nach dem Aufwachen (Seite wieder sichtbar) muss die Antwort auf einen Herzschlag so schnell kommen. */
export const PROBE_TIMEOUT_MS = 2000;
/** Close-Code des Servers: Slots wurden per `reconnect` von einer anderen Verbindung übernommen. */
export const CLOSE_REPLACED = 4003;

export interface ControllerSessionOptions {
  url: string;
  /** Plätze dieser Verbindung: iPhone 1, geteiltes iPad 2–4 (CHAOS-13). */
  seats: number;
  tokens: TokenStore;
  createSocket?: SocketFactory;
  heartbeatMs?: number;
  connectTimeoutMs?: number;
  deadAfterMs?: number;
  probeTimeoutMs?: number;
  /** Zufall für den Backoff-Jitter, Werte in [0, 1). */
  random?: () => number;
  /**
   * Aufwach-Signale (Sichtbarkeit, `online`, `pageshow`). Standard: die des Browsers,
   * außerhalb des Browsers keine. `null` schaltet sie ab.
   */
  wake?: WakeSource | null;
  /** Uhr für Herzschläge (ms). */
  now?: () => number;
  /** Meldet verworfene Server-Nachrichten (Standard: `console.warn`). */
  warn?: (text: string) => void;
  /**
   * Messer für die Debug-Anzeige (`?debug=1`, CHAOS-45): bekommt jede Herzschlag-Probe,
   * jede Antwort und jede gesendete Slot-Eingabe. Ohne Messer wird nichts gemessen.
   */
  latency?: LatencyMeter;
}

export interface ControllerSession {
  readonly getState: () => ControllerState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Mit einem Join-Code verbinden (auch erneut nach falschem Code). */
  readonly join: (joinCode: string) => void;
  /**
   * Sofort neu verbinden („Jetzt neu verbinden“, Fehlerbildschirm): bricht die Wartezeit
   * ab und nimmt nach einem Aufgeben das automatische Wiederverbinden wieder auf.
   */
  readonly retry: () => void;
  /**
   * Slot-Eingabe senden; `false`, solange keine beigetretene Verbindung besteht. Eine
   * gesendete `choose`-Wahl sperrt die Knöpfe ihres Prompts (`state.choices`); eine zweite
   * Wahl für denselben Prompt wird nicht gesendet.
   */
  readonly sendIntent: (intent: SlotIntent) => boolean;
  /** Toast schließen. */
  readonly dismissNotice: (id: number) => void;
  /** Verbindung schließen, Timer und Aufwach-Signale abmelden. */
  readonly dispose: () => void;
}

type Timer = ReturnType<typeof setTimeout>;

export function createControllerSession(options: ControllerSessionOptions): ControllerSession {
  const createSocket = options.createSocket ?? browserSocketFactory;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS;
  const connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
  const deadAfterMs = options.deadAfterMs ?? DEAD_AFTER_MS;
  const probeTimeoutMs = options.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
  const random = options.random ?? Math.random;
  const now = options.now ?? (() => performance.now());
  const latency = options.latency;
  const warn =
    options.warn ??
    ((text: string) => {
      console.warn(text);
    });

  let state = createInitialState();
  const listeners = new Set<() => void>();
  let client: ControllerClient | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  /** Wachhund: Aufbau-Timeout bzw. „keine Server-Nachricht“. */
  let watchdog: Timer | null = null;
  let retryTimer: Timer | null = null;
  let handshake: 'join' | 'reconnect' = 'join';
  /** Zähler automatischer Versuche seit dem letzten `welcome`. */
  let attempt = 0;
  /** Nach endgültigem Fehler kein automatisches Wiederverbinden mehr (bis `join`/`retry`). */
  let stopped = false;
  let disposed = false;

  function dispatch(event: ControllerEvent) {
    const next = reduce(state, event);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }

  function clearWatchdog() {
    if (watchdog !== null) clearTimeout(watchdog);
    watchdog = null;
  }

  function armWatchdog(ms: number) {
    clearWatchdog();
    watchdog = setTimeout(() => {
      watchdog = null;
      // Socket hängt (Aufbau) oder ist still gestorben (iOS hat den Tab eingefroren).
      lose();
    }, ms);
  }

  function clearRetry() {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function closeClient() {
    if (heartbeat !== null) clearInterval(heartbeat);
    heartbeat = null;
    clearWatchdog();
    client?.close();
    client = null;
    latency?.connectionLost();
  }

  /** Verbindung ist weg: Zustand melden und den nächsten Versuch planen. */
  function lose() {
    closeClient();
    dispatch({ type: 'socket-closed' });
    scheduleReconnect();
  }

  function scheduleReconnect() {
    const joinCode = state.joinCode;
    if (disposed || stopped || joinCode === null || retryTimer !== null) return;
    attempt += 1;
    dispatch({ type: 'reconnect-scheduled', attempt });
    retryTimer = setTimeout(
      () => {
        retryTimer = null;
        open(joinCode);
      },
      backoffDelay(attempt, random),
    );
  }

  function giveUp(reason: UiErrorCode | null) {
    stopped = true;
    attempt = 0;
    clearRetry();
    closeClient();
    if (reason !== null) dispatch({ type: 'gave-up', reason });
    else dispatch({ type: 'socket-closed' });
  }

  function open(joinCode: string) {
    if (disposed) return;
    closeClient();
    clearRetry();
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
            sendHeartbeat(current);
          }, heartbeatMs);
          armWatchdog(deadAfterMs);
        },
        onMessage(message) {
          armWatchdog(deadAfterMs);
          handleMessage(joinCode, message);
        },
        onClose(info) {
          client = null;
          if (info.code === CLOSE_REPLACED) {
            // Ein anderer Tab/ein anderes Gerät spielt jetzt diesen Platz: nicht zurückdrängeln.
            giveUp('replaced');
            return;
          }
          lose();
        },
        onInvalid(error) {
          warn(`Ungültige Server-Nachricht verworfen (${error.code}): ${error.message}`);
        },
      },
      createSocket,
    );
    client = current;
    armWatchdog(connectTimeoutMs);
  }

  /** Herzschlag mit der eigenen Uhr; der Server spiegelt `t` zurück (RTT, ADR-003). */
  function sendHeartbeat(target: ControllerClient) {
    const t = now();
    if (target.send(createMessage('heartbeat', { t }))) latency?.probeSent(t);
  }

  function handleMessage(joinCode: string, message: ServerToControllerMessage) {
    if (message.type === 'heartbeat-ack') latency?.ackReceived(message.t, now());
    if (message.type === 'welcome') {
      attempt = 0;
      options.tokens.save(joinCode, message.sessionToken);
    }
    if (message.type === 'error' && !state.welcomed) {
      switch (message.code) {
        case 'bad-token':
          if (handshake === 'reconnect') {
            // Altes Token gilt nicht mehr (Server neu gestartet, Platz freigegeben): neu beitreten.
            options.tokens.clear();
            open(joinCode);
            return;
          }
          break;
        case 'bad-join-code':
        case 'session-full':
          options.tokens.clear();
          dispatch({ type: 'server', message, receivedAt: now() });
          giveUp(null);
          return;
        case 'version-mismatch':
          dispatch({ type: 'server', message, receivedAt: now() });
          giveUp(null);
          return;
        case 'out-of-phase':
          if (handshake === 'join') {
            // Beitreten geht nur in der Lobby; das Spiel läuft bereits.
            giveUp('game-running');
            return;
          }
          break;
        default:
          break;
      }
    }
    dispatch({ type: 'server', message, receivedAt: now() });
  }

  /** Seite wieder sichtbar / Netz zurück: Verbindung sofort prüfen bzw. sofort neu versuchen. */
  function wake() {
    if (disposed || stopped || state.joinCode === null) return;
    if (client?.isOpen) {
      // Der Socket kann nach dem Einfrieren „offen“ wirken, aber tot sein: Herzschlag als Probe.
      sendHeartbeat(client);
      armWatchdog(probeTimeoutMs);
      return;
    }
    if (client === null) open(state.joinCode);
    // Sonst läuft gerade ein Aufbau; dessen Timeout greift.
  }

  const wakeSource = options.wake === undefined ? browserWakeSource() : options.wake;
  const stopWake = wakeSource?.(() => {
    wake();
  });

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    join(joinCode) {
      stopped = false;
      attempt = 0;
      open(joinCode);
    },
    retry() {
      stopped = false;
      if (state.joinCode !== null) open(state.joinCode);
    },
    sendIntent(intent) {
      if (!state.welcomed) return false;
      // Höchstens eine Wahl pro Prompt (zwei Finger, Doppeltipp); Sperre im Zustand (CHAOS-22).
      if (intent.type === 'choose' && state.choices[intent.slot]?.promptId === intent.promptId) {
        return false;
      }
      const sent = client?.sendIntent(intent) ?? false;
      if (sent) latency?.inputSent(now());
      if (sent && intent.type === 'choose') {
        dispatch({
          type: 'choice-sent',
          slot: intent.slot,
          promptId: intent.promptId,
          option: intent.option,
        });
      }
      if (sent && intent.type === 'pick-character') {
        dispatch({
          type: 'pick-sent',
          slot: intent.slot,
          character: intent.character,
          seq: client?.lastSeq ?? null,
        });
      }
      return sent;
    },
    dismissNotice(id) {
      dispatch({ type: 'notice-dismissed', id });
    },
    dispose() {
      disposed = true;
      clearRetry();
      closeClient();
      stopWake?.();
    },
  };
}
