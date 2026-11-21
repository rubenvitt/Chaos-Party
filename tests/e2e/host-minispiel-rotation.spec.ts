/**
 * Minispiele der Rotation in der PC-Lobby (CHAOS-85) am echten Node-Server: Dialog
 * „Minispiele“ mit Favorit/Sperren, `configure` an den Server, Stand in der Lobby, lokale
 * Speicherung und erneutes Senden an eine frische Session. Screenshot des Dialogs.
 */
import type { Page } from '@playwright/test';
import { rotationInfos } from '../../packages/minigames/src/catalog.ts';
import { collectProblems, expectNoProblems, openHost } from './fixtures/pages.ts';
import { expect, test } from './fixtures/test.ts';

const PREFS_KEY = 'chaos-party:minigame-rotation';
const [FIRST, SECOND] = rotationInfos();

/** Texte maskieren (Schrift-Rendering je Rechner, ADR-004); Inhalte prüfen DOM-Assertions. */
const dialogMask = (page: Page) => [
  page.locator(
    '.rotation-dialog h2, .rotation-lead, .rotation-title, .rotation-toggle-label, .rotation-close',
  ),
];

test.describe('Minispiel-Rotation in der Lobby (Node-Server, Production-Build)', () => {
  test('Favorit und Sperre per Dialog, Server übernimmt, Stand bleibt lokal gespeichert', async ({
    page,
    chaosServer,
  }) => {
    if (!FIRST || !SECOND) throw new Error('Rotation braucht mindestens zwei Minispiele');
    const problems = collectProblems(page);
    const session = chaosServer.server.session;
    await openHost(page, '/host/?test=1&seed=2026');

    const open = page.getByTestId('minigame-rotation-open');
    const total = rotationInfos().length;
    await expect(page.getByTestId('minigame-rotation-summary')).toHaveText(
      `${String(total)} im Topf`,
    );
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Minispiele' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.rotation-item')).toHaveCount(total);
    await expect(page.getByTestId('minigame-rotation-close')).toBeFocused();

    await page.getByTestId(`rotation-favorite-${SECOND.id}`).click();
    await page.getByTestId(`rotation-blocked-${FIRST.id}`).click();
    await expect(page.getByTestId(`rotation-${FIRST.id}`)).toHaveAttribute('data-blocked', 'true');
    await expect(page.getByTestId(`rotation-${SECOND.id}`)).toHaveAttribute(
      'data-favorite',
      'true',
    );
    await expect
      .poll(() => session.snapshot())
      .toMatchObject({ minigameBlocklist: [FIRST.id], minigameFavorites: [SECOND.id] });
    // Nur der Dialog: dahinter stehen QR-Code und Link mit zufälligem Port.
    await expect(page.locator('.rotation-dialog')).toHaveScreenshot('host-minispiel-rotation.png', {
      mask: dialogMask(page),
    });

    // Gesperrtes Spiel als Favorit: die Sperre fällt weg (beides schließt sich aus).
    await page.getByTestId(`rotation-favorite-${FIRST.id}`).click();
    await expect
      .poll(() => session.snapshot())
      .toMatchObject({ minigameBlocklist: [], minigameFavorites: [FIRST.id, SECOND.id] });
    await page.getByTestId(`rotation-blocked-${FIRST.id}`).click();

    // Escape schließt; der Knopf zeigt den Stand.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('minigame-rotation-summary')).toHaveText(
      `${String(total - 1)} im Topf · 1 ★ · 1 ⦸`,
    );
    expect(
      JSON.parse((await page.evaluate((key) => localStorage.getItem(key), PREFS_KEY)) ?? 'null'),
    ).toEqual({ blocklist: [FIRST.id], favorites: [SECOND.id] });
    expectNoProblems(problems, 'Host');
  });

  test('gespeicherter Stand geht beim Öffnen an eine frische Session', async ({
    page,
    chaosServer,
  }) => {
    if (!FIRST || !SECOND) throw new Error('Rotation braucht mindestens zwei Minispiele');
    await page.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      {
        key: PREFS_KEY,
        value: JSON.stringify({ blocklist: [SECOND.id, 'gibt-es-nicht'], favorites: [FIRST.id] }),
      },
    );
    await openHost(page, '/host/?test=1&seed=2026');
    // Fremde Kennungen ignoriert der Server; der Rest kommt an.
    await expect
      .poll(() => chaosServer.server.session.snapshot())
      .toMatchObject({ minigameBlocklist: [SECOND.id], minigameFavorites: [FIRST.id] });
    await expect(page.getByTestId('minigame-rotation-summary')).toContainText('1 ★ · 1 ⦸');
  });
});
