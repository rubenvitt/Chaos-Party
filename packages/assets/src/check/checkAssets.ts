/**
 * Asset-Prüfung (CHAOS-28): Manifest gegen Dateien, Lizenzen, Budgets und Figuren-Vertrag.
 * Rein in Node (kein Browser, kein Babylon). Liefert verständliche deutsche Fehlermeldungen;
 * das CLI (`cli.ts`) beendet sich bei Fehlern mit Exit-Code 1.
 *
 * Geprüft wird:
 * - Manifest-Schema (zod), eindeutige IDs und Pfade;
 * - jede Manifest-Datei existiert; jede Datei unter `packages/assets/models|sounds|textures`
 *   steht im Manifest; Generator-Skripte existieren;
 * - Lizenz auf der Positivliste, Attribution, wo die Lizenz sie verlangt; bei npm-Paketen
 *   stimmt die Lizenz mit deren `package.json` überein;
 * - Dateigröße ≤ `budgetBytes` ≤ Budget der Art;
 * - GLB-Figuren: Animationsnamen genau wie im Vertrag, Höhe/Füße/Grundfläche aus den echten
 *   Eckpunkten (Ruhepose, mit Knoten-Transformen), Meshes/Primitives/Materialien/Dreiecke im
 *   Budget, Material `akzent` vorhanden und benutzt, Knoten `abzeichen` vorhanden;
 * - SVG: keine Skripte, Ereignis-Attribute oder externen Verweise.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { ACCENT_MATERIAL, BADGE_NODE, CHARACTER_ANIMATIONS, CHARACTER_SCALE } from '../contract.ts';
import {
  ALLOWED_ASSET_LICENSES,
  ASSET_FILE_DIRS,
  ATTRIBUTION_REQUIRED,
  ManifestSchema,
  type AssetEntry,
  type AssetManifest,
} from '../manifest.ts';
import { GlbError, glbStats } from './glb.ts';

export interface CheckOptions {
  /** Wurzel des Repositorys (Manifest-Pfade sind relativ dazu). */
  readonly repoRoot: string;
  /** Pfad des Manifests relativ zu `repoRoot` (Standard: `packages/assets/manifest.json`). */
  readonly manifestPath?: string;
  /** Ordner des Asset-Pakets relativ zu `repoRoot` (Standard: `packages/assets`). */
  readonly assetsDir?: string;
}

export interface CheckResult {
  readonly errors: readonly string[];
  /** Kurze Zeilen für die Ausgabe bei Erfolg (je Datei-Asset Kennzahlen). */
  readonly notes: readonly string[];
  readonly checked: number;
}

const CODE_FILE = /\.(ts|tsx|js|mjs|cjs)$/;
const ALLOWED = new Set<string>(ALLOWED_ASSET_LICENSES);

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function kib(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/** Manifest lesen und gegen das Schema prüfen. */
export function parseManifest(text: string): { manifest: AssetManifest | null; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      manifest: null,
      errors: [`Manifest ist kein gültiges JSON: ${(error as Error).message}`],
    };
  }
  const parsed = ManifestSchema.safeParse(raw);
  if (parsed.success) return { manifest: parsed.data, errors: [] };
  return {
    manifest: null,
    errors: parsed.error.issues.map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join('.') : '(Wurzel)';
      return `Manifest ungültig bei ${where}: ${issue.message}`;
    }),
  };
}

