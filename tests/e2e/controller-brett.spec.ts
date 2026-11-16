import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/test.ts';
import {
  boardInfo,
  FakeSession,
  PROMPTS,
  PROTOCOL_VERSION,
  VALID_CODE,
} from './fixtures/fakeSession.ts';

/**
 * Brettphase am iPhone (CHAOS-22) gegen den Production-Build mit nachgebautem
 * Session-Server (ADR-006). Projekte `iphone-hoch` und `iphone-quer`. Prüft Anzeige
 * je Prompt-Art, die gesendete `choose`-Nachricht, die Sperre nach dem Senden, den
 * Reaktions-Countdown und den Endplatz.
 */

interface Problems {
  consoleErrors: string[];
  pageErrors: string[];
}

let problems: Problems;
let fake: FakeSession;

test.beforeEach(async ({ page }) => {
  problems = { consoleErrors: [], pageErrors: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => problems.pageErrors.push(error.message));
  // Vibration aufzeichnen (Chromium-Emulation hat keinen Motor; iOS-Safari kennt die API nicht).
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __vibrations: unknown[] }).__vibrations = calls;
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: unknown) => {
        calls.push(pattern);
        return true;
      },
    });
  });
  fake = await FakeSession.attach(page);
});

test.afterEach(() => {
  expect(problems.pageErrors).toEqual([]);
  expect(problems.consoleErrors).toEqual([]);
  expect(fake.invalid).toEqual([]);
});

const slot = (page: Page) => page.getByTestId('slot-1');
const choice = (page: Page, option: string) => page.getByTestId(`choice-${option}`);

/** Texte, Glyphen und der laufende Countdown maskiert (ADR-004). */
const screenshotMask = (page: Page) => [
  page.locator('.ui-text, .player-symbol, .ready-check, .countdown, .link-pill'),
];

/**
 * Ungemaskierter Beleg für Abnahmeberichte: `BRETT_BELEG=<ordner> pnpm test:e2e controller-brett`
 * schreibt `<ordner>/m2-controller-<name>-<projekt>.png` (z. B. `docs/screenshots`).
 */
async function beleg(page: Page, name: string, project: string) {
  const dir = process.env.BRETT_BELEG;
  if (!dir) return;
  await page.screenshot({
    path: `${dir}/m2-controller-${name}-${project}.png`,
    animations: 'disabled',
  });
}

async function joinBoard(page: Page) {
  await page.goto(`/?code=${VALID_CODE}`);
  await expect(slot(page)).toHaveAttribute('data-layout', 'lobby');
}

async function expectNoScrollOrZoom(page: Page) {
  const view = await page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    scale: window.visualViewport?.scale ?? 1,
    rootScroll: document.scrollingElement?.scrollTop ?? 0,
  }));
  expect(view).toEqual({ scrollX: 0, scrollY: 0, scale: 1, rootScroll: 0 });
}

/** Alle Wahlknöpfe liegen ganz im Bild und sind groß genug (≥ 56 px). */
async function expectButtonsUsable(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Kein Viewport');
  const boxes = await page.locator('.choice-button').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.w).toBeGreaterThanOrEqual(56);
    expect(box.h).toBeGreaterThanOrEqual(56);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.w).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.y + box.h).toBeLessThanOrEqual(viewport.height + 0.5);
  }
}

const chooses = () => fake.ofType('choose');

