// Budget und Sauberkeit des JS-Kerns für JavaScriptCore (CHAOS-139, ADR-019 §2): Swift lädt
// `apps/apple-host/dist/chaos-host.js` beim Start in ein JSContext; auf der Apple TV zählt jedes
// MB beim Parsen (EXP-024: Laden ≈ 0,5 s). Läuft nach `pnpm build`, wie `check-host-bundle.mjs`.
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Obergrenze roh in Bytes (Stand CHAOS-139: ≈ 4,9 MiB, davon Babylon-Kern und Minispiele). */
const BUDGET_BYTES = 5.75 * 1024 * 1024;
/** Havok kommt als eigene Datei; Wachstum hier hieße ein Versionssprung. */
const WASM_BUDGET_BYTES = 2.5 * 1024 * 1024;
/**
 * Was in JavaScriptCore nicht existiert und im Bündel nicht vorkommen darf: Node-Module, `ws`
 * (Socket-Adapter des PC-Servers) und ESM-Reste (`import.meta`, das IIFE lädt kein Modul).
 */
const FORBIDDEN = [
  { marker: 'node:crypto', why: 'node:crypto muss per Alias auf src/nodeCrypto.ts zeigen' },
  { marker: 'require("node:', why: 'Node-Modul im Bündel' },
  { marker: 'WebSocketServer', why: '`ws` aus apps/server/src/socket.ts mitgebündelt' },
  { marker: 'import.meta', why: 'ESM-Rest im IIFE' },
];

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'apple-host', 'dist');
let code;
try {
  code = readFileSync(join(dist, 'chaos-host.js'));
} catch {
  console.error('apps/apple-host/dist/chaos-host.js fehlt – vorher `pnpm build` ausführen.');
  process.exit(1);
}
let wasm = 0;
try {
  wasm = statSync(join(dist, 'HavokPhysics.wasm')).size;
} catch {
  console.error('apps/apple-host/dist/HavokPhysics.wasm fehlt – vorher `pnpm build` ausführen.');
  process.exit(1);
}

/** @param {number} bytes */
const kib = (bytes) => `${(bytes / 1024).toFixed(0)} KiB`;
console.log(
  `Apple-Host-Bündel: ${kib(code.length)} (gzip ${kib(gzipSync(code).length)}), Budget ${kib(BUDGET_BYTES)}; ` +
    `Havok ${kib(wasm)}, Budget ${kib(WASM_BUDGET_BYTES)}`,
);
let failed = false;
if (code.length > BUDGET_BYTES) {
  console.error(`Apple-Host-Bündel über Budget: ${kib(code.length)} > ${kib(BUDGET_BYTES)}.`);
  failed = true;
}
if (wasm > WASM_BUDGET_BYTES) {
  console.error(`HavokPhysics.wasm über Budget: ${kib(wasm)} > ${kib(WASM_BUDGET_BYTES)}.`);
  failed = true;
}
const text = code.toString('utf8');
for (const { marker, why } of FORBIDDEN) {
  if (text.includes(marker)) {
    console.error(`Verbotenes im Apple-Host-Bündel (${marker}): ${why}.`);
    failed = true;
  }
}
if (failed) process.exit(1);
