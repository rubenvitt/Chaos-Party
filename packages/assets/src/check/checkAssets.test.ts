/**
 * Asset-Prüfung (CHAOS-28): Das echte Manifest ist grün; kaputte Test-Manifeste (fehlende
 * Datei, fehlende/unerlaubte Lizenz, falsche Animation, Budget überschritten …) schlagen mit
 * verständlicher Meldung fehl – so bricht CI bei fehlender Lizenz oder fehlendem Asset ab.
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { AssetManifest } from '../manifest.ts';
import { checkAssets } from './checkAssets.ts';
import { parseGlb } from './glb.ts';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = join(packageDir, '..', '..');

async function realManifest(): Promise<AssetManifest> {
  return JSON.parse(await readFile(join(packageDir, 'manifest.json'), 'utf8')) as AssetManifest;
}

/** Baut ein Mini-Repository mit Asset-Ordner, Generator und den echten Dateien. */
async function sandbox(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'chaos-assets-'));
  await cp(join(packageDir, 'models'), join(dir, 'packages/assets/models'), { recursive: true });
  await cp(join(packageDir, 'textures'), join(dir, 'packages/assets/textures'), {
    recursive: true,
  });
  await mkdir(join(dir, 'packages/assets/src/generator'), { recursive: true });
  await writeFile(join(dir, 'packages/assets/src/generator/cli.ts'), '// Generator\n');
  // Figuren entstehen seit CHAOS-58 in Blender.
  await mkdir(join(dir, 'packages/assets/blender'), { recursive: true });
  await writeFile(join(dir, 'packages/assets/blender/build-all.sh'), '# Generator\n');
  return dir;
}

/** Manifest nur mit Datei-Assets (prozedurale Einträge zeigen auf Host-Code außerhalb). */
async function fileManifest(): Promise<AssetManifest> {
  const manifest = await realManifest();
  return {
    ...manifest,
    assets: manifest.assets.filter((a) => a.source === 'generated'),
  };
}

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function run(manifest: unknown, prepare?: (dir: string) => Promise<void>) {
  const dir = await sandbox();
  dirs.push(dir);
  await writeFile(join(dir, 'packages/assets/manifest.json'), JSON.stringify(manifest));
  if (prepare) await prepare(dir);
  return checkAssets({ repoRoot: dir });
}

