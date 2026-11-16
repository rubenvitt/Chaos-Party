import { defineConfig, devices } from '@playwright/test';

/**
 * Messläufe (CHAOS-39, `pnpm perf`): feste Szenarien im Headless-Chromium mit SwiftShader
 * gegen die Production-Builds und den echten Server (wie die E2E-Tests, ADR-004).
 *
 * **SwiftShader rendert per CPU.** Die Werte erlauben nur **relative** Vergleiche auf
 * demselben Rechner (vorher/nachher), keine Aussage über echte Hardware. Deshalb ein Worker
 * (keine parallelen Seiten, die sich die CPU teilen) und keine Wiederholungen.
 * Ergebnisse: `perf-results/` (nicht eingecheckt), Vergleich mit `tests/perf/baseline.json`.
 * Siehe `docs/performance.md`.
 */
export default defineConfig({
  testDir: 'tests/perf',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 15 * 60_000,
  use: {
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'perf',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        launchOptions: {
          args: [
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
            // `performance.memory` ungerundet (sonst grob gestuft und verzögert).
            '--enable-precise-memory-info',
          ],
        },
      },
    },
  ],
});
