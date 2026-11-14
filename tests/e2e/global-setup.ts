/**
 * Einmal vor dem E2E-Lauf: alle Apps bauen (CHAOS-14). Die Tests starten danach je
 * Test einen eigenen Server im Testprozess (`fixtures/server.ts`), der die
 * Production-Builds ausliefert – wie `pnpm start`. Immer frisch bauen, damit nie ein
 * veralteter Build getestet wird; `E2E_SKIP_BUILD=1` überspringt das (nur lokal,
 * wenn gerade gebaut wurde).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const REQUIRED = ['apps/controller/dist/index.html', 'apps/host/dist/index.html'];

export default function globalSetup() {
  if (process.env.E2E_SKIP_BUILD !== '1') {
    try {
      execFileSync('pnpm', ['build'], { cwd: ROOT, stdio: 'pipe' });
    } catch (error) {
      const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
      process.stderr.write(stdout ?? '');
      process.stderr.write(stderr ?? '');
      throw new Error('`pnpm build` ist fehlgeschlagen – E2E-Tests brauchen die Builds.', {
        cause: error,
      });
    }
  }
  const missing = REQUIRED.filter((file) => !existsSync(join(ROOT, file)));
  if (missing.length > 0) {
    throw new Error(`Build fehlt: ${missing.join(', ')} – vorher \`pnpm build\` ausführen.`);
  }
}
