/**
 * Reproduzierbarkeit der Porträts (CHAOS-27): Der Generator erzeugt genau die eingecheckten
 * SVG-Dateien. Die Figuren-GLBs entstehen seit CHAOS-58 in Blender
 * (`packages/assets/blender/`); deren Vertrag und Budgets prüft `pnpm check:assets`.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../contract.ts';
import { portraitSvg } from './portraits.ts';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Porträt-Generator', () => {
  it.each(CHARACTER_IDS)('Porträt %s.svg ist aktuell', async (id) => {
    const committed = await readFile(
      join(packageDir, 'textures', 'portraits', `${id}.svg`),
      'utf8',
    );
    expect(portraitSvg(id)).toBe(committed);
  });
});
