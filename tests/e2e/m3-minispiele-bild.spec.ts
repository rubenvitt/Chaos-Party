/**
 * Screenshot-Regression der Minispiele (CHAOS-34): jedes Minispiel der Rotation in der lokalen
 * Vorschau (`/host/?local=1&minigame=<id>&test=1`) mit festem Seed, vier Spielern, fester
 * Kamera und ohne Eingaben, nach genau 2 s Spielzeit (feste Schritte, Animationen mit
 * konstantem Zeitschritt). Prüft, dass Szene, Figuren und HUD erscheinen und sich nicht
 * unbemerkt ändern. Physik (Havok) läuft im selben Browser deterministisch genug für die
 * Toleranz; plattformübergreifende Bitgleichheit wird nicht verlangt (ADR-012).
 */
import { rotationInfos } from '../../packages/minigames/src/catalog.ts';
import type {} from '../../apps/host/src/minigame/testHook.ts';
import { collectProblems, expectNoProblems } from './fixtures/pages.ts';
import { expect, test } from './fixtures/test.ts';

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
