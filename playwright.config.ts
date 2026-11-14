import { defineConfig, devices } from '@playwright/test';

const HOST_PORT = 4173;
/** Production-Build des Controllers (`vite preview`, ADR-006). */
const CONTROLLER_PORT = 4174;

/**
 * Controller-Tests laufen mit iPhone-13-Emulation (Viewport, Touch, DPR 3, iOS-User-Agent)
 * in Chromium: CI installiert nur Chromium, und nur Chromium erlaubt echte Touch-Ereignisse
 * per CDP (Mehrfinger-Tests). Echtes iOS-Safari-Verhalten prüft die Gerätecheckliste.
 */
const controllerUse = {
  browserName: 'chromium' as const,
  baseURL: `http://localhost:${CONTROLLER_PORT}`,
};

/**
 * E2E-Tests gegen die **Production-Builds** von Host (Annahme C1: Havok-WASM lädt
 * im gebauten Bundle, ADR-004) und Controller (iPhone-Emulation, nachgebauter
 * Session-Server, ADR-006). Screenshot-Baselines sind plattformabhängig; eingecheckt
 * ist nur die Linux-Variante (`*-<projekt>-linux.png`), passend zu CI.
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
    baseURL: `http://localhost:${HOST_PORT}`,
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
      command: 'pnpm --filter @chaos-party/host build && pnpm --filter @chaos-party/host preview',
      url: `http://localhost:${HOST_PORT}`,
      // Immer frisch bauen und starten, damit nie ein veralteter Build getestet wird.
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command:
        'pnpm --filter @chaos-party/controller build && pnpm --filter @chaos-party/controller preview',
      url: `http://localhost:${CONTROLLER_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
