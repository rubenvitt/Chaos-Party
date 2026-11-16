import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/test.ts';
import { FakeSession, FAKE_TOKEN, PROTOCOL_VERSION, VALID_CODE } from './fixtures/fakeSession.ts';
import { centerOf, TouchScreen } from './fixtures/touch.ts';

/**
 * Geteiltes iPad (CHAOS-13, ADR-008) gegen den Production-Build mit nachgebautem
 * Session-Server. Projekte `ipad-quer` und `ipad-hoch` (iPad-Pro-11-Emulation in
 * Chromium). Die Mehrfinger-Ereignisse kommen per CDP (`Input.dispatchTouchEvent`);
 * das beweist **nicht**, dass iPadOS-Safari mehrere Finger genauso meldet
 * (A1–A3 bleiben Gerätetest, `docs/device-test-checklist.md`).
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

/** Texte und Glyphen maskieren: Schriften unterscheiden sich zwischen Rechnern (ADR-004). */
const textMask = (page: Page) => [page.locator('.ui-text, .player-symbol, .ready-check')];

async function joinLobby(page: Page, seats = 2) {
  await page.goto(`/?code=${VALID_CODE}&seats=${String(seats)}`);
  for (let slot = 1; slot <= seats; slot++) {
    await expect(zone(page, slot)).toHaveAttribute('data-layout', 'lobby');
  }
}

async function tapIn(page: Page, touch: TouchScreen, slot: number, testId: string, id = 1) {
  await touch.tap(await centerOf(zone(page, slot).getByTestId(testId)), id);
}

async function joinAndPlay(page: Page, touch: TouchScreen, seats = 2) {
  await joinLobby(page, seats);
  for (let slot = 1; slot <= seats; slot++) await tapIn(page, touch, slot, 'ready-button');
  for (let slot = 1; slot <= seats; slot++) {
    await expect(zone(page, slot)).toHaveAttribute('data-layout', 'joystick-buttons');
  }
}

async function expectNoScrollOrZoom(page: Page) {
  const view = await page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    scale: window.visualViewport?.scale ?? 1,
  }));
  expect(view).toEqual({ scrollX: 0, scrollY: 0, scale: 1 });
}

/** Letzte move-Nachricht eines Slots. */
const lastMove = (slot: number) =>
  fake
    .ofType('move')
    .filter((m) => m.slot === slot)
    .at(-1);

