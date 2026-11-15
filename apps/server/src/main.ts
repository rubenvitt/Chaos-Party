import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateJoinCode } from './ids.ts';
import { resolveJoinTarget } from './network.ts';
import { checkLocalhost } from './selfCheck.ts';
import { createChaosServer } from './server.ts';
import { formatStartupLines, renderTerminalQr } from './startup.ts';

/**
 * Startpunkt `pnpm start` (CHAOS-9, CHAOS-11). Umgebungsvariablen:
 * - `PORT` (Standard 8787), `HOST` (Bind-Adresse, Standard `0.0.0.0`)
 * - `JOIN_CODE`: fester Join-Code für Demos/Tests (sonst zufällig)
 * - `PUBLIC_HOST`, `PUBLIC_PORT`: Adresse/Port im QR-Link erzwingen (ADR-007)
 * - `TERMINAL_QR=0`: keinen QR-Code im Terminal zeichnen
 * - `ROUNDS`: Runden des Brettspiels (Standard 10, EXP-010), `SEED`: fester Seed (reproduzierbar)
 */
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
// Gleiche relative Tiefe aus src/ (Dev) und dist/ (Build).
const staticDir = fileURLToPath(new URL('../../controller/dist', import.meta.url));
const hostDir = fileURLToPath(new URL('../../host/dist', import.meta.url));

// JOIN_CODE erlaubt einen festen Code für Demos und Tests; leer oder fehlend → zufällig.
const fixedJoinCode = process.env.JOIN_CODE?.trim();
const joinCode =
  fixedJoinCode === undefined || fixedJoinCode === '' ? generateJoinCode() : fixedJoinCode;

// Den QR-Link vor dem Start bestimmen: Er steht in jeder `lobby`-Nachricht an den Host.
// Ist PORT=0 (freier Port), wird der Link erst nach `listen` korrekt – dann PUBLIC_PORT setzen.
const target = resolveJoinTarget({
  interfaces: networkInterfaces(),
  env: process.env,
  listenPort: port,
  bindHost: host,
  joinCode,
});

const rounds = parseIntegerEnv('ROUNDS', 1, 20);
const seed = parseIntegerEnv('SEED', 0, 2 ** 31 - 1);

const server = createChaosServer({
  staticDir,
  hostDir,
  joinCode,
  joinUrl: target.joinUrl,
  joinUrlAlternatives: target.alternatives,
  game: {
    ...(rounds === undefined ? {} : { rounds }),
    ...(seed === undefined ? {} : { seed }),
  },
  onGameStart: (info) => {
    // Seed ausgeben: Mit SEED=<Wert> lässt sich dieselbe Partie nachstellen (M2).
    console.log(
      `Brettspiel gestartet: ${String(info.slots.length)} Spieler, ${String(info.rounds)} Runden, Seed ${String(info.seed)}`,
    );
  },
});
const address = await server.listen(port, host);
// CHAOS-48: Prüfen, ob unter localhost wirklich dieser Server antwortet.
const localhost = await checkLocalhost({ port: address.port, instanceId: server.instanceId });

for (const line of formatStartupLines({ listenPort: address.port, joinCode, target, localhost })) {
  console.log(line);
}
for (const [name, dir] of [
  ['Controller-App', staticDir],
  ['Host-App', hostDir],
] as const) {
  if (!existsSync(join(dir, 'index.html'))) {
    console.warn(`  ⚠ ${name} nicht gebaut (${dir}) – vorher \`pnpm build\` ausführen.`);
  }
}
if (process.stdout.isTTY && process.env.TERMINAL_QR !== '0') {
  console.log('');
  console.log(renderTerminalQr(target.joinUrl));
}

function parseIntegerEnv(name: string, min: number, max: number): number | undefined {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.warn(
      `  ⚠ ${name}=${raw} ignoriert (erlaubt: ganze Zahl ${String(min)}–${String(max)}).`,
    );
    return undefined;
  }
  return value;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
