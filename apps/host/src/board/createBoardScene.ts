/**
 * Babylon.js-Szene der Brettphase (CHAOS-18/19): Brett prozedural aus der `BoardDefinition`,
 * Spielfiguren, Trophäe, Fallen, Wegweiser, Popups und eine Kamera, die sanft dem aktiven
 * Spieler folgt. Brett aus Grundkörpern (M2), verspielt und vom Sofa aus lesbar.
 *
 * Spielfiguren (CHAOS-28): die GLB-Figuren aus `../characters` (gewählte Figur aus
 * `BoardPlayer.character`, CHAOS-36) auf einem Spielstein-Sockel in Slot-Farbe, darüber das
 * Slot-Symbol.
 * Laufen spielt `run`, Trophäenkauf `cheer`, Münzverlust/Falle/Klau `hit`, Münzgewinn `jump`;
 * im Stand drehen sich die Figuren zur Kamera, beim Hüpfen in Laufrichtung.
 *
 * Framework-unabhängig (kein React) wie die Arena (ADR-004): Die Szene liest je Frame den
 * Darstellungszustand aus der Regie (`BoardFrameSource`) und gibt nichts an die UI zurück.
 * Keine Physik – das Brett braucht kein Havok. Deep-Imports statt Barrel.
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
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh.js';
import '@babylonjs/core/Meshes/instancedMesh.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { BoardSpace, SpaceKind } from '@chaos-party/game-core';
import type { CharacterAnimation } from '@chaos-party/minigame-sdk/babylon';
import { PLAYER_SLOTS, type CharacterId, type SlotNumber } from '@chaos-party/protocol';
import {
  loadCharacters,
  type CharacterLibrary,
  type HostCharacterHandle,
} from '../characters/index.ts';
import { observeFrames, resourceStats } from '../debug/renderProbe.ts';
import type { PlayerPosition, RendererInfo } from '../scene/types.ts';
import type { FramePawn, FramePopup } from './director.ts';
import {
  approach,
  boardBounds,
  cameraFocus,
  hopPoint,
  signpostPosition,
  spreadPawns,
  type Point2,
} from './layout.ts';
import type { MessageTone } from './texts.ts';
import type { BoardScene, BoardSceneOptions } from './types.ts';

/** Feste Schrittweite im Testmodus (ms). */
const TEST_STEP_MS = 1000 / 60;
/** Größter Zeitschritt je Frame im Normalbetrieb (Tab im Hintergrund o. ä.). */
const MAX_STEP_MS = 100;
const FONT = '"Nunito Variable", ui-rounded, system-ui, sans-serif';
const INK = '#1b1530';

/** Höhe der Feldoberfläche über dem Boden. */
const SPACE_TOP = 0.3;
const SPACE_DIAMETER = 1.5;

/** Sockel-Radius und Höhe über dem Kopf (Anker für Pfeil, Popups, Getrennt-Marker). */
const PAWN = { radius: 0.5, height: 2.4 } as const;
/** Die Figur steht auf ihrem Sockel. */
const PAWN_LIFT = 0.12;
/**
 * Figuren auf dem Brett etwas größer als in Minispielen (Vertrag: 1,4–1,8): Die Kamera ist
 * weit weg und hoch, die Figur muss vom Sofa aus erkennbar sein.
 */
const CHARACTER_SCALE = 1.3;
/** Höhe des schwebenden Slot-Symbols über dem Sockel (über dem Kopf jeder Figur). */
const SYMBOL_Y = 2.62;
/** Blickrichtung im Stand: zur Kamera (die von −z aufs Brett schaut). */
const FACE_CAMERA = Math.PI;
/**
 * Im Stand lehnt sich die Figur etwas zurück, zur hoch stehenden Kamera hin: Gesicht und
 * Bauch (Abzeichen) bleiben sichtbar, statt nur den Scheitel zu zeigen.
 */
const STAND_TILT = -0.32;
/** Halbwertszeit beim Drehen der Figur (ms). */
const TURN_HALF_LIFE_MS = 90;

/** Kamera relativ zum Blickpunkt: hoch und schräg von vorn (−z), Brett ganz im Bild. */
const CAMERA_OFFSET = new Vector3(0, 28, -17.5);
/**
 * Blickpunkt etwas vor der Brettmitte (Richtung Kamera): Das Brett rückt im Bild nach oben,
 * weil unten die Spielerleiste mehr Platz braucht als oben der Titel.
 */
const CAMERA_AIM_Z = -1.6;
const CAMERA_HALF_LIFE_MS = 700;

interface KindStyle {
  readonly color: string;
  /** Ecken der Feldplatte (32 = rund) – Form zusätzlich zur Farbe. */
  readonly tessellation: number;
  readonly rotation: number;
}

/** Farbe **und** Form je Feldtyp (Farbe allein reicht nicht, VISION/Barrierefreiheit). */
const KIND_STYLES: Readonly<Record<SpaceKind, KindStyle>> = {
  start: { color: '#ffffff', tessellation: 4, rotation: Math.PI / 4 },
  'coins-plus': { color: '#2f7fe0', tessellation: 32, rotation: 0 },
  'coins-minus': { color: '#e5484d', tessellation: 32, rotation: 0 },
  item: { color: '#25b46a', tessellation: 4, rotation: Math.PI / 4 },
  event: { color: '#ffd23f', tessellation: 6, rotation: 0 },
  trophy: { color: '#9b5cf6', tessellation: 8, rotation: Math.PI / 8 },
};

const TONE_COLORS: Readonly<Record<MessageTone, { bg: string; fg: string }>> = {
  good: { bg: '#d4f5e6', fg: '#00603f' },
  bad: { bg: '#ffe0e0', fg: '#a3161c' },
  gold: { bg: '#ffe58a', fg: '#6b4a00' },
  neutral: { bg: '#ffffff', fg: INK },
};

/** Bäume des Wackelwalds in der Brettmitte (feste Lage, deterministisch). */
const TREES: readonly { x: number; z: number; s: number }[] = [
  { x: -6.5, z: 4.2, s: 1.1 },
  { x: -3.2, z: 5.1, s: 0.9 },
  { x: 0.4, z: 4.4, s: 1.25 },
  { x: 3.8, z: 5.2, s: 0.95 },
  { x: -7.4, z: 0.6, s: 1.0 },
  { x: -4.3, z: 1.7, s: 1.3 },
  { x: -1.2, z: 1.2, s: 0.85 },
  { x: 2.2, z: 1.8, s: 1.05 },
  { x: -5.6, z: -2.6, s: 0.9 },
  { x: -2.4, z: -2.1, s: 1.15 },
  { x: 1.1, z: -2.8, s: 0.95 },
  { x: 4.4, z: -1.6, s: 1.2 },
  { x: -7.8, z: -5.4, s: 0.8 },
  { x: 6.2, z: 3.3, s: 0.85 },
];

