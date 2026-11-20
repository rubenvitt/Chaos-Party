import { createRng, WACKELWALD, type BoardDefinition } from '@chaos-party/game-core';
import type { BoardEvent, BoardView } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import {
  BASE_DISTANCE,
  CAMERA_ASPECT,
  CAMERA_FOV,
  cameraPose,
  cameraShot,
  createCameraRig,
  fitShot,
  forkShot,
  OVERVIEW_HOLD_MS,
  SHOT_DISTANCE,
  springStep,
  WALK_LOOKAHEAD,
  walkShot,
  type CameraPawn,
  type CameraShot,
} from './camera.ts';
import { createDemoMessages, DEMO_VIEW } from './demo.ts';
import { createBoardDirector, type FrameCue } from './director.ts';
import { projectToView, type Point2, type ViewCamera } from './layout.ts';

const pos = (id: string, board: BoardDefinition = WACKELWALD): Point2 => {
  const space = board.spaces.find((s) => s.id === id);
  if (!space) throw new Error(`Feld ${id} fehlt`);
  return space.position;
};

/** Figuren auf ihren Feldern aus dem Stand (ohne Versatz; genügt für die Kamera). */
function pawnsOf(view: BoardView, board: BoardDefinition = WACKELWALD): CameraPawn[] {
  return view.players.map((p) => ({ slot: p.slot, ...pos(p.spaceId, board) }));
}

function cue(
  event: BoardEvent,
  elapsedMs: number,
  durationMs: number,
  extra: Partial<FrameCue> = {},
): FrameCue {
  return { event, style: 'walk', start: null, partner: null, elapsedMs, durationMs, ...extra };
}

/** Steht ein Bodenpunkt (samt Figurenhöhe) im Bild? */
function inFrame(camera: ViewCamera, p: Point2): boolean {
  const tanV = Math.tan(CAMERA_FOV / 2);
  const tanH = tanV * CAMERA_ASPECT;
  return [0, 2.4].every((y) => {
    const v = projectToView(camera, { x: p.x, y, z: p.z });
    return v.depth > 0 && Math.abs(v.x) <= tanH && Math.abs(v.y) <= tanV;
  });
}

const poseOf = (shot: CameraShot) => cameraPose(shot.focus, shot.distance);
const dist = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z);

/** Brett um den Faktor `k` gestreckt (größeres Brett, gleiche Struktur). */
function scaled(board: BoardDefinition, k: number): BoardDefinition {
  return {
    ...board,
    spaces: board.spaces.map((s) => ({
      ...s,
      position: { x: s.position.x * k, z: s.position.z * k },
    })),
  };
}

