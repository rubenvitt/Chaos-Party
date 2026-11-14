// Bündelt den Server samt Workspace-Paketen (die als TypeScript-Quelle exportiert werden)
// zu einer einzigen ESM-Datei für `node dist/main.js`.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  // `ws` ist CommonJS und lädt Node-Module per `require`; im ESM-Bündel stellt
  // `createRequire` ein echtes `require` bereit.
  banner: {
    js: "import { createRequire as __chaosCreateRequire } from 'node:module';\nconst require = __chaosCreateRequire(import.meta.url);",
  },
  // Optionale native Beschleuniger von `ws`: nicht installiert und nicht gebündelt;
  // `ws` fängt das fehlende Modul per try/catch ab und nutzt JavaScript.
  external: ['bufferutil', 'utf-8-validate'],
});
