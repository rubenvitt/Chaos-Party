import { defineConfig, devices } from '@playwright/test';

/**
 * Controller-Tests laufen mit iPhone-13-Emulation (Viewport, Touch, DPR 3, iOS-User-Agent)
 * in Chromium: CI installiert nur Chromium, und nur Chromium erlaubt echte Touch-Ereignisse
 * per CDP (Mehrfinger-Tests). Echtes iOS-Safari-Verhalten prüft die Gerätecheckliste.
 * Sie laden den Controller-Build vom Server ihres Tests, fangen `/ws` aber per
 * `page.routeWebSocket` ab (nachgebauter Session-Server, ADR-006).
 */
const controllerUse = {
  browserName: 'chromium' as const,
};

/**
 * E2E-Tests gegen die **Production-Builds**, ausgeliefert vom echten Node-Server wie bei
 * `pnpm start` (ADR-007): Controller unter `/`, Host unter `/host/`, WebSocket unter `/ws`
 * – ein Prozess, ein Port. Damit prüft jeder Lauf auch C1 (Havok-WASM mit
 * `application/wasm` vom Node-Server). Screenshot-Baselines sind plattformabhängig;
 * eingecheckt ist nur die Linux-Variante (`*-<projekt>-linux.png`), passend zu CI (ADR-004).
 * Auf macOS/Windows überspringt `ignoreSnapshots` die Vergleiche (CHAOS-175): Dort gibt es
 * keine Baselines, und angelegte wären ungeprüft schnell veraltet. Die DOM-Assertions laufen
 * überall; die Optik vergleicht die CI bzw. das Playwright-Docker-Image (docs/testing.md).
 *
 * Isolation (CHAOS-14): `global-setup.ts` baut einmal, danach startet die Fixture
 * `chaosServer` (`tests/e2e/fixtures/test.ts`) **pro Test** einen eigenen Server mit
 * frischer Session auf freiem Port und setzt `baseURL` darauf. Keine Spec hängt vom
 * Zustand einer anderen ab; Tests laufen parallel. Zwei Worker: Host-Seiten rendern per
 * Software (SwiftShader) und sind CPU-hungrig; mehr Worker machen den Lauf kaum schneller,
 * aber lokal empfindlicher (siehe docs/testing.md).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: Number(process.env.E2E_WORKERS ?? 2),
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  timeout: 60_000,
  ignoreSnapshots: process.platform !== 'linux',
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
    // `baseURL` setzt die Fixture `chaosServer` je Test (http://127.0.0.1:<freier Port>).
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /(controller|ipad)-.*\.spec\.ts/,
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
    // Geteiltes iPad (CHAOS-13, ADR-008): iPad-Pro-11-Emulation in Chromium, gleicher
    // nachgebauter Session-Server; beweist kein echtes iPadOS-Multitouch (A1–A3).
    {
      name: 'ipad-quer',
      testMatch: /ipad-.*\.spec\.ts/,
      use: { ...devices['iPad Pro 11 landscape'], ...controllerUse },
    },
    {
      name: 'ipad-hoch',
      testMatch: /ipad-.*\.spec\.ts/,
      use: { ...devices['iPad Pro 11'], ...controllerUse },
    },
  ],
});
