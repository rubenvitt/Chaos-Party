/**
 * Reine Spiellogik von „Krümel-Kehraus“ (ohne Babylon): Regeln als Datensatz (für die
 * Varianten aus EXP-023), Geometrie des Blechs mit den Mauslöchern in den Ecken, Wertung,
 * Gutschrift, Texte für HUD und Höhepunkte. Alles hier ist deterministisch und ohne Physik
 * testbar; `index.ts` verbindet es mit Havok.
 *
 * Bewegung und Rempler sind dieselben wie bei Pudding-Gerangel (`PAWN`), damit sich alle
 * Physik-Minispiele gleich anfühlen.
 */
import type { MinigameRng, Slot } from '@chaos-party/minigame-sdk';

export {
  approachAngle,
  clampStick,
  PAWN,
  steeringDeltaV,
  yawFor,
} from '../pudding-gerangel/logic.ts';

/** Stellschrauben, die EXP-023 als Varianten vergleicht. */
export interface KruemelRules {
  /** Krümel, die gleichzeitig auf dem Blech liegen. */
  readonly crumbs: number;
  /** Goldkrümel: erstes Erscheinen und Pause nach einem Treffer (ms); `null` = keiner. */
  readonly goldEveryMs: number | null;
  readonly goldValue: number;
  /** Keksregen: in den letzten so vielen ms zerbröselt ein Riesenkeks; `null` = nie. */
  readonly rainMs: number | null;
  /** So viele Krümel kommen beim Keksregen dazu. */
  readonly rainCrumbs: number;
  /** Wollknäuel, das regelmäßig quer über das Blech gekickt wird (Chaos aus EXP-006). */
  readonly ball: boolean;
}

/** Gewählte Fassung (EXP-023, Variante R3). */
export const KRUEMEL_RULES: KruemelRules = {
  crumbs: 6,
  goldEveryMs: 6000,
  goldValue: 3,
  rainMs: 8000,
  rainCrumbs: 6,
  ball: false,
};

export const TUNING = {
  /** Halbe Breite (x) und Tiefe (z) des Blechs innerhalb des Rands (m). */
  halfX: 7,
  halfZ: 4.5,
  /** Abgeschrägte Ecke: so weit vor der Ecke enden die Seitenränder (m). */
  cut: 1.3,
  /** Rand: Höhe und Dicke (m). Höher, als ein Rempler hebt – niemand fällt herunter. */
  wallHeight: 1,
  wallThickness: 0.3,
  /** Sturz über dem Mauseloch: Unterkante (Krümel passen drunter, Figuren nicht). */
  lintelBottom: 0.8,
  lintelTop: 1.8,
  /** Unsichtbare Kollisionswand hinter Rand und Sturz reicht bis hier (m). */
  colliderTop: 3.2,
  floorThickness: 0.6,
  crumbRadius: 0.32,
  crumbMass: 0.3,
  goldRadius: 0.37,
  goldMass: 0.45,
  ballRadius: 0.75,
  ballMass: 2.5,
  ballKickEveryMs: 5000,
  ballKickSpeed: 7,
  /** Krümel gilt als „im Loch“, wenn seine Mitte so weit hinter der Schräge liegt (m). */
  scoreDepth: 0.15,
  /** Neue Krümel fallen nach so viel Pause von oben herein (ms) … */
  respawnMs: 700,
  /** … aus dieser Höhe (m). */
  dropHeight: 3,
  /** Innenfläche für neue Krümel (Abstand zum Rand, m). */
  spawnMarginX: 2.2,
  spawnMarginZ: 1.4,
  /** Fallfeld bei drei Personen (siehe `dropAreaFor`). */
  drop3Z: 0.8,
  drop3HalfX: 3,
  drop3HalfZ: 1.6,
  /** Krümel dürfen nicht näher als so an einer Figur erscheinen (m). */
  spawnClearance: 1.3,
  /** Berührung zählt für die Gutschrift (Abstand zwischen Kapselachse und Krümelrand, m). */
  touchSlack: 0.15,
  /** Darunter gilt ein Körper als vom Blech gefallen (Notfall, sollte nie passieren). */
  killY: -2,
  /** Tempo-Obergrenze der Krümel (m/s). */
  crumbSpeedLimit: 14,
  /**
   * Höchste Steiggeschwindigkeit der Krümel (m/s, ≈ 0,3 m Sprunghöhe). Tritt eine Figur auf
   * einen Krümel, quetscht Havok ihn sonst steil nach oben, und er fliegt über den Rand.
   */
  crumbMaxRise: 2.5,
} as const;

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

