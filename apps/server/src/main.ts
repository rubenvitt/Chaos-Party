import { fileURLToPath } from 'node:url';
import { createChaosServer } from './server.ts';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
// Gleiche relative Tiefe aus src/ (Dev) und dist/ (Build).
const staticDir = fileURLToPath(new URL('../../controller/dist', import.meta.url));

const server = createChaosServer({ staticDir });
const address = await server.listen(port, host);
console.log(`Chaos-Party-Server läuft auf http://${address.address}:${String(address.port)}`);
console.log(`Controller-App aus ${staticDir}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
