/**
 * Wiederverbinden am echten Server (CHAOS-12, ADR-009): Controller-Seite (iPhone-Emulation)
 * und Host-Seite gegen dieselbe Session.
 *
 * Jeder Test hat seinen eigenen Server mit frischer Session (Fixture `chaosServer`,
 * CHAOS-14) und baut seinen Zustand selbst auf; keine Reihenfolge zwischen den Tests.
 *
 * Den Abbruch erzeugt `page.routeWebSocket`: Die Verbindung wird zum Server durchgereicht,
 * der Test schließt sie serverseitig und lässt neue Versuche vorübergehend scheitern.
 * (Den Abbruch per Offline-Schalten des Geräts prüft `m1-durchstich.spec.ts`.)
 *
 * Was das **nicht** beweist: iOS-Bildschirmsperre, eingefrorene Safari-Tabs, WLAN-Wechsel,
 * echte Funklöcher – das gehört in die Gerätecheckliste.
 */
import type { Page, WebSocketRoute } from '@playwright/test';
import type {} from '../../apps/host/src/testHook.ts';
import { collectProblems, expectNoProblems, openHost, type Problems } from './fixtures/pages.ts';
import type { RunningServer } from './fixtures/server.ts';
import { expect, test, type DeviceName } from './fixtures/test.ts';
import { centerOf, TouchScreen } from './fixtures/touch.ts';

/** Steuerbare Verbindung des Controllers: durchreichen, trennen, blockieren. */
class LinkControl {
  blocked = false;
  attempts = 0;
  private current: { page: WebSocketRoute; server: WebSocketRoute } | null = null;

  static async attach(page: Page): Promise<LinkControl> {
    const control = new LinkControl();
    await page.routeWebSocket(/\/ws$/, (ws) => {
      control.attempts += 1;
      if (control.blocked) {
        // PC „nicht erreichbar“: Der Versuch scheitert sofort.
        void ws.close({ code: 1011, reason: 'blockiert' });
        return;
      }
      control.current = { page: ws, server: ws.connectToServer() };
    });
    return control;
  }

  /** Beide Seiten schließen (Server sieht die Trennung sofort); weitere Versuche blockieren. */
  async drop() {
    this.blocked = true;
    const current = this.current;
    this.current = null;
    await current?.server.close({ code: 1001, reason: 'weg' });
    await current?.page.close({ code: 4000, reason: 'weg' });
  }
}

interface Setup {
  host: Page;
  phone: Page;
  link: LinkControl;
  hostProblems: Problems;
  phoneProblems: Problems;
}

