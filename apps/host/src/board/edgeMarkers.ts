/**
 * Randmarker für Figuren außerhalb des Bilds (CHAOS-210): eine TypeScript-Wahrheit für PC-Host
 * (React-HUD) und Apple-Host (SwiftUI über `renderState().board.markers`). Die Hosts zeichnen
 * nur noch, was `createEdgeMarkers().advance` liefert.
 *
 * - Lage: Die Figur wird mit der nachgezogenen Kamera-Pose projiziert (wie `fitShot` in
 *   `camera.ts`). Liegt ihre Mitte außerhalb des sicheren Bildbereichs (`SAFE`: oben Titel und
 *   Banner, unten die Spielerleiste), sitzt der Marker dort, wo der Strahl von der Mitte des
 *   sicheren Bereichs zur Figur den etwas eingerückten Rand trifft; sein Pfeil zeigt zur Figur.
 * - Mehrere Marker am selben Rand rücken auseinander (`MARKER_GAP`).
 * - Ruhig: Ein Marker erscheint erst, wenn die Figur `SHOW_DELAY_MS` lang draußen steht (keine
 *   Blitzer bei Kamerafahrten), mit Schwelle in beide Richtungen (`HYSTERESIS`), und blendet in
 *   `FADE_MS` ein und aus. Beim Ausblenden bleibt er stehen.
 * - Nur wenn es dem Spiel dient: nicht im Überblick (`kind: 'overview'`), nicht außerhalb der
 *   Züge (`OVERVIEW_PHASES`), nicht für die Figur am Zug (zu ihr fährt die Kamera ohnehin) und
 *   nicht für Figuren im Flug (Windstoß, Platztausch: Ihr Bogen führt kurz übers Bild hinaus).
 *
 * Koordinaten der Marker: Anteile des Bilds ab oben links (0…1), Winkel im Bild (Bogenmaß,
 * 0 = nach rechts, positiv im Uhrzeigersinn wie CSS `rotate`). Alles hängt nur von `dtMs` ab:
 * bildratenunabhängig und mit festen Schritten (Testmodus) deterministisch.
 */
import type { BoardView, SlotNumber } from '@chaos-party/protocol';
import { CAMERA_FOV, OVERVIEW_PHASES, SAFE, type ShotKind } from './camera.ts';
import { projectToView, type ViewCamera } from './layout.ts';

/** Höhe über dem Boden, die als Mitte der Figur zählt (halbe Figurenhöhe). */
export const MARKER_PAWN_HEIGHT = 1.2;
/**
 * Abstand der Marker-Mitte vom Rand des sicheren Bereichs, in halben Bildhöhen (gut drei
 * Prozent der Bildhöhe Radius plus Luft). Waagerecht im selben Pixelmaß.
 */
export const MARKER_INSET = 0.1;
/** Kleinster Abstand zweier Marker-Mitten am selben Rand (halbe Bildhöhen). */
export const MARKER_GAP = 0.17;
/** Schwelle (halbe Bildhöhe bzw. -breite) gegen Flackern am Rand des sicheren Bereichs. */
export const HYSTERESIS = 0.04;
/** So lange muss eine Figur draußen stehen, bevor ihr Marker erscheint (ms). */
export const SHOW_DELAY_MS = 350;
/** Dauer des Ein- bzw. Ausblendens (ms). */
export const FADE_MS = 300;

export type MarkerEdge = 'left' | 'right' | 'top' | 'bottom';

/** Ein sichtbarer Randmarker. */
export interface EdgeMarker {
  readonly slot: SlotNumber;
  /** Mitte, Anteil der Bildbreite ab links (0…1). */
  readonly x: number;
  /** Mitte, Anteil der Bildhöhe ab oben (0…1). */
  readonly y: number;
  /** Richtung zur Figur im Bild (Bogenmaß, 0 = rechts, positiv im Uhrzeigersinn). */
  readonly angle: number;
  /** Deckkraft (0…1] beim Ein- und Ausblenden. */
  readonly opacity: number;
}

/** Figur für die Marker (Welt-Koordinaten des Hosts, Babylon). */
export interface MarkerPawn {
  readonly slot: SlotNumber;
  readonly x: number;
  readonly z: number;
  /** Im Flug (Windstoß, Platztausch): Marker bleibt, wie er ist. */
  readonly flying: boolean;
}

