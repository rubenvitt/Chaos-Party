import { defineConfig, devices } from '@playwright/test';
import { E2E_JOIN_CODE, E2E_PORT } from './tests/e2e/host-env.ts';

/**
 * Controller-Tests laufen mit iPhone-13-Emulation (Viewport, Touch, DPR 3, iOS-User-Agent)
 * in Chromium: CI installiert nur Chromium, und nur Chromium erlaubt echte Touch-Ereignisse
 * per CDP (Mehrfinger-Tests). Echtes iOS-Safari-Verhalten prüft die Gerätecheckliste.
 * Sie laden den Controller-Build vom selben Node-Server, fangen `/ws` aber per
 * `page.routeWebSocket` ab (nachgebauter Session-Server, ADR-006) und berühren die
 * echte Session daher nicht.
 */
const controllerUse = {
  browserName: 'chromium' as const,
};

/**
 * E2E-Tests gegen die **Production-Builds**, ausgeliefert vom echten Node-Server
 * wie bei `pnpm start` (ADR-007): Controller unter `/`, Host unter `/host/`,
 * WebSocket unter `/ws` – ein Prozess, ein Port. Damit prüft jeder Lauf auch C1
 * (Havok-WASM mit `application/wasm` vom Node-Server). Screenshot-Baselines sind
 * plattformabhängig; eingecheckt ist nur die Linux-Variante (`*-chromium-linux.png`),
 * passend zu CI (ADR-004).
 *
 * Der Server hält **eine** Session für den ganzen Lauf; Specs, die beitreten oder
 * starten, laufen deshalb seriell und rechnen mit dem Zustand vorheriger Tests.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // Software-Rendering (SwiftShader) kann um einzelne Pixel abweichen.
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
      animations: 'disabled',
    },
  },
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  use: {
    // 127.0.0.1 statt localhost: Der Server lauscht nur auf IPv4-Loopback.
    baseURL: `http://127.0.0.1:${String(E2E_PORT)}`,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /controller-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        launchOptions: {
          // WebGL ohne GPU: ANGLE mit SwiftShader (Software-Rendering), in CI und lokal gleich.
          args: [
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
    {
      name: 'iphone-hoch',
      testMatch: /controller-.*\.spec\.ts/,
      use: { ...devices['iPhone 13'], ...controllerUse },
    },
    {
      name: 'iphone-quer',
      testMatch: /controller-.*\.spec\.ts/,
      use: { ...devices['iPhone 13 landscape'], ...controllerUse },
    },
  ],
  webServer: [
    {
      // Alle Apps bauen, dann den Server wie `pnpm start` starten – nur auf Loopback,
      // mit festem Join-Code und Join-Link auf 127.0.0.1 (Handys gibt es im Test nicht).
      command: 'pnpm build && node apps/server/dist/main.js',
      url: `http://127.0.0.1:${String(E2E_PORT)}/health`,
      env: {
        PORT: String(E2E_PORT),
        HOST: '127.0.0.1',
        PUBLIC_HOST: '127.0.0.1',
        JOIN_CODE: E2E_JOIN_CODE,
        TERMINAL_QR: '0',
      },
      // Immer frisch bauen und starten, damit nie ein veralteter Build getestet wird.
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
