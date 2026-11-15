/**
 * Animationen der Figuren (CHAOS-27): genau die Namen aus `CHARACTER_ANIMATIONS`
 * (minigame-sdk). Einfache Knoten-Animationen an Gelenken – Position, Drehung, Skalierung –
 * mit übertriebenem Squash & Stretch, gut lesbar am Fernseher (docs/art-direction.md).
 *
 * Werte sind **relativ zur Ruhepose**: Position und Drehung werden addiert, Skalierung
 * multipliziert. Jede Animation setzt alle Gelenke, die irgendeine Animation bewegt (fehlende
 * Spuren ergänzt der Generator mit der Ruhepose) – so bleibt nach einem Wechsel nichts hängen.
 */
import { Animation } from '@babylonjs/core/Animations/animation.js';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Vec3 } from './kit.ts';

export type { CharacterAnimation as AnimationName } from '../contract.ts';
import type { CharacterAnimation as AnimationName } from '../contract.ts';

/** Bildrate der Schlüssel (glTF speichert Sekunden). */
export const FPS = 60;

export type Property = 'position' | 'rotation' | 'scaling';
export type Key = readonly [seconds: number, value: Vec3];

/** Gelenk-Rollen; Figuren ohne ein Gelenk (Socke ohne Arme) lassen die Spur weg. */
export type Role =
  'huepfer' | 'kopf' | 'arm-l' | 'arm-r' | 'bein-l' | 'bein-r' | 'extra-a' | 'extra-b';

export interface Track {
  readonly role: Role;
  readonly property: Property;
  readonly keys: readonly Key[];
}

export interface Clip {
  readonly name: AnimationName;
  readonly seconds: number;
  readonly tracks: readonly Track[];
}

const TAU = Math.PI * 2;
const q = Math.PI / 2;

/** Schwingung: `n` Schlüssel über `seconds`, Wert `f(phase 0…1)`. */
function wave(seconds: number, steps: number, f: (phase: number) => Vec3): Key[] {
  const keys: Key[] = [];
  for (let i = 0; i <= steps; i++) {
    const phase = i / steps;
    keys.push([seconds * phase, f(phase)]);
  }
  return keys;
}

const sin = (phase: number, cycles = 1): number => Math.sin(phase * TAU * cycles);

/** Zusatzbewegung je Figur (Antenne, Schlüssel, Schwanz, Hüftschwung). */
export interface ExtraMotion {
  /** Spuren je Animation für `extra-a`/`extra-b`. */
  readonly tracks: Partial<Record<AnimationName, readonly Track[]>>;
}

/** Arm seitlich heben: links negative, rechts positive Drehung um Z (Hand von unten nach außen). */
function armsZ(angleOutward: number): { l: Vec3; r: Vec3 } {
  return { l: [0, 0, -angleOutward], r: [0, 0, angleOutward] };
}

export interface ClipOptions {
  /** Vorlage beim Laufen (Radiant, + = nach vorn). */
  readonly lean: number;
  /** Wie weit „Arme hoch“ die Arme seitlich hebt (hängende Arme ≈ 2,5; Kaktus-Arme zeigen schon nach oben). */
  readonly armRaise: number;
}

