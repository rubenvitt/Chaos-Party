import { describe, expect, it } from 'vitest';
import { LIGHT_MOODS, moodForRound, moodsForBoardRound, ROUND_ARC, SCENE_MOODS } from './moods.ts';
import {
  createMoodTransition,
  easeInOut,
  hexToRgb,
  lightStateOf,
  mixLightStates,
  MOOD_TRANSITION_MS,
} from './transition.ts';

/** Partie wie das Brett sie erlebt: je Runde Aufbau, dann Rundenwechsel mit Überblendung. */
function playGame(rounds: number, frameMs = 1000 / 60) {
  const t = createMoodTransition(moodForRound(1, rounds));
  const seen = [t.current.to];
  const mixes: number[] = [];
  for (let round = 2; round <= rounds; round++) {
    t.setTarget(moodForRound(round, rounds));
    // Überblendung Bild für Bild bis zum Ende (plus ein paar Bilder Ruhe).
    for (let ms = 0; ms < MOOD_TRANSITION_MS + 200; ms += frameMs) {
      mixes.push(t.advance(frameMs).mix);
    }
    seen.push(t.current.to);
  }
  return { transition: t, seen, mixes };
}

describe('Lichtverlauf je Runde (CHAOS-63)', () => {
  it('5 Runden: Morgen, Mittag, Goldene Stunde, Dämmerung, Nacht', () => {
    const { seen, transition } = playGame(5);
    expect(seen).toEqual(['morgen', 'mittag', 'abend', 'daemmerung', 'nacht']);
    expect(transition.active).toBe(false);
    expect(transition.current.state).toEqual(lightStateOf(LIGHT_MOODS.nacht));
  });

  it('mehr Runden: nie rückwärts, letzte Runde nachts', () => {
    for (const rounds of [6, 7, 8, 10, 12, 15]) {
      const { seen } = playGame(rounds);
      const order = seen.map((id) => ROUND_ARC.indexOf(id));
      for (let i = 1; i < order.length; i++) {
        expect(order[i]).toBeGreaterThanOrEqual(order[i - 1] ?? 0);
      }
      expect(seen.at(-1)).toBe('nacht');
    }
  });

  it('Überblendung ist deterministisch und stetig', () => {
    const a = playGame(5);
    const b = playGame(5);
    expect(a.mixes).toEqual(b.mixes);
    // Kein Sprung größer als ein Bild bei voller Steigung von smoothstep (1,5 / Dauer je ms).
    const maxStep = (1.5 * (1000 / 60)) / MOOD_TRANSITION_MS + 1e-9;
    for (let i = 1; i < a.mixes.length; i++) {
      const prev = a.mixes[i - 1] ?? 0;
      const cur = a.mixes[i] ?? 0;
      // Neuer Übergang beginnt wieder bei 0; innerhalb eines Übergangs steigt der Anteil.
      if (cur < prev) {
        expect(cur).toBeLessThanOrEqual(maxStep);
        continue;
      }
      expect(cur - prev).toBeLessThanOrEqual(maxStep);
    }
  });

  it('Zwischenstand liegt zwischen den Stimmungen, Mitte ist das Mittel', () => {
    const t = createMoodTransition('abend');
    t.setTarget('daemmerung', 1000);
    const half = t.advance(500);
    expect(half.progress).toBe(0.5);
    expect(half.mix).toBe(0.5);
    const a = lightStateOf(LIGHT_MOODS.abend);
    const b = lightStateOf(LIGHT_MOODS.daemmerung);
    expect(half.state.keyIntensity).toBeCloseTo((a.keyIntensity + b.keyIntensity) / 2);
    expect(half.state.exposure).toBeCloseTo((a.exposure + b.exposure) / 2);
    expect(half.state.lampsOn).toBeCloseTo(0.5);
    // Laternen-Reichweite und -Farbe wachsen nicht mit: die der Nacht-Seite.
    expect(half.state.lanternRange).toBe(b.lanternRange);
    expect(t.advance(500).state).toEqual(b);
  });

  it('Nachtlichter nur in Dämmerung und Nacht', () => {
    for (const id of ['morgen', 'mittag', 'wolken', 'abend'] as const) {
      const s = lightStateOf(LIGHT_MOODS[id]);
      expect(s.lampsOn).toBe(0);
      expect(s.lanternIntensity).toBe(0);
      expect(s.fireflies).toBe(0);
      expect(s.tileGlow).toBe(0);
    }
    const dusk = lightStateOf(LIGHT_MOODS.daemmerung);
    const night = lightStateOf(LIGHT_MOODS.nacht);
    expect(dusk.lampsOn).toBe(1);
    expect(night.nightness).toBe(1);
    expect(dusk.nightness).toBeGreaterThan(0);
    expect(dusk.nightness).toBeLessThan(1);
    expect(night.fireflies).toBe(1);
  });

  it('gleiches Ziel ändert nichts, sofort ohne Dauer, neues Ziel beendet laufenden Übergang', () => {
    const t = createMoodTransition('morgen');
    t.setTarget('morgen');
    expect(t.active).toBe(false);
    t.setTarget('mittag', 0);
    expect(t.active).toBe(false);
    expect(t.current).toMatchObject({ from: 'mittag', to: 'mittag', mix: 1 });
    t.setTarget('abend', 1000);
    t.advance(300);
    t.setTarget('nacht', 1000);
    expect(t.current.from).toBe('abend');
    expect(t.current.to).toBe('nacht');
    expect(t.current.progress).toBe(0);
  });

  it('Brett lädt die Stimmung der Runde und der nächsten vorab', () => {
    expect(moodsForBoardRound(1, 5)).toEqual(['morgen', 'mittag']);
    expect(moodsForBoardRound(4, 5)).toEqual(['daemmerung', 'nacht']);
    expect(moodsForBoardRound(5, 5)).toEqual(['nacht']);
    // Runde 0 (vor dem ersten Rundenstart) → morgens, Runde 1 kommt gleich.
    expect(moodsForBoardRound(0, 5)).toEqual(['morgen']);
    // 10 Runden: manche Runden teilen die Stimmung.
    expect(moodsForBoardRound(1, 10)).toEqual(['morgen']);
  });

  it('feste Stimmungen: Lobby Goldene Stunde, Siegerehrung Nacht', () => {
    expect(SCENE_MOODS.lobby).toBe('abend');
    expect(SCENE_MOODS.finale).toBe('nacht');
  });

  it('Hilfen: Ease, Hexfarben, Mischung an den Rändern', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(2)).toBe(1);
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(() => hexToRgb('#abc')).toThrow();
    const a = lightStateOf(LIGHT_MOODS.morgen);
    const b = lightStateOf(LIGHT_MOODS.nacht);
    // Laternen-Reichweite stammt immer von der Nacht-Seite (das Licht wächst nicht, es blendet).
    expect(mixLightStates(a, b, 0)).toEqual({ ...a, lanternRange: b.lanternRange });
    expect(mixLightStates(a, b, -1)).toEqual({ ...a, lanternRange: b.lanternRange });
    expect(mixLightStates(a, b, 1).keyTint).toEqual(b.keyTint);
  });
});
