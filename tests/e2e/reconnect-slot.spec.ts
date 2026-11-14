/**
 * Wiederverbinden am echten Server (CHAOS-12, ADR-009): Controller-Seite (iPhone-Emulation)
 * und Host-Seite gegen dieselbe Session.
 *
 * Diese Specs starten einen **eigenen** Server im Testprozess (`createChaosServer`, Port 0,
 * eigener Join-Code) mit den Production-Builds, die der Playwright-Webserver vorher gebaut
 * hat. So bleibt die gemeinsame E2E-Session (Port `E2E_PORT`, `JOIN_CODE=E2ETEST`) unberührt,
 * die nach `host-lobby.spec.ts` bereits im Spiel ist (dort ist kein Beitritt mehr möglich).
 *
 * Den Abbruch erzeugt `page.routeWebSocket`: Die Verbindung wird zum Server durchgereicht,
 * der Test schließt sie serverseitig und lässt neue Versuche vorübergehend scheitern.
 *
 * Was das **nicht** beweist: iOS-Bildschirmsperre, eingefrorene Safari-Tabs, WLAN-Wechsel,
 * echte Funklöcher – das gehört in die Gerätecheckliste.
 */
import { fileURLToPath } from 'node:url';
import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';
import type {} from '../../apps/host/src/testHook.ts';
import { createChaosServer, type ChaosServer } from '../../apps/server/src/server.ts';
import { centerOf, TouchScreen } from './fixtures/touch.ts';

const JOIN_CODE = 'RECO';

let server: ChaosServer;
let base: string;
const servers: ChaosServer[] = [];

/** Eigener Server mit frischer Session (Lobby) auf freiem Port. */
async function startServer(): Promise<{ server: ChaosServer; base: string }> {
  const instance = createChaosServer({
    staticDir: fileURLToPath(new URL('../../apps/controller/dist', import.meta.url)),
    hostDir: fileURLToPath(new URL('../../apps/host/dist', import.meta.url)),
    joinCode: JOIN_CODE,
  });
  servers.push(instance);
  const address = await instance.listen(0, '127.0.0.1');
  return { server: instance, base: `http://127.0.0.1:${String(address.port)}` };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ server, base } = await startServer());
});

test.afterAll(async () => {
  await Promise.all(servers.map((instance) => instance.close()));
});

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

async function newPhone(browser: Browser): Promise<BrowserContext> {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
  return browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
}

let phoneContext: BrowserContext;
let phone: Page;
let host: Page;
let link: LinkControl;
const phoneErrors: string[] = [];
const hostErrors: string[] = [];

test.afterAll(async () => {
  await phoneContext.close();
});

