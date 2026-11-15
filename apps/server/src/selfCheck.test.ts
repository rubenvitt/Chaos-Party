import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JoinTarget } from './network.ts';
import { checkLocalhost, type HealthFetch } from './selfCheck.ts';
import { createChaosServer, type ChaosServer } from './server.ts';
import { formatStartupLines, hostLink } from './startup.ts';

/**
 * CHAOS-48: Ein fremdes Programm auf `127.0.0.1:<Port>` neben Chaos Party auf `0.0.0.0:<Port>`.
 * Linux lässt genau diese Überlappung nicht zu (EADDRINUSE), macOS schon. Der Test bildet sie
 * deshalb mit zwei Ports nach: Chaos Party auf Port A, ein fremder HTTP-Server auf Port B; die
 * Prüfung von Port B muss „fremd“ melden, die Startausgabe warnen und auf die LAN-Adresse
 * (hier: Port A) als Host-Link ausweichen, die wirklich zu Chaos Party führt.
 */

let workDir: string;
let chaos: ChaosServer;
let chaosPort: number;
let foreign: Server;
let foreignPort: number;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'chaos-selfcheck-'));
  const staticDir = join(workDir, 'controller');
  const hostDir = join(workDir, 'host');
  await mkdir(staticDir);
  await mkdir(hostDir);
  await writeFile(join(staticDir, 'index.html'), '<title>Controller</title>');
  await writeFile(join(hostDir, 'index.html'), '<title>Host</title>');
  chaos = createChaosServer({ staticDir, hostDir });
  chaosPort = (await chaos.listen(0, '127.0.0.1')).port;

  // Fremdes Programm, das auf jede Anfrage mit 404 antwortet (wie im Bericht: Python-Skript).
  foreign = createServer((_req, res) => {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
  });
  await new Promise<void>((resolve) => foreign.listen(0, '127.0.0.1', resolve));
  foreignPort = (foreign.address() as AddressInfo).port;
});

afterAll(async () => {
  await chaos.close();
  await new Promise<void>((resolve) =>
    foreign.close(() => {
      resolve();
    }),
  );
  await rm(workDir, { recursive: true, force: true });
});

function lanTarget(port: number): JoinTarget {
  const joinUrl = `http://127.0.0.1:${String(port)}/?code=AB12`;
  return {
    host: '127.0.0.1',
    port,
    source: 'auto',
    joinUrl,
    alternatives: [],
    candidates: [],
    excluded: [],
    warnings: [],
  };
}

describe('checkLocalhost (CHAOS-48)', () => {
  it('erkennt den eigenen Server an der Instanz-Kennung', async () => {
    const result = await checkLocalhost({
      port: chaosPort,
      instanceId: chaos.instanceId,
      hosts: ['127.0.0.1'],
    });
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([
      { url: `http://127.0.0.1:${String(chaosPort)}/health`, status: 'own' },
    ]);
  });

  it('meldet ein fremdes Programm auf dem Loopback-Port', async () => {
    const result = await checkLocalhost({
      port: foreignPort,
      instanceId: chaos.instanceId,
      hosts: ['127.0.0.1'],
    });
    expect(result.ok).toBe(false);
    expect(result.results[0]?.status).toBe('foreign');
  });

  it('ein zweiter Chaos-Server (andere Instanz) gilt ebenfalls als fremd', async () => {
    const result = await checkLocalhost({
      port: chaosPort,
      instanceId: 'andere-instanz',
      hosts: ['127.0.0.1'],
    });
    expect(result.ok).toBe(false);
  });

  it('nicht erreichbare Adressen (z. B. kein IPv6) sind unkritisch', async () => {
    const refuse: HealthFetch = () => Promise.reject(new Error('ECONNREFUSED'));
    const result = await checkLocalhost({ port: 1, instanceId: 'x', fetch: refuse });
    expect(result.ok).toBe(true);
    expect(result.results.map((r) => r.status)).toEqual(['unreachable', 'unreachable']);
  });

  it('bricht hängende Antworten nach der Frist ab', async () => {
    const hang: HealthFetch = (_url, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('abgebrochen'));
        });
      });
    const result = await checkLocalhost({
      port: 1,
      instanceId: 'x',
      hosts: ['127.0.0.1'],
      fetch: hang,
      timeoutMs: 20,
    });
    expect(result.results[0]?.status).toBe('unreachable');
  });
});

describe('Startausgabe bei belegtem localhost (CHAOS-48)', () => {
  it('normal: Host-Link über localhost, keine Warnung', async () => {
    const localhost = await checkLocalhost({
      port: chaosPort,
      instanceId: chaos.instanceId,
      hosts: ['127.0.0.1'],
    });
    const lines = formatStartupLines({
      listenPort: chaosPort,
      joinCode: 'AB12',
      target: lanTarget(chaosPort),
      localhost,
    });
    expect(lines).toContain(`  Spiel am PC öffnen:   http://localhost:${String(chaosPort)}/host/`);
    expect(lines.join('\n')).not.toContain('anderes Programm');
  });

  it('fremdes Programm: Warnung und funktionierender LAN-Host-Link', async () => {
    const localhost = await checkLocalhost({
      port: foreignPort,
      instanceId: chaos.instanceId,
      hosts: ['127.0.0.1'],
    });
    // Der Server lauscht „auf allen Adressen“; die LAN-Adresse führt zu Chaos Party.
    const target = lanTarget(chaosPort);
    const lines = formatStartupLines({
      listenPort: foreignPort,
      joinCode: 'AB12',
      target,
      localhost,
    });
    const text = lines.join('\n');
    expect(text).toContain(
      `⚠ Unter 127.0.0.1:${String(foreignPort)} antwortet ein anderes Programm, nicht Chaos Party.`,
    );
    const link = hostLink(foreignPort, target, false);
    expect(text).toContain(`Spiel am PC öffnen:   ${link}`);
    expect(link).toBe(`http://127.0.0.1:${String(chaosPort)}/host/`);

    const res = await fetch(link);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>Host</title>');
  });
});
