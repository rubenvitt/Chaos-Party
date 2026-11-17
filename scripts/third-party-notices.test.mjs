// Tests für die reinen Teile des Lizenzhinweis-Generators (CHAOS-69).
import { describe, expect, it } from 'vitest';
import {
  LICENSE_FILE,
  PROJECT_LICENSE,
  SOURCE_URL,
  licenseFileNames,
  renderNotices,
} from './third-party-notices.mjs';

describe('licenseFileNames', () => {
  it('findet Lizenz- und NOTICE-Dateien, Lizenz zuerst', () => {
    expect(
      licenseFileNames(['package.json', 'NOTICE.md', 'license.md', 'README.md', 'index.js']),
    ).toEqual(['license.md', 'NOTICE.md']);
    expect(licenseFileNames(['LICENSE', 'COPYING.txt', 'LICENCE'])).toEqual([
      'COPYING.txt',
      'LICENCE',
      'LICENSE',
    ]);
    expect(licenseFileNames(['README.md', 'licenses.json'])).toEqual([]);
  });
});

describe('renderNotices', () => {
  const babylon = {
    name: '@babylonjs/core',
    version: '9.35.0',
    license: 'Apache-2.0',
    homepage: 'https://www.babylonjs.com',
    texts: [
      { file: 'license.md', text: 'Apache License\r\nVersion 2.0   \r\n\r\n' },
      { file: 'NOTICE.md', text: 'Babylon.js NOTICE' },
    ],
  };
  const ws = {
    name: 'ws',
    version: '8.22.1',
    license: 'MIT',
    author: 'Einar Otto Stangvik',
    texts: [{ file: 'LICENSE', text: 'MIT License' }],
  };

  it('nennt Projektlizenz, Quellcode und jedes Paket mit Lizenz- und NOTICE-Text', () => {
    const text = renderNotices('@chaos-party/host', [ws, babylon]);
    expect(text).toContain(PROJECT_LICENSE);
    expect(text).toContain(LICENSE_FILE);
    expect(text).toContain(SOURCE_URL);
    expect(text).toContain('  - @babylonjs/core 9.35.0 (Apache-2.0)\n  - ws 8.22.1 (MIT)');
    expect(text).toContain('--- license.md ---\n\nApache License\nVersion 2.0\n');
    expect(text).toContain('--- NOTICE.md ---\n\nBabylon.js NOTICE');
    expect(text).toContain('Autor: Einar Otto Stangvik');
    expect(text).toContain('Homepage: https://www.babylonjs.com');
    expect(text).not.toContain('\r');
    expect(text.endsWith('MIT License\n')).toBe(true);
  });

  it('ist unabhängig von der Reihenfolge der Pakete', () => {
    expect(renderNotices('x', [ws, babylon])).toBe(renderNotices('x', [babylon, ws]));
  });
});
