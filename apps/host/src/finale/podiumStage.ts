/**
 * Siegerpodest in 3D (CHAOS-37): eigene Babylon-Engine auf eigenem Canvas wie die
 * Minispiel-Bühne. Die gewählten Figuren stehen auf Podestblöcken (Höhe nach Platz, geteilte
 * Plätze gleich hoch), Platz 1 jubelt, die anderen hüpfen bzw. schmollen; dazu Konfetti.
 * Framework-frei; React (`Finale.tsx`) baut die Bühne auf und entsorgt sie.
 *
 * Licht und Material wie auf dem Brett (Halbkugel + Sonne mit weichen Schatten,
 * `StandardMaterial` mit leichtem Eigenleuchten, Tinte `#1b1530`), Himmel als CSS-Verlauf.
 *
 * Testmodus: keine Render-Schleife, keine Partikel; `step(n)` rendert n Bilder mit festem
 * Animationsschritt (stabile Screenshots).
 */
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Scene } from '@babylonjs/core/scene.js';
import { PLAYER_SLOTS, type CharacterId, type SlotNumber } from '@chaos-party/protocol';
import {
  loadCharacters,
  type CharacterLibrary,
  type HostCharacterHandle,
} from '../characters/index.ts';
import { createParticleFx, type ParticleFx } from '../fx/particles.ts';

const INK = '#1b1530';
const FONT = '"Nunito Variable", ui-rounded, system-ui, sans-serif';
/** Figuren auf dem Podest etwas größer als im Vertrag (Kamera steht weiter weg). */
const CHARACTER_SCALE = 1.5;
/** Blick zur Kamera (die von −z schaut). */
const FACE_CAMERA = Math.PI;
/** Alle so viele ms jubelt der Sieger erneut und es regnet Konfetti (nicht im Test). */
const CHEER_EVERY_MS = 2600;

export interface PodiumEntry {
  readonly slot: SlotNumber;
  readonly place: number;
  readonly name: string;
  readonly character: CharacterId;
}

export interface PodiumStageOptions {
  readonly canvas: HTMLCanvasElement;
  readonly entries: readonly PodiumEntry[];
  readonly testMode: boolean;
}

export interface PodiumStage {
  /** Erfüllt, sobald Figuren und Podest stehen und das erste Bild gerendert ist. */
  readonly ready: Promise<void>;
  /** Nur Testmodus: `frames` Bilder mit festem Animationsschritt. */
  step(frames: number): void;
  dispose(): void;
}

/** Podesthöhe je Platz (geteilte Plätze gleich hoch). */
export function podiumHeight(place: number): number {
  return [1.5, 1.0, 0.68, 0.42][place - 1] ?? 0.42;
}

/**
 * x-Position je Eintrag in Rangfolge: Platz 1 in die Mitte, dann abwechselnd links/rechts
 * (klassisches Podest 2–1–3, ein vierter ganz außen links).
 */
export function podiumSlots(count: number): number[] {
  const spacing = 2.25;
  const order = [0, -1, 1, -2, 2];
  return order.slice(0, count).map((index) => index * spacing);
}

/** Podestfarbe je Platz: Gold, Silber, Bronze, Lila. */
const BLOCK_COLORS = ['#ffd23f', '#d6e0ea', '#e9a66b', '#c9bff0'];

