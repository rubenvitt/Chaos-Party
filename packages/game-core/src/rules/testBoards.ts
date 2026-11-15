/**
 * Kleine Test-Bretter für die Regel-Tests (nicht das echte Spielbrett, das liegt in
 * `board/`). Alle Feld-IDs passen zum Protokoll (`[a-z0-9-]`).
 */
import type { BoardDefinition, BoardSpace, SpaceKind } from '../types.ts';

function space(
  id: string,
  kind: SpaceKind,
  next: readonly string[],
  x: number,
  label?: string,
): BoardSpace {
  const base = { id, kind, next, position: { x, z: 0 } };
  return label === undefined ? base : { ...base, label };
}

/**
 * Rundkurs mit allen Feldtypen, einer Verzweigung (`s05` → `a1` „Pilzpfad“ / `b1`
 * „Felsweg“, Zusammenführung in `m1`) und drei Trophäenfeldern (`a1`, `b3`, `m2`).
 *
 * ```text
 * s00 → s01(+) → s02(−) → s03(item) → s04(event) → s05(+) ┬→ a1(trophy) → a2(+) ────────────┬→ m1(−) → m2(trophy) → s00
 *                                                          └→ b1(item) → b2(event) → b3(trophy)┘
 * ```
 */
export const TEST_BOARD: BoardDefinition = {
  id: 'testwald',
  name: 'Testwald',
  start: 's00',
  spaces: [
    space('s00', 'start', ['s01'], 0),
    space('s01', 'coins-plus', ['s02'], 1),
    space('s02', 'coins-minus', ['s03'], 2),
    space('s03', 'item', ['s04'], 3),
    space('s04', 'event', ['s05'], 4),
    space('s05', 'coins-plus', ['a1', 'b1'], 5),
    space('a1', 'trophy', ['a2'], 6, 'Pilzpfad'),
    space('a2', 'coins-plus', ['m1'], 7),
    space('b1', 'item', ['b2'], 6, 'Felsweg'),
    space('b2', 'event', ['b3'], 7),
    space('b3', 'trophy', ['m1'], 8),
    space('m1', 'coins-minus', ['m2'], 9),
    space('m2', 'trophy', ['s00'], 10),
  ],
};

/**
 * Rundkurs `l0` (Start) → `l1` … `ln` → `l0` mit den angegebenen Feldtypen. Praktisch, um
 * mit festen Würfeln (`diceFaces: [k]`) gezielt auf einem Feldtyp zu landen.
 */
export function loopBoard(kinds: readonly SpaceKind[], id = 'testloop'): BoardDefinition {
  const ids = ['l0', ...kinds.map((_, i) => `l${String(i + 1)}`)];
  const allKinds: SpaceKind[] = ['start', ...kinds];
  return {
    id,
    name: 'Testschleife',
    start: 'l0',
    spaces: ids.map((sid, i) =>
      space(sid, allKinds[i] ?? 'start', [ids[(i + 1) % ids.length] ?? 'l0'], i),
    ),
  };
}

/** Brett nur aus Start- und Plus-Feldern, ohne Verzweigung und ohne Trophäe. */
export function plainBoard(length = 6): BoardDefinition {
  return loopBoard(
    Array.from({ length }, () => 'coins-plus' as const),
    'plain',
  );
}
