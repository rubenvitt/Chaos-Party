/**
 * Lobby und QR-Join am echten Node-Server (CHAOS-11, ADR-007).
 *
 * Jeder Test hat seinen eigenen Server (Fixture `chaosServer`, CHAOS-14): Production-Builds,
 * ein Port, fester Join-Code `E2ETEST`, Join-Link auf 127.0.0.1. Synthetische Controller
 * verbinden sich aus dem Testprozess per WebSocket; den Durchstich mit echten
 * Controller-Seiten prüft `m1-durchstich.spec.ts`.
 *
 * Was das **nicht** beweist: Scan mit der iOS-Kamera, Erreichbarkeit im WLAN,
 * Firewall, Client-Isolation (B1, B2, B4) – das bleibt Teil der Gerätecheckliste.
 */
import {
  createMessage,
  encode,
  parseServerToControllerMessage,
  type ClientMessage,
  type ServerToControllerMessage,
} from '../../packages/protocol/src/index.ts';
import type { Page } from '@playwright/test';
import type {} from '../../apps/host/src/testHook.ts';
import {
  collectProblems,
  expectNoProblems,
  openHost,
  position,
  stepFrames,
} from './fixtures/pages.ts';
import { E2E_JOIN_CODE } from './fixtures/server.ts';
import { expect, test } from './fixtures/test.ts';

const SETTLE_FRAMES = 60;
const TIMEOUT_MS = 5000;

type Message<T extends ServerToControllerMessage['type']> = Extract<
  ServerToControllerMessage,
  { type: T }
>;

/** Synthetischer Controller (Node-WebSocket) mit Nachrichtenpuffer und gezieltem Warten. */
class FakeController {
  private readonly queue: ServerToControllerMessage[] = [];
  private readonly waiters: {
    match: (m: ServerToControllerMessage) => boolean;
    resolve: (m: ServerToControllerMessage) => void;
  }[] = [];
  private seq = 0;

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (event: MessageEvent<unknown>) => {
      const parsed = parseServerToControllerMessage(event.data);
      if (!parsed.ok) throw new Error(`Ungültige Server-Nachricht: ${parsed.error.message}`);
      const index = this.waiters.findIndex((w) => w.match(parsed.message));
      const waiter = index >= 0 ? this.waiters.splice(index, 1)[0] : undefined;
      if (waiter) waiter.resolve(parsed.message);
      else this.queue.push(parsed.message);
    });
  }

  static async connect(url: string): Promise<FakeController> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => {
        resolve();
      });
      ws.addEventListener('error', () => {
        reject(new Error(`WebSocket ${url} nicht erreichbar`));
      });
    });
    return new FakeController(ws);
  }

  send(message: ClientMessage) {
    this.ws.send(encode(message));
  }

  nextSeq() {
    return ++this.seq;
  }

  waitFor<T extends ServerToControllerMessage['type']>(
    type: T,
    match: (m: Message<T>) => boolean = () => true,
  ): Promise<Message<T>> {
    const test = (m: ServerToControllerMessage) => m.type === type && match(m as Message<T>);
    const index = this.queue.findIndex(test);
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0] as Message<T>);
    return new Promise((resolve, reject) => {
      const waiter = {
        match: test,
        resolve: (m: ServerToControllerMessage) => {
          clearTimeout(timer);
          resolve(m as Message<T>);
        },
      };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error(`Keine Nachricht ${type} innerhalb von ${String(TIMEOUT_MS)} ms`));
      }, TIMEOUT_MS);
      this.waiters.push(waiter);
    });
  }

  close() {
    this.ws.close();
  }
}

/** Fester Join-Link für den Lobby-Screenshot (der echte enthält den zufälligen Port). */
const PINNED_JOIN_URL = `http://127.0.0.1:8787/?code=${E2E_JOIN_CODE}`;

/**
 * Leitet die Host-Verbindung zum echten Server durch und ersetzt nur `lobby.joinUrl`
 * durch {@link PINNED_JOIN_URL}: So ist der QR-Code im Screenshot pixelgleich, ohne ihn
 * zu maskieren. Alle anderen Nachrichten bleiben unverändert.
 */
