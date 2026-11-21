/**
 * Schnellfeuer als eigene Rundenart (CHAOS-90): echte Seiten gegen den echten Server, mit 2, 3
 * und 4 Personen. Ein iPhone spielt mit, die übrigen Plätze sind synthetische Controller.
 *
 * - Auslöser `finale` und eine Runde: Das einzige Minispiel der Partie ist Schnellfeuer (der
 *   Standard-Auslöser „Ereignis, sonst Finale“ landet bei einer Runde ebenso dort).
 * - Host im Testmodus (`?test=1`): Die Bühne rechnet nur auf `__chaosMinigame.step(n)`.
 *
 * Abgedeckt: Anleitung von Schnellfeuer → Bildwort des ersten Mikro-Spiels → A vom iPhone kommt an
 * → alle fünf Mikro-Spiele durchgerechnet → Ergebnis vom Host gesendet und vom Server angenommen
 * (Plätze für alle, Münzen verteilt) → Finale.
 *
 * Nicht bewiesen: Lesbarkeit des Bildworts am Fernseher, Tempo im echten Spiel, Spaß – das
 * beurteilt Ruben bei der Zwischenabnahme (CHAOS-92), siehe `docs/device-test-checklist.md`.
 */
import type { Page } from '@playwright/test';
import { withRules } from '../../packages/game-core/src/index.ts';
import { getMinigameInfo, RAPID_FIRE_ID } from '../../packages/minigames/src/catalog.ts';
import type {} from '../../apps/host/src/minigame/testHook.ts';
import { LobbyBot } from './fixtures/lobbyBot.ts';
import { collectProblems, expectNoProblems } from './fixtures/pages.ts';
import { startChaosServer, type RunningServer } from './fixtures/server.ts';
import { expect, test as base } from './fixtures/test.ts';

const INFO = (() => {
  const info = getMinigameInfo(RAPID_FIRE_ID);
  if (!info) throw new Error('Schnellfeuer fehlt im Katalog');
  return info;
})();

/** Feste Schritte à 1/60 s, die sicher über die ganze Kette hinausgehen. */
const STEPS_TO_FINISH = Math.ceil(INFO.durationMs / (1000 / 60)) + 60;

const test = base.extend<{ chaosServer: RunningServer }>({
  chaosServer: async ({ chaosJoinCode }, use) => {
    const running = await startChaosServer({
      joinCode: chaosJoinCode,
      game: {
        rules: {
          ...withRules({ pacing: { minigameIntroMs: 3_000, minigameReadyMinMs: 1_000 } }),
          rapidFire: { trigger: 'finale' },
        },
        rapidFire: { id: INFO.id, playMs: INFO.durationMs, scoring: INFO.scoring },
      },
    });
    try {
      await use(running);
    } finally {
      await running.close();
    }
  },
});

async function answerPrompt(phone: Page): Promise<void> {
  const prompt = phone.getByTestId('prompt');
  if (!(await prompt.isVisible())) return;
  for (const id of ['choice-roll', 'choice-buy', 'choice-brace', 'choice-cancel']) {
    const button = prompt.getByTestId(id);
    if ((await button.count()) > 0 && (await button.isEnabled())) {
      await button.tap();
      return;
    }
  }
  const choices = prompt.locator('[data-testid^="choice-"]:enabled');
  if ((await choices.count()) > 0) await choices.first().tap();
}

async function minigameStage(host: Page): Promise<string | null> {
  const screen = host.getByTestId('minigame-screen');
  if ((await screen.count()) === 0) return null;
  return screen.getAttribute('data-stage');
}

async function step(host: Page, frames: number): Promise<void> {
  await host.evaluate((n) => {
    window.__chaosMinigame?.step(n);
  }, frames);
}

