/**
 * Natur-Welt eines Bretts (CHAOS-62, Look „Stilisierte Natur“, EXP-009): Insel aus den
 * Brettgrenzen, Felder als Baumscheiben mit lackierter Farbeinlage (Form je Feldtyp) und
 * Symbol, Wegpfeile und Trittsteine, Bäume, Teich, Pilze am Pilzpfad, Felsen am Klippenweg,
 * Bretter der Wackelbrücke, Laternen, Blumen und Gras. Die Brett-Szene
 * (`createBoardScene.ts`) baut darauf Figuren, Texte und Kamera.
 *
 * Deko hängt an Brett-ID und Feldern (z. B. Pilze neben dem Feld mit Wegweiser „Pilzpfad“),
 * damit weitere Bretter ihre eigene Natur bekommen, ohne diesen Code umzubauen.
 */
import type { Material } from '@babylonjs/core/Materials/material.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { BoardDefinition, BoardSpace, SpaceKind } from '@chaos-party/game-core';
import {
  buildIsland,
  displace,
  flowers,
  lantern,
  mushroom,
  pine,
  rock,
  scatterGrass,
  StaticBatch,
  tree,
  trophyCup,
  type Grass,
} from '../nature/geometry.ts';
import type { NatureMaterials } from '../nature/materials.ts';
import { seeded } from '../nature/noise.ts';
import { createTerrain, type Hollow, type Terrain } from '../nature/terrain.ts';
import { boardBounds, type Point2 } from './layout.ts';

/** Oberkante der Baumscheiben (die Figuren stehen hier). */
export const TILE_TOP = 0.3;
/** Durchmesser einer Baumscheibe. */
export const TILE_DIAMETER = 1.5;
/** Halme bei Grafikstufe `hoch` (der Anteil je Stufe kommt aus `quality.ts`). */
export const BOARD_GRASS = 64000;

interface KindStyle {
  /** Lackfarbe der Einlage – gedeckter als die M2-Bonbonfarben, Farbton gleich. */
  readonly paint: string;
  /** Ecken der Einlage (32 = rund) – Form zusätzlich zur Farbe (Barrierefreiheit). */
  readonly tessellation: number;
  readonly rotation: number;
}

export const KIND_STYLES: Readonly<Record<SpaceKind, KindStyle>> = {
  start: { paint: '#f2ebdd', tessellation: 4, rotation: Math.PI / 4 },
  'coins-plus': { paint: '#3c7bd6', tessellation: 32, rotation: 0 },
  'coins-minus': { paint: '#d4534b', tessellation: 32, rotation: 0 },
  item: { paint: '#3f9e5a', tessellation: 4, rotation: Math.PI / 4 },
  event: { paint: '#e3ae38', tessellation: 6, rotation: 0 },
  trophy: { paint: '#8a68cc', tessellation: 8, rotation: Math.PI / 8 },
};

const CREAM = '#f6efe2';
const INK = '#2a2420';

export interface NatureBoardWorld {
  readonly terrain: Terrain;
  /** Bäume, die im Wind wackeln (Wackelwald). */
  readonly trees: readonly TransformNode[];
  /** Pokal je Trophäenfeld (nur sichtbar, solange das Feld aktiv ist). */
  readonly trophies: ReadonlyMap<string, TransformNode>;
  /** Schattenwerfer (Bäume, Felsen, Scheiben, Laternen …). */
  readonly casters: readonly Mesh[];
  readonly lanterns: readonly { readonly light: Vector3; readonly glass: Mesh }[];
  readonly grass: Grass;
}

export interface NatureBoardOptions {
  readonly mats: NatureMaterials;
  /** Spitzenfarbe der Halme (Stimmung). */
  readonly grassTip: string;
  /** Eigenleuchten der Einlagen (Nacht). */
  readonly glow: number;
  /** Halme bei Anteil 1 (Standard {@link BOARD_GRASS}). */
  readonly grassCount?: number;
}

function segmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/** Insel-Umriss für ein Brett: Brettgrenzen plus Rand für Deko und Abhang. */
export function boardIsland(board: BoardDefinition) {
  const bounds = boardBounds(board);
  return {
    centerX: bounds.center.x,
    centerZ: bounds.center.z,
    halfX: (bounds.maxX - bounds.minX) / 2 + 3.8,
    halfZ: (bounds.maxZ - bounds.minZ) / 2 + 3.6,
    squareness: 4.5,
  };
}

/** Wege als Strecken (für Gras-Aussparung und ebenes Gelände). */
export function boardEdges(board: BoardDefinition): [Point2, Point2][] {
  const byId = new Map(board.spaces.map((s) => [s.id, s]));
  const edges: [Point2, Point2][] = [];
  for (const space of board.spaces) {
    for (const next of space.next) {
      const target = byId.get(next);
      if (target) edges.push([space.position, target.position]);
    }
  }
  return edges;
}

/** Teich je Brett (Wackelwald: zwischen Sumpfabkürzung und Waldmitte). */
function pondFor(board: BoardDefinition): Hollow | null {
  if (board.id !== 'wackelwald') return null;
  return { x: 8, z: -0.6, rx: 1.9, rz: 2.6, depth: 0.42 };
}

/** Bäume in der Brettmitte (feste Lage wie in M2, `t` = Tanne). */
const WACKELWALD_TREES: readonly { x: number; z: number; s: number; t: boolean }[] = [
  { x: -6.5, z: 4.2, s: 0.8, t: false },
  { x: -3.2, z: 5.1, s: 0.75, t: true },
  { x: 0.4, z: 4.4, s: 0.9, t: false },
  { x: 3.8, z: 5.2, s: 0.8, t: true },
  { x: -7.4, z: 0.6, s: 0.85, t: true },
  { x: -4.3, z: 1.7, s: 0.9, t: false },
  { x: -1.2, z: 1.2, s: 0.75, t: true },
  { x: 2.2, z: 1.8, s: 0.85, t: false },
  { x: -5.6, z: -2.6, s: 0.75, t: true },
  { x: -2.4, z: -2.1, s: 0.85, t: false },
  { x: 1.1, z: -2.8, s: 0.8, t: true },
  { x: 4.4, z: -1.6, s: 0.85, t: false },
  { x: -7.8, z: -5.4, s: 0.65, t: true },
  { x: 6.2, z: 3.3, s: 0.7, t: true },
];

