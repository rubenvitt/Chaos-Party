/**
 * Kamera-Vorlagen: Draufsicht, schräg von vorn (wie Sockenregen), Seite, Verfolger und fest.
 * Abstand und Ziel richten sich nach dem Grundriss. Der Verfolger rückt weich zur Mitte der
 * übergebenen Punkte (Figuren) und zoomt mit ihrem Abstand; die anderen stehen still.
 * Kamerawackeln kommt weiter von der Laufzeit (`ctx.fx.shake`).
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { ArenaLayout } from '../arena.ts';
import type { Point } from '../geometry.ts';
import type { Kamera } from '../steckbrief.ts';
import type { MinigameStage } from './stage.ts';

export interface CameraPreset {
  /** Neigung von oben (0 = senkrecht von oben, π/2 = waagrecht). */
  readonly beta: number;
  /** Abstand als Vielfaches der größten halben Arena-Ausdehnung. */
  readonly distance: number;
  /** Blickpunkt-Höhe. */
  readonly targetY: number;
  /** Blickpunkt nach hinten (+z) verschoben, als Anteil der halben Tiefe. */
  readonly targetZ: number;
}

export const CAMERA_PRESETS: Readonly<Record<Exclude<Kamera, 'fest'>, CameraPreset>> = {
  draufsicht: { beta: 0.28, distance: 2.9, targetY: 0, targetZ: 0 },
  schraeg: { beta: 0.92, distance: 2.6, targetY: 1.1, targetZ: 0.2 },
  seite: { beta: 1.32, distance: 2.4, targetY: 1.2, targetZ: 0 },
  verfolger: { beta: 1.0, distance: 1.7, targetY: 1, targetZ: 0 },
};

export interface CameraOptions {
  /** Nur bei `fest`: Kameraposition und Blickpunkt. */
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
  readonly target?: { readonly x: number; readonly y: number; readonly z: number };
  /** Seitenansicht von links statt von vorn (Blick entlang +x). */
  readonly fromSide?: boolean;
}

export interface KitCamera {
  readonly camera: ArcRotateCamera;
  readonly kind: Kamera;
  /** Verfolger: rückt zu den Punkten; sonst ohne Wirkung. Im Testmodus springt er sofort. */
  follow(points: readonly Point[], dt: number): void;
}

/** Legt die Kamera an, setzt sie aktiv und gibt sie der Bühne zum Entsorgen. */
export function createCamera(
  stage: MinigameStage,
  kind: Kamera,
  layout: ArenaLayout,
  options: CameraOptions = {},
): KitCamera {
  const size = Math.max(layout.area.halfX, layout.area.halfZ, 1);
  const surface = layout.surfaceY;
  let camera: ArcRotateCamera;
  if (kind === 'fest') {
    const position = options.position ?? { x: 0, y: size * 1.4, z: -size * 2 };
    const target = options.target ?? { x: 0, y: surface, z: 0 };
    camera = new ArcRotateCamera(
      stage.name('kamera'),
      -Math.PI / 2,
      1,
      10,
      new Vector3(target.x, target.y, target.z),
      stage.scene,
    );
    camera.setPosition(new Vector3(position.x, position.y, position.z));
  } else {
    const preset = CAMERA_PRESETS[kind];
    const alpha = kind === 'seite' && options.fromSide ? Math.PI : -Math.PI / 2;
    camera = new ArcRotateCamera(
      stage.name('kamera'),
      alpha,
      preset.beta,
      size * preset.distance,
      new Vector3(0, surface + preset.targetY, layout.area.halfZ * preset.targetZ),
      stage.scene,
    );
  }
  camera.fov = 0.72;
  stage.scene.activeCamera = camera;
  stage.track(camera);
  const baseRadius = camera.radius;
  const instant = stage.ctx.testMode;
  return {
    camera,
    kind,
    follow(points, dt) {
      if (kind !== 'verfolger' || points.length === 0) return;
      let cx = 0;
      let cz = 0;
      for (const point of points) {
        cx += point.x;
        cz += point.z;
      }
      cx /= points.length;
      cz /= points.length;
      let spread = 0;
      for (const point of points) spread = Math.max(spread, Math.hypot(point.x - cx, point.z - cz));
      const radius = Math.max(
        baseRadius * 0.7,
        Math.min(baseRadius * 1.6, baseRadius * 0.6 + spread * 1.6),
      );
      const blend = instant ? 1 : Math.min(1, dt * 3);
      const target = camera.target;
      target.x += (cx - target.x) * blend;
      target.z += (cz - target.z) * blend;
      camera.radius += (radius - camera.radius) * blend;
    },
  };
}
