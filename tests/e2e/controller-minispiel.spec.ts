import { devices, type Browser, type Locator, type Page } from '@playwright/test';
import {
  createMessage,
  type Action,
  type ControllerMinigameInfo,
  type GamePhaseName,
  type SlotNumber,
} from '../../packages/protocol/src/index.ts';
import { expect, test } from './fixtures/test.ts';
import { boardInfo, FakeSession, VALID_CODE } from './fixtures/fakeSession.ts';
import { centerOf, TouchScreen } from './fixtures/touch.ts';
import { expectStableWrapping } from './fixtures/wrapping.ts';

/**
 * Minispiele am Controller (M3, CHAOS-33) gegen den Production-Build mit nachgebautem
 * Session-Server (ADR-006): Der Fake schickt genau die Kontexte, die der echte Server in
 * `minigame-intro`/`-play`/`-results` sendet (`boardContextFor`, Protokoll v3), und prüft
 * jede Eingabe mit dem echten Parser.
 *
 * Projekte `iphone-hoch` und `iphone-quer`; der iPad-Test öffnet zusätzlich ein iPad
 * (hoch bzw. quer passend zum Projekt) in einem eigenen Browser-Kontext. Mehrfinger per CDP
 * beweist **kein** echtes iOS-Multitouch (Gerätecheckliste, Abschnitt M3).
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

let problems: Problems[];
let fakes: FakeSession[];

test.beforeEach(() => {
  problems = [];
  fakes = [];
});

test.afterEach(() => {
  for (const p of problems) {
    expect(p.pageErrors).toEqual([]);
    expect(p.consoleErrors).toEqual([]);
  }
  for (const fake of fakes) expect(fake.invalid).toEqual([]);
});

async function attach(page: Page): Promise<FakeSession> {
  problems.push(collectProblems(page));
  const fake = await FakeSession.attach(page);
  fakes.push(fake);
  return fake;
}

/* ---------------------------------------------------------------------------
 * Steckbriefe (wie `ControllerMinigameInfo` vom Server)
 * ------------------------------------------------------------------------- */

type Info = Omit<ControllerMinigameInfo, 'stage' | 'place' | 'score' | 'tied' | 'aborted'>;

/*
 * Die Texte sind Testdaten mit Abstand zu jeder Umbruchkante (CHAOS-72): Jeder Satz und jede
 * Reihe Bedien-Pillen passt deutlich in eine Zeile oder bricht deutlich um, in allen Formaten.
 * `expectStableWrapping` vor jedem Screenshot hält das fest; wer Texte ändert, sieht dort, ob ein
 * neuer Text an einer Kante liegt.
 */

/** Joystick + A, kein B. */
const HUEPFEN: Info = {
  id: 'kartoffel-hupf',
  title: 'Kartoffel-Hüpfen',
  tagline: 'Hüpf über die Kartoffeln!',
  instructions: [
    'Lauf mit dem Joystick nach links und nach rechts.',
    'Spring mit A über die Kartoffeln.',
    'Wer am längsten steht, gewinnt.',
  ],
  controls: { joystick: 'Laufen', a: 'Springen', b: null },
  scoreUnit: 'Sekunden',
};

/** Nur A (wie das Referenz-Minispiel `pump-parade`). */
const PUMPEN: Info = {
  id: 'pump-parade',
  title: 'Pump-Parade',
  tagline: 'Pumpt euren Ballon am schnellsten auf!',
  instructions: ['Tippe A so oft du kannst.', 'Größter Ballon gewinnt.'],
  controls: { joystick: null, a: 'Pumpen', b: null },
  scoreUnit: 'Pumpstöße',
};

/** Alle drei Elemente. */
const SCHUBSEN: Info = {
  id: 'schubs-arena',
  title: 'Schubs-Arena',
  tagline: 'Schubs alle anderen von der Eisscholle!',
  instructions: ['Lenke mit dem Joystick.', 'A schubst, B bremst.'],
  controls: { joystick: 'Schlittern', a: 'Schubsen', b: 'Bremsen' },
  scoreUnit: 'Punkte',
};

function actionsFor(info: Info): Action[] {
  const actions: Action[] = [];
  if (info.controls.joystick !== null) actions.push('move');
  if (info.controls.a !== null) actions.push('button-a');
  if (info.controls.b !== null) actions.push('button-b');
  return actions;
}

