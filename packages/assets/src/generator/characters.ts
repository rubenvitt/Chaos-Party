/**
 * Die vier Figuren (CHAOS-27) aus Code: Schraubi, Kalle Kaktus, Wusel, Socke Sigi.
 * Eigene Entwürfe aus Grundkörpern und eigener Geometrie, keine Fremd-Assets.
 *
 * Maßstab (Figuren-Vertrag im minigame-sdk): Füße bei y = 0, Blick +Z, Höhe 1,4–1,8,
 * Grundfläche im Kreis mit Radius 0,5. Proportionen laut docs/art-direction.md: großer Kopf,
 * kurze Beine, klare Silhouette. Das Material `akzent` färbt der Host in die Slot-Farbe; am
 * leeren Knoten `abzeichen` (Brust) hängt er das Slot-Symbol an.
 */
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { baseClips, type Clip, type ClipOptions, type Role, type Track } from './clips.ts';
import {
  ACCENT_DEFAULT,
  ACCENT_MATERIAL,
  BADGE_NODE,
  box,
  createKit,
  cylinder,
  eye,
  EYE_WHITE,
  pennant,
  INK,
  ribbedColumn,
  smoothPath,
  sphere,
  torus,
  tube,
  type Piece,
  type Vec3,
} from './kit.ts';

export { CHARACTER_IDS, type CharacterId } from '../contract.ts';
import type { CharacterId } from '../contract.ts';

/** Grundfarben je Figur (sRGB) – auch für die SVG-Porträts. Akzent kommt vom Slot. */
export const PALETTES = {
  robot: { blech: '#b9cad8', dunkel: '#3b3f58', messing: '#f0b73e' },
  cactus: { kaktus: '#6cbf4b', topf: '#d9774a', stachel: '#fff4cf', bluete: '#ffd23f' },
  raccoon: { fell: '#9b9bb0', dunkel: '#3a3446', hell: '#f3e7d3' },
  sock: { socke: '#f6f0e4', streifen: '#ea5a4c', knopf: '#7a3f2c' },
} as const;

export interface BuiltCharacter {
  readonly id: CharacterId;
  readonly root: TransformNode;
  readonly joints: Partial<Record<Role, TransformNode>>;
  readonly clips: readonly Clip[];
}

const TAU = Math.PI * 2;

/** Links (−1) und rechts (+1) als Paar. */
function pair<T>(make: (side: -1 | 1) => T): [T, T] {
  return [make(-1), make(1)];
}

function wave(seconds: number, steps: number, f: (phase: number) => Vec3): [number, Vec3][] {
  const keys: [number, Vec3][] = [];
  for (let i = 0; i <= steps; i++) keys.push([(seconds * i) / steps, f(i / steps)]);
  return keys;
}

/** Basis-Animationen plus figurentypische Spuren für `extra-a`/`extra-b`. */
function withExtras(
  options: ClipOptions,
  extras: Partial<Record<Clip['name'], readonly Track[]>>,
): Clip[] {
  return baseClips(options).map((clip) => ({
    ...clip,
    tracks: [...clip.tracks, ...(extras[clip.name] ?? [])],
  }));
}

// ---------------------------------------------------------------------------
// Schraubi: Aufzieh-Blechroboter, kastig, Wackelantenne, Aufziehschlüssel hinten
// ---------------------------------------------------------------------------