test.describe('Schnellfeuer: fünf Mikro-Spiele als eigene Rundenart', () => {
  test.setTimeout(180_000);

  for (const players of [2, 3, 4] as const) {
    test(`läuft mit ${String(players)} Personen von der Anleitung bis zum Ergebnis`, async ({
      page: host,
      openDevice,
      chaosServer,
    }) => {
      const hostProblems = collectProblems(host);
      await host.goto('/host/?rounds=1&test=1');
      await expect(host.getByTestId('connection')).toHaveAttribute('data-status', 'connected');

      const phone = await openDevice('iPhone 13');
      const phoneProblems = collectProblems(phone);
      await phone.goto(chaosServer.joinUrl);
      await expect(phone.getByTestId('ready-button')).toBeVisible();
      const bots: LobbyBot[] = [];
      for (let i = 1; i < players; i++) bots.push(await LobbyBot.join(chaosServer));
      await phone.getByTestId('ready-button').tap();
      await expect(host.getByTestId('start-button')).toBeEnabled();
      await host.getByTestId('start-button').click();

      const deadline = Date.now() + 120_000;
      while ((await minigameStage(host)) === null) {
        if (Date.now() > deadline) throw new Error('Schnellfeuer erscheint nicht');
        await answerPrompt(phone);
        await host.waitForTimeout(200);
      }

      // Anleitung: Schnellfeuer mit Titel, drei Zeilen und Stick + A.
      const intro = host.getByTestId('minigame-intro');
      await expect(intro).toBeVisible();
      await expect(host.locator('main.host')).toHaveAttribute('data-minigame', RAPID_FIRE_ID);
      await expect(host.getByTestId('minigame-title')).toHaveText(INFO.title);
      for (const line of INFO.instructions) await expect(intro).toContainText(line);
      const button = phone.getByTestId('minigame-ready-button');
      await expect(button).toHaveAttribute('data-armed', 'true');
      await button.tap();

      // Spiel: Bildwort des ersten Mikro-Spiels, dann A vom iPhone.
      await expect(host.getByTestId('minigame-screen')).toHaveAttribute('data-stage', 'play', {
        timeout: 20_000,
      });
      await host.waitForFunction(
        () => window.__chaosMinigame?.ready === true && window.__chaosMinigame.state === 'running',
      );
      expect(await host.evaluate(() => window.__chaosMinigame?.hud()?.banner)).toMatch(
        /^1\/5 \S+ [A-ZÄÖÜ]+!$/,
      );
      await step(host, 100);
      expect(await host.evaluate(() => window.__chaosMinigame?.hud()?.banner)).toMatch(
        /^\S+ [A-ZÄÖÜ]+!/,
      );
      await expect(phone.getByTestId('button-a')).toBeVisible();
      await phone.getByTestId('button-a').tap();
      await host.waitForFunction(() => (window.__chaosMinigame?.networkInputs?.[1] ?? 0) >= 2);

      // Alle fünf durchrechnen → Ergebnis vom Host, angenommen, Plätze und Münzen für alle.
      await step(host, STEPS_TO_FINISH);
      await expect(host.getByTestId('minigame-screen')).toHaveAttribute('data-stage', 'results');
      expect(await host.evaluate(() => window.__chaosMinigame?.resultState)).toBe('accepted');
      await expect(host.getByTestId('minigame-results')).toBeVisible();
      const state = chaosServer.server.session.snapshot().game?.state;
      expect(state?.minigame?.id).toBe(RAPID_FIRE_ID);
      expect(state?.minigame?.aborted).toBe(false);
      expect(state?.minigame?.placements).toHaveLength(players);
      expect(state?.minigame?.rewards).toHaveLength(players);
      for (let slot = 1; slot <= players; slot++) {
        await expect(host.getByTestId(`minigame-rank-${String(slot)}`)).toBeVisible();
      }

      // Danach geht die Partie ins Finale (eine Runde).
      await expect
        .poll(() => chaosServer.server.session.snapshot().game?.state.phase, { timeout: 30_000 })
        .toBe('game-results');

      for (const bot of bots) bot.close();
      expectNoProblems(hostProblems, 'Host');
      expectNoProblems(phoneProblems, 'Handy');
    });
  }
});
