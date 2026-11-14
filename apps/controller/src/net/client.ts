/**
 * Framework-unabhängiger WebSocket-Client des Controllers (ADR-006).
 *
 * - Prüft **jede** eingehende Nachricht mit `parseServerToControllerMessage`;
 *   ungültige werden verworfen und gemeldet, nie weitergereicht.
 * - Vergibt `seq` für Slot-Eingaben selbst: ein Zähler pro Verbindung, streng
 *   steigend über alle Slots (ADR-003, B8). Eine neue Verbindung = neuer Client
 *   = neuer Zähler.
 * - Kennt weder React noch Join-Logik; die Sitzung (`session.ts`) entscheidet,
 *   was nach dem Öffnen gesendet wird.
 */
import {
  encode,
  parseServerToControllerMessage,
  PROTOCOL_VERSION,
  type ControllerMessage,
  type ProtocolError,
  type ServerToControllerMessage,
  type SlotIntentMessage,
} from '@chaos-party/protocol';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Slot-Eingabe ohne Umschlag und ohne `seq` – die ergänzt der Client. */
export type SlotIntent = DistributiveOmit<SlotIntentMessage, 'v' | 'seq'>;

/** Teilmenge von `WebSocket`, die der Client braucht (für Tests austauschbar). */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type SocketFactory = (url: string) => SocketLike;

/** `WebSocket.OPEN` als Konstante, damit Tests ohne DOM auskommen. */
const OPEN = 1;

export const browserSocketFactory: SocketFactory = (url) => new WebSocket(url);

export interface ClientHandlers {
  onOpen(): void;
  onMessage(message: ServerToControllerMessage): void;
  /** Verbindung beendet (auch wenn sie nie offen war). Nicht bei `close()` durch uns. */
  onClose(info: { code: number; wasOpen: boolean }): void;
  /** Ungültige Server-Nachricht (wird ignoriert). */
  onInvalid?(error: ProtocolError): void;
}

export interface ControllerClient {
  /** Handshake- oder Herzschlag-Nachricht unverändert senden. */
  send(message: ControllerMessage): boolean;
  /** Slot-Eingabe mit nächster `seq` senden; `false`, wenn nicht verbunden. */
  sendIntent(intent: SlotIntent): boolean;
  readonly isOpen: boolean;
  /** Zuletzt vergebene `seq` (oder `null`). */
  readonly lastSeq: number | null;
  /** Schließt die Verbindung, ohne `onClose` auszulösen. */
  close(): void;
}

/** WebSocket-Adresse des Servers: gleicher Ursprung, Pfad `/ws`. */
export function controllerSocketUrl(location: { protocol: string; host: string }): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/ws`;
}

export function createClient(
  url: string,
  handlers: ClientHandlers,
  createSocket: SocketFactory = browserSocketFactory,
): ControllerClient {
  let seq = 0;
  let lastSeq: number | null = null;
  let wasOpen = false;
  let detached = false;
  const socket = createSocket(url);

  socket.onopen = () => {
    if (detached) return;
    wasOpen = true;
    handlers.onOpen();
  };
  socket.onmessage = (event) => {
    if (detached) return;
    const result = parseServerToControllerMessage(event.data);
    if (result.ok) handlers.onMessage(result.message);
    else handlers.onInvalid?.(result.error);
  };
  socket.onclose = (event) => {
    if (detached) return;
    detached = true;
    handlers.onClose({ code: event.code, wasOpen });
  };
  // Fehler kündigen immer ein `close` an; Behandlung dort.
  socket.onerror = () => undefined;

  function rawSend(text: string): boolean {
    if (detached || socket.readyState !== OPEN) return false;
    try {
      socket.send(text);
      return true;
    } catch {
      return false;
    }
  }

  return {
    send(message) {
      return rawSend(encode(message));
    },
    sendIntent(intent) {
      if (detached || socket.readyState !== OPEN) return false;
      seq += 1;
      lastSeq = seq;
      const message = { ...intent, v: PROTOCOL_VERSION, seq } as SlotIntentMessage;
      return rawSend(encode(message));
    },
    get isOpen() {
      return !detached && socket.readyState === OPEN;
    },
    get lastSeq() {
      return lastSeq;
    },
    close() {
      detached = true;
      try {
        socket.close(1000, 'client');
      } catch {
        // bereits geschlossen
      }
    },
  };
}
