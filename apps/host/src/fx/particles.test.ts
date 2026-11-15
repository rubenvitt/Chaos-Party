import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { VFX_IDS } from '@chaos-party/minigame-sdk/babylon';
import { createHeadlessScene } from '@chaos-party/minigame-sdk/testing';
import { describe, expect, it } from 'vitest';
import { createSoundEngine } from './audio.ts';
import { createMinigameFx } from './minigameFx.ts';
import {
  createParticleFx,
  MAX_ACTIVE_BURSTS,
  mixWithWhite,
  PARTICLE_TEXTURE_SIZE,
  particleTexturePixels,
  VFX_PRESETS,
  type ParticleShape,
} from './particles.ts';
import { createCameraShake, SHAKE_AMPLITUDE, SHAKE_MS, shakeMagnitude } from './shake.ts';

function alphaAt(data: Uint8Array, size: number, x: number, y: number): number {
  return data[(y * size + x) * 4 + 3] ?? -1;
}

describe('prozedurale Partikeltexturen', () => {
  it('weiße Form mit deckender Mitte (Ring: Rand) und durchsichtigen Ecken', () => {
    const size = PARTICLE_TEXTURE_SIZE;
    const mid = Math.floor(size / 2);
    for (const shape of ['dot', 'star', 'square', 'ring'] as ParticleShape[]) {
      const data = particleTexturePixels(shape, size);
      expect(data.length).toBe(size * size * 4);
      expect(alphaAt(data, size, 0, 0), shape).toBe(0);
      expect(data[0], shape).toBe(255);
      const inner =
        shape === 'ring'
          ? alphaAt(data, size, mid, Math.round(size * 0.14))
          : alphaAt(data, size, mid, mid);
      expect(inner, shape).toBeGreaterThan(200);
    }
    // Deterministisch.
    expect(particleTexturePixels('star')).toEqual(particleTexturePixels('star'));
  });

  it('jede VFX-ID hat ein vernünftiges Preset', () => {
    for (const id of VFX_IDS) {
      const preset = VFX_PRESETS[id];
      expect(preset.count, id).toBeGreaterThan(0);
      expect(preset.count, id).toBeLessThanOrEqual(80);
      expect(preset.lifetime[1], id).toBeLessThanOrEqual(2);
      expect(preset.lifetime[0], id).toBeLessThanOrEqual(preset.lifetime[1]);
      expect(
        preset.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)),
        id,
      ).toBe(true);
    }
  });

  it('mixWithWhite hellt auf', () => {
    expect(mixWithWhite('#000000', 0.5)).toBe('#808080');
    expect(mixWithWhite('#0072B2', 0)).toBe('#0072b2');
    expect(mixWithWhite('kaputt', 0.5)).toBe('#ffffff');
  });
});

describe('createParticleFx (NullEngine)', () => {
  it('legt je Ausbruch ein Partikelsystem an und räumt alles weg', () => {
    const headless = createHeadlessScene();
    const { scene } = headless;
    const fx = createParticleFx(scene);
    for (const id of VFX_IDS) fx.burst(id, { x: 0, y: 1, z: 0 });
    fx.burst('confetti', { x: 1, y: 0, z: 0 }, '#E69F00');
    expect(fx.active).toBe(VFX_IDS.length + 1);
    expect(scene.particleSystems.length).toBe(VFX_IDS.length + 1);
    const textures = scene.textures.length;
    expect(textures).toBeGreaterThan(0);
    fx.dispose();
    expect(fx.active).toBe(0);
    expect(scene.particleSystems.length).toBe(0);
    expect(scene.textures.length).toBe(0);
    // Nach dispose: keine neuen Effekte.
    fx.burst('dust', { x: 0, y: 0, z: 0 });
    expect(scene.particleSystems.length).toBe(0);
    headless.dispose();
  });

  it('begrenzt gleichzeitige Ausbrüche', () => {
    const headless = createHeadlessScene();
    const fx = createParticleFx(headless.scene);
    for (let index = 0; index < MAX_ACTIVE_BURSTS + 10; index++) {
      fx.burst('sparkle', { x: 0, y: 0, z: 0 });
    }
    expect(fx.active).toBe(MAX_ACTIVE_BURSTS);
    fx.dispose();
    headless.dispose();
  });
});

describe('Kamerawackeln', () => {
  it('klingt linear ab und ist nach SHAKE_MS vorbei', () => {
    expect(shakeMagnitude(1, 0)).toBeCloseTo(SHAKE_AMPLITUDE);
    expect(shakeMagnitude(1, SHAKE_MS / 2)).toBeCloseTo(SHAKE_AMPLITUDE / 2);
    expect(shakeMagnitude(1, SHAKE_MS)).toBe(0);
    expect(shakeMagnitude(5, 0)).toBeCloseTo(SHAKE_AMPLITUDE);
    expect(shakeMagnitude(Number.NaN, 0)).toBe(0);
  });

  it('verschiebt die Kamera nur während des Renderns', () => {
    const headless = createHeadlessScene();
    const { scene } = headless;
    const camera = new FreeCamera('kamera', new Vector3(0, 5, -10), scene);
    scene.activeCamera = camera;
    let clock = 0;
    const shake = createCameraShake(scene, () => clock);
    let during: Vector3 | null = null;
    scene.onBeforeRenderObservable.add(() => {
      during = camera.position.clone();
    });
    shake.shake(1);
    scene.render();
    expect(camera.position.equals(new Vector3(0, 5, -10))).toBe(true);
    expect(during).not.toBeNull();
    clock = SHAKE_MS + 1;
    scene.render();
    expect(camera.position.equals(new Vector3(0, 5, -10))).toBe(true);
    shake.dispose();
    headless.dispose();
  });
});

describe('createMinigameFx', () => {
  it('Testmodus: zählt nur, nichts in der Szene, kein Ton', () => {
    const headless = createHeadlessScene();
    const sound = createSoundEngine({ muted: true });
    const fx = createMinigameFx(headless.scene, { sound, testMode: true });
    fx.sound('go');
    fx.burst('confetti', { x: 0, y: 0, z: 0 });
    fx.shake(0.5);
    expect(fx.stats).toEqual({ sounds: 1, bursts: 1, shakes: 1 });
    expect(headless.scene.particleSystems.length).toBe(0);
    expect(sound.played).toBe(0);
    fx.dispose();
    fx.sound('go');
    expect(fx.stats.sounds).toBe(1);
    headless.dispose();
  });

  it('echter Modus: Klang an die Ausgabe, Partikel in die Szene, dispose räumt auf', () => {
    const headless = createHeadlessScene();
    const sound = createSoundEngine({ muted: true });
    const fx = createMinigameFx(headless.scene, { sound, testMode: false });
    fx.sound('score', { pitch: 1.2 });
    fx.burst('sparkle', { x: 0, y: 0, z: 0 });
    expect(sound.lastPlayed).toBe('score');
    expect(headless.scene.particleSystems.length).toBe(1);
    fx.dispose();
    expect(headless.scene.particleSystems.length).toBe(0);
    headless.dispose();
  });
});
