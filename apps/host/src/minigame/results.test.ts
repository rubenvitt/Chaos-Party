import { MinigameResultMessageSchema, createMessage } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import {
  ABORTED_TEXT,
  joinNames,
  resultPayload,
  resultsDisplay,
  sanitizeHighlights,
} from './results.ts';
import { minigameView } from './testViews.ts';

const INFO = { scoreUnit: 'Pumpstöße' };

describe('resultsDisplay', () => {
  it('Plätze aus dem Server-Stand mit Punkten, Einheit, Münzen und Figur', () => {
    const view = minigameView('minigame-results', {
      placements: [
        { slot: 3, place: 2, score: 4 },
        { slot: 1, place: 1, score: 9 },
        { slot: 2, place: 3, score: 1 },
        { slot: 4, place: 4, score: 0 },
      ],
      highlights: ['Blau pumpt wie wild'],
    });
    const display = resultsDisplay(view, INFO, { 1: 10, 3: 5, 2: 3, 4: 0 });
    expect(display.aborted).toBe(false);
    expect(display.headline).toBe('Blau gewinnt!');
    expect(display.rows.map((row) => row.slot)).toEqual([1, 3, 2, 4]);
    expect(display.rows[0]).toMatchObject({
      place: 1,
      score: 9,
      scoreText: '9 Pumpstöße',
      name: 'Blau',
      character: 'Schraubi',
      coins: 10,
      tied: false,
      symbol: '●',
    });
    expect(display.rows[3]?.coins).toBe(0);
    expect(display.highlights).toEqual(['Blau pumpt wie wild']);
  });

  it('Gleichstand: geteilte Plätze markiert, Überschrift nennt alle Sieger', () => {
    const view = minigameView('minigame-results', {
      placements: [
        { slot: 2, place: 1, score: 5 },
        { slot: 4, place: 1, score: 5 },
        { slot: 1, place: 3, score: 2 },
        { slot: 3, place: 3, score: 2 },
      ],
    });
    const display = resultsDisplay(view, INFO, null);
    expect(display.headline).toBe('Gleichstand: Orange und Rosa!');
    expect(display.rows.map((row) => [row.slot, row.place, row.tied])).toEqual([
      [2, 1, true],
      [4, 1, true],
      [1, 3, true],
      [3, 3, true],
    ]);
    // Münzen unbekannt (z. B. Host nach dem Ergebnis neu geladen) → null statt geraten.
    expect(display.rows.every((row) => row.coins === null)).toBe(true);
  });

  it('Münzen aus view.minigame.rewards (v4, CHAOS-55) gehen den Ereignissen vor', () => {
    const view = minigameView('minigame-results', {
      placements: [
        { slot: 1, place: 1, score: 9 },
        { slot: 2, place: 2, score: 4 },
      ],
      rewards: [{ slot: 1, coins: 10 }],
    });
    // Nach dem Neuladen fehlen die Ereignisse – der Stand reicht.
    const display = resultsDisplay(view, INFO, null);
    expect(display.rows.map((row) => row.coins)).toEqual([10, 0]);
    expect(resultsDisplay(view, INFO, { 1: 99 }).rows[0]?.coins).toBe(10);
  });

  it('Trostpreis (CHAOS-51): Items aus view.minigame.rewards je Zeile, sonst leer', () => {
    const view = minigameView('minigame-results', {
      placements: [
        { slot: 1, place: 1, score: 9 },
        { slot: 2, place: 2, score: 4 },
      ],
      rewards: [
        { slot: 1, coins: 10 },
        { slot: 2, coins: 5, items: ['shield'] },
      ],
    });
    expect(resultsDisplay(view, INFO, null).rows.map((row) => row.items)).toEqual([[], ['shield']]);
  });

  it('alle gleich: „alle auf Platz 1“', () => {
    const view = minigameView(
      'minigame-results',
      {
        placements: [
          { slot: 1, place: 1, score: 0 },
          { slot: 2, place: 1, score: 0 },
        ],
      },
      { players: minigameView('minigame-results').players.slice(0, 2) },
    );
    expect(resultsDisplay(view, INFO, null).headline).toBe('Gleichstand: alle auf Platz 1!');
  });

  it('Abbruch: Hinweis ohne Plätze und Münzen', () => {
    const view = minigameView('minigame-results', { placements: [], aborted: true });
    const display = resultsDisplay(view, INFO, { 1: 10 });
    expect(display).toEqual({ aborted: true, headline: ABORTED_TEXT, rows: [], highlights: [] });
    expect(ABORTED_TEXT).toBe('Minispiel abgebrochen – keine Münzen');
  });

  it('joinNames', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A und B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B und C');
  });
});

describe('resultPayload / sanitizeHighlights', () => {
  it('baut eine protokollgültige minigame-result-Nachricht', () => {
    const payload = resultPayload(
      {
        minigameId: 'pump-parade',
        placements: [
          { slot: 1, place: 1, score: 3 },
          { slot: 2, place: 2, score: 1 },
        ],
        highlights: ['  Blau gewinnt knapp  ', '', 'x'.repeat(80), 'a\u0007b', 'Fünf', 'Sechs'],
      },
      4,
    );
    expect(payload.round).toBe(4);
    expect(payload.highlights).toEqual(['Blau gewinnt knapp', 'x'.repeat(64), 'ab', 'Fünf']);
    const parsed = MinigameResultMessageSchema.safeParse(createMessage('minigame-result', payload));
    expect(parsed.success).toBe(true);
  });

  it('lässt highlights weg, wenn keine übrig bleiben', () => {
    const payload = resultPayload(
      { minigameId: 'pump-parade', placements: [{ slot: 1, place: 1, score: 0 }] },
      1,
    );
    expect(payload).toEqual({
      minigameId: 'pump-parade',
      round: 1,
      placements: [{ slot: 1, place: 1, score: 0 }],
    });
    expect(sanitizeHighlights(['   ', '‮'])).toEqual([]);
  });
});
