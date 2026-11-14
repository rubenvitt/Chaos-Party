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
});
