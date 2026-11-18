/**
 * Headless-Minispiel-Bühne für den Apple-Host (ADR-019 §3): wie `apps/host/src/minigame/stage.ts`,
 * aber mit NullEngine statt Canvas, ohne Rendern, Klang und Look. Swift zeichnet die Körper aus
 * `bodies()` selbst (RealityKit).
 */
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Logger } from '@babylonjs/core/Misc/logger.js';
import { Scene } from '@babylonjs/core/scene.js';
import {
  createMinigameRunner,
  PrepareAborted,
  type CharacterFactory,
  type HavokInstance,
  type MinigameFx,
  type MinigameModule,
  type MinigamePlayer,
  type MinigameRunner,
  type PrepareThrottle,
  type RunnerResult,
} from '@chaos-party/minigame-sdk/babylon';
import type { Body, BodyShape } from './contract.ts';

export interface HeadlessStageOptions {
  readonly module: MinigameModule;
  readonly players: readonly MinigamePlayer[];
  readonly seed: number;
  readonly timeLimitMs: number;
  /** Geladenes Havok (Pflicht für `info.physics`). */
  readonly havok: HavokInstance | null;
  readonly onResult: (result: RunnerResult) => void;
  readonly log: (line: string) => void;
  /**
   * Verteilt den Aufbau auf mehrere `tick` (CHAOS-141). Fehlt er, baut die Bühne am Stück
   * (Tests).
   */
  readonly pacing?: PrepareThrottle;
}

/**
 * So viele ms rechnet der Aufbau einer Bühne höchstens je `tick`, dann geht es im nächsten weiter
 * (CHAOS-141). Klein gegen das Bildbudget von 16,7 ms: Dazu kommen Session, `renderState` und ein
 * Bauschritt, der das Budget überschreitet, bevor `pace` wieder fragt.
 */
export const PREPARE_BUDGET_MS = 2;

export interface HeadlessStage {
  readonly runner: MinigameRunner;
  /** Aufbau fertig (Szene steht, Körper klassifiziert); vorher liefert `bodies()` nichts. */
  readonly ready: boolean;
  /** Spielzeit starten (idempotent; vor Ende von `prepare`: direkt danach). */
  start(): void;
  /** Partie-Pause wie `stage.pause()/resume()` im Browser-Host; idempotent. */
  setPaused(paused: boolean): void;
  /** Echte Zeit vergeht: feste 1/60-Schritte über `runner.advance`. */
  advance(seconds: number): void;
  bodies(): Body[];
  dispose(): void;
}

/** Keine Effekte: Klang und Partikel macht (später) Swift. */
const NO_FX: MinigameFx = {
  sound: () => undefined,
  burst: () => undefined,
  shake: () => undefined,
};

/**
 * Figuren als Kapsel in Spielerfarbe (1,6 hoch, Füße bei y = 0) wie im Headless-Testharness des
 * SDK; dessen Modul ist hier nicht nutzbar (importiert `node:fs`).
 */
const CAPSULE_CHARACTERS: CharacterFactory = {
  create(scene, player) {
    const root = new TransformNode(`figur-${player.slot}`, scene);
    const body = CreateCapsule(`figur-${player.slot}-koerper`, { height: 1.6, radius: 0.4 }, scene);
    body.position.y = 0.8;
    body.parent = root;
    const material = new StandardMaterial(`figur-${player.slot}-material`, scene);
    material.diffuseColor = Color3.FromHexString(player.color);
    body.material = material;
    return {
      root,
      id: player.character,
      play: () => undefined,
      dispose: () => {
        material.dispose();
        body.dispose();
        root.dispose();
      },
    };
  },
};

