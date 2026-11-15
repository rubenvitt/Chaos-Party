import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/test.ts';
import { boardInfo, FakeSession, PROMPTS, VALID_CODE } from './fixtures/fakeSession.ts';
import { centerOf, TouchScreen } from './fixtures/touch.ts';

/**
 * Brettphase am geteilten iPad (CHAOS-22, ADR-008) mit nachgebautem Session-Server.
 * Projekte `ipad-quer` und `ipad-hoch` (oben gedrehte Zone). Die Wahlknöpfe hängen am
 * Zonen-Tracker: Ein Finger gehört der Zone, in der er aufsetzt; gewählt wird beim
 * Abheben auf dem eigenen Knopf (Reaktion: schon beim Aufsetzen). Mehrfinger per CDP
 * beweist **kein** iPadOS-Multitouch (Gerätetest).
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
  fake = await FakeSession.attach(page);
});

test.afterEach(() => {
  expect(problems.pageErrors).toEqual([]);
  expect(problems.consoleErrors).toEqual([]);
  expect(fake.invalid).toEqual([]);
});

const zone = (page: Page, slot: number) => page.getByTestId(`zone-${String(slot)}`);
const choiceIn = (page: Page, slot: number, option: string) =>
  zone(page, slot).getByTestId(`choice-${option}`);
const chooses = () => fake.ofType('choose');

const screenshotMask = (page: Page) => [
  page.locator('.ui-text, .player-symbol, .ready-check, .countdown, .link-pill'),
];

/** Zwei Zonen beitreten, dann Zone 1 Pfadwahl, Zone 2 Würfeln (zwei Prompts gleichzeitig). */
async function joinTwoPrompts(page: Page) {
  await page.goto(`/?code=${VALID_CODE}&seats=2`);
  await expect(zone(page, 1)).toHaveAttribute('data-layout', 'lobby');
  await expect(zone(page, 2)).toHaveAttribute('data-layout', 'lobby');
  fake.sendBoard(1, boardInfo({ gamePhase: 'choose-path', activeSlot: 1 }), PROMPTS.path(21, 1));
  fake.sendBoard(
    2,
    boardInfo({ gamePhase: 'roll', activeSlot: 1, coins: 7, trophies: 0, items: ['shield'] }),
    PROMPTS.roll(22, 2),
  );
  await expect(zone(page, 1).getByTestId('prompt')).toHaveAttribute('data-kind', 'path');
  await expect(zone(page, 2).getByTestId('prompt')).toHaveAttribute('data-kind', 'roll');
}