/** Kontext genau wie `Session.boardContextFor` während eines Minispiels. */
function sendMinigame(
  fake: FakeSession,
  slot: SlotNumber,
  info: Info,
  stage: ControllerMinigameInfo['stage'],
  result: Partial<
    Pick<ControllerMinigameInfo, 'place' | 'score' | 'reward' | 'prizes' | 'repeat'>
  > = {},
) {
  const play = stage === 'play';
  fake.send(
    createMessage('context', {
      slot,
      phase: 'board',
      layout: play ? 'joystick-buttons' : 'board',
      actions: play ? actionsFor(info) : [],
      board: boardInfo({ gamePhase: `minigame-${stage}` as GamePhaseName, activeSlot: null }),
      minigame: { ...info, stage, tied: false, aborted: false, ...result },
    }),
  );
}

/** Texte, Glyphen und Zahlen maskiert (ADR-004); Formen, Farben und Lage bleiben geprüft. */
const screenshotMask = (page: Page) => [
  page.locator('.ui-text, .player-symbol, .control-key, .link-pill'),
];

/**
 * Belegbilder für die Doku: `MINISPIEL_BELEG=docs/screenshots pnpm test:e2e controller-minispiel`
 * schreibt `<ordner>/m3-<name>.png` (ungemaskiert).
 */
async function beleg(page: Page, name: string) {
  const dir = process.env.MINISPIEL_BELEG;
  if (!dir) return;
  await page.screenshot({ path: `${dir}/m3-${name}.png`, animations: 'disabled' });
}

const slot = (page: Page) => page.getByTestId('slot-1');

async function join(page: Page) {
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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element unsichtbar');
  return box;
}

/** Alle sichtbaren Kinder von `content` liegen ganz in `frame` (kein Abschneiden, kein Scrollen). */
async function expectInside(content: Locator, frame: Box) {
  const boxes = await content.locator('*').evaluateAll((els) =>
    els
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 0.5);
    expect(box.y).toBeGreaterThanOrEqual(frame.y - 0.5);
    expect(box.x + box.w).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    expect(box.y + box.h).toBeLessThanOrEqual(frame.y + frame.height + 0.5);
  }
}

function viewportBox(page: Page): Box {
  const size = page.viewportSize();
  if (!size) throw new Error('Kein Viewport');
  return { x: 0, y: 0, ...size };
}

/* ---------------------------------------------------------------------------
 * iPhone
 * ------------------------------------------------------------------------- */

test('Intro: Titel, Untertitel, Anleitung und Bedienlegende nur der angebotenen Elemente', async ({
  page,
}, testInfo) => {
  const fake = await attach(page);
  await join(page);
  sendMinigame(fake, 1, HUEPFEN, 'intro');

  await expect(slot(page)).toHaveAttribute('data-minigame-stage', 'intro');
  await expect(slot(page)).toHaveAttribute('data-layout', 'board');
  const intro = page.getByTestId('minigame-intro');
  await expect(page.getByTestId('minigame-title')).toHaveText('Kartoffel-Hüpfen');
  await expect(page.getByTestId('minigame-tagline')).toHaveText('Hüpf über die Kartoffeln!');
  await expect(page.getByTestId('minigame-steps').locator('li')).toHaveText(HUEPFEN.instructions);
  await expect(page.getByTestId('legend-stick')).toContainText('Laufen');
  await expect(page.getByTestId('legend-a')).toContainText('Springen');
  await expect(page.getByTestId('legend-b')).toHaveCount(0);
  await expect(page.getByTestId('minigame-ready')).toHaveText('Gleich geht’s los!');
  // Keine Bedienelemente und kein Brettstand im Intro; Farbe und Symbol des Slots bleiben.
  await expect(page.getByTestId('joystick')).toHaveCount(0);
  await expect(page.getByTestId('board-panel')).toHaveCount(0);
  await expect(page.getByTestId('player-badge')).toContainText('●');

  await expectInside(intro, viewportBox(page));
  await expectNoScrollOrZoom(page);
  if (testInfo.project.name === 'iphone-hoch') await beleg(page, 'controller-intro');
  await expectStableWrapping(page.locator('body'));
  await expect(page).toHaveScreenshot('minispiel-intro.png', { mask: screenshotMask(page) });

  // Nur Knöpfe: Legende zeigt genau A.
  sendMinigame(fake, 1, PUMPEN, 'intro');
  await expect(page.getByTestId('minigame-title')).toHaveText('Pump-Parade');
  await expect(page.getByTestId('control-legend').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('legend-a')).toContainText('Pumpen');
});

