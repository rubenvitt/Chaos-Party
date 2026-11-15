/**
 * Babylon-Seite der Szenen-Messung (CHAOS-39): Messwerte je Bild, Bestand einer Szene und
 * Zustand aller Engines der Seite. Kostet nur etwas, solange jemand zuhört (`?debug=1`).
 */
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { EngineStore } from '@babylonjs/core/Engines/engineStore.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { EnvironmentSample, FrameSample, ResourceSample } from './perfTypes.ts';

/**
 * Meldet nach jedem `scene.render()` Draw Calls, aktive Meshes und die JS-Zeit des Renderns
 * (ab `onBeforeAnimations`, dem ersten Schritt von `scene.render()`). Der Zähler der Engine
 * (`_drawCalls`, sonst nur von `SceneInstrumentation` gelesen) wird je Bild abgeholt.
 */
export function observeFrames(scene: Scene, listener: (sample: FrameSample) => void): () => void {
  const engine = scene.getEngine();
  let startedAt: number | null = null;
  const before = scene.onBeforeAnimationsObservable.add(() => {
    startedAt = performance.now();
  });
  // Was vor der Anmeldung gezählt wurde, gehört nicht zum ersten Bild.
  engine._drawCalls.fetchNewFrame();
  const after = scene.onAfterRenderObservable.add(() => {
    const end = performance.now();
    // `current` sammelt seit dem letzten `fetchNewFrame`; danach für das nächste Bild leeren.
    const drawCalls = engine._drawCalls.current;
    engine._drawCalls.fetchNewFrame();
    listener({
      drawCalls,
      activeMeshes: scene.getActiveMeshes().length,
      renderMs: startedAt === null ? 0 : end - startedAt,
    });
    startedAt = null;
  });
  return () => {
    scene.onBeforeAnimationsObservable.remove(before);
    scene.onAfterRenderObservable.remove(after);
  };
}

/** Bestand der Szene; Texturspeicher grob geschätzt (RGBA8, Würfel ·6, Mipmaps ·4/3). */
export function resourceStats(scene: Scene): ResourceSample {
  let textureBytes = 0;
  for (const texture of scene.textures) {
    const size = texture.getSize();
    let bytes = size.width * size.height * 4;
    if (texture.isCube) bytes *= 6;
    if (!texture.noMipmap) bytes = (bytes * 4) / 3;
    if (Number.isFinite(bytes)) textureBytes += bytes;
  }
  return {
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    textures: scene.textures.length,
    textureBytes: Math.round(textureBytes),
  };
}

/** `performance.memory` gibt es nur in Chromium-Browsern (nicht in Safari/Firefox). */
function heapBytes(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  const used = memory?.usedJSHeapSize;
  return typeof used === 'number' && Number.isFinite(used) ? used : null;
}

/** Lebende Engines (= WebGL-Kontexte), laufende Render-Schleifen und JS-Heap der Seite. */
export function environmentSample(): EnvironmentSample {
  const engines: AbstractEngine[] = EngineStore.Instances.filter((engine) => !engine.isDisposed);
  return {
    contexts: engines.length,
    renderLoops: engines.reduce((sum, engine) => sum + engine.activeRenderLoops.length, 0),
    heapBytes: heapBytes(),
  };
}