describe('Kamera-Einstellungen je Phase (CHAOS-194)', () => {
  const roll: BoardView = {
    ...DEMO_VIEW,
    gamePhase: 'roll',
    prompt: {
      id: 8,
      slot: 1,
      kind: 'roll',
      title: 'Würfeln!',
      options: [{ id: 'roll', label: 'Würfeln' }],
      remainingMs: null,
    },
  };

  it('Würfeln: nah an der Figur am Zug statt Vollansicht', () => {
    const shot = cameraShot({ board: WACKELWALD, view: roll, cues: [], pawns: pawnsOf(roll) });
    expect(shot.kind).toBe('follow');
    // s07 liegt am Brettrand: Der Blickpunkt bleibt etwas innerhalb, die Figur im Bild.
    expect(dist(shot.focus, pos('s07'))).toBeLessThan(5);
    expect(shot.distance).toBe(SHOT_DISTANCE.follow);
    expect(shot.distance).toBeLessThan(BASE_DISTANCE * 0.6);
    // Die Figur steht im Bild, das andere Brettende nicht.
    expect(inFrame(poseOf(shot), pos('s07'))).toBe(true);
    expect(inFrame(poseOf(shot), pos('s29'))).toBe(false);
  });

  it('Laufen: Blick voraus in Laufrichtung, im Takt des Wegs', () => {
    const view = { ...roll, gamePhase: 'move' as const, prompt: null };
    const moved: BoardEvent = { type: 'moved', slot: 1, path: ['s08', 's09', 's10'] };
    // Mitten im ersten Sprung s07 → s08.
    const pawn = { x: (pos('s07').x + pos('s08').x) / 2, z: (pos('s07').z + pos('s08').z) / 2 };
    const shot = cameraShot({
      board: WACKELWALD,
      view,
      cues: [cue(moved, 160, 960, { start: 's07' })],
      pawns: [{ slot: 1, ...pawn }, ...pawnsOf(view).filter((p) => p.slot !== 1)],
    });
    expect(shot.kind).toBe('walk');
    expect(inFrame(poseOf(shot), pawn)).toBe(true);
    // Voraus (vor dem Halt am Brettrand): Vorausblick entlang des Wegs, näher an s09.
    const path = ['s08', 's09', 's10'].map((id) => pos(id));
    const ahead = walkShot(pawn, path, 160, 960);
    // Entlang des Wegs genau der Vorausblick; Luftlinie wegen der Kurve etwas weniger.
    expect(dist(ahead.focus, pawn)).toBeLessThanOrEqual(WALK_LOOKAHEAD + 1e-9);
    expect(dist(ahead.focus, pawn)).toBeGreaterThan(WALK_LOOKAHEAD * 0.9);
    expect(dist(ahead.focus, pos('s09'))).toBeLessThan(dist(pawn, pos('s09')));
    // Im dritten Sprung reicht der Weg nicht mehr: Blick aufs Zielfeld.
    expect(walkShot(pos('s09'), path, 959, 960).focus).toEqual(pos('s10'));
  });

  it('Gabel: zieht auf, bis beide Wege samt Folgefeld lesbar sind', () => {
    const shot = cameraShot({
      board: WACKELWALD,
      view: DEMO_VIEW,
      cues: [],
      pawns: pawnsOf(DEMO_VIEW),
    });
    expect(shot.kind).toBe('fit');
    expect(shot.distance).toBeGreaterThanOrEqual(SHOT_DISTANCE.minFit);
    expect(shot.distance).toBeLessThan(BASE_DISTANCE * 0.7);
    const camera = poseOf(shot);
    const fork = WACKELWALD.spaces.find((s) => s.id === 's07');
    for (const id of fork?.next ?? []) {
      expect(inFrame(camera, pos(id)), id).toBe(true);
      const beyond = WACKELWALD.spaces.find((s) => s.id === id)?.next[0];
      if (beyond) expect(inFrame(camera, pos(beyond)), beyond).toBe(true);
    }
    // Dieselbe Einstellung nutzt die Szene für die Wegweiser.
    expect(forkShot(WACKELWALD, 's07', pos('s07'))).toEqual(shot);
  });

  it('Ereignis: kurzer Zoom auf die Figur, danach zurück zum Stand', () => {
    const view = { ...roll, gamePhase: 'move' as const, prompt: null, activeSlot: 1 as const };
    const dice: BoardEvent = { type: 'dice-rolled', slot: 1, faces: [4], total: 4 };
    const during = cameraShot({
      board: WACKELWALD,
      view,
      cues: [cue(dice, 300, 900)],
      pawns: pawnsOf(view),
    });
    expect(during.kind).toBe('event');
    expect(during.distance).toBe(SHOT_DISTANCE.event);
    expect(during.distance).toBeLessThan(SHOT_DISTANCE.follow);
    const after = cameraShot({
      board: WACKELWALD,
      view,
      cues: [cue(dice, 950, 900)],
      pawns: pawnsOf(view),
    });
    expect(after.kind).toBe('follow');
  });

  it('Klau und Reaktion: beide Figuren im Bild', () => {
    const view = { ...roll, prompt: null };
    const steal: BoardEvent = { type: 'coins-stolen', from: 1, to: 2, amount: 4 };
    const shot = cameraShot({
      board: WACKELWALD,
      view,
      cues: [cue(steal, 100, 900)],
      pawns: pawnsOf(view),
    });
    expect(shot.kind).toBe('fit');
    expect(inFrame(poseOf(shot), pos('s07'))).toBe(true);
    expect(inFrame(poseOf(shot), pos('s21'))).toBe(true);

    const reaction = createDemoMessages().find((m) => m.view.prompt?.kind === 'reaction');
    if (!reaction) throw new Error('Demo ohne Reaktion');
    const pawns = pawnsOf(reaction.view);
    const r = cameraShot({ board: WACKELWALD, view: reaction.view, cues: [], pawns });
    // Angegriffene (Prompt) und Angreifer (am Zug) im Bild.
    for (const slot of [reaction.view.prompt?.slot, reaction.view.activeSlot]) {
      const pawn = pawns.find((p) => p.slot === slot);
      expect(pawn && inFrame(poseOf(r), pawn), `Slot ${String(slot)}`).toBe(true);
    }
  });

  it('Rundenbeginn: kurzer Überblick über alle Felder, dann die Figur am Zug', () => {
    const started: BoardEvent = { type: 'round-started', round: 3 };
    const input = { board: WACKELWALD, view: roll, pawns: pawnsOf(roll) };
    const shot = cameraShot({ ...input, cues: [cue(started, 500, 0)] });
    expect(shot.kind).toBe('overview');
    for (const space of WACKELWALD.spaces)
      expect(inFrame(poseOf(shot), space.position), space.id).toBe(true);
    // Etwa die bisherige Vollansicht.
    expect(shot.distance / BASE_DISTANCE).toBeGreaterThan(0.9);
    expect(shot.distance / BASE_DISTANCE).toBeLessThan(1.15);
    expect(cameraShot({ ...input, cues: [cue(started, OVERVIEW_HOLD_MS, 0)] }).kind).toBe('follow');
  });

  it('neuestes haltendes Ereignis gewinnt, Ereignisse ohne Einstellung zählen nicht', () => {
    const started: BoardEvent = { type: 'round-started', round: 3 };
    const turn: BoardEvent = { type: 'turn-started', slot: 1, round: 3 };
    const shot = cameraShot({
      board: WACKELWALD,
      view: roll,
      cues: [cue(started, 10, 0), cue(turn, 10, 0)],
      pawns: pawnsOf(roll),
    });
    expect(shot.kind).toBe('overview');
  });

  it('Minispiel und Partieende: Überblick', () => {
    for (const gamePhase of ['minigame-intro', 'game-results'] as const) {
      const view = { ...roll, gamePhase, prompt: null };
      expect(cameraShot({ board: WACKELWALD, view, cues: [], pawns: pawnsOf(view) }).kind).toBe(
        'overview',
      );
    }
    expect(cameraShot({ board: WACKELWALD, view: null, cues: [], pawns: [] }).kind).toBe(
      'overview',
    );
  });
});

