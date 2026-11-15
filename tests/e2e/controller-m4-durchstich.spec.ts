/**
 * M4 am Controller gegen den **echten** Server (CHAOS-36/37/38, ADR-015): Charakterwahl mit
 * zwei iPhones inklusive Wettlauf um dieselbe Figur, gemischte Aufstellung (2 iPhones +
 * iPad mit 2 Zonen), Pause, vorzeitiges Ende, Revanche und Neuladen in Lobby, Pause und
 * Endstand. Den Host spielt ein synthetischer Host aus dem Testprozess
 * (`fixtures/syntheticHost.ts`); die Host-Seite selbst prüfen die Host-Specs.
 *
 * Die Geräte öffnet `openDevice` in eigenen Browser-Kontexten (eigenes Token). Die Specs
 * hängen nicht vom Geräteprofil des Projekts ab und laufen deshalb nur in `iphone-hoch`.
 *
 * Was das **nicht** beweist: echtes iOS-Safari, WLAN, echte Mehrfinger-Bedienung am iPad
 * (siehe `docs/device-test-checklist.md`).
 */
import type { Page, WebSocketRoute } from '@playwright/test';
import { collectProblems, expectNoProblems, type Problems } from './fixtures/pages.ts';
import type { RunningServer } from './fixtures/server.ts';
import { SyntheticHost } from './fixtures/syntheticHost.ts';
import { expect, test, type DeviceName } from './fixtures/test.ts';
import { centerOf, TouchScreen } from './fixtures/touch.ts';

// Mehrgeräte-Test: ein Projekt reicht (`iphone-quer` hat den breiteren Viewport).
test.skip(
  ({ viewport }) => (viewport?.width ?? 0) > (viewport?.height ?? 0),
  'Mehrgeräte-Test: läuft nur im Projekt iphone-hoch',
);

/** Hält Nachrichten vom Server an das Gerät zurück (Wettlauf nachstellen). */
class HeldLink {
  hold = false;
  private queue: (string | Buffer)[] = [];
  private page: WebSocketRoute | null = null;

  async attach(page: Page): Promise<void> {
    await page.routeWebSocket(/\/ws$/, (ws) => {
      this.page = ws;
      this.queue = [];
      const server = ws.connectToServer();
      server.onMessage((message) => {
        if (this.hold) this.queue.push(message);
        else ws.send(message);
      });
    });
  }

  release() {
    this.hold = false;
    for (const message of this.queue) this.page?.send(message);
    this.queue = [];
  }
}

interface Phone {
  page: Page;
  problems: Problems;
}

async function openPhone(
  openDevice: (name: DeviceName) => Promise<Page>,
  server: RunningServer,
  slot: number,
  before?: (page: Page) => Promise<void>,
): Promise<Phone> {
  const page = await openDevice('iPhone 13');
  const problems = collectProblems(page);
  await before?.(page);
  await page.goto(server.joinUrl);
  await expect(page.getByTestId(`slot-${String(slot)}`)).toHaveAttribute('data-screen', 'lobby');
  return { page, problems };
}

const card = (page: Page, id: string) => page.getByTestId(`character-${id}`);

let host: SyntheticHost | null = null;
test.afterEach(() => {
  host?.close();
  host = null;
});

