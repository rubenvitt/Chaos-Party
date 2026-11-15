#!/usr/bin/env node
/**
 * Lädt die CC0-Assets für den Look-Dev (CHAOS-56/57) von Poly Haven nach
 * apps/host/public/lookdev-assets/ (nicht eingecheckt, siehe .gitignore).
 *
 *   node scripts/fetch-lookdev-assets.mjs
 *
 * Liste: apps/host/src/lookdev/polyhaven.json. Je Asset entsteht `<id>/` mit den Dateien und
 * `LICENSE.json` (Quelle, Autoren, Lizenz CC0-1.0). Schon vorhandene Dateien mit passender MD5
 * werden übersprungen. Erst die gewählte Auswahl wandert später ins Asset-Manifest.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const listPath = join(root, 'apps/host/src/lookdev/polyhaven.json');
const outDir = join(root, 'apps/host/public/lookdev-assets');
const API = 'https://api.polyhaven.com';

/**
 * @typedef {{ url: string; md5?: string; size?: number }} PhFile
 * @typedef {{ name?: string; authors?: Record<string, string> }} PhInfo
 * @typedef {Record<string, any>} PhFiles Antwort von /files/<id> (verschachtelt je Typ und Auflösung)
 */

/**
 * @param {string} url
 * @returns {Promise<any>}
 */
async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${String(res.status)}`);
  return res.json();
}

/**
 * @param {string} url
 * @param {string} target
 * @param {string | undefined} md5
 * @returns {Promise<boolean>} true, wenn neu geladen
 */
async function download(url, target, md5) {
  if (existsSync(target) && md5) {
    const have = createHash('md5')
      .update(await readFile(target))
      .digest('hex');
    if (have === md5) return false;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${String(res.status)}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return true;
}

/**
 * @param {string} id
 * @param {string} dir
 */
async function license(id, dir) {
  /** @type {PhInfo} */
  const info = await json(`${API}/info/${id}`);
  await writeFile(
    join(dir, 'LICENSE.json'),
    `${JSON.stringify(
      {
        id,
        name: info.name,
        source: `https://polyhaven.com/a/${id}`,
        authors: Object.keys(info.authors ?? {}),
        license: 'CC0-1.0',
      },
      null,
      2,
    )}\n`,
  );
}

const list = JSON.parse(await readFile(listPath, 'utf8'));
let fetched = 0;

for (const { id, resolution } of list.hdris) {
  /** @type {PhFiles} */
  const files = await json(`${API}/files/${id}`);
  const file = files.hdri[resolution].hdr;
  const dir = join(outDir, id);
  if (await download(file.url, join(dir, `${id}_${resolution}.hdr`), file.md5)) fetched++;
  await license(id, dir);
}

for (const { id, resolution } of list.textures) {
  /** @type {PhFiles} */
  const files = await json(`${API}/files/${id}`);
  const dir = join(outDir, id);
  const maps = { diff: files.Diffuse, nor: files.nor_gl, arm: files.arm };
  for (const [name, map] of Object.entries(maps)) {
    const file = map?.[resolution]?.jpg;
    if (!file) continue;
    if (await download(file.url, join(dir, `${id}_${name}_${resolution}.jpg`), file.md5)) fetched++;
  }
  await license(id, dir);
}

for (const { id, resolution } of list.models) {
  /** @type {PhFiles} */
  const files = await json(`${API}/files/${id}`);
  const gltf = files.gltf[resolution].gltf;
  const dir = join(outDir, id);
  if (await download(gltf.url, join(dir, `${id}_${resolution}.gltf`), gltf.md5)) fetched++;
  for (const [rel, file] of Object.entries(gltf.include ?? {})) {
    if (await download(file.url, join(dir, rel), file.md5)) fetched++;
  }
  await license(id, dir);
}

console.log(`Look-Dev-Assets: ${String(fetched)} Dateien geladen nach ${outDir}`);
