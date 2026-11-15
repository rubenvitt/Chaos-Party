/**
 * `pnpm --filter @chaos-party/assets generate`: schreibt die Figuren-GLBs nach
 * `models/characters/<id>.glb` und die Porträts nach `textures/portraits/<id>.svg`.
 * Danach `pnpm check:assets` laufen lassen (Budgets, Maßstab, Animationen).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARACTER_IDS } from './characters.ts';
import { generateCharacterGlb } from './generate.ts';
import { portraitSvg } from './portraits.ts';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

for (const id of CHARACTER_IDS) {
  const glb = await generateCharacterGlb(id);
  const glbPath = join(packageRoot, 'models', 'characters', `${id}.glb`);
  await mkdir(dirname(glbPath), { recursive: true });
  await writeFile(glbPath, glb);
  const svgPath = join(packageRoot, 'textures', 'portraits', `${id}.svg`);
  await mkdir(dirname(svgPath), { recursive: true });
  await writeFile(svgPath, portraitSvg(id));
  console.log(`${id}: ${String(glb.byteLength)} Bytes GLB`);
}
