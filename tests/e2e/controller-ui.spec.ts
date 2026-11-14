import { expect, test, type Page } from '@playwright/test';
import { FakeSession, FAKE_TOKEN, VALID_CODE } from './fixtures/fakeSession.ts';
import { centerOf, TouchScreen } from './fixtures/touch.ts';

/**
 * iPhone-Controller (CHAOS-10) gegen den Production-Build, mit nachgebautem
 * Session-Server (ADR-006). Läuft in den Projekten `iphone-hoch` und `iphone-quer`.
 */

interface Problems {
  consoleErrors: string[];
  pageErrors: string[];
}

function collectProblems(page: Page): Problems {
  const problems: Problems = { consoleErrors: [], pageErrors: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => problems.pageErrors.push(error.message));
  return problems;
}

let problems: Problems;
let fake: FakeSession;

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
  fake = await FakeSession.attach(page);
});

test.afterEach(() => {
  expect(problems.pageErrors).toEqual([]);
  expect(problems.consoleErrors).toEqual([]);
  expect(fake.invalid).toEqual([]);
});

const slot = (page: Page) => page.getByTestId('slot-1');

async function joinLobby(page: Page) {
  await page.goto(`/?code=${VALID_CODE}`);
  await expect(slot(page)).toHaveAttribute('data-layout', 'lobby');
}

async function joinAndPlay(page: Page) {
  await joinLobby(page);
  await page.getByTestId('ready-button').tap();
  await expect(slot(page)).toHaveAttribute('data-layout', 'joystick-buttons');
}

/** Seite hat weder gescrollt noch gezoomt. */
async function expectNoScrollOrZoom(page: Page) {
  const view = await page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    scale: window.visualViewport?.scale ?? 1,
    rootScroll: document.scrollingElement?.scrollTop ?? 0,
  }));
  expect(view).toEqual({ scrollX: 0, scrollY: 0, scale: 1, rootScroll: 0 });
}

/** Texte und Glyphen maskieren: Schriften unterscheiden sich zwischen Rechnern (ADR-004). */
const textMask = (page: Page) => [page.locator('.ui-text, .player-symbol, .ready-check')];

test('tritt per ?code= bei, zeigt die Lobby und nach „Bereit!“ das Spiel-Layout', async ({
  page,
}, testInfo) => {
  await joinLobby(page);

  expect(fake.handshakes).toEqual([{ v: 1, type: 'join', joinCode: VALID_CODE, seats: 1 }]);
  await expect(page.getByTestId('player-badge')).toContainText('Blau');
  await expect(page.getByTestId('player-badge')).toContainText('●');
  await expect(page.getByTestId('ready-button')).toBeVisible();
  // Große Ziele (≥ 64 px).
  const readyBox = await page.getByTestId('ready-button').boundingBox();
  expect(readyBox?.height).toBeGreaterThanOrEqual(64);

  if (process.env.CONTROLLER_BELEG && testInfo.project.name === 'iphone-hoch') {
    await page.screenshot({
      path: 'docs/screenshots/m1-controller-lobby.png',
      animations: 'disabled',
    });
  }
  await expect(page).toHaveScreenshot('controller-lobby.png', { mask: textMask(page) });

  await page.getByTestId('ready-button').tap();
  await expect(slot(page)).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect(slot(page)).toHaveAttribute('data-phase', 'play');
  expect(fake.ofType('ready')).toEqual([{ v: 1, type: 'ready', slot: 1, seq: 1 }]);

  for (const id of ['joystick', 'button-a', 'button-b']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(64);
    expect(box?.height).toBeGreaterThanOrEqual(64);
  }

  if (process.env.CONTROLLER_BELEG && testInfo.project.name === 'iphone-quer') {
    await page.screenshot({
      path: 'docs/screenshots/m1-controller-play-landscape.png',
      animations: 'disabled',
    });
  }
  await expect(page).toHaveScreenshot('controller-play.png', { mask: textMask(page) });
  await expectNoScrollOrZoom(page);
});

test('ohne Code: Code-Eingabe, falscher Code wird erklärt, richtiger Code verbindet', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByTestId('code-input');
  await expect(page.getByTestId('code-entry')).toBeVisible();
  await expect(input).toBeFocused();
  // iOS zoomt bei Schrift < 16 px in fokussierte Felder.
  const fontSize = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);

  await input.pressSequentially('zz-zz');
  await expect(page.getByTestId('code-error')).toContainText('Diesen Code gibt es nicht');
  expect(fake.handshakes[0]).toMatchObject({ type: 'join', joinCode: 'ZZZZ' });

  await page.getByTestId('code-input').pressSequentially('abcd');
  await expect(slot(page)).toHaveAttribute('data-layout', 'lobby');
  expect(fake.handshakes[1]).toEqual({ v: 1, type: 'join', joinCode: VALID_CODE, seats: 1 });
  expect(new URL(page.url()).searchParams.get('code')).toBe(VALID_CODE);

  // Ungültiger Code in der URL führt ebenfalls zur Eingabe, ohne Verbindung.
  const before = fake.connections;
  await page.goto('/?code=no!');
  await expect(page.getByTestId('code-entry')).toBeVisible();
  expect(fake.connections).toBe(before);
});

