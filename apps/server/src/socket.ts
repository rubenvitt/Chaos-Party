/**
 * Dünner WebSocket-Adapter (`ws`) um die transportfreie `Session` (CHAOS-9, ADR-005).
 *
 * Hängt am vorhandenen `node:http`-Server (ein Port für Controller-App und
 * WebSocket, Annahme B9) und nimmt nur Upgrades auf `WS_PATH` an.
 */
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { encode } from '@chaos-party/protocol';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { ConnectionId, Outgoing, Session } from './session.ts';

export const WS_PATH = '/ws';
/** Obergrenze je Frame in Bytes; größere Frames schließt `ws` mit 1009. */
export const MAX_PAYLOAD_BYTES = 16 * 1024;
/** Obergrenze gleichzeitiger WebSocket-Verbindungen (4 Controller + Host + Reserve für Reconnects). */
export const MAX_CONNECTIONS = 64;

export interface SocketAdapter {
  /** Schließt alle Verbindungen sofort und beendet den WebSocket-Server. */
  close(): Promise<void>;
  readonly connectionCount: number;
}

export function attachWebSocket(server: Server, session: Session): SocketAdapter {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const sockets = new Map<ConnectionId, WebSocket>();
  let nextId: ConnectionId = 1;

  const apply = (actions: Outgoing[]) => {
    for (const action of actions) {
      const socket = sockets.get(action.to);
      if (!socket) continue;
      if (action.kind === 'send') {
        if (socket.readyState === socket.OPEN) socket.send(encode(action.message));
      } else {
        sockets.delete(action.to);
        socket.close(action.code, action.reason);
      }
    }
  };

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname !== WS_PATH) {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }
    if (sockets.size >= MAX_CONNECTIONS) {
      rejectUpgrade(socket, 503, 'Service Unavailable');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const id = nextId++;
      sockets.set(id, ws);
      ws.on('message', (data, isBinary) => {
        // Binärdaten sind im Protokoll nicht vorgesehen → als ungültig behandeln.
        apply(session.message(id, isBinary ? '' : rawToString(data)));
      });
      ws.on('close', () => {
        sockets.delete(id);
        apply(session.disconnect(id));
      });
      ws.on('error', () => {
        // z. B. Frame über maxPayload: `ws` schließt selbst, `close` folgt.
      });
      apply(session.connect(id));
    });
  };

  server.on('upgrade', onUpgrade);

  return {
    get connectionCount() {
      return sockets.size;
    },
    close() {
      server.off('upgrade', onUpgrade);
      for (const ws of wss.clients) ws.terminate();
      return new Promise((resolve) => {
        wss.close(() => {
          resolve();
        });
      });
    },
  };
}

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

function rejectUpgrade(socket: Duplex, status: number, text: string): void {
  socket.once('finish', () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
