import { WACKELWALD } from '@chaos-party/game-core';
import type { BoardView, SlotNumber } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { CAMERA_ASPECT, cameraPose, cameraShot, createCameraRig, SAFE } from './camera.ts';
import { createDemoMessages, DEMO_VIEW } from './demo.ts';
import { createBoardDirector } from './director.ts';
import {
  createEdgeMarkers,
  edgeSpot,
  FADE_MS,
  HYSTERESIS,
  MARKER_GAP,
  markersWanted,
  outsideBy,
  projectPawn,
  SHOW_DELAY_MS,
  spreadSpots,
  type EdgeMarker,
  type MarkerInput,
  type MarkerPawn,
} from './edgeMarkers.ts';
import type { Point2 } from './layout.ts';

const STEP = 1000 / 60;
/** Nahe Einstellung auf den Ursprung (wie beim Würfeln). */
const POSE = cameraPose({ x: 0, z: 0 }, 17);
const ME: MarkerPawn = { slot: 1, x: 0, z: 0, flying: false };

function input(pawns: readonly MarkerPawn[], extra: Partial<MarkerInput> = {}): MarkerInput {
  return { pose: POSE, aspect: CAMERA_ASPECT, pawns, show: true, activeSlot: 1, ...extra };
}

/** Lässt `ms` in 60-Hz-Schritten vergehen; liefert die Marker des letzten Schritts. */
function run(
  tracker: ReturnType<typeof createEdgeMarkers>,
  ms: number,
  value: MarkerInput,
): EdgeMarker[] {
  let out: EdgeMarker[] = [];
  for (let t = 0; t < ms - 1e-9; t += STEP) out = tracker.advance(Math.min(STEP, ms - t), value);
  return out;
}

const pawn = (slot: SlotNumber, at: Point2, flying = false): MarkerPawn => ({
  slot,
  ...at,
  flying,
});

describe('Randmarker: Lage (CHAOS-210)', () => {
  it('Figur im Bild: kein Marker', () => {
    expect(outsideBy(projectPawn(POSE, CAMERA_ASPECT, { x: 2, z: 1 }))).toBeLessThan(0);
    const tracker = createEdgeMarkers();
    expect(run(tracker, 2000, input([ME, pawn(2, { x: 2, z: 1 })]))).toEqual([]);
  });

  it.each([
    ['rechts', { x: 30, z: 0 }, 0],
    ['links', { x: -30, z: 0 }, Math.PI],
    ['oben (hinten)', { x: 0, z: 40 }, -Math.PI / 2],
    ['unten (vorn)', { x: 0, z: -14 }, Math.PI / 2],
  ] as const)('Figur %s: Marker am passenden Rand, Pfeil zu ihr', (_name, at, angle) => {
    const tracker = createEdgeMarkers();
    const [marker] = run(tracker, 1000, input([ME, pawn(2, at)]));
    expect(marker?.slot).toBe(2);
    expect(marker?.opacity).toBe(1);
    // Winkel bis auf die Neigung durch den Strahl ab der Mitte des sicheren Bereichs.
    const diff = Math.atan2(
      Math.sin((marker?.angle ?? 0) - angle),
      Math.cos((marker?.angle ?? 0) - angle),
    );
    expect(Math.abs(diff)).toBeLessThan(0.35);
    // Im Bild, innerhalb des sicheren Bereichs (nicht unter Spielerleiste oder Titel).
    const x = (marker?.x ?? 0) * 2 - 1;
    const y = 1 - (marker?.y ?? 0) * 2;
    expect(Math.abs(x)).toBeLessThan(SAFE.x);
    expect(y).toBeLessThan(SAFE.top);
    expect(y).toBeGreaterThan(-SAFE.bottom);
  });

  it('unter der Spielerleiste zählt als außerhalb', () => {
    // Knapp vor der Figur am Zug: noch im Bild, aber im unteren Fünftel (Spielerleiste).
    let z = 0;
    let p = projectPawn(POSE, CAMERA_ASPECT, { x: 0, z });
    while (p.y > -SAFE.bottom - 0.1) {
      z -= 0.1;
      p = projectPawn(POSE, CAMERA_ASPECT, { x: 0, z });
    }
    expect(p.y).toBeGreaterThan(-1);
    const tracker = createEdgeMarkers();
    const [marker] = run(tracker, 1000, input([ME, pawn(3, { x: 0, z })]));
    expect(marker?.slot).toBe(3);
    expect(marker?.y).toBeLessThan((1 + SAFE.bottom) / 2);
  });

  it('hinter der Kamera: endlich und weit draußen', () => {
    const p = projectPawn(POSE, CAMERA_ASPECT, { x: 3, z: -60 });
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(outsideBy(p)).toBeGreaterThan(1);
    const spot = edgeSpot(p, CAMERA_ASPECT);
    expect(Math.abs(spot.x)).toBeLessThanOrEqual(SAFE.x);
  });

  it('mehrere Marker am selben Rand rücken auseinander', () => {
    const spots = spreadSpots(
      [
        { x: 0.8, y: 0.2, angle: 0, edge: 'right' },
        { x: 0.8, y: 0.21, angle: 0, edge: 'right' },
        { x: 0.8, y: 0.22, angle: 0, edge: 'right' },
        { x: 0.1, y: 0.6, angle: 0, edge: 'top' },
      ],
      CAMERA_ASPECT,
    );
    const ys = spots.slice(0, 3).map((s) => s.y);
    for (let i = 1; i < ys.length; i++) {
      expect((ys[i] ?? 0) - (ys[i - 1] ?? 0)).toBeGreaterThanOrEqual(MARKER_GAP - 1e-9);
    }
    expect(spots[3]).toEqual({ x: 0.1, y: 0.6, angle: 0, edge: 'top' });
    // Am Rand des Rahmens: Die Gruppe bleibt drin.
    const crowded = spreadSpots(
      [0, 1, 2].map(() => ({ x: 0.8, y: 0.66, angle: 0, edge: 'right' as const })),
      CAMERA_ASPECT,
    );
    expect(Math.max(...crowded.map((s) => s.y))).toBeLessThanOrEqual(SAFE.top);
  });

  it('Figuren nebeneinander außerhalb: Marker überdecken sich nicht', () => {
    const tracker = createEdgeMarkers();
    const markers = run(
      tracker,
      1000,
      input([ME, pawn(2, { x: 30, z: 0 }), pawn(3, { x: 30, z: 0.5 }), pawn(4, { x: 30, z: 1 })]),
    );
    expect(markers.map((m) => m.slot)).toEqual([2, 3, 4]);
    const ys = markers.map((m) => m.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      // Anteil der Bildhöhe: Abstand in halben Bildhöhen / 2.
      expect((ys[i] ?? 0) - (ys[i - 1] ?? 0)).toBeGreaterThanOrEqual(MARKER_GAP / 2 - 1e-3);
    }
  });
});

