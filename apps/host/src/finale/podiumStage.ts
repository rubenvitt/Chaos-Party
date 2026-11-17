/**
 * Siegerpodest in 3D (CHAOS-37): eigene Babylon-Engine auf eigenem Canvas wie die
 * Minispiel-Bühne. Die gewählten Figuren stehen auf Podestblöcken (Höhe nach Platz, geteilte
 * Plätze gleich hoch), Platz 1 jubelt, die anderen hüpfen bzw. schmollen; dazu Konfetti.
 * Framework-frei; React (`Finale.tsx`) baut die Bühne auf und entsorgt sie.
 *
 * Natur-Look wie am Brett (CHAOS-77): Das Podest steht auf einer kleinen Insel mit Gras,
 * Bäumen und Laternen (`../nature/stageLook.ts`), fest bei Nacht (`SCENE_MOODS.finale`, die
 * Partie endet nachts). Die Blöcke sind aus Holz, ihr Deckel in Slot-Farbe leuchtet nachts wie
 * die Felder am Brett, ein warmer Spot von vorn oben hebt Figuren und Platzziffern hervor.
 * Grafikstufen und Automatik wie Brett und Minispiele (CHAOS-71: Sparstufe ohne HDRI).
 *
 * Vorbereitung ohne Standbild (CHAOS-71): Das Finale baut die Bühne schon während der
 * Trophäenzählung auf einer unsichtbaren Leinwand. Zwischen den Aufbauschritten und beim
 * Übersetzen der Shader (Mesh für Mesh, `prepareSceneGradually`) darf der Browser zeichnen; das
 * erste Bild entsteht vorab. Eine Render-Schleife läuft erst nach `show()`, wenn die Leinwand im
 * Siegerbildschirm hängt.
 *
 * Testmodus: keine Render-Schleife, keine Partikel; `step(n)` rendert n Bilder mit festem
 * Animationsschritt (stabile Screenshots).
 */
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
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
import type { PerfSource } from '../debug/perfTypes.ts';
import { observeFrames, resourceStats } from '../debug/renderProbe.ts';
import { createParticleFx, type ParticleFx } from '../fx/particles.ts';
import type { NatureLook } from '../nature/lighting.ts';
import { createAdaptiveQuality } from '../nature/quality.ts';
import { applyRenderScale, sceneLookSettings } from '../nature/settings.ts';
import { createStageLook } from '../nature/stageLook.ts';
import { afterNextPaint, prepareSceneGradually } from '../scene/prepareGradually.ts';

const INK = '#1b1530';
const FONT = '"Nunito Variable", ui-rounded, system-ui, sans-serif';
/** Figuren auf dem Podest etwas größer als im Vertrag (Kamera steht weiter weg). */
const CHARACTER_SCALE = 1.5;
/** Blick zur Kamera (die von −z schaut). */
const FACE_CAMERA = Math.PI;
/** Alle so viele ms jubelt der Sieger erneut und es regnet Konfetti (nicht im Test). */
const CHEER_EVERY_MS = 2600;
/** Längster Zeitschritt für Glühwürmchen und Jubel-Takt (erstes Bild nach langer Vorbereitung). */
const MAX_STEP_MS = 100;

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

export interface PodiumStage extends PerfSource {
  /**
   * Erfüllt, sobald Figuren und Podest stehen, alle Shader übersetzt sind und das erste Bild
   * gerendert ist (auch auf einer noch unsichtbaren Leinwand).
   */
  readonly ready: Promise<void>;
  /**
   * Leinwand ist sichtbar: Größe neu lesen, Jubel neu starten und (außer im Testmodus) die
   * Render-Schleife starten, sobald `ready` erfüllt ist. Vorher läuft keine Schleife.
   */
  show(): void;
  /** Leinwand wieder verborgen: Render-Schleife anhalten. */
  hide(): void;
  /** Nur Testmodus: `frames` Schritte mit festem Animationsschritt, gezeichnet wird das letzte. */
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

/** Farbstich des Holzes je Platz: Gold, Silber, Bronze, Lila. */
const BLOCK_COLORS = ['#ffd75e', '#e2e8ee', '#eaa974', '#cfc6f2'];

/** Halme bei Grafikstufe `hoch` (kleine Insel, die Kamera sieht vor allem das Podest). */
const PODIUM_GRASS = 22000;

/**
 * Spot aufs Podest bei Nacht (Lesbarkeit von Figuren, Ziffern und Slot-Farben am Fernseher):
 * Stärke für ≈ 10 Einheiten Abstand (PBR fällt mit dem Quadrat der Entfernung ab).
 */
const SPOT = { intensity: 140, angle: 1.0, exponent: 1.5, color: '#ffe3bd' } as const;

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
  // Bis der Himmel steht, scheint der CSS-Verlauf durch; danach deckt der Natur-Look ab.
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.useConstantAnimationDeltaTime = testMode;
  scene.skipPointerMovePicking = true;

