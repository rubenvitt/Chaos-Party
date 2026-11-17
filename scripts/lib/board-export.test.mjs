import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { waitForServer } from './board-export.mjs';

/** @type {import('node:http').Server[]} */
const servers = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

/** @param {number} status */
async function serve(status) {
  const server = createServer((_req, res) => res.writeHead(status).end());
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('keine Adresse');
  return `http://127.0.0.1:${String(address.port)}/host/`;
}

describe('Brett-Export: Warten auf den Dev-Server (CHAOS-140)', () => {
  it('kehrt zurück, sobald der Server antwortet (auch 404)', async () => {
    await expect(waitForServer(await serve(404), { timeoutMs: 2_000 })).resolves.toBeUndefined();
  });

  it('wirft nach dem Zeitlimit, wenn niemand antwortet', async () => {
    const url = await serve(503);
    await expect(waitForServer(url, { timeoutMs: 300, intervalMs: 50 })).rejects.toThrow(
      /antwortet nach/,
    );
  });
});
