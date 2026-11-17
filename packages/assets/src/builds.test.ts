import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkBuildEntries, provenance } from './builds.ts';
import { ManifestSchema, type AssetManifest } from './manifest.ts';

const real = ManifestSchema.parse(
  JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../manifest.json'), 'utf8'),
  ),
);

function withArtifact(patch: Record<string, unknown>): AssetManifest {
  const build = real.builds?.['apple-host'];
  if (!build) throw new Error('apple-host fehlt');
  const first = build.artifacts[0];
  if (!first) throw new Error('kein Artefakt');
  return {
    ...real,
    builds: { 'apple-host': { ...build, artifacts: [{ ...first, ...patch }] } },
  };
}

describe('Build-Artefakte im Manifest (CHAOS-140)', () => {
  it('das echte Manifest hält alle Regeln ein', () => {
    expect(checkBuildEntries(real)).toEqual([]);
  });

  it('meldet unbekannte Assets in „from“', () => {
    expect(checkBuildEntries(withArtifact({ from: ['gibt-es-nicht'] }))).toEqual([
      expect.stringContaining('unbekanntes Asset „gibt-es-nicht“'),
    ]);
  });

  it('verlangt GPL, wenn GPL-Assets eingehen', () => {
    expect(checkBuildEntries(withArtifact({ license: 'CC0-1.0' }))).toEqual([
      expect.stringContaining('GPL-3.0-only'),
    ]);
  });

  it('meldet doppelte IDs gegenüber den Assets', () => {
    expect(checkBuildEntries(withArtifact({ id: 'figur-robot' }))).toEqual([
      expect.stringContaining('id doppelt'),
    ]);
  });

  it('herkunft.json nennt je Artefakt die Eingänge, alle Lizenzen und Namensnennungen', () => {
    const doc = provenance(real, 'apple-host');
    expect(doc.generator).toBe('scripts/build-apple-assets.mjs');
    const board = doc.artifacts.find((a) => a.id === 'apple-brett');
    expect(board?.path).toBe('brett.usdz');
    expect(board?.inputs.map((i) => i.id)).toContain('natur-leafy-grass-diff');
    const grass = board?.inputs.find((i) => i.id === 'natur-leafy-grass-diff');
    expect(grass?.license).toBe('CC0-1.0');
    expect(grass?.origin).toMatch(/^https:\/\/polyhaven\.com\//);
    expect(doc.licenses).toEqual(['CC0-1.0', 'GPL-3.0-only', 'OFL-1.1']);
    expect(doc.attributions).toEqual([expect.stringContaining('Nunito')]);
    const robot = doc.artifacts.find((a) => a.id === 'apple-figur-robot');
    expect(robot?.inputs).toEqual([
      expect.objectContaining({ id: 'figur-robot', license: 'GPL-3.0-only' }),
    ]);
  });

  it('wirft bei unbekanntem Build', () => {
    expect(() => provenance(real, 'gibt-es-nicht')).toThrow(/nicht im Manifest/);
  });
});
