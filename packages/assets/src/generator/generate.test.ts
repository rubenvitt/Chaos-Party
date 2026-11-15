/**
 * Reproduzierbarkeit (CHAOS-27): Der Generator erzeugt genau die eingecheckten Dateien.
 * Schlägt der Test fehl, wurde der Generator geändert, ohne `pnpm generate:assets` laufen zu
 * lassen (oder umgekehrt eine Datei von Hand verändert).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../contract.ts';
import { generateCharacterGlb } from './generate.ts';
import { portraitSvg } from './portraits.ts';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Figuren-Generator', () => {
  it.each(CHARACTER_IDS)('%s.glb ist aktuell', async (id) => {
    const generated = await generateCharacterGlb(id);
    const committed = new Uint8Array(
      await readFile(join(packageDir, 'models', 'characters', `${id}.glb`)),
    );
    expect(generated.byteLength).toBe(committed.byteLength);
    expect(Buffer.from(generated).equals(Buffer.from(committed))).toBe(true);
  });

  it.each(CHARACTER_IDS)('Porträt %s.svg ist aktuell', async (id) => {
    const committed = await readFile(
      join(packageDir, 'textures', 'portraits', `${id}.svg`),
      'utf8',
    );
    expect(portraitSvg(id)).toBe(committed);
  });
});
