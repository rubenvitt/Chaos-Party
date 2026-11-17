// Budget für das Start-Bundle des Hosts (CHAOS-53): Was `apps/host/dist/index.html` sofort lädt
// (Einstiegs-Skript plus alle `modulepreload`-Dateien), muss klein bleiben und darf keine
// Babylon-Engine enthalten. Babylon, Arena, Brett und Minispiele kommen per dynamischem Import
// (`apps/host/src/lazyScenes.ts`). Läuft nach `pnpm build`.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Obergrenze roh in Bytes (Stand CHAOS-53: ≈ 404 kB, davon React-DOM ≈ 200 kB). */
const BUDGET_BYTES = 520 * 1024;
/** Kennung der Babylon-Engine im gebauten Code (`AbstractEngine.Version`-Text). */
const ENGINE_MARKER = 'Babylon.js v';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'host', 'dist');
let html;
try {
  html = readFileSync(join(dist, 'index.html'), 'utf8');
} catch {
  console.error('apps/host/dist/index.html fehlt – vorher `pnpm build` ausführen.');
  process.exit(1);
}

const files = [
  ...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="modulepreload"[^>]*\shref)="([^"]+\.js)"/g),
].map((match) => String(match[1]).replace(/^\/host\//, ''));
if (files.length === 0) {
  console.error('Kein Skript in apps/host/dist/index.html gefunden.');
  process.exit(1);
}

let raw = 0;
let gzip = 0;
const withEngine = [];
for (const file of files) {
  const content = readFileSync(join(dist, file));
  raw += content.length;
  gzip += gzipSync(content).length;
  if (content.includes(ENGINE_MARKER)) withEngine.push(file);
}

/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`;
console.log(
  `Host-Start-Bundle: ${String(files.length)} Dateien, ${kb(raw)} (gzip ${kb(gzip)}), Budget ${kb(BUDGET_BYTES)}`,
);
let failed = false;
if (raw > BUDGET_BYTES) {
  console.error(`Start-Bundle über Budget: ${kb(raw)} > ${kb(BUDGET_BYTES)}.`);
  failed = true;
}
if (withEngine.length > 0) {
  console.error(
    `Babylon-Engine im Start-Bundle (${withEngine.join(', ')}): ein statischer Import zieht die ` +
      'Szene vor. Szenen nur über apps/host/src/lazyScenes.ts laden.',
  );
  failed = true;
}
if (failed) process.exit(1);
