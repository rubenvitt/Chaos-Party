/**
 * Figuren-Bibliothek (CHAOS-28) headless mit NullEngine: echte GLB-Dateien laden, Figuren
 * erzeugen (Akzent in Slot-Farbe, Abzeichen, Maßstab), Animationen umschalten (Einmal-
 * Animation → idle), und `dispose()` hinterlässt nichts in der Szene.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Logger } from '@babylonjs/core/Misc/logger.js';
import { Scene } from '@babylonjs/core/scene.js';
import { CHARACTER_IDS, type CharacterId, type Slot } from '@chaos-party/minigame-sdk';
import { CHARACTER_ANIMATIONS, type MinigamePlayer } from '@chaos-party/minigame-sdk/babylon';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadCharacters, type CharacterLibrary } from './index.ts';

const COLORS: Record<Slot, string> = { 1: '#0072B2', 2: '#E69F00', 3: '#009E73', 4: '#CC79A7' };

function player(slot: Slot, character: CharacterId): MinigamePlayer {
  return { slot, name: `S${String(slot)}`, color: COLORS[slot], symbol: '●', character };
}

let sources: Record<CharacterId, Uint8Array>;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const modelsDir = join(dirname(require.resolve('@chaos-party/assets/manifest.json')), 'models');
  const entries = await Promise.all(
    CHARACTER_IDS.map(
      async (id) =>
        [id, new Uint8Array(await readFile(join(modelsDir, 'characters', `${id}.glb`)))] as const,
    ),
  );
  sources = Object.fromEntries(entries) as Record<CharacterId, Uint8Array>;
});

let engine: NullEngine | null = null;
let scene: Scene | null = null;
let library: CharacterLibrary | null = null;

afterEach(() => {
  library?.dispose();
  scene?.dispose();
  engine?.dispose();
  library = null;
  scene = null;
  engine = null;
});

async function setup(): Promise<{ scene: Scene; library: CharacterLibrary }> {
  const level = Logger.LogLevels;
  Logger.LogLevels = Logger.ErrorLogLevel;
  engine = new NullEngine();
  Logger.LogLevels = level;
  scene = new Scene(engine);
  scene.useConstantAnimationDeltaTime = true;
  new FreeCamera('kamera', new Vector3(0, 1, 5), scene);
  library = await loadCharacters(scene, { sources });
  return { scene, library };
}

function counts(s: Scene) {
  return {
    meshes: s.meshes.length,
    materials: s.materials.length,
    transformNodes: s.transformNodes.length,
    animationGroups: s.animationGroups.length,
  };
}

describe('Figuren-Bibliothek', () => {
  it('lädt alle vier Figuren ohne etwas in die Szene zu legen', async () => {
    const { scene: s } = await setup();
    expect(counts(s)).toEqual({ meshes: 0, materials: 0, transformNodes: 0, animationGroups: 0 });
  });

  it.each(CHARACTER_IDS.map((id, i) => [id, (i + 1) as Slot] as const))(
    '%s: Maßstab, Akzent in Slot-Farbe, Abzeichen, alle Animationen',
    async (id, slot) => {
      const { scene: s, library: lib } = await setup();
      const handle = lib.create(s, player(slot, id));
      expect(handle.id).toBe(id);
      expect(handle.animation).toBe('idle');

      // Maßstab laut Vertrag (Ruhepose, ohne Abzeichen-Plakette darüber hinaus).
      handle.root.computeWorldMatrix(true);
      const { min, max } = handle.root.getHierarchyBoundingVectors(true);
      expect(min.y).toBeGreaterThan(-0.03);
      expect(max.y - min.y).toBeGreaterThanOrEqual(1.4);
      expect(max.y - min.y).toBeLessThanOrEqual(1.8);

      // Akzent-Material in Slot-Farbe, eigenes Material je Figur.
      const accent = handle.meshes.map((m) => m.material).find((m) => m?.name.startsWith('akzent'));
      expect(accent).toBeInstanceOf(StandardMaterial);
      expect((accent as StandardMaterial).diffuseColor.toHexString()).toBe(COLORS[slot]);

      // Abzeichen hängt an der Figur und zeigt nach vorn (+Z).
      const badge = handle.meshes.find((m) => m.name.endsWith('-abzeichen'));
      expect(badge).toBeDefined();
      const center = badge?.getBoundingInfo().boundingBox.centerWorld;
      expect(center?.z).toBeGreaterThan(0.05);

      // Grober Schattenkörper: nur für Schattenkarten, nicht für Kameras.
      expect(handle.shadowCaster.layerMask & 0x0fffffff).toBe(0);
      expect(handle.meshes).not.toContain(handle.shadowCaster);

      for (const animation of CHARACTER_ANIMATIONS) {
        handle.play(animation);
        expect(handle.animation).toBe(animation);
        expect(s.animationGroups.filter((g) => g.isPlaying)).toHaveLength(1);
      }
      handle.dispose();
    },
  );

  it('zwei Figuren derselben Art haben getrennte Materialien', async () => {
    const { scene: s, library: lib } = await setup();
    const a = lib.create(s, player(1, 'sock'));
    const b = lib.create(s, player(2, 'sock'));
    const accentOf = (h: typeof a) =>
      h.meshes.map((m) => m.material).find((m) => m?.name.startsWith('akzent')) as StandardMaterial;
    expect(accentOf(a)).not.toBe(accentOf(b));
    expect(accentOf(a).diffuseColor.toHexString()).toBe(COLORS[1]);
    expect(accentOf(b).diffuseColor.toHexString()).toBe(COLORS[2]);
  });

  it('Einmal-Animation läuft einmal und geht dann in idle über', async () => {
    const { scene: s, library: lib } = await setup();
    const handle = lib.create(s, player(1, 'robot'));
    handle.play('hit');
    for (let i = 0; i < 10; i++) s.render();
    expect(handle.animation).toBe('hit');
    for (let i = 0; i < 60; i++) s.render();
    expect(handle.animation).toBe('idle');
    // Schleifen starten bei erneutem Aufruf nicht neu.
    handle.play('run');
    const run = s.animationGroups.find((g) => g.isPlaying);
    for (let i = 0; i < 5; i++) s.render();
    handle.play('run');
    expect(s.animationGroups.find((g) => g.isPlaying)).toBe(run);
  });

  it('Deckkraft setzt alle Meshes halbtransparent', async () => {
    const { scene: s, library: lib } = await setup();
    const handle = lib.create(s, player(3, 'raccoon'));
    handle.setOpacity(0.35);
    expect(handle.meshes.every((m) => m.visibility === 0.35)).toBe(true);
  });

  it('dispose() je Figur und der Bibliothek hinterlässt keine Reste', async () => {
    const { scene: s, library: lib } = await setup();
    const before = counts(s);
    const handles = CHARACTER_IDS.map((id, i) => lib.create(s, player((i + 1) as Slot, id)));
    for (const h of handles) h.play('cheer');
    s.render();
    expect(counts(s).meshes).toBeGreaterThan(0);
    for (const h of handles) h.dispose();
    expect(counts(s)).toEqual(before);
    lib.dispose();
    expect(counts(s)).toEqual(before);
    expect(() => lib.create(s, player(1, 'robot'))).toThrow(/entsorgt/);
  });

  it('lehnt Figuren für eine fremde Szene ab', async () => {
    const { library: lib } = await setup();
    if (!engine) throw new Error('keine Engine');
    const other = new Scene(engine);
    expect(() => lib.create(other, player(1, 'robot'))).toThrow(/anderen Szene/);
    other.dispose();
  });
});
