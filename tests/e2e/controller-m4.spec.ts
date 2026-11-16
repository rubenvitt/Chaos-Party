import type { Page } from '@playwright/test';
import {
  createMessage,
  type ControllerMinigameInfo,
  type ServerToControllerMessage,
} from '../../packages/protocol/src/index.ts';
import { expect, test } from './fixtures/test.ts';
import {
  boardInfo,
  FakeSession,
  PROMPTS,
  PROTOCOL_VERSION,
  VALID_CODE,
} from './fixtures/fakeSession.ts';

/**
 * M4 am iPhone (CHAOS-36/37/55) gegen den Production-Build mit nachgebautem Session-Server
 * (ADR-006): Lobby mit Charakterwahl, Wettlauf um eine Figur, Pause, Endstand mit geteiltem
 * Platz und vorzeitigem Ende, Revanche, Minispiel-Ergebnis mit Münzen und Wiederherstellen
 * nach Verbindungsverlust und Neuladen in jeder Phase. Projekte `iphone-hoch`/`iphone-quer`.
 * Den echten Server prüft `controller-m4-durchstich.spec.ts`.
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

const slot = (page: Page) => page.getByTestId('slot-1');
const card = (page: Page, id: string) => page.getByTestId(`character-${id}`);

/** Texte und Glyphen maskiert (Schriften unterscheiden sich zwischen Rechnern, ADR-004). */
const screenshotMask = (page: Page) => [
  page.locator('.ui-text, .player-symbol, .ready-check, .character-check, .link-pill'),
];

/**
 * Ungemaskierter Beleg: `M4_BELEG=docs/screenshots pnpm test:e2e controller-m4` schreibt
 * `<ordner>/m4-controller-<name>-<projekt>.png`.
 */
async function beleg(page: Page, name: string, project: string) {
  const dir = process.env.M4_BELEG;
  if (!dir) return;
  await page.screenshot({
    path: `${dir}/m4-controller-${name}-${project}.png`,
    animations: 'disabled',
  });
}

async function join(page: Page) {
  await page.goto(`/?code=${VALID_CODE}`);
  await expect(slot(page)).toHaveAttribute('data-screen', 'lobby');
}

/** Alle sichtbaren Elemente des Slots liegen ganz im Bild (kein Abschneiden, kein Scrollen). */
async function expectAllInView(page: Page) {
  const size = page.viewportSize();
  if (!size) throw new Error('Kein Viewport');
  const boxes = await slot(page)
    .locator('*')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
    );
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.y).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.w).toBeLessThanOrEqual(size.width + 0.5);
    expect(box.y + box.h).toBeLessThanOrEqual(size.height + 0.5);
  }
  const scroll = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
    root: document.scrollingElement?.scrollTop ?? 0,
  }));
  expect(scroll).toEqual({ x: 0, y: 0, root: 0 });
}

const PUMPEN: Omit<ControllerMinigameInfo, 'stage' | 'tied' | 'aborted'> = {
  id: 'pump-parade',
  title: 'Pump-Parade',
  tagline: 'Pumpt euren Ballon am schnellsten auf!',
  instructions: ['Tippe A so oft du kannst.', 'Größter Ballon gewinnt.'],
  controls: { joystick: null, a: 'Pumpen', b: null },
  scoreUnit: 'Pumpstöße',
};

function minigameContext(
  stage: ControllerMinigameInfo['stage'],
  extra: Partial<ControllerMinigameInfo> = {},
  paused = false,
): ServerToControllerMessage {
  const play = stage === 'play' && !paused;
  return createMessage('context', {
    slot: 1,
    phase: 'board',
    layout: play ? 'joystick-buttons' : 'board',
    actions: play ? ['button-a'] : [],
    board: boardInfo({ gamePhase: `minigame-${stage}`, activeSlot: null, paused }),
    minigame: { ...PUMPEN, stage, tied: false, aborted: false, ...extra },
  });
}