  // Natur-Look: Nacht (bzw. `?stimmung=`), Grafikstufe wie Brett und Minispiele.
  const settings = sceneLookSettings(testMode, 'finale', engine.getGlInfo().renderer);
  applyRenderScale(engine, settings);
  const night = settings.mood.night;
  const look = createStageLook(scene, settings, {
    grass: PODIUM_GRASS,
    seed: 5,
    extraLights: night ? 1 : 0,
  });
  const adaptive = createAdaptiveQuality(settings.quality, settings.automatic);
  let lighting: NatureLook | null = null;
  let seconds = 0;

  // Als Objekt, damit TypeScript den Wert nach `await` nicht fälschlich festnagelt.
  const life = { disposed: false };
  const isDisposed = () => life.disposed;
  let library: CharacterLibrary | null = null;
  const handles: { entry: PodiumEntry; handle: HostCharacterHandle; top: Vector3 }[] = [];
  const materials: StandardMaterial[] = [];
  const textures: DynamicTexture[] = [];
  const particles: ParticleFx | null = testMode ? null : createParticleFx(scene);
  let cheerTimer = 0;
  let shown = false;
  let prepared = false;
  let looping = false;

  const resize = () => {
    // Erst resize(): Babylon rechnet einen DPR-Wechsel in die Skalierung ein, danach die Grenze.
    engine.resize();
    applyRenderScale(engine, settings, adaptive.level);
    placeCamera();
  };
  window.addEventListener('resize', resize);

  // Podest mittig auf der Insel (die Kulisse liegt um den Ursprung).
  const raw = podiumSlots(entries.length);
  const rawCenter = (Math.min(0, ...raw) + Math.max(0, ...raw)) / 2;
  const xs = raw.map((x) => x - rawCenter);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const centerX = 0;
  // Kamera so weit weg, dass alle Podeste (plus Figurenbreite) ins Bild passen.
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

  // Spot von vorn oben aufs Podest, nur nachts (Mondlicht allein ist am Fernseher zu dunkel).
  if (night) {
    const from = new Vector3(centerX, 9, -7);
    const spot = new SpotLight(
      'podest-spot',
      from,
      new Vector3(centerX, 1.2, 0).subtract(from).normalize(),
      SPOT.angle,
      SPOT.exponent,
      scene,
    );
    spot.intensity = SPOT.intensity;
    spot.diffuse = Color3.FromHexString(SPOT.color);
    spot.specular = spot.diffuse.scale(0.4);
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
    // Lichtung auf der Insel: frei und eben unter dem Podest, Laternen links und rechts.
    look.backdrop({ halfX: (maxX - minX) / 2 + 1.6, halfZ: 1.6 });
  }

