/**
 * Brettphase am Host (M2, CHAOS-18/19/20) im lokalen Brett-Modus ohne Server:
 * `/host/?local=1&board=1&test=1` zeigt das Brett „Wackelwald“ mit festem Beispiel-Spielstand
 * (`apps/host/src/board/demo.ts`). Weitere `board`-Nachrichten speist der Testhaken
 * `window.__chaos.board.receive` ein – geprüft mit dem echten Protokoll-Parser, wie vom Server.
 * Zeit vergeht nur über `stepFrames` (je 1/60 s), damit Animationen und Screenshots stabil sind.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/test.ts';
import type {} from '../../apps/host/src/testHook.ts';

const BOARD_URL = '/host/?local=1&board=1&test=1';

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

function expectNoProblems(problems: Problems) {
  expect(problems.pageErrors).toEqual([]);
  expect(problems.consoleErrors).toEqual([]);
  expect(problems.failedRequests).toEqual([]);
}

async function openBoard(page: Page) {
  await page.goto(BOARD_URL);
  const main = page.locator('main.host');
  await expect(main).toHaveAttribute('data-phase', 'board');
  await expect(main).toHaveAttribute('data-scene', 'ready');
  await page.waitForFunction(() => window.__chaos?.board?.ready === true);
}

async function stepFrames(page: Page, n: number) {
  await page.evaluate((frames) => {
    window.__chaos?.stepFrames(frames);
  }, n);
}

/**
 * Wartet, bis die GPU alle gestellten Frames gezeichnet hat (Pixel zurücklesen erzwingt das).
 * Mit Software-Rendering auf einem ausgelasteten Rechner kann das länger dauern als die
 * 15 s, die `toHaveScreenshot` für das erste Bild hat.
 */
async function settleGpu(page: Page) {
  await page.evaluate(() => document.querySelector('canvas')?.toDataURL('image/png').length ?? 0);
}

/** Speist Demo-Nachricht `index` ein (Index 0 = Startstand). */
async function feedDemo(page: Page, index: number) {
  const accepted = await page.evaluate((i) => {
    const board = window.__chaos?.board;
    return board?.receive?.(board.demoMessages?.[i]) ?? false;
  }, index);
  expect(accepted, `Demo-Nachricht ${index}`).toBe(true);
}

async function feed(page: Page, message: unknown) {
  const accepted = await page.evaluate(
    (m) => window.__chaos?.board?.receive?.(m) ?? false,
    message,
  );
  expect(accepted).toBe(true);
}

/**
 * Spult die Regie in 100-ms-Schritten vor, bis nichts mehr abgespielt wird, und rendert dann
 * einen Frame. Schnell, weil ohne Rendern (Software-WebGL braucht je Frame viel Zeit).
 */
async function playUntilIdle(page: Page, maxMs = 30_000) {
  const done = await page.evaluate((limit) => {
    const board = window.__chaos?.board;
    if (!board) return false;
    for (let t = 0; t < limit && board.animating; t += 100) board.advance(100);
    return !board.animating;
  }, maxMs);
  expect(done, 'Regie wird fertig').toBe(true);
  await stepFrames(page, 1);
}

async function pawnSpaces(page: Page) {
  return page.evaluate(() => window.__chaos?.board?.getPawnSpaces() ?? {});
}

async function demoView(page: Page, index: number) {
  return page.evaluate(
    (i) => (window.__chaos?.board?.demoMessages?.[i] as { view: Record<string, unknown> }).view,
    index,
  );
}

/** HUD-Texte maskieren (Schrift-Rendering je Rechner, ADR-004); Inhalte prüfen DOM-Assertions. */
const hudMask = (page: Page) => [
  page.locator(
    [
      '.hud-title',
      '.board-player-name',
      '.board-player-stats',
      '.board-player-turn',
      '.board-item',
      '.board-status',
      '.board-messages',
      '.player-symbol',
    ].join(', '),
  ),
];

