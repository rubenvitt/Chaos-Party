/**
 * Babylon.js-Szene des PC-Hosts: Arena, eine Spielfigur pro Spieler, Havok-Physik.
 *
 * Framework-unabhängig (kein React): Die Szene bekommt Spielerliste und Eingaben
 * über die `GameScene`-Schnittstelle und gibt nichts an die UI zurück außer `ready`.
 * Deep-Imports statt `@babylonjs/core`-Barrel, damit Vite nur Benötigtes bündelt.
 */
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent.js';
import {
  PhysicsMotionType,
  PhysicsShapeType,
} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import '@babylonjs/core/Physics/v2/physicsEngineComponent.js';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin.js';
import { Scene } from '@babylonjs/core/scene.js';
import { observeFrames, resourceStats } from '../debug/renderProbe.ts';
import { loadHavok } from './havok.ts';
import {
  approachAngle,
  clampStick,
  MOVEMENT,
  steeringDeltaV,
  yawForDirection,
} from './movement.ts';
import { computeSpawnPoints } from './spawn.ts';
import type {
  GameScene,
  GameSceneOptions,
  PlayerInput,
  PlayerPosition,
  PlayerSlot,
  RendererInfo,
  ScenePlayer,
} from './types.ts';

/** Feste Simulationsschrittweite in Sekunden (Dev und Test gleich). */
const STEP = 1 / 60;

const ARENA = {
  width: 18,
  depth: 11,
  wallHeight: 0.7,
  wallThickness: 0.5,
  tile: 1.5,
} as const;

const CHARACTER = {
  radius: 0.55,
  height: 1.5,
  mass: 1,
} as const;

function ignoreError(): void {
  // absichtlich leer
}

/** Spielfigur samt Physikkörper und Eingabezustand. */
interface Character {
  player: ScenePlayer;
  root: Mesh;
  face: TransformNode;
  antenna: Mesh;
  aggregate: PhysicsAggregate;
  material: StandardMaterial;
  /** Rotes „!“ über dem Kopf, nur sichtbar, solange der Controller getrennt ist (CHAOS-12). */
  marker: TransformNode;
  markerMaterial: StandardMaterial;
  stick: { x: number; y: number };
  dashQueued: boolean;
  lastDashAt: number;
  facingYaw: number;
}

