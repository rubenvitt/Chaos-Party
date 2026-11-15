/**
 * `pnpm check:assets` (Root) bzw. `pnpm --filter @chaos-party/assets check`:
 * prüft `packages/assets/manifest.json` gegen die Dateien. Exit-Code 1 bei Fehlern.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAssets } from './checkAssets.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const result = await checkAssets({ repoRoot });

if (result.errors.length > 0) {
  console.error(`Asset-Prüfung fehlgeschlagen (${String(result.errors.length)} Fehler):`);
  for (const error of result.errors) console.error(`  ✗ ${error}`);
  console.error('Manifest: packages/assets/manifest.json – Regeln: docs/art-direction.md');
  process.exit(1);
}
for (const note of result.notes) console.log(`  ✓ ${note}`);
console.log(`Assets ok: ${String(result.checked)} Manifest-Einträge geprüft.`);