test('zwei Zonen mit verschiedenen Prompts und eigenem Stand', async ({ page }, testInfo) => {
  await joinTwoPrompts(page);

  await expect(zone(page, 1)).toHaveAttribute('data-layout', 'board');
  await expect(choiceIn(page, 1, 's12')).toContainText('Pilzpfad');
  await expect(choiceIn(page, 1, 's20')).toContainText('rechts, Münzen');
  await expect(choiceIn(page, 1, 'roll')).toHaveCount(0);
  await expect(choiceIn(page, 2, 'roll')).toContainText('Würfeln!');
  await expect(choiceIn(page, 2, 'item:trap')).toBeVisible();
  await expect(zone(page, 1).getByTestId('stat-coins')).toContainText('12');
  await expect(zone(page, 2).getByTestId('stat-coins')).toContainText('7');
  await expect(zone(page, 2).locator('[data-item="shield"]')).toHaveCount(1);

  // Alle Wahlknöpfe ≥ 56 px und ganz in ihrer Zone.
  for (const slot of [1, 2]) {
    const zoneBox = await zone(page, slot).boundingBox();
    if (!zoneBox) throw new Error('Zone unsichtbar');
    for (const button of await zone(page, slot).locator('[data-role="choice"]').all()) {
      const box = await button.boundingBox();
      if (!box) throw new Error('Knopf unsichtbar');
      expect(box.width).toBeGreaterThanOrEqual(56);
      expect(box.height).toBeGreaterThanOrEqual(56);
      expect(box.x).toBeGreaterThanOrEqual(zoneBox.x);
      expect(box.y).toBeGreaterThanOrEqual(zoneBox.y);
      expect(box.x + box.width).toBeLessThanOrEqual(zoneBox.x + zoneBox.width + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(zoneBox.y + zoneBox.height + 0.5);
    }
  }

  if (testInfo.project.name === 'ipad-hoch') {
    await expect(zone(page, 2)).toHaveAttribute('data-rotation', '180');
  }
  const dir = process.env.BRETT_BELEG;
  if (dir) {
    await page.screenshot({
      path: `${dir}/m2-ipad-brett-${testInfo.project.name}.png`,
      animations: 'disabled',
    });
  }
  await expect(page).toHaveScreenshot('ipad-brett.png', { mask: screenshotMask(page) });
});

test('gleichzeitige Finger in zwei Zonen wählen je für den richtigen Slot', async ({ page }) => {
  await joinTwoPrompts(page);
  const touch = await TouchScreen.create(page);

  // Beide Finger liegen gleichzeitig, dann heben beide zusammen ab.
  await touch.down(1, await centerOf(choiceIn(page, 1, 's20')));
  await touch.down(2, await centerOf(choiceIn(page, 2, 'roll')));
  await expect(choiceIn(page, 1, 's20')).toHaveAttribute('data-pressed', 'true');
  await expect(choiceIn(page, 2, 'roll')).toHaveAttribute('data-pressed', 'true');
  expect(chooses()).toEqual([]);
  await touch.upAll();

  await expect.poll(() => chooses().length).toBe(2);
  const bySlot = Object.fromEntries(chooses().map((c) => [c.slot, c]));
  expect(bySlot[1]).toMatchObject({ slot: 1, promptId: 21, option: 's20' });
  expect(bySlot[2]).toMatchObject({ slot: 2, promptId: 22, option: 'roll' });
  // seq steigt über beide Slots einer Verbindung.
  const [a, b] = chooses();
  expect(b?.seq).toBeGreaterThan(a?.seq ?? Infinity);

  // Jede Zone ist für sich gesperrt.
  await expect(zone(page, 1).getByTestId('prompt')).toHaveAttribute('data-locked', 'true');
  await expect(zone(page, 2).getByTestId('prompt')).toHaveAttribute('data-locked', 'true');
  await expect(zone(page, 1).locator('.zone-prompt-title')).toHaveText('Gesendet … warte kurz');
  await touch.tap(await centerOf(choiceIn(page, 1, 's12')));
  await expect.poll(() => chooses().length).toBe(2);
});

test('ein Finger aus Zone 1 löst keine Knöpfe in Zone 2 aus', async ({ page }) => {
  await joinTwoPrompts(page);
  const touch = await TouchScreen.create(page);
  const roll2 = await centerOf(choiceIn(page, 2, 'roll'));

  // Aufsetzen auf einem Knopf in Zone 1, über die Grenze auf „Würfeln!“ in Zone 2 ziehen.
  await touch.down(1, await centerOf(choiceIn(page, 1, 's12')));
  await touch.move(1, roll2);
  await expect(choiceIn(page, 2, 'roll')).toHaveAttribute('data-pressed', 'false');
  await touch.up(1);

  // Aufsetzen neben allen Knöpfen in Zone 1 (Statuszeile), dann auf Zone 2 abheben.
  await touch.down(1, await centerOf(zone(page, 1).getByTestId('board-status')));
  await touch.move(1, roll2);
  await touch.up(1);

  // Weggerutscht = keine Wahl, und Zone 2 hat nie etwas bekommen.
  await page.waitForTimeout(150);
  expect(chooses()).toEqual([]);
  await expect(zone(page, 1).getByTestId('prompt')).toHaveAttribute('data-locked', 'false');
  await expect(zone(page, 2).getByTestId('prompt')).toHaveAttribute('data-locked', 'false');

  // Danach funktioniert ein normaler Tipp in Zone 2.
  await touch.tap(roll2);
  await expect.poll(() => chooses().length).toBe(1);
  expect(chooses()[0]).toMatchObject({ slot: 2, option: 'roll', promptId: 22 });
});

test('Reaktion in Zone 2 wählt sofort, während Zone 1 einen Knopf hält', async ({ page }) => {
  await joinTwoPrompts(page);
  fake.sendBoard(
    2,
    boardInfo({ gamePhase: 'reaction-window', activeSlot: 1, items: ['shield'] }),
    PROMPTS.reaction(23, 2, 8000),
  );
  await expect(zone(page, 2).getByTestId('prompt')).toHaveAttribute('data-kind', 'reaction');
  await expect(zone(page, 2).getByTestId('countdown')).toBeVisible();
  const touch = await TouchScreen.create(page);

  await touch.down(1, await centerOf(choiceIn(page, 1, 's12')));
  await touch.down(2, await centerOf(choiceIn(page, 2, 'shield')));
  // Reaktion zählt beim Aufsetzen – Zone 1 hat noch nicht gewählt.
  await expect.poll(() => chooses().length).toBe(1);
  expect(chooses()[0]).toMatchObject({ slot: 2, promptId: 23, option: 'shield' });

  await touch.upAll();
  await expect.poll(() => chooses().length).toBe(2);
  expect(chooses()[1]).toMatchObject({ slot: 1, promptId: 21, option: 's12' });
});

test('Warten und Endstand je Zone; neuer Prompt löst die Sperre der Zone', async ({ page }) => {
  await joinTwoPrompts(page);
  const touch = await TouchScreen.create(page);
  await touch.tap(await centerOf(choiceIn(page, 2, 'roll')));
  await expect(zone(page, 2).getByTestId('prompt')).toHaveAttribute('data-locked', 'true');

  // Zone 2 wartet jetzt, Blau (Zone 1) ist dran.
  fake.sendBoard(2, boardInfo({ gamePhase: 'move', activeSlot: 1 }));
  await expect(zone(page, 2).getByTestId('board-waiting')).toContainText('Blau ist dran');
  await expect(zone(page, 2).getByTestId('prompt')).toHaveCount(0);

  // Neuer Prompt für Zone 2: wieder wählbar.
  fake.sendBoard(2, boardInfo({ gamePhase: 'trophy-offer', activeSlot: 2 }), PROMPTS.trophy(24, 2));
  await expect(zone(page, 2).getByTestId('prompt')).toHaveAttribute('data-locked', 'false');
  await touch.tap(await centerOf(choiceIn(page, 2, 'skip')));
  await expect.poll(() => chooses().length).toBe(2);
  expect(chooses()[1]).toMatchObject({ slot: 2, promptId: 24, option: 'skip' });

  fake.sendBoard(1, boardInfo({ gamePhase: 'game-results', activeSlot: null, place: 1 }));
  fake.sendBoard(2, boardInfo({ gamePhase: 'game-results', activeSlot: null, place: 2 }));
  await expect(zone(page, 1).getByTestId('final-place')).toHaveText('Platz 1');
  await expect(zone(page, 2).getByTestId('final-place')).toHaveText('Platz 2');
});
