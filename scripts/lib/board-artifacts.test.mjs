import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_REGISTRY } from '../../packages/game-core/src/board/registry.ts';

const root = join(import.meta.dirname, '../..');
/** @type {{ builds: Record<string, { artifacts: { id: string, path: string, from: string[] }[] }> }} */
const manifest = JSON.parse(readFileSync(join(root, 'packages/assets/manifest.json'), 'utf8'));
const artifacts = manifest.builds['apple-host']?.artifacts ?? [];

describe('Apple-Assets: Kulisse je Brett (CHAOS-212)', () => {
  it('jedes Brett des Registers hat ein Artefakt bretter/<id>/brett.usdz mit Herkunft', () => {
    for (const { id } of BOARD_REGISTRY) {
      const artifact = artifacts.find((a) => a.path === `bretter/${id}/brett.usdz`);
      expect(artifact, `Manifest: Artefakt für ${id}`).toBeDefined();
      expect(artifact?.id).toBe(`apple-brett-${id}`);
      expect(artifact?.from.length).toBeGreaterThan(0);
    }
  });

  it('keine Kulisse ohne Brett im Register', () => {
    const ids = new Set(BOARD_REGISTRY.map((info) => info.id));
    for (const artifact of artifacts.filter((a) => a.path.startsWith('bretter/'))) {
      expect(ids.has(artifact.path.split('/')[1] ?? '')).toBe(true);
    }
  });
});
