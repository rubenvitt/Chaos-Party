#!/usr/bin/env node
/**
 * Renderer-Spike (CHAOS-75): exportiert das echte Spielbrett (Beispiel-Spielstand, Grafikstufe
 * `hoch`) als GLB + Beschreibung für den Bevy-Prototyp und kopiert die Figuren-GLBs dazu.
 *
 *   node scripts/spike-export-board.mjs
 *
 * Ziel: spikes/renderer-bevy/assets/export/ (nicht eingecheckt). Startet einen eigenen
 * Vite-Dev-Server und ein Headless-Chromium (Software-Rendering reicht für den Export).
 */
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'spikes/renderer-bevy/assets/export');
const port = Number(process.env.SPIKE_PORT ?? 5199);

const vite = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], {
  cwd: join(root, 'apps/host'),
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  vite.stdout.on('data', (chunk) => {
    if (String(chunk).includes('Local:')) resolve(undefined);
  });
  vite.on('exit', (code) => reject(new Error(`Vite beendet (${String(code)})`)));
});

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => console.error('Seitenfehler:', error.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || process.env.SPIKE_VERBOSE) console.error(`[${m.type()}]`, m.text());
  });
  await page.goto(
    `http://localhost:${String(port)}/host/src/spike/exportBoard.html?qualitaet=hoch`,
  );
  /**
   * @typedef {{ ready: boolean, error?: string, glbBase64: string, meta: { stats: unknown },
   *   instances: unknown, names: unknown }} SpikeExport
   */
  /** @returns {SpikeExport | undefined} */
  const readExport = () => /** @type {any} */ (globalThis).__spikeExport;
  await page.waitForFunction(
    () => /** @type {any} */ (globalThis).__spikeExport?.ready === true,
    undefined,
    {
      timeout: Number(process.env.SPIKE_TIMEOUT ?? 240_000),
    },
  );
  const result = await page.evaluate(readExport);
  if (!result) throw new Error('kein Export');
  if (result.error) throw new Error(result.error);
  mkdirSync(join(out, 'figuren'), { recursive: true });
  writeFileSync(join(out, 'brett.glb'), Buffer.from(result.glbBase64, 'base64'));
  writeFileSync(join(out, 'brett.szene.json'), `${JSON.stringify(result.meta, null, 2)}\n`);
  writeFileSync(join(out, 'brett.instanzen.json'), JSON.stringify(result.instances));
  const figures = join(root, 'packages/assets/models/characters');
  for (const file of readdirSync(figures).filter((f) => f.endsWith('.glb'))) {
    copyFileSync(join(figures, file), join(out, 'figuren', file));
  }
  console.log('Figuren-Wurzeln:', JSON.stringify(result.names));
  console.log(`Export nach ${out}:`, JSON.stringify(result.meta.stats));
} finally {
  await browser.close();
  vite.kill();
}
