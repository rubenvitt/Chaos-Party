/**
 * Kurzes Kamerawackeln (CHAOS-33). Der Versatz gilt nur für das Rendern: vor jedem Bild auf
 * die aktive Kamera addiert, danach wieder abgezogen – Spiellogik und Kamerafahrten der
 * Minispiele sehen nie eine verschobene Kamera. Reine Optik, nie spielrelevant.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Observer } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene.js';

/** Dauer eines Wacklers (ms). */
export const SHAKE_MS = 380;
/** Größter Versatz in Welteinheiten bei Stärke 1. */
export const SHAKE_AMPLITUDE = 0.35;

/** Versatz-Betrag zum Zeitpunkt `t` (ms seit Beginn): linear abklingend, nach `SHAKE_MS` 0. */
export function shakeMagnitude(strength: number, elapsedMs: number): number {
  const s = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 0));
  if (elapsedMs < 0 || elapsedMs >= SHAKE_MS) return 0;
  return s * SHAKE_AMPLITUDE * (1 - elapsedMs / SHAKE_MS);
}

export interface CameraShake {
  shake(strength: number): void;
  dispose(): void;
}

interface ShakeTarget {
  readonly vector: Vector3;
}

/** ArcRotate-/Ziel-Kameras: Ziel verschieben (Position wird daraus berechnet), sonst Position. */
function targetOf(scene: Scene): ShakeTarget | null {
  const camera = scene.activeCamera;
  if (!camera) return null;
  const withTarget = camera as unknown as { target?: unknown };
  if (camera.getClassName() === 'ArcRotateCamera' && withTarget.target instanceof Vector3) {
    return { vector: withTarget.target };
  }
  return { vector: camera.position };
}

export function createCameraShake(
  scene: Scene,
  now: () => number = () => performance.now(),
): CameraShake {
  let startedAt = 0;
  let strength = 0;
  let applied: { target: ShakeTarget; offset: Vector3 } | null = null;

  const before: Observer<Scene> | null = scene.onBeforeRenderObservable.add(() => {
    if (strength <= 0) return;
    const magnitude = shakeMagnitude(strength, now() - startedAt);
    if (magnitude <= 0) {
      strength = 0;
      return;
    }
    const target = targetOf(scene);
    if (!target) return;
    // Zufall ist hier nur Optik (kein Spielzustand).
    const offset = new Vector3(
      (Math.random() * 2 - 1) * magnitude,
      (Math.random() * 2 - 1) * magnitude * 0.6,
      (Math.random() * 2 - 1) * magnitude,
    );
    target.vector.addInPlace(offset);
    applied = { target, offset };
  });
  const after: Observer<Scene> | null = scene.onAfterRenderObservable.add(() => {
    if (!applied) return;
    applied.target.vector.subtractInPlace(applied.offset);
    applied = null;
  });

  return {
    shake(value) {
      const next = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
      const current = shakeMagnitude(strength, now() - startedAt) / SHAKE_AMPLITUDE;
      if (next <= current) return;
      strength = next;
      startedAt = now();
    },
    dispose() {
      if (applied) {
        applied.target.vector.subtractInPlace(applied.offset);
        applied = null;
      }
      scene.onBeforeRenderObservable.remove(before);
      scene.onAfterRenderObservable.remove(after);
      strength = 0;
    },
  };
}
