import { describe, expect, it } from 'vitest';
import type { BoardDefinition, BoardSpace, SpaceKind } from '../types.ts';
import {
  BOARDS,
  DEFAULT_BOARD,
  getBoard,
  MIN_SPACE_DISTANCE,
  validateBoard,
  WACKELWALD,
} from './index.ts';

/** Kleines gültiges Brett: Start → a → Gabel b → (c | d) → e → Start. */
function tinyBoard(): BoardDefinition {
  const spaces: BoardSpace[] = [
    { id: 'st', kind: 'start', position: { x: 0, z: 0 }, next: ['a'] },
    { id: 'a', kind: 'coins-plus', position: { x: 2, z: 0 }, next: ['b'] },
    { id: 'b', kind: 'coins-minus', position: { x: 4, z: 0 }, next: ['c', 'd'] },
    { id: 'c', kind: 'trophy', position: { x: 6, z: 2 }, next: ['e'], label: 'Oben' },
    { id: 'd', kind: 'item', position: { x: 6, z: -2 }, next: ['e'], label: 'Unten' },
    { id: 'e', kind: 'event', position: { x: 8, z: 0 }, next: ['st'] },
  ];
  return { id: 'mini', name: 'Mini', start: 'st', spaces };
}

function withSpaces(
  board: BoardDefinition,
  change: (spaces: BoardSpace[]) => BoardSpace[],
): BoardDefinition {
  return { ...board, spaces: change([...board.spaces]) };
}

