/**
 * M2-Durchstich (CHAOS-22, CHAOS-23): echte Seiten gegen den echten Server, Brettspiel.
 *
 * - Host: Production-Build unter `/host/?rounds=1` **ohne** Testmodus – das Brett animiert in
 *   Echtzeit mit dem Pacing des Servers, wie am PC.
 * - Zwei iPhones (eigene Browser-Kontexte) treten über den Join-Link bei, tippen „Bereit!“,
 *   der Host startet das Brettspiel. Wer eine Entscheidung angeboten bekommt, tippt einen
 *   Knopf – genau wie ein Mensch, nur ohne Bedenkzeit.
 * - Seed fest (`E2E_GAME_SEED`), eine Runde: Würfeln, Laufen, Feldereignis, Zugwechsel,
 *   Minispiel (seit M3 echt: Host spielt es in Echtzeit und meldet das Ergebnis; niemand
 *   drückt, also Gleichstand), Endstand auf Host und Handys.
 *
 * Gewartet wird nur auf DOM-Zustände. Was das **nicht** beweist: echtes iOS-Safari, WLAN,
 * Lesbarkeit am Fernseher – siehe `docs/device-test-checklist.md`.
 */
import type { Page } from '@playwright/test';
import { collectProblems, expectNoProblems } from './fixtures/pages.ts';
import { expect, test } from './fixtures/test.ts';

const HOST_URL = '/host/?rounds=1';

/** Tippt auf dem Handy die bevorzugte Option des offenen Prompts (falls einer offen ist). */
async function answerPrompt(phone: Page): Promise<string | null> {
  const prompt = phone.getByTestId('prompt');
  if (!(await prompt.isVisible())) return null;
  const choices = prompt.locator('[data-testid^="choice-"]:enabled');
  if ((await choices.count()) === 0) return null;
  // Würfeln statt Items (Items führen in Ziel-/Reaktions-Prompts, die andere Tests abdecken).
  const preferred = ['choice-roll', 'choice-buy', 'choice-brace', 'choice-cancel'];
  for (const id of preferred) {
    const button = prompt.getByTestId(id);
    if ((await button.count()) > 0 && (await button.isEnabled())) {
      await button.tap();
      return id;
    }
  }
  const first = choices.first();
  const id = await first.getAttribute('data-testid');
  await first.tap();
  return id;
}

test.describe('M2-Durchstich: Brettspiel mit echten Seiten', () => {
  test.setTimeout(180_000);

  test('zwei iPhones spielen eine komplette Runde bis zum Endstand', async ({
    page: host,
    openDevice,
    chaosServer,
  }) => {
    const hostProblems = collectProblems(host);
    await host.goto(HOST_URL);
    await expect(host.getByTestId('connection')).toHaveAttribute('data-status', 'connected');

    const phone1 = await openDevice('iPhone 13');
    const phone2 = await openDevice('iPhone 13');
    const phoneProblems = [collectProblems(phone1), collectProblems(phone2)];
    await phone1.goto(chaosServer.joinUrl);
    await phone2.goto(chaosServer.joinUrl);
    await phone1.getByTestId('ready-button').tap();
    await phone2.getByTestId('ready-button').tap();
    await expect(host.getByTestId('start-button')).toBeEnabled();
    await host.getByTestId('start-button').click();

    // Brettphase: Host zeigt Brett und HUD, beide Handys ihren Stand.
    const main = host.locator('main.host');
    await expect(main).toHaveAttribute('data-phase', 'board');
    await expect(main).toHaveAttribute('data-scene', 'ready');
    await expect(host.getByTestId('board-hud')).toBeVisible();
    await expect(host.getByTestId('board-player-1')).toBeVisible();
    await expect(host.getByTestId('board-player-2')).toBeVisible();
    for (const phone of [phone1, phone2]) {
      await expect(phone.getByTestId('board-status')).toBeVisible();
      await expect(phone.getByTestId('stat-round')).toContainText('1');
    }

    // Genau ein Handy bekommt den Würfel angeboten, das andere wartet.
    await expect
      .poll(async () => {
        const visible = await Promise.all(
          [phone1, phone2].map((phone) => phone.getByTestId('choice-roll').isVisible()),
        );
        return visible.filter(Boolean).length;
      })
      .toBe(1);
    const [first, second] = (await phone1.getByTestId('choice-roll').isVisible())
      ? [phone1, phone2]
      : [phone2, phone1];
    await expect(second.getByTestId('board-waiting')).toBeVisible();
    // Am PC ist genau ein Spieler als „am Zug“ markiert.
    await expect(host.locator('[data-testid^="board-player-"][data-active="true"]')).toHaveCount(1);

    // Würfeln: Knöpfe sperren, Host zeigt die Bewegung (Münzen/Meldungen ändern sich).
    await first.getByTestId('choice-roll').tap();
    await expect(first.getByTestId('choice-roll')).toBeHidden({ timeout: 10_000 });

    // Weiterspielen, bis der Endstand da ist: jede angebotene Entscheidung beantworten.
    // Seit M3 spielt der Host das Minispiel der Runde in Echtzeit (Minispiel-Bühne) und
    // schickt das Ergebnis; mitschreiben, welche Abschnitte zu sehen waren.
    const answered: string[] = [];
    const minigameStages = new Set<string>();
    const minigameAborted = new Set<string>();
    const results = host.getByTestId('board-results');
    const deadline = Date.now() + 150_000;
    while (!(await results.isVisible())) {
      if (Date.now() > deadline)
        throw new Error(`Kein Endstand; Antworten: ${answered.join(', ')}`);
      for (const phone of [first, second]) {
        const id = await answerPrompt(phone);
        if (id) answered.push(id);
      }
      const stage = await host
        .getByTestId('minigame-screen')
        .getAttribute('data-stage', { timeout: 100 })
        .catch(() => null);
      if (stage) minigameStages.add(stage);
      const aborted = await host
        .getByTestId('minigame-results')
        .getAttribute('data-aborted', { timeout: 100 })
        .catch(() => null);
      if (aborted) minigameAborted.add(aborted);
      await host.waitForTimeout(250);
    }
    expect([...minigameStages].sort()).toEqual(['intro', 'play', 'results']);
    expect([...minigameAborted]).toEqual(['false']);

    // Beide Spieler waren dran (das zweite Handy hat mindestens einmal gewürfelt).
    expect(answered).toContain('choice-roll');
    await expect(host.getByTestId('board-winner')).toBeVisible();
    await expect(host.getByTestId('board-rank-1')).toBeVisible();
    await expect(host.getByTestId('board-rank-2')).toBeVisible();
    for (const phone of [phone1, phone2]) {
      await expect(phone.getByTestId('final-place')).toBeVisible();
      const place = Number(await phone.getByTestId('final-place').getAttribute('data-place'));
      expect(place).toBeGreaterThanOrEqual(1);
      expect(place).toBeLessThanOrEqual(2);
    }

    // Der Server-Stand passt zum Host: Partie zu Ende, eine Runde.
    const game = chaosServer.server.session.snapshot().game;
    expect(game?.state.phase).toBe('game-results');
    expect(game?.state.rounds).toBe(1);

    expectNoProblems(hostProblems, 'Host');
    phoneProblems.forEach((problems, index) => {
      expectNoProblems(problems, `Handy ${String(index + 1)}`);
    });
  });
});
