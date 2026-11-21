/**
 * Zweites Themenbrett „Frostgipfel“ (CHAOS-198): verschneiter Berg mit 75 Feldern, vier Gabeln,
 * Eisfeldern, zwei Lawinenhängen und einer Seilbahn vom Tal zur Bergstation. Reine Daten –
 * Kulisse (Gipfel, Seilbahn, Schnee) macht der Host (`apps/host/src/board/frostpeak.ts`).
 *
 * Lage (Welt-Einheiten, x nach rechts, z nach hinten; Fläche ≈ 44 × 24). Laufrichtung gegen den
 * Uhrzeigersinn: unten nach rechts, rechts hinauf, oben nach links, links hinunter.
 *
 * ```
 *  C f39 ← Höhenweg ← f32 ← B f31 ← … ← f25          oben (Grat)
 *  ↙ ↘                       ↓ Gipfelweg   ↖     ↖
 * Ser- Rodel- ← g12 … g07 ← ( Gipfel ) ← g01    f24    f17
 * pen- bahn     ↑ Bergstation g06        Gletscher-  Lärchen-
 * tinen r1–r7   ┆ Seilbahn               pfad        hang
 *  ↘ ↙          ┆                        f18–f24    f08–f17
 *   j1 → … → j7 → f01 → f02 → f03 → T f04 → f05 → f06 → A f07     unten (Tal), Start f01
 * ```
 *
 * - Talstation T (f04): Talweg weiter (f05) oder Seilbahn (8 Münzen) in einem Schritt zur
 *   Bergstation g06 vor dem Gipfel. Eine Runde über die Seilbahn ist 21 Felder lang statt 42–49.
 * - Gabel A (f07): Lärchenhang außen (f08–f17, 10 Felder, sicher) oder Gletscherpfad innen
 *   (f18–f24, 7 Felder, zwei Eisfelder, Lawinenhang). Beide treffen sich in f25.
 * - Gabel B (f31): Höhenweg oben weiter (f32–f39, dann Gabel C) oder Gipfelweg rund um den
 *   Gipfel (g01–g12, an der Bergstation vorbei, mündet in die Rodelbahn).
 * - Gabel C (f39): Serpentinen außen (f40–f49, 10 Felder, sicher) oder Rodelbahn innen
 *   (r1–r7, oben drei Eisfelder hintereinander: Wer dort landet, rutscht bis r4).
 * - Lawinen nach jeder dritten Runde, abwechselnd am Gletscherpfad und am Nordhang (g11, g12,
 *   r4–r6); wer dort steht, verliert 5 Münzen.
 * - Neun Trophäen-Kandidaten, je einer auf jedem Gabel-Weg und am Tal.
 */
import type { BoardDefinition, BoardSpace, SpaceKind } from '../types.ts';

type Row = readonly [
  id: string,
  kind: SpaceKind,
  x: number,
  z: number,
  next: string,
  label?: string,
];