export function buildNatureBoard(
  scene: Scene,
  board: BoardDefinition,
  options: NatureBoardOptions,
): NatureBoardWorld {
  const { mats, glow } = options;
  const rnd = seeded(62);
  const spaces = new Map(board.spaces.map((s) => [s.id, s]));
  const edges = boardEdges(board);
  const pond = pondFor(board);
  const shape = boardIsland(board);
  const terrain = createTerrain({
    shape,
    flats: [
      ...board.spaces.map((s) => ({ x: s.position.x, z: s.position.z, radius: 0.95 })),
      ...edges.map(([a, b]) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, radius: 0.5 })),
    ],
    hollows: pond ? [pond] : [],
    relief: 0.4,
  });
  const casters: Mesh[] = [];
  casters.push(...buildIsland(scene, mats, terrain).slice(1));

  const statics = new StaticBatch('brett');
  buildTiles(scene, mats, board.spaces, glow, rnd, statics);
  buildPathMarkers(scene, mats, edges, terrain, rnd, statics);

  // Trophäen: Pokal über dem Feld, ein weicher Lichtring darunter.
  const trophies = new Map<string, TransformNode>();
  for (const space of board.spaces) {
    if (space.kind !== 'trophy') continue;
    const cup = trophyCup(scene, mats, `pokal-${space.id}`);
    const halo = CreateTorus(
      'pokal-glanz',
      { diameter: 1.7, thickness: 0.08, tessellation: 32 },
      scene,
    );
    halo.material = mats.plain('#ffe58a', { unlit: true });
    halo.parent = cup;
    halo.position.y = -0.08;
    halo.isPickable = false;
    cup.scaling.setAll(1.25);
    cup.position.set(space.position.x, TILE_TOP + 0.12, space.position.z);
    cup.setEnabled(false);
    trophies.set(space.id, cup);
  }

  // Bäume (Wackelwald in der Mitte, Wald am hinteren und seitlichen Rand).
  const trees: TransformNode[] = [];
  const plant = (x: number, z: number, s: number, isPine: boolean): void => {
    const at = new Vector3(x, terrain.height(x, z) - 0.05, z);
    const node = isPine ? pine(scene, mats, at, s, rnd) : tree(scene, mats, at, s, rnd);
    trees.push(node);
  };
  if (board.id === 'wackelwald') {
    for (const t of WACKELWALD_TREES) plant(t.x, t.z, t.s, t.t);
  }
  // Rand: hinten (von der Kamera weg) und an den Seiten, nie vorn (verdeckt die untere Reihe).
  const margin = 1.4;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rnd() * 0.15;
    const sinA = Math.sin(a);
    if (sinA < -0.35) continue;
    const r = terrain.rim(a) - margin - rnd() * 0.8;
    const x = shape.centerX + Math.cos(a) * r;
    const z = shape.centerZ + sinA * r;
    if (board.spaces.some((s) => Math.hypot(s.position.x - x, s.position.z - z) < 2.2)) continue;
    plant(x, z, 0.65 + rnd() * 0.3, rnd() < 0.5);
  }
  for (const node of trees) {
    for (const mesh of node.getChildMeshes()) casters.push(mesh as Mesh);
  }

  // Teich mit Steinrand, Seerosen und Schilf.
  if (pond) {
    const water = CreateDisc('teich', { radius: 1, tessellation: 48 }, scene);
    water.rotation.x = Math.PI / 2;
    water.scaling.set(pond.rx * 0.92, pond.rz * 0.92, 1);
    water.position.set(pond.x, -0.2, pond.z);
    water.material = mats.plain('#3b6e6a', { roughness: 0.05, alpha: 0.9, clearCoat: 1 });
    water.receiveShadows = true;
    water.isPickable = false;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rnd() * 0.3;
      const x = pond.x + Math.cos(a) * pond.rx * 0.98;
      const z = pond.z + Math.sin(a) * pond.rz * 0.98;
      rock(
        scene,
        mats,
        new Vector3(x, terrain.height(x, z) - 0.1, z),
        0.2 + rnd() * 0.15,
        rnd,
        statics,
      );
    }
    for (const [dx, dz, s] of [
      [-0.6, 0.5, 1],
      [0.5, -0.6, 0.8],
      [0.7, 0.9, 0.7],
    ] as const) {
      const pad = CreateCylinder(
        'seerose',
        { diameter: 0.55 * s, height: 0.015, tessellation: 16 },
        scene,
      );
      pad.position.set(pond.x + dx, -0.19, pond.z + dz);
      statics.add(pad, mats.plain('#4f7d34', { roughness: 0.35 }));
    }
    const reedMat = mats.plain('#6b8a3a', { roughness: 0.8, translucency: 0.4 });
    for (let i = 0; i < 14; i++) {
      const a = 0.4 + rnd() * 1.6;
      const r = 0.8 + rnd() * 0.15;
      const reed = CreateCylinder(
        'schilf',
        { diameterTop: 0.01, diameterBottom: 0.04, height: 0.8 + rnd() * 0.5, tessellation: 5 },
        scene,
      );
      reed.position.set(
        pond.x + Math.cos(a) * pond.rx * r,
        0.2,
        pond.z + Math.sin(a) * pond.rz * r,
      );
      reed.rotation.z = (rnd() - 0.5) * 0.3;
      statics.add(reed, reedMat);
    }
  }

  // Deko an beschrifteten Wegen: Pilze am Pilzpfad, Felsen am Klippenweg, Bretter der Brücke.
  for (const space of board.spaces) {
    if (!space.label) continue;
    const route = followRoute(space, spaces);
    const outward = (p: Point2, distance: number): Point2 => {
      const dx = p.x - shape.centerX;
      const dz = p.z - shape.centerZ;
      const len = Math.hypot(dx, dz) || 1;
      return { x: p.x + (dx / len) * distance, z: p.z + (dz / len) * distance };
    };
    if (/pilz/i.test(space.label)) {
      for (const s of route) {
        const p = outward(s.position, 1.6 + rnd() * 0.5);
        for (let k = 0; k < 2; k++) {
          const x = p.x + (rnd() - 0.5) * 0.8;
          const z = p.z + (rnd() - 0.5) * 0.8;
          mushroom(
            scene,
            mats,
            new Vector3(x, terrain.height(x, z) - 0.02, z),
            0.7 + rnd() * 0.6,
            rnd,
            statics,
          );
        }
      }
    } else if (/klippe/i.test(space.label)) {
      for (const s of route) {
        const p = outward(s.position, 1.8 + rnd() * 0.4);
        rock(
          scene,
          mats,
          new Vector3(p.x, terrain.height(p.x, p.z), p.z),
          0.45 + rnd() * 0.35,
          rnd,
          statics,
        );
      }
    } else if (/brücke|bruecke/i.test(space.label)) {
      const planks = mats.textured('brown_planks_05', { u: 0.6, v: 0.3, tint: '#d8b894' });
      const chain = [space, ...route];
      for (let i = 0; i + 1 < chain.length; i++) {
        const a = chain[i]?.position;
        const b = chain[i + 1]?.position;
        if (!a || !b) continue;
        const angle = -Math.atan2(b.z - a.z, b.x - a.x) + Math.PI / 2;
        for (let k = 1; k <= 5; k++) {
          const f = k / 6;
          const plank = CreateBox('planke', { width: 1.25, height: 0.07, depth: 0.3 }, scene);
          plank.position.set(a.x + (b.x - a.x) * f, 0.05, a.z + (b.z - a.z) * f);
          plank.rotation.y = angle + (rnd() - 0.5) * 0.12;
          statics.add(plank, planks);
        }
      }
    }
  }

  // Felsen verstreut am Rand vorn (niedrig, verdecken nichts).
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
    const r = terrain.rim(a) - 1.2;
    const x = shape.centerX + Math.cos(a) * r;
    const z = shape.centerZ + Math.sin(a) * r;
    rock(scene, mats, new Vector3(x, terrain.height(x, z), z), 0.25 + rnd() * 0.2, rnd, statics);
  }

  // Laternen außen am Weg, je zwischen zwei Feldern (nachts Lichtquellen).
  const lanterns: { light: Vector3; glass: Mesh }[] = [];
  const lanternEdges = edges.filter((_, i) => i % 7 === 3).slice(0, 6);
  for (const [a, b] of lanternEdges) {
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const dx = mid.x - shape.centerX;
    const dz = mid.z - shape.centerZ;
    const len = Math.hypot(dx, dz) || 1;
    const x = mid.x + (dx / len) * 1.15;
    const z = mid.z + (dz / len) * 1.15;
    const yaw = Math.atan2(dx, dz) + Math.PI / 2;
    lanterns.push(
      lantern(scene, mats, new Vector3(x, terrain.height(x, z) - 0.03, z), yaw, statics),
    );
  }
  for (const l of lanterns) casters.push(l.glass);

  const avoid = (x: number, z: number): boolean =>
    board.spaces.some(
      (s) => Math.hypot(s.position.x - x, s.position.z - z) < TILE_DIAMETER / 2 + 0.2,
    ) ||
    edges.some(([a, b]) => segmentDistance({ x, z }, a, b) < 0.3) ||
    (pond !== null && Math.hypot((x - pond.x) / pond.rx, (z - pond.z) / pond.rz) < 0.95);

  // Blumen in kleinen Gruppen.
  const flowerSpots: Vector3[] = [];
  for (let group = 0; group < 22; group++) {
    const cx = shape.centerX + (rnd() * 2 - 1) * shape.halfX * 0.85;
    const cz = shape.centerZ + (rnd() * 2 - 1) * shape.halfZ * 0.85;
    for (let k = 0; k < 7; k++) {
      const x = cx + (rnd() - 0.5) * 1.4;
      const z = cz + (rnd() - 0.5) * 1.0;
      if (!terrain.inside(x, z, 0.8) || avoid(x, z)) continue;
      flowerSpots.push(new Vector3(x, terrain.height(x, z) - 0.02, z));
    }
  }
  flowers(scene, mats, flowerSpots, rnd);

  casters.push(...statics.flush());
  const grass = scatterGrass(scene, terrain, {
    count: options.grassCount ?? BOARD_GRASS,
    avoid,
    tipHex: options.grassTip,
    rnd,
    scale: 1.25,
  });

  return { terrain, trees, trophies, casters, lanterns, grass };
}