/**
 * Ein Mauseloch: in einer abgeschrägten Ecke (`sx`, `sz` = ±1) oder mitten in der hinteren
 * Wand (`sx = 0`, nur bei drei Personen). Mitte der Öffnung und Normale nach außen.
 */
export interface Corner {
  readonly sx: 1 | 0 | -1;
  readonly sz: 1 | -1;
  /** Mitte der Öffnung auf der Innenseite (liegt auf der Schräge bzw. Wand). */
  readonly mouth: Vec2;
  /** Einheitsnormale der Öffnung (zeigt aus dem Blech hinaus). */
  readonly normal: Vec2;
}

/**
 * Reihenfolge der Ecken nach Spielerzahl: bei zwei Personen diagonal (gleiche Wege), bei
 * vier sind alle offen. Index = Platz in `players`. Drei Personen siehe `cornersFor`.
 */
const CORNER_ORDER: readonly (readonly [1 | -1, 1 | -1])[] = [
  [-1, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
];

export function cornerFor(sx: 1 | -1, sz: 1 | -1): Corner {
  const { halfX, halfZ, cut } = TUNING;
  return {
    sx,
    sz,
    mouth: { x: sx * (halfX - cut / 2), z: sz * (halfZ - cut / 2) },
    normal: { x: sx * Math.SQRT1_2, z: sz * Math.SQRT1_2 },
  };
}

/**
 * Loch mitten in der hinteren Wand (nur bei drei Personen): eine 90°-Kerbe, so tief wie eine
 * Ecke abgeschrägt ist (`cut`), mit der Öffnung an der Spitze – geometrisch eine gespiegelte
 * Ecke. Ein Loch in der geraden Wand traf man kaum (EXP-023: 3–4 % Siege), weil die Wände
 * einer Ecke Krümel zur Öffnung leiten.
 */
export function backHole(): Corner {
  return {
    sx: 0,
    sz: 1,
    mouth: { x: 0, z: TUNING.halfZ + TUNING.cut },
    normal: { x: 0, z: 1 },
  };
}

/** Breite jeder Öffnung (m). */
export const MOUTH_WIDTH = TUNING.cut * Math.SQRT2;

/**
 * Löcher der teilnehmenden Plätze in Spielerreihenfolge (2–4). Drei Personen: vorn links,
 * vorn rechts und hinten in der Mitte. Mit drei von vier Rechteck-Ecken gewann in EXP-023
 * die Ecke ohne nahen Nachbarn 59 % statt 33 % (geschlossene oder neutrale vierte Ecke
 * änderten daran nichts); so sind die vorderen Löcher Spiegelbilder.
 */
export function cornersFor(count: number): Corner[] {
  if (count === 3) return [cornerFor(-1, -1), cornerFor(1, -1), backHole()];
  return CORNER_ORDER.slice(0, Math.max(0, Math.min(4, count))).map(([sx, sz]) =>
    cornerFor(sx, sz),
  );
}

/** Alle vier Ecken (Schrägen) mit Angabe, ob dort ein Mauseloch offen ist. */
export function allCorners(count: number): { corner: Corner; open: boolean }[] {
  const holes = cornersFor(count);
  return CORNER_ORDER.map(([sx, sz]) => ({
    corner: cornerFor(sx, sz),
    open: holes.some((hole) => hole.sx === sx && hole.sz === sz),
  }));
}

/** Hat die hintere Wand bei dieser Spielerzahl ein Loch? */
export function hasBackHole(count: number): boolean {
  return cornersFor(count).some((hole) => hole.sx === 0);
}

/** Wie weit ein Punkt hinter der Öffnung liegt (positiv = draußen, im Loch). */
export function beyondCut(corner: Corner, p: Vec2): number {
  return (p.x - corner.mouth.x) * corner.normal.x + (p.z - corner.mouth.z) * corner.normal.z;
}

/** Fläche, in die neue Krümel fallen: Mitte und halbe Ausdehnung. */
export interface DropArea {
  readonly cx: number;
  readonly cz: number;
  readonly hx: number;
  readonly hz: number;
}

/**
 * Bei 2 und 4 Personen die ganze Innenfläche. Bei 3 Personen ein Feld, dessen Mitte so liegt,
 * dass alle drei Löcher gleich oft treffen. Geometrisch gleich weit weg wäre z ≈ −1,1; mit
 * Bots ausgeglichen ist z = 0,8 (EXP-023: Siege 37/29/35 %, Punkte 5,9/5,8/6,0; bei −1,1
 * gewann hinten nur 11 %). Ob das für Menschen passt, klärt der Playtest.
 */
export function dropAreaFor(count: number): DropArea {
  if (count === 3)
    return { cx: 0, cz: TUNING.drop3Z, hx: TUNING.drop3HalfX, hz: TUNING.drop3HalfZ };
  return {
    cx: 0,
    cz: 0,
    hx: TUNING.halfX - TUNING.spawnMarginX,
    hz: TUNING.halfZ - TUNING.spawnMarginZ,
  };
}

/** In welchem offenen Mauseloch ein Krümel liegt (Index in `corners`) oder `null`. */
export function holeOf(corners: readonly Corner[], p: Vec2, radius: number): number | null {
  for (let index = 0; index < corners.length; index++) {
    const corner = corners[index];
    if (corner && beyondCut(corner, p) > TUNING.scoreDepth + radius * 0.2) return index;
  }
  return null;
}

/** Startpunkt einer Figur: 2,4 m vor dem eigenen Mauseloch Richtung Mitte. */
export function spawnFor(corner: Corner): Vec2 {
  return { x: corner.mouth.x - corner.normal.x * 2.4, z: corner.mouth.z - corner.normal.z * 2.4 };
}

/**
 * Zufälliger Fallpunkt für einen neuen Krümel in der Innenfläche, möglichst nicht direkt
 * neben einer Figur (sonst landet er ohne eigenes Zutun vor jemandem). Nach 8 Versuchen
 * gilt der letzte Punkt.
 */
export function dropPoint(
  rng: MinigameRng,
  avoid: readonly Vec2[],
  area: DropArea = dropAreaFor(4),
): Vec2 {
  let point: Vec2 = { x: area.cx, z: area.cz };
  for (let attempt = 0; attempt < 8; attempt++) {
    point = {
      x: area.cx + (rng.next() * 2 - 1) * area.hx,
      z: area.cz + (rng.next() * 2 - 1) * area.hz,
    };
    if (avoid.every((p) => Math.hypot(p.x - point.x, p.z - point.z) >= TUNING.spawnClearance))
      return point;
  }
  return point;
}

/** Fallpunkte des Keksregens: Kreis um die Mitte, gleichmäßig verteilt, leicht gedreht. */
export function rainPoints(rng: MinigameRng, count: number, center: Vec2 = { x: 0, z: 0 }): Vec2[] {
  const turn = rng.next() * Math.PI * 2;
  return Array.from({ length: count }, (_, index) => {
    const angle = turn + (index / Math.max(1, count)) * Math.PI * 2;
    const r = 1 + (index % 2) * 0.9;
    return { x: center.x + Math.cos(angle) * r * 1.4, z: center.z + Math.sin(angle) * r };
  });
}

/** Läuft gerade der Keksregen? */
export function inRain(rules: KruemelRules, elapsedMs: number, limitMs: number): boolean {
  return rules.rainMs !== null && elapsedMs >= limitMs - rules.rainMs;
}

/** Berührt eine Figur (Kapselachse bei `pawn`) den Krümel? Für die Gutschrift. */
export function touches(pawn: Vec2, crumb: Vec2, crumbRadius: number, pawnRadius: number): boolean {
  return (
    Math.hypot(pawn.x - crumb.x, pawn.z - crumb.z) <= pawnRadius + crumbRadius + TUNING.touchSlack
  );
}

/** Alleinige Führung mit mehr als 0 Punkten, sonst `null`. */
export function leaderOf(scores: readonly { slot: Slot; score: number }[]): Slot | null {
  let best: { slot: Slot; score: number } | null = null;
  let tie = false;
  for (const entry of scores) {
    if (!best || entry.score > best.score) {
      best = entry;
      tie = false;
    } else if (entry.score === best.score) {
      tie = true;
    }
  }
  return best && !tie && best.score > 0 ? best.slot : null;
}

export interface PlayerStats {
  readonly slot: Slot;
  readonly name: string;
  readonly score: number;
  /** Krümel, die diese Person selbst ins eigene Loch geschoben hat. */
  readonly own: number;
  /** Krümel, die diese Person versehentlich in fremde Löcher geschoben hat. */
  readonly gifts: number;
  /** Goldkrümel im eigenen Loch. */
  readonly golds: number;
  /** Rempler, die getroffen haben. */
  readonly bonks: number;
}

const MAX_HIGHLIGHT = 64;

function clip(line: string): string {
  return line.length <= MAX_HIGHLIGHT ? line : `${line.slice(0, MAX_HIGHLIGHT - 1)}…`;
}

function top(stats: readonly PlayerStats[], key: 'gifts' | 'golds' | 'bonks'): PlayerStats | null {
  let best: PlayerStats | null = null;
  for (const entry of stats) {
    if (entry[key] > 0 && (!best || entry[key] > best[key])) best = entry;
  }
  return best;
}

/** 0–4 Höhepunkte (≤ 64 Zeichen) für die Ergebnisanzeige. */
export function buildHighlights(stats: readonly PlayerStats[], rainScored: number): string[] {
  const lines: string[] = [];
  const golden = top(stats, 'golds');
  if (golden) {
    lines.push(
      golden.golds === 1
        ? `${golden.name} versenkte einen Goldkrümel`
        : `${golden.name} versenkte ${golden.golds} Goldkrümel`,
    );
  }
  const giver = top(stats, 'gifts');
  if (giver && giver.gifts >= 2)
    lines.push(`${giver.name} schob ${giver.gifts} Krümel in fremde Löcher`);
  const bumper = top(stats, 'bonks');
  if (bumper && bumper.bonks >= 3) lines.push(`${bumper.name} rempelte ${bumper.bonks}-mal`);
  if (rainScored > 0) {
    lines.push(
      rainScored === 1
        ? 'Aus dem Riesenkeks landete ein Krümel im Loch'
        : `Aus dem Riesenkeks landeten ${rainScored} Krümel in Löchern`,
    );
  }
  return lines.slice(0, 4).map(clip);
}

/** Kurzer Zustand je Spieler für den HUD (≤ 16 Zeichen). */
export function statusFor(state: { lastValue: number; recent: boolean }): string | undefined {
  if (!state.recent) return undefined;
  return state.lastValue > 1 ? `Gold +${state.lastValue}` : `+${state.lastValue}`;
}

/** Banner mitten im Spiel (≤ 32 Zeichen). */
export function bannerFor(state: {
  elapsedMs: number;
  limitMs: number;
  rainStartMs: number | null;
  goldSinceMs: number | null;
}): string | undefined {
  const { elapsedMs, limitMs, rainStartMs, goldSinceMs } = state;
  if (rainStartMs !== null && elapsedMs >= rainStartMs && elapsedMs < rainStartMs + 2000)
    return 'Ein Riesenkeks zerbröselt!';
  const remaining = limitMs - elapsedMs;
  if (remaining <= 5000 && remaining > 0) return 'Letzte 5 Sekunden!';
  if (goldSinceMs !== null && elapsedMs - goldSinceMs < 1500) return 'Ein Goldkrümel!';
  return undefined;
}