async function pinLobbyJoinUrl(page: Page) {
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (typeof message !== 'string') {
        ws.send(message);
        return;
      }
      const data = JSON.parse(message) as { type?: unknown; joinUrl?: string };
      if (data.type === 'lobby') data.joinUrl = PINNED_JOIN_URL;
      ws.send(JSON.stringify(data));
    });
  });
}

async function waitForNetworkInputs(page: Page, count: number) {
  await page.waitForFunction((n) => (window.__chaos?.networkInputs ?? 0) >= n, count);
}

/** Texte und Glyphen maskieren: Schriften unterscheiden sich zwischen Rechnern (ADR-004). */
const lobbyMask = (page: Page) => [
  page.locator(
    [
      '.lobby-card h2',
      '.lobby-lead',
      '.join-code',
      '.join-url',
      '.join-device-label',
      '.join-device-seats',
      '.lobby-player-label',
      '.lobby-player-state',
      '.player-symbol',
      '.start-button',
      '.start-hint',
      '.hud-title',
      '.hud-connection',
    ].join(', '),
  ),
];

test.describe('Host-Lobby mit QR-Join (Node-Server, Production-Build)', () => {
  test('zeigt QR-Code, Join-Code und LAN-Link; Hinweis, wenn niemand beitritt', async ({
    page,
    chaosServer,
  }) => {
    const { joinUrl } = chaosServer;
    const problems = collectProblems(page);
    await openHost(page, '/host/?test=1&seed=2026&joinHint=1');

    const qr = page.getByTestId('join-qr');
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('data-value', joinUrl);
    // Ein echter QR-Code hat viele dunkle Module (Version ≥ 2 bei dieser Länge).
    const modules = await qr.locator('path').getAttribute('d');
    expect((modules ?? '').split('M').length).toBeGreaterThan(200);
    await expect(page.getByTestId('join-code')).toHaveText(E2E_JOIN_CODE);
    await expect(page.getByTestId('join-url')).toHaveText(joinUrl);
    await expect(page.getByTestId('start-button')).toBeDisabled();
    await expect(page.getByTestId('join-device-phone')).toHaveAttribute('aria-pressed', 'true');

    // B2: nach `joinHint` Sekunden ohne Controller erscheint der Firewall/WLAN-Hinweis.
    await expect(page.getByTestId('join-help')).toBeVisible();
    await expect(page.getByTestId('join-help')).toContainText('Firewall/WLAN prüfen');
    // Ohne weitere Adressen gibt es keine Auswahl.
    await expect(page.getByTestId('join-address')).toHaveCount(0);

    // Der QR-Link führt zur Controller-App desselben Servers.
    const controller = await page.request.get(joinUrl);
    expect(controller.status()).toBe(200);
    expect(controller.headers()['content-type']).toContain('text/html');

    expectNoProblems(problems, 'Host');
  });

  test('Umschalter „iPad · 2 Spieler“ zeigt den Link mit seats=2, zurück auf iPhone', async ({
    page,
    chaosServer,
  }) => {
    const { joinUrl } = chaosServer;
    const problems = collectProblems(page);
    await openHost(page, '/host/?test=1&seed=2026');
    const qr = page.getByTestId('join-qr');
    const phone = page.getByTestId('join-device-phone');
    const ipad = page.getByTestId('join-device-ipad');
    await expect(phone).toContainText('iPhone');
    await expect(phone).toContainText('1 Spieler');
    await expect(ipad).toContainText('iPad');
    await expect(ipad).toContainText('2 Spieler');

    await ipad.click();
    const ipadUrl = `${joinUrl}&seats=2`;
    await expect(ipad).toHaveAttribute('aria-pressed', 'true');
    await expect(phone).toHaveAttribute('aria-pressed', 'false');
    await expect(qr).toHaveAttribute('data-value', ipadUrl);
    await expect(page.getByTestId('join-url')).toHaveText(ipadUrl);
    await expect(page.getByTestId('join-lead')).toContainText('zwei Spieler teilen sich ein iPad');
    // Der Join-Code bleibt gleich: Wer tippt, wählt in der Code-Eingabe „iPad“.
    await expect(page.getByTestId('join-code')).toHaveText(E2E_JOIN_CODE);
    expect((await page.request.get(ipadUrl)).status()).toBe(200);

    await phone.click();
    await expect(qr).toHaveAttribute('data-value', joinUrl);
    await expect(page.getByTestId('join-url')).toHaveText(joinUrl);
    expectNoProblems(problems, 'Host');
  });

  test('„Andere Adresse“ schaltet den QR-Code ohne Server-Rundreise um', async ({
    page,
    chaosServer,
  }) => {
    const { joinUrl } = chaosServer;
    // Der E2E-Server lauscht nur auf Loopback und meldet deshalb keine Alternativen.
    // Die Lobby-Nachricht wird hier um eine zweite Adresse ergänzt (Playwright leitet
    // alle übrigen Nachrichten unverändert durch).
    const alternative = joinUrl.replace('127.0.0.1', '10.0.0.77');
    await page.routeWebSocket(/\/ws$/, (ws) => {
      const server = ws.connectToServer();
      server.onMessage((message) => {
        if (typeof message !== 'string') {
          ws.send(message);
          return;
        }
        const data = JSON.parse(message) as { type?: unknown; joinUrlAlternatives?: string[] };
        if (data.type === 'lobby') data.joinUrlAlternatives = [alternative];
        ws.send(JSON.stringify(data));
      });
    });
    await openHost(page, '/host/?test=1&seed=2026');

    const qr = page.getByTestId('join-qr');
    const select = page.getByTestId('join-address');
    await expect(qr).toHaveAttribute('data-value', joinUrl);
    const port = new URL(joinUrl).port;
    await expect(select.locator('option')).toHaveText([`127.0.0.1:${port}`, `10.0.0.77:${port}`]);
    await select.selectOption(alternative);
    await expect(qr).toHaveAttribute('data-value', alternative);
    await expect(page.getByTestId('join-url')).toHaveText(alternative);
    // Geräte- und Adresswahl wirken zusammen.
    await page.getByTestId('join-device-ipad').click();
    await expect(qr).toHaveAttribute('data-value', `${alternative}&seats=2`);
    await expect(select).toHaveValue(alternative);
    await select.selectOption(joinUrl);
    await expect(qr).toHaveAttribute('data-value', `${joinUrl}&seats=2`);
  });

  test('ein zweites Host-Fenster wartet, solange das erste verbunden ist', async ({
    page,
    context,
  }) => {
    await openHost(page, '/host/?test=1&seed=2026');
    const second = await context.newPage();
    await second.goto('/host/?test=1&seed=2026');
    await expect(second.getByTestId('connection')).toHaveAttribute('data-status', 'host-taken');
    await expect(page.getByTestId('connection')).toHaveAttribute('data-status', 'connected');
    await second.close();
  });

  test('zwei Controller treten bei, Start, move bewegt die Figur', async ({
    page,
    chaosServer,
  }) => {
    const problems = collectProblems(page);
    await pinLobbyJoinUrl(page);
    await openHost(page, '/host/?test=1&seed=2026');
    await expect(page.locator('.lobby-empty')).toBeVisible();
    await expect(page.getByTestId('join-qr')).toHaveAttribute('data-value', PINNED_JOIN_URL);

    const alice = await FakeController.connect(chaosServer.wsUrl);
    const bob = await FakeController.connect(chaosServer.wsUrl);
    try {
      alice.send(createMessage('join', { joinCode: E2E_JOIN_CODE, seats: 1 }));
      const aliceWelcome = await alice.waitFor('welcome');
      expect(aliceWelcome.players.map((p) => p.slot)).toEqual([1]);

      bob.send(createMessage('join', { joinCode: E2E_JOIN_CODE, seats: 1, names: ['Mia'] }));
      const bobWelcome = await bob.waitFor('welcome');
      expect(bobWelcome.players).toEqual([expect.objectContaining({ slot: 2, label: 'Mia' })]);

      // Lobby-Liste aktualisiert sich: Farbe/Bezeichnung aus dem Protokoll, verbunden.
      const p1 = page.getByTestId('lobby-player-1');
      const p2 = page.getByTestId('lobby-player-2');
      await expect(p1).toContainText('Blau');
      await expect(p1).toHaveAttribute('data-connected', 'true');
      await expect(p2).toContainText('Mia');
      await expect(page.locator('.lobby-count')).toHaveText('2/4');
      await expect(page.getByTestId('start-button')).toBeEnabled();

      alice.send(createMessage('ready', { slot: 1, seq: alice.nextSeq() }));
      await expect(p1).toHaveAttribute('data-ready', 'true');
      await expect(p1).toContainText('bereit');
      await expect(p2).toHaveAttribute('data-ready', 'false');

      // Beigetretene Spieler stehen bereits in der Arena (hinter der Lobby).
      await stepFrames(page, SETTLE_FRAMES);
      expect((await page.evaluate(() => window.__chaos?.getPlayerPositions() ?? [])).length).toBe(
        2,
      );

      if (process.env.HOST_LOBBY_BELEG) {
        // Beleg für den Abnahmebericht: HOST_LOBBY_BELEG=1 pnpm test:e2e
        await page.screenshot({ path: 'docs/screenshots/m1-host-lobby.png' });
      }
      // Lobby mit zwei Spielern (einer bereit), Gerätewahl und QR-Code (fester Link);
      // die Szene dahinter nach festen Frames.
      await expect(page).toHaveScreenshot('host-lobby.png', { mask: lobbyMask(page) });

      bob.send(createMessage('ready', { slot: 2, seq: bob.nextSeq() }));
      await expect(p2).toHaveAttribute('data-ready', 'true');

      await page.getByTestId('start-button').click();
      await expect(page.locator('main.host')).toHaveAttribute('data-phase', 'play');
      await expect(page.locator('.lobby')).toHaveCount(0);
      await expect(page.getByTestId('player-chip-2')).toContainText('Mia');
      await alice.waitFor('context', (m) => m.phase === 'play' && m.layout === 'joystick-buttons');
      await bob.waitFor('context', (m) => m.phase === 'play');

      await stepFrames(page, SETTLE_FRAMES);
      const aliceBefore = await position(page, 1);
      const bobBefore = await position(page, 2);

      // Alice drückt den Stick nach rechts: Figur 1 läuft nach +x, Figur 2 bleibt stehen.
      alice.send(createMessage('move', { slot: 1, seq: alice.nextSeq(), x: 1, y: 0 }));
      await waitForNetworkInputs(page, 1);
      await stepFrames(page, 30);
      const aliceAfter = await position(page, 1);
      const bobAfter = await position(page, 2);
      expect(aliceAfter.x - aliceBefore.x).toBeGreaterThan(1);
      expect(Math.abs(aliceAfter.z - aliceBefore.z)).toBeLessThan(0.5);
      expect(Math.hypot(bobAfter.x - bobBefore.x, bobAfter.z - bobBefore.z)).toBeLessThan(0.05);

      // Stick loslassen, dann Bob: Knopf A schubst in Blickrichtung (zur Kamera, −z).
      alice.send(createMessage('move', { slot: 1, seq: alice.nextSeq(), x: 0, y: 0 }));
      bob.send(createMessage('press', { slot: 2, seq: bob.nextSeq(), button: 'a' }));
      bob.send(createMessage('release', { slot: 2, seq: bob.nextSeq(), button: 'a' }));
      await waitForNetworkInputs(page, 4);
      await stepFrames(page, 10);
      const bobDashed = await position(page, 2);
      expect(bobAfter.z - bobDashed.z).toBeGreaterThan(0.5);

      // Ein Controller trennt sich: Der Host zeigt ihn als getrennt (Detail-UX: CHAOS-12).
      bob.close();
      await expect(page.getByTestId('player-chip-2')).toHaveAttribute('data-connected', 'false');
    } finally {
      alice.close();
      bob.close();
    }

    expectNoProblems(problems, 'Host');
  });
});
