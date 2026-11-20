/**
 * Kamera-Regie des Bretts (CHAOS-194): eine TypeScript-Wahrheit für Babylon-Host (PC) und
 * Apple-Host (Mac, Apple TV). Die Hosts setzen nur die fertige Pose (`CameraRig.pose`).
 *
 * - `cameraShot` wählt je Moment eine Einstellung: Blickpunkt, Abstand und Tempo. Nah an der
 *   Figur am Zug (Würfeln, Laufen mit Blick voraus, Ereignisse), aufgezogen, wo mehr zählt
 *   (Gabel: beide Wege; Klau, Reaktion, Platztausch: beide Figuren; Trophäe wandert: Start und
 *   Ziel), Überblick nur zu Rundenbeginn, beim Trophäen-Wirbel und außerhalb der Züge.
 * - Wie weit aufgezogen wird, rechnet `fitDistance` per Projektion aus den Punkten, die ins
 *   Bild müssen. Brettgrenzen sind nirgends fest: größere Bretter bekommen größere Überblicke.
 * - `createCameraRig` zieht Blickpunkt und Abstand mit einer kritisch gedämpften Feder nach:
 *   weich an, weich aus, ohne Überschwingen. Exakte Lösung je Schritt, daher bildraten-
 *   unabhängig und mit festen Schritten (Testmodus) deterministisch. Bei weiten Fahrten
 *   (Zugwechsel) hebt sich die Kamera ein Stück, damit der Weg lesbar bleibt.
 *
 * Blickwinkel und Neigung bleiben fest (`CAMERA_DIRECTION`): Figuren-Neigung, Popups und
 * Wegweiser sind auf diesen Winkel abgestimmt. Nur Blickpunkt und Abstand ändern sich.
 */
import type { BoardDefinition } from '@chaos-party/game-core';
import type { BoardView } from '@chaos-party/protocol';
import type { FrameCue } from './director.ts';
import {
  boardBounds,
  projectToView,
  type BoardBounds,
  type Point2,
  type Point3,
  type ViewCamera,
} from './layout.ts';

/** Kamera relativ zum Blickpunkt bei Überblicks-Abstand: hoch und schräg von vorn (−z). */
const BASE_OFFSET: Point3 = { x: 0, y: 28, z: -17.5 };
/** Abstand der bisherigen Vollansicht (|BASE_OFFSET|). */
export const BASE_DISTANCE = Math.hypot(BASE_OFFSET.x, BASE_OFFSET.y, BASE_OFFSET.z);
/** Blickrichtung (Einheitsvektor vom Blickpunkt zur Kamera). */
export const CAMERA_DIRECTION: Point3 = {
  x: BASE_OFFSET.x / BASE_DISTANCE,
  y: BASE_OFFSET.y / BASE_DISTANCE,
  z: BASE_OFFSET.z / BASE_DISTANCE,
};
/**
 * Wie weit der Blickpunkt vor (−z, zur Kamera) bzw. hinter dem Ziel liegt. Im Überblick um 1,6
 * vor der Mitte (wie bisher): Das Brett rückt im Bild nach oben, weil unten die Spielerleiste
 * mehr Platz braucht als oben der Titel; weiter weg wächst der Vorhalt mit dem Abstand. Nah an
 * der Figur liegt er dahinter: Die Figur steht etwas unter der Bildmitte, damit Popups und Pfeil
 * über ihr Platz haben und nicht in den Titel ragen.
 */
export function aimZ(distance: number): number {
  const near = { distance: 15, aim: 1.2 };
  const far = { distance: BASE_DISTANCE, aim: -1.6 };
  if (distance >= far.distance) return (far.aim * distance) / far.distance;
  const k = (distance - near.distance) / (far.distance - near.distance);
  return near.aim + (far.aim - near.aim) * k;
}

/** Vertikaler Bildwinkel beider Hosts (Babylon `camera.fov`, Apple aus dem Export). */
export const CAMERA_FOV = 0.72;
/** Seitenverhältnis, für das eingepasst wird (Fernseher). */
export const CAMERA_ASPECT = 16 / 9;

