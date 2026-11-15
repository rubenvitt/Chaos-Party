/**
 * M1-Durchstich (CHAOS-14): echte Seiten gegen den echten Server – kein nachgebauter
 * Session-Server, keine synthetischen WebSocket-Clients.
 *
 * - Host: Production-Build unter `/host/?test=1` (feste Zeitschritte, `window.__chaos`).
 * - Controller: Production-Build, je Gerät ein eigener Browser-Kontext mit iPhone- bzw.
 *   iPad-Emulation in Chromium; geöffnet über den Join-Link, den die Lobby als QR-Code zeigt.
 * - Touch: echte Touch-Ereignisse per CDP (`fixtures/touch.ts`), auf mehreren Seiten bzw.
 *   mit mehreren Fingern **zeitlich überlappend**.
 *
 * Bewegungen werden mit Toleranzen geprüft (Richtung und Mindestweg, keine exakten
 * Positionen; Annahme C4). Gewartet wird ereignisgesteuert: auf DOM-Zustände und auf den
 * Testhaken `lastMoves`/`networkInputs` am Host; feste Zeit vergeht nur in `stepFrames`.
 *
 * Was das **nicht** beweist: echtes iOS-/iPadOS-Multitouch, Safari-Eigenheiten, WLAN,
 * Kamera-Scan, Latenz auf echten Geräten – siehe `docs/device-test-checklist.md`.
 */
import type { Locator, Page } from '@playwright/test';
import type {} from '../../apps/host/src/testHook.ts';
import {
  collectProblems,
  cutNetwork,
  expectNoProblems,
  horizontalDistance,
  networkInputs,
  openHost,
  pick,
  position,
  positions,
  restoreNetwork,
  stepFrames,
  trackWebSockets,
  waitForHostStick,
  type Position,
  type Problems,
} from './fixtures/pages.ts';
import { expect, test } from './fixtures/test.ts';
import { centerOf, TouchScreen, type Point } from './fixtures/touch.ts';

/** Seed 2026: Startpunkte weit genug auseinander, keine Wege kreuzen sich (spawn.ts). */
const HOST_URL = '/host/?test=1&seed=2026&arena=1';
/** Frames, bis die Figuren nach dem Spawn bzw. nach dem Loslassen ruhen. */
const SETTLE_FRAMES = 60;
/** 0,5 s Laufen bei vollem Ausschlag (bis 6 m/s): deutlich mehr als 1 m. */
const MOVE_FRAMES = 30;
/** Mindestweg in Stick-Richtung und höchster Querversatz (Toleranzen, C4). */
const MIN_TRAVEL = 1;
const MAX_DRIFT = 0.5;
/** Ein stehender Spieler bewegt sich praktisch nicht. */
const STILL = 0.05;

type Direction = 'right' | 'left' | 'up' | 'down';

/** Bildschirm-Versatz für einen vollen Ausschlag (oben auf dem Bildschirm = vorn = +y). */
function dragTarget(start: Point, direction: Direction, distance: number): Point {
  switch (direction) {
    case 'right':
      return { x: start.x + distance, y: start.y };
    case 'left':
      return { x: start.x - distance, y: start.y };
    case 'up':
      return { x: start.x, y: start.y - distance };
    case 'down':
      return { x: start.x, y: start.y + distance };
  }
}

/** Zieht weit genug für vollen Ausschlag: die ganze Joystick-Breite. */
async function dragDistance(stick: Locator): Promise<number> {
  const box = await stick.boundingBox();
  if (!box) throw new Error('Joystick nicht sichtbar');
  return box.width;
}

/** Erwartet: Figur lief in Richtung `direction` (Welt: rechts = +x, vorn = +z). */
function expectMoved(before: Position, after: Position, direction: Direction) {
  const dx = after.x - before.x;
  const dz = after.z - before.z;
  const [along, across] =
    direction === 'right'
      ? [dx, dz]
      : direction === 'left'
        ? [-dx, dz]
        : direction === 'up'
          ? [dz, dx]
          : [-dz, dx];
  expect(along, `Weg nach ${direction}`).toBeGreaterThan(MIN_TRAVEL);
  expect(Math.abs(across), `Querversatz bei ${direction}`).toBeLessThan(MAX_DRIFT);
}

