/**
 * Import der CC0-Assets von Poly Haven für den Natur-Look (CHAOS-62).
 *
 *   pnpm --filter @chaos-party/assets import:polyhaven
 *
 * Liest `packages/assets/polyhaven.json`, lädt die Originale (1k) in einen Zwischenspeicher
 * (`packages/assets/.cache/polyhaven/`, nicht eingecheckt), verkleinert sie und schreibt:
 *
 * - Texturen (Farbe, Normalen, AO/Rauheit/Metall) als quadratisches WebP nach
 *   `textures/nature/<id>_<map>.webp` (ImageMagick `convert`, verlustbehaftet);
 * - Himmel (equirektangulare HDRIs) als Radiance-HDR in halber Größe nach
 *   `textures/sky/<id>.hdr` (eigener RGBE-Code, damit Sonnenwerte über 1 erhalten bleiben);
 * - die Manifest-Einträge `natur-…` und `himmel-…` mit Herkunft, Autoren und Budget.
 *
 * Danach `pnpm exec prettier --write packages/assets/manifest.json` und `pnpm check:assets`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeHdr, downsampleHdr, encodeHdr } from '../check/hdr.ts';
import type { AssetEntry, AssetManifest } from '../manifest.ts';

interface Selection {
  readonly textureSize: number;
  readonly skyWidth: number;
  readonly textures: readonly { readonly id: string; readonly use: string }[];
  readonly skies: readonly { readonly id: string; readonly use: string }[];
}

interface PhFile {
  readonly url: string;
  readonly md5?: string;
}

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cacheDir = join(packageDir, '.cache', 'polyhaven');
const API = 'https://api.polyhaven.com';
/** Karten je Textur: Dateiname → Schlüssel in der Poly-Haven-API. */
const MAPS = { diff: 'Diffuse', nor: 'nor_gl', arm: 'arm' } as const;
const QUALITY: Readonly<Record<keyof typeof MAPS, number>> = { diff: 82, nor: 88, arm: 80 };
const MAP_TEXT: Readonly<Record<keyof typeof MAPS, string>> = {
  diff: 'Farbe',
  nor: 'Normalen (OpenGL)',
  arm: 'AO/Rauheit/Metall',
};

async function json(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${String(res.status)}`);
  return res.json();
}

async function cached(file: PhFile, target: string): Promise<string> {
  if (existsSync(target) && file.md5) {
    const have = createHash('md5')
      .update(await readFile(target))
      .digest('hex');
    if (have === file.md5) return target;
  }
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`${file.url}: HTTP ${String(res.status)}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  return target;
}

async function authors(id: string): Promise<string[]> {
  const info = (await json(`${API}/info/${id}`)) as { authors?: Record<string, string> };
  return Object.keys(info.authors ?? {});
}

/** Budget: Dateigröße + 25 %, auf 4 KiB aufgerundet, höchstens das Budget der Art. */
function budget(bytes: number, kindMax: number): number {
  return Math.min(kindMax, Math.ceil((bytes * 1.25) / 4096) * 4096);
}

const kebab = (id: string): string => id.replaceAll('_', '-');

const selection = JSON.parse(
  await readFile(join(packageDir, 'polyhaven.json'), 'utf8'),
) as Selection;
const entries: AssetEntry[] = [];
const manifestPath = join(packageDir, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as AssetManifest;

for (const { id, use } of selection.textures) {
  const files = (await json(`${API}/files/${id}`)) as Record<
    string,
    Record<string, { jpg?: PhFile }>
  >;
  const names = await authors(id);
  for (const [map, key] of Object.entries(MAPS) as [keyof typeof MAPS, string][]) {
    const source = files[key]?.['1k']?.jpg;
    if (!source) throw new Error(`${id}: Karte ${key} in 1k fehlt`);
    const original = await cached(source, join(cacheDir, id, `${id}_${map}_1k.jpg`));
    const rel = `textures/nature/${id}_${map}.webp`;
    const target = join(packageDir, rel);
    await mkdir(dirname(target), { recursive: true });
    const size = String(selection.textureSize);
    execFileSync('convert', [
      original,
      '-resize',
      `${size}x${size}!`,
      '-strip',
      '-quality',
      String(QUALITY[map]),
      '-define',
      'webp:method=6',
      target,
    ]);
    const bytes = (await stat(target)).size;
    entries.push({
      id: `natur-${kebab(id)}-${map}`,
      kind: 'texture',
      source: 'imported',
      path: `packages/assets/${rel}`,
      description: `${use}: ${MAP_TEXT[map]}, ${size}×${size} WebP aus der 1k-Fassung von Poly Haven „${id}“.`,
      license: 'CC0-1.0',
      attribution: `Poly Haven – ${names.join(', ')} (CC0)`,
      origin: `https://polyhaven.com/a/${id}`,
      budgetBytes: budget(bytes, manifest.budgets.texture.maxBytes),
    });
    console.log(`  ${rel}: ${(bytes / 1024).toFixed(1)} KiB`);
  }
}

for (const { id, use } of selection.skies) {
  const files = (await json(`${API}/files/${id}`)) as {
    hdri: Record<string, { hdr: PhFile }>;
  };
  const source = files.hdri['1k']?.hdr;
  if (!source) throw new Error(`${id}: HDR in 1k fehlt`);
  const original = await cached(source, join(cacheDir, id, `${id}_1k.hdr`));
  const image = decodeHdr(new Uint8Array(await readFile(original)));
  const small = downsampleHdr(image, image.width / selection.skyWidth);
  const rel = `textures/sky/${id}.hdr`;
  const target = join(packageDir, rel);
  await mkdir(dirname(target), { recursive: true });
  const bytes = encodeHdr(small);
  await writeFile(target, bytes);
  const names = await authors(id);
  entries.push({
    id: `himmel-${kebab(id)}`,
    kind: 'hdri',
    source: 'imported',
    path: `packages/assets/${rel}`,
    description: `${use}: Himmel und Umgebungslicht, ${String(small.width)}×${String(small.height)} Radiance-HDR (halbe 1k-Fassung von Poly Haven „${id}“).`,
    license: 'CC0-1.0',
    attribution: `Poly Haven – ${names.join(', ')} (CC0)`,
    origin: `https://polyhaven.com/a/${id}`,
    budgetBytes: budget(bytes.byteLength, manifest.budgets.hdri.maxBytes),
  });
  console.log(`  ${rel}: ${(bytes.byteLength / 1024).toFixed(1)} KiB`);
}

const kept = manifest.assets.filter(
  (a) => !(a.source === 'imported' && /^(natur|himmel)-/.test(a.id)),
);
await writeFile(
  manifestPath,
  `${JSON.stringify({ ...manifest, assets: [...kept, ...entries] }, null, 2)}\n`,
);
console.log(`Poly Haven: ${String(entries.length)} Assets importiert, Manifest aktualisiert.`);
