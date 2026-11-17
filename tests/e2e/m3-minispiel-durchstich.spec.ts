/**
 * M3-Durchstich (CHAOS-26, CHAOS-33): echte Seiten gegen den echten Server, Minispiel im
 * Spielablauf.
 *
 * - Host im Testmodus (`?test=1`): keine Render-Schleife, die Minispiel-Bühne rechnet nur auf
 *   `window.__chaosMinigame.step(n)` – schnell und deterministisch. Ton ist im Testmodus aus.
 * - Der Server spielt das Referenz-Minispiel (feste Auswahl über `game.minigames`, damit der
 *   Test nicht von der Rotation abhängt) mit festem Seed.
 * - Gewartet wird auf DOM-Zustände und Testhaken, nie auf feste Zeiten.
 *
 * Abgedeckt: Brett → Anleitung → Spiel (Controller-Eingabe kommt im Minispiel an) → Ergebnis
 * vom Host gesendet, vom Server angenommen (Münzen im Stand) → nächste Runde auf dem Brett;
 * Host-Neuladen mitten im Spiel (Neustart mit Restzeit) und Ergebnis-Versand nach
 * Verbindungsabbruch (erneut gesendet, genau einmal angenommen).
 *
 * Was das **nicht** beweist: Ton, echte Bildrate, Lesbarkeit am Fernseher, echtes iOS – siehe
 * `docs/device-test-checklist.md`.
 */
import type { Page, WebSocketRoute } from '@playwright/test';
import { withRules } from '../../packages/game-core/src/index.ts';
import { getMinigameInfo } from '../../packages/minigames/src/catalog.ts';
import {
  createMessage,
  encode,
  parseServerToControllerMessage,
  type ClientMessage,
  type ContextMessage,
  type SlotNumber,
} from '../../packages/protocol/src/index.ts';
import type {} from '../../apps/host/src/minigame/testHook.ts';
import type {} from '../../apps/host/src/testHook.ts';
import { collectProblems, expectNoProblems } from './fixtures/pages.ts';
import { startChaosServer, type RunningServer } from './fixtures/server.ts';
import { expect, test as base } from './fixtures/test.ts';

const INFO = (() => {
  const info = getMinigameInfo('pump-parade');
  if (!info) throw new Error('Referenz-Minispiel fehlt im Katalog');
  return info;
})();

/** Spielzeit laut Server: lang genug für Neuladen und Verbindungsabbruch mitten im Spiel. */
const PLAY_MS = 20_000;
/** Anleitung etwas länger als Standard, damit Prüfungen in Ruhe laufen. */
const INTRO_MS = 4_000;
/** Feste Schritte à 1/60 s, die sicher über die Spielzeit hinausgehen. */
const STEPS_TO_FINISH = Math.ceil(PLAY_MS / (1000 / 60)) + 30;

const test = base.extend<{ chaosServer: RunningServer }>({
  chaosServer: async ({ chaosJoinCode }, use) => {
    const running = await startChaosServer({
      joinCode: chaosJoinCode,
      game: {
        minigames: [{ id: INFO.id, playMs: PLAY_MS, scoring: INFO.scoring }],
        rules: withRules({ pacing: { minigameIntroMs: INTRO_MS } }),
      },
    });
    try {
      await use(running);
    } finally {
      await running.close();
    }
  },
});

/** Tippt auf dem Handy die bevorzugte Option des offenen Prompts (falls einer offen ist). */
async function answerPrompt(phone: Page): Promise<boolean> {
  const prompt = phone.getByTestId('prompt');
  if (!(await prompt.isVisible())) return false;
  const choices = prompt.locator('[data-testid^="choice-"]:enabled');
  if ((await choices.count()) === 0) return false;
  for (const id of ['choice-roll', 'choice-buy', 'choice-brace', 'choice-cancel']) {
    const button = prompt.getByTestId(id);
    if ((await button.count()) > 0 && (await button.isEnabled())) {
      await button.tap();
      return true;
    }
  }
  await choices.first().tap();
  return true;
}

