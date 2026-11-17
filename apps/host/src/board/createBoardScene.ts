/**
 * Babylon.js-Szene der Brettphase (CHAOS-18/19): Brett prozedural aus der `BoardDefinition`,
 * Spielfiguren, Trophäe, Fallen, Wegweiser, Popups und eine Kamera, die sanft dem aktiven
 * Spieler folgt.
 *
 * Look „Stilisierte Natur“ (CHAOS-62, EXP-009): Insel, Baumscheiben-Felder, Bäume, Teich und
 * Gras aus `./natureBoard.ts`, Licht, Himmel und Nachbearbeitung aus `../nature/lighting.ts`
 * nach der Lichtstimmung (`../lighting/moods.ts`). Lichtverlauf je Runde (CHAOS-63): Die
 * Szene startet in der Stimmung der Runde, lädt die der nächsten Runde vorab und blendet beim
 * Rundenwechsel über (`?stimmung=` setzt eine feste Stimmung).
 * Grafikstufe nach `?qualitaet=` bzw. automatisch nach Bildrate; im Testmodus Stufe `test`.
 *
 * Spielfiguren (CHAOS-28): die GLB-Figuren aus `../characters` (gewählte Figur aus
 * `BoardPlayer.character`, CHAOS-36) auf einem Spielstein-Sockel in Slot-Farbe, darüber das
 * Slot-Symbol.
 * Laufen spielt `run`, Trophäenkauf `cheer`, Münzverlust/Falle/Klau `hit`, Münzgewinn `jump`;
 * im Stand drehen sich die Figuren zur Kamera, beim Hüpfen in Laufrichtung.
 * Windstoß und Platztausch (CHAOS-52) fliegen statt zu hüpfen: Beim Windstoß wirbelt die Figur
 * (`fall`) in Windringen davon, beim Platztausch fliegen beide Figuren (`jump`) gleichzeitig
 * auf Bögen über Kreuz, ein Ring in Slot-Farbe markiert Abflug und Landung.
 * Wegweiser weichen dem Zug-Pfeil über ihrer Gabel aus (`signpostClearOfArrow`).
 *
 * Framework-unabhängig (kein React) wie die Arena (ADR-004): Die Szene liest je Frame den
 * Darstellungszustand aus der Regie (`BoardFrameSource`) und gibt nichts an die UI zurück.
 * Keine Physik – das Brett braucht kein Havok. Deep-Imports statt Barrel.
 */
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { BoardSpace } from '@chaos-party/game-core';
import type { CharacterAnimation } from '@chaos-party/minigame-sdk/babylon';
import { PLAYER_SLOTS, type CharacterId, type SlotNumber } from '@chaos-party/protocol';
import {
  loadCharacters,
  type CharacterLibrary,
  type HostCharacterHandle,
} from '../characters/index.ts';
import { observeFrames, resourceStats } from '../debug/renderProbe.ts';
import {
  LIGHT_MOODS,
  moodForRound,
  moodsForBoardRound,
  type LightMoodId,
} from '../lighting/moods.ts';
import { applyNatureLook, type NatureLook } from '../nature/lighting.ts';
import { NatureMaterials } from '../nature/materials.ts';
import { createAdaptiveQuality, QUALITY, qualityLabel } from '../nature/quality.ts';
import { applyRenderScale, currentLookSettings } from '../nature/settings.ts';
import type { PlayerPosition, RendererInfo } from '../scene/types.ts';
import type { MoveStyle } from './animation.ts';
import type { BoardFrame, FramePawn, FramePopup } from './director.ts';
import {
  approach,
  boardBounds,
  boardCamera,
  cameraFocus,
  easeFlight,
  flightPoint,
  GUST_FLIGHT,
  hopPoint,
  signpostClearOfArrow,
  signpostPosition,
  spreadPawns,
  SWAP_FLIGHT,
  type Point2,
} from './layout.ts';
import { buildNatureBoard, TILE_TOP, type NatureBoardWorld } from './natureBoard.ts';
import type { MessageTone } from './texts.ts';
import type { BoardScene, BoardSceneOptions } from './types.ts';
import { createWebGlEngine, rendererInfo, rendererName } from '../scene/engineFactory.ts';
import { prepareSceneGradually } from '../scene/prepareGradually.ts';