test('zwei Zonen über eine Verbindung: Lobby je Zone, dann Spiel-Layout', async ({
  page,
}, testInfo) => {
  const touch = await TouchScreen.create(page);
  await joinLobby(page);

  // Eine Verbindung, zwei Plätze (A9).
  expect(fake.handshakes).toEqual([
    { v: PROTOCOL_VERSION, type: 'join', joinCode: VALID_CODE, seats: 2 },
  ]);
  expect(fake.connections).toBe(1);
  await expect(zone(page, 1).getByTestId('player-badge')).toContainText('Blau');
  await expect(zone(page, 2).getByTestId('player-badge')).toContainText('Orange');
  await expect(zone(page, 2).getByTestId('player-badge')).toContainText('▲');

  const portrait = testInfo.project.name === 'ipad-hoch';
  await expect(page.getByTestId('zone-board')).toHaveAttribute(
    'data-orientation',
    portrait ? 'portrait' : 'landscape',
  );
  // Hochformat: Person oben sitzt gegenüber → Zone 2 um 180° gedreht.
  await expect(zone(page, 2)).toHaveAttribute('data-rotation', portrait ? '180' : '0');
  await expect(zone(page, 1)).toHaveAttribute('data-rotation', '0');

  // Zonen getrennt, jede groß genug.
  const [box1, box2] = [await zone(page, 1).boundingBox(), await zone(page, 2).boundingBox()];
  if (!box1 || !box2) throw new Error('Zonen nicht sichtbar');
  if (portrait) expect(box2.y + box2.height).toBeLessThan(box1.y);
  else expect(box1.x + box1.width).toBeLessThan(box2.x);
  for (const slot of [1, 2]) {
    const ready = await zone(page, slot).getByTestId('ready-button').boundingBox();
    // Unter den Figurenkarten (CHAOS-36): immer noch weit über 44 pt.
    expect(ready?.height).toBeGreaterThanOrEqual(72);
  }

  // Beide gleichzeitig auf „Bereit!“: zwei Finger, zwei Zonen.
  await touch.down(1, await centerOf(zone(page, 1).getByTestId('ready-button')));
  await touch.down(2, await centerOf(zone(page, 2).getByTestId('ready-button')));
  await expect(zone(page, 1).getByTestId('ready-button')).toHaveAttribute('data-pressed', 'true');
  await expect(zone(page, 2).getByTestId('ready-button')).toHaveAttribute('data-pressed', 'true');
  await touch.lift(2);
  await expect.poll(() => fake.ofType('ready').map((m) => m.slot)).toEqual([2]);
  await expect(zone(page, 2)).toHaveAttribute('data-layout', 'wait');
  await expect(zone(page, 1)).toHaveAttribute('data-layout', 'lobby');
  await touch.lift(1);
  await expect.poll(() => fake.ofType('ready').map((m) => m.slot)).toEqual([2, 1]);

  for (const slot of [1, 2]) {
    await expect(zone(page, slot)).toHaveAttribute('data-layout', 'joystick-buttons');
    for (const id of ['joystick', 'button-a', 'button-b']) {
      const box = await zone(page, slot).getByTestId(id).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(76);
      expect(box?.height).toBeGreaterThanOrEqual(76);
    }
  }

  if (process.env.CONTROLLER_BELEG) {
    await page.screenshot({
      path: portrait
        ? 'docs/screenshots/m1-ipad-2-zonen-hoch.png'
        : 'docs/screenshots/m1-ipad-2-zonen.png',
      animations: 'disabled',
    });
  }
  await expect(page).toHaveScreenshot('ipad-2-zonen-spiel.png', { mask: textMask(page) });
  await expectNoScrollOrZoom(page);
});

test('gleichzeitig: Joystick in Zone 1 und A in Zone 2 kommen mit richtigem Slot an', async ({
  page,
}) => {
  const touch = await TouchScreen.create(page);
  await joinAndPlay(page, touch);
  const stick1 = zone(page, 1).getByTestId('joystick');
  const start = await centerOf(stick1);
  const rotation1 = Number(await zone(page, 1).getAttribute('data-rotation'));
  expect(rotation1).toBe(0);

  // Finger 1 hält den Joystick von Zone 1, Finger 2 drückt A in Zone 2.
  await touch.down(1, start);
  await touch.move(1, { x: start.x + 50, y: start.y }, 6);
  await touch.down(2, await centerOf(zone(page, 2).getByTestId('button-a')));
  await expect(zone(page, 2).getByTestId('button-a')).toHaveAttribute('data-pressed', 'true');
  await expect(stick1).toHaveAttribute('data-active', 'true');
  await expect
    .poll(() => fake.ofType('press'))
    .toEqual([expect.objectContaining({ slot: 2, button: 'a' })]);
  await expect.poll(() => lastMove(1)?.x ?? 0).toBeGreaterThan(0.4);

  // Finger 2 hebt ab, Finger 1 bewegt weiter (jetzt nach oben = vorn).
  await touch.lift(2);
  await expect
    .poll(() => fake.ofType('release'))
    .toEqual([expect.objectContaining({ slot: 2, button: 'a' })]);
  await expect(zone(page, 2).getByTestId('button-a')).toHaveAttribute('data-pressed', 'false');
  await touch.move(1, { x: start.x, y: start.y - 60 }, 6);
  await expect.poll(() => lastMove(1)?.y ?? 0).toBeGreaterThan(0.4);
  expect(lastMove(1)?.x).toBeLessThan(0.2);
  await expect(stick1).toHaveAttribute('data-active', 'true');

  // System bricht ab (touchcancel): Joystick meldet sofort {0, 0}.
  await touch.cancelAll();
  await expect.poll(() => lastMove(1)).toMatchObject({ x: 0, y: 0 });
  await expect(stick1).toHaveAttribute('data-active', 'false');

  // Zone 2 hat nie Bewegungen gesendet, Zone 1 nie Knöpfe.
  expect(fake.ofType('move').every((m) => m.slot === 1)).toBe(true);
  expect(fake.ofType('press').every((m) => m.slot === 2)).toBe(true);
  // seq steigt streng über beide Slots (eine Verbindung).
  const seqs = fake.intents().map((m) => m.seq);
  for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1] ?? -1);
  await expectNoScrollOrZoom(page);
});

