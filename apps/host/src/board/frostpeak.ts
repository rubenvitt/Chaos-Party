/**
 * Kulisse des Frostgipfels (CHAOS-198): verschneiter Gipfel in der Mitte (der Gipfelweg führt
 * rundherum), Bergkette hinter dem Brett, Seilbahn von der Talstation zur Bergstation, Gletscher
 * am Gletscherpfad, Schneewechten und Warnschilder an den Lawinenhängen, Eisbahn unter der
 * Rodelbahn, zugefrorener See, verschneite Tannen und ein Schneemann am Start. Alles prozedural
 * aus Grundkörpern, keine fremden Assets (Art-Direction: `docs/art-direction.md`, „Frostgipfel“).
 *
 * Lagen kommen aus der `BoardDefinition` (Seilbahn aus `cableCars`, Eis aus `ice`, Hänge aus
 * `avalanche.zones`), damit kleine Layout-Änderungen die Deko mitnehmen. Nichts bewegt sich:
 * Der Apple-Host bekommt die Kulisse unverändert als USDZ.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { isIce, type BoardDefinition } from '@chaos-party/game-core';
import { displace, StaticBatch } from '../nature/geometry.ts';
import type { NatureMaterials } from '../nature/materials.ts';
import type { Terrain } from '../nature/terrain.ts';
import type { Point2 } from './layout.ts';

/** Winterfarben: Schnee leicht bläulich, Fels kühl grau, Akzente wie Rettungsrot. */
export const FROST_COLORS = {
  snow: '#f1f5fa',
  snowShade: '#dfe7f0',
  rock: '#7f838c',
  ice: '#a7dcf2',
  glacier: '#c4e6f5',
  red: '#d4473d',
  wood: '#8a5a3b',
  warning: '#f2c14e',
  ink: '#2a2420',
} as const;

/** Mitte und Fußradius des Gipfels (zwischen Gipfelweg vorn und Höhenweg hinten). */
export const PEAK = { x: 0, z: 4.6, radius: 3.5, height: 4.8 } as const;
/** Zugefrorener See unten in der Mitte (unter der Seilbahn frei). */
const LAKE = { x: -6.2, z: -6, rx: 3, rz: 2 } as const;
/** Abstand der Deko zu Feldmitten (Felder sind 1,5 breit). */
const CLEAR = 1.35;

export interface FrostpeakWorld {
  /** Schattenwerfer. */
  readonly casters: readonly Mesh[];
  /** Verschneite Tannen (wackeln im Wind wie im Wackelwald). */
  readonly trees: readonly TransformNode[];
  /** Kein Gras hier (Gipfel, See, Stationen). */
  avoid(x: number, z: number): boolean;
}

export interface FrostpeakOptions {
  readonly mats: NatureMaterials;
  readonly terrain: Terrain;
  readonly rnd: () => number;
}

/** Zylinder von `a` nach `b` (Seil, Balken), für `StaticBatch`. */
function beam(scene: Scene, name: string, a: Vector3, b: Vector3, diameter: number): Mesh {
  const mesh = CreateCylinder(
    name,
    { diameter, height: Vector3.Distance(a, b), tessellation: 6 },
    scene,
  );
  mesh.position = Vector3.Lerp(a, b, 0.5);
  const dir = b.subtract(a).normalize();
  const axis = Vector3.Cross(Vector3.Up(), dir);
  const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Up(), dir))));
  if (axis.lengthSquared() > 1e-6) mesh.rotate(axis.normalize(), angle);
  return mesh;
}

