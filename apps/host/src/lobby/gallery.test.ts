import { describe, expect, it } from 'vitest';
import { REMOVAL_MIN_VOTES } from '@chaos-party/minigames/gallery';
import { galleryRows, votesText } from './gallery.ts';

describe('Minispiel-Galerie am PC (CHAOS-87)', () => {
  it('zeigt alle Minispiele mit Status, Kategorie, Bedienung und Stimmen', () => {
    const rows = galleryRows([{ id: 'sockenregen', up: 2, down: 1 }]);
    const socken = rows.find((row) => row.id === 'sockenregen');
    expect(socken).toMatchObject({
      status: 'rotation',
      statusLabel: 'Rotation',
      up: 2,
      down: 1,
      suggestRemoval: false,
    });
    expect(socken?.controls).toMatch(/Stick|A:|B:/);
    expect(rows.find((row) => row.id === 'pump-parade')).toMatchObject({
      status: 'spielbar',
      up: 0,
      down: 0,
    });
  });

  it('schlägt nur Spiele der Rotation zum Rauswurf vor', () => {
    const many = [
      { id: 'sockenregen', up: 0, down: REMOVAL_MIN_VOTES },
      { id: 'pump-parade', up: 0, down: REMOVAL_MIN_VOTES },
    ];
    const rows = galleryRows(many);
    expect(rows.find((row) => row.id === 'sockenregen')?.suggestRemoval).toBe(true);
    expect(rows.find((row) => row.id === 'pump-parade')?.suggestRemoval).toBe(false);
  });

  it('beschreibt die Zahl der Stimmen', () => {
    expect(votesText({ up: 0, down: 0 })).toBe('Noch keine Stimmen');
    expect(votesText({ up: 1, down: 0 })).toBe('1 Stimme');
    expect(votesText({ up: 2, down: 1 })).toBe('3 Stimmen');
  });
});
