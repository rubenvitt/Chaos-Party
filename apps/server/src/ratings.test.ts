import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REMOVAL_MIN_VOTES } from '@chaos-party/minigames/gallery';
import {
  createMemoryRatingStore,
  ratingsExport,
  summarizeRatings,
  type RatingVote,
} from './ratings.ts';
import { createFileRatingStore } from './ratingsFile.ts';

const vote = (overrides: Partial<RatingVote> = {}): RatingVote => ({
  play: 'p1',
  slot: 1,
  minigameId: 'sockenregen',
  vote: 'up',
  practice: false,
  ...overrides,
});

const dirs: string[] = [];
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-stimmen-'));
  dirs.push(dir);
  return join(dir, 'unter', 'stimmen.json');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Daumen-Stimmen (CHAOS-87)', () => {
  it('ersetzt die Stimme desselben Slots im selben Lauf und zählt je Minispiel', () => {
    const store = createMemoryRatingStore([], { clock: () => new Date('2026-11-20T12:00:00Z') });
    store.record(vote());
    store.record(vote({ slot: 2, vote: 'down' }));
    store.record(vote({ vote: 'down' }));
    store.record(vote({ play: 'p2', minigameId: 'wackelturm' }));
    expect(store.votes()).toHaveLength(3);
    expect(store.votes()[0]?.at).toBe('2026-11-20T12:00:00.000Z');
    expect(summarizeRatings(store.votes())).toEqual([
      { id: 'sockenregen', up: 0, down: 2 },
      { id: 'wackelturm', up: 1, down: 0 },
    ]);
  });

  it('exportiert alle Katalog-Spiele mit Status, Zählung und Rauswurf-Vorschlag', () => {
    const votes = [
      ...Array.from({ length: REMOVAL_MIN_VOTES }, (_, i) => ({
        ...vote({ play: `p${String(i)}`, vote: 'down' }),
        at: 'x',
      })),
      { ...vote({ minigameId: 'alt-und-weg' }), at: 'x' },
    ];
    const data = ratingsExport(votes, new Date('2026-11-20T00:00:00Z'));
    expect(data.exportedAt).toBe('2026-11-20T00:00:00.000Z');
    expect(data.games.find((game) => game.id === 'sockenregen')).toMatchObject({
      status: 'rotation',
      down: REMOVAL_MIN_VOTES,
      suggestRemoval: true,
    });
    expect(data.games.find((game) => game.id === 'pump-parade')).toMatchObject({
      status: 'spielbar',
      up: 0,
      down: 0,
      suggestRemoval: false,
    });
    expect(data.games.find((game) => game.id === 'alt-und-weg')).toMatchObject({
      status: null,
      up: 1,
    });
    expect(data.votes).toHaveLength(votes.length);
  });

  it('speichert in eine Datei und liest sie beim nächsten Start wieder', () => {
    const path = tempFile();
    const first = createFileRatingStore(path);
    first.record(vote());
    first.record(vote({ slot: 3, vote: 'down', practice: true }));
    const again = createFileRatingStore(path);
    expect(again.votes()).toEqual(first.votes());
    const file = JSON.parse(readFileSync(path, 'utf8')) as { version: number };
    expect(file.version).toBe(1);
  });

  it('legt eine kaputte Datei beiseite statt sie zu überschreiben', () => {
    const path = tempFile();
    createFileRatingStore(path).record(vote());
    writeFileSync(path, '{"version":1,"votes":[{"slot":9}]}');
    const warnings: string[] = [];
    const store = createFileRatingStore(path, { warn: (message) => warnings.push(message) });
    expect(store.votes()).toEqual([]);
    expect(warnings[0]).toMatch(/beiseitegelegt/);
    const dir = join(path, '..');
    expect(readdirSync(dir).some((name) => name.startsWith('stimmen.json.kaputt-'))).toBe(true);
  });
});