test.describe('Host-Brett im lokalen Modus (Production-Build)', () => {
  test('zeigt Brett, vier Figuren und HUD ohne Fehler', async ({ page }) => {
    const problems = collectProblems(page);
    await openBoard(page);

    const main = page.locator('main.host');
    await expect(main).toHaveAttribute('data-mode', 'local');
    await expect(page.getByTestId('board-hud')).toHaveAttribute('data-game-phase', 'choose-path');
    await expect(page.getByTestId('board-round')).toHaveText('Runde 2/5');
    await expect(page.locator('.hud-title')).toContainText('Wackelwald');
    // Spielerleiste: Name, Münzen, Trophäen, Items; Blau ist am Zug.
    await expect(page.getByTestId('board-player-1')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('board-player-1')).toContainText('am Zug');
    await expect(page.getByTestId('board-player-2')).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('board-coins-1')).toHaveText('12');
    await expect(page.getByTestId('board-trophies-3')).toHaveText('1');
    await expect(page.getByTestId('board-items-2')).toContainText('Münzklau');
    await expect(page.getByTestId('board-items-2')).toContainText('Falle');
    await expect(page.getByTestId('board-player-4')).toContainText('Rosa');
    // Offene Entscheidung.
    await expect(page.getByTestId('board-status')).toContainText('Blau wählt einen Weg');
    await expect(page.getByTestId('board-banner')).toHaveCount(0);
    await expect(page.getByTestId('connection')).toHaveCount(0);

    // Figuren stehen auf ihren Feldern aus dem Spielstand, in der Szene über dem Boden.
    expect(await pawnSpaces(page)).toEqual({ 1: 's07', 2: 's21', 3: 's34', 4: 's42' });
    const positions = await page.evaluate(() => window.__chaos?.getPlayerPositions() ?? []);
    expect(positions.map((p) => p.slot)).toEqual([1, 2, 3, 4]);
    for (const p of positions) expect(p.y).toBeGreaterThan(0.2);
    // Brett braucht kein Havok.
    expect(await page.evaluate(() => window.__chaos?.physicsReady)).toBe(false);
    expect(await page.evaluate(() => window.__chaos?.scene)).toBe('board');

    // Canvas ist nicht leer: viele verschiedene Farben.
    await stepFrames(page, 2);
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
    expect(distinctColors).toBeGreaterThan(100);
    expectNoProblems(problems);
  });

  test('Screenshot des Bretts bleibt stabil', async ({ page }) => {
    await openBoard(page);
    // Feste Zahl Frames: Wackeln, Pokal und Kamera stehen in Simulationszeit fest.
    await stepFrames(page, 30);
    await settleGpu(page);
    if (process.env.HOST_BRETT_BELEG) {
      // Ungemaskierter Beleg für den Abnahmebericht: HOST_BRETT_BELEG=1 pnpm test:e2e host-brett
      await page.screenshot({ path: 'docs/screenshots/m2-host-brett.png' });
    }
    await expect(page).toHaveScreenshot('host-brett.png', { mask: hudMask(page) });
  });

  test('Figur hüpft Feld für Feld, Item landet in der Leiste', async ({ page }) => {
    const problems = collectProblems(page);
    await openBoard(page);
    const before = await page.evaluate(() => window.__chaos?.board?.eventsProcessed ?? 0);

    // Blau nimmt den Klippenweg: s07 → s08 → s09 → s10, dann Item.
    await feedDemo(page, 1);
    expect(await page.evaluate(() => window.__chaos?.board?.animating)).toBe(true);
    await expect(page.getByTestId('board-messages')).toContainText('Blau nimmt: Klippenweg');
    // Der übernommene Stand wartet, bis die Animation fertig ist.
    await expect(page.getByTestId('board-items-1')).not.toContainText('Münzklau');

    // Takt 320 ms ≈ 19 Frames je Feld: nach 10 Frames mitten im ersten Sprung (in der Luft).
    await stepFrames(page, 10);
    const midHop = await page.evaluate(
      () => window.__chaos?.getPlayerPositions().find((p) => p.slot === 1)?.y ?? 0,
    );
    expect(midHop).toBeGreaterThan(0.6);
    await stepFrames(page, 20);
    expect((await pawnSpaces(page))[1]).toBe('s08');
    await stepFrames(page, 20);
    expect((await pawnSpaces(page))[1]).toBe('s09');

    await playUntilIdle(page);
    expect(await pawnSpaces(page)).toEqual({ 1: 's10', 2: 's21', 3: 's34', 4: 's42' });
    await expect(page.getByTestId('board-messages')).toContainText(
      'Blau findet ein Item: Münzklau',
    );
    await expect(page.getByTestId('board-items-1')).toContainText('Münzklau');
    await expect(page.getByTestId('board-status')).toHaveCount(0);
    expect(await page.evaluate(() => window.__chaos?.board?.eventsProcessed ?? 0)).toBe(before + 3);
    expectNoProblems(problems);
  });

  test('Zugwechsel, Würfel, Münzen und Münzklau mit Reaktions-Countdown', async ({ page }) => {
    const problems = collectProblems(page);
    await openBoard(page);
    await feedDemo(page, 1);
    await playUntilIdle(page);

    // Grün ist dran (Banner), würfelt 4 und landet auf einem Minusfeld.
    await feedDemo(page, 2);
    await expect(page.getByTestId('board-banner')).toHaveText('Grün ist dran!');
    await expect(page.getByTestId('board-player-3')).toHaveAttribute('data-active', 'true');
    await feedDemo(page, 3);
    await expect(page.getByTestId('board-messages')).toContainText('Grün würfelt 4!');
    await playUntilIdle(page);
    expect((await pawnSpaces(page))[3]).toBe('s40');
    await expect(page.getByTestId('board-messages')).toContainText('Grün verliert 3 Münzen');
    await expect(page.getByTestId('board-coins-3')).toHaveText('15');

    // Orange klaut: Reaktionsfenster für Blau mit sichtbarem Countdown.
    await feedDemo(page, 4);
    await feedDemo(page, 5);
    await playUntilIdle(page);
    await expect(page.getByTestId('board-status')).toContainText('Blau kann reagieren!');
    await expect(page.getByTestId('board-countdown')).toHaveText('3 … 2 … 1');
    // Das Fenster läuft ab Empfang: Nach dem Item-Effekt (0,8 s) und 0,5 s mehr bleiben 1,7 s.
    await stepFrames(page, 30);
    await expect(page.getByTestId('board-countdown')).toHaveText('2 … 1');

    await feedDemo(page, 6);
    await playUntilIdle(page);
    await expect(page.getByTestId('board-messages')).toContainText('Orange klaut Blau 6 Münzen!');
    await expect(page.getByTestId('board-coins-1')).toHaveText('6');
    await expect(page.getByTestId('board-coins-2')).toHaveText('13');
    await expect(page.getByTestId('board-status')).toContainText('Orange darf würfeln');
    expectNoProblems(problems);
  });

  test('Lücke in eventSeq springt ohne Animation auf den Stand', async ({ page }) => {
    await openBoard(page);
    const jumps = await page.evaluate(() => window.__chaos?.board?.jumps ?? 0);
    const view = await demoView(page, 3);
    await feed(page, {
      v: 2,
      type: 'board',
      view,
      events: [{ type: 'moved', slot: 3, path: ['s38', 's39', 's40'] }],
      eventSeq: 500,
    });
    expect(await page.evaluate(() => window.__chaos?.board?.animating)).toBe(false);
    expect(await page.evaluate(() => window.__chaos?.board?.jumps)).toBe(jumps + 1);
    expect(await page.evaluate(() => window.__chaos?.board?.nextEventSeq)).toBe(501);
    expect((await pawnSpaces(page))[3]).toBe('s40');
    // Ungültige Nachrichten lehnt der Parser ab.
    expect(await page.evaluate(() => window.__chaos?.board?.receive?.({ type: 'board' }))).toBe(
      false,
    );
  });

  test('Minispiel-Platzhalter, Ergebnis und Endstand', async ({ page }) => {
    const problems = collectProblems(page);
    await openBoard(page);
    const base = await demoView(page, 0);
    const players = base.players as { slot: number; coins: number }[];

    await feed(page, {
      v: 2,
      type: 'board',
      view: {
        ...base,
        gamePhase: 'minigame-play',
        activeSlot: null,
        prompt: null,
        remainingMs: 3000,
      },
      events: [{ type: 'minigame-started', minigame: 'placeholder' }],
      eventSeq: 0,
    });
    await playUntilIdle(page);
    const minigame = page.getByTestId('board-minigame');
    await expect(minigame).toContainText('Minispiel – kommt in M3');
    await expect(minigame).toContainText('noch 3 s');

    await feed(page, {
      v: 2,
      type: 'board',
      view: { ...base, gamePhase: 'minigame-results', activeSlot: null, prompt: null },
      events: [
        { type: 'minigame-results', ranking: [4, 2, 1, 3] },
        { type: 'coins-changed', slot: 4, delta: 10, balance: 13, reason: 'minigame' },
      ],
      eventSeq: 1,
    });
    await playUntilIdle(page);
    await expect(minigame).toHaveAttribute('data-phase', 'minigame-results');
    await expect(minigame.locator('.board-ranking-row').first()).toContainText('Rosa');
    await expect(minigame).toContainText('+10 Münzen');

    await feed(page, {
      v: 2,
      type: 'board',
      view: {
        ...base,
        gamePhase: 'game-results',
        activeSlot: null,
        prompt: null,
        ranking: [
          { slot: 3, place: 1, trophies: 2, coins: 4 },
          { slot: 1, place: 2, trophies: 1, coins: players[0]?.coins ?? 0 },
          { slot: 2, place: 3, trophies: 0, coins: 9 },
          { slot: 4, place: 3, trophies: 0, coins: 9 },
        ],
      },
      events: [{ type: 'game-ended', ranking: [] }],
      eventSeq: 3,
    });
    await playUntilIdle(page);
    await expect(page.getByTestId('board-minigame')).toHaveCount(0);
    await expect(page.getByTestId('board-winner')).toHaveText('Grün gewinnt!');
    await expect(page.getByTestId('board-rank-3')).toContainText('1.');
    await expect(page.getByTestId('board-rank-4')).toHaveAttribute('data-place', '3');
    expectNoProblems(problems);
  });
});
