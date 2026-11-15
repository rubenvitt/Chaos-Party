import { SOUND_IDS } from '@chaos-party/minigame-sdk/babylon';
import { describe, expect, it } from 'vitest';
import {
  ALL_SOUND_NAMES,
  BOARD_SOUND_IDS,
  recipeDuration,
  shapeRecipe,
  SOUNDS,
  type SoundName,
} from './sounds.ts';

describe('prozedurale Klänge', () => {
  it('jede Klang-ID des Minispiel-Vertrags und des Bretts hat ein Rezept mit Beschreibung', () => {
    for (const id of [...SOUND_IDS, ...BOARD_SOUND_IDS]) {
      expect(SOUNDS[id].recipe.length, id).toBeGreaterThan(0);
      expect(SOUNDS[id].description.length, id).toBeGreaterThan(5);
    }
    expect(Object.keys(SOUNDS).sort()).toEqual([...ALL_SOUND_NAMES].sort());
  });

  it('kurz, nicht zu laut und nicht schrill', () => {
    for (const name of ALL_SOUND_NAMES) {
      const { recipe } = SOUNDS[name];
      expect(recipeDuration(recipe), name).toBeLessThanOrEqual(1.2);
      for (const voice of recipe) {
        expect(voice.gain, name).toBeGreaterThan(0);
        expect(voice.gain, name).toBeLessThanOrEqual(0.45);
        expect(voice.attack, name).toBeGreaterThan(0);
        expect(voice.attack, name).toBeLessThan(voice.duration);
        if (voice.wave !== 'noise') {
          expect(voice.freq, name).toBeLessThanOrEqual(2100);
          expect(voice.freqEnd ?? voice.freq, name).toBeLessThanOrEqual(2100);
          expect(voice.freq, name).toBeGreaterThanOrEqual(40);
        }
        // Harte Wellenformen nur leise.
        if (voice.wave === 'square' || voice.wave === 'sawtooth') {
          expect(voice.gain, name).toBeLessThanOrEqual(0.15);
        }
      }
      // Summe aller Stimmen bleibt im Rahmen (Kompressor fängt den Rest).
      const total = recipe.reduce((sum, voice) => sum + voice.gain, 0);
      expect(total, name).toBeLessThanOrEqual(1.5);
    }
  });

  it('shapeRecipe skaliert Lautstärke und Tonhöhe begrenzt', () => {
    const base = SOUNDS.coin.recipe;
    const shaped = shapeRecipe(base, { volume: 0.5, pitch: 2 });
    expect(shaped[0]?.gain).toBeCloseTo((base[0]?.gain ?? 0) * 0.5);
    expect(shaped[0]?.freq).toBeCloseTo((base[0]?.freq ?? 0) * 2);
    const clamped = shapeRecipe(base, { volume: 10, pitch: 100 });
    expect(clamped[0]?.gain).toBeCloseTo((base[0]?.gain ?? 0) * 2);
    expect(clamped[0]?.freq).toBeCloseTo((base[0]?.freq ?? 0) * 4);
    const nonsense = shapeRecipe(base, { volume: Number.NaN, pitch: Number.POSITIVE_INFINITY });
    expect(nonsense).toEqual(base.map((voice) => ({ ...voice })));
  });

  it('recipeDuration berücksichtigt Verzögerungen', () => {
    const name: SoundName = 'win';
    expect(recipeDuration(SOUNDS[name].recipe)).toBeCloseTo(0.85);
    expect(recipeDuration([])).toBe(0);
  });
});
