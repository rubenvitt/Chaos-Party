/**
 * `MinigameFx` des Hosts (CHAOS-33, Vertrag aus `@chaos-party/minigame-sdk/babylon`):
 * prozedurale Klänge, Partikel-Ausbrüche und Kamerawackeln für **eine** Minispiel-Szene.
 *
 * Testmodus: Klänge und Effekte werden nur gezählt (`stats`), nichts erscheint in der Szene –
 * Screenshots bleiben stabil, und Effekte sind ohnehin nie spielrelevant.
 */
import type { Scene } from '@babylonjs/core/scene.js';
import type { MinigameFx } from '@chaos-party/minigame-sdk/babylon';
import type { SoundEngine } from './audio.ts';
import { createParticleFx, type ParticleFx } from './particles.ts';
import { createCameraShake, type CameraShake } from './shake.ts';

export interface FxStats {
  readonly sounds: number;
  readonly bursts: number;
  readonly shakes: number;
}

export interface HostMinigameFx extends MinigameFx {
  readonly stats: FxStats;
  dispose(): void;
}

export function createMinigameFx(
  scene: Scene,
  options: { readonly sound: SoundEngine; readonly testMode: boolean },
): HostMinigameFx {
  const { sound, testMode } = options;
  const particles: ParticleFx | null = testMode ? null : createParticleFx(scene);
  const camera: CameraShake | null = testMode ? null : createCameraShake(scene);
  const stats = { sounds: 0, bursts: 0, shakes: 0 };
  let disposed = false;

  return {
    sound(id, playOptions) {
      if (disposed) return;
      stats.sounds++;
      if (!testMode) sound.play(id, playOptions);
    },
    burst(id, at, color) {
      if (disposed) return;
      stats.bursts++;
      particles?.burst(id, at, color);
    },
    shake(strength) {
      if (disposed) return;
      stats.shakes++;
      camera?.shake(strength);
    },
    get stats() {
      return { ...stats };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      particles?.dispose();
      camera?.dispose();
    },
  };
}
