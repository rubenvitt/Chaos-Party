/**
 * Babylon.js-Szene des PC-Hosts: Arena, eine Spielfigur pro Spieler, Havok-Physik.
 *
 * Framework-unabhängig (kein React): Die Szene bekommt Spielerliste und Eingaben
 * über die `GameScene`-Schnittstelle und gibt nichts an die UI zurück außer `ready`.
 * Deep-Imports statt `@babylonjs/core`-Barrel, damit Vite nur Benötigtes bündelt.
 *
 * Natur-Look (CHAOS-77): Die Arena ist eine Lichtung auf einer kleinen Insel
 * (`../nature/stageLook.ts`), die Banden sind Baumstämme, die Eckpfosten Baumstümpfe. Die Lobby
 * spielt fest in der Goldenen Stunde (`SCENE_MOODS.lobby`), mit Grafikstufen und Automatik wie
 * Brett und Minispiele. Die Physik (Boden, Banden) bleibt unsichtbar und unverändert.
 */
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
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
import type { NatureLook } from '../nature/lighting.ts';
import { createAdaptiveQuality } from '../nature/quality.ts';
import { applyRenderScale, sceneLookSettings } from '../nature/settings.ts';
import { createStageLook } from '../nature/stageLook.ts';
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
} as const;

/** Halme bei Grafikstufe `hoch`: Die Lobby-Insel ist etwas größer als die der Minispiele. */
const LOBBY_GRASS = 34000;

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
  material: PBRMaterial;
  /** Augen und Pupillen (eigene Materialien je Figur). */
  faceMaterials: PBRMaterial[];
  /** Rotes „!“ über dem Kopf, nur sichtbar, solange der Controller getrennt ist (CHAOS-12). */
  marker: TransformNode;
  markerMaterial: PBRMaterial;
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
  // Bis der Himmel steht, scheint der CSS-Verlauf durch; danach deckt der Natur-Look ab.
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.skipPointerMovePicking = true;
  if (testMode) {
    scene.useConstantAnimationDeltaTime = true;
  }

  // Natur-Look: Goldene Stunde (bzw. `?stimmung=`), Grafikstufe wie Brett und Minispiele.
  const settings = sceneLookSettings(testMode, 'lobby', engine.getGlInfo().renderer);
  applyRenderScale(engine, settings);
  const look = createStageLook(scene, settings, { grass: LOBBY_GRASS, seed: 11 });
  const adaptive = createAdaptiveQuality(settings.quality, settings.automatic);
  let lighting: NatureLook | null = null;

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

  const camera = new FreeCamera('kamera', new Vector3(0, 13.5, -13.5), scene);
  camera.setTarget(new Vector3(0, 0, -0.6));
  camera.fov = 0.78;
  camera.inputs.clear(); // feste Kamera, keine Maus-/Tastatursteuerung

  const onResize = (): void => {
    // Erst resize(): Babylon rechnet einen DPR-Wechsel in die Skalierung ein, danach die Grenze.
    engine.resize();
    applyRenderScale(engine, settings, adaptive.level);
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
    lighting = await look.finish(camera);
    if (isDisposed()) {
      throw new Error('Szene wurde während des Aufbaus entsorgt');
    }

    await scene.whenReadyAsync(true);
    if (isDisposed()) {
      throw new Error('Szene wurde während des Aufbaus entsorgt');
    }
    if (testMode) {
      scene.render();
    } else {
      let last = performance.now();
      engine.runRenderLoop(() => {
        const now = performance.now();
        const next = adaptive.frame(now - last);
        last = now;
        if (next) {
          lighting?.setQuality(next);
          applyRenderScale(engine, settings, next);
        }
        scene.render();
      });
    }
  })();

  // Je Bild (auch `stepFrames`): Glühwürmchen und Überblendung in Simulationszeit.
  scene.onBeforeRenderObservable.add(() => {
    look.update(simTime);
  });

  /** Eigenes PBR-Material im Look (gehört der Figur bzw. Szene). */
  function material(hex: string, emissive = 0): PBRMaterial {
    return look.material(hex, { finish: 'lack', emissive }) as PBRMaterial;
  }

  function buildArena(): void {
    const { width, depth, wallHeight, wallThickness } = ARENA;
    const mats = look.materials;
    // Lichtung auf der Insel: frei und eben bis hinter die Banden.
    look.backdrop({
      halfX: width / 2 + wallThickness + 0.4,
      halfZ: depth / 2 + wallThickness + 0.4,
    });

    // Boden: dicke Platte nur für die Physik, sichtbar ist die Wiese.
    const floor = CreateBox('boden', { width, height: 0.5, depth }, scene);
    floor.position.y = -0.25;
    floor.isVisible = false;
    floor.isPickable = false;
    new PhysicsAggregate(
      floor,
      PhysicsShapeType.BOX,
      { mass: 0, friction: 0.6, restitution: 0.2 },
      scene,
    );

    // Banden: unsichtbare Physik-Kästen, sichtbar je ein liegender Baumstamm.
    const walls: [string, number, number, number, number][] = [
      ['bande-nord', 0, depth / 2 + wallThickness / 2, width + 2 * wallThickness, wallThickness],
      ['bande-sued', 0, -depth / 2 - wallThickness / 2, width + 2 * wallThickness, wallThickness],
      ['bande-ost', width / 2 + wallThickness / 2, 0, wallThickness, depth],
      ['bande-west', -width / 2 - wallThickness / 2, 0, wallThickness, depth],
    ];
    const logDiameter = wallHeight * 0.9;
    for (const [name, x, z, w, d] of walls) {
      const wall = CreateBox(name, { width: w, height: wallHeight, depth: d }, scene);
      wall.position.set(x, wallHeight / 2, z);
      wall.isVisible = false;
      wall.isPickable = false;
      new PhysicsAggregate(
        wall,
        PhysicsShapeType.BOX,
        { mass: 0, friction: 0.1, restitution: 0.8 },
        scene,
      );
      const length = Math.max(w, d);
      const log = CreateCylinder(
        `${name}-stamm`,
        { diameter: logDiameter, height: length, tessellation: 18 },
        scene,
      );
      // Zylinder steht entlang y: um z (Nord/Süd) bzw. x (Ost/West) auf die Seite legen.
      if (w > d) log.rotation.z = Math.PI / 2;
      else log.rotation.x = Math.PI / 2;
      log.position.set(x, logDiameter / 2 - 0.02, z);
      log.material = mats.textured('bark_brown_02', {
        u: 1.5,
        v: Math.round(length / 1.4),
        tint: '#b39a84',
        key: `lobby-stamm-${String(Math.round(length))}`,
      });
      log.isPickable = false;
    }

    // Eckpfosten: Baumstümpfe mit Jahresringen obenauf (wie die Baumscheiben-Felder am Brett).
    const bark = mats.textured('bark_brown_02', { u: 1.5, v: 0.6, tint: '#a58c76' });
    const rings = mats.textured('oak_veneer_01', { u: 0.6, tint: '#e8cfae' });
    const stumpHeight = wallHeight + 0.25;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (width / 2 + wallThickness / 2);
        const z = sz * (depth / 2 + wallThickness / 2);
        const stump = CreateCylinder(
          'pfosten',
          { diameterTop: 0.86, diameterBottom: 1.0, height: stumpHeight, tessellation: 20 },
          scene,
        );
        stump.position.set(x, stumpHeight / 2, z);
        stump.material = bark;
        stump.isPickable = false;
        const top = CreateCylinder(
          'pfosten-ringe',
          { diameter: 0.84, height: 0.02, tessellation: 20 },
          scene,
        );
        top.position.set(x, stumpHeight + 0.005, z);
        top.material = rings;
        top.isPickable = false;
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
    const mat = material(player.color);
    root.material = mat;

    // Gesicht: dreht sich in Laufrichtung, unabhängig vom (rotationsgesperrten) Körper.
    const face = new TransformNode(`spieler-${player.slot}-gesicht`, scene);
    face.parent = root;
    const white = material('#ffffff', 0.25);
    const black = material('#1b1530');
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
      look.addCaster(mesh);
      mesh.receiveShadows = true;
      mesh.isPickable = false;
    }

    // Getrennt-Marker (CHAOS-12): ein „!“ in Warnorange schwebt über dem Kopf – vom Sofa aus
    // erkennbar, wer gerade keine Verbindung hat. Kein Schattenwerfer, standardmäßig aus.
    const marker = new TransformNode(`spieler-${player.slot}-getrennt`, scene);
    marker.parent = root;
    marker.position.y = CHARACTER.height / 2 + 1.0;
    const markerMaterial = material('#d55e00', 1);
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
      faceMaterials: [white, black],
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
    mat.albedoColor = color.toLinearSpace();
    // Etwas Eigenleuchten: Slot-Farbe bleibt im warmen Abendlicht klar erkennbar.
    mat.emissiveColor = color.scale(0.08);
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
      look.removeCaster(mesh);
    }
    character.aggregate.dispose();
    character.material.dispose();
    for (const mat of character.faceMaterials) mat.dispose();
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
      // Alle Schritte rechnen (Physik, Animationen), aber nur das letzte Bild zeichnen: wie
      // Brett und Minispiele, auf Software-GPUs kostet jedes Bild des Natur-Looks viel.
      for (let i = 0; i < n - 1; i++) scene.animate();
      if (n > 0) scene.render();
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
        ...(lighting
          ? { quality: `${lighting.quality}${settings.automatic ? ' (auto)' : ''}` }
          : {}),
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