describe('größere Bretter (keine festen Grenzen)', () => {
  const big = scaled(WACKELWALD, 2.5);
  const view: BoardView = { ...DEMO_VIEW, gamePhase: 'turn-start', prompt: null };

  it('Überblick wächst mit dem Brett, alle Felder bleiben im Bild', () => {
    const small = cameraShot({ board: WACKELWALD, view: null, cues: [], pawns: [] });
    const large = cameraShot({ board: big, view: null, cues: [], pawns: [] });
    expect(large.distance).toBeGreaterThan(small.distance * 2);
    for (const space of big.spaces)
      expect(inFrame(poseOf(large), space.position), space.id).toBe(true);
  });

  it('Figur am Zug bleibt gleich nah, Gabeln passen ins Bild', () => {
    const follow = cameraShot({ board: big, view, cues: [], pawns: pawnsOf(view, big) });
    expect(follow.distance).toBe(SHOT_DISTANCE.follow);
    // Auf dem großen Brett liegt s07 weiter vom Rand: kaum nach innen gerückt.
    expect(dist(follow.focus, pos('s07', big))).toBeLessThan(1);
    expect(inFrame(poseOf(follow), pos('s07', big))).toBe(true);
    const fork = forkShot(big, 's07');
    for (const id of ['s07', 's08', 's14'])
      expect(inFrame(poseOf(fork), pos(id, big)), id).toBe(true);
  });
});

describe('fitShot (feste Seeds)', () => {
  for (const seed of [1, 7, 42, 2026]) {
    it(`passt zufällige Punktwolken knapp ein (Seed ${seed})`, () => {
      const rng = createRng(seed);
      for (let round = 0; round < 25; round++) {
        const count = 1 + Math.floor(rng.next() * 6);
        const spread = 2 + rng.next() * 60;
        const points = Array.from({ length: count }, () => ({
          x: (rng.next() - 0.5) * spread,
          z: (rng.next() - 0.5) * spread * 0.6,
        }));
        const { focus, distance } = fitShot(points);
        const camera = cameraPose(focus, distance);
        for (const p of points) expect(inFrame(camera, p)).toBe(true);
        expect(distance).toBeGreaterThanOrEqual(SHOT_DISTANCE.minFit);
        expect(distance).toBeLessThanOrEqual(SHOT_DISTANCE.max);
        // Nicht weiter weg als nötig: doppelt so weit gestreute Punkte brauchen mehr Abstand.
        if (distance > SHOT_DISTANCE.minFit && distance < SHOT_DISTANCE.max / 2) {
          const wider = fitShot(points.map((p) => ({ x: p.x * 2, z: p.z * 2 })));
          expect(wider.distance).toBeGreaterThan(distance * 1.3);
        }
      }
    });
  }
});

