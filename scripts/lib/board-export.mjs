/**
 * Brett-Export über den Web-Host (CHAOS-75, Build-Schritt seit CHAOS-140): startet einen eigenen
 * Vite-Dev-Server und ein Headless-Chromium (Software-Rendering reicht), baut das echte Brett mit
 * dem Beispiel-Spielstand (Grafikstufe `hoch`) und schreibt
 *
 * - `brett.glb`: Kulisse ohne Figuren, Kameras und Instanzen, mit Feld-Ankern `feld_<id>`,
 * - `brett.szene.json`: Kamera, Licht, Figurenorte, Felder,
 * - `brett.instanzen.json`: Matrizen der Instanz-Gruppen (Gras, Blumen).
 *
 * Seite: `apps/host/src/export/boardExport.ts`. Abnehmer: `scripts/build-apple-assets.mjs`,
 * `scripts/spike-export-board.mjs`.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

/**
 * @typedef {{ stats: unknown, fields?: unknown[] }} BoardMeta
 * @typedef {{ ready: boolean, error?: string, glbBase64: string, meta: BoardMeta,
 *   instances: unknown, names: unknown }} BoardExport
 */

/**
 * @param {{ root: string, out: string, port?: number, timeoutMs?: number, verbose?: boolean }} options
 * @returns {Promise<{ meta: BoardMeta, names: unknown }>}
 */
export async function exportBoard({
  root,
  out,
  port = 5199,
  timeoutMs = 240_000,
  verbose = false,
}) {
  const vite = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], {
    cwd: join(root, 'apps/host'),
    stdio: ['ignore', verbose ? 'inherit' : 'ignore', 'inherit'],
  });
  try {
    // Auf die Antwort des Servers warten, nicht auf seine Ausgabe: Unter `CI=true` färbt Vite
    // „Local:“ mit ANSI-Codes, ein Textvergleich passt dann nie (CI hing 30 min, CHAOS-140).
    const exited = new Promise((_, reject) => {
      vite.on('exit', (code) => reject(new Error(`Vite beendet (${String(code)})`)));
    });
    await Promise.race([waitForServer(`http://localhost:${String(port)}/host/`), exited]);
    console.log(`Brett-Export: Vite bereit auf Port ${String(port)}`);
    const browser = await chromium.launch({
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('pageerror', (error) => console.error('Seitenfehler:', error.message));
      page.on('console', (m) => {
        if (m.type() === 'error' || verbose) console.error(`[${m.type()}]`, m.text());
      });
      await page.goto(
        `http://localhost:${String(port)}/host/src/export/boardExport.html?qualitaet=hoch`,
      );
      await page.waitForFunction(
        () => /** @type {any} */ (globalThis).__boardExport?.ready === true,
        undefined,
        { timeout: timeoutMs },
      );
      const result = await page.evaluate(readExport);
      if (!result) throw new Error('kein Export');
      if (result.error) throw new Error(result.error);
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'brett.glb'), Buffer.from(result.glbBase64, 'base64'));
      writeFileSync(join(out, 'brett.szene.json'), `${JSON.stringify(result.meta, null, 2)}\n`);
      writeFileSync(join(out, 'brett.instanzen.json'), JSON.stringify(result.instances));
      return { meta: result.meta, names: result.names };
    } finally {
      await browser.close();
    }
  } finally {
    vite.kill();
  }
}

/**
 * Wartet, bis `url` mit einem Status < 500 antwortet; wirft nach `timeoutMs`.
 * @param {string} url
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 */
export async function waitForServer(url, { timeoutMs = 60_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (response.status < 500) return;
    } catch {
      // Server noch nicht da.
    }
    if (Date.now() > deadline) {
      throw new Error(`${url} antwortet nach ${String(timeoutMs / 1000)} s nicht`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** @returns {BoardExport | undefined} */
function readExport() {
  return /** @type {any} */ (globalThis).__boardExport;
}
