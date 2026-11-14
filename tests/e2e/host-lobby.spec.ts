/**
 * Lobby und QR-Join am echten Node-Server (CHAOS-11, ADR-007).
 *
 * Der Server läuft wie bei `pnpm start` (Production-Builds, ein Port) mit festem
 * `JOIN_CODE` und `PUBLIC_HOST=127.0.0.1`. Zwei synthetische Controller verbinden
 * sich aus dem Testprozess per WebSocket. Der Server hält eine Session für den
 * ganzen Lauf, deshalb laufen die Tests seriell in fester Reihenfolge.
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
import { expect, test, type Page } from '@playwright/test';
import type {} from '../../apps/host/src/testHook.ts';
import { E2E_JOIN_CODE, E2E_JOIN_URL, E2E_WS_URL } from './host-env.ts';

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

  static async connect(): Promise<FakeController> {
    const ws = new WebSocket(E2E_WS_URL);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => {
        resolve();
      });
      ws.addEventListener('error', () => {
        reject(new Error(`WebSocket ${E2E_WS_URL} nicht erreichbar`));
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

async function openHost(page: Page, query: string) {
  await page.goto(`/host/?${query}`);
  await expect(page.locator('main.host')).toHaveAttribute('data-mode', 'server');
  await expect(page.locator('main.host')).toHaveAttribute('data-physics', 'ready');
  await expect(page.locator('main.host')).toHaveAttribute('data-scene', 'ready');
  await expect(page.getByTestId('connection')).toHaveAttribute('data-status', 'connected');
  await page.waitForFunction(() => window.__chaos?.ready === true);
}

async function stepFrames(page: Page, n: number) {
  await page.evaluate((frames) => {
    window.__chaos?.stepFrames(frames);
  }, n);
}

async function position(page: Page, slot: number) {
  const all = await page.evaluate(() => window.__chaos?.getPlayerPositions() ?? []);
  const found = all.find((p) => p.slot === slot);
  if (!found) throw new Error(`Spieler ${String(slot)} fehlt in der Szene`);
  return found;
}

async function waitForNetworkInputs(page: Page, count: number) {
  await page.waitForFunction((n) => (window.__chaos?.networkInputs ?? 0) >= n, count);
}

test.describe.configure({ mode: 'serial' });

test.describe('Host-Lobby mit QR-Join (Node-Server, Production-Build)', () => {
  test('zeigt QR-Code, Join-Code und LAN-Link; Hinweis, wenn niemand beitritt', async ({
    page,
  }) => {
    const problems = collectProblems(page);
    await openHost(page, 'test=1&seed=2026&joinHint=1');

    const qr = page.getByTestId('join-qr');
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('data-value', E2E_JOIN_URL);
    // Ein echter QR-Code hat viele dunkle Module (Version ≥ 2 bei dieser Länge).
    const modules = await qr.locator('path').getAttribute('d');
    expect((modules ?? '').split('M').length).toBeGreaterThan(200);
    await expect(page.getByTestId('join-code')).toHaveText(E2E_JOIN_CODE);
    await expect(page.getByTestId('join-url')).toHaveText(E2E_JOIN_URL);
    await expect(page.getByTestId('start-button')).toBeDisabled();

    // B2: nach `joinHint` Sekunden ohne Controller erscheint der Firewall/WLAN-Hinweis.
    await expect(page.getByTestId('join-help')).toBeVisible();
    await expect(page.getByTestId('join-help')).toContainText('Firewall/WLAN prüfen');
    // Ohne weitere Adressen gibt es keine Auswahl.
    await expect(page.getByTestId('join-address')).toHaveCount(0);

    // Der QR-Link führt zur Controller-App desselben Servers.
    const controller = await page.request.get(E2E_JOIN_URL);
    expect(controller.status()).toBe(200);
    expect(controller.headers()['content-type']).toContain('text/html');

    expect(problems.pageErrors).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  });

  test('„Andere Adresse“ schaltet den QR-Code ohne Server-Rundreise um', async ({ page }) => {
    // Der E2E-Server lauscht nur auf Loopback und meldet deshalb keine Alternativen.
    // Die Lobby-Nachricht wird hier um eine zweite Adresse ergänzt (Playwright leitet
    // alle übrigen Nachrichten unverändert durch).
    const alternative = E2E_JOIN_URL.replace('127.0.0.1', '10.0.0.77');
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
    await openHost(page, 'test=1&seed=2026');

    const qr = page.getByTestId('join-qr');
    const select = page.getByTestId('join-address');
    await expect(qr).toHaveAttribute('data-value', E2E_JOIN_URL);
    const port = new URL(E2E_JOIN_URL).port;
    await expect(select.locator('option')).toHaveText([`127.0.0.1:${port}`, `10.0.0.77:${port}`]);
    await select.selectOption(alternative);
    await expect(qr).toHaveAttribute('data-value', alternative);
    await expect(page.getByTestId('join-url')).toHaveText(alternative);
    await select.selectOption(E2E_JOIN_URL);
    await expect(qr).toHaveAttribute('data-value', E2E_JOIN_URL);
  });

  test('ein zweites Host-Fenster wartet, solange das erste verbunden ist', async ({
    page,
    context,
  }) => {
    await openHost(page, 'test=1&seed=2026');
    const second = await context.newPage();
    await second.goto('/host/?test=1&seed=2026');
    await expect(second.getByTestId('connection')).toHaveAttribute('data-status', 'host-taken');
    await expect(page.getByTestId('connection')).toHaveAttribute('data-status', 'connected');
    await second.close();
  });

  test('zwei Controller treten bei, Start, move bewegt die Figur', async ({ page }) => {
    const problems = collectProblems(page);
    await openHost(page, 'test=1&seed=2026');
    await expect(page.locator('.lobby-empty')).toBeVisible();

    const alice = await FakeController.connect();
    const bob = await FakeController.connect();
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
      bob.send(createMessage('ready', { slot: 2, seq: bob.nextSeq() }));
      await expect(p1).toHaveAttribute('data-ready', 'true');
      await expect(p2).toHaveAttribute('data-ready', 'true');
      await expect(p1).toContainText('bereit');

      // Beigetretene Spieler stehen bereits in der Arena (hinter der Lobby).
      await stepFrames(page, SETTLE_FRAMES);
      expect((await page.evaluate(() => window.__chaos?.getPlayerPositions() ?? [])).length).toBe(
        2,
      );

      if (process.env.HOST_LOBBY_BELEG) {
        // Beleg für den Abnahmebericht: HOST_LOBBY_BELEG=1 pnpm test:e2e
        await page.screenshot({ path: 'docs/screenshots/m1-host-lobby.png' });
      }

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

    expect(problems.pageErrors).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  });
});