/** Liest den Join-Link aus der Lobby – genau das, was der QR-Code enthält. */
async function joinLinkFromLobby(host: Page, device: 'phone' | 'ipad'): Promise<string> {
  await host.getByTestId(`join-device-${device}`).click();
  await expect(host.getByTestId(`join-device-${device}`)).toHaveAttribute('aria-pressed', 'true');
  const qr = host.getByTestId('join-qr');
  const link = await qr.getAttribute('data-value');
  if (!link) throw new Error('QR-Code ohne Link');
  // Der sichtbare Link unter dem QR-Code ist derselbe.
  await expect(host.getByTestId('join-url')).toHaveText(link);
  return link;
}

/** Konsolenfehler, die beim absichtlichen Offline-Schalten erwartet sind. */
function withoutOfflineNoise(problems: Problems): Problems {
  return {
    pageErrors: problems.pageErrors,
    consoleErrors: problems.consoleErrors.filter(
      (text) => !/WebSocket connection to .* failed|ERR_INTERNET_DISCONNECTED/.test(text),
    ),
  };
}

/** Texte maskieren: Schriften unterscheiden sich zwischen Rechnern (ADR-004). */
const hudMask = (page: Page) => [
  page.locator(
    '.hud-title, .hud-connection, .player-label, .player-state, .player-keys, .player-symbol',
  ),
];

