/**
 * Minispiel-Galerie und Daumen (CHAOS-87): echte Seiten gegen den echten Server.
 *
 * Abgedeckt (Akzeptanzkriterium): Galerie in der PC-Lobby öffnen → ein Minispiel üben → Spiel
 * mit Controller-Eingabe → Ergebnis ohne Münzen → Daumen am Handy → zurück in der Lobby zeigt
 * die Galerie die Stimme; der Export unter `/ratings.json` enthält sie auch.
 *
 * - Host im Testmodus (`?test=1`): Die Minispiel-Bühne rechnet nur auf
 *   `window.__chaosMinigame.step(n)`. Ergebnisanzeige verlängert, damit die Stimme in Ruhe
 *   fällt; die Rückkehr in die Lobby wartet trotzdem nicht auf Stimmen (Integrationstest).
 *
 * Was das **nicht** beweist: Daumen-Tippen auf echtem iOS, Lesbarkeit der Galerie am Fernseher –
 * siehe `docs/device-test-checklist.md`.
 */
import { withRules } from '../../packages/game-core/src/index.ts';
import { getMinigameInfo } from '../../packages/minigames/src/catalog.ts';
import type {} from '../../apps/host/src/minigame/testHook.ts';
import { collectProblems, expectNoProblems } from './fixtures/pages.ts';
import { startChaosServer, type RunningServer } from './fixtures/server.ts';
import { expect, test as base } from './fixtures/test.ts';

const ID = 'pump-parade';
const INFO = (() => {
  const info = getMinigameInfo(ID);
  if (!info) throw new Error('Referenz-Minispiel fehlt im Katalog');
  return info;
})();
// Großzügig: In der CI lädt die Minispiel-Bühne langsamer; die Anleitung muss sichtbar bleiben, bis sie steht.
const INTRO_MS = 8_000;
const RESULTS_MS = 15_000;
const STEPS_TO_FINISH = Math.ceil(INFO.durationMs / (1000 / 60)) + 30;

const test = base.extend<{ chaosServer: RunningServer }>({
  chaosServer: async ({ chaosJoinCode }, use) => {
    const running = await startChaosServer({
      joinCode: chaosJoinCode,
      game: {
        rules: withRules({
          // Die Anleitung wartet auf „Bereit“ (CHAOS-214), frühestens nach INTRO_MS.
          pacing: {
            minigameIntroMs: INTRO_MS,
            minigameReadyMinMs: INTRO_MS,
            minigameResultsMs: RESULTS_MS,
          },
        }),
      },
    });
    try {
      await use(running);
    } finally {
      await running.close();
    }
  },
});