test('Abbruch → Overlay mit Versuchen → automatischer Reconnect auf denselben Platz; Host zeigt getrennt/wieder da', async ({
  browser,
}) => {
  host = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  contexts.push(host.context());
  host.on('pageerror', (error) => hostErrors.push(error.message));
  await host.goto(`${base}/host/?test=1&seed=12`);
  await expect(host.getByTestId('connection')).toHaveAttribute('data-status', 'connected');
  await host.waitForFunction(() => window.__chaos?.ready === true);

  phoneContext = await newPhone(browser);
  phone = await phoneContext.newPage();
  phone.on('pageerror', (error) => phoneErrors.push(error.message));
  link = await LinkControl.attach(phone);
  await phone.goto(`${base}/?code=${JOIN_CODE}`);
  const slot = phone.getByTestId('slot-1');
  await expect(slot).toHaveAttribute('data-layout', 'lobby');
  await expect(phone.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
  await expect(host.getByTestId('lobby-player-1')).toHaveAttribute('data-connected', 'true');

  // Spiel starten: Im Spiel bleibt der Platz für die ganze Partie reserviert.
  await host.getByTestId('start-button').click();
  await expect(slot).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect(host.getByTestId('player-chip-1')).toHaveAttribute('data-connected', 'true');

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
  expect(server.session.snapshot().players.map((p) => [p.slot, p.connected])).toEqual([[1, true]]);

  // Eingaben fließen wieder (neue Verbindung, neue Sequenznummern).
  const before = await host.evaluate(() => window.__chaos?.networkInputs ?? 0);
  await phone.getByTestId('button-a').tap();
  await host.waitForFunction((n) => (window.__chaos?.networkInputs ?? 0) >= n + 2, before);

  expect(phoneErrors).toEqual([]);
  expect(hostErrors).toEqual([]);
});

test('Neuladen der Controller-Seite behält den Platz', async () => {
  await phone.reload();
  await expect(phone.getByTestId('slot-1')).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect(phone.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
  await expect(host.getByTestId('player-chip-1')).toHaveAttribute('data-connected', 'true');
  expect(server.session.snapshot().players).toHaveLength(1);
  expect(phoneErrors).toEqual([]);
});

test('ein zweiter Tab mit demselben Token übernimmt den Platz; der alte drängelt nicht zurück', async () => {
  // Erneuter QR-Scan öffnet einen neuen Tab; das Token liegt gerätweit (localStorage).
  const second = await phoneContext.newPage();
  await second.goto(`${base}/?code=${JOIN_CODE}`);
  await expect(second.getByTestId('slot-1')).toHaveAttribute('data-layout', 'joystick-buttons');
  await expect(phone.getByTestId('error-screen')).toHaveAttribute('data-code', 'replaced');
  await expect(phone.getByTestId('error-screen')).toContainText('anderen Fenster');
  // Kein Hin und Her: Der neue Tab bleibt verbunden.
  await expect(second.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
  expect(server.session.snapshot().players.map((p) => [p.slot, p.connected])).toEqual([[1, true]]);
  await second.close();
});

test('geteiltes iPad: alle Plätze kommen zurück, gehaltener Joystick wird losgelassen', async ({
  browser,
}) => {
  const ipadServer = await startServer();
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
    devices['iPad Pro 11 landscape'];
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
  });
  try {
    const ipad = await context.newPage();
    const errors: string[] = [];
    ipad.on('pageerror', (error) => errors.push(error.message));
    const control = await LinkControl.attach(ipad);
    await ipad.goto(`${ipadServer.base}/?code=${JOIN_CODE}&seats=2`);
    const zone = (slot: number) => ipad.getByTestId(`zone-${String(slot)}`);
    await expect(zone(1)).toHaveAttribute('data-layout', 'lobby');
    await expect(zone(2)).toHaveAttribute('data-layout', 'lobby');
    await expect(ipad.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');

    // Host verbindet sich und startet, damit die Zonen Joysticks zeigen.
    const host = await (await browser.newContext()).newPage();
    contexts.push(host.context());
    await host.goto(`${ipadServer.base}/host/?test=1&seed=3`);
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
    expect(ipadServer.server.session.snapshot().players.map((p) => p.connected)).toEqual([
      false,
      false,
    ]);

    control.blocked = false;
    await expect(ipad.getByTestId('connection-overlay')).toHaveCount(0);
    await expect(zone(1)).toHaveAttribute('data-layout', 'joystick-buttons');
    await expect(zone(2)).toHaveAttribute('data-layout', 'joystick-buttons');
    await expect
      .poll(() => ipadServer.server.session.snapshot().players.map((p) => [p.slot, p.connected]))
      .toEqual([
        [1, true],
        [2, true],
      ]);
    await expect(host.getByTestId('player-chip-2')).toHaveAttribute('data-connected', 'true');
    // Der alte Finger steuert nichts mehr; erst ein neuer Griff bewegt den Stick.
    await touch.move(1, { x: start.x + 80, y: start.y }, 3);
    await expect(stick).toHaveAttribute('data-active', 'false');
    await touch.upAll();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

const contexts: BrowserContext[] = [];
test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
});