/** Verschneite Tanne: dunkle Nadelkegel, jeder mit Schneehaube. Ein Knoten, zwei Materialien. */
function snowyPine(
  scene: Scene,
  mats: NatureMaterials,
  at: Vector3,
  scale: number,
  rnd: () => number,
): TransformNode {
  const root = new TransformNode('schneetanne', scene);
  root.position = at.clone();
  root.scaling.setAll(scale);
  root.rotation.y = rnd() * Math.PI * 2;
  const batch = new StaticBatch('schneetanne');
  const trunk = CreateCylinder(
    'stamm',
    { diameterTop: 0.12, diameterBottom: 0.28, height: 1.1, tessellation: 8 },
    scene,
  );
  trunk.position.y = 0.55;
  batch.add(trunk, mats.textured('bark_brown_02', { u: 1, v: 2, tint: '#9c8a7c' }));
  const needles = mats.plain('#2f5a40', { roughness: 0.9, bumpFrom: 'leafy_grass', bumpScale: 4 });
  const snow = mats.plain(FROST_COLORS.snow, { roughness: 0.85 });
  const layers: [number, number, number][] = [
    [0.6, 1.9, 1.25],
    [1.3, 1.5, 1.1],
    [1.95, 1.1, 0.95],
    [2.5, 0.7, 0.8],
  ];
  for (const [y, d, h] of layers) {
    const cone = CreateCylinder(
      'nadeln',
      { diameterTop: 0, diameterBottom: d, height: h, tessellation: 16, subdivisions: 3 },
      scene,
    );
    displace(cone, 0.07, 3, rnd() * 20);
    cone.position.y = y + h / 2;
    batch.add(cone, needles);
    // Schneehaube: obere Hälfte des Kegels etwas größer, weiß.
    const cap = CreateCylinder(
      'schneehaube',
      { diameterTop: 0, diameterBottom: d * 0.62, height: h * 0.55, tessellation: 16 },
      scene,
    );
    displace(cap, 0.05, 4, rnd() * 20);
    cap.position.y = y + h - (h * 0.55) / 2 + 0.03;
    batch.add(cap, snow);
  }
  batch.flush(root);
  return root;
}

/** Berg aus Felskegel mit Schneehaube; `rocky` = mehr Fels sichtbar. */
function mountain(
  scene: Scene,
  mats: NatureMaterials,
  batch: StaticBatch,
  at: Vector3,
  radius: number,
  height: number,
  seed: number,
  name: string,
): void {
  const rock = CreateCylinder(
    `${name}-fels`,
    { diameterTop: 0, diameterBottom: radius * 2, height, tessellation: 36, subdivisions: 10 },
    scene,
  );
  displace(rock, radius * 0.12, 1.4 / radius, seed);
  rock.position.set(at.x, at.y + height / 2, at.z);
  batch.add(
    rock,
    mats.plain(FROST_COLORS.rock, { roughness: 0.9, bumpFrom: 'mossy_rock', bumpScale: 2 }),
  );
  // Schnee: obere 65 % als etwas dickerer Kegel, unten ausgefranst.
  const capHeight = height * 0.65;
  const cap = CreateCylinder(
    `${name}-schnee`,
    {
      diameterTop: 0,
      diameterBottom: radius * 2 * 0.7,
      height: capHeight,
      tessellation: 36,
      subdivisions: 8,
    },
    scene,
  );
  displace(cap, radius * 0.09, 1.8 / radius, seed + 7);
  cap.position.set(at.x, at.y + height - capHeight / 2 + 0.06, at.z);
  batch.add(cap, mats.plain(FROST_COLORS.snow, { roughness: 0.8 }));
}