export function createPodiumStage(options: PodiumStageOptions): PodiumStage {
  const { canvas, testMode } = options;
  const entries = [...options.entries].sort((a, b) => a.place - b.place || a.slot - b.slot);
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: testMode, stencil: true },
    !testMode,
  );
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.useConstantAnimationDeltaTime = testMode;
  scene.skipPointerMovePicking = true;

  // Als Objekt, damit TypeScript den Wert nach `await` nicht fälschlich festnagelt.
  const life = { disposed: false };
  const isDisposed = () => life.disposed;
  let library: CharacterLibrary | null = null;
  const handles: { entry: PodiumEntry; handle: HostCharacterHandle; top: Vector3 }[] = [];
  const materials: StandardMaterial[] = [];
  const textures: DynamicTexture[] = [];
  const particles: ParticleFx | null = testMode ? null : createParticleFx(scene);
  let cheerTimer = 0;

  const resize = () => {
    engine.resize();
    placeCamera();
  };
  window.addEventListener('resize', resize);

  // Kamera so weit weg, dass alle Podeste (plus Figurenbreite) ins Bild passen.
  const xs = podiumSlots(entries.length);
  const minX = Math.min(0, ...xs);
  const maxX = Math.max(0, ...xs);
  const centerX = (minX + maxX) / 2;
  const camera = new FreeCamera('podest-kamera', new Vector3(0, 0, 0), scene);
  camera.fov = 0.62;
  camera.minZ = 0.5;
  const placeCamera = () => {
    const aspect = Math.max(0.5, engine.getAspectRatio(camera));
    const halfWidth = (maxX - minX) / 2 + 1.7;
    const distance = Math.max(9.5, halfWidth / (Math.tan(camera.fov / 2) * aspect));
    camera.position.set(centerX, 2.2 + distance * 0.11, -distance);
    camera.setTarget(new Vector3(centerX, 1.85, 0));
  };
  placeCamera();

  const hemi = new HemisphericLight('himmel', new Vector3(0.2, 1, -0.3), scene);
  hemi.intensity = 0.75;
  hemi.diffuse = new Color3(1, 0.97, 0.92);
  hemi.groundColor = new Color3(0.5, 0.45, 0.7);
  hemi.specular = new Color3(0.05, 0.05, 0.05);
  const direction = new Vector3(0.35, -1, 0.55).normalize();
  const sun = new DirectionalLight('sonne', direction, scene);
  sun.position = direction.scale(-20);
  sun.intensity = 0.6;
  sun.specular = new Color3(0.2, 0.2, 0.2);
  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.004;
  shadows.darkness = 0.45;

  function material(name: string, hex: string, emissive = 0.12): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    const color = Color3.FromHexString(hex);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(emissive);
    mat.specularColor = new Color3(0.08, 0.08, 0.08);
    materials.push(mat);
    return mat;
  }

  function plate(text: string, color: string): StandardMaterial {
    const texture = new DynamicTexture(`zahl-${text}`, { width: 256, height: 256 }, scene, true);
    texture.hasAlpha = true;
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 256, 256);
    ctx.font = `900 190px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 22;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, 128, 140);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 140);
    texture.update();
    textures.push(texture);
    const mat = new StandardMaterial(`zahl-${text}-mat`, scene);
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    materials.push(mat);
    return mat;
  }

  function buildStage(): void {
    // Runde Grasinsel (cremiger Rand, dunkle Tinte darunter). Halbkugellicht + Sonne ergeben
    // auf der Oberseite ≈ 1,25 × Grundfarbe: #72a755 erscheint so als Gras-Referenz #8fd16a
    // (Art Direction). Mit #7cc35a lag die Insel bei (158, 243, 110) und überstrahlte die
    // Podeste – auf echter GPU genauso, das ist Lichtrechnung, nicht SwiftShader (CHAOS-40).
    const diameter = maxX - minX + 6;
    const grass = CreateCylinder('insel', { diameter, height: 0.3, tessellation: 72 }, scene);
    grass.position.set(centerX, -0.15, 0.6);
    grass.material = material('insel-mat', '#72a755', 0.03);
    grass.receiveShadows = true;
    const rim = CreateCylinder(
      'insel-rand',
      { diameter: diameter + 0.5, height: 0.3, tessellation: 72 },
      scene,
    );
    rim.position.set(centerX, -0.2, 0.6);
    rim.material = material('insel-rand-mat', '#f3e7c4', 0.15);
    const ink = CreateCylinder(
      'insel-tinte',
      { diameter: diameter + 0.8, height: 0.3, tessellation: 72 },
      scene,
    );
    ink.position.set(centerX, -0.3, 0.6);
    ink.material = material('insel-tinte-mat', INK, 0);
    for (const mesh of [grass, rim, ink]) mesh.isPickable = false;
  }

  function buildBlock(entry: PodiumEntry, x: number): Vector3 {
    const height = podiumHeight(entry.place);
    const color = BLOCK_COLORS[entry.place - 1] ?? '#c9bff0';
    const root = new TransformNode(`podest-${String(entry.slot)}`, scene);
    root.position.x = x;
    // Dunkler Sockel unten (Tinte) statt Umriss: hebt den Block vom Gras ab.
    const foot = CreateBox('podest-fuss', { width: 2.06, height: 0.12, depth: 2.06 }, scene);
    foot.parent = root;
    foot.position.y = 0.06;
    foot.material = material(`podest-fuss-${String(entry.slot)}`, INK, 0);
    const block = CreateBox('podest', { width: 1.9, height, depth: 1.9 }, scene);
    block.parent = root;
    block.position.y = height / 2;
    block.material = material(`podest-${String(entry.slot)}-mat`, color);
    block.receiveShadows = true;
    // Deckel in Slot-Farbe (Spieler-Kennung, dazu das Symbol über dem Kopf im 2D-Overlay).
    const lid = CreateBox('podest-deckel', { width: 2.0, height: 0.14, depth: 2.0 }, scene);
    lid.parent = root;
    lid.position.y = height + 0.04;
    lid.material = material(
      `podest-deckel-${String(entry.slot)}`,
      PLAYER_SLOTS[entry.slot].color,
      0.2,
    );
    lid.receiveShadows = true;
    // Platzziffer vorne auf dem Block.
    const number = CreatePlane('podest-zahl', { size: Math.min(1.2, height * 0.92) }, scene);
    number.parent = root;
    number.position.set(0, height / 2 + 0.02, -0.97);
    number.material = plate(String(entry.place), '#ffffff');
    const meshes: Mesh[] = [foot, block, lid, number];
    for (const mesh of meshes) {
      mesh.isPickable = false;
      if (mesh !== number) shadows.addShadowCaster(mesh, false);
    }
    return new Vector3(x, height + 0.1, 0);
  }

  function celebrate(): void {
    for (const { entry, handle, top } of handles) {
      if (entry.place === 1) {
        handle.play('cheer');
        particles?.burst('confetti', { x: top.x, y: top.y + 2.2, z: top.z });
      } else if (entry.place === handles.length && handles.length > 1) {
        handle.play('sad');
      } else {
        handle.play('jump');
      }
    }
  }

  const ready = (async () => {
    try {
      await document.fonts.load(`900 64px ${FONT}`);
    } catch {
      // Ersatzschrift: lesbar, nur weniger hübsch.
    }
    if (isDisposed()) return;
    const loaded = await loadCharacters(scene);
    if (isDisposed()) {
      loaded.dispose();
      return;
    }
    library = loaded;
    buildStage();
    entries.forEach((entry, index) => {
      const top = buildBlock(entry, xs[index] ?? 0);
      const handle = loaded.create(scene, {
        slot: entry.slot,
        name: entry.name,
        color: PLAYER_SLOTS[entry.slot].color,
        symbol: PLAYER_SLOTS[entry.slot].symbol,
        character: entry.character,
      });
      handle.root.position.copyFrom(top);
      handle.root.rotation.y = FACE_CAMERA;
      handle.root.scaling.setAll(CHARACTER_SCALE);
      shadows.addShadowCaster(handle.shadowCaster, false);
      handles.push({ entry, handle, top });
    });
    celebrate();
    await scene.whenReadyAsync(true);
    if (isDisposed()) return;
    scene.render();
    if (testMode) return;
    engine.runRenderLoop(() => {
      cheerTimer += engine.getDeltaTime();
      if (cheerTimer >= CHEER_EVERY_MS) {
        cheerTimer = 0;
        celebrate();
      }
      scene.render();
    });
  })();
  ready.catch((error: unknown) => {
    if (!life.disposed) console.error('Siegerpodest konnte nicht aufgebaut werden', error);
  });

  return {
    ready,
    step(frames) {
      if (life.disposed || !scene.activeCamera) return;
      for (let index = 0; index < frames; index++) scene.render();
    },
    dispose() {
      if (isDisposed()) return;
      life.disposed = true;
      window.removeEventListener('resize', resize);
      engine.stopRenderLoop();
      particles?.dispose();
      library?.dispose();
      for (const texture of textures) texture.dispose();
      for (const mat of materials) mat.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