async function minigameStage(host: Page): Promise<string | null> {
  const screen = host.getByTestId('minigame-screen');
  if ((await screen.count()) === 0) return null;
  return screen.getAttribute('data-stage');
}

/** Wartet, bis die Bühne vorbereitet ist und das Minispiel läuft. */
async function waitForRunning(host: Page) {
  await host.waitForFunction(
    () => window.__chaosMinigame?.ready === true && window.__chaosMinigame.state === 'running',
  );
}

function coinsOf(server: RunningServer): Record<number, number> {
  const state = server.server.session.snapshot().game?.state;
  return Object.fromEntries((state?.players ?? []).map((p) => [p.slot, p.coins]));
}

test.describe('M3-Durchstich: Minispiel mit echten Seiten', () => {
  test.setTimeout(180_000);

  test('Brett → Anleitung → Spiel mit Controller-Eingabe → Ergebnis vom Host → nächste Runde', async ({
    page: host,
    openDevice,
    chaosServer,
  }) => {
    const hostProblems = collectProblems(host);
    await host.goto('/host/?rounds=2&test=1');
    await expect(host.getByTestId('connection')).toHaveAttribute('data-status', 'connected');

    const phone1 = await openDevice('iPhone 13');
    const phone2 = await openDevice('iPhone 13');
    const phoneProblems = [collectProblems(phone1), collectProblems(phone2)];
    await phone1.goto(chaosServer.joinUrl);
    await expect(phone1.getByTestId('ready-button')).toBeVisible();
    await phone2.goto(chaosServer.joinUrl);
    await phone1.getByTestId('ready-button').tap();
    await phone2.getByTestId('ready-button').tap();
    await expect(host.getByTestId('start-button')).toBeEnabled();
    await host.getByTestId('start-button').click();
    await expect(host.locator('main.host')).toHaveAttribute('data-phase', 'board');

    // Brettrunde: Entscheidungen beantworten, bis die Minispiel-Bühne erscheint.
    const deadline = Date.now() + 120_000;
    while ((await minigameStage(host)) === null) {
      if (Date.now() > deadline) throw new Error('Minispiel-Bühne erscheint nicht');
      for (const phone of [phone1, phone2]) await answerPrompt(phone);
      await host.waitForTimeout(200);
    }

    // Anleitung: Titel, Untertitel, Bedienung mit Symbol und Text, Countdown, Mitspieler.
    const intro = host.getByTestId('minigame-intro');
    await expect(intro).toBeVisible();
    await expect(host.getByTestId('minigame-screen')).toHaveAttribute('data-stage', 'intro');
    await expect(host.locator('main.host')).toHaveAttribute('data-minigame', INFO.id);
    await expect(host.getByTestId('minigame-title')).toHaveText(INFO.title);
    await expect(intro).toContainText(INFO.tagline);
    for (const line of INFO.instructions) await expect(intro).toContainText(line);
    if (INFO.controls.a !== null) {
      await expect(intro.locator('[data-control="a"]')).toContainText(INFO.controls.a);
    }
    await expect(host.getByTestId('minigame-countdown')).toBeVisible();
    await expect(intro).toContainText('Schraubi');
    await expect(intro).toContainText('Kalle Kaktus');

    // Spiel: Bühne startet, ein iPhone tippt A – die Eingabe kommt im Minispiel an.
    await expect(host.getByTestId('minigame-screen')).toHaveAttribute('data-stage', 'play', {
      timeout: INTRO_MS + 10_000,
    });
    await waitForRunning(host);
    await expect(host.getByTestId('minigame-hud')).toBeVisible();
    await expect(phone1.getByTestId('button-a')).toBeVisible();
    await phone1.getByTestId('button-a').tap();
    await host.waitForFunction(() => (window.__chaosMinigame?.networkInputs?.[1] ?? 0) >= 2);
    await host.evaluate(() => {
      window.__chaosMinigame?.step(1);
    });
    expect(
      await host.evaluate(() => window.__chaosMinigame?.hud()?.scores.find((s) => s.slot === 1)),
    ).toMatchObject({ score: 1 });
    await expect(host.getByTestId('minigame-score-1')).toContainText('1');

    // Ergebnis: Spielzeit durchrechnen → Host sendet → Server nimmt an → Münzen im Stand.
    const coinsBefore = coinsOf(chaosServer);
    await host.evaluate((steps) => {
      window.__chaosMinigame?.step(steps);
    }, STEPS_TO_FINISH);
    await expect(host.getByTestId('minigame-screen')).toHaveAttribute('data-stage', 'results');
    expect(await host.evaluate(() => window.__chaosMinigame?.resultState)).toBe('accepted');
    const results = host.getByTestId('minigame-results');
    await expect(results).toBeVisible();
    await expect(host.getByTestId('minigame-headline')).toHaveText('Blau gewinnt!');
    await expect(host.getByTestId('minigame-rank-1')).toHaveAttribute('data-place', '1');
    await expect(host.getByTestId('minigame-rank-2')).toHaveAttribute('data-place', '2');
    await expect(host.getByTestId('minigame-rank-1')).toContainText(`1 ${INFO.scoreUnit}`);
    await expect(host.getByTestId('minigame-coins-1')).toHaveAttribute('data-coins', '10');
    await expect(host.getByTestId('minigame-coins-2')).toHaveAttribute('data-coins', '5');
    const state = chaosServer.server.session.snapshot().game?.state;
    expect(state?.minigame?.placements).toEqual([
      { slot: 1, place: 1, score: 1 },
      { slot: 2, place: 2, score: 0 },
    ]);
    const coinsAfter = coinsOf(chaosServer);
    expect((coinsAfter[1] ?? 0) - (coinsBefore[1] ?? 0)).toBe(10);
    expect((coinsAfter[2] ?? 0) - (coinsBefore[2] ?? 0)).toBe(5);

    // Nächste Runde: zurück auf dem Brett, Bühne entsorgt (Testhaken und Canvas weg).
    await expect(host.getByTestId('board-hud')).toBeVisible({ timeout: 20_000 });
    await expect(host.getByTestId('minigame-screen')).toHaveCount(0);
    await expect(host.locator('canvas')).toHaveCount(1);
    expect(await host.evaluate(() => window.__chaosMinigame === undefined)).toBe(true);
    await expect.poll(() => chaosServer.server.session.snapshot().game?.state.round).toBe(2);
    await expect
      .poll(async () => {
        await host.evaluate(() => {
          window.__chaos?.board?.advance(1000);
        });
        return host.getByTestId('board-round').textContent();
      })
      .toContain('2/2');

    expectNoProblems(hostProblems, 'Host');
    phoneProblems.forEach((problems, index) => {
      expectNoProblems(problems, `Handy ${String(index + 1)}`);
    });
  });

  test('Host-Neuladen mitten im Spiel: Pause bis die Bühne steht, Neustart mit Restzeit; Ergebnis nach Verbindungsabbruch erneut gesendet', async ({
    page: host,
    chaosServer,
  }) => {
    const hostProblems = collectProblems(host);
    const link = await HostLink.attach(host);
    await host.goto('/host/?rounds=1&test=1');
    await expect(host.getByTestId('connection')).toHaveAttribute('data-status', 'connected');

    const bots = [await Bot.join(chaosServer), await Bot.join(chaosServer)];
    await expect(host.getByTestId('start-button')).toBeEnabled();
    await host.getByTestId('start-button').click();
    await expect.poll(async () => minigameStage(host), { timeout: 120_000 }).toBe('play');
    await waitForRunning(host);
    const firstLimit = await host.evaluate(() => window.__chaosMinigame?.hud()?.remainingMs ?? 0);
    expect(firstLimit).toBeGreaterThan(PLAY_MS - 5_000);

    // Neuladen: Die Bühne startet neu, mit der Restzeit laut Server (nicht der vollen Zeit).
    // Die Figuren (GLB) halten wir zurück, damit die Bühne sicher 3 s lädt: So lange bleibt die
    // Auto-Pause stehen (CHAOS-68), erst `host-ready` setzt fort – keine Restzeit geht verloren.
    const session = chaosServer.server.session;
    let releaseModels: (() => void) | undefined;
    const modelsHeld = new Promise<void>((resolve) => {
      releaseModels = resolve;
    });
    await host.route(/\.glb(\?|$)/, async (route) => {
      await modelsHeld;
      await route.continue();
    });
    await host.reload();
    await expect.poll(() => session.snapshot().awaitingHostReady, { timeout: 15_000 }).toBe(true);
    const atLoss = session.snapshot().game?.state;
    const startedBefore = atLoss?.minigame?.playStartedAt ?? null;
    const pausedAt = atLoss?.pausedAt ?? null;
    if (startedBefore === null || pausedAt === null) throw new Error('Minispiel nicht pausiert');
    const elapsedAtLoss = pausedAt - startedBefore;
    await host.waitForTimeout(3_000);
    expect(session.snapshot()).toMatchObject({ pausedBy: 'host-lost', awaitingHostReady: true });
    expect(session.snapshot().game?.state.phase).toBe('minigame-play');
    await expect(host.getByTestId('pause-overlay')).toHaveCount(0);

    releaseModels?.();
    await expect(host.getByTestId('minigame-screen')).toHaveAttribute('data-stage', 'play');
    await waitForRunning(host);
    await expect.poll(() => session.snapshot().pausedBy).toBeNull();
    await host.unroute(/\.glb(\?|$)/);
    // Die Ladezeit zählt als Pause: Startzeitpunkt um mindestens 3 s verschoben.
    const startedAfter = session.snapshot().game?.state.minigame?.playStartedAt ?? 0;
    expect(startedAfter - startedBefore).toBeGreaterThanOrEqual(3_000);
    const restarted = await host.evaluate(() => window.__chaosMinigame?.hud() ?? null);
    expect(restarted?.remainingMs).toBeLessThan(PLAY_MS);
    // Neustart mit der Restzeit vom Moment des Abrisses (Toleranz für Takt und Bildschritte).
    expect(restarted?.remainingMs).toBeGreaterThan(PLAY_MS - elapsedAtLoss - 1_500);
    expect(restarted?.scores.every((entry) => entry.score === 0)).toBe(true);

    // Bot 2 pumpt dreimal; die Eingaben kommen an der neu geladenen Bühne an.
    const bot2 = bots[1];
    if (!bot2) throw new Error('Bot 2 fehlt');
    await bot2.tapA(3);
    await host.waitForFunction(() => (window.__chaosMinigame?.networkInputs?.[2] ?? 0) >= 6);

    // Verbindung weg, dann rechnet der Host fertig: Ergebnis wartet auf die Verbindung.
    await link.drop();
    await expect(host.getByTestId('connection')).toHaveAttribute('data-status', 'disconnected');
    await host.evaluate((steps) => {
      window.__chaosMinigame?.step(steps);
    }, STEPS_TO_FINISH);
    expect(await host.evaluate(() => window.__chaosMinigame?.result?.placements[0])).toEqual({
      slot: 2,
      place: 1,
      score: 3,
    });
    expect(await host.evaluate(() => window.__chaosMinigame?.resultState)).toBe('pending');
    expect(chaosServer.server.session.snapshot().game?.state.phase).toBe('minigame-play');

    // Verbindung zurück: Server-Stand zeigt noch minigame-play → erneut senden → angenommen.
    link.blocked = false;
    await expect(host.getByTestId('minigame-screen')).toHaveAttribute('data-stage', 'results', {
      timeout: 15_000,
    });
    expect(await host.evaluate(() => window.__chaosMinigame?.resultState)).toBe('accepted');
    expect(chaosServer.server.session.snapshot().game?.state.minigame?.placements).toEqual([
      { slot: 2, place: 1, score: 3 },
      { slot: 1, place: 2, score: 0 },
    ]);
    await expect(host.getByTestId('minigame-coins-2')).toHaveAttribute('data-coins', '10');

    for (const bot of bots) bot.close();
    expectNoProblems(hostProblems, 'Host');
  });
});

