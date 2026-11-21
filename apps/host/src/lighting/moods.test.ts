import { describe, expect, it } from 'vitest';
import polyhaven from '../lookdev/polyhaven.json' with { type: 'json' };
import {
  CLOCK_SCHEDULE,
  LIGHT_MOOD_IDS,
  LIGHT_MOODS,
  moodForBoard,
  moodForClock,
  moodForRound,
  resolveMood,
  ROUND_ARC,
} from './moods.ts';

describe('Lichtstimmungen als Daten (CHAOS-60)', () => {
  it('jede Stimmung trägt ihre eigene ID und nutzt ein gelistetes CC0-HDRI', () => {
    const hdris = new Set(polyhaven.hdris.map((h) => h.id));
    for (const id of LIGHT_MOOD_IDS) {
      const mood = LIGHT_MOODS[id];
      expect(mood.id).toBe(id);
      expect(hdris.has(mood.sky.hdri), mood.sky.hdri).toBe(true);
      expect(mood.key.minElevation).toBeLessThanOrEqual(mood.key.maxElevation);
      expect(mood.grade.exposure).toBeGreaterThan(0);
    }
  });

  it('dunkle Stimmungen bringen Laternen und leuchtende Felder mit (Lesbarkeit)', () => {
    for (const id of ['daemmerung', 'nacht'] as const) {
      const night = LIGHT_MOODS[id].night;
      expect(night, id).not.toBeNull();
      expect(night?.lanterns).toBeGreaterThan(0);
      expect(night?.tileGlow).toBeGreaterThan(0);
    }
    expect(LIGHT_MOODS.nacht.night?.tileGlow).toBeGreaterThan(
      LIGHT_MOODS.daemmerung.night?.tileGlow ?? 0,
    );
  });

  it('feste Stimmung je Brett, unbekannte Bretter bekommen den Standard', () => {
    expect(moodForBoard('wackelwald')).toBe('abend');
    expect(moodForBoard('gibt-es-nicht')).toBe('abend');
  });

  it('Uhrzeit: der Plan deckt den ganzen Tag ab, Nacht um Mitternacht und spät abends', () => {
    expect(CLOCK_SCHEDULE[0]?.from).toBe(0);
    expect(moodForClock(0)).toBe('nacht');
    expect(moodForClock(5)).toBe('nacht');
    expect(moodForClock(6)).toBe('morgen');
    expect(moodForClock(12)).toBe('mittag');
    expect(moodForClock(17)).toBe('abend');
    expect(moodForClock(20)).toBe('daemmerung');
    expect(moodForClock(22)).toBe('nacht');
    expect(moodForClock(24)).toBe('nacht');
    expect(moodForClock(-1)).toBe('nacht');
    for (let h = 0; h < 24; h++) expect(LIGHT_MOOD_IDS).toContain(moodForClock(h));
  });

  it('Spielverlauf: erste Runde morgens, letzte nachts, nie rückwärts', () => {
    for (const total of [1, 2, 3, 5, 8, 10, 15]) {
      const moods = Array.from({ length: total }, (_, i) => moodForRound(i + 1, total));
      expect(moods.at(-1)).toBe('nacht');
      if (total > 1) expect(moods[0]).toBe('morgen');
      const order = moods.map((m) => ROUND_ARC.indexOf(m));
      for (let i = 1; i < order.length; i++) {
        expect(order[i]).toBeGreaterThanOrEqual(order[i - 1] ?? 0);
      }
    }
    // Standardpartie (5 Runden): jede Stimmung genau einmal.
    expect([1, 2, 3, 4, 5].map((r) => moodForRound(r, 5))).toEqual([...ROUND_ARC]);
    // Außerhalb des Bereichs wird geklemmt.
    expect(moodForRound(0, 5)).toBe('morgen');
    expect(moodForRound(9, 5)).toBe('nacht');
  });

  it('resolveMood wählt je Modus', () => {
    const context = { boardId: 'wackelwald', round: 5, totalRounds: 5, hour: 12 };
    expect(resolveMood('brett', context).id).toBe('abend');
    expect(resolveMood('uhr', context).id).toBe('mittag');
    expect(resolveMood('verlauf', context).id).toBe('nacht');
  });
});

describe('Stimmungsverlauf je Brett (CHAOS-199)', () => {
  it('Rummelplatz: Dämmerung zu Beginn, ab dem ersten Drittel Nacht; Lobby nachts', () => {
    expect(Array.from({ length: 12 }, (_, i) => moodForRound(i + 1, 12, 'rummelplatz'))).toEqual([
      'daemmerung',
      'daemmerung',
      'daemmerung',
      ...Array<string>(9).fill('nacht'),
    ]);
    expect(moodForBoard('rummelplatz')).toBe('nacht');
  });

  it('andere Bretter behalten den Tagesverlauf', () => {
    expect([1, 2, 3, 4, 5].map((r) => moodForRound(r, 5, 'wackelwald'))).toEqual([...ROUND_ARC]);
  });
});