test('Joystick: Ziehen sendet move mit plausiblem Vektor, Loslassen sofort {0,0}', async ({
  page,
}) => {
  await joinAndPlay(page);
  const touch = await TouchScreen.create(page);
  const start = await centerOf(page.getByTestId('joystick'));

  await touch.down(1, start);
  // Nach rechts oben ziehen: oben auf dem Bildschirm = vorn = positives y.
  await touch.move(1, { x: start.x + 45, y: start.y - 45 }, 12);
  await expect(page.getByTestId('joystick')).toHaveAttribute('data-active', 'true');
  await expect
    .poll(() => fake.ofType('move').at(-1), { message: 'letzter move nach dem Ziehen' })
    .toMatchObject({ slot: 1 });
  await expect.poll(() => fake.ofType('move').at(-1)?.x ?? 0).toBeGreaterThan(0.3);

  const held = fake.ofType('move').at(-1);
  if (!held) throw new Error('kein move');
  expect(held.y).toBeGreaterThan(0.3);
  expect(Math.abs(held.x - held.y)).toBeLessThan(0.1);
  expect(Math.hypot(held.x, held.y)).toBeLessThanOrEqual(1);
  // Gedrosselt: nicht mehr Nachrichten als Bewegungsschritte.
  expect(fake.ofType('move').length).toBeLessThanOrEqual(12);

  await touch.up(1);
  await expect.poll(() => fake.ofType('move').at(-1)).toMatchObject({ x: 0, y: 0 });
  await expect(page.getByTestId('joystick')).toHaveAttribute('data-active', 'false');

  // Ganz nach links unten über den Ring hinaus: voller Ausschlag, Länge ≤ 1.
  await touch.down(1, start);
  await touch.move(1, { x: start.x - 200, y: start.y + 200 }, 6);
  await expect.poll(() => fake.ofType('move').at(-1)?.x ?? 0).toBeLessThan(-0.6);
  const full = fake.ofType('move').at(-1);
  expect(full?.y).toBeLessThan(-0.6);
  expect(Math.hypot(full?.x ?? 0, full?.y ?? 0)).toBeLessThanOrEqual(1);
  await touch.up(1);
  await expect.poll(() => fake.ofType('move').at(-1)).toMatchObject({ x: 0, y: 0 });

  await expectNoScrollOrZoom(page);
});

test('Knöpfe: A drücken/loslassen, gleichzeitig mit dem Joystick, seq steigt streng', async ({
  page,
}) => {
  await joinAndPlay(page);
  const touch = await TouchScreen.create(page);
  const buttonA = page.getByTestId('button-a');
  const a = await centerOf(buttonA);

  await touch.down(1, a);
  await expect(buttonA).toHaveAttribute('data-pressed', 'true');
  await expect
    .poll(() => fake.ofType('press'))
    .toEqual([expect.objectContaining({ type: 'press', slot: 1, button: 'a' })]);
  await touch.up(1);
  await expect(buttonA).toHaveAttribute('data-pressed', 'false');
  await expect.poll(() => fake.ofType('release')).toHaveLength(1);
  expect(fake.ofType('release')[0]).toMatchObject({ slot: 1, button: 'a' });

  // Zwei Finger gleichzeitig: Daumen hält den Joystick, zweiter Finger drückt B.
  const stick = await centerOf(page.getByTestId('joystick'));
  const b = await centerOf(page.getByTestId('button-b'));
  await touch.down(1, stick);
  await touch.move(1, { x: stick.x + 60, y: stick.y }, 4);
  await touch.down(2, b);
  await expect(page.getByTestId('button-b')).toHaveAttribute('data-pressed', 'true');
  // Joystick hält trotz zweitem Finger seine Stellung.
  await expect(page.getByTestId('joystick')).toHaveAttribute('data-active', 'true');
  await expect.poll(() => fake.ofType('press')).toHaveLength(2);
  expect(fake.ofType('move').at(-1)?.x).toBeGreaterThan(0.5);
  // Beide Finger heben ab (CDP kann nur alle gleichzeitig anheben).
  await touch.upAll();
  await expect(page.getByTestId('button-b')).toHaveAttribute('data-pressed', 'false');
  await expect(page.getByTestId('joystick')).toHaveAttribute('data-active', 'false');
  await expect.poll(() => fake.ofType('release')).toHaveLength(2);

  await expect.poll(() => fake.ofType('move').at(-1)).toMatchObject({ x: 0, y: 0 });
  const types = fake
    .intents()
    .map((m) => (m.type === 'press' || m.type === 'release' ? `${m.type}-${m.button}` : m.type));
  expect(types.filter((t) => t !== 'move')).toEqual([
    'ready',
    'press-a',
    'release-a',
    'press-b',
    'release-b',
  ]);
  const rightMoves = fake.ofType('move').filter((m) => m.x > 0.5);
  expect(rightMoves.length).toBeGreaterThan(0);
  const seqs = fake.intents().map((m) => m.seq);
  for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1] ?? -1);

  await expectNoScrollOrZoom(page);
});