/** GLB mit geändertem JSON-Chunk neu schreiben (BIN-Chunk bleibt). */
function patchGlb(bytes: Uint8Array, change: (json: Record<string, unknown>) => void): Uint8Array {
  const { json, bin } = parseGlb(bytes);
  const copy = JSON.parse(JSON.stringify(json)) as Record<string, unknown>;
  change(copy);
  let text = JSON.stringify(copy);
  while (text.length % 4 !== 0) text += ' ';
  const jsonBytes = new TextEncoder().encode(text);
  const binLength = bin ? bin.byteLength : 0;
  const total = 12 + 8 + jsonBytes.byteLength + (bin ? 8 + binLength : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  if (bin) {
    const at = 20 + jsonBytes.byteLength;
    view.setUint32(at, binLength, true);
    view.setUint32(at + 4, 0x004e4942, true);
    out.set(bin, at + 8);
  }
  return out;
}

describe('Asset-Prüfung', () => {
  it('echtes Manifest im Repository ist grün', async () => {
    const result = await checkAssets({ repoRoot });
    expect(result.errors).toEqual([]);
    expect(result.checked).toBeGreaterThanOrEqual(8);
  });

  it('Sandbox mit unveränderten Dateien ist grün', async () => {
    const result = await run(await fileManifest());
    expect(result.errors).toEqual([]);
  });

  it('fehlende Datei', async () => {
    const result = await run(await fileManifest(), async (dir) => {
      await rm(join(dir, 'packages/assets/models/characters/sock.glb'));
    });
    expect(result.errors).toContain(
      'Asset „figur-sock“: Datei fehlt: packages/assets/models/characters/sock.glb',
    );
  });

  it('Datei ohne Manifest-Eintrag', async () => {
    const manifest = await fileManifest();
    const result = await run(
      { ...manifest, assets: manifest.assets.filter((a) => a.id !== 'portraet-sock') },
      async (dir) => {
        await mkdir(join(dir, 'packages/assets/sounds'), { recursive: true });
        await writeFile(join(dir, 'packages/assets/sounds/geheim.ogg'), 'x');
      },
    );
    expect(result.errors).toContain(
      'Datei ohne Manifest-Eintrag: packages/assets/textures/portraits/sock.svg',
    );
    expect(result.errors).toContain(
      'Datei ohne Manifest-Eintrag: packages/assets/sounds/geheim.ogg',
    );
  });

  it('fehlende Lizenz', async () => {
    const manifest = await fileManifest();
    const [first, ...others] = manifest.assets;
    const withoutLicense: Record<string, unknown> = { ...first };
    delete withoutLicense.license;
    const result = await run({
      ...manifest,
      assets: [withoutLicense, ...others],
    });
    expect(result.errors.join('\n')).toMatch(/Manifest ungültig bei assets\.0\.license/);
  });

  it('Lizenz nicht auf der Positivliste und fehlende Attribution', async () => {
    const manifest = await fileManifest();
    const assets = manifest.assets.map((a, i) => {
      if (i === 0) return { ...a, license: 'CC-BY-NC-4.0' };
      if (i === 1) {
        const rest: Record<string, unknown> = { ...a, license: 'CC-BY-4.0' };
        delete rest.attribution;
        return rest;
      }
      return a;
    });
    const result = await run({ ...manifest, assets });
    const text = result.errors.join('\n');
    expect(text).toMatch(/„figur-robot“: Lizenz „CC-BY-NC-4\.0“ nicht auf der Positivliste/);
    expect(text).toMatch(/„figur-cactus“: Lizenz CC-BY-4\.0 verlangt eine Attribution/);
  });

  it('falsche Animation in der GLB-Datei', async () => {
    const result = await run(await fileManifest(), async (dir) => {
      const path = join(dir, 'packages/assets/models/characters/robot.glb');
      const patched = patchGlb(new Uint8Array(await readFile(path)), (json) => {
        const animations = json.animations as { name: string }[];
        const idle = animations.find((a) => a.name === 'idle');
        if (idle) idle.name = 'idel';
      });
      await writeFile(path, patched);
    });
    const text = result.errors.join('\n');
    expect(text).toMatch(/„figur-robot“: Animation fehlt: idle/);
    expect(text).toMatch(/„figur-robot“: unbekannte Animation: idel/);
  });

  it('Akzent-Material fehlt', async () => {
    const result = await run(await fileManifest(), async (dir) => {
      const path = join(dir, 'packages/assets/models/characters/sock.glb');
      const patched = patchGlb(new Uint8Array(await readFile(path)), (json) => {
        for (const m of json.materials as { name: string }[])
          if (m.name === 'akzent') m.name = 'rot';
      });
      await writeFile(path, patched);
    });
    expect(result.errors.join('\n')).toMatch(/„figur-sock“: Material „akzent“ fehlt/);
  });

  it('Budget überschritten', async () => {
    const manifest = await fileManifest();
    const assets = manifest.assets.map((a) =>
      a.id === 'figur-cactus' ? { ...a, budgetBytes: 1000 } : a,
    );
    const result = await run({
      ...manifest,
      budgets: { ...manifest.budgets, model: { ...manifest.budgets.model, maxTriangles: 100 } },
      assets,
    });
    const text = result.errors.join('\n');
    expect(text).toMatch(/„figur-cactus“: Datei zu groß: .* > Budget 1\.0 KiB/);
    expect(text).toMatch(/„figur-robot“: \d+ Dreiecke, Budget 100/);
  });

  it('Höhe im Manifest passt nicht zur Datei', async () => {
    const manifest = await fileManifest();
    const assets = manifest.assets.map((a) => (a.id === 'figur-sock' ? { ...a, height: 1.75 } : a));
    const result = await run({ ...manifest, assets });
    expect(result.errors.join('\n')).toMatch(/„figur-sock“: Höhe im Manifest 1\.75, gemessen 1\.5/);
  });

  it('SVG mit Skript', async () => {
    const result = await run(await fileManifest(), async (dir) => {
      await writeFile(
        join(dir, 'packages/assets/textures/portraits/robot.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
    });
    expect(result.errors).toContain('Asset „portraet-robot“: SVG enthält <script>');
  });

  it('generiert ohne Generator-Skript', async () => {
    const manifest = await fileManifest();
    const assets = manifest.assets.map((a) =>
      a.id === 'figur-robot' ? { ...a, generator: 'packages/assets/src/generator/fehlt.ts' } : a,
    );
    const result = await run({ ...manifest, assets });
    expect(result.errors).toContain(
      'Asset „figur-robot“: Generator fehlt: packages/assets/src/generator/fehlt.ts',
    );
  });

  it('Paket-Lizenz muss zur package.json passen', async () => {
    const manifest = await realManifest();
    const font = manifest.assets.find((a) => a.id === 'schrift-nunito');
    expect(font).toBeDefined();
    const result = await run(
      { ...manifest, assets: [{ ...font, license: 'MIT' }] },
      async (dir) => {
        // Einbindungs-Datei und Paket wie im echten Host.
        await mkdir(join(dir, 'apps/host/src'), { recursive: true });
        await writeFile(join(dir, 'apps/host/src/main.tsx'), '');
        await mkdir(join(dir, 'apps/host/node_modules/@fontsource-variable/nunito'), {
          recursive: true,
        });
        await writeFile(
          join(dir, 'apps/host/node_modules/@fontsource-variable/nunito/package.json'),
          JSON.stringify({ name: '@fontsource-variable/nunito', license: 'OFL-1.1' }),
        );
      },
    );
    expect(result.errors.join('\n')).toMatch(
      /„schrift-nunito“: Paket „@fontsource-variable\/nunito“ hat Lizenz OFL-1\.1, Manifest sagt MIT/,
    );
  });

  it('kein gültiges JSON', async () => {
    const dir = await sandbox();
    dirs.push(dir);
    await writeFile(join(dir, 'packages/assets/manifest.json'), '{ kaputt');
    const result = await checkAssets({ repoRoot: dir });
    expect(result.errors[0]).toMatch(/^Manifest ist kein gültiges JSON/);
  });
});