test('Charakterwahl mit zwei iPhones: Wahl, ausgegraut, Wettlauf um dieselbe Figur, Umwählen setzt bereit zurück', async ({
  openDevice,
  chaosServer,
}) => {
  host = await SyntheticHost.connect(chaosServer);
  host.configure(3);
  const a = await openPhone(openDevice, chaosServer, 1);
  const heldLink = new HeldLink();
  const b = await openPhone(openDevice, chaosServer, 2, (page) => heldLink.attach(page));

  for (const phone of [a, b]) {
    await expect(phone.page.getByTestId('lobby-rounds')).toHaveText('3 Runden');
    // Große Touch-Ziele (≥ 44 pt).
    for (const id of ['robot', 'cactus', 'raccoon', 'sock']) {
      const box = await card(phone.page, id).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  }

  // A wählt Schraubi: bei A hervorgehoben, bei B ausgegraut.
  await card(a.page, 'robot').tap();
  await expect(card(a.page, 'robot')).toHaveAttribute('data-state', 'mine');
  await expect(card(b.page, 'robot')).toHaveAttribute('data-state', 'taken');
  await expect(card(b.page, 'robot')).toHaveAttribute('aria-disabled', 'true');
  // Ausgegraute Figur antippen tut nichts.
  await card(b.page, 'robot').tap({ force: true });
  await expect(card(b.page, 'robot')).toHaveAttribute('data-state', 'taken');

  // Wettlauf: B sieht die Änderung von A noch nicht und tippt dieselbe Figur.
  heldLink.hold = true;
  await card(a.page, 'cactus').tap();
  await expect(card(a.page, 'cactus')).toHaveAttribute('data-state', 'mine');
  await expect(card(b.page, 'cactus')).toHaveAttribute('data-state', 'free');
  await card(b.page, 'cactus').tap();
  // Vorgemerkt: leuchtet sofort, bis der Server antwortet.
  await expect(card(b.page, 'cactus')).toHaveAttribute('data-pending', 'true');
  heldLink.release();
  await expect(b.page.getByTestId('toast')).toHaveAttribute('data-code', 'character-taken');
  await expect(b.page.getByTestId('toast')).toContainText('geschnappt');
  await expect(card(b.page, 'cactus')).toHaveAttribute('data-state', 'taken');
  await expect(card(b.page, 'robot')).toHaveAttribute('data-state', 'free');
  await expect(b.page.getByTestId('lobby-panel')).toHaveAttribute('data-character', '');

  await card(b.page, 'robot').tap();
  await expect(card(b.page, 'robot')).toHaveAttribute('data-state', 'mine');
  await expect
    .poll(() => host?.lastLobby()?.players.map((p) => [p.slot, p.character]))
    .toEqual([
      [1, 'cactus'],
      [2, 'robot'],
    ]);

  // Bereit, dann umwählen: bereit wird zurückgesetzt, „Bereit!“ kommt wieder.
  await a.page.getByTestId('ready-button').tap();
  await expect(a.page.getByTestId('ready-done')).toBeVisible();
  await expect(a.page.getByTestId('slot-1')).toHaveAttribute('data-layout', 'wait');
  await expect.poll(() => host?.lastLobby()?.players[0]?.ready).toBe(true);
  await card(a.page, 'raccoon').tap();
  await expect(card(a.page, 'raccoon')).toHaveAttribute('data-state', 'mine');
  await expect(a.page.getByTestId('ready-button')).toBeVisible();
  await expect.poll(() => host?.lastLobby()?.players[0]?.ready).toBe(false);

  // Neuladen in der Lobby: Figur bleibt (Reconnect mit Token).
  await b.page.reload();
  await expect(b.page.getByTestId('slot-2')).toHaveAttribute('data-screen', 'lobby');
  await expect(card(b.page, 'robot')).toHaveAttribute('data-state', 'mine');
  await expect(card(b.page, 'raccoon')).toHaveAttribute('data-state', 'taken');

  expectNoProblems(a.problems, 'iPhone A');
  expectNoProblems(b.problems, 'iPhone B');
});

test('Pause, vorzeitiges Ende und Revanche; Neuladen in Pause und Endstand stellt den Bildschirm wieder her', async ({
  openDevice,
  chaosServer,
}) => {
  host = await SyntheticHost.connect(chaosServer);
  const a = await openPhone(openDevice, chaosServer, 1);
  const b = await openPhone(openDevice, chaosServer, 2);
  await card(a.page, 'sock').tap();
  await expect(card(a.page, 'sock')).toHaveAttribute('data-state', 'mine');
  await a.page.getByTestId('ready-button').tap();
  await expect(a.page.getByTestId('ready-done')).toBeVisible();

  host.start(2);
  for (const [phone, slot] of [
    [a, 1],
    [b, 2],
  ] as const) {
    await expect(phone.page.getByTestId(`slot-${String(slot)}`)).toHaveAttribute(
      'data-screen',
      'board',
    );
  }

  host.pause();
  for (const phone of [a, b]) {
    await expect(phone.page.getByTestId('pause-panel')).toBeVisible();
    await expect(phone.page.getByTestId('pause-panel')).toContainText('Der PC hat angehalten');
    await expect(phone.page.locator('[data-testid^="choice-"]')).toHaveCount(0);
  }
  await a.page.reload();
  await expect(a.page.getByTestId('slot-1')).toHaveAttribute('data-screen', 'pause');

  host.resume();
  await expect(a.page.getByTestId('slot-1')).toHaveAttribute('data-screen', 'board');

  host.endGame();
  for (const phone of [a, b]) {
    const final = phone.page.getByTestId('final-result');
    await expect(final).toHaveAttribute('data-ended-early', 'true');
    await expect(phone.page.getByTestId('final-ended-early')).toBeVisible();
    await expect(phone.page.getByTestId('final-rematch')).toContainText('Nochmal spielen');
    await expect(phone.page.getByTestId('final-place')).toBeVisible();
  }
  const place = await a.page.getByTestId('final-place').getAttribute('data-place');
  await a.page.reload();
  await expect(a.page.getByTestId('slot-1')).toHaveAttribute('data-screen', 'final');
  await expect(a.page.getByTestId('final-place')).toHaveAttribute('data-place', place ?? '');
  // Eigene Figur im Endstand.
  await expect(a.page.locator('.final-portrait')).toHaveAttribute('data-character', 'sock');

  // Revanche: zurück in die Lobby, Figur bleibt, bereit zurückgesetzt.
  host.rematch();
  await expect(a.page.getByTestId('slot-1')).toHaveAttribute('data-screen', 'lobby');
  await expect(card(a.page, 'sock')).toHaveAttribute('data-state', 'mine');
  await expect(a.page.getByTestId('ready-button')).toBeVisible();
  await expect(card(b.page, 'sock')).toHaveAttribute('data-state', 'taken');
  await expect(b.page.getByTestId('ready-button')).toBeVisible();

  expectNoProblems(a.problems, 'iPhone A');
  expectNoProblems(b.problems, 'iPhone B');
});

test('gemischt: zwei iPhones und ein iPad mit zwei Zonen wählen je eine eigene Figur', async ({
  openDevice,
  chaosServer,
}) => {
  host = await SyntheticHost.connect(chaosServer);
  const a = await openPhone(openDevice, chaosServer, 1);
  const b = await openPhone(openDevice, chaosServer, 2);
  const ipad = await openDevice('iPad Pro 11 landscape');
  const ipadProblems = collectProblems(ipad);
  await ipad.goto(`${chaosServer.joinUrl}&seats=2`);
  const zone = (slot: number) => ipad.getByTestId(`zone-${String(slot)}`);
  // Das iPad bekommt die nächsten freien Plätze 3 und 4.
  await expect(zone(3)).toHaveAttribute('data-screen', 'lobby');
  await expect(zone(4)).toHaveAttribute('data-screen', 'lobby');

  await card(a.page, 'robot').tap();
  await card(b.page, 'cactus').tap();
  for (const slot of [3, 4]) {
    await expect(zone(slot).getByTestId('character-robot')).toHaveAttribute('data-state', 'taken');
    await expect(zone(slot).getByTestId('character-cactus')).toHaveAttribute('data-state', 'taken');
    // Besitzer auf anderen Geräten (Server `takenBy`, CHAOS-40): Farbe und Name des iPhones.
    await expect(zone(slot).getByTestId('character-robot')).toHaveAttribute('data-owner', '1');
    await expect(zone(slot).getByTestId('character-cactus')).toHaveAttribute('data-owner', '2');
    await expect(zone(slot).getByTestId('character-robot')).toContainText('Blau hat sie');
  }
  // … und umgekehrt: iPhone A sieht Kalle in Orange (iPhone B).
  await expect(card(a.page, 'cactus')).toHaveAttribute('data-owner', '2');

  // Zone 3 und Zone 4 wählen gleichzeitig mit zwei Fingern.
  const touch = await TouchScreen.create(ipad);
  await touch.down(1, await centerOf(zone(3).getByTestId('character-raccoon')));
  await touch.down(2, await centerOf(zone(4).getByTestId('character-sock')));
  await expect(zone(3).getByTestId('character-raccoon')).toHaveAttribute('data-pressed', 'true');
  await touch.upAll();
  await expect(zone(3).getByTestId('character-raccoon')).toHaveAttribute('data-state', 'mine');
  await expect(zone(4).getByTestId('character-sock')).toHaveAttribute('data-state', 'mine');
  // Nachbarzone auf demselben iPad: Besitzer bekannt (Farbe von Platz 3).
  await expect(zone(4).getByTestId('character-raccoon')).toHaveAttribute('data-owner', '3');
  await expect(zone(4).getByTestId('character-raccoon')).toContainText('Grün');
  await expect(card(a.page, 'raccoon')).toHaveAttribute('data-state', 'taken');
  await expect(card(a.page, 'sock')).toHaveAttribute('data-state', 'taken');

  // Alle bereit: iPhones tippen, iPad-Zonen tippen gleichzeitig.
  await a.page.getByTestId('ready-button').tap();
  await b.page.getByTestId('ready-button').tap();
  await touch.down(1, await centerOf(zone(3).getByTestId('ready-button')));
  await touch.down(2, await centerOf(zone(4).getByTestId('ready-button')));
  await touch.upAll();
  await expect
    .poll(() => host?.lastLobby()?.players.map((p) => [p.slot, p.character, p.ready]))
    .toEqual([
      [1, 'robot', true],
      [2, 'cactus', true],
      [3, 'raccoon', true],
      [4, 'sock', true],
    ]);
  await expect(zone(3).getByTestId('ready-done')).toBeVisible();

  if (process.env.CONTROLLER_BELEG) {
    await ipad.screenshot({ path: 'docs/screenshots/m4-ipad-gemischt-lobby.png' });
  }

  host.start(1);
  await expect(a.page.getByTestId('slot-1')).toHaveAttribute('data-screen', 'board');
  await expect(zone(3)).toHaveAttribute('data-screen', 'board');
  await expect(zone(4)).toHaveAttribute('data-screen', 'board');

  // iPad neu laden mitten im Brett: beide Zonen kommen zurück.
  await ipad.reload();
  await expect(zone(3)).toHaveAttribute('data-screen', 'board');
  await expect(zone(4)).toHaveAttribute('data-screen', 'board');

  expectNoProblems(a.problems, 'iPhone A');
  expectNoProblems(b.problems, 'iPhone B');
  expectNoProblems(ipadProblems, 'iPad');
});