test('Wartebildschirm: eigener Stand, wer dran ist, Minispiel, eigener Zug', async ({
  page,
}, testInfo) => {
  await joinBoard(page);
  fake.sendBoard(1, boardInfo({ gamePhase: 'move', activeSlot: 2 }));

  await expect(slot(page)).toHaveAttribute('data-layout', 'board');
  await expect(slot(page)).toHaveAttribute('data-phase', 'board');
  await expect(page.getByTestId('stat-coins')).toContainText('12');
  await expect(page.getByTestId('stat-trophies')).toContainText('1');
  await expect(page.getByTestId('stat-round')).toHaveText('Runde 2/5');
  const items = page.getByTestId('stat-items');
  await expect(items).toContainText('Doppelwürfel');
  await expect(items).toContainText('Falle');
  await expect(items.locator('svg')).toHaveCount(2);

  const waiting = page.getByTestId('board-waiting');
  await expect(waiting).toHaveAttribute('data-kind', 'other-turn');
  await expect(waiting).toContainText('Orange ist dran');
  await expect(waiting).toContainText('Schau auf den großen Bildschirm!');
  await expect(waiting).toContainText('▲');
  await expect(page.getByTestId('prompt')).toHaveCount(0);
  await beleg(page, 'warten', testInfo.project.name);

  fake.sendBoard(1, boardInfo({ gamePhase: 'minigame-play', activeSlot: null }));
  await expect(waiting).toHaveAttribute('data-kind', 'minigame');
  await expect(waiting).toContainText('Minispiel läuft …');

  fake.sendBoard(1, boardInfo({ gamePhase: 'move', activeSlot: 1, items: [] }));
  await expect(waiting).toHaveAttribute('data-kind', 'own-turn');
  await expect(waiting).toContainText('Du bist dran!');
  await expect(items).toContainText('Keine Items');
  await expectNoScrollOrZoom(page);
});

test('Würfeln: großer Knopf und Item-Knöpfe senden choose; Sperre bis zum neuen Prompt', async ({
  page,
}, testInfo) => {
  await joinBoard(page);
  fake.sendBoard(1, boardInfo(), PROMPTS.roll(7));

  const prompt = page.getByTestId('prompt');
  await expect(prompt).toHaveAttribute('data-kind', 'roll');
  await expect(page.getByTestId('prompt-title')).toHaveText('Du bist dran!');
  await expect(choice(page, 'roll')).toContainText('Würfeln!');
  await expect(choice(page, 'item:double-dice')).toContainText('Doppelwürfel');
  await expect(choice(page, 'item:trap')).toContainText('Falle legen');
  await expect(choice(page, 'item:trap').locator('svg[data-icon="trap"]')).toHaveCount(1);
  // Würfeln ist der größte Knopf.
  const roll = await choice(page, 'roll').boundingBox();
  const item = await choice(page, 'item:trap').boundingBox();
  expect(roll?.height).toBeGreaterThan(item?.height ?? Infinity);
  await expectButtonsUsable(page);
  await beleg(page, 'wuerfeln', testInfo.project.name);
  await expect(page).toHaveScreenshot('brett-wuerfeln.png', { mask: screenshotMask(page) });

  await choice(page, 'item:double-dice').tap();
  await expect(prompt).toHaveAttribute('data-locked', 'true');
  await expect(page.getByTestId('choice-sent')).toHaveText('Gesendet … warte kurz');
  await expect(choice(page, 'roll')).toBeDisabled();
  await expect(choice(page, 'item:double-dice')).toHaveAttribute('data-chosen', 'true');
  await beleg(page, 'gesendet', testInfo.project.name);
  // Gesperrt: weiteres Tippen sendet nichts.
  await choice(page, 'roll').tap({ force: true });
  expect(chooses()).toEqual([
    {
      v: PROTOCOL_VERSION,
      type: 'choose',
      slot: 1,
      seq: chooses()[0]?.seq,
      promptId: 7,
      option: 'item:double-dice',
    },
  ]);

  // Derselbe Prompt erneut (z. B. Münzstand geändert): Sperre bleibt.
  fake.sendBoard(1, boardInfo({ coins: 13 }), PROMPTS.roll(7));
  await expect(page.getByTestId('stat-coins')).toContainText('13');
  await expect(prompt).toHaveAttribute('data-locked', 'true');

  // Neuer Prompt: Sperre gelöst, nächste Wahl mit höherer seq.
  fake.sendBoard(1, boardInfo({ items: ['trap'] }), {
    ...PROMPTS.roll(8),
    options: [
      { id: 'roll', label: 'Würfeln!' },
      { id: 'item:trap', label: 'Falle legen' },
    ],
  });
  await expect(prompt).toHaveAttribute('data-prompt-id', '8');
  await expect(prompt).toHaveAttribute('data-locked', 'false');
  await expect(choice(page, 'item:double-dice')).toHaveCount(0);
  await choice(page, 'roll').tap();
  await expect.poll(() => chooses().length).toBe(2);
  const [first, second] = chooses();
  expect(second).toMatchObject({ slot: 1, promptId: 8, option: 'roll' });
  expect(second?.seq).toBeGreaterThan(first?.seq ?? Infinity);
  await expectNoScrollOrZoom(page);
});