/** Feste Schrittweite im Testmodus (ms). */
const TEST_STEP_MS = 1000 / 60;
/** Größter Zeitschritt je Frame im Normalbetrieb (Tab im Hintergrund o. ä.). */
const MAX_STEP_MS = 100;
/** Bei Software-Rendering (ein Bild dauert 0,5–3 s) bleibt die Regie so in Echtzeit. */
const MAX_STEP_SOFTWARE_MS = 4000;
const FONT = '"Nunito Variable", ui-rounded, system-ui, sans-serif';
const INK = '#1b1530';

/** Höhe der Feldoberfläche (Oberkante der Baumscheiben) über dem Boden. */
const SPACE_TOP = TILE_TOP;

/** Sockel-Radius und Höhe über dem Kopf (Anker für Pfeil, Popups, Getrennt-Marker). */
const PAWN = { radius: 0.5, height: 2.4 } as const;
/** Zug-Pfeil: Größe der Billboard-Fläche, Abstand über dem Kopf und Auf-und-ab. */
const ARROW = { size: 1.5, above: 1.0, bob: 0.15 } as const;
/** Wegweiser: Höhe des Pfahls und der Schild-Mitte, Abstand vom Zielfeld. */
const SIGNPOST = { postHeight: 1.5, signY: 1.75, distance: 1.6 } as const;
/** Umdrehungen der Figur während eines Flugs (Windstoß wirbelt, Tausch dreht sich einmal). */
const FLIGHT_TURNS: Readonly<Record<Exclude<MoveStyle, 'walk'>, number>> = { gust: 2, swap: 1 };
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
/** Höhe der Pfeil-Mitte über dem Boden, wenn die Figur auf einem Feld steht. */
const ARROW_CENTER_Y = SPACE_TOP + PAWN.height + ARROW.above;
const CAMERA_HALF_LIFE_MS = 700;

const TONE_COLORS: Readonly<Record<MessageTone, { bg: string; fg: string }>> = {
  good: { bg: '#d4f5e6', fg: '#00603f' },
  bad: { bg: '#ffe0e0', fg: '#a3161c' },
  gold: { bg: '#ffe58a', fg: '#6b4a00' },
  neutral: { bg: '#ffffff', fg: INK },
};

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
  connected: boolean | null;
  /** Aktuelle Blickrichtung (Drehung um y). */
  yaw: number;
  /** Letzte Weltposition (für Kamera und Testhaken). */
  readonly position: Vector3;
  /** Laufender Flug (Windstoß/Platztausch) oder `null`. */
  flying: MoveStyle | null;
  /** Windringe um die Figur beim Windstoß. */
  readonly swirl: readonly Mesh[];
  readonly swirlMaterial: StandardMaterial;
  /** Ring in Slot-Farbe am Boden: Abflug und Landung beim Platztausch. */
  readonly swapRing: Mesh;
  readonly swapRingMaterial: StandardMaterial;
}

interface Label {
  readonly mesh: Mesh;
  readonly material: StandardMaterial;
  readonly texture: DynamicTexture;
  /** Größe der Fläche in Welt-Einheiten. */
  readonly width: number;
  readonly height: number;
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
  // WebGPU (`?gpu=webgpu`, CHAOS-75) kommt fertig gestartet von außen, sonst WebGL2 wie bisher.
  const engine: AbstractEngine = options.engine ?? createWebGlEngine(canvas, testMode);
  const scene = new Scene(engine);

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