/** Nähe je Einstellung (Abstand zum Blickpunkt, Welt-Einheiten). */
export const SHOT_DISTANCE = {
  /** Figur am Zug wartet (Würfeln, Trophäe kaufen) oder steht. */
  follow: 17,
  /** Laufen: etwas weiter, damit der Weg voraus im Bild ist. */
  walk: 19,
  /** Ereignis an der Figur (Würfelwurf, Münzen, Item, Falle): kurzer Zoom. */
  event: 15,
  /** Kleinster Abstand beim Einpassen mehrerer Punkte. */
  minFit: 17,
  /** Größter Abstand überhaupt (sehr große Bretter). */
  max: 90,
} as const;

/** Tempo je Einstellung: Zeit, in der die Feder den Großteil des Wegs schafft (ms). */
export const SHOT_SMOOTH_MS = {
  walk: 420,
  event: 520,
  fit: 700,
  follow: 800,
  overview: 1000,
} as const;

/** So weit schaut die Kamera beim Laufen voraus (Welt-Einheiten entlang des Wegs). */
export const WALK_LOOKAHEAD = 2.4;
/** Nach dem letzten Sprung bleibt die Lauf-Einstellung noch so lange (ms). */
const WALK_SETTLE_MS = 250;
/** So lange bleiben Ereignis-Einstellungen mindestens stehen (ms), auch ohne Dauer. */
const EVENT_HOLD_MS = 900;
/** Überblicksmomente (Rundenbeginn, Trophäe wandert) dauern so lange (ms). */
export const OVERVIEW_HOLD_MS = 1800;
/** Zusätzlicher Abstand je Welt-Einheit Fahrweg (Zugwechsel), höchstens `MAX_PULLBACK`. */
const PULLBACK_PER_UNIT = 0.35;
const MAX_PULLBACK = 12;

/** Rand um eingepasste Punkte (Welt-Einheiten): Felder, Figuren und Schilder haben Ausdehnung. */
const FIT_PAD = 1.3;
/** Höhe über dem Boden, die beim Einpassen mit ins Bild muss (Figur samt Pfeil). */
const FIT_HEIGHT = 2.8;
/**
 * Nutzbarer Bildanteil beim Einpassen (Anteil der halben Bildbreite/-höhe): oben Titel und
 * Banner, unten die Spielerleiste (gut ein Fünftel der Bildhöhe). Der Überblick des Wackelwalds
 * liegt damit etwa 10 % weiter weg als die bisherige Vollansicht, die vorderste Feldreihe aber
 * nicht mehr knapp an der Spielerleiste.
 */
const SAFE = { x: 0.92, top: 0.76, bottom: 0.56 } as const;

export type ShotKind = 'overview' | 'follow' | 'walk' | 'event' | 'fit';

/** Eine Kamera-Einstellung: Ziel der Feder. */
export interface CameraShot {
  readonly kind: ShotKind;
  readonly focus: Point2;
  readonly distance: number;
  readonly smoothMs: number;
}

/** Figur, wie sie gerade im Bild steht (Welt-Koordinaten des Hosts, Babylon). */
export interface CameraPawn {
  readonly slot: number;
  readonly x: number;
  readonly z: number;
}

export interface ShotInput {
  readonly board: BoardDefinition;
  readonly view: BoardView | null;
  /** `BoardFrame.cues` der Regie. */
  readonly cues: readonly FrameCue[];
  readonly pawns: readonly CameraPawn[];
}

/** Kamera-Pose zum Blickpunkt `focus` im Abstand `distance`, fester Blickwinkel. */
export function cameraPose(focus: Point2, distance: number): ViewCamera {
  const target: Point3 = { x: focus.x, y: 0, z: focus.z + aimZ(distance) };
  return {
    target,
    position: {
      x: target.x + CAMERA_DIRECTION.x * distance,
      y: target.y + CAMERA_DIRECTION.y * distance,
      z: target.z + CAMERA_DIRECTION.z * distance,
    },
  };
}

/** Passen alle Punkte bei diesem Blickpunkt und Abstand in den sicheren Bildbereich? */
function fits(points: readonly Point3[], focus: Point2, distance: number): boolean {
  const camera = cameraPose(focus, distance);
  const tanV = Math.tan(CAMERA_FOV / 2);
  const tanH = tanV * CAMERA_ASPECT;
  for (const p of points) {
    const v = projectToView(camera, p);
    if (v.depth <= 0) return false;
    if (Math.abs(v.x) > tanH * SAFE.x) return false;
    if (v.y > tanV * SAFE.top || v.y < -tanV * SAFE.bottom) return false;
  }
  return true;
}

