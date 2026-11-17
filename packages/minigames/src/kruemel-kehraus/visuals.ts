/**
 * Optik von „Krümel-Kehraus“: Holzblech mit Rand, Mauslöcher als Torbögen in Slot-Farbe,
 * Kekskrümel, Goldkrümel, Wollknäuel, Ring und Wimpel je Figur. Reine Darstellung – die
 * Hitboxen legt `index.ts` an (Rand, Stürze und Boden sind zugleich sichtbar und Körper).
 * Alles Angelegte landet in `disposables` und wird vom Minispiel in `dispose()` entfernt.
 */
import type { Material } from '@babylonjs/core/Materials/material.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { markVisual } from '@chaos-party/minigame-sdk/babylon';
import { toyMaterial, type Disposable, type ToyParts } from '../pudding-gerangel/visuals.ts';
import { TUNING, type Corner } from './logic.ts';

export { toyParts, type ToyParts } from '../pudding-gerangel/visuals.ts';

export const COLORS = {
  tray: '#d9a066',
  rim: '#a8642c',
  blanket: '#f2e3c6',
  crumb: '#c98a3f',
  crumbDark: '#8a5424',
  gold: '#ffc83d',
  hole: '#2b1a10',
  wool: '#e86aa8',
  leg: '#7a4a22',
} as const;

function track<T extends Disposable>(item: T, disposables: ToyParts): T {
  disposables.push(item);
  return item;
}

/** Licht und Hintergrund ohne Look des Hosts (Tests, Vorschau ohne Natur-Look). */
export function buildPlainStage(scene: Scene, disposables: ToyParts): void {
  scene.clearColor = new Color4(0.98, 0.93, 0.84, 1);
  const sky = new HemisphericLight('kruemel-licht', new Vector3(0.2, 1, -0.3), scene);
  sky.intensity = 0.75;
  sky.groundColor = new Color3(0.7, 0.6, 0.5);
  const sun = new DirectionalLight('kruemel-sonne', new Vector3(-0.4, -1, 0.5), scene);
  sun.intensity = 0.45;
  disposables.push(sky, sun);
  const ground = track(
    CreateGround('kruemel-decke', { width: 70, height: 45 }, scene),
    disposables,
  );
  ground.position.y = -TUNING.floorThickness - 0.01;
  ground.material = toyMaterial('kruemel-decke-mat', COLORS.blanket, scene, disposables, 0.1);
}

/** Holzfüße unter den Ecken des Blechs (Deko). */
export function buildLegs(scene: Scene, disposables: ToyParts): void {
  const material = toyMaterial('kruemel-fuss-mat', COLORS.leg, scene, disposables, 0.05);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const leg = track(
      CreateCylinder(
        `kruemel-fuss-${sx}-${sz}`,
        { diameter: 0.6, height: 0.2, tessellation: 12 },
        scene,
      ),
      disposables,
    );
    leg.position.set(
      sx * (TUNING.halfX - 0.4),
      -TUNING.floorThickness - 0.1,
      sz * (TUNING.halfZ - 0.4),
    );
    leg.material = material;
  }
}

/** Torbogen über einem offenen Mauseloch: dunkle Öffnung, Bogen und Symbol in Slot-Farbe. */
export function buildMouseHole(
  scene: Scene,
  corner: Corner,
  color: string,
  symbol: string,
  name: string,
  disposables: ToyParts,
): Material {
  const slotMaterial = toyMaterial(`${name}-mat`, color, scene, disposables, 0.45);
  const holeMaterial = toyMaterial(`${name}-loch-mat`, COLORS.hole, scene, disposables, 0);
  const yaw = Math.atan2(corner.normal.x, corner.normal.z);
  // Dunkles Loch im Boden hinter der Schräge (das „Mauseloch“).
  const hole = track(
    CreateCylinder(
      `${name}-loch`,
      { diameter: TUNING.cut * 1.2, height: 0.04, tessellation: 24 },
      scene,
    ),
    disposables,
  );
  hole.scaling.set(1, 1, 0.55);
  hole.rotation.y = yaw;
  hole.position.set(
    corner.mouth.x + corner.normal.x * 0.3,
    0.02,
    corner.mouth.z + corner.normal.z * 0.3,
  );
  hole.material = holeMaterial;
  // Bogen: zwei Pfosten an den Enden der Schräge (das Querholz ist der Sturz aus `index.ts`).
  const half = (TUNING.cut * Math.SQRT2) / 2;
  const tangent = { x: -corner.normal.z, z: corner.normal.x };
  for (const side of [-1, 1] as const) {
    const post = track(
      CreateCylinder(
        `${name}-pfosten-${side}`,
        { diameter: 0.34, height: TUNING.lintelTop, tessellation: 10 },
        scene,
      ),
      disposables,
    );
    post.position.set(
      corner.mouth.x + tangent.x * half * side + corner.normal.x * 0.15,
      TUNING.lintelTop / 2,
      corner.mouth.z + tangent.z * half * side + corner.normal.z * 0.15,
    );
    post.material = slotMaterial;
  }
  // Symbol der Person flach auf dem Blech vor dem Loch (Farbe + Symbol, M1).
  const flat = track(symbolMesh(scene, `${name}-symbol`, symbol), disposables);
  const flatMaterial = toyMaterial(`${name}-symbol-mat`, color, scene, disposables, 0.5);
  // Flache Fläche: von beiden Seiten zeichnen (sonst je nach Drehung unsichtbar).
  flatMaterial.backFaceCulling = false;
  flat.material = flatMaterial;
  flat.scaling.setAll(2.6);
  // Liegt flach, Oberkante zeigt vom PC aus nach oben (▲ und ★ nicht auf dem Kopf).
  flat.rotation.x = Math.PI / 2;
  flat.position.set(
    corner.mouth.x - corner.normal.x * 1.25,
    0.03,
    corner.mouth.z - corner.normal.z * 1.25,
  );
  return slotMaterial;
}

