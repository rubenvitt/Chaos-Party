import { expect, test, type Page } from '@playwright/test';
import type {} from '../../apps/host/src/testHook.ts';

/** Frames, bis die Figuren nach dem Spawn sicher ruhen (1/60 s pro Frame). */
const SETTLE_FRAMES = 60;

interface Problems {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}

function collectProblems(page: Page): Problems {
  const problems: Problems = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => problems.pageErrors.push(error.message));
  page.on('requestfailed', (request) => problems.failedRequests.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400)
      problems.failedRequests.push(`${response.status()} ${response.url()}`);
  });
  return problems;
}

async function openScene(page: Page, query = 'test=1&players=2&seed=2026') {
  const wasm = page.waitForResponse((r) => r.url().endsWith('.wasm'));
  await page.goto(`/?${query}`);
  const wasmResponse = await wasm;
  await expect(page.locator('main.host')).toHaveAttribute('data-physics', 'ready');
  await expect(page.locator('main.host')).toHaveAttribute('data-scene', 'ready');
  await page.waitForFunction(() => window.__chaos?.ready === true);
  return { wasmResponse };
}

async function stepFrames(page: Page, n: number) {
  await page.evaluate((frames) => {
    window.__chaos?.stepFrames(frames);
  }, n);
}

async function positions(page: Page) {
  return page.evaluate(() => window.__chaos?.getPlayerPositions() ?? []);
}

test.describe('Host-Szene (Production-Build)', () => {
  test('lädt Havok, zeigt die Arena mit zwei Figuren und läuft ohne Fehler', async ({ page }) => {
    const problems = collectProblems(page);
    const { wasmResponse } = await openScene(page);

    // C1: WASM kommt aus dem Build mit korrektem MIME-Typ.
    expect(wasmResponse.status()).toBe(200);
    expect(wasmResponse.headers()['content-type']).toContain('application/wasm');
    expect(await page.evaluate(() => window.__chaos?.physicsReady)).toBe(true);

    // HUD: ein Chip pro Spieler, verbunden.
    await expect(page.getByTestId('player-chip-1')).toContainText('Spieler 1');
    await expect(page.getByTestId('player-chip-2')).toContainText('Spieler 2');
    await expect(page.getByTestId('player-chip-3')).toHaveCount(0);

    await stepFrames(page, SETTLE_FRAMES);
    const settled = await positions(page);
    expect(settled.map((p) => p.slot)).toEqual([1, 2]);
    for (const p of settled) {
      // Figuren stehen auf dem Boden (Kapselmitte ≈ 0,75 m) und innerhalb der Arena.
      expect(p.y).toBeGreaterThan(0.5);
      expect(p.y).toBeLessThan(1.0);
      expect(Math.abs(p.x)).toBeLessThan(9);
      expect(Math.abs(p.z)).toBeLessThan(5.5);
    }

    // Canvas ist nicht leer: viele verschiedene Farben im gerenderten Bild.
    const distinctColors = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas.game-canvas');
      if (!canvas) return 0;
      const copy = document.createElement('canvas');
      copy.width = 128;
      copy.height = 72;
      const ctx = copy.getContext('2d');
      if (!ctx) return 0;
      ctx.drawImage(canvas, 0, 0, copy.width, copy.height);
      const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
      const colors = new Set<number>();
      for (let i = 0; i < data.length; i += 4) {
        colors.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
      }
      return colors.size;
    });
    expect(distinctColors).toBeGreaterThan(50);

    expect(problems.pageErrors).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
    expect(problems.failedRequests).toEqual([]);
  });

  test('Tastatur bewegt Spieler 1 nach rechts, Spieler 2 bleibt stehen', async ({ page }) => {
    const problems = collectProblems(page);
    await openScene(page);
    await stepFrames(page, SETTLE_FRAMES);
    const before = await positions(page);

    await page.keyboard.down('KeyD');
    await stepFrames(page, 30);
    await page.keyboard.up('KeyD');
    const after = await positions(page);

    const p1Before = before.find((p) => p.slot === 1);
    const p1After = after.find((p) => p.slot === 1);
    const p2Before = before.find((p) => p.slot === 2);
    const p2After = after.find((p) => p.slot === 2);
    if (!p1Before || !p1After || !p2Before || !p2After) throw new Error('Spieler fehlen');

    // 0,5 s bei bis zu 6 m/s: deutlich nach rechts (+x), kaum seitlich (Toleranz, C4).
    expect(p1After.x - p1Before.x).toBeGreaterThan(1);
    expect(Math.abs(p1After.z - p1Before.z)).toBeLessThan(0.5);
    expect(Math.hypot(p2After.x - p2Before.x, p2After.z - p2Before.z)).toBeLessThan(0.05);

    expect(problems.pageErrors).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  });

  test('Schubser-Taste stößt Spieler 2 mit einem Impuls an', async ({ page }) => {
    await openScene(page);
    await stepFrames(page, SETTLE_FRAMES);
    const before = await positions(page);

    // Ohne Richtungstaste dasht die Figur in Blickrichtung (zur Kamera, −z).
    await page.keyboard.press('Enter');
    await stepFrames(page, 10);
    const after = await positions(page);

    const p2Before = before.find((p) => p.slot === 2);
    const p2After = after.find((p) => p.slot === 2);
    if (!p2Before || !p2After) throw new Error('Spieler 2 fehlt');
    expect(p2Before.z - p2After.z).toBeGreaterThan(0.5);
  });

  test('zeigt vier Figuren bei ?players=4', async ({ page }) => {
    await openScene(page, 'test=1&players=4&seed=2026');
    await stepFrames(page, SETTLE_FRAMES);
    const all = await positions(page);
    expect(all.map((p) => p.slot)).toEqual([1, 2, 3, 4]);
    await expect(page.getByTestId('player-chip-4')).toContainText('Spieler 4');
  });

  test('Screenshot der Startszene bleibt stabil', async ({ page }) => {
    await openScene(page);
    await stepFrames(page, SETTLE_FRAMES);
    if (process.env.HOST_SZENE_BELEG) {
      // Ungemaskierter Beleg für Abnahmeberichte (ADR-004): HOST_SZENE_BELEG=1 pnpm test:e2e
      await page.screenshot({ path: 'docs/screenshots/m1-host-szene.png' });
    }
    // Texte maskiert: Schriften unterscheiden sich zwischen Rechnern/CI-Runnern,
    // 3D-Szene, Chips und Farben werden verglichen. Texte prüfen die DOM-Assertions.
    await expect(page).toHaveScreenshot('host-szene.png', {
      mask: [page.locator('.hud-title, .player-label, .player-state, .player-keys')],
    });
  });
});