/** Senkrechte Ausdehnung der Punkte im Bild (Mitte) bei dieser Pose. */
function verticalMid(points: readonly Point3[], focus: Point2, distance: number): number {
  const camera = cameraPose(focus, distance);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    const { y } = projectToView(camera, p);
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return (lo + hi) / 2;
}

/**
 * Blickpunkt in der Tiefe so verschieben, dass die Punkte senkrecht mittig im sicheren Bereich
 * stehen (oben Titel, unten die höhere Spielerleiste). Zwei Newton-Schritte genügen: Die Lage
 * im Bild hängt fast linear von der Verschiebung ab.
 */
function centered(points: readonly Point3[], focus: Point2, distance: number): Point2 {
  const tanV = Math.tan(CAMERA_FOV / 2);
  const want = (tanV * (SAFE.top - SAFE.bottom)) / 2;
  let z = focus.z;
  for (let i = 0; i < 2; i++) {
    const mid = verticalMid(points, { x: focus.x, z }, distance);
    const slope = verticalMid(points, { x: focus.x, z: z + 1 }, distance) - mid;
    if (Math.abs(slope) < 1e-9) break;
    z += (want - mid) / slope;
  }
  return { x: focus.x, z };
}

/**
 * Kleinster Abstand (≥ `min`), bei dem die Bodenpunkte `ground` samt Rand und Figurenhöhe ins
 * Bild passen; der Blickpunkt steht seitlich in ihrer Mitte und in der Tiefe so, dass sie
 * mittig im sicheren Bildbereich liegen. Binäre Suche über die Projektion.
 */
