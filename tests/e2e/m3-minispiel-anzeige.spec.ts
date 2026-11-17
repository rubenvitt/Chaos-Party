/**
 * Anzeige der Minispiel-Bühne ohne Server (CHAOS-26/33): lokaler Ablauf
 * `/host/?local=1&minigame=<id>&flow=1&test=1` – Anleitung → Spiel → Ergebnis mit festem Seed.
 *
 * Screenshot-Baselines prüfen die **Anleitungskarte** und die **Ergebnisanzeige**. Den
 * 3D-Hintergrund blenden sie aus: Er gehört dem jeweiligen Minispiel und den Figuren (die
 * parallel durch GLB-Modelle ersetzt werden) und hat eigene Tests. Belegbilder mit Szene für
 * die Doku: `M3_BELEG=1 pnpm test:e2e m3-minispiel-anzeige` schreibt
 * `docs/screenshots/m3-minispiel-intro.png` und `m3-minispiel-ergebnis.png` (Pixeldichte 2),
 * dazu `chaos66-minispiel-intro-kurz.png` (kurze Anleitung bei Wiederholung, CHAOS-66; als JPG
 * eingecheckt).
 */
import type { Browser, Page } from '@playwright/test';
import { getMinigameInfo } from '../../packages/minigames/src/catalog.ts';
import type {} from '../../apps/host/src/minigame/testHook.ts';
import { collectProblems, expectNoProblems } from './fixtures/pages.ts';
import { expect, test } from './fixtures/test.ts';

const INFO = (() => {
  const info = getMinigameInfo('pump-parade');
  if (!info) throw new Error('Referenz-Minispiel fehlt im Katalog');
  return info;
})();
const FLOW_URL = `/host/?local=1&minigame=${INFO.id}&flow=1&test=1&players=4&seed=7`;
const STEPS_TO_FINISH = Math.ceil(INFO.durationMs / (1000 / 60)) + 30;

async function openFlow(page: Page) {
  await page.goto(FLOW_URL);
  await expect(page.locator('main.host')).toHaveAttribute('data-scene', 'ready');
  await page.waitForFunction(() => window.__chaosMinigame?.ready === true);
}

/** Szene ausblenden: Die Baseline prüft nur die Karten (siehe Kopfkommentar). */
async function hideScene(page: Page) {
  await page.addStyleTag({ content: '.minigame-screen canvas { visibility: hidden; }' });
}

/** Spielt bis zum Ergebnis: Blau und Grün je 5×, Orange 3×, Rosa 0× → Gleichstand vorn. */
async function playToResults(page: Page) {
  await page.evaluate(() => {
    window.__chaosMinigame?.next?.();
  });
  await page.waitForFunction(() => window.__chaosMinigame?.state === 'running');
  await page.evaluate((steps) => {
    const hook = window.__chaosMinigame;
    if (!hook) return;
    const tap = (slot: 1 | 2 | 3 | 4, count: number) => {
      for (let index = 0; index < count; index++) {
        hook.input(slot, { type: 'press', button: 'a' });
        hook.input(slot, { type: 'release', button: 'a' });
      }
    };
    tap(1, 5);
    tap(2, 3);
    tap(3, 5);
    hook.step(steps);
  }, STEPS_TO_FINISH);
  await expect(page.getByTestId('minigame-screen')).toHaveAttribute('data-stage', 'results');
}

/** Belegbilder in doppelter Pixeldichte mit Szene (nur `M3_BELEG=1`). */
async function writeDocShots(browser: Browser, baseURL: string) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    baseURL,
  });
  const page = await context.newPage();
  await openFlow(page);
  await page.screenshot({
    path: 'docs/screenshots/m3-minispiel-intro.png',
    animations: 'disabled',
  });
  await playToResults(page);
  await page.evaluate(() => {
    window.__chaosMinigame?.step(30);
  });
  await page.screenshot({
    path: 'docs/screenshots/m3-minispiel-ergebnis.png',
    animations: 'disabled',
  });
  await context.close();
}

/** Belegbild der kurzen Anleitung mit Szene (nur `M3_BELEG=1`, CHAOS-66). */
async function writeRepeatDocShot(browser: Browser, baseURL: string) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    baseURL,
  });
  const page = await context.newPage();
  await page.goto(`${FLOW_URL}&repeat=1`);
  await expect(page.locator('main.host')).toHaveAttribute('data-scene', 'ready');
  await page.waitForFunction(() => window.__chaosMinigame?.ready === true);
  // Eingecheckt als JPG (`convert … -quality 82 …-kurz.jpg`), wie die übrigen Belegbilder.
  await page.screenshot({
    path: 'docs/screenshots/chaos66-minispiel-intro-kurz.png',
    animations: 'disabled',
  });
  await context.close();
}