describe('Kamera-Feder', () => {
  it('ist bildratenunabhängig (exakte Lösung je Schritt)', () => {
    const run = (steps: number) => {
      const spring = { value: 0, velocity: 0 };
      for (let i = 0; i < steps; i++) springStep(spring, 10, 1000 / steps, 400);
      return spring.value;
    };
    expect(run(30)).toBeCloseTo(run(60), 9);
    expect(run(60)).toBeCloseTo(run(144), 9);
  });

  it('schwingt nicht über und kommt an', () => {
    const spring = { value: 0, velocity: 0 };
    let last = 0;
    for (let i = 0; i < 240; i++) {
      springStep(spring, 10, 1000 / 60, 500);
      expect(spring.value).toBeLessThanOrEqual(10 + 1e-9);
      expect(spring.value).toBeGreaterThanOrEqual(last - 1e-9);
      last = spring.value;
    }
    expect(spring.value).toBeCloseTo(10, 3);
  });

  it('Zugwechsel: ruhige Fahrt ohne Sprung, unterwegs etwas höher, dann nah am Neuen', () => {
    const rig = createCameraRig();
    const shotAt = (at: Point2): CameraShot => ({
      kind: 'follow',
      focus: at,
      distance: SHOT_DISTANCE.follow,
      smoothMs: 800,
    });
    rig.advance(0, shotAt(pos('s07')));
    let prev = rig.current();
    let maxStep = 0;
    let maxDistance = 0;
    for (let i = 0; i < 300; i++) {
      const state = rig.advance(1000 / 60, shotAt(pos('s34')));
      if (prev) maxStep = Math.max(maxStep, dist(state.focus, prev.focus));
      maxDistance = Math.max(maxDistance, state.distance);
      prev = state;
    }
    const travel = dist(pos('s07'), pos('s34'));
    // Kein harter Schnitt: je Bild höchstens ein kleiner Teil des Wegs.
    expect(maxStep).toBeLessThan(travel * 0.05);
    expect(maxDistance).toBeGreaterThan(SHOT_DISTANCE.follow + 2);
    expect(dist(prev?.focus ?? { x: 0, z: 0 }, pos('s34'))).toBeLessThan(0.05);
    expect(prev?.distance).toBeCloseTo(SHOT_DISTANCE.follow, 1);
  });

  it('mit der Regie: Demo-Ablauf deterministisch, Kamera folgt der Figur am Zug', () => {
    const runDemo = () => {
      const director = createBoardDirector();
      const rig = createCameraRig();
      const poses: string[] = [];
      // Jede Nachricht 2 s, die letzte 5 s (Klau samt Münzen ausspielen und zur Ruhe kommen).
      const messages = createDemoMessages();
      for (const [index, message] of messages.entries()) {
        director.receive(message);
        const frames = index === messages.length - 1 ? 300 : 120;
        for (let i = 0; i < frames; i++) {
          director.advance(1000 / 60);
          const frame = director.getFrame();
          const state = rig.advance(
            1000 / 60,
            cameraShot({
              board: WACKELWALD,
              view: frame.view,
              cues: frame.cues,
              pawns: frame.pawns.map((p) => ({ slot: p.slot, ...pos(p.spaceId) })),
            }),
          );
          poses.push(
            `${state.focus.x.toFixed(4)},${state.focus.z.toFixed(4)},${state.distance.toFixed(4)}`,
          );
        }
      }
      return { poses, rig, director };
    };
    const a = runDemo();
    const b = runDemo();
    expect(a.poses).toEqual(b.poses);
    // Zum Schluss: Orange (s21) am Zug, die Kamera ist nah bei ihr.
    const end = a.rig.current();
    expect(a.director.getFrame().view?.activeSlot).toBe(2);
    expect(dist(end?.focus ?? { x: 0, z: 0 }, pos('s21'))).toBeLessThan(4);
    expect(end?.distance).toBeLessThan(BASE_DISTANCE * 0.7);
    if (end) expect(inFrame(end.pose, pos('s21'))).toBe(true);
  });
});