test('touchcancel beim Halten von Knopf und Joystick: release und {0,0}', async ({ page }) => {
  const touch = await TouchScreen.create(page);
  await joinAndPlay(page, touch);
  const stick2 = await centerOf(zone(page, 2).getByTestId('joystick'));
  await touch.down(1, await centerOf(zone(page, 1).getByTestId('button-b')));
  await touch.down(2, stick2);
  await touch.move(2, { x: stick2.x - 60, y: stick2.y }, 4);
  await expect.poll(() => fake.ofType('press')).toHaveLength(1);
  await expect.poll(() => Math.abs(lastMove(2)?.x ?? 0)).toBeGreaterThan(0.4);

  await touch.cancelAll();
  await expect
    .poll(() => fake.ofType('release'))
    .toEqual([expect.objectContaining({ slot: 1, button: 'b' })]);
  await expect.poll(() => lastMove(2)).toMatchObject({ x: 0, y: 0 });
  await expect(zone(page, 1).getByTestId('button-b')).toHaveAttribute('data-pressed', 'false');
});

test('Finger rutscht über die Zonengrenze: bleibt bei seiner Zone', async ({ page }) => {
  const touch = await TouchScreen.create(page);
  await joinAndPlay(page, touch);
  const start = await centerOf(zone(page, 1).getByTestId('joystick'));
  const otherA = await centerOf(zone(page, 2).getByTestId('button-a'));

  await touch.down(1, start);
  await touch.move(1, otherA, 10);
  await expect.poll(() => lastMove(1)).toBeDefined();
  // Über A von Zone 2 gerutscht, aber nichts gedrückt; Zone 2 bewegt sich nicht.
  await expect(zone(page, 2).getByTestId('button-a')).toHaveAttribute('data-pressed', 'false');
  expect(fake.ofType('press')).toEqual([]);
  expect(lastMove(2)).toBeUndefined();

  // Ein zweiter Finger auf demselben A drückt ganz normal für Zone 2.
  await touch.down(2, otherA);
  await expect
    .poll(() => fake.ofType('press'))
    .toEqual([expect.objectContaining({ slot: 2, button: 'a' })]);
  await touch.upAll();
  await expect.poll(() => lastMove(1)).toMatchObject({ x: 0, y: 0 });
  await expect.poll(() => fake.ofType('release')).toHaveLength(1);
});

test('gedrehte Zone: Richtungen gelten aus Sicht der Person an dieser Kante', async ({ page }) => {
  const touch = await TouchScreen.create(page);
  await joinAndPlay(page, touch);
  const rotation = Number(await zone(page, 2).getAttribute('data-rotation'));
  const start = await centerOf(zone(page, 2).getByTestId('joystick'));
  // Für die Person gegenüber (180°) ist „vorn“ auf dem Bildschirm unten.
  const forward = rotation === 180 ? 70 : -70;
  await touch.down(1, start);
  await touch.move(1, { x: start.x, y: start.y + forward }, 6);
  await expect.poll(() => lastMove(2)?.y ?? 0).toBeGreaterThan(0.5);
  expect(Math.abs(lastMove(2)?.x ?? 1)).toBeLessThan(0.1);
  await touch.up(1);
  await expect.poll(() => lastMove(2)).toMatchObject({ x: 0, y: 0 });
});