test('Intro bei Wiederholung (CHAOS-66): nur Titel und Bedienlegende, keine Anleitung', async ({
  page,
}, testInfo) => {
  const fake = await attach(page);
  await join(page);
  sendMinigame(fake, 1, HUEPFEN, 'intro', { repeat: true });

  const intro = page.getByTestId('minigame-intro');
  await expect(intro).toHaveAttribute('data-repeat', 'true');
  await expect(page.getByTestId('minigame-kicker')).toHaveText('Nochmal!');
  await expect(page.getByTestId('minigame-title')).toHaveText('Kartoffel-Hüpfen');
  await expect(page.getByTestId('minigame-tagline')).toHaveCount(0);
  await expect(page.getByTestId('minigame-steps')).toHaveCount(0);
  await expect(page.getByTestId('legend-stick')).toContainText('Laufen');
  await expect(page.getByTestId('legend-a')).toContainText('Springen');
  await expect(page.getByTestId('minigame-ready')).toHaveText('Gleich geht’s los!');
  await expectInside(intro, viewportBox(page));
  await expectNoScrollOrZoom(page);
  if (testInfo.project.name === 'iphone-hoch') await beleg(page, 'controller-intro-kurz');
  await expectStableWrapping(page.locator('body'));
  await expect(page).toHaveScreenshot('minispiel-intro-kurz.png', { mask: screenshotMask(page) });

  // Erstes Vorkommen (ohne `repeat`) zeigt wieder die volle Anleitung.
  sendMinigame(fake, 1, PUMPEN, 'intro');
  await expect(intro).toHaveAttribute('data-repeat', 'false');
  await expect(page.getByTestId('minigame-steps').locator('li')).toHaveText(PUMPEN.instructions);
  await expect(page.getByTestId('minigame-kicker')).toHaveText('Minispiel');
});

test('Spiel: beschriftete Knöpfe, Joystick nach Steckbrief, Eingaben an den Server', async ({
  page,
}, testInfo) => {
  const fake = await attach(page);
  await join(page);
  sendMinigame(fake, 1, HUEPFEN, 'intro');
  await expect(page.getByTestId('minigame-intro')).toBeVisible();
  sendMinigame(fake, 1, HUEPFEN, 'play');

  await expect(slot(page)).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect(slot(page)).toHaveAttribute('data-minigame-stage', 'play');
  await expect(page.getByTestId('minigame-header')).toHaveText('Kartoffel-Hüpfen');
  await expect(page.getByTestId('button-a-label')).toHaveText('Springen');
  await expect(page.getByTestId('button-a')).toHaveAttribute('aria-label', 'Knopf A: Springen');
  await expect(page.getByTestId('button-b')).toHaveCount(0);
  await expect(page.getByTestId('joystick')).toBeVisible();
  await expect(page.getByTestId('joystick-hint')).toHaveText('Ziehen: Laufen');

  // Knopf und Joystick liegen ganz im Bild und sind daumengroß.
  const view = viewportBox(page);
  for (const id of ['button-a', 'joystick']) {
    const box = await boxOf(page.getByTestId(id));
    expect(box.width).toBeGreaterThanOrEqual(96);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(view.height + 0.5);
  }
  if (testInfo.project.name === 'iphone-hoch') await beleg(page, 'controller-spiel');
  await expectStableWrapping(page.locator('body'));
  await expect(page).toHaveScreenshot('minispiel-spiel.png', { mask: screenshotMask(page) });

  const touch = await TouchScreen.create(page);
  const a = await centerOf(page.getByTestId('button-a'));
  await touch.tap(a);
  await expect
    .poll(() => fake.ofType('press'))
    .toEqual([expect.objectContaining({ slot: 1, button: 'a' })]);
  await expect.poll(() => fake.ofType('release')).toHaveLength(1);

  const stick = await centerOf(page.getByTestId('joystick'));
  await touch.down(1, stick);
  await touch.move(1, { x: stick.x + 60, y: stick.y }, 6);
  await expect.poll(() => fake.ofType('move').at(-1)?.x ?? 0).toBeGreaterThan(0.5);
  await touch.upAll();
  await expect.poll(() => fake.ofType('move').at(-1)).toMatchObject({ x: 0, y: 0 });
  await expectNoScrollOrZoom(page);
});

