/**
 * PC-Lobby mit Charakterwahl und Rundenzahl (M4, CHAOS-36) am echten Node-Server.
 *
 * Synthetische Controller (`LobbyBot`) treten bei und wählen Figuren per `pick-character`;
 * der Host zeigt je Spieler Porträt und Namen der gewählten Figur bzw. „wählt noch …“,
 * stellt die Rundenzahl per `configure` ein (Maus und Tastatur) und startet. Auf dem Brett
 * stehen danach die gewählten Figuren (Testhaken `getPawnCharacters`).
 */
import type { Page } from '@playwright/test';
import type {} from '../../apps/host/src/testHook.ts';
import { LobbyBot } from './fixtures/lobbyBot.ts';
import { collectProblems, expectNoProblems, openHost, stepFrames } from './fixtures/pages.ts';
import { E2E_JOIN_CODE } from './fixtures/server.ts';
import { expect, test } from './fixtures/test.ts';

/** Fester Join-Link für den Screenshot (der echte enthält den zufälligen Port). */
const PINNED_JOIN_URL = `http://127.0.0.1:8787/?code=${E2E_JOIN_CODE}`;

async function pinLobbyJoinUrl(page: Page) {
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (typeof message !== 'string') {
        ws.send(message);
        return;
      }
      const data = JSON.parse(message) as { type?: unknown; joinUrl?: string };
      if (data.type === 'lobby') data.joinUrl = PINNED_JOIN_URL;
      ws.send(JSON.stringify(data));
    });
  });
}

/** Texte maskieren (Schrift-Rendering je Rechner, ADR-004); Inhalte prüfen DOM-Assertions. */
const lobbyMask = (page: Page) => [
  page.locator(
    [
      '.lobby-card h2',
      '.lobby-lead',
      '.join-code',
      '.join-url',
      '.join-device-label',
      '.join-device-seats',
      '.lobby-player-label',
      '.lobby-player-state',
      '.lobby-free-text',
      '.lobby-rounds legend',
      '.lobby-rounds-option',
      '.player-symbol',
      '.lobby-free-symbol',
      '.start-button',
      '.start-hint',
      '.hud-title',
      '.hud-connection',
    ].join(', '),
  ),
];

