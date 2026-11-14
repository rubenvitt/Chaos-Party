import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { PROTOCOL_VERSION } from '@chaos-party/protocol';
import { generateJoinCode } from './ids.ts';
import type { RateLimitOptions } from './rate-limit.ts';
import { Session } from './session.ts';
import { attachWebSocket } from './socket.ts';

export interface ChaosServerOptions {
  /** Verzeichnis mit der gebauten Controller-App (`apps/controller/dist`). */
  staticDir: string;
  /** Fester Join-Code (4–8 Zeichen `A–Z0–9`), sonst zufällig mit 4 Zeichen. */
  joinCode?: string | undefined;
  /** LAN-URL für QR-Code/Lobby (CHAOS-11); ohne sie sendet `lobby` kein `joinUrl`. */
  joinUrl?: string | undefined;
  /** Monotone Uhr in ms für Session und Rate-Limit (Tests). */
  now?: (() => number) | undefined;
  /** Token-Erzeugung (Tests). */
  createToken?: (() => string) | undefined;
  rateLimit?: Partial<RateLimitOptions> | undefined;
  maxInvalidMessages?: number | undefined;
}

export interface ChaosServer {
  listen(port: number, host: string): Promise<AddressInfo>;
  close(): Promise<void>;
  /** Join-Code der (einzigen) Session dieses Prozesses. */
  readonly joinCode: string;
  /** Die autoritative Session (lesend für Diagnose und Tests). */
  readonly session: Session;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};

/**
 * Ein Prozess, ein Port: Controller-App (statisch), Health-Check und die
 * WebSocket-Verbindung unter `/ws` (Annahme B9, ADR-005).
 */
export function createChaosServer(options: ChaosServerOptions): ChaosServer {
  const root = resolve(options.staticDir);
  const session = new Session({
    joinCode: options.joinCode ?? generateJoinCode(),
    joinUrl: options.joinUrl,
    now: options.now,
    createToken: options.createToken,
    rateLimit: options.rateLimit,
    maxInvalidMessages: options.maxInvalidMessages,
  });

  const server = createServer((req, res) => {
    handleRequest(root, req, res).catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) {
        send(res, 500, 'text/plain; charset=utf-8', 'Interner Fehler');
      } else {
        res.destroy();
      }
    });
  });

  const sockets = attachWebSocket(server, session);
  let closing: Promise<void> | undefined;

  return {
    joinCode: session.joinCode,
    session,
    listen(port, host) {
      return new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolveListen(server.address() as AddressInfo);
        });
      });
    },
    /** Beendet alle WebSockets und HTTP-Verbindungen; mehrfacher Aufruf ist harmlos. */
    close() {
      closing ??= (async () => {
        await sockets.close();
        if (!server.listening) return;
        await new Promise<void>((resolveClose, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolveClose();
          });
          server.closeAllConnections();
        });
      })();
      return closing;
    },
  };
}

async function handleRequest(root: string, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'text/plain; charset=utf-8', 'Methode nicht erlaubt', { Allow: 'GET, HEAD' });
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/health') {
    send(
      res,
      200,
      'application/json; charset=utf-8',
      JSON.stringify({ status: 'ok', protocolVersion: PROTOCOL_VERSION }),
    );
    return;
  }

  const lookup = await resolveStaticFile(root, url.pathname);
  if (lookup.kind === 'forbidden') {
    send(res, 403, 'text/plain; charset=utf-8', 'Verboten');
    return;
  }
  if (lookup.kind === 'missing') {
    send(res, 404, 'text/plain; charset=utf-8', 'Nicht gefunden');
    return;
  }
  const { file } = lookup;

  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

type StaticLookup = { kind: 'file'; file: string } | { kind: 'missing' } | { kind: 'forbidden' };

/**
 * Liefert den Pfad zur auszuliefernden Datei. Pfade ohne Dateiendung fallen auf
 * `index.html` zurück (Single-Page-App); fehlende Assets ergeben 404.
 */
async function resolveStaticFile(root: string, pathname: string): Promise<StaticLookup> {
  const missing: StaticLookup = { kind: 'missing' };
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return missing;
  }
  if (decoded.includes('\0')) {
    return missing;
  }

  const candidate = resolve(root, '.' + normalize(decoded));
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return { kind: 'forbidden' };
  }

  for (const file of [candidate, join(candidate, 'index.html')]) {
    if (await isFile(file)) {
      return { kind: 'file', file };
    }
  }
  if (extname(decoded) === '') {
    const appIndex = join(root, 'index.html');
    if (await isFile(appIndex)) {
      return { kind: 'file', file: appIndex };
    }
  }
  return missing;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function send(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { 'Content-Type': contentType, ...headers });
  res.end(body);
}