test('Drehen des iPads mitten im Spiel: Zonen neu angeordnet, gehaltene Eingaben losgelassen', async ({
  page,
}) => {
  const touch = await TouchScreen.create(page);
  await joinAndPlay(page, touch);
  const board = page.getByTestId('zone-board');
  const before = await board.getAttribute('data-orientation');
  const start = await centerOf(zone(page, 1).getByTestId('joystick'));
  await touch.down(1, start);
  await touch.move(1, { x: start.x + 60, y: start.y }, 4);
  await touch.down(2, await centerOf(zone(page, 2).getByTestId('button-a')));
  await expect.poll(() => fake.ofType('press')).toHaveLength(1);
  await expect.poll(() => lastMove(1)?.x ?? 0).toBeGreaterThan(0.4);

  const size = page.viewportSize();
  if (!size) throw new Error('kein Viewport');
  await page.setViewportSize({ width: size.height, height: size.width });
  await expect(board).not.toHaveAttribute('data-orientation', before ?? '');
  await expect.poll(() => lastMove(1)).toMatchObject({ x: 0, y: 0 });
  await expect
    .poll(() => fake.ofType('release'))
    .toEqual([expect.objectContaining({ slot: 2, button: 'a' })]);

  // Die alten Finger sind stillgelegt: Weiterziehen sendet nichts.
  const moves = fake.ofType('move').length;
  await touch.move(1, { x: start.x - 80, y: start.y }, 4);
  expect(fake.ofType('move').length).toBe(moves);
  await touch.upAll();

  // Neue Berührungen nutzen die neue Lage.
  await touch.tap(await centerOf(zone(page, 2).getByTestId('button-b')));
  await expect.poll(() => fake.ofType('press').at(-1)).toMatchObject({ slot: 2, button: 'b' });
  await expectNoScrollOrZoom(page);
});

test('vier Zonen: 2×2, obere Reihe gedreht, vier Finger gleichzeitig getrennt', async ({
  page,
}, testInfo) => {
  const touch = await TouchScreen.create(page);
  await joinAndPlay(page, touch, 4);
  expect(fake.handshakes[0]).toMatchObject({ type: 'join', seats: 4 });
  if (process.env.CONTROLLER_BELEG && testInfo.project.name === 'ipad-quer') {
    await page.screenshot({ path: 'docs/screenshots/m1-ipad-4-zonen.png', animations: 'disabled' });
  }
  for (const [slot, rotation] of [
    [1, '0'],
    [2, '0'],
    [3, '180'],
    [4, '180'],
  ] as const) {
    await expect(zone(page, slot)).toHaveAttribute('data-rotation', rotation);
  }
  for (const slot of [1, 2, 3, 4]) {
    await touch.down(slot, await centerOf(zone(page, slot).getByTestId('button-a')));
  }
  await expect
    .poll(() =>
      fake
        .ofType('press')
        .map((m) => m.slot)
        .sort(),
    )
    .toEqual([1, 2, 3, 4]);
  await touch.upAll();
  await expect.poll(() => fake.ofType('release')).toHaveLength(4);
});

test('Code-Eingabe bietet iPhone/iPad an; iPad tritt mit seats 2 bei, Neuladen per reconnect', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('code-entry')).toBeVisible();
  await expect(page.getByTestId('mode-phone')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('mode-ipad').tap();
  await expect(page.getByTestId('mode-ipad')).toHaveAttribute('aria-pressed', 'true');
  expect(new URL(page.url()).searchParams.get('seats')).toBe('2');

  await page.getByTestId('code-input').pressSequentially('abcd');
  await expect(zone(page, 2)).toHaveAttribute('data-layout', 'lobby');
  expect(fake.handshakes).toEqual([
    { v: PROTOCOL_VERSION, type: 'join', joinCode: VALID_CODE, seats: 2 },
  ]);

  await page.reload();
  await expect(zone(page, 1)).toHaveAttribute('data-layout', 'lobby');
  await expect(zone(page, 2)).toHaveAttribute('data-layout', 'lobby');
  expect(fake.handshakes.at(-1)).toEqual({
    v: PROTOCOL_VERSION,
    type: 'reconnect',
    sessionToken: FAKE_TOKEN,
  });
});