function replace(spaces: BoardSpace[], id: string, patch: Partial<BoardSpace>): BoardSpace[] {
  return spaces.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

function errorsOf(board: BoardDefinition): string[] {
  const result = validateBoard(board);
  return result.ok ? [] : result.errors;
}

function countKinds(board: BoardDefinition): Record<SpaceKind, number> {
  const counts: Record<SpaceKind, number> = {
    start: 0,
    'coins-plus': 0,
    'coins-minus': 0,
    event: 0,
    item: 0,
    trophy: 0,
  };
  for (const space of board.spaces) counts[space.kind]++;
  return counts;
}

/** Länge (Felder) des Wegs ab `from`, bis ein Feld mit mehreren Vorgängern erreicht ist. */
function branchLength(board: BoardDefinition, from: string): number {
  const byId = new Map(board.spaces.map((s) => [s.id, s]));
  const incoming = new Map<string, number>();
  for (const s of board.spaces) for (const n of s.next) incoming.set(n, (incoming.get(n) ?? 0) + 1);
  let length = 0;
  let id: string | undefined = from;
  while (id !== undefined && (incoming.get(id) ?? 0) < 2) {
    length++;
    id = byId.get(id)?.next[0];
  }
  return length;
}

describe('Brett „Wackelwald“', () => {
  it('ist gültig', () => {
    expect(validateBoard(WACKELWALD)).toEqual({ ok: true });
  });

  it('ist Standardbrett und über getBoard/BOARDS auffindbar', () => {
    expect(DEFAULT_BOARD).toBe(WACKELWALD);
    expect(BOARDS.wackelwald).toBe(WACKELWALD);
    expect(getBoard('wackelwald')).toBe(WACKELWALD);
    expect(getBoard('gibt-es-nicht')).toBeUndefined();
    expect(getBoard('toString')).toBeUndefined();
  });

  it('jedes Brett in BOARDS ist gültig und unter seiner ID abgelegt', () => {
    for (const [id, board] of Object.entries(BOARDS)) {
      expect(board.id).toBe(id);
      expect(validateBoard(board)).toEqual({ ok: true });
    }
  });

  it('hat 36–44 Felder in der vorgesehenen Verteilung', () => {
    const counts = countKinds(WACKELWALD);
    expect(WACKELWALD.spaces.length).toBeGreaterThanOrEqual(36);
    expect(WACKELWALD.spaces.length).toBeLessThanOrEqual(44);
    expect(counts.start).toBe(1);
    expect(counts.trophy).toBeGreaterThanOrEqual(3);
    expect(counts.trophy).toBeLessThanOrEqual(4);
    expect(counts.item).toBeGreaterThanOrEqual(3);
    expect(counts.event).toBeGreaterThanOrEqual(3);
    expect(counts['coins-minus']).toBeGreaterThan(0);
    // Überwiegend Plus-Felder.
    expect(counts['coins-plus']).toBeGreaterThan(WACKELWALD.spaces.length / 2);
  });

  it('hat mindestens zwei Verzweigungen mit unterschiedlich langen, beschrifteten Wegen', () => {
    const forks = WACKELWALD.spaces.filter((s) => s.next.length >= 2);
    expect(forks.length).toBeGreaterThanOrEqual(2);
    const byId = new Map(WACKELWALD.spaces.map((s) => [s.id, s]));
    for (const fork of forks) {
      const lengths = fork.next.map((id) => branchLength(WACKELWALD, id));
      expect(new Set(lengths).size, `Wege ab ${fork.id}`).toBe(lengths.length);
      for (const id of fork.next) {
        const label = byId.get(id)?.label;
        expect(label, `Wegweiser an ${id}`).toBeTruthy();
        expect(label?.length ?? 0).toBeLessThanOrEqual(32);
      }
    }
  });

  it('liegt auf etwa 32 × 22 Einheiten mit IDs wie s01', () => {
    for (const space of WACKELWALD.spaces) {
      expect(space.id).toMatch(/^s\d{2}$/);
      expect(Math.abs(space.position.x)).toBeLessThanOrEqual(16);
      expect(Math.abs(space.position.z)).toBeLessThanOrEqual(11);
    }
  });
});

describe('validateBoard', () => {
  it('akzeptiert ein kleines gültiges Brett', () => {
    expect(validateBoard(tinyBoard())).toEqual({ ok: true });
  });

  it('meldet doppelte IDs', () => {
    const board = withSpaces(tinyBoard(), (spaces) => replace(spaces, 'e', { id: 'a' }));
    expect(errorsOf(board)).toContainEqual(expect.stringContaining('„a“ ist doppelt'));
  });

  it('meldet ungültige IDs', () => {
    const board = { ...withSpaces(tinyBoard(), (s) => replace(s, 'a', { id: 'A 1' })), id: 'X' };
    const errors = errorsOf(board);
    expect(errors).toContainEqual(expect.stringContaining('Brett-ID „X“'));
    expect(errors).toContainEqual(expect.stringContaining('Feld-ID „A 1“'));
  });

  it('meldet fehlendes Startfeld und falschen Starttyp', () => {
    expect(errorsOf({ ...tinyBoard(), start: 'zz' })).toContainEqual(
      expect.stringContaining('Startfeld „zz“ existiert nicht'),
    );
    const wrongKind = { ...tinyBoard(), start: 'a' };
    expect(errorsOf(wrongKind)).toContainEqual(expect.stringContaining('nicht den Typ „start“'));
    const twoStarts = withSpaces(tinyBoard(), (s) => replace(s, 'a', { kind: 'start' }));
    expect(errorsOf(twoStarts)).toContainEqual(expect.stringContaining('genau ein Feld'));
  });

  it('meldet unbekannte Nachfolger', () => {
    const board = withSpaces(tinyBoard(), (s) => replace(s, 'a', { next: ['nix'] }));
    expect(errorsOf(board)).toContainEqual(expect.stringContaining('unbekanntes Feld „nix“'));
  });

  it('meldet Selbstschleifen', () => {
    const board = withSpaces(tinyBoard(), (s) => replace(s, 'b', { next: ['b', 'c'] }));
    expect(errorsOf(board)).toContainEqual(expect.stringContaining('b zeigt auf sich selbst'));
  });

  it('meldet Sackgassen', () => {
    const board = withSpaces(tinyBoard(), (s) => replace(s, 'e', { next: [] }));
    const errors = errorsOf(board);
    expect(errors).toContainEqual(expect.stringContaining('e ist eine Sackgasse'));
    // Ohne Rückweg kommt man auch nicht mehr zum Start.
    expect(errors).toContainEqual(expect.stringContaining('kein Weg zurück'));
  });

  it('meldet Felder, die vom Start aus nicht erreichbar sind', () => {
    const board = withSpaces(tinyBoard(), (s) => [
      ...s,
      { id: 'insel', kind: 'coins-plus', position: { x: 20, z: 20 }, next: ['st'] },
    ]);
    expect(errorsOf(board)).toEqual(['Feld insel ist vom Start aus nicht erreichbar']);
  });

  it('meldet Felder ohne Rückweg zum Start (nicht stark zusammenhängend)', () => {
    // c → f ↔ g: von c aus gibt es keinen Weg mehr zurück.
    const board = withSpaces(tinyBoard(), (s) => [
      ...replace(s, 'c', { next: ['f'] }),
      { id: 'f', kind: 'coins-plus', position: { x: 6, z: 6 }, next: ['g'] },
      { id: 'g', kind: 'coins-plus', position: { x: 8, z: 6 }, next: ['f'] },
    ]);
    const errors = errorsOf(board);
    expect(errors).toContainEqual('Von Feld c führt kein Weg zurück zum Start');
    expect(errors).toContainEqual('Von Feld f führt kein Weg zurück zum Start');
    expect(errors).not.toContainEqual(expect.stringContaining('Von Feld d'));
  });

  it('meldet doppelte Nachfolger an einer Verzweigung', () => {
    const board = withSpaces(tinyBoard(), (s) => replace(s, 'b', { next: ['c', 'c'] }));
    expect(errorsOf(board)).toContainEqual(
      expect.stringContaining('b nennt einen Nachfolger doppelt'),
    );
  });

  it('meldet zu dicht liegende Felder', () => {
    const board = withSpaces(tinyBoard(), (s) => replace(s, 'a', { position: { x: 0.5, z: 1 } }));
    expect(errorsOf(board)).toContainEqual(expect.stringContaining('st und a liegen zu dicht'));
    const exact = withSpaces(tinyBoard(), (s) =>
      replace(s, 'a', { position: { x: MIN_SPACE_DISTANCE, z: 0 } }),
    );
    expect(validateBoard(exact)).toEqual({ ok: true });
  });

  it('meldet ungültige Positionen und zu lange Wegweiser', () => {
    const board = withSpaces(tinyBoard(), (s) =>
      replace(replace(s, 'e', { position: { x: Number.NaN, z: 0 } }), 'c', {
        label: 'x'.repeat(33),
      }),
    );
    const errors = errorsOf(board);
    expect(errors).toContainEqual('Feld e hat keine gültige Position');
    expect(errors).toContainEqual(expect.stringContaining('Wegweiser von c'));
  });

  it('verlangt mindestens ein Trophäenfeld', () => {
    const board = withSpaces(tinyBoard(), (s) => replace(s, 'c', { kind: 'coins-plus' }));
    expect(errorsOf(board)).toEqual(['Brett hat kein Trophäenfeld']);
  });

  it('verlangt mindestens eine Verzweigung', () => {
    const board = withSpaces(tinyBoard(), (s) =>
      replace(
        s.filter((x) => x.id !== 'd'),
        'b',
        { next: ['c'] },
      ),
    );
    expect(errorsOf(board)).toEqual(['Brett hat keine Verzweigung']);
  });

  it('meldet ein leeres Brett', () => {
    const errors = errorsOf({ id: 'leer', name: 'Leer', start: 'st', spaces: [] });
    expect(errors).toContain('Brett hat keine Felder');
  });

  it('sammelt mehrere Fehler auf einmal', () => {
    const board = withSpaces(tinyBoard(), (s) =>
      replace(replace(s, 'a', { next: ['a'] }), 'e', { next: ['nix'] }),
    );
    expect(errorsOf(board).length).toBeGreaterThanOrEqual(3);
  });
});
