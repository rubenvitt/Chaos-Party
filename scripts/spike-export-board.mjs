#!/usr/bin/env node
/**
 * Renderer-Spike (CHAOS-75): exportiert das echte Spielbrett (Beispiel-Spielstand, Grafikstufe
 * `hoch`) als GLB + Beschreibung für den Bevy-Prototyp und kopiert die Figuren-GLBs dazu.
 *
 *   node scripts/spike-export-board.mjs
 *
 * Ziel: spikes/renderer-bevy/assets/export/ (nicht eingecheckt). Der Export selbst steckt in
 * `scripts/lib/board-export.mjs` (gemeinsam mit `scripts/build-apple-assets.mjs`, CHAOS-140).
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportBoard } from './lib/board-export.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'spikes/renderer-bevy/assets/export');

const { meta, names } = await exportBoard({
  root,
  out,
  port: Number(process.env.SPIKE_PORT ?? 5199),
  timeoutMs: Number(process.env.SPIKE_TIMEOUT ?? 240_000),
  verbose: Boolean(process.env.SPIKE_VERBOSE),
});
mkdirSync(join(out, 'figuren'), { recursive: true });
const figures = join(root, 'packages/assets/models/characters');
for (const file of readdirSync(figures).filter((f) => f.endsWith('.glb'))) {
  copyFileSync(join(figures, file), join(out, 'figuren', file));
}
console.log('Figuren-Wurzeln:', JSON.stringify(names));
console.log(`Export nach ${out}:`, JSON.stringify(meta.stats));