test.describe('Minispiel-Bühne: Anleitung und Ergebnis (lokal)', () => {
  test('Anleitung → Spiel → Ergebnis mit Gleichstand und Münzen; Screenshots stabil', async ({
    page,
    browser,
    chaosServer,
  }) => {
    const problems = collectProblems(page);
    await openFlow(page);

    const intro = page.getByTestId('minigame-intro');
    await expect(intro).toBeVisible();
    await expect(page.getByTestId('minigame-title')).toHaveText(INFO.title);
    await expect(page.getByTestId('minigame-countdown')).toHaveAttribute('data-seconds', '8');
    const controls = page.getByTestId('minigame-controls');
    // Nur angebotene Bedienelemente erscheinen, je mit Symbol und Text.
    const offered = (['joystick', 'a', 'b'] as const).filter((key) => INFO.controls[key] !== null);
    await expect(controls.locator('li')).toHaveCount(offered.length);
    for (const key of offered) {
      await expect(controls.locator(`[data-control="${key}"] svg`)).toBeVisible();
    }
    for (const name of ['Schraubi', 'Kalle Kaktus', 'Wusel', 'Socke Sigi']) {
      await expect(intro).toContainText(name);
    }
    await expect(intro).toHaveAttribute('data-repeat', 'false');
    await hideScene(page);
    await expect(page).toHaveScreenshot('m3-minispiel-intro.png');

    await playToResults(page);
    await expect(page.getByTestId('minigame-headline')).toHaveText('Gleichstand: Blau und Grün!');
    const expected = [
      { slot: 1, place: '1', tied: 'true', coins: '10' },
      { slot: 3, place: '1', tied: 'true', coins: '10' },
      { slot: 2, place: '3', tied: 'false', coins: '3' },
      { slot: 4, place: '4', tied: 'false', coins: '0' },
    ];
    for (const row of expected) {
      const rank = page.getByTestId(`minigame-rank-${String(row.slot)}`);
      await expect(rank).toHaveAttribute('data-place', row.place);
      await expect(rank).toHaveAttribute('data-tied', row.tied);
      await expect(page.getByTestId(`minigame-coins-${String(row.slot)}`)).toHaveAttribute(
        'data-coins',
        row.coins,
      );
    }
    await expect(page.getByTestId('minigame-rank-1')).toContainText('geteilt');
    await expect(page.getByTestId('minigame-rank-1')).toContainText(`5 ${INFO.scoreUnit}`);
    // Trostpreis (CHAOS-51, EXP-019): nur der letzte Platz, lokal fest ein Schild.
    await expect(page.getByTestId('minigame-prize-4')).toHaveAttribute('data-items', 'shield');
    await expect(page.getByTestId('minigame-prize-4')).toContainText('Trostpreis');
    await expect(page.locator('[data-testid^="minigame-prize-"]')).toHaveCount(1);
    // Effekte im Testmodus nur gezählt: Minispiel-Klänge und Konfetti für die Sieger.
    const fx = await page.evaluate(() => window.__chaosMinigame?.fx ?? null);
    expect(fx?.sounds).toBeGreaterThan(0);
    expect(fx?.bursts).toBe(2);
    await expect(page).toHaveScreenshot('m3-minispiel-ergebnis.png');

    if (process.env.M3_BELEG) await writeDocShots(browser, chaosServer.base);
    expectNoProblems(problems, 'Host');
  });

  test('Tastatur steuert die Spieler im lokalen Ablauf (Fehlersuche)', async ({ page }) => {
    const problems = collectProblems(page);
    await openFlow(page);
    await page.evaluate(() => {
      window.__chaosMinigame?.next?.();
    });
    await page.waitForFunction(() => window.__chaosMinigame?.state === 'running');
    // Leertaste = A von Spieler 1, Enter = A von Spieler 2.
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    const scores = await page.evaluate(() => window.__chaosMinigame?.hud()?.scores ?? []);
    expect(scores.find((entry) => entry.slot === 1)?.score).toBe(2);
    expect(scores.find((entry) => entry.slot === 2)?.score).toBe(1);
    expectNoProblems(problems, 'Host');
  });

  test('Kurze Anleitung bei Wiederholung (CHAOS-66): Titel, Bedienung, Spieler, 3-s-Countdown', async ({
    page,
    browser,
    chaosServer,
  }) => {
    const problems = collectProblems(page);
    await page.goto(`${FLOW_URL}&repeat=1`);
    await expect(page.locator('main.host')).toHaveAttribute('data-scene', 'ready');
    await page.waitForFunction(() => window.__chaosMinigame?.ready === true);

    const intro = page.getByTestId('minigame-intro');
    await expect(intro).toHaveAttribute('data-repeat', 'true');
    await expect(page.getByTestId('minigame-kicker')).toContainText('Nochmal!');
    await expect(page.getByTestId('minigame-title')).toHaveText(INFO.title);
    await expect(page.getByTestId('minigame-instructions')).toHaveCount(0);
    await expect(intro).not.toContainText(INFO.tagline);
    await expect(page.getByTestId('minigame-controls')).toBeVisible();
    await expect(page.getByTestId('minigame-countdown')).toHaveAttribute('data-seconds', '3');
    for (const name of ['Schraubi', 'Kalle Kaktus', 'Wusel', 'Socke Sigi']) {
      await expect(intro).toContainText(name);
    }
    await hideScene(page);
    await expect(page).toHaveScreenshot('m3-minispiel-intro-kurz.png');

    if (process.env.M3_BELEG) await writeRepeatDocShot(browser, chaosServer.base);
    expectNoProblems(problems, 'Host');
  });
});
