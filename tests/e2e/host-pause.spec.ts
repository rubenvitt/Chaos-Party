/**
 * Pause, vorzeitiges Ende und Revanche am Host (M4, CHAOS-36/37) am echten Node-Server.
 *
 * Zwei synthetische Controller (`LobbyBot`) spielen; der Host pausiert per Knopf und Tasten
 * (P/Esc), das Pause-Overlay folgt `view.paused` (auch nach dem Neuladen), „Partie beenden“
 * fragt nach und führt zum Finale (`endedEarly`), „Nochmal spielen“ zurück in die Lobby.
 * Ein zweiter Test pausiert mitten im Minispiel: Der Runner der Host-Bühne steht still.
 */
import type { Page } from '@playwright/test';
import type {} from '../../apps/host/src/finale/testHook.ts';
import type {} from '../../apps/host/src/minigame/testHook.ts';
import type {} from '../../apps/host/src/testHook.ts';
import { LobbyBot } from './fixtures/lobbyBot.ts';
import { collectProblems, expectNoProblems } from './fixtures/pages.ts';
import type { RunningServer } from './fixtures/server.ts';
import { expect, test } from './fixtures/test.ts';

async function startWithBots(page: Page, chaosServer: RunningServer, url: string) {
  await page.goto(url);
  await expect(page.getByTestId('connection')).toHaveAttribute('data-status', 'connected');
  const bots = [
    await LobbyBot.join(chaosServer, { character: 'raccoon' }),
    await LobbyBot.join(chaosServer),
  ];
  await expect(page.getByTestId('lobby-player-2')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('lobby-player-1')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('start-button').click();
  const main = page.locator('main.host');
  await expect(main).toHaveAttribute('data-phase', 'board');
  return bots;
}

/**
 * Testmodus: Die Brett-Regie läuft nur mit `stepFrames`/`advance`. Spielt alles Ausstehende ab,
 * damit z. B. der Endstand nach den letzten Ereignissen übernommen wird.
 */
async function settleBoard(page: Page) {
  const idle = await page.evaluate(() => {
    const board = window.__chaos?.board;
    if (!board) return false;
    for (let t = 0; t < 30_000 && board.animating; t += 100) board.advance(100);
    return !board.animating;
  });
  expect(idle, 'Regie wird fertig').toBe(true);
}

/** Texte maskieren (Schrift-Rendering je Rechner, ADR-004). */
const pauseMask = (page: Page) => [
  page.locator(
    ['.pause-kicker', '.pause-title', '.pause-lead', '.pause-action', '.pause-keys'].join(', '),
  ),
];

test.describe('Pause, Ende und Revanche (Node-Server, Production-Build)', () => {
  test.setTimeout(120_000);

  test('Pause per Knopf und Taste, auch nach Neuladen; Ende mit Rückfrage; Revanche', async ({
    page,
    chaosServer,
  }) => {
    const problems = collectProblems(page);
    const session = chaosServer.server.session;
    const bots = await startWithBots(page, chaosServer, '/host/?test=1&rounds=3');
    try {
      const main = page.locator('main.host');
      const overlay = page.getByTestId('pause-overlay');
      await expect(main).toHaveAttribute('data-scene', 'ready');
      await expect(main).toHaveAttribute('data-paused', 'false');

      if (process.env.HOST_PAUSE_BELEG) {
        await page.evaluate(() => window.__chaos?.stepFrames(2));
        await page.screenshot({
          path: 'docs/screenshots/m4-brett-pauseknopf.jpg',
          quality: 88,
          animations: 'disabled',
        });
      }
      // Knopf → Server pausiert → Overlay mit Fokus auf „Weiter“.
      await page.getByTestId('pause-button').click();
      await expect(overlay).toBeVisible();
      await expect(main).toHaveAttribute('data-paused', 'true');
      expect(session.snapshot().game?.state.paused).toBe(true);
      await expect(page.getByTestId('pause-resume')).toBeFocused();
      await expect(page.getByTestId('pause-button')).toHaveCount(0);
      await page.evaluate(() => window.__chaos?.stepFrames(2));
      if (process.env.HOST_PAUSE_BELEG) {
        await page.screenshot({
          path: 'docs/screenshots/m4-pause.jpg',
          quality: 88,
          animations: 'disabled',
        });
      }
      // Nur die Pause-Karte: Das Brett dahinter hängt vom Echtzeit-Ablauf der Bots ab.
      await expect(page.locator('.pause-card')).toHaveScreenshot('host-pause.png', {
        mask: pauseMask(page),
      });

      // „Weiter“ → fortgesetzt.
      await page.getByTestId('pause-resume').click();
      await expect(overlay).toHaveCount(0);
      expect(session.snapshot().game?.state.paused).toBe(false);

      // Taste P pausiert; nach dem Neuladen steht das Overlay sofort wieder da.
      await page.keyboard.press('p');
      await expect(overlay).toBeVisible();
      await page.reload();
      await expect(page.locator('main.host')).toHaveAttribute('data-phase', 'board');
      await expect(overlay).toBeVisible();
      await expect(main).toHaveAttribute('data-paused', 'true');

      // Esc setzt fort, Esc pausiert wieder.
      await page.keyboard.press('Escape');
      await expect(overlay).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(overlay).toBeVisible();

      // „Partie beenden“ fragt nach; Esc schließt nur die Rückfrage.
      await page.getByTestId('pause-end').click();
      await expect(page.getByTestId('pause-confirm')).toBeVisible();
      await expect(page.getByTestId('pause-end-confirm')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('pause-confirm')).toHaveCount(0);
      await expect(overlay).toBeVisible();
      await page.getByTestId('pause-end').click();
      await page.getByTestId('pause-end-confirm').click();
      await expect.poll(() => session.snapshot().game?.state.phase).toBe('game-results');
      await settleBoard(page);

      // Finale (Testmodus: sofort Siegerbildschirm) mit Hinweis auf das vorzeitige Ende.
      await expect(page.getByTestId('board-results')).toHaveAttribute('data-done', 'true');
      await expect(page.getByTestId('finale-ended-early')).toBeVisible();
      await expect(overlay).toHaveCount(0);
      await expect(page.getByTestId('pause-button')).toHaveCount(0);
      const game = session.snapshot().game?.state;
      expect(game?.phase).toBe('game-results');
      expect(game?.endedEarly).toBe(true);

      // „Nochmal spielen“ → Lobby; Spieler und Figuren bleiben.
      await expect(page.getByTestId('rematch-button')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(main).toHaveAttribute('data-phase', 'lobby');
      await expect(page.getByTestId('lobby-player-1')).toHaveAttribute('data-character', 'raccoon');
      await expect(page.getByTestId('lobby-player-2')).toHaveAttribute('data-character', 'cactus');
      await expect(page.getByTestId('rounds-3')).toHaveAttribute('aria-pressed', 'true');
      expect(session.snapshot().phase).toBe('lobby');
    } finally {
      for (const bot of bots) bot.close();
    }
    expectNoProblems(problems, 'Host');
  });

  test('Pause im Minispiel hält die Host-Bühne an', async ({ page, chaosServer }) => {
    test.setTimeout(180_000);
    const problems = collectProblems(page);
    const bots = await startWithBots(page, chaosServer, '/host/?test=1&rounds=1');
    try {
      const stage = () => page.evaluate(() => window.__chaosMinigame?.stage ?? null);
      await expect.poll(stage, { timeout: 150_000 }).toBe('play');
      await page.waitForFunction(() => window.__chaosMinigame?.ready === true);
      await page.evaluate(() => window.__chaosMinigame?.step(30));
      if (process.env.HOST_PAUSE_BELEG) {
        // Laufendes Minispiel aus der echten Rotation (M4-Beleg, CHAOS-40).
        await page.evaluate(() => window.__chaosMinigame?.step(240));
        await page.screenshot({
          path: 'docs/screenshots/m4-minispiel.jpg',
          quality: 88,
          animations: 'disabled',
        });
      }
      const before = await page.evaluate(() => window.__chaosMinigame?.elapsedMs ?? -1);
      expect(before).toBeGreaterThan(0);

      await page.keyboard.press('p');
      await expect(page.getByTestId('pause-overlay')).toBeVisible();
      expect(await page.evaluate(() => window.__chaosMinigame?.paused)).toBe(true);
      await page.evaluate(() => window.__chaosMinigame?.step(60));
      expect(await page.evaluate(() => window.__chaosMinigame?.elapsedMs)).toBe(before);
      expect(chaosServer.server.session.snapshot().game?.state.paused).toBe(true);

      await page.keyboard.press('p');
      await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
      expect(await page.evaluate(() => window.__chaosMinigame?.paused)).toBe(false);
      await page.evaluate(() => window.__chaosMinigame?.step(30));
      expect(await page.evaluate(() => window.__chaosMinigame?.elapsedMs ?? 0)).toBeGreaterThan(
        before,
      );
    } finally {
      for (const bot of bots) bot.close();
    }
    expectNoProblems(problems, 'Host');
  });
});
