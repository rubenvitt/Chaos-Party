#!/usr/bin/env node
/**
 * `pnpm smoke` – Rauchtest für den Ein-Befehl-Start (CHAOS-42).
 *
 * Startet `scripts/play.mjs` wie ein Spieler (ohne Browser, freier Port, fester Join-Code),
 * prüft `/health`, die Host-App unter `/host/`, die Controller-App unter `/` samt aller in
 * `index.html` verlinkten Skripte/Styles, einen WebSocket-Beitritt (`join` → `welcome`) und
 * beendet den Server dann wie mit Strg+C (SIGINT). Erwartet Exit-Code 0 und einen freien Port.
 *
 * Gedacht für CI nach `pnpm build` (dann baut `play` nicht erneut, Dauer wenige Sekunden).
 * Ohne Build baut `play` selbst; das Zeitlimit lässt dafür Luft (`SMOKE_TIMEOUT_MS`).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 300_000);
const joinCode = 'SMOKE42';
const started = Date.now();

const port = await freePort();
const base = `http://127.0.0.1:${String(port)}`;
/** @type {string[]} */
const output = [];

const play = spawn(process.execPath, [join(root, 'scripts', 'play.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    OPEN: '0',
    PORT: String(port),
    JOIN_CODE: joinCode,
    TERMINAL_QR: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
play.stdout.on('data', (/** @type {Buffer} */ chunk) => output.push(chunk.toString()));
play.stderr.on('data', (/** @type {Buffer} */ chunk) => output.push(chunk.toString()));
/** @type {Promise<{ code: number | null; signal: NodeJS.Signals | null }>} */
const exited = new Promise((resolve) => {
  play.on('exit', (code, signal) => {
    resolve({ code, signal });
  });
});

const watchdog = setTimeout(() => {
  failNow(`Zeitlimit ${String(timeoutMs)} ms überschritten`);
}, timeoutMs);

try {
  // 1. /health
  const health = await waitForHealth();
  check(health.status === 'ok', `/health meldet status=ok (${JSON.stringify(health)})`);
  check(typeof health.protocolVersion === 'number', '/health nennt die Protokollversion');
  const startupMs = Date.now() - started;

  // 2. Host- und Controller-App inklusive verlinkter Dateien
  await checkApp('/host/', 'Chaos Party – Host');
  await checkApp('/', null);

  // 3. WebSocket: Beitritt als iPhone-Controller
  const welcome = await joinViaWebSocket(/** @type {number} */ (health.protocolVersion));
  check(welcome.type === 'welcome', `WebSocket: join → welcome (erhalten: ${welcome.type})`);

  // 4. Sauber beenden wie mit Strg+C
  play.kill('SIGINT');
  const { code, signal } = await exited;
  check(
    code === 0,
    `play endet nach SIGINT mit Exit-Code 0 (code=${String(code)}, signal=${String(signal)})`,
  );
  check(output.join('').includes('Chaos Party beendet.'), 'play meldet „Chaos Party beendet.“');
  check(!(await isListening(port)), `Port ${String(port)} ist danach wieder frei`);

  clearTimeout(watchdog);
  console.log(
    `\nRauchtest ok: Server nach ${String(startupMs)} ms bereit, gesamt ${String(Date.now() - started)} ms.`,
  );
} catch (error) {
  failNow(error instanceof Error ? error.message : String(error));
}

// --- Hilfsfunktionen -------------------------------------------------------------------------

/**
 * @param {boolean} condition
 * @param {string} label
 */
function check(condition, label) {
  if (!condition) throw new Error(`Prüfung fehlgeschlagen: ${label}`);
  console.log(`  ✓ ${label}`);
}

/** @param {string} message */
function failNow(message) {
  console.error(`\n✗ Rauchtest fehlgeschlagen: ${message}`);
  console.error('--- Ausgabe von pnpm play ---');
  console.error(output.join('').trimEnd());
  if (play.exitCode === null) play.kill('SIGKILL');
  process.exit(1);
}

/** @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const value = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => {
        resolve(value);
      });
    });
  });
}

/** @returns {Promise<Record<string, unknown>>} */
async function waitForHealth() {
  for (;;) {
    if (play.exitCode !== null)
      throw new Error(`play hat sich vorzeitig beendet (${String(play.exitCode)})`);
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return /** @type {Record<string, unknown>} */ (await res.json());
    } catch {
      // noch nicht bereit
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * Lädt `index.html` einer App und alle darin verlinkten Skripte und Stylesheets.
 * @param {string} path
 * @param {string | null} title erwarteter `<title>`, `null` = nur „vorhanden“
 */
async function checkApp(path, title) {
  const res = await fetch(base + path);
  check(res.status === 200, `GET ${path} → 200 (erhalten: ${String(res.status)})`);
  check(
    (res.headers.get('content-type') ?? '').startsWith('text/html'),
    `GET ${path} liefert HTML`,
  );
  const html = await res.text();
  if (title !== null)
    check(html.includes(`<title>${title}</title>`), `${path} hat den Titel „${title}“`);
  const links = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1] ?? '')
    .filter((link) => link.startsWith('/'));
  check(links.length > 0, `${path} verlinkt Skripte`);
  const statuses = await Promise.all(
    links.map(async (link) => ({ link, status: (await fetch(base + link)).status })),
  );
  const broken = statuses.filter((entry) => entry.status !== 200);
  check(
    broken.length === 0,
    `${path}: alle ${String(links.length)} verlinkten Dateien laden${broken.length > 0 ? ` (kaputt: ${broken.map((b) => `${b.link} ${String(b.status)}`).join(', ')})` : ''}`,
  );
}

/**
 * Tritt per WebSocket bei und liefert die erste Antwort des Servers.
 * @param {number} protocolVersion
 * @returns {Promise<{ type: string }>}
 */
function joinViaWebSocket(protocolVersion) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/ws`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket: keine Antwort innerhalb von 5 s'));
    }, 5000);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ v: protocolVersion, type: 'join', joinCode, seats: 1 }));
    });
    ws.addEventListener('message', (event) => {
      clearTimeout(timer);
      /** @type {{ type: string }} */
      const message = JSON.parse(String(event.data));
      ws.close();
      resolve(message);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WebSocket-Verbindung fehlgeschlagen'));
    });
  });
}

/**
 * @param {number} value
 * @returns {Promise<boolean>}
 */
async function isListening(value) {
  try {
    await fetch(`http://127.0.0.1:${String(value)}/health`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}