/** Steuerbare Host-Verbindung: durchreichen, trennen, neue Versuche blockieren. */
class HostLink {
  blocked = false;
  private current: { page: WebSocketRoute; server: WebSocketRoute } | null = null;

  static async attach(page: Page): Promise<HostLink> {
    const link = new HostLink();
    await page.routeWebSocket(/\/ws$/, (ws) => {
      if (link.blocked) {
        void ws.close({ code: 1011, reason: 'blockiert' });
        return;
      }
      link.current = { page: ws, server: ws.connectToServer() };
    });
    return link;
  }

  async drop() {
    this.blocked = true;
    const current = this.current;
    this.current = null;
    await current?.server.close({ code: 1001, reason: 'weg' });
    await current?.page.close({ code: 4000, reason: 'weg' });
  }
}

/**
 * Synthetischer Controller (Node-WebSocket): tritt bei, meldet sich bereit und beantwortet
 * jede Entscheidung sofort (Würfeln bevorzugt). Für Tests, in denen nicht das Handy, sondern
 * der Host im Mittelpunkt steht.
 */
class Bot {
  private seq = 0;
  private slot: SlotNumber | null = null;
  /** Herzschlag wie ein echter Controller (sonst trennt der Server nach 15 s Stille). */
  private readonly heartbeat = setInterval(() => {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.send(createMessage('heartbeat', { t: Date.now() }));
    }
  }, 4000);

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (event: MessageEvent<unknown>) => {
      const parsed = parseServerToControllerMessage(event.data);
      if (!parsed.ok) return;
      const message = parsed.message;
      if (message.type === 'welcome') {
        this.slot = message.players[0]?.slot ?? null;
      } else if (message.type === 'context') {
        this.onContext(message);
      }
    });
  }

  static async join(server: RunningServer): Promise<Bot> {
    const ws = new WebSocket(server.wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => {
        resolve();
      });
      ws.addEventListener('error', () => {
        reject(new Error('Server nicht erreichbar'));
      });
    });
    const bot = new Bot(ws);
    bot.send(createMessage('join', { joinCode: server.joinCode, seats: 1 }));
    return bot;
  }

  private onContext(message: ContextMessage) {
    if (message.actions.includes('ready')) {
      this.send(createMessage('ready', { slot: message.slot, seq: ++this.seq }));
      return;
    }
    const prompt = message.prompt;
    if (!prompt || !message.actions.includes('choose')) return;
    const ids = prompt.options.map((option) => option.id);
    const option =
      ['roll', 'buy', 'brace', 'cancel'].find((id) => ids.includes(id)) ?? ids[0] ?? 'roll';
    this.send(
      createMessage('choose', {
        slot: message.slot,
        seq: ++this.seq,
        promptId: prompt.id,
        option,
      }),
    );
  }

  /** Tippt A `count`-mal (press + release). */
  async tapA(count: number) {
    const slot = this.slot;
    if (slot === null) throw new Error('Bot ohne Platz');
    for (let index = 0; index < count; index++) {
      this.send(createMessage('press', { slot, seq: ++this.seq, button: 'a' }));
      this.send(createMessage('release', { slot, seq: ++this.seq, button: 'a' }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  send(message: ClientMessage) {
    this.ws.send(encode(message));
  }

  close() {
    clearInterval(this.heartbeat);
    this.ws.close();
  }
}