interface Pawn {
  readonly slot: SlotNumber;
  readonly root: TransformNode;
  /** Figur aus der GLB-Bibliothek; ihr `root` hängt am Drehknoten `facing`. */
  readonly character: HostCharacterHandle;
  readonly facing: TransformNode;
  readonly symbol: Mesh;
  readonly marker: TransformNode;
  /** Sockel, Ring und Symbol (ohne Figur). */
  readonly meshes: Mesh[];
  readonly materials: StandardMaterial[];
  connected: boolean | null;
  /** Aktuelle Blickrichtung (Drehung um y). */
  yaw: number;
  /** Letzte Weltposition (für Kamera und Testhaken). */
  readonly position: Vector3;
}

interface Label {
  readonly mesh: Mesh;
  readonly material: StandardMaterial;
  readonly texture: DynamicTexture;
}

interface TextCard {
  readonly text: string;
  readonly bg: string;
  readonly fg: string;
  /** Zeichenhöhe in Welt-Einheiten. */
  readonly height: number;
  readonly border?: string;
}

export function createBoardScene(
  canvas: HTMLCanvasElement,
  options: BoardSceneOptions,
): BoardScene {
  const { board, source } = options;
  const testMode = options.testMode ?? false;
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: testMode, stencil: true },
    // Im Test feste Auflösung (Gerätepixelverhältnis 1), sonst scharf auf HiDPI.
    !testMode,
  );
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0); // Himmel kommt als CSS-Verlauf
  scene.skipPointerMovePicking = true;

  const spaces = new Map<string, BoardSpace>(board.spaces.map((s) => [s.id, s]));
  const bounds = boardBounds(board);
  let disposed = false;
  // Funktion statt direkter Abfrage: `dispose()` kann zwischen zwei `await` laufen.
  const isDisposed = (): boolean => disposed;
  let built = false;
  let simMs = 0;

  const camera = new FreeCamera('kamera', Vector3.Zero(), scene);
  camera.fov = 0.72;
  camera.minZ = 0.5;
  camera.maxZ = 200;
  camera.inputs.clear();
  const focus = { x: bounds.center.x, z: bounds.center.z };
  placeCamera();

  const shadows = buildLights();
  const materials = new Map<string, StandardMaterial>();
  const pawns = new Map<SlotNumber, Pawn>();
  const trophies = new Map<string, TransformNode>();
  const traps = new Map<string, TransformNode>();
  const popups = new Map<number, Label>();
  /** Popups, auf die eine Figur schon reagiert hat (Animation einmal je Popup). */
  const reacted = new Set<number>();
  const trees: TransformNode[] = [];
  let characters: CharacterLibrary | null = null;
  let activeRing: Mesh | undefined;
  let activeArrow: Mesh | undefined;

  const onResize = (): void => {
    engine.resize();
    if (testMode && built) scene.render();
  };
  window.addEventListener('resize', onResize);

  const ready = (async () => {
    await loadFont();
    if (isDisposed()) throw new Error('Brett-Szene wurde vor dem Aufbau entsorgt');
    buildIsland();
    buildDecor();
    buildPaths();
    buildSpaces();
    buildSignposts();
    buildActiveMarker();
    // Figuren vorladen (GLB, einmal je Szene); im Test laufen Animationen in festen Schritten.
    scene.useConstantAnimationDeltaTime = testMode;
    const library = await loadCharacters(scene);
    if (isDisposed()) {
      library.dispose();
      throw new Error('Brett-Szene wurde beim Laden der Figuren entsorgt');
    }
    characters = library;
    built = true;
    update(0);
    await scene.whenReadyAsync(true);
    if (isDisposed()) throw new Error('Brett-Szene wurde während des Aufbaus entsorgt');
    if (testMode) {
      scene.render();
    } else {
      startLoop();
    }
  })();

  // ---------------------------------------------------------------------------
  // Render-Schleife und Pause hinter dem Finale (CHAOS-39)
  // ---------------------------------------------------------------------------

  /** Brett verdeckt (Finale): kein Rendern, nur die Regie läuft weiter. */
  let renderPaused = false;
  /** rAF-Kennung der Regie-Schleife während der Pause. */
  let directorFrame: number | null = null;

  function startLoop(): void {
    if (renderPaused) {
      // Nur die Regie weiterlaufen lassen (Stand, HUD), ohne WebGL-Arbeit.
      let last = performance.now();
      const tick = (now: number): void => {
        update(Math.min(MAX_STEP_MS, Math.max(0, now - last)));
        last = now;
        directorFrame = requestAnimationFrame(tick);
      };
      directorFrame = requestAnimationFrame(tick);
      return;
    }
    engine.runRenderLoop(() => {
      update(Math.min(MAX_STEP_MS, engine.getDeltaTime()));
      scene.render();
    });
  }

  function stopLoop(): void {
    engine.stopRenderLoop();
    if (directorFrame !== null) cancelAnimationFrame(directorFrame);
    directorFrame = null;
  }

  // ---------------------------------------------------------------------------
  // Grundlagen
  // ---------------------------------------------------------------------------

  async function loadFont(): Promise<void> {
    // Die Schrift ist mitgeliefert (@fontsource-variable/nunito); vor dem ersten Text laden,
    // sonst zeichnet die DynamicTexture mit einer Ersatzschrift (Screenshots instabil).
    try {
      await document.fonts.load(`900 64px ${FONT}`);
    } catch {
      // Ohne Font-API zeichnet die Ersatzschrift – lesbar, nur weniger hübsch.
    }
  }

  function buildLights(): ShadowGenerator {
    const hemi = new HemisphericLight('himmel', new Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = 0.7;
    hemi.diffuse = new Color3(1, 0.97, 0.92);
    hemi.groundColor = new Color3(0.5, 0.45, 0.7);
    hemi.specular = new Color3(0.05, 0.05, 0.05);

    const direction = new Vector3(0.45, -1, 0.35).normalize();
    const sun = new DirectionalLight('sonne', direction, scene);
    sun.position = direction.scale(-30);
    sun.intensity = 0.55;
    sun.specular = new Color3(0.2, 0.2, 0.2);
    sun.shadowMinZ = 10;
    sun.shadowMaxZ = 50;
    const generator = new ShadowGenerator(1024, sun);
    generator.usePercentageCloserFiltering = true;
    generator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    generator.bias = 0.004;
    generator.darkness = 0.5;
    return generator;
  }

  /** Geteiltes Material je Farbe (und Leuchtkraft). */
  function material(hex: string, emissive = 0.1, alpha = 1): StandardMaterial {
    const key = `${hex}|${emissive}|${alpha}`;
    const existing = materials.get(key);
    if (existing) return existing;
    const mat = new StandardMaterial(`mat-${key}`, scene);
    const color = Color3.FromHexString(hex);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(emissive);
    mat.specularColor = new Color3(0.08, 0.08, 0.08);
    mat.alpha = alpha;
    materials.set(key, mat);
    return mat;
  }

  /** Eigenes (nicht geteiltes) Material, z. B. für halbtransparente Figuren. */
  function ownMaterial(name: string, hex: string, emissive: number): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    const color = Color3.FromHexString(hex);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(emissive);
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    return mat;
  }

  /** Statische Teile je Material sammeln und am Ende zu wenigen Meshes verschmelzen. */
  const staticParts = new Map<StandardMaterial, Mesh[]>();
  function addStatic(mesh: Mesh, mat: StandardMaterial, receiveShadows = true): void {
    mesh.material = mat;
    mesh.receiveShadows = receiveShadows;
    const list = staticParts.get(mat) ?? [];
    list.push(mesh);
    staticParts.set(mat, list);
  }
  function mergeStatic(): void {
    for (const [mat, list] of staticParts) {
      const merged = Mesh.MergeMeshes(list, true, true);
      if (merged) {
        merged.material = mat;
        merged.receiveShadows = true;
        merged.isPickable = false;
        merged.freezeWorldMatrix();
      }
    }
    staticParts.clear();
  }

  function spacePos(id: string): Point2 {
    const space = spaces.get(id);
    return space ? space.position : bounds.center;
  }

  // ---------------------------------------------------------------------------
  // Insel, Deko, Wege, Felder
  // ---------------------------------------------------------------------------

  /** Abgerundetes Rechteck aus Kästen und Eck-Zylindern (Oberkante bei y = top). */
  function roundedSlab(
    name: string,
    width: number,
    depth: number,
    radius: number,
    height: number,
    top: number,
    mat: StandardMaterial,
  ): void {
    const y = top - height / 2;
    const a = CreateBox(`${name}-a`, { width: width - 2 * radius, height, depth }, scene);
    a.position.y = y;
    addStatic(a, mat);
    const b = CreateBox(`${name}-b`, { width, height, depth: depth - 2 * radius }, scene);
    b.position.y = y;
    addStatic(b, mat);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const c = CreateCylinder(
          `${name}-c`,
          { diameter: radius * 2, height, tessellation: 24 },
          scene,
        );
        c.position.set(sx * (width / 2 - radius), y, sz * (depth / 2 - radius));
        addStatic(c, mat);
      }
    }
  }

  function buildIsland(): void {
    const width = bounds.maxX - bounds.minX + 5;
    const depth = bounds.maxZ - bounds.minZ + 5;
    roundedSlab('erde', width + 0.8, depth + 0.8, 3.4, 1.6, -0.25, material('#a8754d', 0.05));
    roundedSlab('gras', width, depth, 3, 0.5, 0, material('#8fd16a', 0.06));
  }

  function buildDecor(): void {
    // Wackelwald: Bäume mit Kronen in zwei Grüntönen, die in Simulationszeit wackeln.
    const trunkMat = material('#8a5a3b', 0.05);
    const leafA = material('#3f9e4d', 0.08);
    const leafB = material('#57b85a', 0.08);
    // Instanzen (CHAOS-39): Je Teil und Material gibt es eine Vorlage (die ersten Bäume), alle
    // weiteren Bäume sind Instanzen davon. Babylon zeichnet jede Vorlage samt Instanzen in
    // einem Aufruf (Hardware-Instancing) statt einen Aufruf je Teil (15 Bäume: 45 → 5).
    // Geometrie, Material, Lage und Wackeln (je Baum-Knoten) bleiben gleich.
    const templates = new Map<string, Mesh>();
    const treePart = (
      key: string,
      create: () => Mesh,
      mat: StandardMaterial,
      root: TransformNode,
      y: number,
    ): void => {
      const template = templates.get(key);
      const part: Mesh | InstancedMesh = template ? template.createInstance(key) : create();
      if (!template) {
        const mesh = part as Mesh;
        mesh.material = mat;
        mesh.receiveShadows = true;
        templates.set(key, mesh);
      }
      part.parent = root;
      part.position.y = y;
      part.isPickable = false;
    };
    TREES.forEach((t, i) => {
      const root = new TransformNode(`baum-${i}`, scene);
      root.position.set(t.x, 0, t.z);
      root.scaling.setAll(t.s);
      treePart(
        'stamm',
        () =>
          CreateCylinder(
            'stamm',
            { diameterTop: 0.25, diameterBottom: 0.4, height: 1, tessellation: 10 },
            scene,
          ),
        trunkMat,
        root,
        0.5,
      );
      const even = i % 2 === 0;
      treePart(
        even ? 'krone-unten-a' : 'krone-unten-b',
        () =>
          CreateCylinder(
            'krone',
            { diameterTop: 0, diameterBottom: 1.8, height: 1.6, tessellation: 14 },
            scene,
          ),
        even ? leafA : leafB,
        root,
        1.6,
      );
      treePart(
        even ? 'krone-oben-b' : 'krone-oben-a',
        () =>
          CreateCylinder(
            'krone',
            { diameterTop: 0, diameterBottom: 1.3, height: 1.2, tessellation: 14 },
            scene,
          ),
        even ? leafB : leafA,
        root,
        2.35,
      );
      trees.push(root);
    });

    // Teich neben der Sumpfabkürzung.
    const pond = CreateCylinder('teich', { diameter: 1, height: 0.06, tessellation: 40 }, scene);
    pond.scaling.set(3.6, 1, 4.8);
    pond.position.set(8.4, 0.04, -0.6);
    addStatic(pond, material('#4fb8e8', 0.2));
    for (const [x, z] of [
      [7.6, 0.6],
      [9.1, -1.7],
      [8.2, -2.2],
    ] as const) {
      const pad = CreateCylinder(
        'seerose',
        { diameter: 0.6, height: 0.05, tessellation: 12 },
        scene,
      );
      pad.position.set(x, 0.09, z);
      addStatic(pad, leafB);
    }

    // Pilze am Pilzpfad (außen links).
    const stem = material('#fff6e6', 0.15);
    const cap = material('#e8413c', 0.12);
    for (const [x, z, s] of [
      [-17.4, 3.2, 1],
      [-17.6, -1.4, 0.8],
      [-17.2, -4.0, 1.15],
    ] as const) {
      const st = CreateCylinder(
        'pilz-stiel',
        { diameter: 0.35 * s, height: 0.6 * s, tessellation: 10 },
        scene,
      );
      st.position.set(x, 0.3 * s, z);
      addStatic(st, stem);
      const hat = CreateSphere('pilz-hut', { diameter: 1 * s, segments: 12, slice: 0.5 }, scene);
      hat.position.set(x, 0.55 * s, z);
      addStatic(hat, cap);
    }

    // Felsen am Klippenweg (außen rechts).
    const rock = material('#9aa0b5', 0.08);
    for (const [x, z, s] of [
      [17.5, -2.4, 1],
      [17.4, 2.0, 0.8],
      [17.2, 5.6, 0.7],
    ] as const) {
      const r = CreateSphere('fels', { diameter: 1.4 * s, segments: 4 }, scene);
      r.scaling.y = 0.7;
      r.position.set(x, 0.3 * s, z);
      addStatic(r, rock);
    }

    // Planken unter der Wackelbrücke (links innen).
    const plank = material('#c48a55', 0.08);
    const bridge = ['s35', 's36', 's37'].filter((id) => spaces.has(id));
    for (let i = 0; i + 1 < bridge.length; i++) {
      const a = spacePos(bridge[i] ?? '');
      const b = spacePos(bridge[i + 1] ?? '');
      for (let k = 1; k <= 5; k++) {
        const f = k / 6;
        const p = CreateBox('planke', { width: 1.3, height: 0.08, depth: 0.32 }, scene);
        p.position.set(a.x + (b.x - a.x) * f, 0.06, a.z + (b.z - a.z) * f);
        p.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x) + Math.PI / 2;
        addStatic(p, plank);
      }
    }
  }

  function buildPaths(): void {
    const stone = material('#fff1d0', 0.12);
    const arrow = material('#ffffff', 0.3);
    for (const space of board.spaces) {
      for (const nextId of space.next) {
        const a = space.position;
        const b = spacePos(nextId);
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dz);
        if (length === 0) continue;
        const ux = dx / length;
        const uz = dz / length;
        const inner = length - SPACE_DIAMETER - 0.2;
        if (inner <= 0) continue;
        const start = SPACE_DIAMETER / 2 + 0.1;
        // Pfeil in der Mitte zeigt die Laufrichtung, Steine davor und dahinter.
        const mid = start + inner / 2;
        const chevron = CreateCylinder(
          'pfeil',
          { diameter: 0.62, height: 0.06, tessellation: 3 },
          scene,
        );
        chevron.scaling.x = 1.25;
        chevron.position.set(a.x + ux * mid, 0.05, a.z + uz * mid);
        chevron.rotation.y = Math.atan2(-dz, dx);
        addStatic(chevron, arrow);
        const stones = Math.max(0, Math.floor(inner / 0.75) - 1);
        for (let k = 0; k < stones; k++) {
          const d = start + ((k + 0.5) / stones) * inner;
          if (Math.abs(d - mid) < 0.45) continue;
          const s = CreateCylinder(
            'stein',
            { diameter: 0.28, height: 0.05, tessellation: 10 },
            scene,
          );
          s.position.set(a.x + ux * d, 0.04, a.z + uz * d);
          addStatic(s, stone);
        }
      }
    }
  }

  function buildSpaces(): void {
    const outline = material(INK, 0);
    const white = material('#ffffff', 0.35);
    const pedestal = material('#d9b44a', 0.25);
    const flagRed = material('#e5484d', 0.2);
    for (const space of board.spaces) {
      const { x, z } = space.position;
      const style = KIND_STYLES[space.kind];
      // Dunkler Rand unten (Cartoon-Umriss), farbige Platte darüber.
      const rim = CreateCylinder(
        'feld-rand',
        { diameter: SPACE_DIAMETER + 0.16, height: 0.22, tessellation: style.tessellation },
        scene,
      );
      rim.position.set(x, 0.11, z);
      rim.rotation.y = style.rotation;
      addStatic(rim, outline);
      const plate = CreateCylinder(
        'feld',
        { diameter: SPACE_DIAMETER, height: 0.2, tessellation: style.tessellation },
        scene,
      );
      plate.position.set(x, 0.2, z);
      plate.rotation.y = style.rotation;
      addStatic(plate, material(style.color, 0.12));

      const top = SPACE_TOP + 0.03;
      switch (space.kind) {
        case 'coins-plus': {
          const h = CreateBox('plus-h', { width: 0.78, height: 0.06, depth: 0.22 }, scene);
          h.position.set(x, top, z);
          addStatic(h, white);
          const v = CreateBox('plus-v', { width: 0.22, height: 0.06, depth: 0.78 }, scene);
          v.position.set(x, top, z);
          addStatic(v, white);
          break;
        }
        case 'coins-minus': {
          const h = CreateBox('minus', { width: 0.82, height: 0.06, depth: 0.24 }, scene);
          h.position.set(x, top, z);
          addStatic(h, white);
          break;
        }
        case 'item': {
          // Geschenk: Würfel mit Schleife.
          const box = CreateBox('geschenk', { size: 0.5 }, scene);
          box.position.set(x, top + 0.25, z);
          box.rotation.y = Math.PI / 4;
          addStatic(box, white);
          const ribbonA = CreateBox('schleife', { width: 0.54, height: 0.52, depth: 0.12 }, scene);
          ribbonA.position.set(x, top + 0.25, z);
          ribbonA.rotation.y = Math.PI / 4;
          addStatic(ribbonA, material('#e5484d', 0.2));
          const ribbonB = CreateBox('schleife', { width: 0.12, height: 0.52, depth: 0.54 }, scene);
          ribbonB.position.set(x, top + 0.25, z);
          ribbonB.rotation.y = Math.PI / 4;
          addStatic(ribbonB, material('#e5484d', 0.2));
          break;
        }
        case 'event': {
          // Ausrufezeichen.
          const bar = CreateBox('ausruf', { width: 0.2, height: 0.55, depth: 0.2 }, scene);
          bar.position.set(x, top + 0.48, z);
          addStatic(bar, outline);
          const dot = CreateSphere('ausruf-punkt', { diameter: 0.22, segments: 8 }, scene);
          dot.position.set(x, top + 0.1, z);
          addStatic(dot, outline);
          break;
        }
        case 'trophy': {
          const base = CreateCylinder(
            'sockel',
            { diameterTop: 0.6, diameterBottom: 0.8, height: 0.16, tessellation: 16 },
            scene,
          );
          base.position.set(x, top + 0.06, z);
          addStatic(base, pedestal);
          break;
        }
        case 'start': {
          // Schachbrett-Quadrate und eine Fahne.
          for (const [ox, oz] of [
            [-0.22, -0.22],
            [0.22, 0.22],
          ] as const) {
            const sq = CreateBox('start-feld', { width: 0.44, height: 0.04, depth: 0.44 }, scene);
            sq.position.set(x + ox, top, z + oz);
            addStatic(sq, outline);
          }
          const pole = CreateCylinder(
            'fahnenmast',
            { diameter: 0.08, height: 1.5, tessellation: 8 },
            scene,
          );
          pole.position.set(x + 0.6, top + 0.75, z + 0.5);
          addStatic(pole, outline);
          const flag = CreateBox('fahne', { width: 0.6, height: 0.38, depth: 0.04 }, scene);
          flag.position.set(x + 0.9, top + 1.3, z + 0.5);
          addStatic(flag, flagRed);
          break;
        }
      }
      if (space.kind === 'trophy') trophies.set(space.id, buildTrophy(space));
    }
    mergeStatic();
  }

  /** Goldener Pokal über einem Trophäenfeld; sichtbar nur, solange das Feld aktiv ist. */
  function buildTrophy(space: BoardSpace): TransformNode {
    const gold = material('#ffc83d', 0.45);
    const root = new TransformNode(`pokal-${space.id}`, scene);
    root.position.set(space.position.x, SPACE_TOP + 0.15, space.position.z);
    const parts: Mesh[] = [];
    const foot = CreateCylinder(
      'pokal-fuss',
      { diameterTop: 0.25, diameterBottom: 0.55, height: 0.18, tessellation: 16 },
      scene,
    );
    foot.position.y = 0.09;
    parts.push(foot);
    const stem = CreateCylinder(
      'pokal-stiel',
      { diameter: 0.14, height: 0.3, tessellation: 10 },
      scene,
    );
    stem.position.y = 0.33;
    parts.push(stem);
    const bowl = CreateCylinder(
      'pokal-schale',
      { diameterTop: 0.85, diameterBottom: 0.3, height: 0.62, tessellation: 20 },
      scene,
    );
    bowl.position.y = 0.78;
    parts.push(bowl);
    for (const side of [-1, 1]) {
      const handle = CreateTorus(
        'pokal-henkel',
        { diameter: 0.38, thickness: 0.08, tessellation: 16 },
        scene,
      );
      handle.rotation.x = Math.PI / 2;
      handle.position.set(side * 0.44, 0.84, 0);
      parts.push(handle);
    }
    const star = CreateCylinder(
      'pokal-stern',
      { diameter: 0.26, height: 0.06, tessellation: 5 },
      scene,
    );
    star.rotation.x = Math.PI / 2;
    star.position.set(0, 0.8, -0.34);
    parts.push(star);
    for (const p of parts) {
      p.parent = root;
      p.material = p === star ? material('#ffffff', 0.5) : gold;
      shadows.addShadowCaster(p, false);
    }
    const glow = CreateTorus(
      'pokal-glanz',
      { diameter: 1.9, thickness: 0.1, tessellation: 32 },
      scene,
    );
    glow.parent = root;
    glow.position.y = -0.1;
    glow.material = material('#ffe58a', 0.9);
    root.setEnabled(false);
    return root;
  }

  // ---------------------------------------------------------------------------
  // Texte (Wegweiser, Popups) als Billboards mit DynamicTexture
  // ---------------------------------------------------------------------------

  const measureCanvas = document.createElement('canvas');
  const PX_PER_UNIT = 120;

  function createLabel(name: string, card: TextCard): Label {
    const fontPx = Math.round(card.height * PX_PER_UNIT);
    const font = `900 ${fontPx}px ${FONT}`;
    const measure = measureCanvas.getContext('2d');
    if (measure) measure.font = font;
    const textWidth = measure
      ? measure.measureText(card.text).width
      : card.text.length * fontPx * 0.6;
    const padX = Math.round(fontPx * 0.45);
    const padY = Math.round(fontPx * 0.28);
    const border = Math.max(4, Math.round(fontPx * 0.09));
    const width = Math.ceil(textWidth + 2 * padX + 2 * border);
    const height = Math.ceil(fontPx * 1.15 + 2 * padY + 2 * border);
    const texture = new DynamicTexture(`${name}-tex`, { width, height }, scene, true);
    texture.hasAlpha = true;
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, width, height);
    const radius = Math.min(height / 2, fontPx * 0.5);
    ctx.beginPath();
    ctx.roundRect(border / 2, border / 2, width - border, height - border, radius);
    ctx.fillStyle = card.bg;
    ctx.fill();
    ctx.lineWidth = border;
    ctx.strokeStyle = card.border ?? INK;
    ctx.stroke();
    ctx.font = font;
    ctx.fillStyle = card.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.text, width / 2, height / 2 + fontPx * 0.05);
    texture.update(true);

    const mat = new StandardMaterial(`${name}-mat`, scene);
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    const mesh = CreatePlane(
      name,
      { width: width / PX_PER_UNIT, height: height / PX_PER_UNIT },
      scene,
    );
    mesh.material = mat;
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.isPickable = false;
    mesh.renderingGroupId = 1; // über dem Brett, nicht von Bäumen verdeckt
    return { mesh, material: mat, texture };
  }

  function disposeLabel(label: Label): void {
    label.mesh.dispose();
    label.material.dispose();
    label.texture.dispose();
  }

  function buildSignposts(): void {
    const wood = material('#8a5a3b', 0.08);
    for (const fork of board.spaces) {
      if (fork.next.length < 2) continue;
      for (const targetId of fork.next) {
        const target = spaces.get(targetId);
        if (!target?.label) continue;
        const siblingId = fork.next.find((id) => id !== targetId);
        const sibling = siblingId ? spacePos(siblingId) : null;
        const p = signpostPosition(target.position, sibling, 1.6);
        const post = CreateCylinder(
          'wegweiser-pfahl',
          { diameter: 0.14, height: 1.5, tessellation: 8 },
          scene,
        );
        post.position.set(p.x, 0.75, p.z);
        post.material = wood;
        post.isPickable = false;
        shadows.addShadowCaster(post, false);
        const label = createLabel(`wegweiser-${target.id}`, {
          text: target.label,
          bg: '#fff3d6',
          fg: INK,
          height: 0.62,
          border: '#8a5a3b',
        });
        label.mesh.position.set(p.x, 1.75, p.z);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Figuren, Marker, Fallen, Popups
  // ---------------------------------------------------------------------------

  function buildActiveMarker(): void {
    activeRing = CreateTorus(
      'am-zug-ring',
      { diameter: 1.45, thickness: 0.14, tessellation: 32 },
      scene,
    );
    activeRing.material = material('#ffffff', 0.9);
    activeRing.isPickable = false;
    activeRing.setEnabled(false);
    // Pfeil nach unten als Billboard: aus jedem Kamerawinkel als Pfeil lesbar.
    const size = 128;
    const texture = new DynamicTexture(
      'am-zug-pfeil-tex',
      { width: size, height: size },
      scene,
      true,
    );
    texture.hasAlpha = true;
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.moveTo(size * 0.32, size * 0.08);
    ctx.lineTo(size * 0.68, size * 0.08);
    ctx.lineTo(size * 0.68, size * 0.45);
    ctx.lineTo(size * 0.9, size * 0.45);
    ctx.lineTo(size * 0.5, size * 0.92);
    ctx.lineTo(size * 0.1, size * 0.45);
    ctx.lineTo(size * 0.32, size * 0.45);
    ctx.closePath();
    ctx.fillStyle = '#ffe24a';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = INK;
    ctx.stroke();
    texture.update(true);
    const mat = new StandardMaterial('am-zug-pfeil-mat', scene);
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    activeArrow = CreatePlane('am-zug-pfeil', { size: 1.5 }, scene);
    activeArrow.material = mat;
    activeArrow.billboardMode = Mesh.BILLBOARDMODE_ALL;
    activeArrow.renderingGroupId = 1;
    activeArrow.isPickable = false;
    activeArrow.setEnabled(false);
  }

  function symbolMesh(slot: SlotNumber, name: string): Mesh {
    // Farbunabhängige Kennung wie im Protokoll: ● ▲ ■ ★
    switch (slot) {
      case 1:
        return CreateSphere(name, { diameter: 0.26, segments: 12 }, scene);
      case 2:
        return CreateCylinder(
          name,
          { diameterTop: 0, diameterBottom: 0.32, height: 0.3, tessellation: 3 },
          scene,
        );
      case 3:
        return CreateBox(name, { size: 0.24 }, scene);
      case 4: {
        const a = CreateBox(`${name}-a`, { width: 0.34, height: 0.1, depth: 0.1 }, scene);
        const b = CreateBox(`${name}-b`, { width: 0.34, height: 0.1, depth: 0.1 }, scene);
        b.rotation.z = Math.PI / 3;
        const c = CreateBox(`${name}-c`, { width: 0.34, height: 0.1, depth: 0.1 }, scene);
        c.rotation.z = -Math.PI / 3;
        return Mesh.MergeMeshes([a, b, c], true) ?? a;
      }
    }
  }

  function createPawn(slot: SlotNumber, characterId: CharacterId, library: CharacterLibrary): Pawn {
    const style = PLAYER_SLOTS[slot];
    const root = new TransformNode(`figur-${slot}`, scene);
    const white = material('#ffffff', 0.35);
    const black = material(INK, 0);
    // Spielstein-Sockel in Slot-Farbe mit dunklem Rand und weißem Ring: von oben die
    // deutlichste Kennung, hebt die Figur von jeder Feldfarbe ab.
    const baseRim = CreateCylinder(
      'sockel-rand',
      { diameter: PAWN.radius * 2 + 0.26, height: 0.08, tessellation: 24 },
      scene,
    );
    baseRim.parent = root;
    baseRim.position.y = 0.04;
    baseRim.material = black;
    const base = CreateCylinder(
      'sockel',
      { diameter: PAWN.radius * 2 + 0.16, height: 0.12, tessellation: 24 },
      scene,
    );
    const slotMat = ownMaterial(`figur-${slot}-mat`, style.color, 0.2);
    base.parent = root;
    base.position.y = 0.08;
    base.material = slotMat;
    const ring = CreateTorus(
      'sockel-ring',
      { diameter: PAWN.radius * 2 + 0.04, thickness: 0.07, tessellation: 32 },
      scene,
    );
    ring.parent = root;
    ring.position.y = 0.145;
    ring.material = white;

    // Figur auf dem Sockel, an einem Drehknoten (Blickrichtung).
    const facing = new TransformNode(`figur-${slot}-blick`, scene);
    facing.parent = root;
    facing.position.y = PAWN_LIFT;
    facing.rotation.set(STAND_TILT, FACE_CAMERA, 0);
    facing.scaling.setAll(CHARACTER_SCALE);
    const character = library.create(scene, {
      slot,
      name: style.label,
      color: style.color,
      symbol: style.symbol,
      character: characterId,
    });
    character.root.parent = facing;

    // Schwebendes Slot-Symbol über dem Kopf (Farbe + Form, von weit oben lesbar).
    const symbol = symbolMesh(slot, `figur-${slot}-symbol`);
    symbol.parent = root;
    symbol.position.y = SYMBOL_Y;
    symbol.scaling.setAll(1.9);
    symbol.material = slotMat;

    const meshes: Mesh[] = [baseRim, base, ring, symbol];
    for (const m of meshes) {
      m.isPickable = false;
      shadows.addShadowCaster(m, false);
    }
    shadows.addShadowCaster(character.shadowCaster, false);

    // Getrennt-Marker wie in der Arena (CHAOS-12): „!“ in Warnorange.
    const marker = new TransformNode(`figur-${slot}-getrennt`, scene);
    marker.parent = root;
    marker.position.y = PAWN.height + 0.9;
    const warn = material('#d55e00', 0.6);
    const bar = CreateCylinder(
      'getrennt-strich',
      { diameterTop: 0.16, diameterBottom: 0.1, height: 0.4, tessellation: 10 },
      scene,
    );
    bar.parent = marker;
    bar.position.y = 0.16;
    bar.material = warn;
    const dot = CreateSphere('getrennt-punkt', { diameter: 0.14, segments: 8 }, scene);
    dot.parent = marker;
    dot.position.y = -0.14;
    dot.material = warn;
    marker.setEnabled(false);

    return {
      slot,
      root,
      character,
      facing,
      symbol,
      marker,
      meshes,
      materials: [slotMat],
      connected: null,
      yaw: FACE_CAMERA,
      position: new Vector3(),
    };
  }

  function applyConnected(pawn: Pawn, connected: boolean): void {
    if (pawn.connected === connected) return;
    pawn.connected = connected;
    const alpha = connected ? 1 : 0.35;
    pawn.character.setOpacity(alpha);
    for (const m of pawn.meshes) m.visibility = alpha;
    pawn.marker.setEnabled(!connected);
  }

  function disposePawn(pawn: Pawn): void {
    for (const m of [...pawn.meshes, pawn.character.shadowCaster]) {
      shadows.removeShadowCaster(m, false);
    }
    pawn.character.dispose();
    pawn.root.dispose(false, false);
    for (const mat of pawn.materials) mat.dispose();
  }

  /** Dreht die Figur weich (kürzester Weg) in Richtung `target`. */
  function turn(pawn: Pawn, target: number, tilt: number, dtMs: number): void {
    let delta = (target - pawn.yaw) % (2 * Math.PI);
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    const factor = dtMs <= 0 ? 0 : 1 - Math.pow(0.5, dtMs / TURN_HALF_LIFE_MS);
    pawn.yaw += delta * factor;
    pawn.facing.rotation.y = pawn.yaw;
    pawn.facing.rotation.x += (tilt - pawn.facing.rotation.x) * factor;
  }

  function syncPawns(framePawns: readonly FramePawn[], dtMs: number): void {
    const library = characters;
    if (!library) return;
    const wanted = new Set(framePawns.map((p) => p.slot));
    for (const [slot, pawn] of pawns) {
      if (!wanted.has(slot)) {
        disposePawn(pawn);
        pawns.delete(slot);
      }
    }
    const standing = framePawns.filter((p) => p.hop === null);
    const offsets = spreadPawns(standing);
    for (const fp of framePawns) {
      let pawn = pawns.get(fp.slot);
      if (pawn && pawn.character.id !== fp.character) {
        // Andere Figur im Slot (neue Partie nach der Revanche): Spielstein neu bauen.
        disposePawn(pawn);
        pawns.delete(fp.slot);
        pawn = undefined;
      }
      if (!pawn) {
        pawn = createPawn(fp.slot, fp.character, library);
        pawns.set(fp.slot, pawn);
      }
      applyConnected(pawn, fp.connected);
      let x: number;
      let y: number;
      let z: number;
      if (fp.hop) {
        const from = spacePos(fp.hop.from);
        const to = spacePos(fp.hop.to);
        const p = hopPoint(from, to, fp.hop.t);
        x = p.x;
        y = SPACE_TOP + p.y;
        z = p.z;
        // In Laufrichtung schauen (+z der Figur = Blick; Drehung um y: atan2(dx, dz)).
        const heading =
          to.x !== from.x || to.z !== from.z ? Math.atan2(to.x - from.x, to.z - from.z) : pawn.yaw;
        turn(pawn, heading, 0, dtMs);
        pawn.character.play('run'); // Schleife: läuft weiter, startet nicht neu
      } else {
        const base = spacePos(fp.spaceId);
        const offset = offsets.get(fp.slot) ?? { x: 0, z: 0 };
        x = base.x + offset.x;
        y = SPACE_TOP;
        z = base.z + offset.z;
        turn(pawn, FACE_CAMERA, STAND_TILT, dtMs);
        if (pawn.character.animation === 'run') pawn.character.play('idle');
      }
      pawn.root.position.set(x, y, z);
      pawn.position.set(x, y, z);
      // Symbol schwebt leicht (Simulationszeit, deterministisch).
      pawn.symbol.position.y = SYMBOL_Y + 0.06 * Math.sin(simMs / 300 + fp.slot);
    }
  }

  /** Reaktion der Figur auf ein neues Popup über ihr (Trophäe, Münzen, Falle, Klau). */
  function reactionFor(popup: FramePopup): CharacterAnimation | null {
    switch (popup.kind) {
      case 'trophy':
        return popup.tone === 'gold' ? 'cheer' : null;
      case 'trap':
      case 'steal':
        return 'hit';
      case 'coins':
        return popup.tone === 'bad' ? 'hit' : popup.tone === 'good' ? 'jump' : null;
      default:
        return null;
    }
  }

  function syncActive(activeSlot: SlotNumber | null): void {
    const pawn = activeSlot === null ? undefined : pawns.get(activeSlot);
    if (!activeRing || !activeArrow) return;
    if (!pawn) {
      activeRing.setEnabled(false);
      activeArrow.setEnabled(false);
      return;
    }
    const p = pawn.position;
    activeRing.setEnabled(true);
    activeRing.position.set(p.x, SPACE_TOP + 0.04, p.z);
    activeArrow.setEnabled(true);
    activeArrow.position.set(p.x, p.y + PAWN.height + 1.0 + 0.15 * Math.sin(simMs / 180), p.z);
  }

  function syncTrophies(active: readonly string[]): void {
    const on = new Set(active);
    for (const [id, node] of trophies) {
      const enabled = on.has(id);
      if (node.isEnabled() !== enabled) node.setEnabled(enabled);
      if (enabled) {
        node.rotation.y = simMs / 900;
        node.position.y = SPACE_TOP + 0.15 + 0.08 * Math.sin(simMs / 400);
      }
    }
  }

  function createTrap(spaceId: string, owner: SlotNumber): TransformNode {
    const root = new TransformNode(`falle-${spaceId}-${owner}`, scene);
    const p = spacePos(spaceId);
    root.position.set(p.x, SPACE_TOP, p.z);
    // Fangeisen: dunkler Bügel, graue Zacken, Mitte in Besitzerfarbe (wem die Falle gehört).
    const metal = material('#d5dae6', 0.25);
    const center = CreateCylinder(
      'falle-mitte',
      { diameter: 0.62, height: 0.08, tessellation: 24 },
      scene,
    );
    center.parent = root;
    center.position.y = 0.06;
    center.material = material(PLAYER_SLOTS[owner].color, 0.35);
    const jaw = CreateTorus(
      'falle-buegel',
      { diameter: 1.2, thickness: 0.14, tessellation: 24 },
      scene,
    );
    jaw.parent = root;
    jaw.position.y = 0.07;
    jaw.material = material(INK, 0);
    const parts: Mesh[] = [center, jaw];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const spike = CreateCylinder(
        'falle-zacke',
        { diameterTop: 0, diameterBottom: 0.2, height: 0.42, tessellation: 4 },
        scene,
      );
      spike.parent = root;
      spike.position.set(Math.cos(angle) * 0.6, 0.27, Math.sin(angle) * 0.6);
      spike.material = metal;
      parts.push(spike);
    }
    for (const part of parts) part.isPickable = false;
    return root;
  }

  function syncTraps(list: readonly { spaceId: string; owner: SlotNumber }[]): void {
    const wanted = new Map(list.map((t) => [`${t.spaceId}|${t.owner}`, t]));
    for (const [key, node] of traps) {
      if (!wanted.has(key)) {
        node.dispose(false, false);
        traps.delete(key);
      }
    }
    for (const [key, trap] of wanted) {
      if (!traps.has(key)) traps.set(key, createTrap(trap.spaceId, trap.owner));
    }
  }

  function syncPopups(list: readonly FramePopup[]): void {
    const wanted = new Set(list.map((p) => p.id));
    for (const [id, label] of popups) {
      if (!wanted.has(id)) {
        disposeLabel(label);
        popups.delete(id);
      }
    }
    for (const id of reacted) if (!wanted.has(id)) reacted.delete(id);
    for (const popup of list) {
      if (popup.slot === null || reacted.has(popup.id)) continue;
      reacted.add(popup.id);
      const pawn = pawns.get(popup.slot);
      const animation = reactionFor(popup);
      // Während des Hüpfens hat `run` Vorrang; danach reagiert die Figur auf das nächste Popup.
      if (pawn && animation && pawn.character.animation !== 'run') pawn.character.play(animation);
    }
    for (const popup of list) {
      let label = popups.get(popup.id);
      if (!label) {
        const colors = popup.kind === 'dice' ? { bg: '#ffffff', fg: INK } : TONE_COLORS[popup.tone];
        label = createLabel(`popup-${popup.id}`, {
          text: popup.text,
          bg: colors.bg,
          fg: colors.fg,
          height: popup.kind === 'dice' ? 1.1 : 0.8,
        });
        popups.set(popup.id, label);
      }
      const anchor =
        popup.slot !== null
          ? (pawns.get(popup.slot)?.position ?? null)
          : popup.spaceId !== null
            ? (() => {
                const p = spacePos(popup.spaceId);
                return new Vector3(p.x, SPACE_TOP, p.z);
              })()
            : null;
      if (!anchor) {
        label.mesh.setEnabled(false);
        continue;
      }
      label.mesh.setEnabled(true);
      // Schnell auftauchen, langsam steigen, am Ende ausblenden.
      const t = popup.progress;
      const pop = Math.min(1, t / 0.12);
      label.mesh.scaling.setAll(0.6 + 0.4 * pop);
      label.mesh.position.set(anchor.x, anchor.y + PAWN.height + 1.2 + t * 0.9, anchor.z);
      label.material.alpha = t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.25) : 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  function placeCamera(): void {
    const aimZ = focus.z + CAMERA_AIM_Z;
    camera.position.set(focus.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, aimZ + CAMERA_OFFSET.z);
    camera.setTarget(new Vector3(focus.x, 0, aimZ));
  }

  let cameraPlaced = false;
  function updateCamera(dtMs: number, activeSlot: SlotNumber | null): void {
    const pawn = activeSlot === null ? undefined : pawns.get(activeSlot);
    const target = cameraFocus(bounds, pawn ? { x: pawn.position.x, z: pawn.position.z } : null);
    if (!cameraPlaced) {
      focus.x = target.x;
      focus.z = target.z;
      cameraPlaced = true;
    } else {
      focus.x = approach(focus.x, target.x, dtMs, CAMERA_HALF_LIFE_MS);
      focus.z = approach(focus.z, target.z, dtMs, CAMERA_HALF_LIFE_MS);
    }
    placeCamera();
  }

  function update(dtMs: number): void {
    if (!built || disposed) return;
    simMs += dtMs;
    source.advance(dtMs);
    const frame = source.getFrame();
    const view = frame.view;
    syncPawns(frame.pawns, dtMs);
    syncTrophies(view?.trophySpaces ?? []);
    syncTraps(view?.traps ?? []);
    syncActive(view?.activeSlot ?? null);
    syncPopups(frame.popups);
    updateCamera(dtMs, view?.activeSlot ?? null);
    trees.forEach((tree, i) => {
      tree.rotation.z = 0.035 * Math.sin(simMs / 700 + i * 1.7);
      tree.rotation.x = 0.025 * Math.sin(simMs / 900 + i);
    });
  }

  return {
    ready,
    stepFrames(n) {
      if (!testMode) throw new Error('stepFrames ist nur im Testmodus verfügbar');
      if (!built || disposed) return;
      for (let i = 0; i < n; i++) {
        update(TEST_STEP_MS);
        scene.render();
      }
    },
    getPawnPositions(): PlayerPosition[] {
      return [...pawns.values()]
        .map((p) => ({ slot: p.slot, x: p.position.x, y: p.position.y, z: p.position.z }))
        .sort((a, b) => a.slot - b.slot);
    },
    getPawnCharacters() {
      const result: Partial<Record<SlotNumber, CharacterId>> = {};
      for (const pawn of pawns.values()) result[pawn.slot] = pawn.character.id;
      return result;
    },
    onFrameRendered(listener) {
      return observeFrames(scene, listener);
    },
    getResourceStats() {
      return resourceStats(scene);
    },
    getRendererInfo(): RendererInfo {
      const gl = engine.getGlInfo();
      return {
        webgl: engine.webGLVersion,
        renderer: gl.renderer,
        vendor: gl.vendor,
        width: engine.getRenderWidth(),
        height: engine.getRenderHeight(),
      };
    },
    setRenderPaused(paused) {
      if (paused === renderPaused) return;
      renderPaused = paused;
      // Im Testmodus treibt nur `stepFrames` die Szene; vor dem Aufbau startet `ready` die Schleife.
      if (testMode || !built || disposed) return;
      stopLoop();
      startLoop();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('resize', onResize);
      stopLoop();
      for (const pawn of pawns.values()) pawn.character.dispose();
      pawns.clear();
      characters?.dispose();
      characters = null;
      scene.dispose();
      engine.dispose();
    },
  };
}