test('Pfadwahl: große Wegknöpfe mit Label und Detail', async ({ page }, testInfo) => {
  await joinBoard(page);
  fake.sendBoard(1, boardInfo({ gamePhase: 'choose-path' }), PROMPTS.path(9));

  await expect(page.getByTestId('prompt')).toHaveAttribute('data-kind', 'path');
  await expect(choice(page, 's12')).toContainText('Pilzpfad');
  await expect(choice(page, 's12')).toContainText('links, kurz');
  await expect(choice(page, 's20')).toContainText('Brückenweg');
  await expect(choice(page, 's20')).toContainText('rechts, Münzen');
  await expectButtonsUsable(page);
  await beleg(page, 'pfadwahl', testInfo.project.name);
  await expect(page).toHaveScreenshot('brett-pfadwahl.png', { mask: screenshotMask(page) });

  await choice(page, 's20').tap();
  await expect.poll(() => chooses().length).toBe(1);
  expect(chooses()[0]).toMatchObject({ slot: 1, promptId: 9, option: 's20' });
});

test('Trophäe: Kaufen mit Preis oder Weiter', async ({ page }, testInfo) => {
  await joinBoard(page);
  fake.sendBoard(1, boardInfo({ gamePhase: 'trophy-offer' }), PROMPTS.trophy(10));

  await expect(page.getByTestId('prompt')).toHaveAttribute('data-kind', 'trophy');
  await expect(choice(page, 'buy')).toContainText('Kaufen');
  await expect(choice(page, 'buy')).toContainText('10 Münzen');
  await expect(choice(page, 'skip')).toContainText('Weiter');
  await expectButtonsUsable(page);
  await beleg(page, 'trophaee', testInfo.project.name);

  await choice(page, 'buy').tap();
  await expect.poll(() => chooses().length).toBe(1);
  expect(chooses()[0]).toMatchObject({ promptId: 10, option: 'buy' });
});

test('Ziel: Knöpfe in Farbe und Symbol des Ziel-Spielers, dazu Abbrechen', async ({
  page,
}, testInfo) => {
  await joinBoard(page);
  fake.sendBoard(1, boardInfo({ gamePhase: 'choose-target' }), PROMPTS.target(11));

  await expect(page.getByTestId('prompt')).toHaveAttribute('data-kind', 'target');
  await expect(choice(page, 'slot:2')).toContainText('Orange');
  await expect(choice(page, 'slot:2')).toContainText('▲');
  await expect(choice(page, 'slot:3')).toContainText('■');
  await expect(choice(page, 'slot:2')).toHaveCSS('background-color', 'rgb(230, 159, 0)');
  await expect(choice(page, 'slot:3')).toHaveCSS('background-color', 'rgb(0, 158, 115)');
  await expect(choice(page, 'cancel')).toContainText('Abbrechen');
  await expectButtonsUsable(page);
  await beleg(page, 'ziel', testInfo.project.name);

  await choice(page, 'slot:3').tap();
  await expect.poll(() => chooses().length).toBe(1);
  expect(chooses()[0]).toMatchObject({ promptId: 11, option: 'slot:3' });
});