test('Lobby: Figur wählen, Rundenzahl, vergebene ausgegraut, bereit und Umwählen', async ({
  page,
}, testInfo) => {
  fake.autoStart = false;
  fake.rounds = 8;
  await join(page);
  await expect(page.getByTestId('lobby-rounds')).toHaveText('8 Runden');
  await expect(page.getByTestId('lobby-hint')).toHaveText('Tippe auf eine Figur.');
  await expect(card(page, 'robot')).toContainText('Schraubi');
  await expect(card(page, 'sock')).toContainText('Socke Sigi');

  // Jemand anderes (anderes Gerät) hat Kalle: ausgegraut, Antippen sendet nichts.
  // Der Server nennt den Besitzer (`takenBy`, CHAOS-40): Karte in Orange mit ▲.
  fake.setExternalTaken(['cactus'], { cactus: 2 });
  await expect(card(page, 'cactus')).toHaveAttribute('data-state', 'taken');
  await expect(card(page, 'cactus')).toHaveAttribute('data-owner', '2');
  await expect(card(page, 'cactus')).toContainText('Orange hat sie');
  await card(page, 'cactus').tap({ force: true });

  await card(page, 'raccoon').tap();
  await expect(card(page, 'raccoon')).toHaveAttribute('data-state', 'mine');
  await expect(card(page, 'raccoon')).toContainText('Deine Figur');
  await expect(page.getByTestId('lobby-hint')).toContainText('Bereit!');
  expect(fake.ofType('pick-character')).toEqual([
    { v: PROTOCOL_VERSION, type: 'pick-character', slot: 1, seq: 1, character: 'raccoon' },
  ]);
  // Eigene Figur erneut antippen: nichts.
  await card(page, 'raccoon').tap({ force: true });

  for (const id of ['robot', 'cactus', 'raccoon', 'sock']) {
    const box = await card(page, id).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(88);
    expect(box?.height).toBeGreaterThanOrEqual(88);
  }
  const ready = await page.getByTestId('ready-button').boundingBox();
  expect(ready?.height).toBeGreaterThanOrEqual(64);
  await expectAllInView(page);
  await beleg(page, 'lobby', testInfo.project.name);
  await expect(page).toHaveScreenshot('m4-lobby.png', { mask: screenshotMask(page) });

  await page.getByTestId('ready-button').tap();
  await expect(page.getByTestId('ready-done')).toBeVisible();
  await expect(slot(page)).toHaveAttribute('data-layout', 'wait');
  await expect(page.getByTestId('lobby-panel')).toHaveAttribute('data-ready', 'true');
  await expectAllInView(page);
  await beleg(page, 'lobby-bereit', testInfo.project.name);

  // Umwählen nach „bereit“: geht, setzt bereit zurück, „Bereit!“ erscheint wieder.
  await card(page, 'sock').tap();
  await expect(card(page, 'sock')).toHaveAttribute('data-state', 'mine');
  await expect(page.getByTestId('ready-button')).toBeVisible();
  await expect(page.getByTestId('lobby-panel')).toHaveAttribute('data-ready', 'false');
  expect(fake.ofType('pick-character').map((m) => m.character)).toEqual(['raccoon', 'sock']);
  expect(fake.ofType('ready')).toHaveLength(1);
});

test('Wettlauf: Figur gleichzeitig vergeben → Hinweis, Auswahl folgt dem Server', async ({
  page,
}) => {
  fake.autoStart = false;
  await join(page);
  fake.holdPicks = true;
  await card(page, 'robot').tap();
  // Sofort hervorgehoben (vorgemerkt), bevor der Server antwortet.
  await expect(card(page, 'robot')).toHaveAttribute('data-state', 'mine');
  await expect(card(page, 'robot')).toHaveAttribute('data-pending', 'true');
  // Inzwischen schnappt sich ein anderes Gerät Schraubi; dann kommt die Antwort.
  fake.setExternalTaken(['robot']);
  fake.flushPicks();
  await expect(page.getByTestId('toast')).toHaveAttribute('data-code', 'character-taken');
  await expect(page.getByTestId('toast')).toContainText('geschnappt');
  await expect(card(page, 'robot')).toHaveAttribute('data-state', 'taken');
  await expect(page.getByTestId('lobby-panel')).toHaveAttribute('data-character', '');
  await card(page, 'cactus').tap();
  await expect(card(page, 'cactus')).toHaveAttribute('data-state', 'mine');
});

