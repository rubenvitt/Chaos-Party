#!/usr/bin/env node
/**
 * Packt die Look-Dev-Vitrine (CHAOS-56/57) als eigenständige Seite für ein claude.ai-Artefakt:
 *
 *   node scripts/fetch-lookdev-assets.mjs   # einmalig, CC0-Assets laden
 *   node scripts/pack-lookdev-artifact.mjs <zielordner>
 *
 * Artefakte liefern nur Web-Standardtypen aus. Deshalb heißen im Paket glTF-Dateien `.gltf.json`
 * und Binärdateien (GLB, HDR, glTF-Puffer) `.wasm`; der Code lädt sie mit explizitem Format
 * (`VITE_LOOKDEV_PACKED=1`, siehe `apps/host/src/lookdev/nature.ts`). Nicht genutzte
 * Look-Dev-Assets fallen weg. Ergebnis: `<ziel>/index.html` (Seiteninhalt ohne Dokument-Gerüst)
 * plus `assets/` und `lookdev-assets/`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!target) {
  console.error('Aufruf: node scripts/pack-lookdev-artifact.mjs <zielordner>');
  process.exit(1);
}
const out = resolve(target);
const hostDir = join(root, 'apps/host');

execFileSync(
  'pnpm',
  ['exec', 'vite', 'build', '-c', 'vite.lookdev.config.ts', '--outDir', out, '--emptyOutDir'],
  { cwd: hostDir, stdio: 'inherit', env: { ...process.env, VITE_LOOKDEV_PACKED: '1' } },
);

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  /** @type {string[]} */
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const builtHtml = await readFile(join(out, 'src/lookdev/lookdev.html'), 'utf8');
const scripts = (await walk(join(out, 'assets'))).filter((f) => f.endsWith('.js'));
const bundle = (await Promise.all(scripts.map((f) => readFile(f, 'utf8')))).join('\n');

// Ungenutzte Look-Dev-Assets entfernen (nicht im Bundle erwähnt).
const assetDir = join(out, 'lookdev-assets');
for (const id of await readdir(assetDir)) {
  if (!bundle.includes(id)) await rm(join(assetDir, id), { recursive: true });
}

// GLB-Figuren: Datei umbenennen und Verweise im Bundle anpassen.
for (const file of await walk(join(out, 'assets'))) {
  if (!file.endsWith('.glb')) continue;
  const name = file.slice(file.lastIndexOf('/') + 1);
  await rename(file, `${file}.wasm`);
  for (const script of scripts) {
    const code = await readFile(script, 'utf8');
    if (code.includes(name)) await writeFile(script, code.replaceAll(name, `${name}.wasm`));
  }
}

// HDR, glTF-Puffer und glTF-JSON.
for (const file of await walk(assetDir)) {
  if (file.endsWith('.hdr') || file.endsWith('.bin')) {
    await rename(file, `${file}.wasm`);
  } else if (file.endsWith('.gltf')) {
    const gltf = JSON.parse(await readFile(file, 'utf8'));
    for (const buffer of gltf.buffers ?? []) {
      if (typeof buffer.uri === 'string' && buffer.uri.endsWith('.bin')) buffer.uri += '.wasm';
    }
    await writeFile(`${file}.json`, JSON.stringify(gltf));
    await rm(file);
  }
}

// Seite: Titel, Stile, Körper der Vitrine, Modul-Skript (ohne Dokument-Gerüst).
const style = /<style>[\s\S]*?<\/style>/.exec(builtHtml)?.[0] ?? '';
const script =
  /<script type="module" crossorigin src="\.\.\/\.\.\/(assets\/[^"]+)"><\/script>/.exec(
    builtHtml,
  )?.[1];
const css = /<link rel="stylesheet" crossorigin href="\.\.\/\.\.\/(assets\/[^"]+)">/.exec(
  builtHtml,
)?.[1];
const body = (/<body>([\s\S]*?)<\/body>/.exec(builtHtml)?.[1] ?? '')
  .replace(/\s*<script type="module"[^>]*><\/script>/g, '')
  .trim();
if (!script) throw new Error('Modul-Skript im Build nicht gefunden');
const page = `<title>Chaos Party Naturwelt 3D</title>
<meta name="claude:viewport-fit-sides" content="cover">
${css ? `<link rel="stylesheet" href="./${css}">` : ''}
${style}
<style>html,body{height:100%}:root{color-scheme:light}body{background:#dfe7ec}</style>
<script>if (!/^#natur-(morgen|abend|wolken)-(brett|figur|minispiel)$/.test(location.hash)) location.hash = 'natur-morgen-brett';</script>
${body}
<script type="module" src="./${script}"></script>
`;
await writeFile(join(out, 'index.html'), page);
await rm(join(out, 'src'), { recursive: true });

const files = (await walk(out)).map((f) => relative(out, f)).filter((f) => f !== 'index.html');
await writeFile(join(out, '..', `${out.split('/').pop()}-files.json`), JSON.stringify(files));
console.log(`Paket: ${String(files.length)} Dateien + index.html in ${out}`);
if (!existsSync(join(out, 'index.html'))) process.exit(1);
