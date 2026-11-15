/**
 * `pnpm --filter @chaos-party/assets generate`: schreibt die Porträts nach
 * `textures/portraits/<id>.svg`. Die Figuren-GLBs entstehen seit CHAOS-58 in Blender
 * (`packages/assets/blender/build-all.sh`). Danach `pnpm check:assets` laufen lassen.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARACTER_IDS } from '../contract.ts';
import { portraitSvg } from './portraits.ts';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

for (const id of CHARACTER_IDS) {
  const svgPath = join(packageRoot, 'textures', 'portraits', `${id}.svg`);
  await mkdir(dirname(svgPath), { recursive: true });
  await writeFile(svgPath, portraitSvg(id));
  console.log(`${id}: Porträt geschrieben`);
}