export interface MarkerInput {
  /** Nachgezogene Pose der Kamera (`CameraState.pose`), nicht das Ziel der Einstellung. */
  readonly pose: ViewCamera;
  /** Seitenverhältnis des Bilds (Breite / Höhe). */
  readonly aspect: number;
  readonly pawns: readonly MarkerPawn[];
  /** Ob Marker überhaupt dienen (`markersWanted`). */
  readonly show: boolean;
  /** Figur am Zug: bekommt keinen Marker. */
  readonly activeSlot: SlotNumber | null;
}

/** Marker nur in Zügen und nicht im Überblick. */
export function markersWanted(view: BoardView | null, shot: ShotKind | null): boolean {
  if (!view || OVERVIEW_PHASES.has(view.gamePhase)) return false;
  return shot !== null && shot !== 'overview';
}

/** Punkt im Bild: x, y in halben Bildbreiten bzw. -höhen (−1…1 = Bild), y nach oben. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Projektion der Figurenmitte ins Bild; hinter der Kamera weit draußen in ihrer Richtung. */
export function projectPawn(
  pose: ViewCamera,
  aspect: number,
  pawn: Pick<MarkerPawn, 'x' | 'z'>,
): ScreenPoint {
  const tanV = Math.tan(CAMERA_FOV / 2);
  const tanH = tanV * aspect;
  const v = projectToView(pose, { x: pawn.x, y: MARKER_PAWN_HEIGHT, z: pawn.z });
  if (!(v.depth > 1e-6)) {
    // Hinter der Kamera: seitliche Richtung zählt, weit außerhalb des Bilds.
    const sx = v.x * v.depth;
    const sy = v.y * v.depth;
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || (sx === 0 && sy === 0)) {
      return { x: 0, y: -1e3 };
    }
    return { x: (sx / tanH) * 1e3, y: (sy / tanV) * 1e3 };
  }
  return { x: v.x / tanH, y: v.y / tanV };
}

/** Wie weit ein Punkt außerhalb des sicheren Bereichs liegt (> 0 draußen, < 0 drinnen). */
export function outsideBy(p: ScreenPoint): number {
  return Math.max(Math.abs(p.x) - SAFE.x, p.y - SAFE.top, -SAFE.bottom - p.y);
}

interface EdgeSpot {
  /** Mitte des Markers in halben Bildbreiten bzw. -höhen. */
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly edge: MarkerEdge;
}

/** Eingerückter Rahmen, auf dem die Marker-Mitten liegen. */
function markerFrame(aspect: number) {
  return {
    x: SAFE.x - MARKER_INSET / aspect,
    top: SAFE.top - MARKER_INSET,
    bottom: -SAFE.bottom + MARKER_INSET,
  };
}

/** Mitte des sicheren Bereichs: Von hier zeigt der Strahl zur Figur. */
const CENTER_Y = (SAFE.top - SAFE.bottom) / 2;

/** Randpunkt und Richtung für eine Figur außerhalb des Bilds. */
export function edgeSpot(p: ScreenPoint, aspect: number): EdgeSpot {
  const frame = markerFrame(aspect);
  const dx = p.x;
  const dy = p.y - CENTER_Y;
  const tx = dx === 0 ? Infinity : frame.x / Math.abs(dx);
  const ty =
    dy === 0 ? Infinity : (dy > 0 ? frame.top - CENTER_Y : CENTER_Y - frame.bottom) / Math.abs(dy);
  const t = Math.min(tx, ty, 1);
  const edge: MarkerEdge = tx <= ty ? (dx < 0 ? 'left' : 'right') : dy > 0 ? 'top' : 'bottom';
  return {
    x: dx * t,
    y: CENTER_Y + dy * t,
    // Im Bild: Pixelmaß (Breite × Seitenverhältnis), y nach unten.
    angle: Math.atan2(-dy, dx * aspect),
    edge,
  };
}

/**
 * Marker am selben Rand auseinanderrücken: der Reihe nach mindestens `MARKER_GAP`, die Gruppe
 * bleibt im Rahmen. Liefert die verschobenen Mitten in derselben Reihenfolge.
 */
