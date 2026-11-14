import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { PROTOCOL_VERSION } from '@chaos-party/protocol';

export interface ChaosServerOptions {
  /** Verzeichnis mit der gebauten Controller-App (`apps/controller/dist`). */
  staticDir: string;
}

export interface ChaosServer {
  listen(port: number, host: string): Promise<AddressInfo>;
  close(): Promise<void>;
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
 * Ein Prozess, ein Port: Controller-App (statisch) und Health-Check,
 * ab CHAOS-9 zusätzlich die WebSocket-Verbindung (Annahme B9).
 */
export function createChaosServer(options: ChaosServerOptions): ChaosServer {
  const root = resolve(options.staticDir);

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

  return {
    listen(port, host) {
      return new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolveListen(server.address() as AddressInfo);
        });
      });
    },
    close() {
      return new Promise((resolveClose, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolveClose();
        });
        server.closeAllConnections();
      });
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