test('Pause: klarer Zustand, keine Eingaben; danach geht es weiter', async ({ page }, testInfo) => {
  await join(page);
  fake.sendBoard(1, boardInfo({ gamePhase: 'roll' }), PROMPTS.roll(4));
  await expect(page.getByTestId('prompt')).toBeVisible();

  fake.sendBoard(1, boardInfo({ gamePhase: 'roll', paused: true }));
  await expect(slot(page)).toHaveAttribute('data-screen', 'pause');
  await expect(page.getByTestId('pause-panel')).toContainText('Pause');
  await expect(page.getByTestId('pause-panel')).toContainText('Der PC hat angehalten.');
  await expect(page.locator('[data-testid^="choice-"]')).toHaveCount(0);
  await expectAllInView(page);
  await beleg(page, 'pause', testInfo.project.name);
  await expect(page).toHaveScreenshot('m4-pause.png', { mask: screenshotMask(page) });

  // Pause mitten im Minispiel: keine Knöpfe, auch wenn das Minispiel weiterläuft.
  fake.send(minigameContext('play', {}, true));
  await expect(slot(page)).toHaveAttribute('data-screen', 'pause');
  await expect(page.getByTestId('button-a')).toHaveCount(0);

  fake.send(minigameContext('play'));
  await expect(slot(page)).toHaveAttribute('data-screen', 'play');
  await expect(page.getByTestId('button-a')).toBeVisible();
});

test('Endstand: geteilter Platz, Stand, vorzeitiges Ende, Revanche zurück in die Lobby', async ({
  page,
}, testInfo) => {
  fake.autoStart = false;
  await join(page);
  await card(page, 'cactus').tap();
  await expect(card(page, 'cactus')).toHaveAttribute('data-state', 'mine');
  await page.getByTestId('ready-button').tap();
  await expect(page.getByTestId('ready-done')).toBeVisible();

  fake.sendBoard(
    1,
    boardInfo({
      gamePhase: 'game-results',
      activeSlot: null,
      character: 'cactus',
      place: 1,
      tied: true,
      endedEarly: true,
      coins: 17,
      trophies: 2,
      minigameWins: 3,
    }),
  );
  await expect(slot(page)).toHaveAttribute('data-screen', 'final');
  await expect(page.getByTestId('final-place')).toHaveText('Geteilter Platz 1');
  await expect(page.getByTestId('final-place')).toHaveAttribute('data-tied', 'true');
  await expect(page.getByTestId('final-headline')).toHaveText('Gemeinsam gewonnen!');
  await expect(page.getByTestId('final-trophies')).toContainText('2');
  await expect(page.getByTestId('final-coins')).toContainText('17');
  await expect(page.getByTestId('final-wins')).toContainText('3');
  await expect(page.getByTestId('final-ended-early')).toContainText('vorzeitig beendet');
  await expect(page.getByTestId('final-rematch')).toContainText('„Nochmal spielen“');
  await expect(page.locator('.final-portrait')).toHaveAttribute('data-character', 'cactus');
  await expectAllInView(page);
  await beleg(page, 'endstand', testInfo.project.name);
  await expect(page).toHaveScreenshot('m4-endstand.png', { mask: screenshotMask(page) });

  // Revanche: Lobby, Figur bleibt, bereit zurückgesetzt (wieder „Bereit!“).
  fake.rematch();
  await expect(slot(page)).toHaveAttribute('data-screen', 'lobby');
  await expect(card(page, 'cactus')).toHaveAttribute('data-state', 'mine');
  await expect(page.getByTestId('ready-button')).toBeVisible();
  await page.getByTestId('ready-button').tap();
  await expect(page.getByTestId('ready-done')).toBeVisible();
  expect(fake.ofType('ready')).toHaveLength(2);
});

