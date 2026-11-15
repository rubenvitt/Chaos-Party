/**
 * Messanzeige mit `?debug=1` (CHAOS-45, ADR-010): echte Host- und Controller-Seiten am
 * echten Server.
 *
 * - Host **ohne** Testmodus: Die Render-Schleife läuft wie beim Spielen, Bildrate und
 *   Bildabstand sind echte Messwerte (hier: Software-Rendering per SwiftShader).
 * - Controller (iPhone- und iPad-Modus) mit Herzschlag jede Sekunde: Die Rundlaufzeit
 *   kommt aus `heartbeat`/`heartbeat-ack` über den echten Server.
 *
 * Geprüft wird nur, dass die Anzeigen erscheinen und Zahlen enthalten – **keine**
 * Schwellen: Werte aus Chromium-Emulation auf einem CI-Rechner sagen nichts über echte
 * Geräte. Ohne `debug` gibt es keine Anzeige (die Screenshot-Baselines bleiben gleich).
 */
import type { Locator, Page } from '@playwright/test';
import { collectProblems, expectNoProblems } from './fixtures/pages.ts';
import { expect, test } from './fixtures/test.ts';
import { centerOf, TouchScreen } from './fixtures/touch.ts';

/** Millisekunden-Anzeige: ganze Zahl oder eine Nachkommastelle (`formatMs`). */
const MS = /^\d+(\.\d)?$/;
/** Bildrate mit einer Nachkommastelle. */
const FPS = /^\d+\.\d$/;

async function numberIn(locator: Locator): Promise<number> {
  return Number(await locator.textContent());
}

/** Host im Server-Modus ohne Testmodus öffnen: Szene und Verbindung stehen. */
async function openLiveHost(page: Page, url: string) {
  await page.goto(url);
  const main = page.locator('main.host');
  await expect(main).toHaveAttribute('data-mode', 'server');
  await expect(main).toHaveAttribute('data-scene', 'ready');
  await expect(page.getByTestId('connection')).toHaveAttribute('data-status', 'connected');
}

/** Wartet, bis der Controller mindestens `n` Rundlaufzeiten gemessen hat. */
async function waitForRttSamples(controller: Page, n: number) {
  const overlay = controller.getByTestId('debug-overlay');
  await expect
    .poll(() => numberIn(overlay.getByTestId('debug-rtt-count')), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(n);
}

test.describe('Messanzeige (?debug=1)', () => {
  test.describe.configure({ timeout: 90_000 });

  test('Host und iPhone zeigen Bildrate, Eingabe→Frame und Rundlaufzeit als Zahlen', async ({
    page: host,
    openDevice,
    chaosServer,
  }) => {
    const hostProblems = collectProblems(host);
    await openLiveHost(host, '/host/?debug=1&arena=1');
    const hostOverlay = host.getByTestId('debug-overlay');
    await expect(hostOverlay).toBeVisible();
    // Render-Schleife läuft: Bildrate und Bildabstand sind Zahlen, Grafik ist bekannt.
    await expect(hostOverlay.getByTestId('debug-fps')).toHaveText(FPS);
    await expect(hostOverlay.getByTestId('debug-frame-p95')).toHaveText(MS);
    await expect(hostOverlay.getByTestId('debug-renderer')).toHaveText(
      /^WebGL[12] .+ \d+×\d+( Grafik .+)?$/,
    );
    // Noch keine Eingabe: kein Messwert statt 0.
    await expect(hostOverlay.getByTestId('debug-input-median')).toHaveText('–');

    const phone = await openDevice('iPhone 13 landscape');
    const phoneProblems = collectProblems(phone);
    await phone.goto(`${chaosServer.joinUrl}&debug=1`);
    await expect(phone.getByTestId('slot-1')).toHaveAttribute('data-layout', 'lobby');
    const phoneOverlay = phone.getByTestId('debug-overlay');
    await expect(phoneOverlay).toBeVisible();

    // Herzschlag jede Sekunde → nach wenigen Sekunden mehrere Rundlaufzeiten.
    await waitForRttSamples(phone, 2);
    await expect(phoneOverlay.getByTestId('debug-rtt-median')).toHaveText(MS);
    await expect(phoneOverlay.getByTestId('debug-rtt-p95')).toHaveText(MS);
    await expect(phoneOverlay.getByTestId('debug-rtt-last')).toHaveText(MS);
    await expect(phoneOverlay).toContainText('/ ');

    // Ins Spiel, dann den Joystick ziehen: Eingaben laufen über den Server zum Host.
    await phone.getByTestId('ready-button').tap();
    await expect(host.getByTestId('lobby-player-1')).toHaveAttribute('data-ready', 'true');
    await host.getByTestId('start-button').click();
    await expect(host.locator('main.host')).toHaveAttribute('data-phase', 'play');
    const stick = phone.getByTestId('joystick');
    await expect(stick).toBeVisible();
    const touch = await TouchScreen.create(phone);
    const from = await centerOf(stick);
    await touch.down(1, from);
    await touch.move(1, { x: from.x + 80, y: from.y }, 8);
    await touch.move(1, { x: from.x, y: from.y - 80 }, 8);
    await touch.upAll();

    // Host: jede Eingabe bekommt ihre Zeit bis zum nächsten Bild.
    await expect
      .poll(() => numberIn(hostOverlay.getByTestId('debug-input-count')), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(hostOverlay.getByTestId('debug-input-median')).toHaveText(MS);
    await expect(hostOverlay.getByTestId('debug-input-p95')).toHaveText(MS);
    // Controller: Eingaberate ist eine Zahl (ganzzahlig).
    await expect(phoneOverlay.getByTestId('debug-inputs')).toHaveText(/^\d+$/);

    expectNoProblems(hostProblems, 'Host');
    expectNoProblems(phoneProblems, 'iPhone');
  });

  test('geteiltes iPad zeigt die Rundlaufzeit seiner einen Verbindung', async ({
    openDevice,
    chaosServer,
  }) => {
    const ipad = await openDevice('iPad Pro 11 landscape');
    const problems = collectProblems(ipad);
    await ipad.goto(`${chaosServer.joinUrl}&seats=2&debug=1`);
    await expect(ipad.getByTestId('zone-board')).toBeVisible();
    await expect(ipad.getByTestId('debug-overlay')).toBeVisible();
    await waitForRttSamples(ipad, 2);
    await expect(ipad.getByTestId('debug-rtt-median')).toHaveText(MS);
    await expect(ipad.getByTestId('debug-overlay')).toHaveAttribute('data-heartbeat-ms', '1000');
    expectNoProblems(problems, 'iPad');
  });

  test('ohne debug gibt es keine Messanzeige', async ({ page: host, openDevice, chaosServer }) => {
    await openLiveHost(host, '/host/');
    const phone = await openDevice('iPhone 13');
    await phone.goto(chaosServer.joinUrl);
    await expect(phone.getByTestId('slot-1')).toHaveAttribute('data-layout', 'lobby');
    await expect(phone.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
    await expect(phone.getByTestId('debug-overlay')).toHaveCount(0);
    await expect(host.getByTestId('lobby-player-1')).toBeVisible();
    await expect(host.getByTestId('debug-overlay')).toHaveCount(0);
  });
});
