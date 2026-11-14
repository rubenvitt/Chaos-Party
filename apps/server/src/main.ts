import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateJoinCode } from './ids.ts';
import { resolveJoinTarget } from './network.ts';
import { createChaosServer } from './server.ts';
import { formatStartupLines, renderTerminalQr } from './startup.ts';

/**
 * Startpunkt `pnpm start` (CHAOS-9, CHAOS-11). Umgebungsvariablen:
 * - `PORT` (Standard 8787), `HOST` (Bind-Adresse, Standard `0.0.0.0`)
 * - `JOIN_CODE`: fester Join-Code für Demos/Tests (sonst zufällig)
 * - `PUBLIC_HOST`, `PUBLIC_PORT`: Adresse/Port im QR-Link erzwingen (ADR-007)
 * - `TERMINAL_QR=0`: keinen QR-Code im Terminal zeichnen
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

const server = createChaosServer({
  staticDir,
  hostDir,
  joinCode,
  joinUrl: target.joinUrl,
  joinUrlAlternatives: target.alternatives,
});
const address = await server.listen(port, host);

for (const line of formatStartupLines({ listenPort: address.port, joinCode, target })) {
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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