  // Runde beim Aufbau (BoardStage hat die Regie vorher eingeholt): Stimmung dieser Runde,
  // die der nächsten wird vorab geladen (CHAOS-63).
  const startView = source.getFrame().view;
  const startRound =
    startView && startView.rounds > 0 ? { round: startView.round, rounds: startView.rounds } : null;
  const look = currentLookSettings(testMode, board.id, rendererName(engine), startRound);
  /** Stimmung, in die das Brett gerade überblendet bzw. die gilt. */
  let moodTarget: LightMoodId = look.mood.id;
  let moodSynced = false;
  const upcoming =
    look.fixedMood || !startRound
      ? []
      : moodsForBoardRound(startRound.round, startRound.rounds)
          .filter((id) => id !== look.mood.id)
          .map((id) => LIGHT_MOODS[id]);
  applyRenderScale(engine, look);
  // Ohne Umgebungslicht (Sparstufe) spiegelt Metall nichts und würde schwarz.
  const mats = new NatureMaterials(scene, {
    reflections: QUALITY[look.quality].environment,
    detail: QUALITY[look.quality].materialDetail,
  });
  const adaptive = createAdaptiveQuality(look.quality, look.automatic);
  /** Schattenwerfer; das Licht entsteht erst, wenn der Himmel (HDRI) geladen ist. */
  const casters = new Set<AbstractMesh>();
  let lighting: NatureLook | null = null;
  let world: NatureBoardWorld | null = null;
  const addCaster = (mesh: AbstractMesh): void => {
    casters.add(mesh);
    lighting?.addCaster(mesh);
  };
  const removeCaster = (mesh: AbstractMesh): void => {
    casters.delete(mesh);
    lighting?.removeCaster(mesh);
  };
  const pawns = new Map<SlotNumber, Pawn>();
  const trophies = new Map<string, TransformNode>();
  const traps = new Map<string, TransformNode>();
  const popups = new Map<number, Label>();
  /** Popups, auf die eine Figur schon reagiert hat (Animation einmal je Popup). */
  const reacted = new Set<number>();
  let characters: CharacterLibrary | null = null;
  let activeRing: Mesh | undefined;
  let activeArrow: Mesh | undefined;

  const onResize = (): void => {
    // Erst resize(): Babylon rechnet einen DPR-Wechsel in die Skalierung ein, danach die Grenze.
    engine.resize();
    applyRenderScale(engine, look, adaptive.level);
    if (testMode && built) scene.render();
  };
  window.addEventListener('resize', onResize);