test.describe('Minispiel-Galerie (CHAOS-87)', () => {
  test.setTimeout(120_000);

  test('Spiel aus der Galerie üben, Daumen am Handy, Übersicht zeigt die Stimme', async ({
    page: host,
    openDevice,
    chaosServer,
  }) => {
    const hostProblems = collectProblems(host);
    await host.goto('/host/?test=1');
    await expect(host.getByTestId('connection')).toHaveAttribute('data-status', 'connected');

    // Galerie ohne Controller: alles sichtbar, Üben noch aus.
    await host.getByTestId('gallery-button').click();
    const gallery = host.getByTestId('minigame-gallery');
    await expect(gallery).toBeVisible();
    const item = host.getByTestId(`gallery-item-${ID}`);
    await expect(item).toContainText(INFO.title);
    await expect(item).toHaveAttribute('data-status', 'spielbar');
    await expect(host.getByTestId('gallery-item-sockenregen')).toHaveAttribute(
      'data-status',
      'rotation',
    );
    await expect(host.getByTestId(`gallery-votes-${ID}`)).toContainText('Noch keine Stimmen');
    await expect(host.getByTestId(`gallery-practice-${ID}`)).toBeDisabled();
    await expect(gallery).toHaveScreenshot('galerie-leer.png');
    await host.keyboard.press('Escape');
    await expect(gallery).toHaveCount(0);

    // Ein Handy kommt dazu (bereit muss es zum Üben nicht sein).
    const phone = await openDevice('iPhone 13');
    const phoneProblems = collectProblems(phone);
    await phone.goto(chaosServer.joinUrl);
    await expect(phone.getByTestId('ready-button')).toBeVisible();
    await host.getByTestId('gallery-button').click();
    await host.getByTestId(`gallery-practice-${ID}`).click();
    await expect(gallery).toHaveCount(0);

    // Übungsrunde: gleich die Anleitung des gewählten Spiels, kein Brettzug.
    await expect(host.locator('main.host')).toHaveAttribute('data-phase', 'board');
    await expect(host.locator('main.host')).toHaveAttribute('data-minigame', ID);
    await expect(host.getByTestId('minigame-screen')).toHaveAttribute('data-stage', 'intro');
    await expect(host.getByTestId('minigame-title')).toHaveText(INFO.title);
    await expect(phone.getByTestId('minigame-intro')).toBeVisible();
    // Auch die Übungsrunde wartet auf „Bereit“ (CHAOS-214).
    const ready = phone.getByTestId('minigame-ready-button');
    await expect(ready).toHaveAttribute('data-armed', 'true');
    await ready.tap();

    // Spiel: Eingabe vom Handy, dann die Spielzeit durchrechnen.
    await expect(host.getByTestId('minigame-screen')).toHaveAttribute('data-stage', 'play', {
      timeout: INTRO_MS + 15_000,
    });
    await host.waitForFunction(
      () => window.__chaosMinigame?.ready === true && window.__chaosMinigame.state === 'running',
    );
    await phone.getByTestId('button-a').tap();
    await host.waitForFunction(() => (window.__chaosMinigame?.networkInputs?.[1] ?? 0) >= 2);
    await host.evaluate((steps) => {
      window.__chaosMinigame?.step(steps);
    }, STEPS_TO_FINISH);

    // Ergebnis: Übung ohne Münzen, am Handy Daumen.
    await expect(host.getByTestId('minigame-screen')).toHaveAttribute('data-stage', 'results');
    const results = host.getByTestId('minigame-results');
    await expect(results).toHaveAttribute('data-practice', 'true');
    await expect(host.getByTestId('minigame-practice-note')).toBeVisible();
    await expect(host.getByTestId('minigame-coins-1')).toHaveAttribute('data-coins', '');
    const coins = chaosServer.server.session.snapshot().game?.state.players[0]?.coins;
    expect(coins).toBe(
      chaosServer.server.session.snapshot().game?.state.config.rules.economy.startCoins,
    );

    const vote = phone.getByTestId('minigame-vote');
    await expect(vote).toBeVisible();
    await expect(phone.getByTestId('result-reward')).toHaveCount(0);
    await expect(phone.getByTestId('minigame-lead')).toContainText('Lobby');
    await phone.getByTestId('vote-up').tap();
    await expect(phone.getByTestId('vote-up')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => chaosServer.server.session.ratingVotes().length).toBe(1);
    expect(chaosServer.server.session.ratingVotes()[0]).toMatchObject({
      minigameId: ID,
      vote: 'up',
      practice: true,
      slot: 1,
    });
    await expect(phone).toHaveScreenshot('daumen-handy.png');

    // Nach der Ergebnisanzeige zurück in die Lobby; die Galerie zeigt die Stimme.
    await expect(host.locator('main.host')).toHaveAttribute('data-phase', 'lobby', {
      timeout: RESULTS_MS + 10_000,
    });
    await expect(phone.getByTestId('ready-button')).toBeVisible();
    await host.getByTestId('gallery-button').click();
    const votes = host.getByTestId(`gallery-votes-${ID}`);
    await expect(votes).toHaveAttribute('data-up', '1');
    await expect(votes).toHaveAttribute('data-down', '0');
    await expect(votes).toContainText('1 Stimme');

    // Export für den Katalog.
    const exported = await host.request.get('/ratings.json');
    expect(exported.ok()).toBe(true);
    const body = (await exported.json()) as {
      games: { id: string; up: number; down: number }[];
      votes: unknown[];
    };
    expect(body.games.find((game) => game.id === ID)).toMatchObject({ up: 1, down: 0 });
    expect(body.votes).toHaveLength(1);

    expectNoProblems(hostProblems, 'Host');
    expectNoProblems(phoneProblems, 'Handy');
  });
});
