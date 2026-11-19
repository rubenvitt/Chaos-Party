import { describe, expect, it } from 'vitest';
import { LIGHT_MOODS } from '../../host/src/lighting/moods.ts';
import { MOOD_TRANSITION_MS } from '../../host/src/lighting/transition.ts';
import { LightSchema } from '../src/contract.ts';
import { createBoardLight, minigameLight, moodLight, rgbHex } from '../src/lightMood.ts';

const STEP = 1000 / 60;

describe('Lichtstimmung im Kern (CHAOS-193)', () => {
  it('Minispiele erben die Stimmung ihrer Runde, ohne Überblendung', () => {
    const first = minigameLight(1, 10);
    expect(first.mood).toBe('morgen');
    expect(first.environment.mood).toBe('morgen');
    expect(first.lampsOn).toBe(0);
    const last = minigameLight(10, 10);
    expect(last.mood).toBe('nacht');
    expect(last.lampsOn).toBe(1);
    expect(last.keyTint).toBe(LIGHT_MOODS.nacht.key.tint);
    expect(last.haze).toBe(LIGHT_MOODS.nacht.haze.color);
    expect(last.grassTip).toBe(LIGHT_MOODS.nacht.grassTip);
    expect(LightSchema.parse(last)).toEqual(last);
  });

  it('jede Stimmung erfüllt das Schema und behält ihre Farben', () => {
    for (const mood of Object.values(LIGHT_MOODS)) {
      const light = LightSchema.parse(moodLight(mood.id));
      expect(light.fillSky).toBe(mood.fill.sky);
      expect(light.environment).toEqual({
        mood: mood.id,
        sky: mood.fill.sky,
        ground: mood.fill.ground,
        skyIntensity: mood.sky.intensity,
        fillIntensity: mood.fill.intensity,
      });
      expect(light.exposure).toBeCloseTo(mood.grade.exposure, 4);
    }
  });

  it('Brett: erster Stand sofort, Rundenwechsel über 4 s, im Minispiel steht die Überblendung', () => {
    const light = createBoardLight();
    light.advance(STEP, { round: 1, rounds: 10 }, true);
    expect(light.current({ round: 1, rounds: 10 }).mood).toBe('morgen');
    // Runde 3 von 10: Mittag. Zur Hälfte wechselt die Umgebung.
    light.advance(1000, { round: 3, rounds: 10 }, true);
    const early = light.current({ round: 3, rounds: 10 });
    expect(early.mood).toBe('mittag');
    expect(early.environment.mood).toBe('morgen');
    expect(early.keyIntensity).toBeGreaterThan(LIGHT_MOODS.morgen.key.intensity);
    expect(early.keyIntensity).toBeLessThan(LIGHT_MOODS.mittag.key.intensity);
    // Minispiel: kein Fortschritt.
    light.advance(5000, { round: 3, rounds: 10 }, false);
    expect(light.current({ round: 3, rounds: 10 })).toEqual(early);
    for (let t = 0; t < MOOD_TRANSITION_MS; t += STEP) {
      light.advance(STEP, { round: 3, rounds: 10 }, true);
    }
    const done = light.current({ round: 3, rounds: 10 });
    expect(done).toEqual(moodLight('mittag'));
    expect(LightSchema.parse(done)).toEqual(done);
  });

  it('ohne Stand: Stimmung der Runde aus dem Ersatzwert', () => {
    expect(createBoardLight().current({ round: 10, rounds: 10 }).mood).toBe('nacht');
  });

  it('Farben als #rrggbb, begrenzt', () => {
    expect(rgbHex([1, 0.5, 0])).toBe('#ff8000');
    expect(rgbHex([2, -1, 0.0039])).toBe('#ff0001');
  });
});