test('Wechsel Spiel → Ergebnis lässt gehaltenen Knopf und Joystick los; Platz und Punkte groß', async ({
  page,
}, testInfo) => {
  const fake = await attach(page);
  await join(page);
  sendMinigame(fake, 1, HUEPFEN, 'play');
  await expect(page.getByTestId('button-a')).toBeVisible();

  // Joystick und A gleichzeitig halten …
  const touch = await TouchScreen.create(page);
  const stick = await centerOf(page.getByTestId('joystick'));
  await touch.down(1, stick);
  await touch.move(1, { x: stick.x - 60, y: stick.y }, 6);
  await touch.down(2, await centerOf(page.getByTestId('button-a')));
  await expect.poll(() => fake.ofType('press')).toHaveLength(1);
  await expect.poll(() => fake.ofType('move').at(-1)?.x ?? 0).toBeLessThan(-0.5);
  expect(fake.ofType('release')).toHaveLength(0);

  // … und das Minispiel endet: Der Controller meldet Loslassen und neutralen Joystick.
  sendMinigame(fake, 1, HUEPFEN, 'results', { place: 1, score: 42 });
  await expect(slot(page)).toHaveAttribute('data-minigame-stage', 'results');
  await expect
    .poll(() => fake.ofType('release'))
    .toEqual([expect.objectContaining({ slot: 1, button: 'a' })]);
  await expect.poll(() => fake.ofType('move').at(-1)).toMatchObject({ x: 0, y: 0 });
  await touch.upAll();
  await expect(page.getByTestId('joystick')).toHaveCount(0);

  const result = page.getByTestId('minigame-result');
  await expect(result).toHaveAttribute('data-kind', 'placed');
  await expect(page.getByTestId('result-place')).toHaveText('Platz 1!');
  await expect(result).toContainText('Gewonnen!');
  await expect(page.getByTestId('result-score')).toHaveText('42 Sekunden');
  await expectInside(result, viewportBox(page));
  if (testInfo.project.name === 'iphone-hoch') await beleg(page, 'controller-ergebnis');
  await expectStableWrapping(page.locator('body'));
  await expect(page).toHaveScreenshot('minispiel-ergebnis.png', { mask: screenshotMask(page) });

  // Nach dem Ergebnis: normale Brettanzeige.
  fake.sendBoard(1, boardInfo({ gamePhase: 'turn-start', activeSlot: 2 }));
  await expect(page.getByTestId('board-panel')).toBeVisible();
  await expect(page.getByTestId('minigame-result')).toHaveCount(0);
  await expect(slot(page)).toHaveAttribute('data-minigame-stage', 'none');
  await expect(page.getByTestId('board-waiting')).toHaveAttribute('data-kind', 'other-turn');
  // Nach dem Loslassen keine weiteren Eingaben.
  expect(fake.ofType('press')).toHaveLength(1);
});

