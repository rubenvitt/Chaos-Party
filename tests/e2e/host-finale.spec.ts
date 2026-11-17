/**
 * Finale am Host (CHAOS-37) im lokalen Brett-Modus ohne Server: Ein `board`-Stand in
 * `game-results` wird über den Testhaken eingespeist (Protokoll-Parser wie vom Server).
 *
 * - `?finale=manual`: Die Uhr der Trophäenzählung steht; `window.__chaosFinale.seek/advance`
 *   bewegt sie (stabile Screenshots, Gleichstand-Ansage, Hochzählen).
 * - Standard im Testmodus: `skip` – sofort Siegerbildschirm mit 3D-Podest.
 *
 * Screenshots mit festen Bildern (`stepPodium`) und konstantem Animationsschritt; Texte sind
 * maskiert wie in den anderen Host-Screenshots (Schrift-Rendering je Rechner, ADR-004).
 */
import type { Page } from '@playwright/test';
import type {} from '../../apps/host/src/finale/testHook.ts';
import type {} from '../../apps/host/src/testHook.ts';
import { collectProblems, expectNoProblems } from './fixtures/pages.ts';
import { expect, test } from './fixtures/test.ts';

const BOARD = '/host/?local=1&board=1&test=1';

async function openBoard(page: Page, extra = '') {
  await page.goto(`${BOARD}${extra}`);
  await expect(page.locator('main.host')).toHaveAttribute('data-scene', 'ready');
  await page.waitForFunction(() => window.__chaos?.board?.ready === true);
}

type Ranking = {
  slot: 1 | 2 | 3 | 4;
  place: number;
  trophies: number;
  coins: number;
  minigameWins: number;
  decidedBy: 'trophies' | 'coins' | 'minigame-wins' | 'shared';
}[];

/** Endstand: Grün und Blau gleich viele Trophäen, die Münzen entscheiden für Grün. */
const TIE_ON_TROPHIES: Ranking = [
  { slot: 3, place: 1, trophies: 2, coins: 17, minigameWins: 2, decidedBy: 'coins' },
  { slot: 1, place: 2, trophies: 2, coins: 9, minigameWins: 1, decidedBy: 'coins' },
  { slot: 2, place: 3, trophies: 1, coins: 4, minigameWins: 0, decidedBy: 'trophies' },
  { slot: 4, place: 4, trophies: 0, coins: 21, minigameWins: 1, decidedBy: 'trophies' },
];

const STATS = {
  1: { coinsEarned: 31, coinsLost: 6, spacesMoved: 44, itemsUsed: 2 },
  2: { coinsEarned: 18, coinsLost: 12, spacesMoved: 39, itemsUsed: 3 },
  3: { coinsEarned: 27, coinsLost: 3, spacesMoved: 51, itemsUsed: 1 },
  4: { coinsEarned: 36, coinsLost: 9, spacesMoved: 35, itemsUsed: 0 },
} as const;

/** Speist den Endstand ein (Lücke in `eventSeq` → ohne Animation übernommen). */
async function feedResults(page: Page, ranking: Ranking, endedEarly = false) {
  const accepted = await page.evaluate(
    ({ ranking, endedEarly, stats }) => {
      const board = window.__chaos?.board;
      const base = (board?.demoMessages?.[0] as { view: Record<string, unknown> } | undefined)
        ?.view;
      if (!board?.receive || !base) return false;
      const players = (base.players as { slot: 1 | 2 | 3 | 4 }[]).map((p) => {
        const entry = ranking.find((r) => r.slot === p.slot);
        return {
          ...p,
          trophies: entry?.trophies ?? 0,
          coins: entry?.coins ?? 0,
          minigameWins: entry?.minigameWins ?? 0,
          stats: stats[p.slot],
          // Andere Figuren als die Standardfigur je Slot (Charakterwahl, v4).
          character: ({ 1: 'sock', 2: 'robot', 3: 'raccoon', 4: 'cactus' } as const)[p.slot],
        };
      });
      return board.receive({
        v: 4,
        type: 'board',
        view: {
          ...base,
          gamePhase: 'game-results',
          activeSlot: null,
          prompt: null,
          round: endedEarly ? 3 : 5,
          players,
          ranking,
          endedEarly,
        },
        events: [{ type: 'game-ended', ranking, endedEarly }],
        eventSeq: 500,
      });
    },
    { ranking, endedEarly, stats: STATS },
  );
  expect(accepted).toBe(true);
}

