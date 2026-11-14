import { defineConfig, devices } from '@playwright/test';

const HOST_PORT = 4173;

/**
 * E2E-Tests gegen den **Production-Build** des Hosts (Annahme C1: Havok-WASM lädt
 * im gebauten Bundle). Screenshot-Baselines sind plattformabhängig; eingecheckt ist
 * nur die Linux-Variante (`*-chromium-linux.png`), passend zu CI (ADR-004).
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
  ],
  webServer: {
    command: 'pnpm --filter @chaos-party/host build && pnpm --filter @chaos-party/host preview',
    url: `http://localhost:${HOST_PORT}`,
    // Immer frisch bauen und starten, damit nie ein veralteter Build getestet wird.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