function buildRobot(scene: Scene): BuiltCharacter {
  const kit = createKit(scene);
  const c = PALETTES.robot;
  const tin = kit.material('blech', c.blech, 0.45);
  const dark = kit.material('dunkel', c.dunkel, 0.7);
  const brass = kit.material('messing', c.messing, 0.4);
  const white = kit.material('weiss', EYE_WHITE, 0.6);
  const akzent = kit.material(ACCENT_MATERIAL, ACCENT_DEFAULT, 0.7);

  const root = kit.joint('robot', null);
  const huepfer = kit.joint('huepfer', root);

  // Rumpf: Blechkasten mit Nieten, Halsring in Slot-Farbe.
  kit.part('rumpf', huepfer, [
    box(scene, tin, [0.6, 0.44, 0.44], { at: [0, 0.56, 0] }),
    box(scene, tin, [0.66, 0.08, 0.5], { at: [0, 0.36, 0] }),
    cylinder(scene, dark, { diameter: 0.22, height: 0.1 }, { at: [0, 0.82, 0] }),
    torus(scene, akzent, 0.46, 0.09, { at: [0, 0.8, 0] }),
    // Brustplatte mit zwei Knöpfen (Abzeichen hängt darunter).
    box(scene, dark, [0.36, 0.12, 0.03], { at: [0, 0.69, 0.22] }),
    sphere(scene, brass, 0.06, { at: [-0.08, 0.69, 0.24] }, 6),
    sphere(scene, akzent, 0.06, { at: [0.08, 0.69, 0.24] }, 6),
    ...[-0.25, 0.25].flatMap((x) => [
      sphere(scene, brass, 0.045, { at: [x, 0.7, 0.225] }, 6),
      sphere(scene, brass, 0.045, { at: [x, 0.42, 0.225] }, 6),
    ]),
  ]);
  kit.joint(BADGE_NODE, huepfer, [0, 0.5, 0.225]);

  const legs = pair((side) => {
    const leg = kit.joint(side < 0 ? 'bein-l' : 'bein-r', huepfer, [side * 0.16, 0.32, 0]);
    kit.part(`${leg.name}-teil`, leg, [
      cylinder(scene, dark, { diameter: 0.13, height: 0.24 }, { at: [0, -0.12, 0] }),
      box(scene, tin, [0.22, 0.1, 0.32], { at: [0, -0.27, 0.04] }),
      box(scene, dark, [0.22, 0.03, 0.32], { at: [0, -0.305, 0.04] }),
    ]);
    return leg;
  });

  const arms = pair((side) => {
    const arm = kit.joint(side < 0 ? 'arm-l' : 'arm-r', huepfer, [side * 0.34, 0.68, 0]);
    kit.part(`${arm.name}-teil`, arm, [
      sphere(scene, dark, 0.12, {}, 8),
      cylinder(
        scene,
        dark,
        { diameter: 0.08, height: 0.24 },
        { at: [side * 0.03, -0.13, 0], rot: [0, 0, side * 0.2] },
      ),
      // Greifzange: zwei Backen in Messing.
      box(scene, brass, [0.05, 0.12, 0.1], {
        at: [side * 0.07, -0.29, 0.03],
        rot: [0, 0, side * 0.3],
      }),
      box(scene, brass, [0.05, 0.12, 0.1], {
        at: [side * 0.07, -0.29, -0.05],
        rot: [0, 0, side * 0.3],
      }),
    ]);
    return arm;
  });

  // Kopf: breiter als der Rumpf, dunkles Bildschirm-Gesicht mit großen Augen.
  const kopf = kit.joint('kopf', huepfer, [0, 0.86, 0]);
  kit.part('kopf-teil', kopf, [
    box(scene, tin, [0.76, 0.5, 0.54], { at: [0, 0.27, 0] }),
    box(scene, tin, [0.8, 0.06, 0.58], { at: [0, 0.03, 0] }),
    box(scene, dark, [0.62, 0.36, 0.03], { at: [0, 0.28, 0.27] }),
    ...eye(scene, white, dark, [-0.15, 0.31, 0.29], 0.2),
    ...eye(scene, white, dark, [0.15, 0.31, 0.29], 0.2),
    // Grinsen als Lautsprecher-Gitter.
    ...[-0.08, 0, 0.08].map((x) => box(scene, brass, [0.05, 0.05, 0.02], { at: [x, 0.15, 0.29] })),
    // Ohrschrauben.
    cylinder(
      scene,
      brass,
      { diameter: 0.15, height: 0.05 },
      { at: [-0.4, 0.27, 0], rot: [0, 0, TAU / 4] },
    ),
    cylinder(
      scene,
      brass,
      { diameter: 0.15, height: 0.05 },
      { at: [0.4, 0.27, 0], rot: [0, 0, TAU / 4] },
    ),
    box(scene, dark, [0.03, 0.03, 0.1], { at: [-0.43, 0.27, 0] }),
    box(scene, dark, [0.03, 0.03, 0.1], { at: [0.43, 0.27, 0] }),
  ]);

  // Wackelantenne: Feder + Kugel; wackelt in jeder Animation nach.
  const antenne = kit.joint('antenne', kopf, [0, 0.52, 0]);
  kit.part('antenne-teil', antenne, [
    ...[0.03, 0.08, 0.13].map((y) => torus(scene, dark, 0.07, 0.02, { at: [0, y, 0] }, 10)),
    cylinder(scene, dark, { diameter: 0.025, height: 0.2 }, { at: [0, 0.1, 0] }),
    sphere(scene, brass, 0.12, { at: [0, 0.24, 0] }, 10),
  ]);

  // Aufziehschlüssel am Rücken (dreht sich um die Z-Achse).
  const schluessel = kit.joint('schluessel', huepfer, [0, 0.58, -0.22]);
  kit.part('schluessel-teil', schluessel, [
    cylinder(
      scene,
      brass,
      { diameter: 0.06, height: 0.12 },
      { at: [0, 0, -0.06], rot: [TAU / 4, 0, 0] },
    ),
    cylinder(
      scene,
      brass,
      { diameter: 0.17, height: 0.035 },
      { at: [-0.1, 0, -0.13], rot: [TAU / 4, 0, 0], scale: [1, 1, 0.8] },
    ),
    cylinder(
      scene,
      brass,
      { diameter: 0.17, height: 0.035 },
      { at: [0.1, 0, -0.13], rot: [TAU / 4, 0, 0], scale: [1, 1, 0.8] },
    ),
    box(scene, brass, [0.1, 0.06, 0.035], { at: [0, 0, -0.13] }),
  ]);

  const wobble = (seconds: number, amp: number, cycles: number): Track => ({
    role: 'extra-a',
    property: 'rotation',
    keys: wave(seconds, cycles * 4, (p) => [
      amp * 0.6 * Math.sin(p * TAU * cycles + 1),
      0,
      amp * Math.sin(p * TAU * cycles),
    ]),
  });
  const spin = (seconds: number, turns: number): Track => ({
    role: 'extra-b',
    property: 'rotation',
    keys: wave(seconds, turns * 4, (p) => [0, 0, -p * turns * TAU]),
  });

  return {
    id: 'robot',
    root,
    joints: {
      huepfer,
      kopf,
      'arm-l': arms[0],
      'arm-r': arms[1],
      'bein-l': legs[0],
      'bein-r': legs[1],
      'extra-a': antenne,
      'extra-b': schluessel,
    },
    clips: withExtras(
      { lean: 0.16, armRaise: 2.5 },
      {
        idle: [wobble(1.6, 0.18, 2), spin(1.6, 1)],
        run: [wobble(0.5, 0.4, 1), spin(0.5, 1)],
        jump: [wobble(0.8, 0.5, 2), spin(0.8, 1)],
        hit: [wobble(0.65, 0.7, 3)],
        cheer: [wobble(1.3, 0.45, 4), spin(1.3, 3)],
        sad: [
          {
            role: 'extra-a',
            property: 'rotation',
            keys: [
              [0, [0, 0, 0]],
              [0.4, [0.9, 0, 0.1]],
              [1.2, [0.85, 0, -0.1]],
              [1.6, [0, 0, 0]],
            ],
          },
        ],
        fall: [wobble(1.0, 0.8, 4), spin(1.0, 2)],
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Kalle Kaktus: gerippte Säule im Tontopf, Saguaro-Arme, Sonnenbrille, Halstuch
// ---------------------------------------------------------------------------

function buildCactus(scene: Scene): BuiltCharacter {
  const kit = createKit(scene);
  const c = PALETTES.cactus;
  const green = kit.material('kaktus', c.kaktus, 0.8);
  const pot = kit.material('topf', c.topf, 0.9);
  const spine = kit.material('stachel', c.stachel, 0.7);
  const ink = kit.material('dunkel', INK, 0.25);
  const flower = kit.material('bluete', c.bluete, 0.7);
  const akzent = kit.material(ACCENT_MATERIAL, ACCENT_DEFAULT, 0.7);

  const root = kit.joint('cactus', null);
  const huepfer = kit.joint('huepfer', root);

  // Tontopf mit Rand; zwei Stummelfüße darunter.
  kit.part('topf-teil', huepfer, [
    cylinder(
      scene,
      pot,
      { diameterTop: 0.62, diameterBottom: 0.46, height: 0.36, tessellation: 20 },
      { at: [0, 0.26, 0] },
    ),
    cylinder(scene, pot, { diameter: 0.7, height: 0.12, tessellation: 20 }, { at: [0, 0.47, 0] }),
    cylinder(scene, ink, { diameter: 0.6, height: 0.02, tessellation: 20 }, { at: [0, 0.53, 0] }),
  ]);
  const legs = pair((side) => {
    const leg = kit.joint(side < 0 ? 'bein-l' : 'bein-r', huepfer, [side * 0.13, 0.1, 0.02]);
    kit.part(`${leg.name}-teil`, leg, [
      sphere(scene, pot, 0.18, { at: [0, -0.05, 0.05], scale: [1, 0.55, 1.35] }, 10),
    ]);
    return leg;
  });

  // Körper = Kopf: gerippte Säule mit runder Kuppe, schwankt im Topf.
  const koerper = kit.joint('koerper', huepfer, [0, 0.5, 0]);
  const profile: [number, number][] = [];
  for (let i = 0; i <= 6; i++)
    profile.push([(i / 6) * 0.8, 0.27 + 0.015 * Math.sin((i / 6) * Math.PI)]);
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    profile.push([0.8 + Math.sin(a) * 0.3, Math.max(0.0001, Math.cos(a) * 0.27)]);
  }
  const spines: Piece[] = [];
  const spineSpots: Vec3[] = [
    [0.7, 0.55, 0],
    [1.6, 0.4, 0],
    [2.4, 0.7, 0],
    [3.9, 0.3, 0],
    [4.7, 0.62, 0],
    [5.5, 0.45, 0],
    [0.2, 0.2, 0],
    [3.1, 0.18, 0],
    [1.2, 0.86, 0],
    [5.0, 0.9, 0],
  ];
  for (const [angle, y] of spineSpots) {
    const r = 0.28;
    spines.push(
      cylinder(
        scene,
        spine,
        { diameterTop: 0, diameterBottom: 0.035, height: 0.09, tessellation: 4 },
        { at: [Math.sin(angle) * r, y, Math.cos(angle) * r], rot: [TAU / 4, angle, 0] },
      ),
    );
  }
  const shades: Piece[] = [];
  for (const side of [-1, 1] as const) {
    shades.push(
      cylinder(
        scene,
        ink,
        { diameter: 0.22, height: 0.05, tessellation: 18 },
        { at: [side * 0.115, 0.82, 0.27], rot: [TAU / 4, side * 0.32, 0], scale: [1.15, 1, 0.85] },
      ),
      box(scene, spine, [0.035, 0.1, 0.01], {
        at: [side * 0.115 - 0.03, 0.84, 0.3],
        rot: [0, side * 0.32, -0.6],
      }),
      box(scene, ink, [0.025, 0.03, 0.26], {
        at: [side * 0.255, 0.84, 0.12],
        rot: [0, side * 0.15, 0],
      }),
    );
  }
  kit.part('koerper-teil', koerper, [
    ribbedColumn(scene, green, { profile, ribs: 8, ribDepth: 0.12, segments: 32 }),
    ...spines,
    // Sonnenbrille (cool!) mit Bügeln und Glanzstrich.
    ...shades,
    box(scene, ink, [0.08, 0.03, 0.03], { at: [0, 0.85, 0.305] }),
    // Schiefes Grinsen.
    tube(
      scene,
      ink,
      smoothPath(
        [
          [-0.07, 0.64, 0.27],
          [0.01, 0.62, 0.285],
          [0.09, 0.66, 0.265],
        ],
        4,
      ),
      0.016,
      {},
      6,
    ),
    // Halstuch in Slot-Farbe mit Knoten-Zipfel vorn.
    torus(scene, akzent, 0.6, 0.09, { at: [0, 0.47, 0], scale: [1, 0.85, 1] }, 18),
    pennant(scene, akzent, 0.3, [0, 0.4, 0.27], 0.25),
    // Blüte auf dem Scheitel.
    ...[0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * TAU;
      return sphere(
        scene,
        flower,
        0.1,
        { at: [Math.sin(a) * 0.065, 1.1, Math.cos(a) * 0.065], scale: [1, 0.45, 1] },
        8,
      );
    }),
    sphere(scene, pot, 0.07, { at: [0, 1.12, 0] }, 8),
  ]);
  kit.joint(BADGE_NODE, koerper, [0, 0.17, 0.285]);

  // Saguaro-Arme, ungleich hoch (links tiefer, rechts höher und kürzer).
  const arms = pair((side) => {
    const y = side < 0 ? 0.38 : 0.55;
    const arm = kit.joint(side < 0 ? 'arm-l' : 'arm-r', koerper, [side * 0.24, y, 0]);
    const rise = side < 0 ? 0.3 : 0.22;
    const path = smoothPath(
      [
        [0, 0, 0],
        [side * 0.1, 0, 0],
        [side * 0.15, 0.06, 0],
        [side * 0.155, rise, 0],
      ],
      5,
    );
    kit.part(`${arm.name}-teil`, arm, [
      tube(scene, green, path, 0.075, {}, 12),
      sphere(scene, green, 0.15, { at: [side * 0.155, rise, 0] }, 10),
      cylinder(
        scene,
        spine,
        { diameterTop: 0, diameterBottom: 0.03, height: 0.08, tessellation: 4 },
        { at: [side * 0.19, rise - 0.04, 0], rot: [0, 0, (-side * TAU) / 4] },
      ),
    ]);
    return arm;
  });

  return {
    id: 'cactus',
    root,
    joints: {
      huepfer,
      // Der Kaktus ist Kopf und Körper zugleich: Kopfbewegungen kippen die Säule.
      kopf: koerper,
      'arm-l': arms[0],
      'arm-r': arms[1],
      'bein-l': legs[0],
      'bein-r': legs[1],
    },
    clips: withExtras({ lean: 0.12, armRaise: -0.5 }, {}),
  };
}

// ---------------------------------------------------------------------------
// Wusel: Waschbär mit Diebesmaske, großem Kopf und Ringelschwanz
// ---------------------------------------------------------------------------

function buildRaccoon(scene: Scene): BuiltCharacter {
  const kit = createKit(scene);
  const c = PALETTES.raccoon;
  const fur = kit.material('fell', c.fell, 0.95);
  const dark = kit.material('dunkel', c.dunkel, 0.9);
  const light = kit.material('hell', c.hell, 0.95);
  const white = kit.material('weiss', EYE_WHITE, 0.5);
  const akzent = kit.material(ACCENT_MATERIAL, ACCENT_DEFAULT, 0.7);

  const root = kit.joint('raccoon', null);
  const huepfer = kit.joint('huepfer', root);

  kit.part('rumpf', huepfer, [
    sphere(scene, fur, 0.6, { at: [0, 0.47, 0], scale: [1, 1.08, 0.88] }, 10),
    sphere(scene, light, 0.4, { at: [0, 0.44, 0.15], scale: [1, 1.1, 0.6] }, 10),
    // Halstuch (Bandit!) in Slot-Farbe, Zipfel vorn.
    torus(scene, akzent, 0.44, 0.1, { at: [0, 0.77, 0], scale: [1, 0.8, 0.95] }, 16),
    pennant(scene, akzent, 0.28, [0, 0.7, 0.21], 0.35),
  ]);
  kit.joint(BADGE_NODE, huepfer, [0, 0.5, 0.25]);

  const legs = pair((side) => {
    const leg = kit.joint(side < 0 ? 'bein-l' : 'bein-r', huepfer, [side * 0.14, 0.2, 0]);
    kit.part(`${leg.name}-teil`, leg, [
      cylinder(scene, dark, { diameter: 0.14, height: 0.16 }, { at: [0, -0.08, 0] }),
      sphere(scene, dark, 0.18, { at: [0, -0.16, 0.05], scale: [1, 0.45, 1.4] }, 10),
    ]);
    return leg;
  });

  const arms = pair((side) => {
    const arm = kit.joint(side < 0 ? 'arm-l' : 'arm-r', huepfer, [side * 0.25, 0.64, 0.02]);
    kit.part(`${arm.name}-teil`, arm, [
      tube(
        scene,
        fur,
        [
          [0, 0, 0],
          [side * 0.05, -0.12, 0],
          [side * 0.07, -0.2, 0.02],
        ],
        0.055,
        {},
        10,
      ),
      sphere(scene, dark, 0.13, { at: [side * 0.07, -0.24, 0.02] }, 10),
    ]);
    return arm;
  });

  // Großer Kopf mit spitzen Ohren, Diebesmaske, heller Schnauze.
  const kopf = kit.joint('kopf', huepfer, [0, 0.8, 0]);
  const mask: Piece[] = [];
  for (const side of [-1, 1] as const) {
    mask.push(
      sphere(
        scene,
        dark,
        0.3,
        { at: [side * 0.15, 0.35, 0.235], rot: [0, 0, side * -0.3], scale: [1.25, 0.75, 0.62] },
        8,
      ),
      ...eye(scene, white, dark, [side * 0.14, 0.355, 0.31], 0.14),
      // Ohr: außen Fell, innen dunkel.
      cylinder(
        scene,
        fur,
        { diameterTop: 0.02, diameterBottom: 0.24, height: 0.24, tessellation: 12 },
        { at: [side * 0.25, 0.65, -0.03], rot: [0, 0, -side * 0.38], scale: [1, 1, 0.55] },
      ),
      cylinder(
        scene,
        dark,
        { diameterTop: 0.01, diameterBottom: 0.14, height: 0.15, tessellation: 10 },
        { at: [side * 0.24, 0.63, 0.02], rot: [0, 0, -side * 0.38], scale: [1, 1, 0.4] },
      ),
      // Weiße Augenbrauen-Flecken über der Maske.
      sphere(scene, light, 0.1, { at: [side * 0.14, 0.47, 0.27], scale: [1.3, 0.5, 0.6] }, 8),
    );
  }
  kit.part('kopf-teil', kopf, [
    sphere(scene, fur, 0.8, { at: [0, 0.33, 0], scale: [1.08, 0.9, 0.88] }, 12),
    ...mask,
    box(scene, dark, [0.12, 0.08, 0.1], { at: [0, 0.35, 0.3] }),
    sphere(scene, light, 0.3, { at: [0, 0.22, 0.28], scale: [1, 0.68, 0.85] }, 10),
    sphere(scene, dark, 0.09, { at: [0, 0.26, 0.4], scale: [1.2, 0.85, 1] }, 10),
    tube(
      scene,
      dark,
      smoothPath(
        [
          [-0.06, 0.15, 0.37],
          [0, 0.13, 0.385],
          [0.06, 0.15, 0.37],
        ],
        4,
      ),
      0.012,
      {},
      6,
    ),
  ]);

  // Ringelschwanz: Kugelkette, abwechselnd Fell und dunkel, buschig nach hinten-oben.
  const schwanz = kit.joint('schwanz', huepfer, [0, 0.3, -0.16]);
  const tailPoints: Vec3[] = [
    [0, 0, 0],
    [0.04, 0.05, -0.07],
    [0.1, 0.12, -0.1],
    [0.17, 0.2, -0.1],
    [0.24, 0.29, -0.08],
    [0.29, 0.39, -0.05],
    [0.32, 0.49, -0.02],
    [0.33, 0.58, 0.01],
  ];
  kit.part(
    'schwanz-teil',
    schwanz,
    tailPoints.map((p, i) =>
      sphere(scene, i % 2 === 0 ? fur : dark, 0.2 - i * 0.009, { at: p }, 7),
    ),
  );

  const wag = (seconds: number, amp: number, cycles: number): Track => ({
    role: 'extra-a',
    property: 'rotation',
    keys: wave(seconds, cycles * 4, (p) => [
      0,
      amp * Math.sin(p * TAU * cycles),
      amp * 0.5 * Math.sin(p * TAU * cycles),
    ]),
  });

  return {
    id: 'raccoon',
    root,
    joints: {
      huepfer,
      kopf,
      'arm-l': arms[0],
      'arm-r': arms[1],
      'bein-l': legs[0],
      'bein-r': legs[1],
      'extra-a': schwanz,
    },
    clips: withExtras(
      { lean: 0.18, armRaise: 2.0 },
      {
        idle: [wag(1.6, 0.25, 1)],
        run: [wag(0.5, 0.35, 1)],
        jump: [wag(0.8, 0.4, 1)],
        hit: [wag(0.65, 0.6, 3)],
        cheer: [wag(1.3, 0.55, 5)],
        sad: [
          {
            role: 'extra-a',
            property: 'rotation',
            keys: [
              [0, [0, 0, 0]],
              [0.4, [0.55, 0, 0]],
              [1.2, [0.55, 0, 0]],
              [1.6, [0, 0, 0]],
            ],
          },
        ],
        fall: [wag(1.0, 0.7, 4)],
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Socke Sigi: Einzelsocke (L-Form) mit Ringel-Streifen und ungleichen Knopfaugen
// ---------------------------------------------------------------------------

function buildSock(scene: Scene): BuiltCharacter {
  const kit = createKit(scene);
  const c = PALETTES.sock;
  const sock = kit.material('socke', c.socke, 0.95);
  const stripe = kit.material('streifen', c.streifen, 0.9);
  const button = kit.material('knopf', c.knopf, 0.5);
  const ink = kit.material('dunkel', INK, 0.8);
  const akzent = kit.material(ACCENT_MATERIAL, ACCENT_DEFAULT, 0.8);

  const root = kit.joint('sock', null);
  const huepfer = kit.joint('huepfer', root);

  // Fuß (Zehe vorn, Ferse hinten) als Röhre entlang eines L-Pfads; Ferse und Zehe gestreift.
  const foot = smoothPath(
    [
      [0, 0.17, 0.24],
      [0, 0.175, 0.08],
      [0, 0.24, -0.08],
      [0, 0.42, -0.1],
      [0, 0.55, -0.1],
    ],
    6,
  );
  kit.part('fuss-teil', huepfer, [
    tube(scene, sock, foot, (t) => 0.16 + Math.min(1, t * 1.6) * 0.06, {}, 16),
    sphere(scene, stripe, 0.33, { at: [0, 0.17, 0.27], scale: [1, 0.98, 0.9] }, 12),
    sphere(scene, stripe, 0.4, { at: [0, 0.22, -0.13], scale: [0.9, 0.85, 0.8] }, 12),
  ]);

  // Schaft als „Kopf“: knickt über der Ferse ein (Nicken, Hängenlassen, Wippen).
  const neck: Vec3 = [0, 0.45, -0.1];
  const kopf = kit.joint('kopf', huepfer, neck);
  const local = (pieces: readonly Piece[]): Piece[] =>
    pieces.map((piece) => {
      piece.mesh.position.x -= neck[0];
      piece.mesh.position.y -= neck[1];
      piece.mesh.position.z -= neck[2];
      return piece;
    });
  kit.part(
    'schaft-teil',
    kopf,
    local([
      tube(
        scene,
        sock,
        [
          [0, 0.4, -0.1],
          [0, 0.9, -0.1],
          [0, 1.36, -0.1],
        ],
        (t) => 0.22 + t * 0.03,
        {},
        16,
      ),
      // Ringel-Streifen.
      cylinder(
        scene,
        stripe,
        { diameter: 0.53, height: 0.07, tessellation: 20 },
        { at: [0, 1.04, -0.1] },
      ),
      cylinder(
        scene,
        stripe,
        { diameter: 0.54, height: 0.07, tessellation: 20 },
        { at: [0, 1.17, -0.1] },
      ),
      // Bündchen in Slot-Farbe, oben die dunkle Öffnung.
      cylinder(
        scene,
        akzent,
        { diameter: 0.57, height: 0.16, tessellation: 20 },
        { at: [0, 1.38, -0.1] },
      ),
      torus(scene, akzent, 0.5, 0.08, { at: [0, 1.46, -0.1] }, 18),
      cylinder(
        scene,
        ink,
        { diameter: 0.44, height: 0.02, tessellation: 20 },
        { at: [0, 1.465, -0.1] },
      ),
      // Knopfaugen, absichtlich ungleich groß, mit vier Löchern.
      ...(
        [
          [-0.11, 0.86, 0.19],
          [0.1, 0.84, 0.15],
        ] as const
      ).flatMap(([x, y, d], i) => [
        cylinder(
          scene,
          button,
          { diameter: d, height: 0.04, tessellation: 18 },
          { at: [x, y, 0.13], rot: [TAU / 4, 0, 0] },
        ),
        torus(scene, button, d * 0.92, 0.02, { at: [x, y, 0.15], rot: [TAU / 4, 0, 0] }, 16),
        ...[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([dx = 0, dy = 0]) =>
          sphere(scene, ink, 0.025, { at: [x + dx * d * 0.14, y + dy * d * 0.14, 0.15] }, 4),
        ),
        // Faden: ein schiefer Stich am größeren Knopf.
        ...(i === 0
          ? [box(scene, ink, [0.012, 0.09, 0.012], { at: [x, y, 0.16], rot: [0, 0, 0.7] })]
          : []),
      ]),
      // Gestickter Mund mit Kreuzstichen.
      tube(
        scene,
        ink,
        smoothPath(
          [
            [-0.1, 0.68, 0.12],
            [0, 0.63, 0.135],
            [0.1, 0.68, 0.12],
          ],
          4,
        ),
        0.014,
        {},
        6,
      ),
      box(scene, ink, [0.012, 0.05, 0.012], { at: [-0.1, 0.68, 0.125], rot: [0, 0, 0.6] }),
      box(scene, ink, [0.012, 0.05, 0.012], { at: [0.1, 0.68, 0.125], rot: [0, 0, -0.6] }),
    ]),
  );
  kit.joint(BADGE_NODE, kopf, [0, 0.0, 0.25]);

  return {
    id: 'sock',
    root,
    joints: { huepfer, kopf },
    clips: withExtras({ lean: 0.22, armRaise: 0 }, {}),
  };
}

const BUILDERS: Record<CharacterId, (scene: Scene) => BuiltCharacter> = {
  robot: buildRobot,
  cactus: buildCactus,
  raccoon: buildRaccoon,
  sock: buildSock,
};

export function buildCharacter(scene: Scene, id: CharacterId): BuiltCharacter {
  return BUILDERS[id](scene);
}