test('Nur Knöpfe (Pump-Parade): kein Joystick, ein großer Knopf; Ergebnis und Abbruch', async ({
  page,
}) => {
  const fake = await attach(page);
  await join(page);
  sendMinigame(fake, 1, PUMPEN, 'play');

  await expect(page.getByTestId('button-a-label')).toHaveText('Pumpen');
  await expect(page.getByTestId('joystick')).toHaveCount(0);
  await expect(page.getByTestId('button-b')).toHaveCount(0);
  const box = await boxOf(page.getByTestId('button-a'));
  expect(box.width).toBeGreaterThanOrEqual(150);
  // Mittig: Mittelpunkt im mittleren Drittel der Breite.
  const view = viewportBox(page);
  expect(box.x + box.width / 2).toBeGreaterThan(view.width / 3);
  expect(box.x + box.width / 2).toBeLessThan((view.width * 2) / 3);
  await expectStableWrapping(page.locator('body'));
  await expect(page).toHaveScreenshot('minispiel-nur-knopf.png', { mask: screenshotMask(page) });

  // Schnelles Tippen: jedes Tippen ein press + release.
  const touch = await TouchScreen.create(page);
  const a = await centerOf(page.getByTestId('button-a'));
  for (let i = 0; i < 3; i++) await touch.tap(a);
  await expect.poll(() => fake.ofType('press')).toHaveLength(3);
  await expect.poll(() => fake.ofType('release')).toHaveLength(3);
  const seqs = fake.intents().map((m) => m.seq);
  expect(seqs).toEqual([...seqs].sort((x, y) => x - y));

  sendMinigame(fake, 1, PUMPEN, 'results', { place: 3, score: 1234 });
  await expect(page.getByTestId('result-place')).toHaveText('Platz 3!');
  await expect(page.getByTestId('result-score')).toHaveText('1.234 Pumpstöße');
  await expect(page.getByTestId('result-prize')).toHaveCount(0);

  // Letzter Platz mit Trostpreis (CHAOS-51, EXP-019): Item neben den Münzen.
  sendMinigame(fake, 1, PUMPEN, 'results', { place: 4, score: 3, reward: 0, prizes: ['trap'] });
  await expect(page.getByTestId('result-place')).toHaveText('Platz 4!');
  await expect(page.getByTestId('result-prize')).toHaveAttribute('data-items', 'trap');
  await expect(page.getByTestId('result-prize')).toHaveText('Trostpreis: Falle');
  await expectInside(page.getByTestId('minigame-result'), viewportBox(page));
  await expect(page).toHaveScreenshot('minispiel-trostpreis.png', { mask: screenshotMask(page) });

  // Abbruch: kein Platz, keine Punkte, klarer Hinweis.
  sendMinigame(fake, 1, PUMPEN, 'results');
  await expect(page.getByTestId('minigame-result')).toHaveAttribute('data-kind', 'aborted');
  await expect(page.getByTestId('result-aborted')).toHaveText('Minispiel abgebrochen');
  await expect(page.getByTestId('result-score')).toHaveCount(0);
  await expect(page.getByTestId('result-place')).toHaveCount(0);
  await expectNoScrollOrZoom(page);
});

test('Platzhalter-Minispiel ohne Steckbrief: bisherige Statusanzeige', async ({ page }) => {
  const fake = await attach(page);
  await join(page);
  fake.sendBoard(1, boardInfo({ gamePhase: 'minigame-play', activeSlot: null }));
  await expect(page.getByTestId('board-waiting')).toHaveAttribute('data-kind', 'minigame');
  await expect(page.getByTestId('board-waiting')).toContainText('Minispiel läuft …');
  await expect(page.getByTestId('minigame-intro')).toHaveCount(0);
  await expect(slot(page)).toHaveAttribute('data-minigame-stage', 'none');
});

/* ---------------------------------------------------------------------------
 * Geteiltes iPad: vier Zonen (ADR-008)
 * ------------------------------------------------------------------------- */

async function openIpad(browser: Browser, baseURL: string, landscape: boolean) {
  const device = devices[landscape ? 'iPad Pro 11 landscape' : 'iPad Pro 11'];
  const context = await browser.newContext({
    viewport: device.viewport,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    baseURL,
  });
  return { context, page: await context.newPage() };
}