  const ready = (async () => {
    await loadFont();
    if (isDisposed()) throw new Error('Brett-Szene wurde vor dem Aufbau entsorgt');
    const builtWorld = buildNatureBoard(scene, board, {
      mats,
      grassTip: look.mood.grassTip,
      glow: look.mood.night?.tileGlow ?? 0,
    });
    world = builtWorld;
    for (const [id, node] of builtWorld.trophies) trophies.set(id, node);
    for (const mesh of builtWorld.casters) casters.add(mesh);
    buildSignposts();
    buildActiveMarker();
    // Figuren vorladen (GLB, einmal je Szene); im Test laufen Animationen in festen Schritten.
    scene.useConstantAnimationDeltaTime = testMode;
    const library = await loadCharacters(scene, { keepPbr: true });
    if (isDisposed()) {
      library.dispose();
      throw new Error('Brett-Szene wurde beim Laden der Figuren entsorgt');
    }
    characters = library;
    const lit = await applyNatureLook(scene, camera, {
      mood: look.mood,
      upcoming,
      quality: look.quality,
      tileGlow: (fraction) => {
        builtWorld.setTileGlow(fraction);
      },
      // Schärfe auf dem Brett, nur Rand und Horizont werden weich (Lesbarkeit zuerst).
      focus: { distance: CAMERA_OFFSET.length(), fStop: 11 },
      viewDistance: CAMERA_OFFSET.length(),
      lanterns: builtWorld.lanterns,
      terrain: builtWorld.terrain,
      grass: builtWorld.grass,
    });
    if (isDisposed()) throw new Error('Brett-Szene wurde beim Laden des Himmels entsorgt');
    lighting = lit;
    for (const mesh of casters) lit.addCaster(mesh);
    built = true;
    update(0);
    // Shader schrittweise (CHAOS-132, KI-25): Nach jedem Minispiel entsteht das Brett neu.
    if (!(await prepareSceneGradually(scene, { isCancelled: isDisposed }))) {
      throw new Error('Brett-Szene wurde während des Aufbaus entsorgt');
    }
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
  /** Größter Zeitschritt der Regie (Software-Rendering: größer, CHAOS-62). */
  const maxStepMs = look.software ? MAX_STEP_SOFTWARE_MS : MAX_STEP_MS;

  function startLoop(): void {
    if (renderPaused) {
      // Nur die Regie weiterlaufen lassen (Stand, HUD), ohne WebGL-Arbeit. Die automatische
      // Grafikstufe misst hier nichts: ohne Rendern sagt die Bildrate nichts über die GPU.
      let last = performance.now();
      const tick = (now: number): void => {
        update(Math.min(maxStepMs, Math.max(0, now - last)));
        last = now;
        directorFrame = requestAnimationFrame(tick);
      };
      directorFrame = requestAnimationFrame(tick);
      return;
    }
    engine.runRenderLoop(() => {
      const dt = engine.getDeltaTime();
      // Lange Lücken (z. B. das erste Bild nach der Pause) verwirft die Automatik selbst.
      const next = adaptive.frame(dt);
      if (next) {
        lighting?.setQuality(next);
        applyRenderScale(engine, look, next);
      }
      update(Math.min(maxStepMs, dt));
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

  /** Lackiertes Spielmaterial (Sockel, Fallen, Marker); `emissive` hält Signalfarben hell. */
  function material(hex: string, emissive = 0.1): Material {
    return mats.plain(hex, { roughness: 0.4, clearCoat: 0.5, glow: emissive * 0.6 });
  }

  function spacePos(id: string): Point2 {
    const space = spaces.get(id);
    return space ? space.position : bounds.center;
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
    const size = { width: width / PX_PER_UNIT, height: height / PX_PER_UNIT };
    const mesh = CreatePlane(name, size, scene);
    mesh.material = mat;
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.isPickable = false;
    mesh.renderingGroupId = 1; // über dem Brett, nicht von Bäumen verdeckt
    return { mesh, material: mat, texture, ...size };
  }

  function disposeLabel(label: Label): void {
    label.mesh.dispose();
    label.material.dispose();
    label.texture.dispose();
  }

  function buildSignposts(): void {
    const wood = mats.textured('bark_brown_02', { u: 0.5, v: 1, tint: '#b39c88' });
    for (const fork of board.spaces) {
      if (fork.next.length < 2) continue;
      for (const targetId of fork.next) {
        const target = spaces.get(targetId);
        if (!target?.label) continue;
        const siblingId = fork.next.find((id) => id !== targetId);
        const sibling = siblingId ? spacePos(siblingId) : null;
        const label = createLabel(`wegweiser-${target.id}`, {
          text: target.label,
          bg: '#fff3d6',
          fg: INK,
          height: 0.62,
          border: '#8a5a3b',
        });
        // Beim Wegwählen steht die Figur am Zug auf der Gabel und die Kamera schaut auf sie:
        // Schild nicht unter ihren Pfeil.
        const p = signpostClearOfArrow(
          signpostPosition(target.position, sibling, SIGNPOST.distance),
          { y: SIGNPOST.signY, halfWidth: label.width / 2, halfHeight: label.height / 2 },
          {
            center: { x: fork.position.x, y: ARROW_CENTER_Y, z: fork.position.z },
            halfWidth: ARROW.size / 2,
            halfHeight: ARROW.size / 2 + ARROW.bob,
          },
          boardCamera(cameraFocus(bounds, fork.position), CAMERA_OFFSET, CAMERA_AIM_Z),
        );
        const post = CreateCylinder(
          'wegweiser-pfahl',
          { diameter: 0.14, height: SIGNPOST.postHeight, tessellation: 8 },
          scene,
        );
        post.position.set(p.x, SIGNPOST.postHeight / 2, p.z);
        post.material = wood;
        post.isPickable = false;
        addCaster(post);
        label.mesh.position.set(p.x, SIGNPOST.signY, p.z);
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
    activeArrow = CreatePlane('am-zug-pfeil', { size: ARROW.size }, scene);
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
    const slotMat = mats.plain(style.color, { roughness: 0.35, clearCoat: 0.6, glow: 0.12 });
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
      addCaster(m);
    }
    addCaster(character.shadowCaster);

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

    // Flug-Effekte (CHAOS-52), nur während Windstoß bzw. Platztausch sichtbar.
    const swirlMaterial = fxMaterial(`figur-${slot}-wind-mat`, '#ffffff');
    const swirl = [
      { diameter: 1.7, y: 0.9, tilt: 0.35 },
      { diameter: 2.2, y: 1.6, tilt: -0.3 },
    ].map(({ diameter, y, tilt }, i) => {
      const ring = CreateTorus(
        `figur-${slot}-wind-${i}`,
        { diameter, thickness: 0.06, tessellation: 32 },
        scene,
      );
      ring.parent = root;
      ring.position.y = y;
      ring.rotation.x = tilt;
      ring.material = swirlMaterial;
      ring.isPickable = false;
      ring.setEnabled(false);
      return ring;
    });
    const swapRingMaterial = fxMaterial(`figur-${slot}-tausch-mat`, style.color);
    const swapRing = CreateTorus(
      `figur-${slot}-tausch`,
      { diameter: 1.5, thickness: 0.16, tessellation: 32 },
      scene,
    );
    swapRing.material = swapRingMaterial;
    swapRing.isPickable = false;
    swapRing.setEnabled(false);

    return {
      slot,
      root,
      character,
      facing,
      symbol,
      marker,
      meshes,
      connected: null,
      yaw: FACE_CAMERA,
      position: new Vector3(),
      flying: null,
      swirl,
      swirlMaterial,
      swapRing,
      swapRingMaterial,
    };
  }

  /** Leuchtendes, halbtransparentes Material für Flug-Effekte (ohne Licht, ohne Schatten). */
  function fxMaterial(name: string, hex: string): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    const color = Color3.FromHexString(hex);
    mat.diffuseColor = color;
    mat.emissiveColor = color;
    mat.disableLighting = true;
    mat.alpha = 0;
    return mat;
  }

  /** Windringe und Tausch-Ring je Frame nach dem Flug-Fortschritt. */
  function syncFlightFx(pawn: Pawn, fp: FramePawn): void {
    const style = fp.hop?.style ?? 'walk';
    const t = fp.hop?.t ?? 0;
    const gust = style === 'gust';
    pawn.swirlMaterial.alpha = gust ? 0.75 * Math.sin(Math.PI * t) : 0;
    pawn.swirl.forEach((ring, i) => {
      if (ring.isEnabled() !== gust) ring.setEnabled(gust);
      if (!gust) return;
      ring.rotation.y = (i === 0 ? 1 : -1) * t * Math.PI * 6;
      ring.scaling.setAll(0.8 + 0.5 * t);
    });
    // Tausch: Ring am Abflugfeld (erste 40 %), dann am Zielfeld (letzte 40 %), je aufgehend.
    const phase =
      style !== 'swap' || !fp.hop
        ? null
        : t < 0.4
          ? { at: fp.hop.from, p: t / 0.4 }
          : t >= 0.6
            ? { at: fp.hop.to, p: (t - 0.6) / 0.4 }
            : null;
    if (pawn.swapRing.isEnabled() !== (phase !== null)) pawn.swapRing.setEnabled(phase !== null);
    if (!phase) return;
    const at = spacePos(phase.at);
    pawn.swapRing.position.set(at.x, SPACE_TOP + 0.06, at.z);
    pawn.swapRing.scaling.setAll(0.7 + 1.6 * phase.p);
    pawn.swapRingMaterial.alpha = 0.9 * (1 - phase.p);
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
      removeCaster(m);
    }
    pawn.character.dispose();
    pawn.swapRing.dispose();
    pawn.swirlMaterial.dispose();
    pawn.swapRingMaterial.dispose();
    pawn.root.dispose(false, false);
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
      if (fp.hop && fp.hop.style !== 'walk') {
        // Windstoß/Platztausch: ein Flug direkt zum Ziel, die Figur dreht sich dabei.
        const style = fp.hop.style;
        const shape = style === 'gust' ? GUST_FLIGHT : SWAP_FLIGHT;
        const from = spacePos(fp.hop.from);
        const to = spacePos(fp.hop.to);
        const p = flightPoint(from, to, fp.hop.t, shape);
        x = p.x;
        y = SPACE_TOP + p.y;
        z = p.z;
        const heading =
          to.x !== from.x || to.z !== from.z ? Math.atan2(to.x - from.x, to.z - from.z) : pawn.yaw;
        const spin = FLIGHT_TURNS[style] * 2 * Math.PI * easeFlight(fp.hop.t, shape.ease);
        pawn.yaw = (heading + spin) % (2 * Math.PI);
        pawn.facing.rotation.y = pawn.yaw;
        pawn.facing.rotation.x = style === 'gust' ? 0.4 : 0;
        if (pawn.flying !== style) {
          pawn.flying = style;
          pawn.character.play(style === 'gust' ? 'fall' : 'jump');
        }
      } else if (fp.hop) {
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
      if (fp.hop?.style === 'walk' || !fp.hop) pawn.flying = null;
      syncFlightFx(pawn, fp);
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
    activeArrow.position.set(
      p.x,
      p.y + PAWN.height + ARROW.above + ARROW.bob * Math.sin(simMs / 180),
      p.z,
    );
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
    const { position, target } = boardCamera(focus, CAMERA_OFFSET, CAMERA_AIM_Z);
    camera.position.set(position.x, position.y, position.z);
    camera.setTarget(new Vector3(target.x, target.y, target.z));
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

  /** Lichtverlauf: Rundenwechsel im übernommenen Stand startet die Überblendung. */
  function syncMood(view: BoardFrame['view']): void {
    if (look.fixedMood || !view || view.rounds <= 0 || !lighting) return;
    const next = moodForRound(view.round, view.rounds);
    // Ohne Stand beim Aufbau: der erste Stand setzt die Stimmung sofort (kein Rundenwechsel).
    const first = !moodSynced && !startRound;
    moodSynced = true;
    if (next === moodTarget) return;
    moodTarget = next;
    lighting.setMood(LIGHT_MOODS[next], first ? 0 : undefined);
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
    syncMood(view);
    lighting?.update(simMs / 1000);
    world?.trees.forEach((tree, i) => {
      tree.rotation.z = 0.035 * Math.sin(simMs / 700 + i * 1.7);
      tree.rotation.x = 0.025 * Math.sin(simMs / 900 + i);
    });
  }

  return {
    ready,
    stepFrames(n) {
      if (!testMode) throw new Error('stepFrames ist nur im Testmodus verfügbar');
      if (!built || disposed) return;
      // Alle Schritte rechnen (Regie, Figuren-Animationen), aber nur das letzte Bild zeichnen:
      // wie `MinigameStage.step` – auf Software-GPUs kostet jedes Bild viel (CHAOS-62).
      for (let i = 0; i < n; i++) {
        update(TEST_STEP_MS);
        if (i < n - 1) scene.animate();
      }
      if (n > 0) scene.render();
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
    getLightMood() {
      if (!lighting) return null;
      const t = lighting.transition;
      return { from: t.from, to: t.to, progress: t.progress };
    },
    getRendererInfo(): RendererInfo {
      return {
        ...rendererInfo(engine),
        ...(lighting ? { quality: qualityLabel(lighting.quality, look.automatic) } : {}),
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