/** Kompakte Tabelle: ID, Typ, Position, Nachfolger (mit `|` getrennt), optional Wegweiser. */
const ROWS: readonly Row[] = [
  // Unten (Tal): Start → Talstation → Gabel A
  ['f01', 'start', 0, -12, 'f02'],
  ['f02', 'coins-plus', 2.4, -12, 'f03'],
  ['f03', 'item', 4.8, -12, 'f04'],
  ['f04', 'coins-plus', 7.2, -12, 'f05|g06'],
  ['f05', 'coins-minus', 9.6, -12, 'f06', 'Talweg'],
  ['f06', 'trophy', 12, -12, 'f07'],
  ['f07', 'coins-plus', 14.3, -11.8, 'f08|f18'],
  // Gabel A, langer sicherer Weg außen: Lärchenhang
  ['f08', 'coins-plus', 16.6, -11, 'f09', 'Lärchenhang'],
  ['f09', 'item', 18.7, -9.7, 'f10'],
  ['f10', 'coins-plus', 20.3, -7.9, 'f11'],
  ['f11', 'coins-plus', 21.3, -5.7, 'f12'],
  ['f12', 'trophy', 21.8, -3.4, 'f13'],
  ['f13', 'coins-plus', 22, -1, 'f14'],
  ['f14', 'event', 22, 1.4, 'f15'],
  ['f15', 'coins-plus', 21.8, 3.8, 'f16'],
  ['f16', 'item', 21.3, 6.1, 'f17'],
  ['f17', 'coins-plus', 20.3, 8.3, 'f25'],
  // Gabel A, kurzer Weg innen über den Gletscher (Eis, Lawinenhang)
  ['f18', 'coins-plus', 15.6, -9, 'f19', 'Gletscherpfad'],
  ['f19', 'event', 15.6, -6.1, 'f20'],
  ['f20', 'trophy', 15.6, -3.2, 'f21'],
  ['f21', 'coins-plus', 15.6, -0.3, 'f22'],
  ['f22', 'coins-plus', 15.6, 2.6, 'f23'],
  ['f23', 'coins-minus', 15.8, 5.5, 'f24'],
  ['f24', 'coins-plus', 16.6, 8.2, 'f25'],
  // Oben (Grat): Zusammenführung A → Gabel B
  ['f25', 'coins-plus', 18.6, 10.4, 'f26'],
  ['f26', 'trophy', 16.5, 11.7, 'f27'],
  ['f27', 'coins-plus', 14.2, 12, 'f28'],
  ['f28', 'coins-minus', 11.8, 12, 'f29'],
  ['f29', 'item', 9.4, 12, 'f30'],
  ['f30', 'coins-plus', 7, 12, 'f31'],
  ['f31', 'coins-plus', 4.6, 12, 'f32|g01'],
  // Gabel B, oben weiter über den Höhenweg → Gabel C
  ['f32', 'event', 2.2, 12, 'f33', 'Höhenweg'],
  ['f33', 'coins-plus', -0.2, 12, 'f34'],
  ['f34', 'trophy', -2.6, 12, 'f35'],
  ['f35', 'coins-plus', -5, 12, 'f36'],
  ['f36', 'item', -7.4, 12, 'f37'],
  ['f37', 'coins-minus', -9.8, 12, 'f38'],
  ['f38', 'coins-plus', -12.2, 12, 'f39'],
  ['f39', 'coins-plus', -14.6, 11.8, 'f40|r1'],
  // Gabel B, rund um den Gipfel (vorn an der Bergstation vorbei) → Rodelbahn
  ['g01', 'coins-plus', 4.4, 9.5, 'g02', 'Gipfelweg'],
  ['g02', 'item', 5.6, 7.2, 'g03'],
  ['g03', 'coins-minus', 5.8, 4.7, 'g04'],
  ['g04', 'coins-plus', 5, 2.3, 'g05'],
  ['g05', 'event', 3, 0.5, 'g06'],
  ['g06', 'coins-plus', 0.6, -0.4, 'g07', 'Seilbahn'],
  ['g07', 'trophy', -1.9, 0, 'g08'],
  ['g08', 'coins-plus', -4, 1.4, 'g09'],
  ['g09', 'coins-minus', -5.4, 3.5, 'g10'],
  ['g10', 'item', -7.6, 4.4, 'g11'],
  ['g11', 'coins-plus', -10, 4, 'g12'],
  ['g12', 'event', -12.3, 3.2, 'r4'],
  // Gabel C, langer sicherer Weg außen: Serpentinen
  ['f40', 'item', -16.9, 10.9, 'f41', 'Serpentinen'],
  ['f41', 'coins-plus', -18.9, 9.4, 'f42'],
  ['f42', 'event', -20.6, 7.6, 'f43'],
  ['f43', 'coins-plus', -21.6, 5.4, 'f44'],
  ['f44', 'item', -22, 3, 'f45'],
  ['f45', 'coins-plus', -22, 0.6, 'f46'],
  ['f46', 'coins-minus', -22, -1.8, 'f47'],
  ['f47', 'coins-plus', -21.8, -4.2, 'f48'],
  ['f48', 'trophy', -21.2, -6.6, 'f49'],
  ['f49', 'coins-plus', -19.9, -8.7, 'j1'],
  // Gabel C, kurzer Weg innen: Rodelbahn (r1–r3 Eis am Stück, r7 Eis)
  ['r1', 'coins-plus', -14.8, 9, 'r2', 'Rodelbahn'],
  ['r2', 'coins-plus', -14.8, 6.6, 'r3'],
  ['r3', 'coins-plus', -14.8, 4.2, 'r4'],
  ['r4', 'coins-plus', -14.8, 1.6, 'r5'],
  ['r5', 'trophy', -15, -1, 'r6'],
  ['r6', 'coins-minus', -15.6, -4.2, 'r7'],
  ['r7', 'coins-plus', -16.6, -7.4, 'j1'],
  // Unten links: Zusammenführung C → Start
  ['j1', 'coins-plus', -17.8, -10.4, 'j2'],
  ['j2', 'coins-minus', -15.4, -11.6, 'j3'],
  ['j3', 'coins-plus', -13, -12, 'j4'],
  ['j4', 'item', -10.6, -12, 'j5'],
  ['j5', 'event', -8.2, -12, 'j6'],
  ['j6', 'coins-plus', -5.8, -12, 'j7'],
  ['j7', 'trophy', -3.4, -12, 'f01'],
];

function toSpace([id, kind, x, z, next, label]: Row): BoardSpace {
  const space = { id, kind, position: { x, z }, next: next.split('|') };
  return label === undefined ? space : { ...space, label };
}

/** Talstation und Bergstation der Seilbahn. */
export const VALLEY_STATION = 'f04';
export const MOUNTAIN_STATION = 'g06';

export const FROSTGIPFEL: BoardDefinition = {
  id: 'frostgipfel',
  name: 'Frostgipfel',
  start: 'f01',
  spaces: ROWS.map(toSpace),
  // Eisfelder: zwei am Gletscherpfad, eins am Gipfelweg, die Rodelbahn (r1–r3 am Stück, r7).
  ice: ['f18', 'f21', 'g08', 'r1', 'r2', 'r3', 'r7'],
  cableCars: [{ from: VALLEY_STATION, to: MOUNTAIN_STATION, price: 8 }],
  avalanche: {
    every: 3,
    coins: 5,
    zones: [
      { name: 'Gletscherpfad', spaces: ['f19', 'f20', 'f21', 'f22', 'f23'] },
      { name: 'Nordhang', spaces: ['g11', 'g12', 'r4', 'r5', 'r6'] },
    ],
  },
};