test.describe('Lobby mit Figuren und Rundenzahl (Node-Server, Production-Build)', () => {
  test('Figuren, „wählt noch …“, Rundenwahl per Maus und Tastatur, Start mit den Figuren', async ({
    page,
    chaosServer,
  }) => {
    const problems = collectProblems(page);
    const session = chaosServer.server.session;
    await pinLobbyJoinUrl(page);
    await openHost(page, '/host/?test=1&seed=2026');
    await expect(page.locator('.lobby-empty')).toBeVisible();

    // Rundenwahl: Vorschläge des Servers, Standard 5.
    await expect(page.getByTestId('rounds-5')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('lobby-rounds').locator('button')).toHaveCount(3);

    const bots = [
      await LobbyBot.join(chaosServer, { character: 'sock' }),
      await LobbyBot.join(chaosServer, { character: 'robot', name: 'Mia' }),
      await LobbyBot.join(chaosServer, { autoReady: false }),
    ];
    try {
      const card = (slot: number) => page.getByTestId(`lobby-player-${String(slot)}`);
      await expect(card(1)).toHaveAttribute('data-character', 'sock');
      await expect(page.getByTestId('lobby-character-1')).toHaveText('Socke Sigi');
      await expect(card(1).locator('.character-portrait')).toHaveAttribute(
        'data-character',
        'sock',
      );
      await expect(card(2)).toHaveAttribute('data-character', 'robot');
      await expect(card(2)).toContainText('Mia');
      // Slot 3 wählt noch: blasser Vorschlag (Standardfigur Waschbär ist frei).
      await expect(card(3)).toHaveAttribute('data-choosing', 'true');
      await expect(page.getByTestId('lobby-character-3')).toHaveText('wählt noch …');
      await expect(card(3).locator('.character-portrait')).toHaveAttribute(
        'data-character',
        'raccoon',
      );
      await expect(page.locator('.lobby-player--free')).toHaveCount(1);

      // Bereit-Status und Start-Hinweis: 1 und 2 bereit, 3 nicht.
      await expect(card(1)).toHaveAttribute('data-ready', 'true');
      await expect(card(2)).toHaveAttribute('data-ready', 'true');
      await expect(card(3)).toHaveAttribute('data-ready', 'false');
      const start = page.getByTestId('start-button');
      await expect(start).toBeEnabled();
      await expect(start).toHaveAttribute('data-highlight', 'false');
      await expect(page.getByTestId('start-hint')).toHaveText(
        'Grün ist noch nicht bereit – starten geht trotzdem.',
      );

      // Rundenzahl per Maus …
      await page.getByTestId('rounds-8').click();
      await expect(page.getByTestId('rounds-8')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('rounds-5')).toHaveAttribute('aria-pressed', 'false');
      expect(session.snapshot().rounds).toBe(8);
      await expect(start).toContainText('8 Runden');
      // … und per Tastatur (Fokus + Enter).
      await page.getByTestId('rounds-3').focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('rounds-3')).toHaveAttribute('aria-pressed', 'true');
      expect(session.snapshot().rounds).toBe(3);

      // Umwählen setzt „bereit“ zurück (ADR-014) – der Host zeigt es sofort.
      bots[0]?.pick('cactus');
      await expect(card(1)).toHaveAttribute('data-character', 'cactus');
      await expect(page.getByTestId('lobby-character-1')).toHaveText('Kalle Kaktus');
      // Der Bot tippt danach selbst wieder „bereit“.
      await expect(card(1)).toHaveAttribute('data-ready', 'true');

      await page.getByTestId('rounds-3').blur();
      await stepFrames(page, 30);
      if (process.env.HOST_LOBBY_BELEG) {
        await page.screenshot({ path: 'docs/screenshots/m4-host-lobby.png' });
      }
      await expect(page).toHaveScreenshot('host-lobby-figuren.png', { mask: lobbyMask(page) });

      // Alle bereit: Knopf leuchtet.
      bots[2]?.ready();
      await expect(card(3)).toHaveAttribute('data-ready', 'true');
      await expect(start).toHaveAttribute('data-highlight', 'true');
      await expect(page.getByTestId('start-hint')).toHaveText('Alle bereit – los!');

      // Start per Tastatur: Fokus auf den Knopf, Enter.
      await start.focus();
      await page.keyboard.press('Enter');
      const main = page.locator('main.host');
      await expect(main).toHaveAttribute('data-phase', 'board');
      await expect(main).toHaveAttribute('data-scene', 'ready');
      await page.waitForFunction(() => window.__chaos?.board?.ready === true);
      expect(session.snapshot().game?.state.rounds).toBe(3);
      // Brett zeigt die gewählten Figuren; Slot 3 bekam beim Start seine freie Standardfigur.
      await stepFrames(page, 2);
      expect(await page.evaluate(() => window.__chaos?.board?.getPawnCharacters())).toEqual({
        1: 'cactus',
        2: 'robot',
        3: 'raccoon',
      });
      await expect(page.getByTestId('board-round')).toHaveText('Runde 1/3');
    } finally {
      for (const bot of bots) bot.close();
    }
    expectNoProblems(problems, 'Host');
  });

  test('ein Spieler: Start als Probelauf möglich, aber ohne Leuchten', async ({
    page,
    chaosServer,
  }) => {
    await openHost(page, '/host/?test=1&seed=2026&rounds=2');
    const bot = await LobbyBot.join(chaosServer);
    try {
      await expect(page.getByTestId('lobby-player-1')).toHaveAttribute('data-ready', 'true');
      // `?rounds=2` stellt die Lobby beim Verbinden ein (kein Vorschlag → eigener Knopf).
      await expect(page.getByTestId('rounds-2')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('rounds-2')).toHaveAttribute('data-custom', 'true');
      expect(chaosServer.server.session.snapshot().rounds).toBe(2);
      const start = page.getByTestId('start-button');
      await expect(start).toBeEnabled();
      await expect(start).toHaveAttribute('data-highlight', 'false');
      await expect(page.getByTestId('start-hint')).toContainText('ab 2 Spielern');
    } finally {
      bot.close();
    }
  });
});