export function baseClips(options: ClipOptions): Clip[] {
  const idleS = 1.6;
  const runS = 0.5;
  const lean = options.lean;
  const up = armsZ(options.armRaise);
  return [
    {
      name: 'idle',
      seconds: idleS,
      tracks: [
        {
          role: 'huepfer',
          property: 'scaling',
          keys: wave(idleS, 4, (p) => {
            const s = 0.035 * (1 - Math.cos(p * TAU)) * 0.5;
            return [1 - s * 0.6, 1 + s, 1 - s * 0.6];
          }),
        },
        {
          role: 'kopf',
          property: 'rotation',
          keys: wave(idleS, 4, (p) => [0.03 * sin(p), 0, 0.07 * sin(p)]),
        },
        {
          role: 'arm-l',
          property: 'rotation',
          keys: wave(idleS, 4, (p) => [0.1 * sin(p), 0, -0.06 * sin(p)]),
        },
        {
          role: 'arm-r',
          property: 'rotation',
          keys: wave(idleS, 4, (p) => [-0.1 * sin(p), 0, 0.06 * sin(p)]),
        },
      ],
    },
    {
      name: 'run',
      seconds: runS,
      tracks: [
        {
          role: 'huepfer',
          property: 'position',
          keys: wave(runS, 8, (p) => [0, 0.11 * Math.abs(Math.sin(p * TAU)), 0]),
        },
        {
          role: 'huepfer',
          property: 'scaling',
          keys: wave(runS, 8, (p) => {
            // Bodenkontakt bei 0, ½, 1: gestaucht; in der Luft gestreckt.
            const air = Math.abs(Math.sin(p * TAU));
            const s = 0.16 * air - 0.08;
            return [1 - s * 0.6, 1 + s, 1 - s * 0.6];
          }),
        },
        {
          role: 'huepfer',
          property: 'rotation',
          keys: wave(runS, 4, (p) => [lean, 0, 0.06 * sin(p)]),
        },
        {
          role: 'kopf',
          property: 'rotation',
          keys: wave(runS, 8, (p) => [-0.08 * sin(p, 2), 0, 0]),
        },
        { role: 'bein-l', property: 'rotation', keys: wave(runS, 8, (p) => [0.75 * sin(p), 0, 0]) },
        {
          role: 'bein-r',
          property: 'rotation',
          keys: wave(runS, 8, (p) => [-0.75 * sin(p), 0, 0]),
        },
        {
          role: 'arm-l',
          property: 'rotation',
          keys: wave(runS, 8, (p) => [-0.9 * sin(p), 0, -0.15]),
        },
        {
          role: 'arm-r',
          property: 'rotation',
          keys: wave(runS, 8, (p) => [0.9 * sin(p), 0, 0.15]),
        },
      ],
    },
    {
      name: 'jump',
      seconds: 0.8,
      tracks: [
        {
          role: 'huepfer',
          property: 'position',
          keys: [
            [0, [0, 0, 0]],
            [0.12, [0, 0, 0]],
            [0.25, [0, 0.3, 0]],
            [0.42, [0, 0.62, 0]],
            [0.58, [0, 0.3, 0]],
            [0.66, [0, 0, 0]],
            [0.8, [0, 0, 0]],
          ],
        },
        {
          role: 'huepfer',
          property: 'scaling',
          keys: [
            [0, [1, 1, 1]],
            [0.12, [1.2, 0.72, 1.2]],
            [0.25, [0.84, 1.28, 0.84]],
            [0.42, [1, 1, 1]],
            [0.58, [0.9, 1.14, 0.9]],
            [0.66, [1.22, 0.74, 1.22]],
            [0.8, [1, 1, 1]],
          ],
        },
        {
          role: 'arm-l',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.12, [0, 0, -0.3]],
            [0.3, up.l],
            [0.58, up.l],
            [0.8, [0, 0, 0]],
          ],
        },
        {
          role: 'arm-r',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.12, [0, 0, 0.3]],
            [0.3, up.r],
            [0.58, up.r],
            [0.8, [0, 0, 0]],
          ],
        },
        {
          role: 'bein-l',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.3, [-0.5, 0, 0]],
            [0.55, [0.3, 0, 0]],
            [0.66, [0, 0, 0]],
          ],
        },
        {
          role: 'bein-r',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.3, [0.4, 0, 0]],
            [0.55, [-0.3, 0, 0]],
            [0.66, [0, 0, 0]],
          ],
        },
      ],
    },
    {
      name: 'hit',
      seconds: 0.65,
      tracks: [
        {
          role: 'huepfer',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.07, [-0.5, 0, 0.12]],
            [0.2, [-0.35, 0, -0.1]],
            [0.38, [0.12, 0, 0.04]],
            [0.52, [-0.04, 0, 0]],
            [0.65, [0, 0, 0]],
          ],
        },
        {
          role: 'huepfer',
          property: 'scaling',
          keys: [
            [0, [1, 1, 1]],
            [0.07, [1.28, 0.74, 1.12]],
            [0.2, [0.9, 1.12, 0.94]],
            [0.38, [1.05, 0.96, 1.05]],
            [0.65, [1, 1, 1]],
          ],
        },
        {
          role: 'huepfer',
          property: 'position',
          keys: [
            [0, [0, 0, 0]],
            [0.07, [0, 0, -0.12]],
            [0.38, [0, 0, -0.04]],
            [0.65, [0, 0, 0]],
          ],
        },
        {
          role: 'kopf',
          property: 'rotation',
          keys: wave(0.65, 10, (p) => [
            -0.15 * (1 - p),
            0.45 * Math.sin(p * TAU * 2.5) * (1 - p),
            0,
          ]),
        },
        {
          role: 'arm-l',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.07, [-0.6, 0, -1.4]],
            [0.3, [-0.3, 0, -0.9]],
            [0.65, [0, 0, 0]],
          ],
        },
        {
          role: 'arm-r',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.07, [-0.6, 0, 1.4]],
            [0.3, [-0.3, 0, 0.9]],
            [0.65, [0, 0, 0]],
          ],
        },
      ],
    },
    {
      name: 'cheer',
      seconds: 1.3,
      tracks: [
        {
          role: 'huepfer',
          property: 'position',
          keys: [
            [0, [0, 0, 0]],
            [0.08, [0, 0, 0]],
            [0.2, [0, 0.32, 0]],
            [0.32, [0, 0, 0]],
            [0.44, [0, 0.32, 0]],
            [0.56, [0, 0, 0]],
            [0.66, [0, 0.42, 0]],
            [0.98, [0, 0.42, 0]],
            [1.1, [0, 0, 0]],
            [1.3, [0, 0, 0]],
          ],
        },
        {
          role: 'huepfer',
          property: 'scaling',
          keys: [
            [0, [1, 1, 1]],
            [0.08, [1.15, 0.8, 1.15]],
            [0.2, [0.88, 1.2, 0.88]],
            [0.32, [1.15, 0.82, 1.15]],
            [0.44, [0.88, 1.2, 0.88]],
            [0.56, [1.18, 0.78, 1.18]],
            [0.66, [0.9, 1.16, 0.9]],
            [0.98, [0.95, 1.08, 0.95]],
            [1.1, [1.2, 0.8, 1.2]],
            [1.3, [1, 1, 1]],
          ],
        },
        {
          // Pirouette in Vierteldrehungen (glTF speichert Quaternionen; 2π ≡ 0).
          role: 'huepfer',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.6, [0, 0, 0]],
            [0.68, [0, q, 0]],
            [0.76, [0, 2 * q, 0]],
            [0.84, [0, 3 * q, 0]],
            [0.92, [0, 4 * q, 0]],
            [1.3, [0, 4 * q, 0]],
          ],
        },
        {
          role: 'kopf',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.2, [-0.25, 0, 0.1]],
            [0.5, [-0.25, 0, -0.1]],
            [1.1, [-0.2, 0, 0.1]],
            [1.3, [0, 0, 0]],
          ],
        },
        {
          role: 'arm-l',
          property: 'rotation',
          keys: wave(1.3, 13, (p) =>
            p < 0.08 || p > 0.92 ? [0, 0, 0] : [0, 0, up.l[2] + 0.35 * sin(p, 4)],
          ),
        },
        {
          role: 'arm-r',
          property: 'rotation',
          keys: wave(1.3, 13, (p) =>
            p < 0.08 || p > 0.92 ? [0, 0, 0] : [0, 0, up.r[2] - 0.35 * sin(p, 4)],
          ),
        },
        {
          role: 'bein-l',
          property: 'rotation',
          keys: wave(1.3, 13, (p) => [0.35 * sin(p, 3), 0, 0]),
        },
        {
          role: 'bein-r',
          property: 'rotation',
          keys: wave(1.3, 13, (p) => [-0.35 * sin(p, 3), 0, 0]),
        },
      ],
    },
    {
      name: 'sad',
      seconds: 1.6,
      tracks: [
        {
          role: 'huepfer',
          property: 'scaling',
          keys: [
            [0, [1, 1, 1]],
            [0.35, [1.08, 0.84, 1.08]],
            [1.25, [1.07, 0.86, 1.07]],
            [1.6, [1, 1, 1]],
          ],
        },
        {
          role: 'huepfer',
          property: 'rotation',
          keys: wave(1.6, 8, (p) => [0.12 * Math.sin(p * Math.PI), 0, 0.06 * sin(p, 1.5)]),
        },
        {
          role: 'kopf',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.35, [0.42, 0, 0.12]],
            [1.25, [0.42, 0, -0.12]],
            [1.6, [0, 0, 0]],
          ],
        },
        {
          role: 'arm-l',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.35, [0.25, 0, 0.18]],
            [1.25, [0.25, 0, 0.18]],
            [1.6, [0, 0, 0]],
          ],
        },
        {
          role: 'arm-r',
          property: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.35, [0.25, 0, -0.18]],
            [1.25, [0.25, 0, -0.18]],
            [1.6, [0, 0, 0]],
          ],
        },
      ],
    },
    {
      name: 'fall',
      seconds: 1.0,
      tracks: [
        {
          role: 'huepfer',
          property: 'scaling',
          keys: [
            [0, [1, 1, 1]],
            [0.1, [0.88, 1.18, 0.88]],
            [0.85, [0.9, 1.14, 0.9]],
            [1.0, [1, 1, 1]],
          ],
        },
        {
          role: 'huepfer',
          property: 'rotation',
          keys: wave(1.0, 10, (p) => [
            -0.2 * Math.sin(p * Math.PI),
            0,
            0.28 * sin(p, 2.5) * Math.sin(p * Math.PI),
          ]),
        },
        {
          role: 'kopf',
          property: 'rotation',
          keys: wave(1.0, 10, (p) => [-0.35 * Math.sin(p * Math.PI), 0.3 * sin(p, 3), 0]),
        },
        {
          // Windmühle: zwei volle Kreise, in Vierteldrehungen.
          role: 'arm-l',
          property: 'rotation',
          keys: wave(1.0, 8, (p) => [-p * 2 * TAU, 0, -0.6 * Math.sin(p * Math.PI)]),
        },
        {
          role: 'arm-r',
          property: 'rotation',
          keys: wave(1.0, 8, (p) => [p * 2 * TAU, 0, 0.6 * Math.sin(p * Math.PI)]),
        },
        {
          role: 'bein-l',
          property: 'rotation',
          keys: wave(1.0, 12, (p) => [0.8 * sin(p, 3), 0, 0]),
        },
        {
          role: 'bein-r',
          property: 'rotation',
          keys: wave(1.0, 12, (p) => [-0.8 * sin(p, 3), 0, 0]),
        },
      ],
    },
  ];
}