test('Minispiel-Ergebnis: „Geteilter Platz 1“, Münzen; Abbruch ausdrücklich', async ({
  page,
}, testInfo) => {
  await join(page);
  fake.send(minigameContext('results', { place: 1, tied: true, score: 42, reward: 5 }));
  const result = page.getByTestId('minigame-result');
  await expect(result).toHaveAttribute('data-tied', 'true');
  await expect(page.getByTestId('result-place')).toHaveText('Geteilter Platz 1!');
  await expect(page.getByTestId('result-reward')).toHaveText('+5 Münzen');
  await expect(page.getByTestId('result-score')).toHaveText('42 Pumpstöße');
  await expectAllInView(page);
  await beleg(page, 'minispiel-geteilt', testInfo.project.name);
  await expect(page).toHaveScreenshot('m4-minispiel-geteilt.png', {
    mask: screenshotMask(page),
  });

  fake.send(minigameContext('results', { place: 3, reward: 0 }));
  await expect(page.getByTestId('result-place')).toHaveText('Platz 3!');
  await expect(page.getByTestId('result-reward')).toHaveText('Keine Münzen');

  fake.send(minigameContext('results', { aborted: true }));
  await expect(page.getByTestId('result-aborted')).toHaveText('Minispiel abgebrochen');
  await expect(page.getByTestId('result-reward')).toHaveCount(0);
});

/** Kontexte je Phase für das Wiederherstellen (Server schickt nach `welcome` denselben). */
const RESTORE: [string, () => void, string, (page: Page) => Promise<void>][] = [
  [
    'Brett: Reaktionsfenster',
    () => {
      fake.sendBoard(1, boardInfo({ gamePhase: 'reaction-window' }), PROMPTS.reaction(9, 1, 8000));
    },
    'board',
    async (page) => {
      await expect(page.getByTestId('prompt')).toHaveAttribute('data-kind', 'reaction');
    },
  ],
  [
    'Minispiel läuft',
    () => {
      fake.send(minigameContext('play'));
    },
    'play',
    async (page) => {
      await expect(page.getByTestId('button-a')).toBeVisible();
    },
  ],
  [
    'Pause',
    () => {
      fake.sendBoard(1, boardInfo({ paused: true }));
    },
    'pause',
    async (page) => {
      await expect(page.getByTestId('pause-panel')).toBeVisible();
    },
  ],
  [
    'Endstand',
    () => {
      fake.sendBoard(1, boardInfo({ gamePhase: 'game-results', activeSlot: null, place: 2 }));
    },
    'final',
    async (page) => {
      await expect(page.getByTestId('final-place')).toHaveText('Platz 2');
    },
  ],
];

test('Wiederverbinden und Neuladen in der Lobby: Figur und Bereit-Stand kommen zurück', async ({
  page,
}) => {
  fake.autoStart = false;
  await join(page);
  await card(page, 'sock').tap();
  await page.getByTestId('ready-button').tap();
  await expect(page.getByTestId('ready-done')).toBeVisible();

  await fake.drop();
  await expect(page.getByTestId('ready-done')).toBeVisible();
  await expect.poll(() => fake.connections).toBe(2);
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
  await expect(card(page, 'sock')).toHaveAttribute('data-state', 'mine');

  await page.reload();
  await expect(slot(page)).toHaveAttribute('data-screen', 'lobby');
  await expect(card(page, 'sock')).toHaveAttribute('data-state', 'mine');
  await expect(page.getByTestId('ready-done')).toBeVisible();
  expect(fake.handshakes.at(-1)).toMatchObject({ type: 'reconnect' });
});

for (const [name, enter, screen, check] of RESTORE) {
  test(`Wiederverbinden und Neuladen: ${name}`, async ({ page }) => {
    await join(page);
    enter();
    await expect(slot(page)).toHaveAttribute('data-screen', screen);
    await check(page);

    await fake.drop();
    await expect.poll(() => fake.connections).toBe(2);
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
    await expect(slot(page)).toHaveAttribute('data-screen', screen);
    await check(page);

    await page.reload();
    await expect(slot(page)).toHaveAttribute('data-screen', screen);
    await check(page);
    expect(fake.handshakes.at(-1)).toMatchObject({ type: 'reconnect' });
  });
}