export function spreadSpots(spots: readonly EdgeSpot[], aspect: number): EdgeSpot[] {
  const frame = markerFrame(aspect);
  const out = [...spots];
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    const along = edge === 'top' || edge === 'bottom' ? 'x' : 'y';
    const gap = along === 'x' ? MARKER_GAP / aspect : MARKER_GAP;
    const lo = along === 'x' ? -frame.x : frame.bottom;
    const hi = along === 'x' ? frame.x : frame.top;
    const group = out
      .map((spot, index) => ({ spot, index }))
      .filter(({ spot }) => spot.edge === edge)
      .sort((a, b) => a.spot[along] - b.spot[along] || a.index - b.index);
    if (group.length < 2) continue;
    const pos = group.map(({ spot }) => spot[along]);
    for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i] ?? 0, (pos[i - 1] ?? 0) + gap);
    const last = pos.length - 1;
    if ((pos[last] ?? 0) > hi) {
      pos[last] = hi;
      for (let i = last - 1; i >= 0; i--) pos[i] = Math.min(pos[i] ?? 0, (pos[i + 1] ?? 0) - gap);
    }
    if ((pos[0] ?? 0) < lo) {
      // Mehr Marker, als an den Rand passen: gleichmäßig verteilen.
      const step = last > 0 ? (hi - lo) / last : 0;
      for (let i = 0; i <= last; i++) pos[i] = lo + step * i;
    }
    group.forEach(({ spot, index }, i) => {
      out[index] = { ...spot, [along]: pos[i] ?? spot[along] };
    });
  }
  return out;
}

interface SlotState {
  /** Marker gilt als sichtbar (Ziel der Deckkraft 1). */
  shown: boolean;
  /** So lange steht die Figur ununterbrochen draußen (ms). */
  outsideMs: number;
  opacity: number;
  spot: EdgeSpot | null;
}

export interface EdgeMarkerTracker {
  /** Lässt `dtMs` vergehen und liefert die Marker für dieses Bild (nach Slot sortiert). */
  advance(dtMs: number, input: MarkerInput): EdgeMarker[];
  /** Alles vergessen (Kamera springt, z. B. erstes Bild): Marker kommen neu verzögert. */
  reset(): void;
  current(): readonly EdgeMarker[];
}

const round = (v: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export function createEdgeMarkers(): EdgeMarkerTracker {
  const states = new Map<SlotNumber, SlotState>();
  let markers: EdgeMarker[] = [];

  return {
    advance(dtMs, input) {
      const dt = Math.max(0, dtMs);
      const present = new Set<SlotNumber>();
      for (const pawn of input.pawns) {
        present.add(pawn.slot);
        let state = states.get(pawn.slot);
        if (!state) {
          state = { shown: false, outsideMs: 0, opacity: 0, spot: null };
          states.set(pawn.slot, state);
        }
        const eligible = input.show && pawn.slot !== input.activeSlot;
        if (!eligible) {
          state.shown = false;
          state.outsideMs = 0;
        } else if (!pawn.flying) {
          const p = projectPawn(input.pose, input.aspect, pawn);
          const out = outsideBy(p);
          const outside = state.shown ? out > -HYSTERESIS : out > HYSTERESIS;
          if (outside) {
            state.outsideMs += dt;
            state.spot = edgeSpot(p, input.aspect);
            if (state.outsideMs >= SHOW_DELAY_MS) state.shown = true;
          } else {
            state.outsideMs = 0;
            state.shown = false;
          }
        }
        const target = state.shown ? 1 : 0;
        const step = dt / FADE_MS;
        state.opacity =
          target > state.opacity
            ? Math.min(target, state.opacity + step)
            : Math.max(target, state.opacity - step);
      }
      for (const slot of [...states.keys()]) if (!present.has(slot)) states.delete(slot);

      const visible: { slot: SlotNumber; opacity: number; spot: EdgeSpot }[] = [];
      for (const [slot, s] of states) {
        if (round(s.opacity, 3) > 0 && s.spot)
          visible.push({ slot, opacity: s.opacity, spot: s.spot });
      }
      visible.sort((a, b) => a.slot - b.slot);
      const spots = spreadSpots(
        visible.map((v) => v.spot),
        input.aspect,
      );
      markers = visible.map(({ slot, opacity, spot: own }, i) => {
        const spot = spots[i] ?? own;
        return {
          slot,
          x: round((spot.x + 1) / 2, 4),
          y: round((1 - spot.y) / 2, 4),
          angle: round(spot.angle, 3),
          opacity: round(opacity, 3),
        };
      });
      return markers;
    },
    reset() {
      states.clear();
      markers = [];
    },
    current() {
      return markers;
    },
  };
}