describe('Randmarker: Sichtbarkeit (CHAOS-210)', () => {
  const far = pawn(2, { x: 30, z: 0 });

  it('erscheint erst nach kurzer Zeit draußen und blendet ruhig ein', () => {
    const tracker = createEdgeMarkers();
    expect(run(tracker, SHOW_DELAY_MS - 20, input([ME, far]))).toEqual([]);
    const fading = run(tracker, 20 + FADE_MS / 2, input([ME, far]));
    expect(fading[0]?.opacity).toBeGreaterThan(0.3);
    expect(fading[0]?.opacity).toBeLessThan(0.7);
    expect(run(tracker, FADE_MS, input([ME, far]))[0]?.opacity).toBe(1);
  });

  it('kurz außerhalb (Kamerafahrt): kein Marker', () => {
    const tracker = createEdgeMarkers();
    for (let i = 0; i < 5; i++) {
      expect(run(tracker, SHOW_DELAY_MS * 0.8, input([ME, far]))).toEqual([]);
      expect(run(tracker, 200, input([ME, pawn(2, { x: 1, z: 0 })]))).toEqual([]);
    }
  });

  it('blendet aus, wenn die Figur ins Bild kommt, und bleibt dabei stehen', () => {
    const tracker = createEdgeMarkers();
    const [shown] = run(tracker, 1000, input([ME, far]));
    const [fading] = run(tracker, FADE_MS / 2, input([ME, pawn(2, { x: 1, z: 0 })]));
    expect(fading?.opacity).toBeLessThan(1);
    expect(fading?.opacity).toBeGreaterThan(0);
    expect({ x: fading?.x, y: fading?.y }).toEqual({ x: shown?.x, y: shown?.y });
    expect(run(tracker, FADE_MS, input([ME, pawn(2, { x: 1, z: 0 })]))).toEqual([]);
  });

  it('flackert nicht an der Kante des sicheren Bereichs', () => {
    // Figur rechts genau an der Kante: Lage mit outsideBy ≈ 0 suchen.
    let x = 0;
    while (outsideBy(projectPawn(POSE, CAMERA_ASPECT, { x, z: 0 })) < 0) x += 0.01;
    const tracker = createEdgeMarkers();
    run(tracker, 1000, input([ME, pawn(2, { x: x + 1.5, z: 0 })]));
    // Wackelt knapp um die Kante (weniger als die Schwelle): Marker bleibt.
    let min = 1;
    for (let i = 0; i < 20; i++) {
      const wobble = i % 2 === 0 ? -0.15 : 0.15;
      const out = outsideBy(projectPawn(POSE, CAMERA_ASPECT, { x: x + wobble, z: 0 }));
      expect(Math.abs(out)).toBeLessThan(HYSTERESIS);
      const [m] = run(tracker, 100, input([ME, pawn(2, { x: x + wobble, z: 0 })]));
      min = Math.min(min, m?.opacity ?? 0);
    }
    expect(min).toBe(1);
  });

  it('nicht für die Figur am Zug, nicht im Überblick, Figur im Flug bleibt stehen', () => {
    const tracker = createEdgeMarkers();
    expect(run(tracker, 1000, input([pawn(1, { x: 30, z: 0 })]))).toEqual([]);
    expect(run(tracker, 1000, input([ME, far], { show: false }))).toEqual([]);
    const [before] = run(tracker, 1000, input([ME, far]));
    // Im Flug weit nach links: Marker bleibt rechts stehen.
    const [flying] = run(tracker, 500, input([ME, pawn(2, { x: -30, z: 0 }, true)]));
    expect(flying).toEqual(before);
    // Überblick: blendet aus.
    expect(run(tracker, FADE_MS, input([ME, far], { show: false }))).toEqual([]);
  });

  it('markersWanted: nur in Zügen, nicht im Überblick', () => {
    const roll: BoardView = { ...DEMO_VIEW, gamePhase: 'roll' };
    expect(markersWanted(roll, 'follow')).toBe(true);
    expect(markersWanted(roll, 'fit')).toBe(true);
    expect(markersWanted(roll, 'overview')).toBe(false);
    expect(markersWanted({ ...roll, gamePhase: 'minigame-play' }, 'follow')).toBe(false);
    expect(markersWanted(null, 'follow')).toBe(false);
  });

  it('bildratenunabhängig: 60 Hz und 20 Hz enden gleich', () => {
    const a = createEdgeMarkers();
    const b = createEdgeMarkers();
    run(a, 1000, input([ME, far]));
    for (let i = 0; i < 20; i++) b.advance(50, input([ME, far]));
    expect(a.current()).toEqual(b.current());
  });
});