test('zeigt nur die Aktionen aus dem Kontext und folgt Layout-Wechseln', async ({ page }) => {
  await joinAndPlay(page);

  fake.sendContext('play', 'joystick-buttons', ['button-a']);
  await expect(page.getByTestId('button-b')).toHaveCount(0);
  await expect(page.getByTestId('joystick')).toHaveCount(0);
  await expect(page.getByTestId('button-a')).toBeVisible();

  fake.sendContext('play', 'joystick-buttons', ['move']);
  await expect(page.getByTestId('joystick')).toBeVisible();
  await expect(page.getByTestId('button-a')).toHaveCount(0);

  fake.sendContext('play', 'wait', []);
  await expect(page.getByTestId('wait-panel')).toBeVisible();
  await expect(page.getByTestId('joystick')).toHaveCount(0);

  fake.sendContext('lobby', 'lobby', []);
  await expect(page.getByTestId('ready-done')).toBeVisible();
  await expect(page.getByTestId('ready-button')).toHaveCount(0);
});

test('Knopf verschwindet beim Halten → release wird trotzdem gesendet', async ({ page }) => {
  await joinAndPlay(page);
  const touch = await TouchScreen.create(page);
  await touch.down(1, await centerOf(page.getByTestId('button-a')));
  await expect.poll(() => fake.ofType('press')).toHaveLength(1);

  fake.sendContext('play', 'wait', []);
  await expect(page.getByTestId('wait-panel')).toBeVisible();
  await expect.poll(() => fake.ofType('release')).toHaveLength(1);
  await touch.up(1);
});

test('Fehler erscheinen als freundliche Texte; Verbindungsverlust → automatisch neu per Token', async ({
  page,
}) => {
  await joinAndPlay(page);

  fake.sendError('out-of-phase', 'technischer Text, nicht anzeigen', 3);
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('Das geht gerade nicht');
  await expect(toast).not.toContainText('technischer Text');

  // Stille Fehler zeigen nichts Neues an.
  fake.sendError('stale-seq', 'alt', 1);
  await expect(toast).toHaveAttribute('data-code', 'out-of-phase');

  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
  // Server trennt: Der Controller verbindet sich ohne Zutun mit dem Token neu (CHAOS-12).
  // Overlay und Versuchszähler prüft `reconnect-controller.spec.ts` am echten Server.
  await fake.drop();
  await expect.poll(() => fake.connections).toBe(2);
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
  await expect(page.getByTestId('connection-overlay')).toHaveCount(0);
  await expect(page.getByTestId('error-screen')).toHaveCount(0);
  await expect(slot(page)).toHaveAttribute('data-layout', 'joystick-buttons');
  expect(fake.handshakes.at(-1)).toEqual({ v: 1, type: 'reconnect', sessionToken: FAKE_TOKEN });
});

test('Neuladen der Seite tritt per reconnect mit gemerktem Token wieder bei', async ({ page }) => {
  await joinLobby(page);
  await page.reload();
  await expect(slot(page)).toHaveAttribute('data-layout', 'lobby');
  expect(fake.handshakes.map((m) => m.type)).toEqual(['join', 'reconnect']);
  expect(fake.handshakes[1]).toEqual({ v: 1, type: 'reconnect', sessionToken: FAKE_TOKEN });
});

test('Wischen und Zwei-Finger-Zoom bewegen die Seite nicht', async ({ page }) => {
  await joinAndPlay(page);
  const touch = await TouchScreen.create(page);
  const badge = await centerOf(page.getByTestId('player-badge'));

  // Nach unten wischen (Pull-to-Refresh) und seitlich (Zurück-Geste) auf der Plakette.
  await touch.down(1, badge);
  await touch.move(1, { x: badge.x, y: badge.y + 250 }, 10);
  await touch.up(1);
  await touch.down(1, { x: 12, y: badge.y + 40 });
  await touch.move(1, { x: 220, y: badge.y + 40 }, 10);
  await touch.up(1);

  // Pinch auf dem Joystick-Feld und auf dem Rand.
  const stick = await centerOf(page.getByTestId('joystick'));
  await touch.down(1, { x: stick.x - 10, y: stick.y });
  await touch.down(2, { x: stick.x + 10, y: stick.y });
  await touch.move(2, { x: stick.x + 120, y: stick.y + 60 }, 8);
  await touch.upAll();

  await expectNoScrollOrZoom(page);
  await expect(slot(page)).toHaveAttribute('data-layout', 'joystick-buttons');
});