test.describe('M1-Durchstich: Host + echte Controller-Seiten am echten Server', () => {
  // Physik läuft nur mit Rendern (`stepFrames`), und Rendern ist Software (SwiftShader):
  // ein Durchstich mit ~250 Frames braucht lokal ~20 s. Doppelte Reserve für CI-Runner.
  test.describe.configure({ timeout: 120_000 });

  test('zwei iPhones: Join-Link, Bereit, Start, gleichzeitige Joysticks, Schubser, Trennen und Wiederverbinden', async ({
    page: host,
    openDevice,
    chaosServer,
  }) => {
    const hostProblems = collectProblems(host);
    await openHost(host, HOST_URL);
    const joinUrl = await joinLinkFromLobby(host, 'phone');

    // Zwei Handys (eigene Kontexte = eigener Speicher) öffnen den Link aus dem QR-Code.
    const phone1 = await openDevice('iPhone 13 landscape');
    const phone2 = await openDevice('iPhone 13 landscape');
    const phone1Problems = collectProblems(phone1);
    const phone2Problems = collectProblems(phone2);
    await trackWebSockets(phone1);
    await phone1.goto(joinUrl);
    await expect(phone1.getByTestId('slot-1')).toHaveAttribute('data-layout', 'lobby');
    await phone2.goto(joinUrl);
    await expect(phone2.getByTestId('slot-2')).toHaveAttribute('data-layout', 'lobby');

    // Verschiedene Plätze und Farben – auf den Handys und am Host.
    await expect(phone1.getByTestId('player-badge')).toContainText('Blau');
    await expect(phone2.getByTestId('player-badge')).toContainText('Orange');
    await expect(phone1.getByTestId('slot-2')).toHaveCount(0);
    await expect(phone2.getByTestId('slot-1')).toHaveCount(0);
    await expect(host.getByTestId('lobby-player-1')).toContainText('Blau');
    await expect(host.getByTestId('lobby-player-2')).toContainText('Orange');
    await expect(host.locator('.lobby-count')).toHaveText('2/4');

    // Beide tippen „Bereit!“, der Host startet.
    await phone1.getByTestId('ready-button').tap();
    await phone2.getByTestId('ready-button').tap();
    await expect(host.getByTestId('lobby-player-1')).toHaveAttribute('data-ready', 'true');
    await expect(host.getByTestId('lobby-player-2')).toHaveAttribute('data-ready', 'true');
    await host.getByTestId('start-button').click();
    await expect(host.locator('main.host')).toHaveAttribute('data-phase', 'play');
    for (const phone of [phone1, phone2]) {
      await expect(phone.locator('[data-testid^="slot-"]')).toHaveAttribute(
        'data-layout',
        'joystick-buttons',
      );
    }
    await expect(host.getByTestId('player-chip-1')).toContainText('Blau');
    await expect(host.getByTestId('player-chip-2')).toContainText('Orange');

    await stepFrames(host, SETTLE_FRAMES);
    const start = await positions(host);

    // Gleichzeitig: Handy 1 zieht nach rechts, Handy 2 nach oben – beide halten.
    const stick1 = phone1.getByTestId('joystick');
    const stick2 = phone2.getByTestId('joystick');
    const [touch1, touch2] = await Promise.all([
      TouchScreen.create(phone1),
      TouchScreen.create(phone2),
    ]);
    const [from1, from2] = await Promise.all([centerOf(stick1), centerOf(stick2)]);
    const [reach1, reach2] = await Promise.all([dragDistance(stick1), dragDistance(stick2)]);
    await Promise.all([touch1.down(1, from1), touch2.down(1, from2)]);
    await Promise.all([
      touch1.move(1, dragTarget(from1, 'right', reach1), 8),
      touch2.move(1, dragTarget(from2, 'up', reach2), 8),
    ]);
    // Beide Sticks sind zugleich ausgelenkt …
    await expect(stick1).toHaveAttribute('data-active', 'true');
    await expect(stick2).toHaveAttribute('data-active', 'true');
    // … und beide Stellungen sind am Host angekommen, jede bei ihrem Slot.
    await waitForHostStick(host, 1, 'right');
    await waitForHostStick(host, 2, 'up');
    await stepFrames(host, MOVE_FRAMES);
    const moved = await positions(host);
    expectMoved(pick(start, 1), pick(moved, 1), 'right');
    expectMoved(pick(start, 2), pick(moved, 2), 'up');

    // Loslassen: Der Host bekommt sofort {0, 0}; die Figuren kommen zur Ruhe.
    await Promise.all([touch1.upAll(), touch2.upAll()]);
    await waitForHostStick(host, 1, 'zero');
    await waitForHostStick(host, 2, 'zero');
    await stepFrames(host, SETTLE_FRAMES);

    // Knopf A auf Handy 2: Schubser (Impuls) nur bei Figur 2.
    const beforeDash = await positions(host);
    const inputs = await networkInputs(host);
    await phone2.getByTestId('button-a').tap();
    await host.waitForFunction((n) => (window.__chaos?.networkInputs ?? 0) >= n + 2, inputs);
    await stepFrames(host, 10);
    const afterDash = await positions(host);
    expect(horizontalDistance(pick(beforeDash, 2), pick(afterDash, 2))).toBeGreaterThan(0.5);
    expect(horizontalDistance(pick(beforeDash, 1), pick(afterDash, 1))).toBeLessThan(STILL);

    // Handy 1 verliert das Netz: Host zeigt „getrennt“, das Handy versucht es weiter.
    await cutNetwork(phone1);
    const chip1 = host.getByTestId('player-chip-1');
    await expect(chip1).toHaveAttribute('data-connected', 'false');
    await expect(chip1).toContainText('getrennt');
    await expect(phone1.getByTestId('connection-overlay')).toBeVisible();
    await expect(host.getByTestId('player-chip-2')).toHaveAttribute('data-connected', 'true');

    // Wieder online: automatisch zurück auf **denselben** Platz.
    await restoreNetwork(phone1);
    await expect(phone1.getByTestId('connection-overlay')).toHaveCount(0);
    await expect(phone1.getByTestId('connection-status')).toHaveAttribute('data-state', 'online');
    await expect(phone1.getByTestId('slot-1')).toHaveAttribute('data-layout', 'joystick-buttons');
    await expect(phone1.getByTestId('player-badge')).toContainText('Blau');
    await expect(chip1).toHaveAttribute('data-connected', 'true');
    // Kein neuer Platz: weiterhin genau zwei Spieler, beide verbunden.
    expect(chaosServer.server.session.snapshot().players.map((p) => [p.slot, p.connected])).toEqual(
      [
        [1, true],
        [2, true],
      ],
    );

    // Sein Joystick steuert wieder seine Figur (nach links), Figur 2 bleibt stehen.
    await stepFrames(host, SETTLE_FRAMES);
    const beforeReturn = await positions(host);
    const from = await centerOf(stick1);
    await touch1.down(1, from);
    await touch1.move(1, dragTarget(from, 'left', reach1), 8);
    await waitForHostStick(host, 1, 'left');
    await stepFrames(host, MOVE_FRAMES);
    const afterReturn = await positions(host);
    expectMoved(pick(beforeReturn, 1), pick(afterReturn, 1), 'left');
    expect(horizontalDistance(pick(beforeReturn, 2), pick(afterReturn, 2))).toBeLessThan(STILL);
    await touch1.upAll();
    await waitForHostStick(host, 1, 'zero');

    expectNoProblems(hostProblems, 'Host');
    expectNoProblems(withoutOfflineNoise(phone1Problems), 'iPhone 1');
    expectNoProblems(phone2Problems, 'iPhone 2');
  });

  test('geteiltes iPad: Join-Link mit seats=2, zwei Zonen, zwei Finger gleichzeitig steuern zwei Figuren', async ({
    page: host,
    openDevice,
  }) => {
    const hostProblems = collectProblems(host);
    await openHost(host, HOST_URL);
    const joinUrl = await joinLinkFromLobby(host, 'ipad');
    expect(new URL(joinUrl).searchParams.get('seats')).toBe('2');

    const ipad = await openDevice('iPad Pro 11 landscape');
    const ipadProblems = collectProblems(ipad);
    await ipad.goto(joinUrl);
    const zone = (slot: number) => ipad.getByTestId(`zone-${String(slot)}`);
    await expect(zone(1)).toHaveAttribute('data-layout', 'lobby');
    await expect(zone(2)).toHaveAttribute('data-layout', 'lobby');
    await expect(zone(1).getByTestId('player-badge')).toContainText('Blau');
    await expect(zone(2).getByTestId('player-badge')).toContainText('Orange');
    // Am Host: zwei neue Spieler aus einer Verbindung.
    await expect(host.getByTestId('lobby-player-1')).toHaveAttribute('data-connected', 'true');
    await expect(host.getByTestId('lobby-player-2')).toHaveAttribute('data-connected', 'true');
    await expect(host.locator('.lobby-count')).toHaveText('2/4');

    // Beide Personen tippen gleichzeitig „Bereit!“ (zwei Finger, zwei Zonen).
    const touch = await TouchScreen.create(ipad);
    await touch.down(1, await centerOf(zone(1).getByTestId('ready-button')));
    await touch.down(2, await centerOf(zone(2).getByTestId('ready-button')));
    await touch.upAll();
    await expect(host.getByTestId('lobby-player-1')).toHaveAttribute('data-ready', 'true');
    await expect(host.getByTestId('lobby-player-2')).toHaveAttribute('data-ready', 'true');
    await host.getByTestId('start-button').click();
    await expect(zone(1)).toHaveAttribute('data-layout', 'joystick-buttons');
    await expect(zone(2)).toHaveAttribute('data-layout', 'joystick-buttons');
    await expect(zone(1)).toHaveAttribute('data-rotation', '0');
    await expect(zone(2)).toHaveAttribute('data-rotation', '0');

    await stepFrames(host, SETTLE_FRAMES);
    const start = await positions(host);

    // Zwei Finger zugleich: Zone 1 nach rechts, Zone 2 nach unten – in denselben Touch-Ereignissen.
    const stick1 = zone(1).getByTestId('joystick');
    const stick2 = zone(2).getByTestId('joystick');
    const [from1, from2] = [await centerOf(stick1), await centerOf(stick2)];
    const [reach1, reach2] = [await dragDistance(stick1), await dragDistance(stick2)];
    await touch.down(1, from1);
    await touch.down(2, from2);
    await touch.moveAll(
      new Map([
        [1, dragTarget(from1, 'right', reach1)],
        [2, dragTarget(from2, 'down', reach2)],
      ]),
      8,
    );
    await expect(stick1).toHaveAttribute('data-active', 'true');
    await expect(stick2).toHaveAttribute('data-active', 'true');
    await waitForHostStick(host, 1, 'right');
    await waitForHostStick(host, 2, 'down');
    await stepFrames(host, MOVE_FRAMES);
    const moved = await positions(host);
    expectMoved(pick(start, 1), pick(moved, 1), 'right');
    expectMoved(pick(start, 2), pick(moved, 2), 'down');

    await touch.upAll();
    await waitForHostStick(host, 1, 'zero');
    await waitForHostStick(host, 2, 'zero');
    await stepFrames(host, SETTLE_FRAMES);

    // Zone 1 hält den Joystick nach links, gleichzeitig drückt Zone 2 Knopf A (Schubser).
    const beforeMix = await positions(host);
    const inputs = await networkInputs(host);
    const from = await centerOf(stick1);
    await touch.down(1, from);
    await touch.move(1, dragTarget(from, 'left', reach1), 6);
    await touch.down(2, await centerOf(zone(2).getByTestId('button-a')));
    await expect(zone(2).getByTestId('button-a')).toHaveAttribute('data-pressed', 'true');
    await expect(stick1).toHaveAttribute('data-active', 'true');
    await waitForHostStick(host, 1, 'left');
    // Mindestens: Bewegungen von Slot 1 und das Drücken von A (Slot 2).
    await host.waitForFunction((n) => (window.__chaos?.networkInputs ?? 0) >= n + 2, inputs);
    // Der Schubser wirkt sofort (Impuls): nach 10 Frames deutlich verschoben.
    await stepFrames(host, 10);
    const dashed = await positions(host);
    expect(horizontalDistance(pick(beforeMix, 2), pick(dashed, 2))).toBeGreaterThan(0.5);
    await stepFrames(host, MOVE_FRAMES - 10);
    const afterMix = await positions(host);
    expectMoved(pick(beforeMix, 1), pick(afterMix, 1), 'left');
    await touch.upAll();
    await waitForHostStick(host, 1, 'zero');

    expectNoProblems(hostProblems, 'Host');
    expectNoProblems(ipadProblems, 'iPad');
  });

  test('gemischt: ein iPhone und ein geteiltes iPad = drei Spieler; Szene im Spiel als Screenshot', async ({
    page: host,
    openDevice,
  }) => {
    const hostProblems = collectProblems(host);
    await openHost(host, HOST_URL);

    const phone = await openDevice('iPhone 13 landscape');
    const phoneProblems = collectProblems(phone);
    await phone.goto(await joinLinkFromLobby(host, 'phone'));
    await expect(phone.getByTestId('slot-1')).toHaveAttribute('data-layout', 'lobby');

    const ipad = await openDevice('iPad Pro 11 landscape');
    const ipadProblems = collectProblems(ipad);
    await ipad.goto(await joinLinkFromLobby(host, 'ipad'));
    const zone = (slot: number) => ipad.getByTestId(`zone-${String(slot)}`);
    // Das iPad bekommt die nächsten freien Plätze 2 und 3.
    await expect(zone(2)).toHaveAttribute('data-layout', 'lobby');
    await expect(zone(3)).toHaveAttribute('data-layout', 'lobby');
    await expect(zone(1)).toHaveCount(0);
    await expect(host.locator('.lobby-count')).toHaveText('3/4');
    for (const slot of [1, 2, 3]) {
      await expect(host.getByTestId(`lobby-player-${String(slot)}`)).toHaveAttribute(
        'data-connected',
        'true',
      );
    }

    // Start ohne „Bereit!“ ist erlaubt.
    await host.getByTestId('start-button').click();
    await expect(phone.getByTestId('slot-1')).toHaveAttribute('data-layout', 'joystick-buttons');
    await expect(zone(2)).toHaveAttribute('data-layout', 'joystick-buttons');
    await expect(zone(3)).toHaveAttribute('data-layout', 'joystick-buttons');
    for (const [slot, color] of [
      [1, 'Blau'],
      [2, 'Orange'],
      [3, 'Grün'],
    ] as const) {
      await expect(host.getByTestId(`player-chip-${String(slot)}`)).toContainText(color);
    }

    // Deterministischer Moment: alle beigetreten, Spiel gestartet, noch keine Eingabe,
    // Physik genau SETTLE_FRAMES Frames ab Spawn (ohne `stepFrames` steht die Welt still).
    await stepFrames(host, SETTLE_FRAMES);
    await expect(host.getByTestId('player-toast')).toHaveCount(0);
    if (process.env.HOST_SPIEL_BELEG) {
      // Ungemaskierter Beleg für den Abnahmebericht: HOST_SPIEL_BELEG=1 pnpm test:e2e
      await host.screenshot({ path: 'docs/screenshots/m1-host-spiel-3-spieler.png' });
    }
    await expect(host).toHaveScreenshot('host-spiel-3-spieler.png', { mask: hudMask(host) });
    const start = await positions(host);
    expect([...start.keys()].sort()).toEqual([1, 2, 3]);

    // Alle drei zugleich: iPhone nach rechts, iPad-Zone 2 nach oben, Zone 3 nach links.
    const phoneStick = phone.getByTestId('joystick');
    const stick2 = zone(2).getByTestId('joystick');
    const stick3 = zone(3).getByTestId('joystick');
    const phoneTouch = await TouchScreen.create(phone);
    const ipadTouch = await TouchScreen.create(ipad);
    const phoneFrom = await centerOf(phoneStick);
    const [from2, from3] = [await centerOf(stick2), await centerOf(stick3)];
    const phoneReach = await dragDistance(phoneStick);
    const ipadReach = await dragDistance(stick2);
    await phoneTouch.down(1, phoneFrom);
    await ipadTouch.down(1, from2);
    await ipadTouch.down(2, from3);
    await Promise.all([
      phoneTouch.move(1, dragTarget(phoneFrom, 'right', phoneReach), 8),
      ipadTouch.moveAll(
        new Map([
          [1, dragTarget(from2, 'up', ipadReach)],
          [2, dragTarget(from3, 'left', ipadReach)],
        ]),
        8,
      ),
    ]);
    await waitForHostStick(host, 1, 'right');
    await waitForHostStick(host, 2, 'up');
    await waitForHostStick(host, 3, 'left');
    await stepFrames(host, MOVE_FRAMES);
    const moved = await positions(host);
    expectMoved(pick(start, 1), pick(moved, 1), 'right');
    expectMoved(pick(start, 2), pick(moved, 2), 'up');
    expectMoved(pick(start, 3), pick(moved, 3), 'left');

    await Promise.all([phoneTouch.upAll(), ipadTouch.upAll()]);
    for (const slot of [1, 2, 3]) await waitForHostStick(host, slot, 'zero');
    expect((await position(host, 3)).y).toBeGreaterThan(0.5);

    expectNoProblems(hostProblems, 'Host');
    expectNoProblems(phoneProblems, 'iPhone');
    expectNoProblems(ipadProblems, 'iPad');
  });
});
