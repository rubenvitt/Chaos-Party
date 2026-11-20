/**
 * Drittes Brett „Rummelplatz“ (CHAOS-199): Jahrmarkt bei Nacht mit 81 Feldern, drei Gabeln und
 * einem Karussell in der Mitte, dessen Ausgang sich jede Runde weiterdreht (ADR-020). Reine
 * Daten – Kulisse und Lichterketten macht der Host (`apps/host/src/board/fairground.ts`).
 *
 * Lage (Welt-Einheiten, x nach rechts, z nach hinten; Fläche ≈ 44 × 24):
 *
 * ```
 *   C s39 ← … ← s32 ← B s31 ← … ← s25              oben, Laufrichtung nach links
 *   ↙  ↘              ↓ Karussell-Weg   ↖     ↖
 * Los-  Spiegel-      s40–s42           s24    s17
 * buden kabinett  ←W─ (K s43) ─O→ Geister- Riesen-
 * gasse  s54–s60       │S            bahn    radweg
 *   ↘  ↙               ↓           s18–s24  s08–s17
 *    s61 → … → s67 → s01 → … → A s07                unten, Start s01 in der Mitte
 * ```
 *
 * - Gabel A (s07): Riesenradweg außen (s08–s17, 10 Felder, sicher, Plus und Items) oder
 *   Geisterbahn innen (s18–s24, 7 Felder, riskant: Minus- und Ereignisfelder, ein
 *   Trophäen-Kandidat). Beide treffen sich in s25.
 * - Gabel B (s31): oben weiter über die Zuckerwattenallee (s32–s39) oder hinunter ins Karussell
 *   (s40–s42, dann s43).
 * - Karussell (s43): kein Wegwahl-Feld. Es dreht sich jede Runde einen Ausgang weiter: Runde 1
 *   West ins Spiegelkabinett (s68–s72 → s57), Runde 2 Süd zur Abkürzung an den Startplatz
 *   (s73–s76 → s02, mit Trophäen-Kandidat s73), Runde 3 Ost zurück in die Geisterbahn
 *   (s77–s81 → s21, eine Ehrenrunde), dann wieder West. Wohin es dreht, sagt die Wegwahl an
 *   Gabel B („Karussell → Startplatz“) und zeigt die Gondel im Host.
 * - Gabel C (s39): Losbudengasse außen (s44–s53, 10 Felder, Glücksweg mit fünf Item- und zwei
 *   Ereignisfeldern, „Losbuden“) oder Spiegelkabinett innen (s54–s60, 7 Felder).
 *   Beide treffen sich in s61.
 * - Eine Runde über den Start ist 43–49 Felder lang (über das Karussell nach Westen 41–44);
 *   die Schleife über das Karussell nach Süden zurück auf s02 ist 28–31 Felder lang.
 * - Neun Trophäen-Kandidaten über das Brett verteilt, je einer auf jedem Gabel-Weg.
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
  // Unten rechts: Start → Gabel A (Riesenradweg oder Geisterbahn)
  ['s01', 'start', 0, -12, 's02'],
  ['s02', 'coins-plus', 2.4, -12, 's03'],
  ['s03', 'item', 4.8, -12, 's04'],
  ['s04', 'coins-plus', 7.2, -12, 's05'],
  ['s05', 'trophy', 9.6, -12, 's06'],
  ['s06', 'coins-minus', 12, -12, 's07'],
  ['s07', 'coins-plus', 14.3, -11.8, 's08|s18'],
  // Gabel A, langer sicherer Weg außen am Riesenrad vorbei
  ['s08', 'coins-plus', 16.6, -11, 's09', 'Riesenradweg'],
  ['s09', 'item', 18.7, -9.7, 's10'],
  ['s10', 'coins-plus', 20.3, -7.9, 's11'],
  ['s11', 'coins-plus', 21.3, -5.7, 's12'],
  ['s12', 'trophy', 21.8, -3.4, 's13'],
  ['s13', 'coins-plus', 22, -1, 's14'],
  ['s14', 'event', 22, 1.4, 's15'],
  ['s15', 'coins-plus', 21.8, 3.8, 's16'],
  ['s16', 'item', 21.3, 6.1, 's17'],
  ['s17', 'coins-plus', 20.3, 8.3, 's25'],
  // Gabel A, kurze riskante Abkürzung durch die Geisterbahn
  ['s18', 'coins-minus', 15.6, -9, 's19', 'Geisterbahn'],
  ['s19', 'event', 15.6, -6.1, 's20'],
  ['s20', 'trophy', 15.6, -3.2, 's21'],
  ['s21', 'coins-minus', 15.6, -0.3, 's22'],
  ['s22', 'event', 15.6, 2.6, 's23'],
  ['s23', 'coins-minus', 15.8, 5.5, 's24'],
  ['s24', 'coins-plus', 16.6, 8.2, 's25'],
  // Oben: Zusammenführung A → Gabel B (weiter oben entlang oder ins Karussell)
  ['s25', 'coins-plus', 18.6, 10.4, 's26'],
  ['s26', 'trophy', 16.5, 11.7, 's27'],
  ['s27', 'coins-plus', 14.2, 12, 's28'],
  ['s28', 'coins-minus', 11.8, 12, 's29'],
  ['s29', 'item', 9.4, 12, 's30'],
  ['s30', 'coins-plus', 7, 12, 's31'],
  ['s31', 'coins-plus', 4.6, 12, 's32|s40'],
  // Gabel B, oben weiter über die Zuckerwattenallee → Gabel C
  ['s32', 'event', 2.2, 12, 's33', 'Zuckerwattenallee'],
  ['s33', 'coins-plus', -0.2, 12, 's34'],
  ['s34', 'trophy', -2.6, 12, 's35'],
  ['s35', 'coins-plus', -5, 12, 's36'],
  ['s36', 'item', -7.4, 12, 's37'],
  ['s37', 'coins-minus', -9.8, 12, 's38'],
  ['s38', 'coins-plus', -12.2, 12, 's39'],
  ['s39', 'coins-plus', -14.6, 11.8, 's44|s54'],
  // Gabel B, Weg hinunter zum Karussell
  ['s40', 'coins-minus', 4.4, 9.5, 's41', 'Karussell'],
  ['s41', 'coins-plus', 3.6, 7.1, 's42'],
  ['s42', 'item', 2.2, 4.7, 's43'],
  // Das Karussell in der Mitte: Ausgang dreht sich jede Runde (siehe `rotations`)
  ['s43', 'event', 0, 2, 's68|s73|s77'],
  // Gabel C, langer Glücksweg außen: Losbudengasse (viele Item- und Ereignisfelder)
  ['s44', 'item', -16.9, 10.9, 's45', 'Losbudengasse'],
  ['s45', 'coins-plus', -18.9, 9.4, 's46'],
  ['s46', 'event', -20.6, 7.6, 's47'],
  ['s47', 'item', -21.6, 5.4, 's48'],
  ['s48', 'coins-plus', -22, 3, 's49'],
  ['s49', 'item', -22, 0.6, 's50'],
  ['s50', 'event', -22, -1.8, 's51'],
  ['s51', 'coins-plus', -21.8, -4.2, 's52'],
  ['s52', 'trophy', -21.2, -6.6, 's53'],
  ['s53', 'item', -19.9, -8.7, 's61'],
  // Gabel C, kurzer Weg innen durchs Spiegelkabinett
  ['s54', 'coins-minus', -14.8, 9, 's55', 'Spiegelkabinett'],
  ['s55', 'event', -14.8, 5.9, 's56'],
  ['s56', 'coins-plus', -14.8, 2.8, 's57'],
  ['s57', 'coins-minus', -14.8, -0.3, 's58'],
  ['s58', 'trophy', -15, -3.4, 's59'],
  ['s59', 'event', -15.6, -6, 's60'],
  ['s60', 'coins-plus', -16.6, -8.4, 's61'],
  // Unten links: Zusammenführung C → Start
  ['s61', 'coins-plus', -17.8, -10.4, 's62'],
  ['s62', 'coins-minus', -15.4, -11.6, 's63'],
  ['s63', 'coins-plus', -13, -12, 's64'],
  ['s64', 'item', -10.6, -12, 's65'],
  ['s65', 'event', -8.2, -12, 's66'],
  ['s66', 'coins-plus', -5.8, -12, 's67'],
  ['s67', 'trophy', -3.4, -12, 's01'],
  // Karussell-Ausgang West: ins Spiegelkabinett
  ['s68', 'coins-plus', -2.6, 1.4, 's69', 'Spiegelkabinett'],
  ['s69', 'item', -5, 1, 's70'],
  ['s70', 'coins-minus', -7.4, 0.6, 's71'],
  ['s71', 'coins-plus', -9.8, 0.2, 's72'],
  ['s72', 'event', -12.2, -0.1, 's57'],
  // Karussell-Ausgang Süd: Abkürzung zum Startplatz
  ['s73', 'trophy', 0.4, -0.8, 's74', 'Startplatz'],
  ['s74', 'coins-minus', 0.6, -3.6, 's75'],
  ['s75', 'event', 0.8, -6.4, 's76'],
  ['s76', 'coins-plus', 0.6, -9.2, 's02'],
  // Karussell-Ausgang Ost: zurück in die Geisterbahn (Ehrenrunde)
  ['s77', 'coins-minus', 2.6, 1.4, 's78', 'Geisterbahn'],
  ['s78', 'coins-plus', 5, 1, 's79'],
  ['s79', 'event', 7.4, 0.6, 's80'],
  ['s80', 'item', 9.8, 0.3, 's81'],
  ['s81', 'coins-plus', 12.4, 0.2, 's21'],
];

function toSpace([id, kind, x, z, next, label]: Row): BoardSpace {
  const space = { id, kind, position: { x, z }, next: next.split('|') };
  return label === undefined ? space : { ...space, label };
}

/** Karussell-Feld in der Mitte. */
export const CAROUSEL_SPACE = 's43';

export const RUMMELPLATZ: BoardDefinition = {
  id: 'rummelplatz',
  name: 'Rummelplatz',
  start: 's01',
  spaces: ROWS.map(toSpace),
  // Reihenfolge = Drehrichtung: West (Spiegelkabinett), Süd (Startplatz), Ost (Geisterbahn).
  rotations: [{ space: CAROUSEL_SPACE, exits: ['s68', 's73', 's77'] }],
};
