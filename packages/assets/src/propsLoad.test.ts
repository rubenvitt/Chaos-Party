/**
 * Requisiten im echten Babylon-Lader (CHAOS-88), headless mit NullEngine: jedes GLB lädt ohne
 * Fehler, hat den Wurzelknoten mit seinem Namen, nur Materialien aus dem Vertrag, steht auf
 * dem Boden; je Minispiel wird die Ladezeit aller Requisiten gemessen (Parsen ohne Netz).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { Logger } from '@babylonjs/core/Misc/logger.js';
import { Scene } from '@babylonjs/core/scene.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_clearcoat.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MINIGAME_PROP_SETS,
  PROP_IDS,
  PROP_MATERIALS,
  PROP_RUNTIME,
  minigameProps,
  propModelPath,
  type PropId,
} from './props.ts';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');

let engine: NullEngine;
let scene: Scene;
const files = new Map<PropId, Uint8Array>();

beforeAll(async () => {
  const level = Logger.LogLevels;
  Logger.LogLevels = Logger.ErrorLogLevel;
  engine = new NullEngine();
  Logger.LogLevels = level;
  scene = new Scene(engine);
  for (const id of PROP_IDS) {
    files.set(id, new Uint8Array(await readFile(join(packageDir, propModelPath(id)))));
  }
});

afterAll(() => {
  scene.dispose();
  engine.dispose();
});

async function load(id: PropId) {
  const bytes = files.get(id);
  if (!bytes) throw new Error(`${id} fehlt`);
  return LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb', name: `${id}.glb` });
}

describe('Requisiten im Babylon-Lader', () => {
  it.each(PROP_IDS)('%s lädt mit Vertrags-Materialien und steht am Boden', async (id) => {
    const container = await load(id);
    try {
      expect(container.animationGroups).toHaveLength(0);
      expect(container.transformNodes.map((n) => n.name)).toContain(id);
      const names = container.materials.map((m) => m.name);
      for (const name of names) expect(PROP_MATERIALS as readonly string[]).toContain(name);
      for (const name of PROP_RUNTIME[id] ?? []) expect(names).toContain(name);
      container.addAllToScene();
      const meshes = container.meshes.filter((m) => m.getTotalVertices() > 0);
      expect(meshes.length).toBeGreaterThan(0);
      for (const mesh of meshes) mesh.computeWorldMatrix(true);
      const minY = Math.min(...meshes.map((m) => m.getBoundingInfo().boundingBox.minimumWorld.y));
      expect(Math.abs(minY)).toBeLessThan(0.01);
    } finally {
      container.removeAllFromScene();
      container.dispose();
    }
  });

  it('Ladezeit je Minispiel (alle Requisiten parsen) bleibt klein', async () => {
    const times: string[] = [];
    for (const game of Object.keys(MINIGAME_PROP_SETS)) {
      const start = performance.now();
      const containers = await Promise.all(minigameProps(game).map((id) => load(id)));
      const ms = performance.now() - start;
      for (const c of containers) c.dispose();
      times.push(`${game}: ${ms.toFixed(0)} ms`);
      // Großzügig (CI-Maschinen schwanken); der Richtwert steht in docs/art-direction.md.
      expect(ms).toBeLessThan(1500);
    }
    console.info(`Requisiten-Ladezeit (NullEngine, ohne Netz): ${times.join(', ')}`);
  });
});
