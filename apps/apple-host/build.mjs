// Bündelt den JS-Kern für JavaScriptCore (ADR-019 §2, CHAOS-139): `dist/chaos-host.js` (IIFE,
// ES2022, ohne Node- und DOM-APIs) und `dist/HavokPhysics.wasm` daneben. Swift lädt beides aus
// dem App-Bundle (`prepare.sh`). Läuft im normalen `pnpm build`.
//
// `bundle({ write: false })` liefert den Code im Speicher (Bündel-Test in `test/`).
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
export const DIST = join(here, 'dist');
export const BUNDLE_FILE = join(DIST, 'chaos-host.js');
export const WASM_FILE = join(DIST, 'HavokPhysics.wasm');
/** Havok als ESM-Build: lädt synchron über `instantiateWasm` (siehe `src/main.ts`). */
export const HAVOK_WASM_SOURCE = createRequire(import.meta.url).resolve(
  '@babylonjs/havok/lib/esm/HavokPhysics.wasm',
);

/**
 * @param {{ write?: boolean }} [options]
 * @returns {Promise<string>} Code des Bündels
 */
export async function bundle({ write = true } = {}) {
  const result = await build({
    entryPoints: [join(here, 'src/main.ts')],
    outfile: BUNDLE_FILE,
    bundle: true,
    format: 'iife',
    target: 'es2022',
    // `browser`, aber ohne DOM: JavaScriptCore hat weder Node- noch Browser-APIs.
    platform: 'browser',
    // `apps/server` nutzt `node:crypto`; der Ersatz zieht den Zufall von Swift (`env.randomBytes`).
    alias: { 'node:crypto': join(here, 'src/nodeCrypto.ts') },
    // Havoks ESM-Build fragt `import.meta.url` nach dem Wasm-Pfad; wir reichen die Bytes direkt.
    define: { 'import.meta.url': 'undefined' },
    legalComments: 'none',
    minifySyntax: true,
    logLevel: 'warning',
    write,
  });
  const file = result.outputFiles?.[0];
  return file ? file.text : '';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(DIST, { recursive: true });
  await bundle();
  copyFileSync(HAVOK_WASM_SOURCE, WASM_FILE);
  const kib = (/** @type {string} */ file) => `${(statSync(file).size / 1024).toFixed(0)} KiB`;
  console.log(
    `apple-host: ${BUNDLE_FILE} (${kib(BUNDLE_FILE)}), HavokPhysics.wasm (${kib(WASM_FILE)})`,
  );
}