export function createHeadlessStage(options: HeadlessStageOptions): HeadlessStage {
  Logger.LogLevels = Logger.WarningLogLevel | Logger.ErrorLogLevel;
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const flags = { startRequested: false, paused: false, disposed: false, ready: false };
  const startNow = () => {
    if (flags.ready && runner.state === 'ready') runner.start();
  };
  const runner = createMinigameRunner(options.module, {
    scene,
    players: options.players,
    seed: options.seed,
    timeLimitMs: options.timeLimitMs,
    fx: NO_FX,
    characters: CAPSULE_CHARACTERS,
    havok: options.havok,
    onResult: options.onResult,
    ...(options.pacing ? { pacing: options.pacing } : {}),
  });
  /** Lage je Mesh, gültig solange sich die Weltmatrix nicht ändert (`updateFlag`). */
  const placed = new Map<number, { flag: number; body: Body }>();
  /** Grundform je Mesh; die Eckpunkte zu prüfen kostet, darum einmal und im Aufbau. */
  const shapes = new Map<number, BodyShape>();
  const shapeOf = (mesh: AbstractMesh): BodyShape => {
    let shape = shapes.get(mesh.uniqueId);
    if (shape === undefined) {
      shape = classify(mesh);
      shapes.set(mesh.uniqueId, shape);
    }
    return shape;
  };

  /** Nach `prepare` die Formen aller Meshes vorab bestimmen, ebenfalls verteilt. */
  const classifyAll = async () => {
    const pacing = options.pacing;
    let sliceStartedAt = pacing?.now() ?? 0;
    const disposed = () => flags.disposed;
    for (const mesh of [...scene.meshes]) {
      if (pacing && pacing.now() - sliceStartedAt >= pacing.budgetMs) {
        await pacing.nextFrame();
        sliceStartedAt = pacing.now();
      }
      if (disposed()) return;
      if (!mesh.isDisposed() && mesh.getTotalVertices() > 0) shapeOf(mesh);
    }
  };

  // JSContext verschluckt abgelehnte Promises: Fehler ausdrücklich melden.
  runner
    .prepare()
    .then(classifyAll)
    .then(
      () => {
        if (flags.disposed) return;
        flags.ready = true;
        if (flags.startRequested) startNow();
      },
      (error: unknown) => {
        // Bühne während des Aufbaus entsorgt (Phasenwechsel, Lobby): gewollt, kein Fehler.
        if (error instanceof PrepareAborted) return;
        options.log(
          `Minispiel ${options.module.info.id}: prepare fehlgeschlagen: ${describe(error)}`,
        );
      },
    );

  return {
    runner,
    get ready() {
      return flags.ready;
    },
    start() {
      flags.startRequested = true;
      startNow();
    },
    setPaused(paused) {
      if (paused === flags.paused) return;
      flags.paused = paused;
      if (paused) runner.pause();
      else runner.resume();
    },
    advance(seconds) {
      runner.advance(seconds);
      // Wie ein gerendertes Bild im Browser-Host: neue Render-ID nach den Schritten, sonst liefert
      // `computeWorldMatrix()` die Matrix aus dem ersten Aufruf (je Render-ID höchstens einmal).
      scene.incrementRenderId();
    },
    bodies() {
      // Halb gebaute Szene nicht zeigen: Swift sähe sonst Körper nach und nach auftauchen.
      if (!flags.ready || flags.disposed) return [];
      const out: Body[] = [];
      for (const mesh of scene.meshes) {
        if (!mesh.isEnabled() || !mesh.isVisible || mesh.visibility === 0) continue;
        if (mesh.getTotalVertices() === 0) continue;
        // Ohne `force`: neu gerechnet wird nur, was sich bewegt hat (force kostet ~60 µs je Mesh).
        const flag = mesh.computeWorldMatrix().updateFlag;
        let entry = placed.get(mesh.uniqueId);
        if (entry?.flag !== flag) {
          entry = { flag, body: place(mesh, entry?.body.shape ?? shapeOf(mesh)) };
          placed.set(mesh.uniqueId, entry);
        }
        // Farbe immer frisch: Minispiele färben Meshes um, ohne sie zu bewegen.
        out.push({ ...entry.body, color: colorOf(mesh) });
      }
      return out;
    },
    dispose() {
      if (flags.disposed) return;
      flags.disposed = true;
      try {
        runner.dispose();
      } finally {
        scene.dispose();
        engine.dispose();
      }
    },
  };
}

const scratchScale = new Vector3();
const scratchRotation = new Quaternion();

function place(mesh: AbstractMesh, shape: BodyShape): Body {
  const box = mesh.getBoundingInfo().boundingBox;
  mesh.getWorldMatrix().decompose(scratchScale, scratchRotation);
  const extent = box.extendSize;
  return {
    id: `${mesh.name}#${mesh.uniqueId}`,
    shape,
    pos: [r(box.centerWorld.x), r(box.centerWorld.y), r(box.centerWorld.z)],
    rot: [r(scratchRotation.x), r(scratchRotation.y), r(scratchRotation.z), r(scratchRotation.w)],
    size: [
      r(2 * extent.x * Math.abs(scratchScale.x)),
      r(2 * extent.y * Math.abs(scratchScale.y)),
      r(2 * extent.z * Math.abs(scratchScale.z)),
    ],
    color: colorOf(mesh),
  };
}

function r(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function colorOf(mesh: AbstractMesh): string {
  const material = mesh.material as { diffuseColor?: Color3; albedoColor?: Color3 } | null;
  const color = material?.diffuseColor ?? material?.albedoColor;
  return color ? color.toHexString() : '#CCCCCC';
}

/**
 * Form aus den Eckpunkten (lokal, auf die Bounding-Box normiert): alle auf der Einheitskugel →
 * Kugel; alle innerhalb des Einheitskreises in x/z und viele auf dem Rand → Zylinder (auch
 * Scheibe, Kapsel, Torus); sonst Quader. Babylon-Meshes tragen ihre Grundform nicht mit.
 */
function classify(mesh: AbstractMesh): BodyShape {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions || positions.length < 3) return 'box';
  const { minimum, maximum } = mesh.getBoundingInfo().boundingBox;
  const half = (min: number, max: number) => (max - min) / 2 || 1;
  const hx = half(minimum.x, maximum.x);
  const hy = half(minimum.y, maximum.y);
  const hz = half(minimum.z, maximum.z);
  const eps = 0.08;
  const count = positions.length / 3;
  const stride = Math.max(1, Math.floor(count / 256));
  let sphere = true;
  let insideCircle = true;
  let onRim = 0;
  let sampled = 0;
  for (let i = 0; i < count; i += stride) {
    const x = ((positions[i * 3] ?? 0) - (minimum.x + maximum.x) / 2) / hx;
    const y = ((positions[i * 3 + 1] ?? 0) - (minimum.y + maximum.y) / 2) / hy;
    const z = ((positions[i * 3 + 2] ?? 0) - (minimum.z + maximum.z) / 2) / hz;
    const r2 = Math.hypot(x, z);
    if (Math.abs(Math.hypot(x, y, z) - 1) > eps) sphere = false;
    if (r2 > 1 + eps) insideCircle = false;
    if (Math.abs(r2 - 1) <= eps) onRim++;
    sampled++;
  }
  if (sphere) return 'sphere';
  return insideCircle && onRim >= sampled / 4 ? 'cylinder' : 'box';
}

export function describe(error: unknown): string {
  return error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
}