  function buildBlock(entry: PodiumEntry, x: number): Vector3 {
    const mats = look.materials;
    const height = podiumHeight(entry.place);
    const color = BLOCK_COLORS[entry.place - 1] ?? '#cfc6f2';
    const root = new TransformNode(`podest-${String(entry.slot)}`, scene);
    root.position.x = x;
    // Sockel aus moosigem Stein: hebt den Block von der Wiese ab.
    const foot = CreateBox('podest-fuss', { width: 2.1, height: 0.14, depth: 2.1 }, scene);
    foot.parent = root;
    foot.position.y = 0.05;
    foot.material = mats.textured('mossy_rock', { u: 1, tint: '#8c8f86' });
    // Block aus Holz, im Farbton des Platzes (Gold, Silber, Bronze).
    const block = CreateBox('podest', { width: 1.9, height, depth: 1.9 }, scene);
    block.parent = root;
    block.position.y = height / 2 + 0.1;
    block.material = mats.textured('oak_veneer_01', {
      u: 1,
      v: Math.max(0.4, height / 1.9),
      tint: color,
      key: `podest-${String(entry.place)}`,
    });
    // Deckel in Slot-Farbe (Spieler-Kennung, dazu das Symbol über dem Kopf im 2D-Overlay);
    // leuchtet nachts wie die Feld-Einlagen am Brett.
    const lid = CreateBox('podest-deckel', { width: 2.0, height: 0.14, depth: 2.0 }, scene);
    lid.parent = root;
    lid.position.y = height + 0.14;
    lid.material = mats.plain(PLAYER_SLOTS[entry.slot].color, {
      roughness: 0.45,
      clearCoat: 0.4,
      glow: Math.max(0.12, night?.tileGlow ?? 0),
    });
    // Platzziffer vorne auf dem Block.
    const number = CreatePlane('podest-zahl', { size: Math.min(1.2, height * 0.92) }, scene);
    number.parent = root;
    number.position.set(0, height / 2 + 0.12, -0.97);
    number.material = plate(String(entry.place), '#ffffff');
    const meshes: Mesh[] = [foot, block, lid, number];
    for (const mesh of meshes) {
      mesh.isPickable = false;
      if (mesh !== number) {
        look.addCaster(mesh);
        mesh.receiveShadows = true;
      }
    }
    return new Vector3(x, height + 0.21, 0);
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

  // Je Bild: Glühwürmchen (deterministisch im Testmodus, `step` zählt feste 1/60 s).
  scene.onBeforeRenderObservable.add(() => {
    look.update(seconds);
  });

  function startLoop(): void {
    if (testMode || looping || !shown || !prepared || isDisposed()) return;
    looping = true;
    // Die Zeit seit dem vorab gezeichneten Bild zählt nicht als Bildabstand.
    let first = true;
    engine.runRenderLoop(() => {
      const raw = engine.getDeltaTime();
      const dt = first ? 0 : raw;
      first = false;
      const next = adaptive.frame(dt);
      if (next) {
        lighting?.setQuality(next);
        applyRenderScale(engine, settings, next);
      }
      const step = Math.min(dt, MAX_STEP_MS);
      seconds += step / 1000;
      cheerTimer += step;
      if (cheerTimer >= CHEER_EVERY_MS) {
        cheerTimer = 0;
        celebrate();
      }
      scene.render();
    });
  }

  /** Nach jedem schweren Aufbauschritt ein Bild Pause (Trophäenzählung läuft weiter). */
  async function breathe(): Promise<boolean> {
    await afterNextPaint();
    return !isDisposed();
  }

  const ready = (async () => {
    try {
      await document.fonts.load(`900 64px ${FONT}`);
    } catch {
      // Ersatzschrift: lesbar, nur weniger hübsch.
    }
    if (isDisposed()) return;
    const loaded = await loadCharacters(scene, { keepPbr: true });
    if (isDisposed()) {
      loaded.dispose();
      return;
    }
    library = loaded;
    if (!(await breathe())) return;
    buildStage();
    if (!(await breathe())) return;
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
      look.addCaster(handle.shadowCaster);
      handles.push({ entry, handle, top });
    });
    celebrate();
    if (!(await breathe())) return;
    lighting = await look.finish(camera);
    if (!(await breathe())) return;
    if (!(await prepareSceneGradually(scene, { isCancelled: isDisposed }))) return;
    if (!(await breathe())) return;
    // Erstes Bild vorab: Schattenkarte, Nachbearbeitung und Render-Ziele entstehen hier.
    scene.render();
    prepared = true;
    startLoop();
  })();
  ready.catch((error: unknown) => {
    if (!life.disposed) console.error('Siegerpodest konnte nicht aufgebaut werden', error);
  });

  return {
    ready,
    show() {
      if (isDisposed() || shown) return;
      shown = true;
      // Die Leinwand hängt jetzt im Siegerbildschirm (Größe kann sich geändert haben).
      resize();
      if (prepared && !testMode) {
        cheerTimer = 0;
        celebrate();
      }
      startLoop();
    },
    hide() {
      if (!shown || isDisposed()) return;
      shown = false;
      if (looping) {
        engine.stopRenderLoop();
        looping = false;
      }
    },
    step(frames) {
      if (life.disposed || !scene.activeCamera) return;
      // Alle Schritte animieren, nur das letzte Bild zeichnen (Software-GPU, wie das Brett).
      for (let index = 0; index < frames; index++) {
        seconds += 1 / 60;
        if (index < frames - 1) scene.animate();
      }
      if (frames > 0) scene.render();
    },
    onFrameRendered(listener) {
      return observeFrames(scene, listener);
    },
    getResourceStats() {
      return resourceStats(scene);
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