export function buildFrostpeak(
  scene: Scene,
  board: BoardDefinition,
  statics: StaticBatch,
  options: FrostpeakOptions,
): FrostpeakWorld {
  const { mats, terrain, rnd } = options;
  const shape = terrain.shape;
  const byId = new Map(board.spaces.map((s) => [s.id, s]));
  const casters: Mesh[] = [];
  const trees: TransformNode[] = [];
  const ground = (x: number, z: number) => terrain.height(x, z);
  const nearSpace = (x: number, z: number, distance = CLEAR) =>
    board.spaces.some((s) => Math.hypot(s.position.x - x, s.position.z - z) < distance);
  const snow = mats.plain(FROST_COLORS.snow, { roughness: 0.85 });
  const wood = mats.textured('brown_planks_05', { u: 0.6, v: 0.6, tint: '#b38f6f' });

  // --- Gipfel in der Mitte, mit Gipfelkreuz -------------------------------------------------
  mountain(
    scene,
    mats,
    statics,
    new Vector3(PEAK.x, ground(PEAK.x, PEAK.z) - 0.25, PEAK.z),
    PEAK.radius,
    PEAK.height,
    3.1,
    'gipfel',
  );
  const top = new Vector3(PEAK.x, ground(PEAK.x, PEAK.z) - 0.25 + PEAK.height, PEAK.z);
  const post = CreateBox('gipfelkreuz', { width: 0.1, height: 1.1, depth: 0.1 }, scene);
  post.position.set(top.x, top.y + 0.35, top.z);
  statics.add(post, wood);
  const arm = CreateBox('gipfelkreuz', { width: 0.6, height: 0.1, depth: 0.1 }, scene);
  arm.position.set(top.x, top.y + 0.6, top.z);
  statics.add(arm, wood);

  // --- Bergkette hinter dem Brett (fern, nur Kulisse) ---------------------------------------
  const back = shape.centerZ + shape.halfZ + 22;
  const range: [number, number, number, number][] = [
    [-44, 2, 16, 15],
    [-22, 8, 18, 20],
    [0, 12, 20, 24],
    [22, 6, 18, 19],
    [44, 0, 16, 14],
  ];
  range.forEach(([x, dz, radius, height], i) => {
    mountain(
      scene,
      mats,
      statics,
      new Vector3(x, terrain.baseY - 3, back + dz),
      radius,
      height,
      11 + i * 5.3,
      'bergkette',
    );
  });

  // --- Seilbahn: Talstation, Stütze, zwei Seile, Gondel, Bergstation --------------------------
  for (const car of board.cableCars ?? []) {
    const from = byId.get(car.from)?.position;
    const to = byId.get(car.to)?.position;
    if (!from || !to) continue;
    // Talstation hinter der Talstation-Kachel (weg von der Kamera), Bergstation zum Gipfel hin.
    const valley = { x: from.x + 1.8, z: from.z + 2.4 };
    const toPeak = Math.hypot(PEAK.x - to.x, PEAK.z - to.z) || 1;
    const summit = {
      x: to.x + ((PEAK.x - to.x) / toPeak) * 2.1,
      z: to.z + ((PEAK.z - to.z) / toPeak) * 2.1,
    };
    const station = (at: Point2, name: string, roofColor: string): Vector3 => {
      const y = ground(at.x, at.z);
      const house = CreateBox(name, { width: 1.7, height: 1.3, depth: 1.3 }, scene);
      house.position.set(at.x, y + 0.65, at.z);
      statics.add(house, wood);
      const roof = CreateCylinder(
        `${name}-dach`,
        { diameter: 1.45, height: 2, tessellation: 3 },
        scene,
      );
      roof.rotation.z = Math.PI / 2;
      roof.rotation.y = Math.atan2(to.z - from.z, to.x - from.x);
      roof.position.set(at.x, y + 1.55, at.z);
      statics.add(roof, mats.plain(roofColor, { roughness: 0.6 }));
      const roofSnow = CreateBox(`${name}-schnee`, { width: 1.9, height: 0.08, depth: 0.7 }, scene);
      roofSnow.position.set(at.x, y + 1.98, at.z);
      roofSnow.rotation.y = -roof.rotation.y;
      statics.add(roofSnow, snow);
      return new Vector3(at.x, y + 1.25, at.z);
    };
    const a = station(valley, 'talstation', FROST_COLORS.red);
    const b = station(summit, 'bergstation', FROST_COLORS.red);
    // Stütze in der Mitte, Seile mit leichtem Durchhang.
    const mid = Vector3.Lerp(a, b, 0.5);
    const pylonTop = Math.max(a.y, b.y) + 1.6;
    const steel = mats.plain('#5d6470', { roughness: 0.45, metallic: 0.6 });
    const groundMid = ground(mid.x, mid.z);
    statics.add(
      beam(
        scene,
        'seilbahn-stuetze',
        new Vector3(mid.x, groundMid, mid.z),
        new Vector3(mid.x, pylonTop, mid.z),
        0.18,
      ),
      steel,
    );
    const dir = b.subtract(a);
    const side = new Vector3(-dir.z, 0, dir.x).normalize().scale(0.28);
    const cross = beam(
      scene,
      'seilbahn-traverse',
      new Vector3(mid.x, pylonTop, mid.z).add(side.scale(1.4)),
      new Vector3(mid.x, pylonTop, mid.z).subtract(side.scale(1.4)),
      0.12,
    );
    statics.add(cross, steel);
    const cable = mats.plain('#2b2b30', { roughness: 0.5, metallic: 0.5 });
    const segments = 12;
    const ropeAt = (t: number, offset: Vector3): Vector3 => {
      const p =
        t < 0.5
          ? Vector3.Lerp(a, new Vector3(mid.x, pylonTop, mid.z), t * 2)
          : Vector3.Lerp(new Vector3(mid.x, pylonTop, mid.z), b, (t - 0.5) * 2);
      const local = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      p.y -= 0.35 * 4 * local * (1 - local);
      return p.add(offset);
    };
    for (const offset of [side, side.scale(-1)]) {
      for (let i = 0; i < segments; i++) {
        statics.add(
          beam(
            scene,
            'seilbahn-seil',
            ropeAt(i / segments, offset),
            ropeAt((i + 1) / segments, offset),
            0.035,
          ),
          cable,
        );
      }
    }
    // Gondel hängt am Seil (Viertel vor der Stütze, gut sichtbar über dem Tal).
    const hang = ropeAt(0.3, side);
    const gondola = CreateBox('seilbahn-gondel', { width: 0.9, height: 0.75, depth: 0.7 }, scene);
    gondola.position.set(hang.x, hang.y - 0.85, hang.z);
    gondola.rotation.y = -Math.atan2(dir.z, dir.x);
    statics.add(gondola, mats.plain(FROST_COLORS.red, { roughness: 0.4, clearCoat: 0.6 }));
    const windows = CreateBox(
      'seilbahn-fenster',
      { width: 0.92, height: 0.28, depth: 0.72 },
      scene,
    );
    windows.position.set(hang.x, hang.y - 0.75, hang.z);
    windows.rotation.y = gondola.rotation.y;
    statics.add(windows, mats.plain('#cfe8f5', { roughness: 0.1, clearCoat: 1 }));
    statics.add(
      beam(scene, 'seilbahn-gehaenge', new Vector3(hang.x, hang.y - 0.45, hang.z), hang, 0.04),
      steel,
    );
  }

  // --- Eisbahn: glänzende Streifen von Eisfeld zu Eisfeld (Rodelbahn, Gletscher) --------------
  const iceMat = mats.plain(FROST_COLORS.ice, { roughness: 0.08, clearCoat: 1, alpha: 0.92 });
  for (const space of board.spaces) {
    if (!isIce(board, space.id)) continue;
    const next = byId.get(space.next[0] ?? '');
    if (!next) continue;
    const a = space.position;
    const b = next.position;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const strip = CreateBox('eisbahn', { width: length, height: 0.04, depth: 0.95 }, scene);
    strip.position.set((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2);
    strip.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    statics.add(strip, iceMat);
  }

  // --- Gletscher am Gletscherpfad: Eisblöcke zur Brettmitte hin -------------------------------
  const glacier = board.spaces.find((s) => s.label === 'Gletscherpfad');
  if (glacier) {
    const blockMat = mats.plain(FROST_COLORS.glacier, { roughness: 0.15, clearCoat: 0.8 });
    for (let i = 0; i < 16; i++) {
      const z = glacier.position.z + 1.5 + i * 0.95 + (rnd() - 0.5) * 0.4;
      const x = glacier.position.x - 2.6 - rnd() * 1.4;
      if (nearSpace(x, z, 1.25)) continue;
      const size = 0.45 + rnd() * 0.5;
      const block = CreateBox('gletscher', { width: size, height: size * 0.8, depth: size }, scene);
      displace(block, 0.04, 3, rnd() * 50);
      block.position.set(x, ground(x, z) + size * 0.3, z);
      block.rotation.set((rnd() - 0.5) * 0.4, rnd() * Math.PI, (rnd() - 0.5) * 0.4);
      statics.add(block, blockMat);
    }
  }

  // --- Lawinenhänge: Schneewechten neben jedem Feld, Warnschilder an den Enden ----------------
  const signPost = mats.plain('#3b3b40', { roughness: 0.5, metallic: 0.3 });
  const signFace = mats.plain(FROST_COLORS.warning, { roughness: 0.4, glow: 0.15 });
  const signInk = mats.plain(FROST_COLORS.ink, { roughness: 0.5 });
  const away = (p: Point2, distance: number): Point2 => {
    const dx = p.x - PEAK.x;
    const dz = p.z - PEAK.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: p.x - (dx / len) * distance, z: p.z - (dz / len) * distance };
  };
  for (const zone of board.avalanche?.zones ?? []) {
    zone.spaces.forEach((id, index) => {
      const at = byId.get(id)?.position;
      if (!at) return;
      // Wechte bergseitig (zum Gipfel hin), wenn dort Platz ist.
      for (const distance of [1.6, 2.3]) {
        const p = away(at, distance);
        if (nearSpace(p.x, p.z, 1.1)) continue;
        const drift = CreateSphere('wechte', { diameter: 1.3, segments: 10 }, scene);
        displace(drift, 0.12, 1.5, rnd() * 50);
        drift.scaling.set(1 + rnd() * 0.4, 0.45 + rnd() * 0.2, 0.8 + rnd() * 0.3);
        drift.position.set(p.x, ground(p.x, p.z) + 0.05, p.z);
        drift.rotation.y = rnd() * Math.PI;
        statics.add(drift, snow);
      }
      if (index !== 0 && index !== zone.spaces.length - 1) return;
      // Warnschild (gelbes Dreieck mit Ausrufezeichen) talseitig neben dem ersten/letzten Feld.
      const p = away(at, -1.15);
      const sx = p.x;
      const sz = p.z;
      const y = ground(sx, sz);
      statics.add(
        beam(scene, 'lawine-schild', new Vector3(sx, y, sz), new Vector3(sx, y + 1.25, sz), 0.07),
        signPost,
      );
      const face = CreateCylinder(
        'lawine-schild',
        { diameter: 0.7, height: 0.05, tessellation: 3 },
        scene,
      );
      face.rotation.x = -Math.PI / 2;
      face.rotation.y = Math.PI;
      face.position.set(sx, y + 1.45, sz - 0.05);
      statics.add(face, signFace);
      const bar = CreateBox('lawine-schild', { width: 0.06, height: 0.2, depth: 0.03 }, scene);
      bar.position.set(sx, y + 1.48, sz - 0.09);
      statics.add(bar, signInk);
      const dot = CreateBox('lawine-schild', { width: 0.06, height: 0.06, depth: 0.03 }, scene);
      dot.position.set(sx, y + 1.33, sz - 0.09);
      statics.add(dot, signInk);
    });
  }

  // --- Zugefrorener See mit Schneerand ------------------------------------------------------
  const lake = CreateDisc('eissee', { radius: 1, tessellation: 40 }, scene);
  lake.rotation.x = Math.PI / 2;
  lake.scaling.set(LAKE.rx, LAKE.rz, 1);
  lake.position.set(LAKE.x, ground(LAKE.x, LAKE.z) + 0.03, LAKE.z);
  lake.material = mats.plain('#b9def0', { roughness: 0.05, clearCoat: 1 });
  lake.receiveShadows = true;
  lake.isPickable = false;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rnd() * 0.2;
    const x = LAKE.x + Math.cos(a) * LAKE.rx * 1.05;
    const z = LAKE.z + Math.sin(a) * LAKE.rz * 1.05;
    const lump = CreateSphere('schneerand', { diameter: 0.7, segments: 8 }, scene);
    lump.scaling.set(1.2, 0.35, 1);
    lump.position.set(x, ground(x, z), z);
    statics.add(lump, snow);
  }

  // --- Schneemann neben dem Start ------------------------------------------------------------
  const start = byId.get(board.start)?.position;
  if (start) {
    const x = start.x - 1.5;
    const z = start.z + 2.3;
    const y = ground(x, z);
    for (const [h, d] of [
      [0.35, 0.8],
      [0.95, 0.58],
      [1.42, 0.42],
    ] as const) {
      const ball = CreateSphere('schneemann', { diameter: d, segments: 12 }, scene);
      ball.position.set(x, y + h, z);
      statics.add(ball, snow);
    }
    const nose = CreateCylinder(
      'schneemann-nase',
      { diameterTop: 0, diameterBottom: 0.09, height: 0.3, tessellation: 8 },
      scene,
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(x, y + 1.42, z - 0.32);
    statics.add(nose, mats.plain('#e8792f', { roughness: 0.5 }));
    const hat = CreateCylinder(
      'schneemann-hut',
      { diameter: 0.34, height: 0.3, tessellation: 16 },
      scene,
    );
    hat.position.set(x, y + 1.72, z);
    statics.add(hat, mats.plain(FROST_COLORS.ink, { roughness: 0.6 }));
    const scarf = CreateCylinder(
      'schneemann-schal',
      { diameter: 0.5, height: 0.1, tessellation: 16 },
      scene,
    );
    scarf.position.set(x, y + 1.2, z);
    statics.add(scarf, mats.plain(FROST_COLORS.red, { roughness: 0.7 }));
  }

  // --- Verschneite Tannen: Rand hinten und seitlich, Gruppen in freien Flächen ----------------
  const avoid = (x: number, z: number): boolean =>
    Math.hypot(x - PEAK.x, z - PEAK.z) < PEAK.radius + 0.3 ||
    Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1.15;
  const plant = (x: number, z: number, scale: number): void => {
    if (!terrain.inside(x, z, 0.8) || nearSpace(x, z, 1.6) || avoid(x, z)) return;
    trees.push(snowyPine(scene, mats, new Vector3(x, ground(x, z) - 0.05, z), scale, rnd));
  };
  const margin = 1.4;
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + rnd() * 0.15;
    const sinA = Math.sin(a);
    if (sinA < -0.35) continue;
    const r = terrain.rim(a) - margin - rnd() * 0.8;
    plant(shape.centerX + Math.cos(a) * r, shape.centerZ + sinA * r, 0.65 + rnd() * 0.35);
  }
  // Lärchenhang und Serpentinen: zwischen den Wegen; dazu ein Wäldchen unten am See.
  for (const [cx, cz, count] of [
    [18.6, -2, 6],
    [-18.6, 1, 6],
    [-9.5, -8.6, 4],
    [10.6, -6.5, 3],
    [-9.4, 8.2, 3],
    [9.6, 7.6, 3],
  ] as const) {
    for (let k = 0; k < count; k++) {
      plant(cx + (rnd() - 0.5) * 3.2, cz + (rnd() - 0.5) * 8, 0.55 + rnd() * 0.3);
    }
  }
  for (const node of trees) {
    for (const mesh of node.getChildMeshes()) casters.push(mesh as Mesh);
  }

  return { casters, trees, avoid };
}
