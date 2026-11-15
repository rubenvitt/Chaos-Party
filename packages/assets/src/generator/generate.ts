/**
 * Erzeugt die Figuren-GLBs und Porträt-SVGs (CHAOS-27) – reproduzierbar, ohne Browser.
 * Babylon.js (NullEngine) baut die Figur, `@babylonjs/serializers` schreibt glTF 2.0 binär.
 */
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Logger } from '@babylonjs/core/Misc/logger.js';
import { Scene } from '@babylonjs/core/scene.js';
import { GLTF2Export } from '@babylonjs/serializers/glTF/2.0/glTFSerializer.js';
import { buildAnimationGroups } from './clips.ts';
import { buildCharacter, type CharacterId } from './characters.ts';

/** Erzeugt die GLB-Datei einer Figur als Bytes. */
export async function generateCharacterGlb(id: CharacterId): Promise<Uint8Array> {
  const previous = Logger.LogLevels;
  Logger.LogLevels = Logger.ErrorLogLevel;
  const engine = new NullEngine();
  Logger.LogLevels = previous;
  const scene = new Scene(engine);
  try {
    const built = buildCharacter(scene, id);
    buildAnimationGroups(scene, built.joints, built.clips);
    const data = await GLTF2Export.GLBAsync(scene, id, {
      exportWithoutWaitingForScene: true,
      exportUnusedUVs: false,
    });
    const blob = data.files[`${id}.glb`];
    if (!(blob instanceof Blob)) throw new Error(`Export von ${id} lieferte keine GLB-Datei`);
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    scene.dispose();
    engine.dispose();
  }
}
