/**
 * Screenshot-Regression der Minispiele (CHAOS-34, Intro seit CHAOS-84): jedes Minispiel der
 * Rotation bekommt zwei Baselines, ohne Extra-Code je Spiel:
 *
 * - **Intro** (`minispiel-<id>-intro`): lokaler Ablauf `…&flow=1`, Anleitungskarte mit Titel,
 *   Anleitung und Bedienung über der Szene vor dem Start. Vorher prüft
 *   `expectStableWrapping`, dass kein Anleitungstext an einer Umbruchkante steht.
 * - **Spielszene** (`minispiel-<id>`): lokale Vorschau (`/host/?local=1&minigame=<id>&test=1`)
 *   mit festem Seed, vier Spielern, fester Kamera und ohne Eingaben, nach genau 2 s Spielzeit
 *   (feste Schritte, Animationen mit konstantem Zeitschritt).
 *
 * Prüft, dass Szene, Figuren, HUD und Anleitung erscheinen und sich nicht unbemerkt ändern.
 * Physik (Havok) läuft im selben Browser deterministisch genug für die Toleranz;
 * plattformübergreifende Bitgleichheit wird nicht verlangt (ADR-012).
 *
 * Neues Spiel in der Rotation: Baselines halbautomatisch erzeugen (unter Linux, siehe
 * docs/testing.md), ansehen, einchecken:
 * `pnpm test:e2e m3-minispiele-bild --update-snapshots=missing`
 */
import { rotationInfos } from '../../packages/minigames/src/catalog.ts';
import type {} from '../../apps/host/src/minigame/testHook.ts';
import { collectProblems, expectNoProblems } from './fixtures/pages.ts';
import { expect, test } from './fixtures/test.ts';
import { expectStableWrapping } from './fixtures/wrapping.ts';

const STEPS = 120;

for (const info of rotationInfos()) {
  test(`Minispiel ${info.id}: Bild nach 2 s mit festem Seed`, async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`/host/?local=1&minigame=${info.id}&players=4&seed=7&test=1`);
    await page.waitForFunction(() => window.__chaosMinigame?.ready === true, null, {
      timeout: 60_000,
    });
    await page.evaluate((steps) => {
      window.__chaosMinigame?.step(steps);
    }, STEPS);
    const hud = await page.evaluate(() => window.__chaosMinigame?.hud() ?? null);
    expect(hud?.scores).toHaveLength(4);
    expect(hud?.remainingMs).toBe(info.durationMs - Math.round((STEPS * 1000) / 60));
    await expect(page.locator('main.host')).toHaveAttribute('data-minigame', info.id);
    await expect(page).toHaveScreenshot(`minispiel-${info.id}.png`, {
      maxDiffPixelRatio: 0.02,
      timeout: 30_000,
    });
    expectNoProblems(problems, `Minispiel ${info.id}`);
  });
}

for (const info of rotationInfos()) {
  test(`Minispiel ${info.id}: Anleitung vor dem Start`, async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`/host/?local=1&minigame=${info.id}&flow=1&players=4&seed=7&test=1`);
    await expect(page.locator('main.host')).toHaveAttribute('data-scene', 'ready');
    await page.waitForFunction(() => window.__chaosMinigame?.ready === true, null, {
      timeout: 60_000,
    });
    const intro = page.getByTestId('minigame-intro');
    await expect(intro).toBeVisible();
    await expect(page.getByTestId('minigame-title')).toHaveText(info.title);
    for (const line of info.instructions) await expect(intro).toContainText(line);
    const offered = (['joystick', 'a', 'b'] as const).filter((key) => info.controls[key] !== null);
    await expect(page.getByTestId('minigame-controls').locator('li')).toHaveCount(offered.length);
    await expectStableWrapping(intro);
    await expect(page).toHaveScreenshot(`minispiel-${info.id}-intro.png`, {
      maxDiffPixelRatio: 0.02,
      timeout: 30_000,
    });
    expectNoProblems(problems, `Anleitung ${info.id}`);
  });
}