/** Ruhepose eines Gelenks (für relative Schlüssel und das Auffüllen fehlender Spuren). */
interface Rest {
  readonly position: Vector3;
  readonly rotation: Vector3;
  readonly scaling: Vector3;
}

function absolute(rest: Rest, property: Property, v: Vec3): Vector3 {
  const r = rest[property];
  return property === 'scaling'
    ? new Vector3(r.x * v[0], r.y * v[1], r.z * v[2])
    : new Vector3(r.x + v[0], r.y + v[1], r.z + v[2]);
}

/**
 * Legt die AnimationGroups an. `joints` ordnet Rollen den Knoten der Figur zu; Spuren für
 * fehlende Rollen fallen weg. Danach hat jede Animation dieselben (Knoten, Eigenschaft)-Spuren.
 */
export function buildAnimationGroups(
  scene: Scene,
  joints: Partial<Record<Role, TransformNode>>,
  clips: readonly Clip[],
): AnimationGroup[] {
  const rest = new Map<TransformNode, Rest>();
  for (const node of Object.values(joints)) {
    rest.set(node, {
      position: node.position.clone(),
      rotation: node.rotation.clone(),
      scaling: node.scaling.clone(),
    });
  }
  const used = new Set<string>();
  for (const clip of clips) {
    for (const track of clip.tracks)
      if (joints[track.role]) used.add(`${track.role}|${track.property}`);
  }
  return clips.map((clip) => {
    const group = new AnimationGroup(clip.name, scene);
    const present = new Set<string>();
    for (const track of clip.tracks) {
      const node = joints[track.role];
      if (!node) continue;
      const nodeRest = rest.get(node);
      if (!nodeRest) continue;
      const key = `${track.role}|${track.property}`;
      if (present.has(key)) throw new Error(`${clip.name}: Spur ${key} doppelt`);
      present.add(key);
      group.addTargetedAnimation(animation(clip, track, nodeRest), node);
    }
    for (const key of [...used].sort()) {
      if (present.has(key)) continue;
      const [role, property] = key.split('|') as [Role, Property];
      const node = joints[role];
      const nodeRest = node ? rest.get(node) : undefined;
      if (!node || !nodeRest) continue;
      const neutral: Vec3 = property === 'scaling' ? [1, 1, 1] : [0, 0, 0];
      group.addTargetedAnimation(
        animation(
          clip,
          {
            role,
            property,
            keys: [
              [0, neutral],
              [clip.seconds, neutral],
            ],
          },
          nodeRest,
        ),
        node,
      );
    }
    group.normalize(0, Math.round(clip.seconds * FPS));
    return group;
  });
}

function animation(clip: Clip, track: Track, rest: Rest): Animation {
  const anim = new Animation(
    `${clip.name}-${track.role}-${track.property}`,
    track.property,
    FPS,
    Animation.ANIMATIONTYPE_VECTOR3,
    Animation.ANIMATIONLOOPMODE_CYCLE,
  );
  const keys = track.keys.map(([t, v]) => ({
    frame: Math.round(t * FPS * 1000) / 1000,
    value: absolute(rest, track.property, v),
  }));
  const last = keys[keys.length - 1];
  if (last && last.frame < clip.seconds * FPS) {
    keys.push({ frame: clip.seconds * FPS, value: last.value.clone() });
  }
  anim.setKeys(keys);
  return anim;
}
