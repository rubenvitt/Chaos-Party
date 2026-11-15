/**
 * Gemeinsames `test`-Objekt aller E2E-Specs (CHAOS-14).
 *
 * - `chaosServer`: eigener echter Server mit frischer Session **pro Test**
 *   (`createChaosServer` im Testprozess, Port 0 → freier Port, Join-Code `E2ETEST`).
 *   Der Start kostet wenige Millisekunden; dafür gibt es keinen gemeinsamen Zustand
 *   zwischen Tests und keine feste Reihenfolge.
 * - `baseURL` zeigt auf diesen Server; `page.goto('/host/')` und `page.goto('/?code=…')`
 *   landen also immer bei der Session des eigenen Tests. Controller-Specs mit
 *   nachgebautem Session-Server (`fakeSession.ts`) laden nur die Seiten von dort.
 *
 * Specs importieren `test`/`expect` von hier, nicht direkt aus `@playwright/test`.
 */
import {
  test as base,
  devices,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import { E2E_JOIN_CODE, startChaosServer, type RunningServer } from './server.ts';

export { expect } from '@playwright/test';

interface ChaosFixtures {
  /** Join-Code der Test-Session (Option, Standard `E2ETEST`). */
  chaosJoinCode: string;
  /** Echter Server mit frischer Session für genau diesen Test. */
  chaosServer: RunningServer;
  /**
   * Öffnet eine Seite in einem **eigenen** Browser-Kontext – ein weiteres Gerät mit eigenem
   * Speicher (Token): `'PC'` (1280×720) für den Host, sonst iPhone-/iPad-Emulation
   * (Viewport, Touch, DPR, iOS-User-Agent) in Chromium. `baseURL` zeigt auf `chaosServer`.
   * Telefone und iPads laufen im {@link WorkerFixtures.deviceBrowser}, der PC im Browser
   * des Projekts. Alle so geöffneten Kontexte schließt die Fixture am Testende.
   */
  openDevice: (name: DeviceName) => Promise<Page>;
}

interface WorkerFixtures {
  /**
   * Eigener Chromium für Controller-Geräte (iPhone, iPad), **ohne GPU** (CHAOS-64).
   *
   * Der Host rendert WebGL per SwiftShader, also auf der CPU. Teilt sich ein Controller den
   * GPU-Pfad mit dem Host (gleicher Browser oder ebenfalls ANGLE/SwiftShader), wartet sein
   * Compositor, während der Host beim Spielstart Shader übersetzt und Figuren lädt. Der
   * Hauptthread der Controller-Seite blockiert dabei mit: Timer und WebSocket-Nachrichten
   * standen gemessen 1–13 s still, je nach Last. Ab 10 s ohne Server-Nachricht verbindet der Controller
   * neu (`DEAD_AFTER_MS`) und lässt gehaltene Joysticks und Knöpfe los, der Test sah dann
   * `data-active="false"`. Echte Geräte haben ihre eigene GPU; hier rendert der Controller
   * in Software ohne GPU-Prozess (`--disable-gpu`) und bleibt so unabhängig vom Host.
   * Controller brauchen kein WebGL. Screenshot-Vergleiche gibt es hier nur für den Host;
   * Controller-Screenshots entstehen in den Controller-Projekten ohne diese Fixture.
   */
  deviceBrowser: Browser;
}

export type DeviceName = 'PC' | 'iPhone 13' | 'iPhone 13 landscape' | 'iPad Pro 11 landscape';

/** Kontext-Optionen eines Geräts (ohne `defaultBrowserType`: Es bleibt Chromium, s. o.). */
function deviceOptions(name: DeviceName): BrowserContextOptions {
  if (name === 'PC') return { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices[name];
  return { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch };
}

export const test = base.extend<ChaosFixtures, WorkerFixtures>({
  chaosJoinCode: [E2E_JOIN_CODE, { option: true }],
  chaosServer: async ({ chaosJoinCode }, use) => {
    const running = await startChaosServer({ joinCode: chaosJoinCode });
    try {
      await use(running);
    } finally {
      await running.close();
    }
  },
  baseURL: async ({ chaosServer }, use) => {
    await use(chaosServer.base);
  },
  deviceBrowser: [
    async ({ playwright, browserName, launchOptions }, use) => {
      // Die SwiftShader-Schalter des Host-Projekts gelten hier nicht: keine GPU, kein WebGL.
      const browser = await playwright[browserName].launch({
        ...launchOptions,
        args: ['--disable-gpu'],
      });
      await use(browser);
      await browser.close();
    },
    { scope: 'worker' },
  ],
  openDevice: async ({ browser, deviceBrowser, chaosServer }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (name) => {
      const context = await (name === 'PC' ? browser : deviceBrowser).newContext({
        ...deviceOptions(name),
        baseURL: chaosServer.base,
      });
      contexts.push(context);
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});
