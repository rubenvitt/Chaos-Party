/**
 * WebSocket-Verbindung des Hosts zum Session-Server (CHAOS-11, ADR-005/ADR-007).
 *
 * Meldet sich mit `host-hello` an, liefert `lobby`-Schnappschüsse und geprüfte
 * Eingaben (`input`) an die App und versucht es nach einer Trennung alle 2 s
 * erneut. Vollständige Reconnect-/Heartbeat-Logik (Timeouts) folgt mit CHAOS-12.
 * Ohne DOM-Abhängigkeit (Socket-Fabrik und Timer injizierbar), damit Unit-Tests
 * in Node laufen.
 */
import {
  createMessage,
  encode,
  parseServerToHostMessage,
  type ErrorMessage,
  type InputIntent,
  type LobbyMessage,
} from '@chaos-party/protocol';

/**
 * - `connecting`: erster Verbindungsversuch läuft
 * - `connected`: als Host angemeldet (erste `lobby` empfangen)
 * - `disconnected`: Server nicht erreichbar oder Verbindung verloren; neuer Versuch alle 2 s
 * - `host-taken`: Ein anderer Host (zweiter Tab/PC) ist bereits verbunden (Close 4002)
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'host-taken';

/** WebSocket-Close-Code des Servers „Host bereits vergeben“ (ADR-005). */
export const CLOSE_HOST_TAKEN = 4002;
export const DEFAULT_RETRY_MS = 2000;

/** Teilmenge der Browser-WebSocket-API, die wir nutzen. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface HostConnectionHandlers {
  onStatus?(status: ConnectionStatus): void;
  onLobby?(lobby: LobbyMessage): void;
  onInput?(intent: InputIntent, at: number): void;
  onServerError?(error: ErrorMessage): void;
}

export interface HostConnectionOptions {
  readonly createSocket?: (url: string) => SocketLike;
  readonly retryMs?: number;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
  /** Für ungültige Server-Nachrichten (Standard: `console.warn`). */
  readonly warn?: (message: string) => void;
}

export interface HostConnection {
  readonly status: ConnectionStatus;
  /** Sendet `start`; `false`, wenn gerade keine Verbindung besteht. */
  sendStart(): boolean;
  /** Trennt endgültig (kein neuer Versuch). */
  close(): void;
}

const CONNECTING = 0;
const OPEN = 1;

export function connectHost(
  url: string,
  handlers: HostConnectionHandlers,
  options: HostConnectionOptions = {},
): HostConnection {
  const createSocket =
    options.createSocket ?? ((target: string) => new WebSocket(target) as unknown as SocketLike);
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const setTimer = options.setTimer ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearTimer =
    options.clearTimer ??
    ((handle: unknown) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    });
  const warn =
    options.warn ??
    ((message: string) => {
      console.warn(message);
    });

  let status: ConnectionStatus = 'connecting';
  let socket: SocketLike | undefined;
  let retryTimer: unknown;
  let closed = false;

  const setStatus = (next: ConnectionStatus) => {
    if (next === status) return;
    status = next;
    handlers.onStatus?.(next);
  };

  const scheduleRetry = () => {
    if (closed || retryTimer !== undefined) return;
    retryTimer = setTimer(() => {
      retryTimer = undefined;
      open();
    }, retryMs);
  };

  function open() {
    if (closed) return;
    let current: SocketLike;
    try {
      current = createSocket(url);
    } catch (error) {
      warn(`Server-Verbindung fehlgeschlagen: ${String(error)}`);
      if (status === 'connected') setStatus('disconnected');
      scheduleRetry();
      return;
    }
    socket = current;

    current.onopen = () => {
      if (socket !== current) return;
      // Als verbunden gilt der Host erst mit dem ersten `lobby`: Ist schon ein anderer
      // Host da, schließt der Server sofort mit 4002, ohne Lobby.
      current.send(encode(createMessage('host-hello', {})));
    };
    current.onmessage = (event) => {
      if (socket !== current || typeof event.data !== 'string') return;
      const parsed = parseServerToHostMessage(event.data);
      if (!parsed.ok) {
        warn(`Ungültige Server-Nachricht ignoriert: ${parsed.error.message}`);
        return;
      }
      const message = parsed.message;
      switch (message.type) {
        case 'lobby':
          setStatus('connected');
          handlers.onLobby?.(message);
          break;
        case 'input':
          handlers.onInput?.(message.intent, message.at);
          break;
        case 'error':
          handlers.onServerError?.(message);
          break;
        case 'heartbeat-ack':
          break;
      }
    };
    current.onerror = () => {
      // Der Browser meldet Details selbst; `onclose` folgt immer und plant den neuen Versuch.
    };
    current.onclose = (event) => {
      if (socket !== current) return;
      socket = undefined;
      if (closed) return;
      setStatus(event.code === CLOSE_HOST_TAKEN ? 'host-taken' : 'disconnected');
      scheduleRetry();
    };
  }

  open();

  return {
    get status() {
      return status;
    },
    sendStart() {
      if (socket?.readyState !== OPEN || status !== 'connected') return false;
      socket.send(encode(createMessage('start', {})));
      return true;
    },
    close() {
      closed = true;
      if (retryTimer !== undefined) {
        clearTimer(retryTimer);
        retryTimer = undefined;
      }
      const current = socket;
      socket = undefined;
      if (!current) return;
      if (current.readyState === CONNECTING) {
        // Ein Schließen während des Aufbaus meldet Chrome als Konsolenfehler („closed before
        // the connection is established“) – passiert z. B. im React-StrictMode bei jedem
        // Mount. Deshalb erst nach dem Öffnen schließen, ohne `host-hello` zu senden.
        current.onopen = () => {
          current.close(1000, 'Host beendet');
        };
        current.onmessage = null;
        return;
      }
      current.close(1000, 'Host beendet');
    },
  };
}