export function fitShot(
  ground: readonly Point2[],
  min: number = SHOT_DISTANCE.minFit,
): { focus: Point2; distance: number } {
  if (ground.length === 0) return { focus: { x: 0, z: 0 }, distance: min };
  // Dieselben Punkte kommen Bild für Bild wieder (offener Prompt, Gabel): Ergebnis merken.
  // Auf der Apple TV läuft der JS-Kern ohne JIT, dort kostet die Suche sonst je Takt spürbar.
  const key = `${min}|${ground.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`).join(';')}`;
  const known = fitMemo.get(key);
  if (known) return known;
  const result = searchFit(ground, min);
  if (fitMemo.size >= FIT_MEMO_SIZE) {
    const oldest = fitMemo.keys().next().value;
    if (oldest !== undefined) fitMemo.delete(oldest);
  }
  fitMemo.set(key, result);
  return result;
}

const FIT_MEMO_SIZE = 64;
const fitMemo = new Map<string, { readonly focus: Point2; readonly distance: number }>();

function searchFit(ground: readonly Point2[], min: number): { focus: Point2; distance: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of ground) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const middle = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const points: Point3[] = [];
  for (const x of [minX - FIT_PAD, maxX + FIT_PAD]) {
    for (const z of [minZ - FIT_PAD, maxZ + FIT_PAD]) {
      points.push({ x, y: 0, z }, { x, y: FIT_HEIGHT, z });
    }
  }
  const at = (distance: number) => {
    const focus = centered(points, middle, distance);
    return { focus, distance, ok: fits(points, focus, distance) };
  };
  const max: number = SHOT_DISTANCE.max;
  const near = at(min);
  if (near.ok) return { focus: near.focus, distance: min };
  const far = at(max);
  if (!far.ok) return { focus: far.focus, distance: max };
  let lo: number = min;
  let best = far;
  for (let i = 0; i < 24; i++) {
    const mid = at((lo + best.distance) / 2);
    if (mid.ok) best = mid;
    else lo = mid.distance;
  }
  return { focus: best.focus, distance: best.distance };
}

/** Überblick über alle Felder eines Bretts. */
export function overviewShot(board: BoardDefinition): CameraShot {
  const { focus, distance } = fitShot(board.spaces.map((s) => s.position));
  return { kind: 'overview', focus, distance, smoothMs: SHOT_SMOOTH_MS.overview };
}

/**
 * Wegwahl an einer Gabel: Gabel, die Zielfelder und je ein Feld dahinter, damit beide Wege
 * lesbar sind. Auch für die Lage der Wegweiser (`createBoardScene.ts`).
 */
export function forkShot(board: BoardDefinition, forkId: string): CameraShot {
  const byId = spaceIndex(board);
  const fork = byId.get(forkId);
  const points: Point2[] = [];
  if (fork) {
    points.push(fork.position);
    for (const id of fork.next) {
      const target = byId.get(id);
      if (!target) continue;
      points.push(target.position);
      const beyond = target.next[0] === undefined ? undefined : byId.get(target.next[0]);
      if (beyond) points.push(beyond.position);
    }
  }
  const { focus, distance } = fitShot(points);
  return { kind: 'fit', focus, distance, smoothMs: SHOT_SMOOTH_MS.fit };
}

const indexCache = new WeakMap<BoardDefinition, Map<string, BoardDefinition['spaces'][number]>>();
function spaceIndex(board: BoardDefinition): Map<string, BoardDefinition['spaces'][number]> {
  let index = indexCache.get(board);
  if (!index) {
    index = new Map(board.spaces.map((s) => [s.id, s]));
    indexCache.set(board, index);
  }
  return index;
}

const boundsCache = new WeakMap<BoardDefinition, BoardBounds>();

/** Anteil der halben Bildbreite, um den nahe Einstellungen vom seitlichen Brettrand wegbleiben. */
const EDGE_KEEP = 0.55;

/**
 * Nahe Einstellungen nicht seitlich übers Brett hinaus: Der Blickpunkt bleibt so weit innerhalb
 * der Felder, dass am linken oder rechten Rand nicht ein Drittel des Bilds leer ist. Die Figur
 * rückt dann aus der Mitte, bleibt aber im Bild (höchstens `EDGE_KEEP` der halben Bildbreite).
 * In der Tiefe nicht: Dort schöbe es Figuren am vorderen Rand unter die Spielerleiste und am
 * hinteren unter den Titel.
 */
export function keepOnBoard(board: BoardDefinition, shot: CameraShot): CameraShot {
  let bounds = boundsCache.get(board);
  if (!bounds) {
    bounds = boardBounds(board);
    boundsCache.set(board, bounds);
  }
  const tanV = Math.tan(CAMERA_FOV / 2);
  const halfWidth = shot.distance * tanV * CAMERA_ASPECT * EDGE_KEEP;
  const lo = bounds.minX + halfWidth;
  const hi = bounds.maxX - halfWidth;
  const x = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, shot.focus.x));
  return x === shot.focus.x ? shot : { ...shot, focus: { x, z: shot.focus.z } };
}

const overviewCache = new WeakMap<BoardDefinition, CameraShot>();
function cachedOverview(board: BoardDefinition): CameraShot {
  let shot = overviewCache.get(board);
  if (!shot) {
    shot = overviewShot(board);
    overviewCache.set(board, shot);
  }
  return shot;
}

function closeShot(at: Point2, kind: 'follow' | 'event'): CameraShot {
  return {
    kind,
    focus: { x: at.x, z: at.z },
    distance: SHOT_DISTANCE[kind],
    smoothMs: SHOT_SMOOTH_MS[kind],
  };
}

function fit(points: readonly (Point2 | undefined)[]): CameraShot | null {
  const present = points.filter((p): p is Point2 => p !== undefined);
  if (present.length === 0) return null;
  const { focus, distance } = fitShot(present);
  return { kind: 'fit', focus, distance, smoothMs: SHOT_SMOOTH_MS.fit };
}

/**
 * Laufen: Blickpunkt ein Stück voraus entlang des restlichen Wegs (`WALK_LOOKAHEAD`), ab der
 * aktuellen Lage der Figur. Der Sprung, in dem sie gerade ist, folgt aus der Zeit (wie `hopAt`).
 */
export function walkShot(
  pawn: Point2,
  path: readonly Point2[],
  elapsedMs: number,
  durationMs: number,
): CameraShot {
  const step = path.length > 0 ? durationMs / path.length : 0;
  const index = step > 0 ? Math.min(path.length - 1, Math.max(0, Math.floor(elapsedMs / step))) : 0;
  let left = WALK_LOOKAHEAD;
  let from = pawn;
  let focus = pawn;
  for (let i = index; i < path.length && left > 0; i++) {
    const to = path[i];
    if (!to) break;
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    if (len >= left) {
      const k = left / len;
      focus = { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k };
      break;
    }
    left -= len;
    from = to;
    focus = to;
  }
  return { kind: 'walk', focus, distance: SHOT_DISTANCE.walk, smoothMs: SHOT_SMOOTH_MS.walk };
}

/** Wie lange ein Ereignis die Kamera hält (ms ab Start); 0 = es bekommt keine eigene Einstellung. */
export function cueHoldMs(cue: FrameCue): number {
  const { event, durationMs } = cue;
  switch (event.type) {
    case 'moved':
      return durationMs + WALK_SETTLE_MS;
    case 'round-started':
    case 'trophy-moved':
      return Math.max(durationMs, OVERVIEW_HOLD_MS);
    case 'board-event':
      return event.event === 'trophy-shuffle' || event.event === 'coin-rain'
        ? Math.max(durationMs, OVERVIEW_HOLD_MS)
        : Math.max(durationMs, EVENT_HOLD_MS);
    case 'dice-rolled':
    case 'coins-changed':
    case 'coins-stolen':
    case 'item-gained':
    case 'item-used':
    case 'trap-placed':
    case 'trap-triggered':
    case 'trophy-bought':
    case 'reaction-resolved':
      return durationMs > 0 ? Math.max(durationMs, EVENT_HOLD_MS) : 0;
    default:
      return 0;
  }
}

/** Einstellung zu einem Ereignis oder `null` (dann gilt die nächstältere bzw. der Stand). */
function cueShot(
  cue: FrameCue,
  input: ShotInput,
  pawnAt: (slot: number) => Point2 | undefined,
): CameraShot | null {
  const { event } = cue;
  const spaces = spaceIndex(input.board);
  const spaceAt = (id: string | null | undefined) =>
    id == null ? undefined : spaces.get(id)?.position;
  const close = (at: Point2 | undefined) => (at ? closeShot(at, 'event') : null);
  switch (event.type) {
    case 'moved': {
      const pawn = pawnAt(event.slot);
      if (!pawn) return null;
      if (cue.style === 'walk') {
        const path = event.path.map(spaceAt).filter((p): p is Point2 => p !== undefined);
        return walkShot(pawn, path, cue.elapsedMs, cue.durationMs);
      }
      // Windstoß und Platztausch: Start und Ziel (beider Figuren) im Bild.
      const partner = cue.partner;
      return fit([
        spaceAt(cue.start),
        spaceAt(event.path[event.path.length - 1]),
        partner ? spaceAt(partner.start) : undefined,
        partner ? spaceAt(partner.event.path[partner.event.path.length - 1]) : undefined,
      ]);
    }
    case 'round-started':
      return cachedOverview(input.board);
    case 'trophy-moved':
      return fit([spaceAt(event.from), spaceAt(event.to)]);
    case 'board-event':
      if (event.event === 'trophy-shuffle') return cachedOverview(input.board);
      if (event.event === 'coin-rain') return fit(input.pawns.map((p) => ({ x: p.x, z: p.z })));
      return close(pawnAt(event.slot));
    case 'coins-stolen':
      return fit([pawnAt(event.from), pawnAt(event.to)]);
    case 'item-used':
      return event.target === undefined
        ? close(pawnAt(event.slot))
        : fit([pawnAt(event.slot), pawnAt(event.target)]);
    case 'trap-placed':
      return close(spaceAt(event.spaceId));
    case 'dice-rolled':
    case 'coins-changed':
    case 'item-gained':
    case 'trap-triggered':
    case 'trophy-bought':
    case 'reaction-resolved':
      return close(pawnAt(event.slot));
    default:
      return null;
  }
}

const OVERVIEW_PHASES = new Set<BoardView['gamePhase']>([
  'setup',
  'minigame-intro',
  'minigame-play',
  'minigame-results',
  'round-end',
  'game-results',
]);

/** Einstellung aus dem gezeigten Stand, wenn kein Ereignis die Kamera hält. */
function stateShot(input: ShotInput, pawnAt: (slot: number) => Point2 | undefined): CameraShot {
  const { view, board } = input;
  if (!view || OVERVIEW_PHASES.has(view.gamePhase)) return cachedOverview(board);
  const active = view.activeSlot === null ? undefined : pawnAt(view.activeSlot);
  const prompt = view.prompt;
  if (prompt) {
    switch (prompt.kind) {
      case 'path': {
        const player = view.players.find((p) => p.slot === prompt.slot);
        // Ohne die Lage der Figur: genau die Pose, für die die Wegweiser dem Pfeil ausweichen.
        if (player) return forkShot(board, player.spaceId);
        break;
      }
      case 'target': {
        const shot = fit([
          pawnAt(prompt.slot),
          ...prompt.options.map((o) => (o.slot === undefined ? undefined : pawnAt(o.slot))),
        ]);
        if (shot) return shot;
        break;
      }
      case 'reaction': {
        const shot = fit([
          pawnAt(prompt.slot),
          view.activeSlot === null ? undefined : pawnAt(view.activeSlot),
        ]);
        if (shot) return shot;
        break;
      }
      default:
        break;
    }
  }
  return active ? closeShot(active, 'follow') : cachedOverview(board);
}

/**
 * Einstellung für diesen Moment: das neueste Ereignis, das die Kamera noch hält
 * (`cueHoldMs`) und eine Einstellung hat; sonst der Stand (Prompt, Figur am Zug, Überblick).
 */
export function cameraShot(input: ShotInput): CameraShot {
  const pawnAt = (slot: number): Point2 | undefined => {
    const pawn = input.pawns.find((p) => p.slot === slot);
    return pawn ? { x: pawn.x, z: pawn.z } : undefined;
  };
  const near = (shot: CameraShot) =>
    shot.kind === 'follow' || shot.kind === 'event' || shot.kind === 'walk'
      ? keepOnBoard(input.board, shot)
      : shot;
  for (let i = input.cues.length - 1; i >= 0; i--) {
    const cue = input.cues[i];
    if (!cue || cue.elapsedMs >= cueHoldMs(cue)) continue;
    const shot = cueShot(cue, input, pawnAt);
    if (shot) return near(shot);
  }
  return near(stateShot(input, pawnAt));
}

// ---------------------------------------------------------------------------
// Feder
// ---------------------------------------------------------------------------

interface Spring {
  value: number;
  velocity: number;
}

/**
 * Kritisch gedämpfte Feder, exakt über `dtMs` gelöst (Ziel in dem Schritt fest): kein
 * Überschwingen, stetige Geschwindigkeit, unabhängig von der Schrittweite. `smoothMs` wie bei
 * Unitys SmoothDamp (ω = 2 / smoothMs).
 */
export function springStep(spring: Spring, target: number, dtMs: number, smoothMs: number): void {
  if (dtMs <= 0) return;
  if (smoothMs <= 0) {
    spring.value = target;
    spring.velocity = 0;
    return;
  }
  const omega = 2 / smoothMs;
  const x0 = spring.value - target;
  const v0 = spring.velocity;
  const decay = Math.exp(-omega * dtMs);
  const k = v0 + omega * x0;
  spring.value = target + (x0 + k * dtMs) * decay;
  spring.velocity = (v0 - omega * k * dtMs) * decay;
}

export interface CameraState {
  readonly focus: Point2;
  readonly distance: number;
  readonly pose: ViewCamera;
  readonly shot: CameraShot;
}

export interface CameraRig {
  /**
   * Lässt `dtMs` vergehen und zieht zur Einstellung `shot`. Der erste Aufruf (oder nach
   * `reset`) setzt die Kamera ohne Fahrt.
   */
  advance(dtMs: number, shot: CameraShot): CameraState;
  /** Nächster `advance` springt (z. B. Brett nach Minispiel wieder sichtbar). */
  reset(): void;
  current(): CameraState | null;
}

export function createCameraRig(): CameraRig {
  const x: Spring = { value: 0, velocity: 0 };
  const z: Spring = { value: 0, velocity: 0 };
  const d: Spring = { value: BASE_DISTANCE, velocity: 0 };
  let placed = false;
  let state: CameraState | null = null;

  return {
    advance(dtMs, shot) {
      if (!placed) {
        x.value = shot.focus.x;
        z.value = shot.focus.z;
        d.value = shot.distance;
        x.velocity = z.velocity = d.velocity = 0;
        placed = true;
      } else {
        // Weite Fahrt (Zugwechsel, Gabel weit weg): unterwegs etwas höher, damit man sieht,
        // wohin es geht; die Feder macht daraus ein weiches Auf und Ab.
        const travel = Math.hypot(shot.focus.x - x.value, shot.focus.z - z.value);
        const lift = Math.min(MAX_PULLBACK, travel * PULLBACK_PER_UNIT);
        springStep(x, shot.focus.x, dtMs, shot.smoothMs);
        springStep(z, shot.focus.z, dtMs, shot.smoothMs);
        springStep(d, Math.min(SHOT_DISTANCE.max, shot.distance + lift), dtMs, shot.smoothMs);
      }
      const focus = { x: x.value, z: z.value };
      state = { focus, distance: d.value, pose: cameraPose(focus, d.value), shot };
      return state;
    },
    reset() {
      placed = false;
    },
    current() {
      return state;
    },
  };
}
