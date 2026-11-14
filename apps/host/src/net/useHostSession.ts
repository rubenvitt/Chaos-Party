import type { LobbyMessage } from '@chaos-party/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createIntentHub, type IntentHub } from '../input/webSocketInputSource.ts';
import { connectHost, type ConnectionStatus, type HostConnection } from './hostConnection.ts';

export interface HostSession {
  /** `null` im lokalen Tastatur-Modus (keine Verbindung). */
  readonly status: ConnectionStatus | null;
  /** Letzter `lobby`-Schnappschuss des Servers. */
  readonly lobby: LobbyMessage | null;
  /** Verteiler für geprüfte Eingaben; stabil über die Lebensdauer der Komponente. */
  readonly hub: IntentHub;
  /** Schickt `start`; `false`, wenn nicht verbunden. Stabile Referenz. */
  readonly start: () => boolean;
}

/**
 * Hält die Server-Verbindung des Hosts (React-Seite von `connectHost`).
 * `url === null` → lokaler Modus ohne Verbindung.
 */
export function useHostSession(url: string | null): HostSession {
  const [hub] = useState(createIntentHub);
  const [status, setStatus] = useState<ConnectionStatus | null>(url === null ? null : 'connecting');
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const connectionRef = useRef<HostConnection | null>(null);

  useEffect(() => {
    if (url === null) return;
    const connection = connectHost(url, {
      onStatus: setStatus,
      onLobby: setLobby,
      onInput: (intent) => {
        hub.emit(intent);
      },
      onServerError: (error) => {
        console.warn(`Server meldet ${error.code}: ${error.message}`);
      },
    });
    connectionRef.current = connection;
    return () => {
      connection.close();
      if (connectionRef.current === connection) connectionRef.current = null;
    };
  }, [url, hub]);

  const start = useCallback(() => connectionRef.current?.sendStart() ?? false, []);

  return { status, lobby, hub, start };
}
