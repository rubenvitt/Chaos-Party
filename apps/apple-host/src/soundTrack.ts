/**
 * Klänge außerhalb der Brett-Regie (CHAOS-145): Finale und Pause. Wie `board.sounds`
 * (`boardDirection.ts`): Rezepte aus `apps/host/src/fx/sounds.ts` fertig angewandt, mit
 * steigender ID, `SOUND_WINDOW_MS` lang in `renderState`; Swift spielt jede ID einmal.
 */
import { SOUNDS, shapeRecipe, type SoundName } from '../../host/src/fx/sounds.ts';
import { SOUND_WINDOW_MS } from './boardDirection.ts';
import type { SoundCue } from './contract.ts';

export interface SoundTrack {
  /** Klang `name` zum Zeitpunkt `now` (ms) auslösen. */
  play(name: SoundName, now: number): void;
  /** Klänge der letzten `SOUND_WINDOW_MS` vor `now`, älteste zuerst. */
  list(now: number): SoundCue[];
  /** Alles vergessen, IDs wieder ab 1 (neues Finale). */
  reset(): void;
}

export function createSoundTrack(): SoundTrack {
  let nextId = 1;
  let cues: (SoundCue & { readonly at: number })[] = [];
  return {
    play(name, now) {
      // JSON-Kopie: `shapeRecipe` lässt fehlende Felder als `undefined` stehen.
      const voices = JSON.parse(
        JSON.stringify(shapeRecipe(SOUNDS[name].recipe)),
      ) as SoundCue['voices'];
      cues.push({ id: nextId++, name, voices, at: now });
    },
    list(now) {
      cues = cues.filter((cue) => now - cue.at < SOUND_WINDOW_MS);
      return cues.map(({ id, name, voices }) => ({ id, name, voices }));
    },
    reset() {
      nextId = 1;
      cues = [];
    },
  };
}