/** Sichtbarer Krümel als Kind der Hitbox: unregelmäßig, mit Schokostückchen. */
export function buildCrumbVisual(
  scene: Scene,
  parent: Mesh,
  index: number,
  gold: boolean,
  disposables: ToyParts,
  materials: { crumb: Mesh['material']; dark: Mesh['material']; gold: Mesh['material'] },
): void {
  const radius = gold ? TUNING.goldRadius : TUNING.crumbRadius;
  const body = track(
    CreateSphere(
      `kruemel-${index}-koerper`,
      { diameter: radius * 2, segments: gold ? 6 : 3 },
      scene,
    ),
    disposables,
  );
  body.parent = parent;
  body.scaling.set(1.08, 0.86, 0.96);
  body.material = gold ? materials.gold : materials.crumb;
  if (gold) return;
  const chip = track(
    CreateSphere(`kruemel-${index}-schoko`, { diameter: radius * 0.7, segments: 2 }, scene),
    disposables,
  );
  chip.parent = parent;
  chip.position.set(radius * 0.45, radius * 0.5, -radius * 0.2);
  chip.material = materials.dark;
}

/** Bodenring und Wimpel über dem Kopf in Slot-Farbe (Farbe immer zusätzlich zur Figur). */
export function buildPawnDecor(
  scene: Scene,
  slot: number,
  color: string,
  disposables: ToyParts,
): { ring: Mesh; pin: Mesh } {
  const material = toyMaterial(`kruemel-slot-${slot}-mat`, color, scene, disposables, 0.45);
  const ring = track(
    CreateTorus(
      `kruemel-ring-${slot}`,
      { diameter: 1.25, thickness: 0.16, tessellation: 28 },
      scene,
    ),
    disposables,
  );
  markVisual(ring, 'spielerring', slot);
  ring.material = material;
  const pin = track(
    CreateCylinder(
      `kruemel-wimpel-${slot}`,
      { diameterTop: 0.5, diameterBottom: 0, height: 0.55, tessellation: 4 },
      scene,
    ),
    disposables,
  );
  markVisual(pin, 'wimpel', slot);
  pin.material = material;
  return { ring, pin };
}

/** Holzmaterialien für Blech, Rand und Stürze. */
export function boardMaterials(scene: Scene, disposables: ToyParts) {
  return {
    tray: toyMaterial('kruemel-blech-mat', COLORS.tray, scene, disposables, 0.08, {
      finish: 'matt',
    }),
    rim: toyMaterial('kruemel-rand-mat', COLORS.rim, scene, disposables, 0.06, { finish: 'matt' }),
    crumb: toyMaterial('kruemel-krume-mat', COLORS.crumb, scene, disposables, 0.12, {
      finish: 'matt',
    }),
    dark: toyMaterial('kruemel-schoko-mat', COLORS.crumbDark, scene, disposables, 0.05),
    gold: toyMaterial('kruemel-gold-mat', COLORS.gold, scene, disposables, 0.55, {
      shine: { color: new Color3(1, 0.95, 0.7), power: 48 },
    }),
    wool: toyMaterial('kruemel-wolle-mat', COLORS.wool, scene, disposables, 0.2, {
      finish: 'stoff',
    }),
  };
}

/** Kreuzförmige Fadenstreifen auf dem Wollknäuel. */
export function buildWoolStripes(
  scene: Scene,
  parent: Mesh,
  disposables: ToyParts,
  material: Mesh['material'],
): void {
  for (let index = 0; index < 3; index++) {
    const band = track(
      CreateTorus(
        `kruemel-wolle-faden-${index}`,
        { diameter: TUNING.ballRadius * 2.02, thickness: 0.06, tessellation: 24 },
        scene,
      ),
      disposables,
    );
    band.parent = parent;
    band.rotation.set((index * Math.PI) / 3, index * 0.7, Math.PI / 2);
    band.material = material;
  }
}

/** Flaches Slot-Symbol (● ▲ ■ ★) als Mesh in der x/y-Ebene. */
export function symbolMesh(scene: Scene, name: string, symbol: string): Mesh {
  const outline: [number, number][] = [];
  const radius = 0.22;
  if (symbol === '▲') {
    for (let index = 0; index < 3; index++) {
      const a = Math.PI / 2 + (index * 2 * Math.PI) / 3;
      outline.push([Math.cos(a) * radius * 1.15, Math.sin(a) * radius * 1.15 - 0.03]);
    }
  } else if (symbol === '■') {
    const s = radius * 0.8;
    outline.push([-s, -s], [s, -s], [s, s], [-s, s]);
  } else if (symbol === '★') {
    for (let index = 0; index < 10; index++) {
      const a = Math.PI / 2 + (index * Math.PI) / 5;
      const r = index % 2 === 0 ? radius * 1.15 : radius * 0.48;
      outline.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  } else {
    for (let index = 0; index < 28; index++) {
      const a = (index / 28) * Math.PI * 2;
      outline.push([Math.cos(a) * radius, Math.sin(a) * radius]);
    }
  }
  const positions = [0, 0, 0];
  for (const [x, y] of outline) positions.push(x, y, 0);
  const indices: number[] = [];
  for (let index = 0; index < outline.length; index++) {
    indices.push(0, 1 + ((index + 1) % outline.length), 1 + index);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}

/** Ein Holzbrett (Boden, Rand, Sturz) als Box. */
export function plank(
  scene: Scene,
  name: string,
  size: { width: number; height: number; depth: number },
  disposables: ToyParts,
): Mesh {
  return track(CreateBox(name, size, scene), disposables);
}