/** Felder ab `start` bis zur nächsten Zusammenführung (beschrifteter Abzweig einer Gabel). */
function followRoute(start: BoardSpace, spaces: ReadonlyMap<string, BoardSpace>): BoardSpace[] {
  const route: BoardSpace[] = [start];
  let current = start;
  for (let i = 0; i < 12; i++) {
    const nextId = current.next[0];
    const next = nextId ? spaces.get(nextId) : undefined;
    if (!next || next.label || route.includes(next)) break;
    // Zusammenführung: Feld mit mehreren Vorgängern beendet den Abzweig.
    const predecessors = [...spaces.values()].filter((s) => s.next.includes(next.id)).length;
    if (predecessors > 1) break;
    route.push(next);
    current = next;
  }
  return route;
}

function polygon(
  scene: Scene,
  name: string,
  diameter: number,
  height: number,
  style: KindStyle,
): Mesh {
  const mesh = CreateCylinder(name, { diameter, height, tessellation: style.tessellation }, scene);
  mesh.rotation.y = style.rotation;
  return mesh;
}

/** Baumscheiben: Rinde, Holz, cremefarbener Rand und lackierte Einlage mit Symbol. */
function buildTiles(
  scene: Scene,
  mats: NatureMaterials,
  spaces: readonly BoardSpace[],
  glow: number,
  rnd: () => number,
  batch: StaticBatch,
): void {
  const bark = mats.textured('bark_brown_02', {
    u: 4,
    v: 0.45,
    tint: '#b8a594',
    key: 'scheibe-rinde',
  });
  const wood = mats.textured('oak_veneer_01', { u: 0.6, tint: '#e6cfae', key: 'scheibe-holz' });
  const rim = mats.plain(CREAM, { roughness: 0.5, glow: glow * 0.5 });
  const ink = mats.plain(CREAM, { roughness: 0.4, clearCoat: 0.4, glow: glow * 0.7 });
  const dark = mats.plain(INK, { roughness: 0.45, clearCoat: 0.4 });
  const red = mats.plain('#c8443c', { roughness: 0.5, clearCoat: 0.4, glow: glow * 0.5 });
  const at = (mesh: Mesh, x: number, y: number, z: number, material: Material): void => {
    mesh.position.set(x, y, z);
    batch.add(mesh, material);
  };
  for (const space of spaces) {
    const { x, z } = space.position;
    const style = KIND_STYLES[space.kind];
    const side = CreateCylinder(
      'scheibe-rinde',
      { diameter: TILE_DIAMETER + 0.02, height: 0.32, tessellation: 28, cap: Mesh.NO_CAP },
      scene,
    );
    displace(side, 0.025, 4, rnd() * 10);
    side.rotation.y = rnd() * Math.PI * 2;
    at(side, x, TILE_TOP - 0.17, z, bark);
    const top = CreateCylinder(
      'scheibe',
      { diameter: TILE_DIAMETER, height: 0.03, tessellation: 28 },
      scene,
    );
    top.rotation.y = rnd() * Math.PI * 2;
    at(top, x, TILE_TOP - 0.025, z, wood);
    const outline = polygon(scene, 'farbrand', 1.16, 0.02, style);
    at(outline, x, TILE_TOP - 0.005, z, rim);
    const inlay = polygon(scene, 'farbe', 1.0, 0.02, style);
    at(
      inlay,
      x,
      TILE_TOP + 0.002,
      z,
      mats.plain(style.paint, { roughness: 0.45, clearCoat: 0.6, glow }),
    );

    const y = TILE_TOP + 0.02;
    switch (space.kind) {
      case 'coins-plus':
        at(CreateBox('plus', { width: 0.6, height: 0.05, depth: 0.17 }, scene), x, y, z, ink);
        at(CreateBox('plus', { width: 0.17, height: 0.05, depth: 0.6 }, scene), x, y, z, ink);
        break;
      case 'coins-minus':
        at(CreateBox('minus', { width: 0.62, height: 0.05, depth: 0.18 }, scene), x, y, z, ink);
        break;
      case 'item': {
        const box = CreateBox('geschenk', { size: 0.42 }, scene);
        box.rotation.y = Math.PI / 4;
        at(box, x, y + 0.2, z, ink);
        for (const [w, d] of [
          [0.44, 0.1],
          [0.1, 0.44],
        ] as const) {
          const band = CreateBox('schleife', { width: w, height: 0.44, depth: d }, scene);
          band.rotation.y = Math.PI / 4;
          at(band, x, y + 0.2, z, red);
        }
        break;
      }
      case 'event': {
        at(
          CreateBox('ausruf', { width: 0.17, height: 0.46, depth: 0.17 }, scene),
          x,
          y + 0.36,
          z,
          dark,
        );
        at(
          CreateSphere('ausruf-punkt', { diameter: 0.19, segments: 8 }, scene),
          x,
          y + 0.06,
          z,
          dark,
        );
        break;
      }
      case 'trophy': {
        const base = CreateCylinder(
          'sockel',
          { diameterTop: 0.5, diameterBottom: 0.66, height: 0.12, tessellation: 8 },
          scene,
        );
        at(base, x, y + 0.04, z, ink);
        break;
      }
      case 'start': {
        for (const [ox, oz] of [
          [-0.19, -0.19],
          [0.19, 0.19],
        ] as const) {
          at(
            CreateBox('start-feld', { width: 0.38, height: 0.03, depth: 0.38 }, scene),
            x + ox,
            y,
            z + oz,
            dark,
          );
        }
        const pole = CreateCylinder(
          'fahnenmast',
          { diameter: 0.07, height: 1.4, tessellation: 8 },
          scene,
        );
        at(
          pole,
          x + 0.62,
          y + 0.7,
          z + 0.45,
          mats.textured('bark_brown_02', { u: 0.3, v: 1, tint: '#9c8572' }),
        );
        const flag = CreateBox('fahne', { width: 0.56, height: 0.36, depth: 0.03 }, scene);
        at(flag, x + 0.9, y + 1.22, z + 0.45, red);
        break;
      }
    }
  }
}