describe('Randmarker mit der Regie (CHAOS-210)', () => {
  it('Demo-Ablauf: deterministisch, Marker nur für andere Figuren, im sicheren Bereich', () => {
    const runDemo = () => {
      const director = createBoardDirector();
      const rig = createCameraRig();
      const tracker = createEdgeMarkers();
      const seen: string[] = [];
      const slots = new Set<number>();
      const last = new Map<number, number>();
      const pos = (id: string): Point2 =>
        WACKELWALD.spaces.find((s) => s.id === id)?.position ?? { x: 0, z: 0 };
      const messages = createDemoMessages();
      for (const [index, message] of messages.entries()) {
        director.receive(message);
        const frames = index === messages.length - 1 ? 300 : 120;
        for (let i = 0; i < frames; i++) {
          director.advance(STEP);
          const frame = director.getFrame();
          const pawns = frame.pawns.map((p) => ({ slot: p.slot, ...pos(p.spaceId) }));
          const state = rig.advance(
            STEP,
            cameraShot({ board: WACKELWALD, view: frame.view, cues: frame.cues, pawns }),
          );
          const markers = tracker.advance(STEP, {
            pose: state.pose,
            aspect: CAMERA_ASPECT,
            pawns: frame.pawns.map((p) => ({
              slot: p.slot,
              ...pos(p.spaceId),
              flying: p.hop !== null && p.hop.style !== 'walk',
            })),
            show: markersWanted(frame.view, state.shot.kind),
            activeSlot: frame.view?.activeSlot ?? null,
          });
          for (const m of markers) {
            // Die Figur am Zug bekommt keinen Marker; einer von vorher blendet nur noch aus.
            if (m.slot === frame.view?.activeSlot) {
              expect(m.opacity).toBeLessThan(last.get(m.slot) ?? 0);
            }
            expect(m.x).toBeGreaterThan(0);
            expect(m.x).toBeLessThan(1);
            expect(1 - m.y * 2).toBeLessThan(SAFE.top);
            expect(1 - m.y * 2).toBeGreaterThan(-SAFE.bottom);
            slots.add(m.slot);
          }
          last.clear();
          for (const m of markers) last.set(m.slot, m.opacity);
          seen.push(JSON.stringify(markers));
        }
      }
      return { seen, slots };
    };
    const a = runDemo();
    expect(a.seen).toEqual(runDemo().seen);
    // Nah an der Figur am Zug stehen andere Figuren im Demo-Ablauf zeitweise außerhalb.
    expect(a.slots.size).toBeGreaterThan(0);
  });
});
