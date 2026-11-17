// Schreibt die Beispielnachrichten des Apple-Host-Vertrags (CHAOS-139, ADR-019 §6) für die
// Swift-Seite: je Phase ein `renderState` aus `apps/apple-host/src/examples.ts`, geprüft gegen
// `RenderStateSchema`. Der Swift-Harness (`apps/apple-host/harness`) dekodiert jede Datei mit
// `app/RenderState.swift`. Vorbild: `scripts/export-protocol-fixtures.mjs`.
//
// Aufruf: `node scripts/export-apple-host-fixtures.mjs` (Node ≥ 22.18, lädt TS direkt).
// Prüfen ohne Schreiben: `node scripts/export-apple-host-fixtures.mjs --check` (Exit 1 bei Abweichung).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RenderStateSchema } from '../apps/apple-host/src/contract.ts';
import { RENDER_STATE_EXAMPLES } from '../apps/apple-host/src/examples.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/apple-host/harness/Fixtures/render-state');
const check = process.argv.includes('--check');

/** Erwartete Dateien: Name → Inhalt. */
const files = new Map();
for (const [name, example] of Object.entries(RENDER_STATE_EXAMPLES)) {
  const result = RenderStateSchema.safeParse(example);
  if (!result.success) throw new Error(`${name}: ${result.error.message}`);
  files.set(`${name}.json`, `${JSON.stringify(example, null, 2)}\n`);
}

const existing = existsSync(outDir) ? readdirSync(outDir) : [];

if (check) {
  const stale = [...files].filter(([name, content]) => {
    try {
      return readFileSync(join(outDir, name), 'utf8') !== content;
    } catch {
      return true;
    }
  });
  const extra = existing.filter((name) => !files.has(name));
  if (stale.length > 0 || extra.length > 0) {
    console.error(
      `Apple-Host-Fixtures veraltet: ${[...stale.map(([name]) => name), ...extra].join(', ')}`,
    );
    console.error('Neu erzeugen: node scripts/export-apple-host-fixtures.mjs');
    process.exit(1);
  }
  console.log(`Apple-Host-Fixtures aktuell (${String(files.size)} Dateien).`);
} else {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of files) writeFileSync(join(outDir, name), content);
  console.log(`${String(files.size)} Fixtures geschrieben nach ${outDir}`);
}