export function createGameScene(canvas: HTMLCanvasElement, options: GameSceneOptions): GameScene {
  const testMode = options.testMode ?? false;
  const engine = new Engine(
    canvas,
    true,
    {
      // Normalbetrieb: feste 60-Hz-Physikschritte unabhängig von der Bildrate.
      deterministicLockstep: !testMode,
      lockstepMaxSteps: 4,
      timeStep: STEP,
      // Test: Canvas-Inhalt bleibt lesbar (Pixelprüfung, Screenshot ohne Render-Schleife).
      preserveDrawingBuffer: testMode,
      stencil: true,
    },
    // Im Test feste Auflösung (Gerätepixelverhältnis 1), sonst scharf auf HiDPI.
    !testMode,
  );

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0); // Hintergrund kommt als CSS-Verlauf
  scene.skipPointerMovePicking = true;
  if (testMode) {
    scene.useConstantAnimationDeltaTime = true;
  }

  const spawnPoints = computeSpawnPoints(options.seed, {
    halfWidth: ARENA.width / 2 - 2,
    halfDepth: ARENA.depth / 2 - 1.8,
    minDistance: 2.6,
  });

  const characters = new Map<PlayerSlot, Character>();
  let desiredPlayers: readonly ScenePlayer[] = [];
  let physicsReady = false;
  let disposed = false;
  // Funktion statt direkter Abfrage: `dispose()` kann zwischen zwei `await` laufen.
  const isDisposed = (): boolean => disposed;
  let simTime = 0;
  let shadows: ShadowGenerator | undefined;

  const camera = new FreeCamera('kamera', new Vector3(0, 13.5, -13.5), scene);
  camera.setTarget(new Vector3(0, 0, -0.6));
  camera.fov = 0.78;
  camera.inputs.clear(); // feste Kamera, keine Maus-/Tastatursteuerung

  buildLights();

  const onResize = (): void => {
    engine.resize();
    if (testMode && physicsReady) {
      scene.render();
    }
  };
  window.addEventListener('resize', onResize);

  const physicsReadyPromise = (async () => {
    const havok = await loadHavok();
    if (isDisposed()) {
      throw new Error('Szene wurde vor dem Laden von Havok entsorgt');
    }
    // useDeltaForWorldStep=false: Havok rechnet immer mit festem Schritt (1/60 s).
    const plugin = new HavokPlugin(false, havok);
    plugin.setTimeStep(STEP);
    if (!scene.enablePhysics(new Vector3(0, -20, 0), plugin)) {
      throw new Error('Havok-Physik konnte nicht aktiviert werden');
    }
    physicsReady = true;
  })();
  // Ablehnung wird über `ready` gemeldet; hier nur als behandelt markieren,
  // damit Nutzer, die nur `ready` abfragen, keine „unhandled rejection“ bekommen.
  physicsReadyPromise.catch(ignoreError);

  const ready = (async () => {
    await physicsReadyPromise;
    buildArena();
    scene.onBeforePhysicsObservable.add(beforePhysicsStep);
    syncPlayers();

    await scene.whenReadyAsync(true);
    if (isDisposed()) {
      throw new Error('Szene wurde während des Aufbaus entsorgt');
    }
    if (testMode) {
      scene.render();
    } else {
      engine.runRenderLoop(() => {
        scene.render();
      });
    }
  })();

  function buildLights(): void {
    const hemi = new HemisphericLight('himmel', new Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = 0.6;
    hemi.diffuse = new Color3(1, 0.97, 0.92);
    hemi.groundColor = new Color3(0.45, 0.4, 0.65);
    hemi.specular = new Color3(0.1, 0.1, 0.1);

    // Sonne von links vorn oben: Gesichter beleuchtet, Schatten fallen sichtbar nach rechts.
    const direction = new Vector3(0.6, -1, 0.25).normalize();
    const sun = new DirectionalLight('sonne', direction, scene);
    sun.position = direction.scale(-20);
    sun.intensity = 0.6;
    sun.specular = new Color3(0.25, 0.25, 0.25);
    // Enger Tiefenbereich, sonst schluckt der Bias die Schatten (Tiefe wird auf min..max normiert).
    sun.shadowMinZ = 5;
    sun.shadowMaxZ = 40;

    shadows = new ShadowGenerator(1024, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    shadows.bias = 0.002;
    shadows.darkness = 0.45;
  }

  function material(name: string, hex: string, emissive = 0.08): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    const color = Color3.FromHexString(hex);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(emissive);
    mat.specularColor = new Color3(0.12, 0.12, 0.12);
    return mat;
  }

  function buildArena(): void {
    const { width, depth, wallHeight, wallThickness, tile } = ARENA;

    // Boden: dicke Platte (Physik) + Schachbrettfliesen als Optik.
    const floor = CreateBox('boden', { width, height: 0.5, depth }, scene);
    floor.position.y = -0.25;
    floor.material = material('boden-mat', '#f7dcae', 0.04);
    floor.receiveShadows = true;
    new PhysicsAggregate(
      floor,
      PhysicsShapeType.BOX,
      { mass: 0, friction: 0.6, restitution: 0.2 },
      scene,
    );

    const tiles: Mesh[] = [];
    const cols = Math.floor(width / tile);
    const rows = Math.floor(depth / tile);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if ((c + r) % 2 === 0) continue;
        const t = CreateBox(`fliese-${c}-${r}`, { width: tile, height: 0.02, depth: tile }, scene);
        t.position.set(
          -((cols - 1) * tile) / 2 + c * tile,
          0.01,
          -((rows - 1) * tile) / 2 + r * tile,
        );
        tiles.push(t);
      }
    }
    const checker = Mesh.MergeMeshes(tiles, true);
    if (checker) {
      checker.name = 'fliesen';
      checker.material = material('fliesen-mat', '#f9b98c', 0.04);
      checker.receiveShadows = true;
      checker.freezeWorldMatrix();
    }

    // Niedrige Banden ringsum, bonbonfarben.
    const wallMat = material('bande-mat', '#ff7eb6', 0.12);
    const walls: [string, number, number, number, number][] = [
      ['bande-nord', 0, depth / 2 + wallThickness / 2, width + 2 * wallThickness, wallThickness],
      ['bande-sued', 0, -depth / 2 - wallThickness / 2, width + 2 * wallThickness, wallThickness],
      ['bande-ost', width / 2 + wallThickness / 2, 0, wallThickness, depth],
      ['bande-west', -width / 2 - wallThickness / 2, 0, wallThickness, depth],
    ];
    for (const [name, x, z, w, d] of walls) {
      const wall = CreateBox(name, { width: w, height: wallHeight, depth: d }, scene);
      wall.position.set(x, wallHeight / 2, z);
      wall.material = wallMat;
      wall.receiveShadows = true;
      new PhysicsAggregate(
        wall,
        PhysicsShapeType.BOX,
        { mass: 0, friction: 0.1, restitution: 0.8 },
        scene,
      );
    }

    // Eckpfosten mit Kugelkappe – reine Deko, macht die Arena spielzeughafter.
    const postMat = material('pfosten-mat', '#7c5cff', 0.15);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (width / 2 + wallThickness / 2);
        const z = sz * (depth / 2 + wallThickness / 2);
        const post = CreateCylinder(
          'pfosten',
          { diameter: 0.8, height: wallHeight + 0.3, tessellation: 24 },
          scene,
        );
        post.position.set(x, (wallHeight + 0.3) / 2, z);
        post.material = postMat;
        const cap = CreateSphere('pfosten-kappe', { diameter: 0.8, segments: 16 }, scene);
        cap.position.set(x, wallHeight + 0.3, z);
        cap.material = postMat;
      }
    }
  }

  function createCharacter(player: ScenePlayer): Character {
    const spawn = spawnPoints[player.slot];
    const root = CreateCapsule(
      `spieler-${player.slot}`,
      { radius: CHARACTER.radius, height: CHARACTER.height, tessellation: 24, capSubdivisions: 8 },
      scene,
    );
    root.position.set(spawn.x, CHARACTER.height / 2 + 0.02, spawn.z);
    const mat = material(`spieler-${player.slot}-mat`, player.color, 0.18);
    root.material = mat;

    // Gesicht: dreht sich in Laufrichtung, unabhängig vom (rotationsgesperrten) Körper.
    const face = new TransformNode(`spieler-${player.slot}-gesicht`, scene);
    face.parent = root;
    const white = material(`spieler-${player.slot}-augen`, '#ffffff', 0.35);
    const black = material(`spieler-${player.slot}-pupillen`, '#1b1530', 0);
    for (const side of [-1, 1]) {
      const eye = CreateSphere('auge', { diameter: 0.34, segments: 16 }, scene);
      eye.parent = face;
      eye.position.set(side * 0.2, 0.3, -CHARACTER.radius + 0.06);
      eye.material = white;
      const pupil = CreateSphere('pupille', { diameter: 0.16, segments: 12 }, scene);
      pupil.parent = eye;
      pupil.position.set(side * -0.02, -0.01, -0.13);
      pupil.material = black;
    }

    // Antenne mit Bommel für eine klare Silhouette.
    const stalk = CreateCylinder(
      'antennen-stiel',
      { diameter: 0.07, height: 0.4, tessellation: 8 },
      scene,
    );
    stalk.parent = root;
    stalk.position.y = CHARACTER.height / 2 + 0.15;
    stalk.material = black;
    const antenna = CreateSphere('antenne', { diameter: 0.26, segments: 12 }, scene);
    antenna.parent = root;
    antenna.position.y = CHARACTER.height / 2 + 0.38;
    antenna.material = mat;

    const aggregate = new PhysicsAggregate(
      root,
      PhysicsShapeType.CAPSULE,
      { mass: CHARACTER.mass, friction: 0.15, restitution: 0.55 },
      scene,
    );
    aggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    // Trägheit 0 sperrt die Rotation: Figuren bleiben aufrecht, auch beim Schubsen.
    aggregate.body.setMassProperties({ mass: CHARACTER.mass, inertia: new Vector3(0, 0, 0) });
    aggregate.body.setLinearDamping(0.05);

    for (const mesh of [root, ...root.getChildMeshes()]) {
      shadows?.addShadowCaster(mesh, false);
    }

    // Getrennt-Marker (CHAOS-12): ein „!“ in Warnorange schwebt über dem Kopf – vom Sofa aus
    // erkennbar, wer gerade keine Verbindung hat. Kein Schattenwerfer, standardmäßig aus.
    const marker = new TransformNode(`spieler-${player.slot}-getrennt`, scene);
    marker.parent = root;
    marker.position.y = CHARACTER.height / 2 + 1.0;
    const markerMaterial = material(`spieler-${player.slot}-getrennt-mat`, '#d55e00', 0.6);
    const bar = CreateCylinder(
      'getrennt-strich',
      { diameterTop: 0.2, diameterBottom: 0.12, height: 0.5, tessellation: 12 },
      scene,
    );
    bar.parent = marker;
    bar.position.y = 0.2;
    bar.material = markerMaterial;
    const dot = CreateSphere('getrennt-punkt', { diameter: 0.18, segments: 10 }, scene);
    dot.parent = marker;
    dot.position.y = -0.17;
    dot.material = markerMaterial;
    marker.setEnabled(false);

    const character: Character = {
      player,
      root,
      face,
      antenna,
      aggregate,
      material: mat,
      marker,
      markerMaterial,
      stick: { x: 0, y: 0 },
      dashQueued: false,
      lastDashAt: Number.NEGATIVE_INFINITY,
      facingYaw: 0,
    };
    applyAppearance(character);
    return character;
  }

  function applyAppearance(character: Character): void {
    const { player, material: mat, root } = character;
    const color = Color3.FromHexString(player.color);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.18);
    const alpha = player.connected ? 1 : 0.35;
    mat.alpha = alpha;
    for (const child of root.getChildMeshes()) {
      child.visibility = alpha;
    }
    character.marker.setEnabled(!player.connected);
    for (const child of character.marker.getChildMeshes()) {
      child.visibility = 1;
    }
  }

  function disposeCharacter(character: Character): void {
    for (const mesh of [character.root, ...character.root.getChildMeshes()]) {
      shadows?.removeShadowCaster(mesh, false);
    }
    character.aggregate.dispose();
    character.material.dispose();
    character.markerMaterial.dispose();
    character.root.dispose(false, false);
  }

  function syncPlayers(): void {
    if (!physicsReady || disposed) return;
    const wanted = new Map(desiredPlayers.map((p) => [p.slot, p]));
    for (const [slot, character] of characters) {
      if (!wanted.has(slot)) {
        disposeCharacter(character);
        characters.delete(slot);
      }
    }
    for (const player of wanted.values()) {
      const existing = characters.get(player.slot);
      if (existing) {
        existing.player = player;
        if (!player.connected) {
          existing.stick = { x: 0, y: 0 };
          existing.dashQueued = false;
        }
        applyAppearance(existing);
      } else {
        characters.set(player.slot, createCharacter(player));
      }
    }
  }

  const velocity = new Vector3();
  const impulse = new Vector3();

  function beforePhysicsStep(): void {
    simTime += STEP;
    for (const character of characters.values()) {
      const body = character.aggregate.body;
      body.getLinearVelocityToRef(velocity);
      const center = character.root.getAbsolutePosition();
      const { stick } = character;
      const moving = Math.hypot(stick.x, stick.y) > 0.05;

      if (character.dashQueued) {
        character.dashQueued = false;
        if (simTime - character.lastDashAt >= MOVEMENT.dashCooldown) {
          character.lastDashAt = simTime;
          // Richtung: Stick, sonst Blickrichtung des Gesichts.
          const dir = moving
            ? clampStick(stick.x, stick.y)
            : { x: -Math.sin(character.facingYaw), y: -Math.cos(character.facingYaw) };
          const len = Math.hypot(dir.x, dir.y) || 1;
          impulse.set(
            (dir.x / len) * MOVEMENT.dashSpeed * CHARACTER.mass,
            0,
            (dir.y / len) * MOVEMENT.dashSpeed * CHARACTER.mass,
          );
          body.applyImpulse(impulse, center);
        }
      }

      if (simTime - character.lastDashAt >= MOVEMENT.dashSteerPause) {
        const dv = steeringDeltaV({ x: velocity.x, z: velocity.z }, stick, STEP);
        impulse.set(dv.x * CHARACTER.mass, 0, dv.z * CHARACTER.mass);
        body.applyImpulse(impulse, center);
      }

      // Gesicht dreht sich in Laufrichtung; Antenne wippt in Simulationszeit (deterministisch).
      if (moving) {
        const target = yawForDirection(stick.x, stick.y);
        character.facingYaw = approachAngle(character.facingYaw, target, MOVEMENT.turnSpeed * STEP);
      }
      character.face.rotation.y = character.facingYaw;
      const wobble = Math.sin(simTime * 6 + character.player.slot) * 0.05;
      character.antenna.position.x = wobble + (moving ? -stick.x * 0.08 : 0);
    }
  }

  function applyInput(slot: PlayerSlot, input: PlayerInput): void {
    const character = characters.get(slot);
    if (!character?.player.connected) return;
    if (input.type === 'move') {
      character.stick = clampStick(input.x, input.y);
    } else if (input.pressed) {
      // Einziger Knopf bisher: dash. Weitere Knöpfe hier unterscheiden.
      character.dashQueued = true;
    }
  }

  return {
    physicsReady: physicsReadyPromise,
    ready,
    setPlayers(players) {
      desiredPlayers = [...players];
      syncPlayers();
    },
    applyInput,
    stepFrames(n) {
      if (!testMode) {
        throw new Error('stepFrames ist nur im Testmodus verfügbar');
      }
      if (!physicsReady || disposed) return;
      for (let i = 0; i < n; i++) {
        scene.render();
      }
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
    getPlayerPositions(): PlayerPosition[] {
      return [...characters.values()]
        .map((c) => {
          const p = c.root.getAbsolutePosition();
          return { slot: c.player.slot, x: p.x, y: p.y, z: p.z };
        })
        .sort((a, b) => a.slot - b.slot);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('resize', onResize);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