/** Wegpfeil in der Mitte jeder Verbindung, Trittsteine bei langen Wegen. */
function buildPathMarkers(
  scene: Scene,
  mats: NatureMaterials,
  edges: readonly [Point2, Point2][],
  terrain: Terrain,
  rnd: () => number,
  batch: StaticBatch,
): void {
  const paint = mats.plain(CREAM, { roughness: 0.55, clearCoat: 0.2 });
  for (const [a, b] of edges) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length === 0) continue;
    const ux = dx / length;
    const uz = dz / length;
    const start = TILE_DIAMETER / 2 + 0.05;
    const inner = length - TILE_DIAMETER - 0.1;
    if (inner <= 0.2) continue;
    const mid = start + inner / 2;
    const chevron = CreateCylinder(
      'pfeil',
      { diameter: 0.5, height: 0.05, tessellation: 3 },
      scene,
    );
    chevron.scaling.x = 1.2;
    chevron.rotation.y = Math.atan2(-dz, dx);
    batch.add(chevron, paint);
    chevron.position.set(a.x + ux * mid, 0.04, a.z + uz * mid);
    const stones = Math.max(0, Math.floor(inner / 0.7) - 1);
    for (let k = 0; k < stones; k++) {
      const d = start + ((k + 0.5) / stones) * inner;
      if (Math.abs(d - mid) < 0.4) continue;
      const x = a.x + ux * d + (rnd() - 0.5) * 0.1;
      const z = a.z + uz * d + (rnd() - 0.5) * 0.1;
      rock(scene, mats, new Vector3(x, terrain.height(x, z) - 0.06, z), 0.16, rnd, batch, 0.4);
    }
  }
}