test('Reaktion: pulsierender Vollbild-Knopf, Countdown zählt herunter, Vibration', async ({
  page,
}, testInfo) => {
  await joinBoard(page);
  fake.sendBoard(1, boardInfo({ gamePhase: 'reaction-window', activeSlot: 2 }), {
    ...PROMPTS.reaction(12, 1, 8000),
  });

  const prompt = page.getByTestId('prompt');
  await expect(prompt).toHaveAttribute('data-kind', 'reaction');
  await expect(choice(page, 'shield')).toContainText('Schild!');
  await expect(choice(page, 'brace')).toContainText('Festhalten!');
  await expect(choice(page, 'shield')).toHaveCSS('animation-name', 'reaction-pulse');

  // Die Knöpfe füllen den größten Teil des Bildschirms.
  const viewport = page.viewportSize();
  const boxes = await Promise.all(['shield', 'brace'].map((id) => choice(page, id).boundingBox()));
  const area = boxes.reduce((sum, box) => sum + (box ? box.width * box.height : 0), 0);
  expect(area).toBeGreaterThan(0.3 * (viewport?.width ?? 0) * (viewport?.height ?? 0));
  await expectButtonsUsable(page);

  // Countdown: lokal heruntergezählt aus remainingMs.
  const countdown = page.getByTestId('countdown');
  await expect(countdown).toBeVisible();
  const remaining = async () => Number(await countdown.getAttribute('data-remaining-ms'));
  const before = await remaining();
  expect(before).toBeLessThanOrEqual(8000);
  await expect.poll(remaining).toBeLessThan(before - 300);
  await expect(countdown.locator('.countdown-seconds')).toHaveText(/^[1-8]$/);

  const vibrations = await page.evaluate(
    () => (window as unknown as { __vibrations: unknown[] }).__vibrations,
  );
  expect(vibrations.length).toBe(1);

  await beleg(page, 'reaktion', testInfo.project.name);
  await expect(page).toHaveScreenshot('brett-reaktion.png', { mask: screenshotMask(page) });

  // Reaktion zählt schon beim Aufsetzen des Fingers.
  await choice(page, 'brace').dispatchEvent('pointerdown', {
    pointerType: 'touch',
    isPrimary: true,
  });
  await expect.poll(() => chooses().length).toBe(1);
  expect(chooses()[0]).toMatchObject({ promptId: 12, option: 'brace' });
  await expect(prompt).toHaveAttribute('data-locked', 'true');
});

test('invalid-choice: freundlicher Hinweis, Sperre gelöst, neue Wahl möglich', async ({ page }) => {
  await joinBoard(page);
  fake.onChoose = (message) => {
    if (fake.ofType('choose').length === 1) {
      fake.sendError('invalid-choice', 'Prompt veraltet', message.seq);
    }
  };
  fake.sendBoard(1, boardInfo({ gamePhase: 'trophy-offer' }), PROMPTS.trophy(13));

  await choice(page, 'buy').tap();
  await expect(page.getByTestId('toast')).toHaveText(
    'Zu spät – die Entscheidung ist schon gefallen.',
  );
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-locked', 'false');
  await expect(page.getByTestId('choice-sent')).toHaveCount(0);
  await expect(choice(page, 'skip')).toBeEnabled();

  await choice(page, 'skip').tap();
  await expect.poll(() => chooses().length).toBe(2);
  expect(chooses().map((c) => c.option)).toEqual(['buy', 'skip']);
});

test('Spielende: eigener Platz groß', async ({ page }, testInfo) => {
  await joinBoard(page);
  fake.sendBoard(1, boardInfo({ gamePhase: 'game-results', activeSlot: null, place: 2 }));

  const place = page.getByTestId('final-place');
  await expect(place).toHaveAttribute('data-place', '2');
  await expect(place).toHaveText('Platz 2');
  await expect(page.getByTestId('final-headline')).toHaveText('Gut gespielt!');
  const box = await place.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(80);
  await beleg(page, 'endstand', testInfo.project.name);

  fake.sendBoard(1, boardInfo({ gamePhase: 'game-results', activeSlot: null, place: 1 }));
  await expect(place).toHaveText('Platz 1');
  await expect(page.getByTestId('final-headline')).toHaveText('Du hast gewonnen!');
});

test('Wiederverbinden mitten in der Wahl: Sperre gelöst, Prompt wieder da', async ({ page }) => {
  await joinBoard(page);
  fake.sendBoard(1, boardInfo({ gamePhase: 'choose-path' }), PROMPTS.path(14));
  await choice(page, 's12').tap();
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-locked', 'true');

  await fake.drop();
  // Nach dem automatischen Reconnect schickt der Server denselben Prompt erneut.
  await expect.poll(() => fake.connections).toBe(2);
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-locked', 'false');
  await expect(page.getByTestId('prompt')).toHaveAttribute('data-prompt-id', '14');
  await choice(page, 's20').tap();
  await expect.poll(() => chooses().length).toBe(2);
  expect(chooses()[1]).toMatchObject({ promptId: 14, option: 's20' });
});