/** Host öffnen, ein iPhone tritt bei (Verbindung über {@link LinkControl}), Spiel starten. */
async function hostWithPhoneInPlay(
  openDevice: (name: DeviceName) => Promise<Page>,
  chaosServer: RunningServer,
): Promise<Setup> {
  const host = await openDevice('PC');
  const hostProblems = collectProblems(host);
  await openHost(host, '/host/?test=1&seed=12');
  const phone = await openDevice('iPhone 13');
  const phoneProblems = collectProblems(phone);
  const link = await LinkControl.attach(phone);
  await phone.goto(chaosServer.joinUrl);
  const slot = phone.getByTestId('slot-1');
  await expect(slot).toHaveAttribute('data-layout', 'lobby');
  await expect(phone.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
  await expect(host.getByTestId('lobby-player-1')).toHaveAttribute('data-connected', 'true');

  // Spiel starten: Im Spiel bleibt der Platz für die ganze Partie reserviert.
  await host.getByTestId('start-button').click();
  await expect(slot).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect(host.getByTestId('player-chip-1')).toHaveAttribute('data-connected', 'true');
  return { host, phone, link, hostProblems, phoneProblems };
}

test('Abbruch → Overlay mit Versuchen → automatischer Reconnect auf denselben Platz; Host zeigt getrennt/wieder da', async ({
  openDevice,
  chaosServer,
}) => {
  const { host, phone, link, hostProblems, phoneProblems } = await hostWithPhoneInPlay(
    openDevice,
    chaosServer,
  );
  const slot = phone.getByTestId('slot-1');

  // Verbindung reißt ab, der PC ist kurz nicht erreichbar.
  await link.drop();
  const overlay = phone.getByTestId('connection-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('Verbindung verloren');
  await expect(overlay).toContainText('verbinde neu');
  await expect(overlay).toHaveAttribute('data-attempt', '2');
  await expect(overlay).toContainText('Versuch 2');
  await expect(phone.getByTestId('reconnect-now')).toBeVisible();
  // Host: Chip „getrennt“ und eine große Meldung.
  const chip = host.getByTestId('player-chip-1');
  await expect(chip).toHaveAttribute('data-connected', 'false');
  await expect(chip).toContainText('getrennt');
  await expect(
    host.locator('[data-testid="player-toast"][data-kind="lost"]', {
      hasText: 'Blau hat die Verbindung verloren',
    }),
  ).toBeVisible();

  // PC wieder erreichbar: nächster automatischer Versuch gelingt.
  link.blocked = false;
  await expect(overlay).toHaveCount(0);
  await expect(phone.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
  await expect(slot).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect(phone.getByTestId('player-badge')).toContainText('Blau');
  await expect(chip).toHaveAttribute('data-connected', 'true');
  await expect(
    host.locator('[data-testid="player-toast"][data-kind="back"]', {
      hasText: 'Blau ist wieder da',
    }),
  ).toBeVisible();
  expect(chaosServer.server.session.snapshot().players.map((p) => [p.slot, p.connected])).toEqual([
    [1, true],
  ]);

  // Eingaben fließen wieder (neue Verbindung, neue Sequenznummern).
  const before = await host.evaluate(() => window.__chaos?.networkInputs ?? 0);
  await phone.getByTestId('button-a').tap();
  await host.waitForFunction((n) => (window.__chaos?.networkInputs ?? 0) >= n + 2, before);

  expectNoProblems(phoneProblems, 'iPhone');
  expectNoProblems(hostProblems, 'Host');
});

test('Neuladen der Controller-Seite behält den Platz', async ({ openDevice, chaosServer }) => {
  const { host, phone, phoneProblems } = await hostWithPhoneInPlay(openDevice, chaosServer);
  await phone.reload();
  await expect(phone.getByTestId('slot-1')).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect(phone.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
  await expect(host.getByTestId('player-chip-1')).toHaveAttribute('data-connected', 'true');
  expect(chaosServer.server.session.snapshot().players).toHaveLength(1);
  expectNoProblems(phoneProblems, 'iPhone');
});

test('ein zweiter Tab mit demselben Token übernimmt den Platz; der alte drängelt nicht zurück', async ({
  openDevice,
  chaosServer,
}) => {
  const { phone } = await hostWithPhoneInPlay(openDevice, chaosServer);
  // Erneuter QR-Scan öffnet einen neuen Tab; das Token liegt gerätweit (localStorage).
  const second = await phone.context().newPage();
  await second.goto(chaosServer.joinUrl);
  await expect(second.getByTestId('slot-1')).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect(phone.getByTestId('error-screen')).toHaveAttribute('data-code', 'replaced');
  await expect(phone.getByTestId('error-screen')).toContainText('anderen Fenster');
  // Kein Hin und Her: Der neue Tab bleibt verbunden.
  await expect(second.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
  expect(chaosServer.server.session.snapshot().players.map((p) => [p.slot, p.connected])).toEqual([
    [1, true],
  ]);
  await second.close();
});

test('geteiltes iPad: alle Plätze kommen zurück, gehaltener Joystick wird losgelassen', async ({
  openDevice,
  chaosServer,
}) => {
  const ipad = await openDevice('iPad Pro 11 landscape');
  const problems = collectProblems(ipad);
  const control = await LinkControl.attach(ipad);
  await ipad.goto(`${chaosServer.joinUrl}&seats=2`);
  const zone = (slot: number) => ipad.getByTestId(`zone-${String(slot)}`);
  await expect(zone(1)).toHaveAttribute('data-layout', 'lobby');
  await expect(zone(2)).toHaveAttribute('data-layout', 'lobby');
  await expect(ipad.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');

  // Host verbindet sich und startet, damit die Zonen Joysticks zeigen.
  const host = await openDevice('PC');
  await host.goto('/host/?test=1&seed=3');
  await expect(host.getByTestId('start-button')).toBeEnabled();
  await host.getByTestId('start-button').click();
  await expect(zone(1)).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect(zone(2)).toHaveAttribute('data-layout', 'joystick-buttons');

  // Finger hält den Joystick in Zone 1 ausgelenkt, dann reißt die Verbindung ab.
  const touch = await TouchScreen.create(ipad);
  const stick = zone(1).getByTestId('joystick');
  const start = await centerOf(stick);
  await touch.down(1, start);
  await touch.move(1, { x: start.x + 60, y: start.y }, 6);
  await expect(stick).toHaveAttribute('data-active', 'true');
  await control.drop();
  await expect(ipad.getByTestId('connection-overlay')).toBeVisible();
  // Beim Abriss lässt die Zone los (Anzeige und Tracker), auch wenn der Finger liegt.
  await expect(stick).toHaveAttribute('data-active', 'false');
  await expect
    .poll(() => chaosServer.server.session.snapshot().players.map((p) => p.connected))
    .toEqual([false, false]);

  control.blocked = false;
  await expect(ipad.getByTestId('connection-overlay')).toHaveCount(0);
  await expect(zone(1)).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect(zone(2)).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect
    .poll(() => chaosServer.server.session.snapshot().players.map((p) => [p.slot, p.connected]))
    .toEqual([
      [1, true],
      [2, true],
    ]);
  await expect(host.getByTestId('player-chip-2')).toHaveAttribute('data-connected', 'true');
  // Der alte Finger steuert nichts mehr; erst ein neuer Griff bewegt den Stick.
  await touch.move(1, { x: start.x + 80, y: start.y }, 3);
  await expect(stick).toHaveAttribute('data-active', 'false');
  await touch.upAll();
  expect(problems.pageErrors).toEqual([]);
});
