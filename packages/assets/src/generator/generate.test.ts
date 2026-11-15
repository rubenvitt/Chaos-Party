/**
 * Reproduzierbarkeit (CHAOS-27): Der Generator erzeugt inhaltlich die eingecheckten Dateien.
 * Schlägt der Test fehl, wurde der Generator geändert, ohne `pnpm generate:assets` laufen zu
 * lassen (oder umgekehrt eine Datei von Hand verändert).
 *
 * Verglichen wird nicht byte-genau: Node-Versionen (lokal 22, CI 24) rechnen `Math.sin` & Co.
 * in den letzten Stellen verschieden, dadurch ändern sich Zahlen im glTF-JSON um wenige
 * Zeichen. Geprüft werden deshalb gleiche JSON-Struktur mit Zahlen auf 1e-6 genau und gleiche
 * Binärdaten (als Float32 gelesen, Abweichung höchstens 1e-4).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../contract.ts';
import { generateCharacterGlb } from './generate.ts';
import { portraitSvg } from './portraits.ts';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** GLB in JSON-Chunk und Binär-Chunk zerlegen. */
function readGlb(bytes: Uint8Array): { json: unknown; bin: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binStart = 20 + jsonLength;
  const bin =
    binStart + 8 <= bytes.byteLength
      ? bytes.subarray(binStart + 8, binStart + 8 + view.getUint32(binStart, true))
      : new Uint8Array();
  return { json, bin };
}

/** Pfade, an denen sich zwei JSON-Werte unterscheiden (Zahlen mit Toleranz 1e-6). */
function approxDiff(a: unknown, b: unknown, path: string): string[] {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a)) ? [] : [path];
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [`${path}.length`];
    return a.flatMap((item, index) => approxDiff(item, b[index], `${path}[${String(index)}]`));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((key) =>
      approxDiff(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        `${path}.${key}`,
      ),
    );
  }
  return Object.is(a, b) ? [] : [path];
}

/** Anzahl 4-Byte-Wörter, die weder bitgleich noch als Float32 nahezu gleich sind. */
function binDiffs(a: Uint8Array, b: Uint8Array): number {
  const words = Math.floor(a.byteLength / 4);
  const fa = new DataView(a.buffer, a.byteOffset, a.byteLength);
  const fb = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let diffs = 0;
  for (let index = 0; index < words; index++) {
    const offset = index * 4;
    if (fa.getUint32(offset, true) === fb.getUint32(offset, true)) continue;
    const x = fa.getFloat32(offset, true);
    const y = fb.getFloat32(offset, true);
    if (!(Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-4)) diffs++;
  }
  return diffs;
}

describe('Figuren-Generator', () => {
  it.each(CHARACTER_IDS)('%s.glb ist aktuell', async (id) => {
    const generated = await generateCharacterGlb(id);
    const committed = new Uint8Array(
      await readFile(join(packageDir, 'models', 'characters', `${id}.glb`)),
    );
    const a = readGlb(generated);
    const b = readGlb(committed);
    expect(approxDiff(a.json, b.json, '$')).toEqual([]);
    expect(a.bin.byteLength).toBe(b.bin.byteLength);
    expect(binDiffs(a.bin, b.bin)).toBe(0);
  });

  it.each(CHARACTER_IDS)('Porträt %s.svg ist aktuell', async (id) => {
    const committed = await readFile(
      join(packageDir, 'textures', 'portraits', `${id}.svg`),
      'utf8',
    );
    expect(portraitSvg(id)).toBe(committed);
  });
});
