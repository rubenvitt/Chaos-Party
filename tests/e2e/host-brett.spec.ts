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

  test('Lichtverlauf: Rundenwechsel blendet weich in die nächste Stimmung (CHAOS-63)', async ({
    page,
  }) => {
    const problems = collectProblems(page);
    await openBoard(page);
    const lightMood = () => page.evaluate(() => window.__chaos?.board?.getLightMood() ?? null);
    const hud = page.getByTestId('board-hud');
    // Runde 2 von 5: Mittag, kein Übergang.
    expect(await lightMood()).toEqual({ from: 'mittag', to: 'mittag', progress: 1 });
    await expect(hud).toHaveAttribute('data-sky', 'hell');

    const base = await demoView(page, 0);
    const nextRound = async (round: number, eventSeq: number) => {
      await feed(page, {
        v: 4,
        type: 'board',
        view: { ...base, round },
        events: [{ type: 'round-started', round }],
        eventSeq,
      });
      await playUntilIdle(page);
    };

    // Runde 3: Goldene Stunde, Überblendung über 4 s (240 Bilder à 1/60 s).
    await nextRound(3, 0);
    const start = await lightMood();
    expect(start).toMatchObject({ from: 'mittag', to: 'abend' });
    expect(start?.progress).toBeLessThan(0.05);
    await stepFrames(page, 120);
    const half = await lightMood();
    expect(half?.progress).toBeGreaterThan(0.4);
    expect(half?.progress).toBeLessThan(0.6);
    await stepFrames(page, 130);
    expect(await lightMood()).toEqual({ from: 'abend', to: 'abend', progress: 1 });

    // Runde 4 und 5: Dämmerung, dann Nacht; der HUD-Titel wird hell.
    await nextRound(4, 1);
    await expect(hud).toHaveAttribute('data-sky', 'dunkel');
    await stepFrames(page, 250);
    expect(await lightMood()).toEqual({ from: 'daemmerung', to: 'daemmerung', progress: 1 });
    await nextRound(5, 2);
    await stepFrames(page, 250);
    expect(await lightMood()).toEqual({ from: 'nacht', to: 'nacht', progress: 1 });
    await expect(page.getByTestId('board-round')).toHaveText('Runde 5/5');
    await settleGpu(page);
    if (process.env.HOST_BRETT_BELEG) {
      await page.screenshot({ path: 'docs/screenshots/chaos63-brett-nacht-sparstufe.png' });
    }
    await expect(page).toHaveScreenshot('host-brett-nacht.png', { mask: hudMask(page) });
    expectNoProblems(problems);
  });

  test('Wachsende Sabotage: Ansage nur in der Wachstumsrunde (CHAOS-120)', async ({ page }) => {
    const problems = collectProblems(page);
    await openBoard(page);
    const base = await demoView(page, 0);
    const notice = page.getByTestId('board-notice');
    const roundStart = async (
      round: number,
      eventSeq: number,
      sabotage?: { steal: number; trap: number },
    ) => {
      await feed(page, {
        v: 4,
        type: 'board',
        view: { ...base, round, gamePhase: 'turn-start', prompt: null },
        events: [
          sabotage ? { type: 'round-started', round, sabotage } : { type: 'round-started', round },
          { type: 'turn-started', slot: 1, round },
        ],
        eventSeq,
      });
    };

    // Gewöhnlicher Rundenstart: keine Einblendung.
    await roundStart(3, 0);
    await expect(page.getByTestId('board-messages')).toContainText('Runde 3 beginnt!');
    await expect(notice).toHaveCount(0);
    await playUntilIdle(page);

    // Wachstumsrunde: Einblendung mit den neuen Werten, Zugbeginn erst nach kurzer Pause.
    await roundStart(4, 2, { steal: 6, trap: 5 });
    await expect(notice).toContainText('Sabotage wird stärker!');
    await expect(notice).toContainText('Klau: 6 Münzen · Falle: 5 Münzen');
    expect(await page.evaluate(() => window.__chaos?.board?.animating)).toBe(true);
    await playUntilIdle(page);
    await expect(page.getByTestId('board-banner')).toHaveText('Blau ist dran!');
    await expect(notice).toBeVisible();
    await stepFrames(page, 2);
    await settleGpu(page);
    if (process.env.HOST_BRETT_BELEG) {
      await page.screenshot({ path: 'docs/screenshots/chaos120-sabotage-ansage.png' });
    }
    await expect(page).toHaveScreenshot('host-brett-sabotage.png', {
      mask: [
        ...hudMask(page),
        page.locator('.board-notice-title, .board-notice-detail, .board-banner'),
      ],
    });

    // Nach 4 s Regie-Zeit ist sie wieder weg.
    await page.evaluate(() => window.__chaos?.board?.advance(4000));
    await expect(notice).toHaveCount(0);
    expectNoProblems(problems);
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

  test('Windstoß weht die Figur in einem Flug weg (CHAOS-52)', async ({ page }) => {
    const problems = collectProblems(page);
    await openBoard(page);
    const base = await demoView(page, 0);
    const players = base.players as { slot: number; spaceId: string }[];
    const start = (await page.evaluate(() => window.__chaos?.getPlayerPositions() ?? [])).find(
      (p) => p.slot === 1,
    );
    await feed(page, {
      v: 4,
      type: 'board',
      view: {
        ...base,
        gamePhase: 'space-event',
        prompt: null,
        players: players.map((p) => (p.slot === 1 ? { ...p, spaceId: 's09' } : p)),
      },
      events: [
        { type: 'board-event', slot: 1, event: 'gust' },
        { type: 'moved', slot: 1, path: ['s08', 's09'] },
      ],
      eventSeq: 0,
    });
    await expect(page.getByTestId('board-messages')).toContainText('Windböe');
    // Ansage 0,4 s (24 Frames), dann 0,9 s Flug: nach einem Drittel des Flugs hoch in der Luft,
    // höher als ein normaler Hüpfer (Scheitel 0,9 über dem Feld).
    await stepFrames(page, 24 + 18);
    expect((await pawnSpaces(page))[1]).toBe('s07');
    const flying = (await page.evaluate(() => window.__chaos?.getPlayerPositions() ?? [])).find(
      (p) => p.slot === 1,
    );
    expect(flying?.y ?? 0).toBeGreaterThan(1.4);
    if (process.env.HOST_BRETT_BELEG) {
      await settleGpu(page);
      await page.screenshot({ path: 'docs/screenshots/chaos52-windstoss.png' });
    }
    expect(
      Math.hypot((flying?.x ?? 0) - (start?.x ?? 0), (flying?.z ?? 0) - (start?.z ?? 0)),
    ).toBeGreaterThan(1.5);
    await playUntilIdle(page);
    expect(await pawnSpaces(page)).toEqual({ 1: 's09', 2: 's21', 3: 's34', 4: 's42' });
    const landed = (await page.evaluate(() => window.__chaos?.getPlayerPositions() ?? [])).find(
      (p) => p.slot === 1,
    );
    expect(landed?.y ?? 0).toBeLessThan(0.5);
    expectNoProblems(problems);
  });

  test('Platztausch: beide Figuren fliegen gleichzeitig über Kreuz (CHAOS-52)', async ({
    page,
  }) => {
    const problems = collectProblems(page);
    await openBoard(page);
    const base = await demoView(page, 0);
    const players = base.players as { slot: number; spaceId: string }[];
    await feed(page, {
      v: 4,
      type: 'board',
      view: {
        ...base,
        gamePhase: 'space-event',
        prompt: null,
        players: players.map((p) =>
          p.slot === 1 ? { ...p, spaceId: 's34' } : p.slot === 3 ? { ...p, spaceId: 's07' } : p,
        ),
      },
      events: [
        { type: 'board-event', slot: 1, event: 'swap' },
        { type: 'moved', slot: 1, path: ['s34'] },
        { type: 'moved', slot: 3, path: ['s07'] },
      ],
      eventSeq: 0,
    });
    await expect(page.getByTestId('board-messages')).toContainText('Platztausch');
    // Ansage 0,4 s, dann 1 s Flug: nach 30 % beide gleichzeitig in der Luft.
    await stepFrames(page, 24 + 18);
    const inAir = await page.evaluate(() => window.__chaos?.getPlayerPositions() ?? []);
    for (const slot of [1, 3]) {
      expect(inAir.find((p) => p.slot === slot)?.y ?? 0, `Slot ${slot}`).toBeGreaterThan(1.4);
    }
    expect(inAir.find((p) => p.slot === 2)?.y ?? 0).toBeLessThan(0.5);
    await settleGpu(page);
    if (process.env.HOST_BRETT_BELEG) {
      await page.screenshot({ path: 'docs/screenshots/chaos52-platztausch.png' });
    }
    await expect(page).toHaveScreenshot('host-brett-platztausch.png', { mask: hudMask(page) });

    await playUntilIdle(page);
    expect(await pawnSpaces(page)).toEqual({ 1: 's34', 2: 's21', 3: 's07', 4: 's42' });
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

  test('Kamera-Regie: Gabel, Laufen, Zugwechsel, Ereignis, Überblick (CHAOS-194)', async ({
    page,
  }) => {
    const problems = collectProblems(page);
    const camera = () => page.evaluate(() => window.__chaos?.board?.getCamera() ?? null);
    await openBoard(page);

    // Startstand: Blau wählt an Gabel A einen Weg, die Kamera zeigt beide Wege, nicht das Brett.
    await stepFrames(page, 30);
    let cam = await camera();
    expect(cam?.kind).toBe('fit');
    expect(cam?.distance).toBeLessThan(28);
    if (process.env.HOST_BRETT_BELEG) {
      await settleGpu(page);
      await page.screenshot({ path: 'docs/screenshots/chaos194-kamera-gabel.jpg' });
    }

    // Laufen: nah an Blau, Blick voraus.
    await feedDemo(page, 1);
    await stepFrames(page, 25);
    cam = await camera();
    expect(cam?.kind).toBe('walk');
    expect(cam?.shotDistance).toBeLessThan(22);
    await settleGpu(page);
    if (process.env.HOST_BRETT_BELEG) {
      await page.screenshot({ path: 'docs/screenshots/chaos194-kamera-laufen.jpg' });
    }
    await expect(page).toHaveScreenshot('host-brett-kamera-laufen.png', { mask: hudMask(page) });
    await playUntilIdle(page);

    // Zugwechsel: ruhige Fahrt zu Grün (s34), unterwegs etwas höher, dann nah.
    await feedDemo(page, 2);
    await stepFrames(page, 20);
    cam = await camera();
    expect(cam?.kind).toBe('follow');
    expect(cam?.distance).toBeGreaterThan(cam?.shotDistance ?? 0);
    await stepFrames(page, 150);
    cam = await camera();
    // Angekommen: Fahrt beendet, nah bei Grün (am Brettrand etwas nach innen gerückt).
    const green = (await page.evaluate(() => window.__chaos?.getPlayerPositions() ?? [])).find(
      (p) => p.slot === 3,
    );
    const gap = (a?: { x: number; z: number }, b?: { x: number; z: number }) =>
      Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.z ?? 0) - (b?.z ?? 0));
    expect(gap(cam?.focus, cam?.shotFocus)).toBeLessThan(0.5);
    expect(gap(cam?.shotFocus, green)).toBeLessThan(6);
    expect(cam?.distance).toBeLessThan(20);
    await settleGpu(page);
    if (process.env.HOST_BRETT_BELEG) {
      await page.screenshot({ path: 'docs/screenshots/chaos194-kamera-zugwechsel.jpg' });
    }
    await expect(page).toHaveScreenshot('host-brett-kamera-zugwechsel.png', {
      mask: hudMask(page),
    });

    // Ereignis: Grün würfelt, kurzer Zoom auf die Figur.
    await feedDemo(page, 3);
    await stepFrames(page, 30);
    cam = await camera();
    expect(cam?.kind).toBe('event');
    await settleGpu(page);
    if (process.env.HOST_BRETT_BELEG) {
      await page.screenshot({ path: 'docs/screenshots/chaos194-kamera-ereignis.jpg' });
    }
    await expect(page).toHaveScreenshot('host-brett-kamera-ereignis.png', { mask: hudMask(page) });
    await playUntilIdle(page);

    // Rundenbeginn: kurzer Überblick über das ganze Brett.
    await page.evaluate(() => {
      const board = window.__chaos?.board;
      const last = board?.demoMessages?.[3] as {
        view: Record<string, unknown>;
        events: unknown[];
        eventSeq: number;
      };
      board?.receive?.({
        ...last,
        view: { ...last.view, round: 3, gamePhase: 'turn-start', prompt: null },
        events: [{ type: 'round-started', round: 3 }],
        eventSeq: last.eventSeq + last.events.length,
      });
    });
    await stepFrames(page, 75);
    cam = await camera();
    expect(cam?.kind).toBe('overview');
    expect(cam?.shotDistance).toBeGreaterThan(30);
    await settleGpu(page);
    if (process.env.HOST_BRETT_BELEG) {
      await page.screenshot({ path: 'docs/screenshots/chaos194-kamera-ueberblick.jpg' });
    }
    await expect(page).toHaveScreenshot('host-brett-kamera-ueberblick.png', {
      mask: hudMask(page),
    });
    // Danach wieder die Figur am Zug.
    await stepFrames(page, 60);
    expect((await camera())?.kind).toBe('follow');
    expectNoProblems(problems);
  });

  test('Lücke in eventSeq springt ohne Animation auf den Stand', async ({ page }) => {
    await openBoard(page);
    const jumps = await page.evaluate(() => window.__chaos?.board?.jumps ?? 0);
    const view = await demoView(page, 3);
    await feed(page, {
      v: 4,
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
      v: 4,
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
    await expect(minigame).toContainText('Plätze werden ausgelost');
    await expect(minigame).toContainText('noch 3 s');

    await feed(page, {
      v: 4,
      type: 'board',
      view: { ...base, gamePhase: 'minigame-results', activeSlot: null, prompt: null },
      events: [
        {
          type: 'minigame-results',
          ranking: [4, 2, 1, 3],
          placements: [
            { slot: 4, place: 1, score: 0 },
            { slot: 2, place: 2, score: 0 },
            { slot: 1, place: 3, score: 0 },
            { slot: 3, place: 4, score: 0 },
          ],
          aborted: false,
        },
        { type: 'coins-changed', slot: 4, delta: 10, balance: 13, reason: 'minigame' },
      ],
      eventSeq: 1,
    });
    await playUntilIdle(page);
    await expect(minigame).toHaveAttribute('data-phase', 'minigame-results');
    await expect(minigame.locator('.board-ranking-row').first()).toContainText('Rosa');
    await expect(minigame).toContainText('+10 Münzen');

    await feed(page, {
      v: 4,
      type: 'board',
      view: {
        ...base,
        gamePhase: 'game-results',
        activeSlot: null,
        prompt: null,
        ranking: [
          { slot: 3, place: 1, trophies: 2, coins: 4, minigameWins: 0, decidedBy: 'trophies' },
          {
            slot: 1,
            place: 2,
            trophies: 1,
            coins: players[0]?.coins ?? 0,
            minigameWins: 0,
            decidedBy: 'trophies',
          },
          { slot: 2, place: 3, trophies: 0, coins: 9, minigameWins: 0, decidedBy: 'shared' },
          { slot: 4, place: 3, trophies: 0, coins: 9, minigameWins: 0, decidedBy: 'shared' },
        ],
      },
      events: [{ type: 'game-ended', ranking: [], endedEarly: false }],
      eventSeq: 3,
    });
    await playUntilIdle(page);
    await expect(page.getByTestId('board-minigame')).toHaveCount(0);
    await expect(page.getByTestId('board-winner')).toHaveText('Grün gewinnt!');
    await expect(page.getByTestId('board-rank-3')).toContainText('1.');
    await expect(page.getByTestId('board-rank-4')).toHaveAttribute('data-place', '3');
    expectNoProblems(problems);
  });

  test('Rückenwind: Karte im Rundenende, Ticker, danach weg (CHAOS-125)', async ({ page }) => {
    const problems = collectProblems(page);
    await openBoard(page);
    const base = await demoView(page, 0);
    const players = base.players as { slot: number; coins: number; trophies: number }[];
    const coinsOf = (slot: number) => players.find((p) => p.slot === slot)?.coins ?? 0;
    const minigame = {
      id: 'placeholder',
      round: 2,
      seed: 7,
      playMs: 3000,
      elapsedMs: 3000,
      placements: null,
      highlights: [],
      aborted: false,
      rewards: [],
      tailwind: [
        { slot: 1, coins: 2 },
        { slot: 4, coins: 6 },
      ],
    };
    await feed(page, {
      v: 4,
      type: 'board',
      view: {
        ...base,
        gamePhase: 'round-end',
        activeSlot: null,
        prompt: null,
        remainingMs: 5000,
        minigame,
        players: players.map((p) =>
          p.slot === 1
            ? { ...p, coins: coinsOf(1) + 2 }
            : p.slot === 4
              ? { ...p, coins: coinsOf(4) + 6 }
              : p,
        ),
      },
      events: [
        {
          type: 'coins-changed',
          slot: 1,
          delta: 2,
          balance: coinsOf(1) + 2,
          reason: 'tailwind',
        },
        {
          type: 'coins-changed',
          slot: 4,
          delta: 6,
          balance: coinsOf(4) + 6,
          reason: 'tailwind',
        },
        { type: 'round-ended', round: 2 },
      ],
      eventSeq: 0,
    });
    await playUntilIdle(page);
    const card = page.getByTestId('board-tailwind');
    await expect(card).toContainText('Rückenwind!');
    await expect(card).toContainText('Wer bei den Trophäen hinten liegt');
    // Die meisten Münzen zuerst.
    await expect(card.locator('.board-tailwind-row').first()).toContainText('Rosa');
    await expect(page.getByTestId('board-tailwind-4')).toContainText('+6 Münzen');
    await expect(page.getByTestId('board-tailwind-1')).toContainText('+2 Münzen');
    await expect(page.getByTestId('board-coins-4')).toHaveText(String(coinsOf(4) + 6));
    await expect(page.getByTestId('board-messages')).toContainText('Rückenwind: Rosa +6 Münzen');
    await settleGpu(page);
    await expect(page).toHaveScreenshot('host-brett-rueckenwind.png', {
      mask: [
        ...hudMask(page),
        page.locator('.board-tailwind-name, .board-tailwind-value, .board-tailwind-lead'),
      ],
    });

    await feed(page, {
      v: 4,
      type: 'board',
      view: { ...base, gamePhase: 'turn-start', activeSlot: 1, prompt: null, round: 3 },
      events: [
        { type: 'round-started', round: 3 },
        { type: 'turn-started', slot: 1, round: 3 },
      ],
      eventSeq: 3,
    });
    await playUntilIdle(page);
    await expect(card).toHaveCount(0);
    expectNoProblems(problems);
  });

  test('?gpu=webgpu ohne WebGPU im Browser fällt auf WebGL2 zurück (CHAOS-75)', async ({
    page,
  }) => {
    // Wie ein Browser ohne WebGPU (CI-Chromium rendert ohnehin per Software).
    await page.addInitScript(() => {
      delete (Navigator.prototype as { gpu?: unknown }).gpu;
    });
    const warnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
    const problems = collectProblems(page);
    // Ohne Testmodus: Nur dann startet das Brett die Engine asynchron (WebGPU-Pfad).
    await page.goto('/host/?local=1&board=1&debug=1&gpu=webgpu');
    await expect(page.locator('main.host')).toHaveAttribute('data-scene', 'ready', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('debug-renderer')).toContainText('WebGL2');
    expect(warnings.some((w) => w.includes('WebGPU nicht verfügbar'))).toBe(true);
    expectNoProblems(problems);
  });
});