test('iPad-Zonen: Intro, Spiel mit Beschriftung und Ergebnis je Zone', async ({
  browser,
  chaosServer,
}, testInfo) => {
  const landscape = testInfo.project.name === 'iphone-quer';
  const name = landscape ? 'ipad-quer' : 'ipad-hoch';
  const { context, page } = await openIpad(browser, chaosServer.base, landscape);
  try {
    const fake = await attach(page);
    const zone = (s: number) => page.getByTestId(`zone-${String(s)}`);
    const slots = [1, 2, 3, 4] as const;
    await page.goto(`/?code=${VALID_CODE}&seats=4`);
    for (const s of slots) await expect(zone(s)).toHaveAttribute('data-layout', 'lobby');

    // Intro in jeder Zone, kompakt und ganz in der Zone.
    for (const s of slots) sendMinigame(fake, s, SCHUBSEN, 'intro');
    for (const s of slots) {
      await expect(zone(s)).toHaveAttribute('data-minigame-stage', 'intro');
      const intro = zone(s).getByTestId('minigame-intro');
      await expect(intro).toHaveAttribute('data-compact', 'true');
      await expect(intro.getByTestId('minigame-title')).toHaveText('Schubs-Arena');
      await expect(intro.getByTestId('legend-b')).toContainText('Bremsen');
      await expectInside(intro, await boxOf(zone(s)));
    }
    await expectStableWrapping(page.locator('body'));
    await expect(page).toHaveScreenshot(`${name}-minispiel-intro.png`, {
      mask: screenshotMask(page),
    });

    // Spiel: Joystick + A + B beschriftet, Kopf mit Titel neben der Plakette.
    for (const s of slots) sendMinigame(fake, s, SCHUBSEN, 'play');
    for (const s of slots) {
      await expect(zone(s)).toHaveAttribute('data-layout', 'joystick-buttons');
      await expect(zone(s).getByTestId('minigame-header')).toHaveText('Schubs-Arena');
      await expect(zone(s).getByTestId('button-a-label')).toHaveText('Schubsen');
      await expect(zone(s).getByTestId('button-b-label')).toHaveText('Bremsen');
      await expect(zone(s).getByTestId('joystick-hint')).toHaveText('Ziehen: Schlittern');
      const zoneBox = await boxOf(zone(s));
      for (const id of ['button-a', 'button-b', 'minigame-header', 'player-badge']) {
        const box = await boxOf(zone(s).getByTestId(id));
        expect(box.x).toBeGreaterThanOrEqual(zoneBox.x);
        expect(box.y).toBeGreaterThanOrEqual(zoneBox.y);
        expect(box.x + box.width).toBeLessThanOrEqual(zoneBox.x + zoneBox.width + 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(zoneBox.y + zoneBox.height + 0.5);
      }
    }
    if (landscape) await beleg(page, 'ipad-minispiel');
    await expectStableWrapping(page.locator('body'));
    await expect(page).toHaveScreenshot(`${name}-minispiel-spiel.png`, {
      mask: screenshotMask(page),
    });

    // Mehrere Finger in mehreren Zonen gleichzeitig: jede Eingabe für den richtigen Slot.
    const touch = await TouchScreen.create(page);
    await touch.down(1, await centerOf(zone(1).getByTestId('button-a')));
    await touch.down(2, await centerOf(zone(2).getByTestId('button-b')));
    const stick = await centerOf(zone(3).getByTestId('joystick'));
    await touch.down(3, stick);
    await touch.move(3, { x: stick.x + 50, y: stick.y }, 5);
    await expect.poll(() => fake.ofType('press').length).toBe(2);
    expect(fake.ofType('press').map((m) => [m.slot, m.button])).toEqual(
      expect.arrayContaining([
        [1, 'a'],
        [2, 'b'],
      ]),
    );
    await expect
      .poll(() => fake.ofType('move').filter((m) => m.slot === 3).length)
      .toBeGreaterThan(0);
    expect(fake.ofType('move').every((m) => m.slot === 3)).toBe(true);

    // Ergebnis kommt, während die Finger noch liegen: alles wird losgelassen.
    const results: Record<number, { place: number; score: number }> = {
      1: { place: 1, score: 30 },
      2: { place: 1, score: 30 },
      3: { place: 3, score: 21 },
      4: { place: 4, score: 9 },
    };
    for (const s of slots) sendMinigame(fake, s, SCHUBSEN, 'results', results[s]);
    await expect.poll(() => fake.ofType('release').length).toBe(2);
    await expect
      .poll(() =>
        fake
          .ofType('move')
          .filter((m) => m.slot === 3)
          .at(-1),
      )
      .toMatchObject({ x: 0, y: 0 });
    await touch.upAll();

    for (const s of slots) {
      const result = zone(s).getByTestId('minigame-result');
      await expect(result).toHaveAttribute('data-place', String(results[s]?.place));
      await expect(result.getByTestId('result-score')).toHaveText(
        `${String(results[s]?.score)} Punkte`,
      );
      await expectInside(result, await boxOf(zone(s)));
    }
    await expect(zone(2).getByTestId('result-place')).toHaveText('Platz 1!');
    await expectStableWrapping(page.locator('body'));
    await expect(page).toHaveScreenshot(`${name}-minispiel-ergebnis.png`, {
      mask: screenshotMask(page),
    });
    await expectNoScrollOrZoom(page);
  } finally {
    await context.close();
  }
});