/** Texte maskieren (Schrift-Rendering je Rechner); Inhalte prüfen DOM-Assertions. */
const finaleMask = (page: Page) => [
  page.locator(
    [
      '.finale-kicker',
      '.finale-title',
      '.finale-lead',
      '.finale-card-name',
      '.finale-card-character',
      '.finale-card-stat',
      '.finale-card-place',
      '.finale-skip',
      '.finale-winner',
      '.finale-reason',
      '.finale-rank-who',
      '.finale-rank-place',
      '.finale-rank-values',
      '.finale-award',
      '.finale-rematch',
      '.finale-rematch-hint',
      '.finale-early',
      '.player-symbol',
    ].join(', '),
  ),
];

test.describe('Finale: Trophäenzählung und Siegerbildschirm (lokal, Production-Build)', () => {
  test('Trophäenzählung deckt vom letzten Platz auf, zählt hoch und erklärt den Gleichstand', async ({
    page,
  }) => {
    const problems = collectProblems(page);
    await openBoard(page, '&finale=manual');
    await feedResults(page, TIE_ON_TROPHIES);
    const results = page.getByTestId('board-results');
    await expect(results).toHaveAttribute('data-beat', 'intro');
    await expect(page.getByTestId('finale-title')).toHaveText('Die Trophäenzählung!');
    await expect(page.getByTestId('finale-trophies-3')).toHaveText('?');
    // Figur aus der Wahl (nicht die Standardfigur des Slots).
    await expect(page.getByTestId('finale-card-1').locator('.character-portrait')).toHaveAttribute(
      'data-character',
      'sock',
    );

    // Erstes Aufdecken: Rosa (Platz 4). Mitte des Abschnitts: Trophäen fertig, Münzen zählen.
    await page.evaluate(() => window.__chaosFinale?.seek(2200 + 2800 * 0.7));
    await expect(results).toHaveAttribute('data-beat', 'reveal');
    await expect(page.getByTestId('finale-card-4')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('finale-trophies-4')).toHaveText('0');
    const coins = Number(await page.getByTestId('finale-coins-4').textContent());
    expect(coins).toBeGreaterThan(0);
    expect(coins).toBeLessThan(21);
    await expect(page.getByTestId('finale-lead')).toHaveText('Platz 4: Rosa');

    // Nach Orange und Blau kommt die Gleichstand-Ansage vor dem Sieger.
    await page.evaluate(() => window.__chaosFinale?.seek(2200 + 3 * 2800 + 100));
    await expect(results).toHaveAttribute('data-beat', 'tiebreak');
    await expect(page.getByTestId('finale-title')).toHaveText('Gleichstand bei den Trophäen!');
    await expect(page.getByTestId('finale-lead')).toHaveText('Jetzt entscheiden die Münzen …');
    await expect(page.getByTestId('finale-place-1')).toContainText('2.');
    await expect(page.getByTestId('finale-place-1')).toContainText('per Münzen');
    await expect(page.getByTestId('finale-coins-1')).toHaveText('9');
    await expect(page.getByTestId('finale-card-3')).toHaveAttribute('data-revealed', 'false');
    if (process.env.HOST_FINALE_BELEG) {
      await page.screenshot({
        path: 'docs/screenshots/m4-trophaeenzaehlung.png',
        animations: 'disabled',
      });
    }
    await expect(page).toHaveScreenshot('host-finale-zaehlung.png', { mask: finaleMask(page) });

    // „Überspringen“ springt zum Siegerbildschirm.
    await page.getByTestId('finale-skip').click();
    await expect(results).toHaveAttribute('data-done', 'true');
    await expect(page.getByTestId('board-winner')).toHaveText('Grün gewinnt!');
    await expect(page.getByTestId('finale-reason')).toContainText('die Münzen haben entschieden');
    expectNoProblems(problems, 'Host');
  });

  test('Siegerbildschirm: Podest mit den gewählten Figuren, Endstand, Bonus-Titel', async ({
    page,
  }) => {
    const problems = collectProblems(page);
    await openBoard(page);
    await feedResults(page, TIE_ON_TROPHIES);
    const results = page.getByTestId('board-results');
    await expect(results).toHaveAttribute('data-done', 'true');
    await expect(results).toHaveAttribute('data-podium', 'ready');
    await expect(page.getByTestId('board-winner')).toHaveText('Grün gewinnt!');
    await expect(page.getByTestId('board-rank-3')).toHaveAttribute('data-place', '1');
    await expect(page.getByTestId('board-rank-1')).toContainText('per Münzen');
    await expect(page.getByTestId('board-rank-4')).toHaveAttribute('data-place', '4');
    const awards = page.getByTestId('finale-awards');
    await expect(awards).toContainText('Münzmagnet');
    await expect(awards).toContainText('Rosa · 36 Münzen eingesammelt');
    await expect(awards).toContainText('Minispiel-Ass');
    await expect(page.getByTestId('finale-ended-early')).toHaveCount(0);
    // „Nochmal spielen“ hat den Fokus (Enter am PC genügt).
    await expect(page.getByTestId('rematch-button')).toBeFocused();

    await page.evaluate(() => window.__chaosFinale?.stepPodium(150));
    await page.evaluate(
      () =>
        document.querySelector<HTMLCanvasElement>('.finale-podium canvas')?.toDataURL().length ?? 0,
    );
    if (process.env.HOST_FINALE_BELEG) {
      // Ungemaskierter Beleg: HOST_FINALE_BELEG=1 pnpm test:e2e host-finale
      await page.screenshot({
        path: 'docs/screenshots/m4-siegerbildschirm.png',
        animations: 'disabled',
      });
    }
    await expect(page).toHaveScreenshot('host-finale-sieger.png', { mask: finaleMask(page) });
    expectNoProblems(problems, 'Host');
  });

  test('Podest entsteht schon während der Zählung und wird am Siegerbildschirm nur eingehängt (CHAOS-71)', async ({
    page,
  }) => {
    const problems = collectProblems(page);
    await openBoard(page, '&finale=manual');
    await feedResults(page, TIE_ON_TROPHIES);
    const results = page.getByTestId('board-results');
    await expect(results).toHaveAttribute('data-beat', 'intro');
    // Während der Zählung: genau eine Podest-Leinwand, unsichtbar auf dem Parkplatz.
    const parked = page.locator('.finale-parking canvas[aria-label="Siegerpodest"]');
    await expect(parked).toHaveCount(1);
    await expect(parked).toBeHidden();
    // Die Leinwand hat schon ihre Größe (gleiche Fläche wie am Siegerbildschirm).
    const parkedSize = await parked.evaluate((canvas) => [canvas.clientWidth, canvas.clientHeight]);
    expect(parkedSize[0]).toBeGreaterThan(0);
    const firstCanvas = await parked.elementHandle();

    await page.evaluate(() => window.__chaosFinale?.skip());
    await expect(results).toHaveAttribute('data-done', 'true');
    await expect(results).toHaveAttribute('data-podium', 'ready');
    const shown = results.locator('.finale-podium canvas');
    await expect(shown).toHaveCount(1);
    await expect(page.locator('canvas[aria-label="Siegerpodest"]')).toHaveCount(1);
    // Dieselbe Leinwand (kein zweiter Aufbau), gleiche Größe wie auf dem Parkplatz.
    expect(await shown.evaluate((canvas, first) => canvas === first, firstCanvas)).toBe(true);
    expect(await shown.evaluate((canvas) => [canvas.clientWidth, canvas.clientHeight])).toEqual(
      parkedSize,
    );

    // Zurück in die Zählung (nur über den Testhaken möglich): Leinwand parkt wieder, und der
    // Siegerbildschirm zeigt sie danach erneut.
    await page.evaluate(() => window.__chaosFinale?.seek(0));
    await expect(results).toHaveAttribute('data-done', 'false');
    await expect(parked).toHaveCount(1);
    await page.evaluate(() => window.__chaosFinale?.skip());
    await expect(results).toHaveAttribute('data-podium', 'ready');
    await expect(shown).toHaveCount(1);
    await page.evaluate(() => window.__chaosFinale?.stepPodium(5));
    expectNoProblems(problems, 'Host');
  });

  test('vorzeitiges Ende und geteilter Sieg werden benannt', async ({ page }) => {
    await openBoard(page);
    await feedResults(
      page,
      [
        { slot: 1, place: 1, trophies: 1, coins: 8, minigameWins: 1, decidedBy: 'shared' },
        { slot: 2, place: 1, trophies: 1, coins: 8, minigameWins: 1, decidedBy: 'shared' },
        { slot: 3, place: 3, trophies: 0, coins: 5, minigameWins: 0, decidedBy: 'trophies' },
        { slot: 4, place: 4, trophies: 0, coins: 2, minigameWins: 0, decidedBy: 'trophies' },
      ],
      true,
    );
    await expect(page.getByTestId('board-winner')).toHaveText('Blau und Orange gewinnen!');
    await expect(page.getByTestId('finale-reason')).toContainText('geteilt');
    await expect(page.getByTestId('finale-ended-early')).toContainText('Vorzeitig beendet');
    await expect(page.getByTestId('board-rank-2')).toContainText('geteilt');
  });
});
