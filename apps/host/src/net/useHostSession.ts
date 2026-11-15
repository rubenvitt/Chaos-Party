import type { LobbyMessage } from '@chaos-party/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createBoardDirector, type BoardDirector } from '../board/director.ts';
import { createIntentHub, type IntentHub } from '../input/webSocketInputSource.ts';
import {
  connectHost,
  type ConnectionStatus,
  type HostConnection,
  type StartOptions,
} from './hostConnection.ts';

export interface HostSession {
  /** `null` im lokalen Tastatur-Modus (keine Verbindung). */
  readonly status: ConnectionStatus | null;
  /** Letzter `lobby`-Schnappschuss des Servers. */
  readonly lobby: LobbyMessage | null;
  /** Verteiler für geprüfte Eingaben; stabil über die Lebensdauer der Komponente. */
  readonly hub: IntentHub;
  /**
   * Regie der Brettphase (M2): bekommt jede `board`-Nachricht des Servers. Stabil über die
   * Lebensdauer der Komponente; im lokalen Modus füttert die App sie mit Demo-Nachrichten.
   */
  readonly director: BoardDirector;
  /** Schickt `start` (Modus, Runden); `false`, wenn nicht verbunden. Stabile Referenz. */
  readonly start: (options?: StartOptions) => boolean;
}

/**
 * Hält die Server-Verbindung des Hosts (React-Seite von `connectHost`).
 * `url === null` → lokaler Modus ohne Verbindung.
 */
export function useHostSession(url: string | null): HostSession {
  const [hub] = useState(createIntentHub);
  const [director] = useState(() => createBoardDirector());
  const [status, setStatus] = useState<ConnectionStatus | null>(url === null ? null : 'connecting');
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const connectionRef = useRef<HostConnection | null>(null);

  useEffect(() => {
    if (url === null) return;
    const connection = connectHost(url, {
      onStatus: setStatus,
      onLobby: setLobby,
      onBoard: (board) => {
        director.receive(board);
      },
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
  }, [url, hub, director]);

  const start = useCallback(
    (options?: StartOptions) => connectionRef.current?.sendStart(options) ?? false,
    [],
  );

  return { status, lobby, hub, director, start };
}