function checkSvg(text: string): string[] {
  const problems: string[] = [];
  if (/<script\b/i.test(text)) problems.push('enthält <script>');
  if (/\son[a-z]+\s*=/i.test(text)) problems.push('enthält Ereignis-Attribute (on…=)');
  if (/<foreignObject\b/i.test(text)) problems.push('enthält <foreignObject>');
  if (/(?:href|src)\s*=\s*["'](?!#)/i.test(text)) problems.push('verweist auf externe Inhalte');
  if (!/^\s*<svg\b/.test(text)) problems.push('beginnt nicht mit <svg>');
  return problems;
}

function checkModel(
  entry: AssetEntry,
  bytes: Uint8Array,
  manifest: AssetManifest,
  label: string,
): { errors: string[]; note: string } {
  const errors: string[] = [];
  const budget = manifest.budgets.model;
  let stats;
  try {
    stats = glbStats(bytes);
  } catch (error) {
    const reason = error instanceof GlbError ? error.message : String(error);
    return { errors: [`${label}: GLB nicht lesbar – ${reason}`], note: '' };
  }
  const expected: readonly string[] = CHARACTER_ANIMATIONS;
  const actual = new Set(stats.animations);
  const missing = expected.filter((name) => !actual.has(name));
  const unknown = stats.animations.filter((name) => !expected.includes(name));
  if (missing.length > 0) {
    errors.push(
      `${label}: Animation fehlt: ${missing.join(', ')} (Pflicht: ${expected.join(', ')})`,
    );
  }
  if (unknown.length > 0) {
    errors.push(
      `${label}: unbekannte Animation: ${unknown.join(', ')} (erlaubt: ${expected.join(', ')})`,
    );
  }
  if (new Set(stats.animations).size !== stats.animations.length) {
    errors.push(`${label}: Animationsnamen doppelt`);
  }
  const manifestAnimations = [...(entry.animations ?? [])].sort();
  const fileAnimations = [...stats.animations].sort();
  if (manifestAnimations.join(',') !== fileAnimations.join(',')) {
    errors.push(
      `${label}: Animationen im Manifest (${manifestAnimations.join(', ') || '–'}) passen nicht zur Datei (${fileAnimations.join(', ') || '–'})`,
    );
  }
  const height = stats.max[1] - stats.min[1];
  const t = CHARACTER_SCALE.tolerance;
  if (Math.abs(stats.min[1]) > t) {
    errors.push(`${label}: Füße nicht bei y = 0 (tiefster Punkt y = ${stats.min[1].toFixed(3)})`);
  }
  if (height < CHARACTER_SCALE.minHeight || height > CHARACTER_SCALE.maxHeight) {
    errors.push(
      `${label}: Höhe ${height.toFixed(2)} außerhalb ${String(CHARACTER_SCALE.minHeight)}–${String(CHARACTER_SCALE.maxHeight)}`,
    );
  }
  if (entry.height === undefined) {
    errors.push(`${label}: Feld „height“ fehlt im Manifest (gemessen ${height.toFixed(2)})`);
  } else if (Math.abs(entry.height - height) > t) {
    errors.push(
      `${label}: Höhe im Manifest ${String(entry.height)}, gemessen ${height.toFixed(3)}`,
    );
  }
  if (stats.footprintRadius > CHARACTER_SCALE.footprintRadius + 1e-3) {
    errors.push(
      `${label}: Grundfläche zu groß (Radius ${stats.footprintRadius.toFixed(3)} > ${String(CHARACTER_SCALE.footprintRadius)})`,
    );
  }
  if (stats.meshes > budget.maxMeshes) {
    errors.push(`${label}: ${String(stats.meshes)} Meshes, Budget ${String(budget.maxMeshes)}`);
  }
  if (stats.primitives > budget.maxPrimitives) {
    errors.push(
      `${label}: ${String(stats.primitives)} Primitives (Draw-Calls), Budget ${String(budget.maxPrimitives)}`,
    );
  }
  if (stats.materials.length > budget.maxMaterials) {
    errors.push(
      `${label}: ${String(stats.materials.length)} Materialien, Budget ${String(budget.maxMaterials)}`,
    );
  }
  if (stats.triangles > budget.maxTriangles) {
    errors.push(
      `${label}: ${String(stats.triangles)} Dreiecke, Budget ${String(budget.maxTriangles)}`,
    );
  }
  if (!stats.materials.includes(ACCENT_MATERIAL)) {
    errors.push(
      `${label}: Material „${ACCENT_MATERIAL}“ fehlt (wird zur Laufzeit in Slot-Farbe gefärbt)`,
    );
  } else if (!stats.usedMaterials.includes(ACCENT_MATERIAL)) {
    errors.push(`${label}: Material „${ACCENT_MATERIAL}“ ist an keinem Mesh`);
  }
  if (!stats.nodes.includes(BADGE_NODE)) {
    errors.push(`${label}: Knoten „${BADGE_NODE}“ fehlt (Anker für das Slot-Abzeichen)`);
  }
  const note =
    `${label}: ${kib(bytes.byteLength)}, Höhe ${height.toFixed(2)}, Radius ${stats.footprintRadius.toFixed(2)}, ` +
    `${String(stats.meshes)} Meshes/${String(stats.primitives)} Primitives, ${String(stats.materials.length)} Materialien, ` +
    `${String(stats.triangles)} Dreiecke, ${String(stats.animations.length)} Animationen`;
  return { errors, note };
}

async function packageLicense(fromDir: string, name: string): Promise<string | null> {
  try {
    const require = createRequire(join(fromDir, 'noop.js'));
    const pkgPath = require.resolve(`${name}/package.json`);
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { license?: unknown };
    return typeof pkg.license === 'string' ? pkg.license : null;
  } catch {
    return null;
  }
}

export async function checkAssets(options: CheckOptions): Promise<CheckResult> {
  const root = options.repoRoot;
  const manifestRel = options.manifestPath ?? 'packages/assets/manifest.json';
  const assetsDir = options.assetsDir ?? 'packages/assets';
  const errors: string[] = [];
  const notes: string[] = [];

  let text: string;
  try {
    text = await readFile(join(root, manifestRel), 'utf8');
  } catch {
    return { errors: [`Manifest fehlt: ${manifestRel}`], notes, checked: 0 };
  }
  const { manifest, errors: schemaErrors } = parseManifest(text);
  if (!manifest) return { errors: schemaErrors, notes, checked: 0 };

  const ids = new Set<string>();
  const filePaths = new Set<string>();
  for (const entry of manifest.assets) {
    const label = `Asset „${entry.id}“`;
    if (ids.has(entry.id)) errors.push(`${label}: id doppelt`);
    ids.add(entry.id);

    // Lizenz und Attribution.
    if (!ALLOWED.has(entry.license)) {
      errors.push(
        `${label}: Lizenz „${entry.license}“ nicht auf der Positivliste (${ALLOWED_ASSET_LICENSES.join(', ')})`,
      );
    }
    if (ATTRIBUTION_REQUIRED.has(entry.license) && !entry.attribution) {
      errors.push(
        `${label}: Lizenz ${entry.license} verlangt eine Attribution (Feld „attribution“)`,
      );
    }

    const full = join(root, entry.path);
    if (!(await exists(full))) {
      errors.push(`${label}: Datei fehlt: ${entry.path}`);
      continue;
    }

    if (entry.package) {
      const license = await packageLicense(dirname(full), entry.package);
      if (license === null) {
        errors.push(`${label}: Paket „${entry.package}“ nicht gefunden (von ${entry.path} aus)`);
      } else if (license !== entry.license) {
        errors.push(
          `${label}: Paket „${entry.package}“ hat Lizenz ${license}, Manifest sagt ${entry.license}`,
        );
      }
    }

    if (entry.source === 'generated') {
      if (!entry.generator) errors.push(`${label}: generiert, aber Feld „generator“ fehlt`);
      else if (!(await exists(join(root, entry.generator)))) {
        errors.push(`${label}: Generator fehlt: ${entry.generator}`);
      }
    }

    if (entry.source === 'procedural' || (entry.source === 'imported' && entry.package)) {
      if (!CODE_FILE.test(entry.path)) {
        errors.push(
          `${label}: ${entry.source === 'procedural' ? 'prozedural' : 'Paket'} – Pfad muss eine Code-Datei sein (${entry.path})`,
        );
      }
      if (entry.kind === 'model') {
        errors.push(`${label}: Modelle müssen Dateien sein (generated/imported)`);
      }
      continue;
    }

    // Dateien: Budget und Inhalt.
    filePaths.add(entry.path);
    const bytes = new Uint8Array(await readFile(full));
    const kindBudget =
      entry.kind === 'model'
        ? manifest.budgets.model.maxBytes
        : entry.kind === 'texture'
          ? manifest.budgets.texture.maxBytes
          : entry.kind === 'sound'
            ? manifest.budgets.sound.maxBytes
            : undefined;
    if (entry.budgetBytes === undefined) {
      errors.push(`${label}: Feld „budgetBytes“ fehlt (Datei ${kib(bytes.byteLength)})`);
    } else {
      if (bytes.byteLength > entry.budgetBytes) {
        errors.push(
          `${label}: Datei zu groß: ${kib(bytes.byteLength)} > Budget ${kib(entry.budgetBytes)} (${entry.path})`,
        );
      }
      if (kindBudget !== undefined && entry.budgetBytes > kindBudget) {
        errors.push(
          `${label}: budgetBytes ${kib(entry.budgetBytes)} über dem Budget der Art ${kib(kindBudget)}`,
        );
      }
    }

    if (entry.kind === 'model') {
      if (!entry.path.endsWith('.glb')) {
        errors.push(`${label}: Modelle bitte als .glb (${entry.path})`);
        continue;
      }
      const result = checkModel(entry, bytes, manifest, label);
      errors.push(...result.errors);
      if (result.note) notes.push(result.note);
    } else if (entry.path.endsWith('.svg')) {
      const problems = checkSvg(new TextDecoder().decode(bytes));
      for (const problem of problems) errors.push(`${label}: SVG ${problem}`);
      notes.push(`${label}: ${kib(bytes.byteLength)}`);
    } else {
      notes.push(`${label}: ${kib(bytes.byteLength)}`);
    }
  }

  // Jede Datei in den Asset-Ordnern muss im Manifest stehen.
  for (const dir of ASSET_FILE_DIRS) {
    for (const file of await listFiles(join(root, assetsDir, dir))) {
      const rel = toPosix(relative(root, file));
      if (!filePaths.has(rel)) errors.push(`Datei ohne Manifest-Eintrag: ${rel}`);
    }
  }

  return { errors, notes, checked: manifest.assets.length };
}
