// Tests für die reinen Hilfsfunktionen von `pnpm play` (CHAOS-42).
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  atLeast,
  buildDecision,
  installDecision,
  localTarget,
  newestMtime,
  parseOptions,
  parseVersion,
} from './play-lib.mjs';

describe('Versionen', () => {
  it('liest Node-, pnpm- und engines-Angaben', () => {
    expect(parseVersion('v22.12.0')).toEqual([22, 12, 0]);
    expect(parseVersion('>=22.12.0')).toEqual([22, 12, 0]);
    expect(parseVersion('pnpm/10.28.0 npm/? node/v22.23.4')).toEqual([10, 28, 0]);
    expect(parseVersion('24.1')).toEqual([24, 1, 0]);
    expect(parseVersion('keine')).toBeNull();
  });

  it('vergleicht Versionen stellenweise', () => {
    expect(atLeast([22, 12, 0], [22, 12, 0])).toBe(true);
    expect(atLeast([24, 0, 0], [22, 12, 0])).toBe(true);
    expect(atLeast([22, 11, 9], [22, 12, 0])).toBe(false);
    expect(atLeast([20, 99, 0], [22, 12, 0])).toBe(false);
    expect(atLeast([10, 0, 0], [10, 0, 0])).toBe(true);
  });
});

describe('Build- und Installationsentscheidung', () => {
  it('baut, wenn eine Ausgabe fehlt', () => {
    expect(buildDecision({ outputs: [10, null, 10], newestSource: 1 }).build).toBe(true);
  });

  it('baut, wenn eine Quelle neuer ist als die älteste Ausgabe', () => {
    expect(buildDecision({ outputs: [100, 50, 100], newestSource: 60 }).build).toBe(true);
  });

  it('baut nicht, wenn alle Ausgaben neuer sind', () => {
    expect(buildDecision({ outputs: [100, 90, 95], newestSource: 80 })).toEqual({
      build: false,
      reason: 'Build ist aktuell',
    });
  });

  it('installiert ohne node_modules oder nach Änderung am Lockfile', () => {
    expect(installDecision({ installedAt: null, newestManifest: 1 }).install).toBe(true);
    expect(installDecision({ installedAt: 10, newestManifest: 20 }).install).toBe(true);
    expect(installDecision({ installedAt: 30, newestManifest: 20 }).install).toBe(false);
  });
});

describe('newestMtime', () => {
  /** @type {string | undefined} */
  let dir;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('ignoriert dist, node_modules, versteckte Ordner und Tests', () => {
    dir = mkdtempSync(join(tmpdir(), 'chaos-play-'));
    const file = (/** @type {string} */ path, /** @type {number} */ seconds) => {
      const full = join(/** @type {string} */ (dir), path);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, 'x');
      utimesSync(full, seconds, seconds);
    };
    file('src/main.ts', 1000);
    file('dist/main.js', 5000);
    file('node_modules/x/index.js', 5000);
    file('.vite/cache.json', 5000);
    file('src/main.test.ts', 5000);
    expect(newestMtime(dir)).toBe(1000 * 1000);
    file('public/bild.png', 2000);
    expect(newestMtime(dir)).toBe(2000 * 1000);
  });

  it('liefert 0 für fehlende Ordner', () => {
    expect(newestMtime(join(tmpdir(), 'gibt-es-nicht-chaos-party'))).toBe(0);
  });
});

describe('parseOptions', () => {
  it('öffnet den Browser standardmäßig, nicht aber in CI oder mit OPEN=0/--no-open', () => {
    expect(parseOptions([], {}).open).toBe(true);
    expect(parseOptions([], { CI: 'true' }).open).toBe(false);
    expect(parseOptions([], { OPEN: '0' }).open).toBe(false);
    expect(parseOptions([], { OPEN: 'false' }).open).toBe(false);
    expect(parseOptions(['--no-open'], {}).open).toBe(false);
    expect(parseOptions(['--open'], { CI: '1' }).open).toBe(true);
    expect(parseOptions([], { CI: 'true', OPEN: '1' }).open).toBe(true);
  });

  it('erkennt --rebuild, REBUILD=1 und unbekannte Optionen', () => {
    expect(parseOptions(['--rebuild'], {}).rebuild).toBe(true);
    expect(parseOptions([], { REBUILD: '1' }).rebuild).toBe(true);
    expect(parseOptions([], { REBUILD: '0' }).rebuild).toBe(false);
    expect(parseOptions(['--bla'], {}).unknown).toEqual(['--bla']);
  });
});

describe('localTarget', () => {
  it('nutzt localhost, wenn der Server auf alle Adressen bindet', () => {
    expect(localTarget({})).toEqual({
      port: 8787,
      probeHost: '127.0.0.1',
      browserHost: 'localhost',
    });
    expect(localTarget({ PORT: '9000', HOST: '0.0.0.0' })?.port).toBe(9000);
  });

  it('nutzt eine feste Bind-Adresse, IPv6 in Klammern', () => {
    expect(localTarget({ HOST: '192.168.1.5' })?.browserHost).toBe('192.168.1.5');
    expect(localTarget({ HOST: 'fe80::1' })?.probeHost).toBe('[fe80::1]');
  });

  it('kennt den Port bei PORT=0 nicht', () => {
    expect(localTarget({ PORT: '0' })).toBeNull();
    expect(localTarget({ PORT: 'abc' })).toBeNull();
  });
});
