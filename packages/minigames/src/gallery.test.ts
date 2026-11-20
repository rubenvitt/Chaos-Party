import { describe, expect, it } from 'vitest';
import { MINIGAME_INFOS, ROTATION } from './catalog.ts';
import {
  describeControls,
  galleryEntries,
  REMOVAL_DOWN_SHARE,
  REMOVAL_MIN_VOTES,
  suggestsRemoval,
} from './gallery.ts';

describe('Minispiel-Galerie (CHAOS-87)', () => {
  it('listet jedes Minispiel genau einmal, die Rotation zuerst', () => {
    const entries = galleryEntries();
    expect(entries.map((entry) => entry.info.id).sort()).toEqual(
      MINIGAME_INFOS.map((info) => info.id).sort(),
    );
    const firstOther = entries.findIndex((entry) => entry.status !== 'rotation');
    const rotationCount = entries.filter((entry) => entry.status === 'rotation').length;
    expect(rotationCount).toBe(ROTATION.length);
    expect(firstOther === -1 ? entries.length : firstOther).toBe(rotationCount);
    // Die Pump-Parade ist Referenz und Rückfall, nicht in der Rotation.
    expect(entries.find((entry) => entry.info.id === 'pump-parade')?.status).toBe('spielbar');
  });

  it('beschreibt die Bedienung in Worten', () => {
    expect(describeControls({ joystick: 'Laufen', a: 'Springen', b: null })).toBe(
      'Stick: Laufen · A: Springen',
    );
    expect(describeControls({ joystick: null, a: null, b: null })).toBe('ohne Eingabe');
  });

  it('schlägt den Rauswurf erst ab genug Stimmen und überwiegend Daumen runter vor', () => {
    const downAtThreshold = Math.ceil(REMOVAL_MIN_VOTES * REMOVAL_DOWN_SHARE);
    expect(
      suggestsRemoval({ up: REMOVAL_MIN_VOTES - downAtThreshold, down: downAtThreshold }),
    ).toBe(true);
    expect(suggestsRemoval({ up: 0, down: REMOVAL_MIN_VOTES - 1 })).toBe(false);
    expect(suggestsRemoval({ up: REMOVAL_MIN_VOTES, down: REMOVAL_MIN_VOTES })).toBe(false);
    expect(suggestsRemoval({ up: 0, down: 0 })).toBe(false);
  });
});
