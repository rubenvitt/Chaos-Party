/**
 * Gemeinsamer Szenen-Ausschnitt für den Look-Dev (CHAOS-56): ein Stück Brett (Insel, Weg mit
 * Feldern, Bäume, Teich, Pilze, Steine, Trophäe, Wegweiser) und eine Minispiel-Ecke
 * (Pudding-Teller). Formen sind weicher modelliert als im M2-Brett (Rundungen über Torus-Ränder
 * und Drehkörper), damit Licht und Material wirken können. Jede Stilrichtung liefert Palette,
 * Materialien und Segmentzahl; facettierte Richtungen schalten Flat-Shading ein.
 */
import type { Material } from '@babylonjs/core/Materials/material.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js';
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Look, Surface } from './looks.ts';

/** Zufall mit festem Startwert (gleiche Szene in allen Richtungen). */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export interface BuiltContent {
  readonly meshes: Mesh[];
  /** Felder des Wegs (Mittelpunkte, Oberkante), für Figuren. */
  readonly tiles: Vector3[];
  /** Stellplätze im Minispiel. */
  readonly arenaSpots: Vector3[];
}

class Builder {
  readonly meshes: Mesh[] = [];
  private readonly materials = new Map<string, Material>();

  constructor(
    readonly scene: Scene,
    readonly look: Look,
  ) {}

  get seg(): number {
    return this.look.tessellation;
  }

  mat(hex: string, surface: Surface): Material {
    const key = `${hex}-${surface}`;
    let mat = this.materials.get(key);
    if (!mat) {
      mat = this.look.material(this.scene, `mat-${key}`, hex, surface);
      this.materials.set(key, mat);
    }
    return mat;
  }

  add(mesh: Mesh, hex: string, surface: Surface, parent?: TransformNode, flat = false): Mesh {
    mesh.material = this.mat(hex, surface);
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    if (parent) mesh.parent = parent;
    if (this.look.facetted) mesh.convertToFlatShadedMesh();
    // Flache Scheiben bekommen keine Kontur (sie würde die ganze Fläche überdecken).
    if (this.look.outline && !flat) {
      mesh.renderOutline = true;
      mesh.outlineWidth = 0.025;
      mesh.outlineColor = darker(hex);
    }
    this.meshes.push(mesh);
    return mesh;
  }
}

function darker(hex: string): Color3 {
  // Konturfarbe: Grundfarbe stark abgedunkelt und leicht ins Violett (wirkt weicher als Schwarz).
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return new Color3(r * 0.32 + 0.06, g * 0.28 + 0.04, b * 0.34 + 0.1);
}

// ---------------------------------------------------------------------------------------------

function tile(b: Builder, at: Vector3, kind: 'plus' | 'minus' | 'gold' | 'gift'): void {
  const p = b.look.palette;
  const base =
    kind === 'plus'
      ? p.tileBlue
      : kind === 'minus'
        ? p.tileRed
        : kind === 'gold'
          ? p.tileGold
          : p.tileGift;
  const root = new TransformNode(`feld-${kind}`, b.scene);
  root.position = at.clone();
  // Sockel mit gerundeter Kante (Zylinder + Torus).
  const body = CreateCylinder(
    'feld',
    { diameter: 1.36, height: 0.22, tessellation: b.seg },
    b.scene,
  );
  body.position.y = 0.11;
  b.add(body, base, 'plastik', root);
  const rim = CreateTorus(
    'feld-rand',
    { diameter: 1.36, thickness: 0.22, tessellation: b.seg },
    b.scene,
  );
  rim.position.y = 0.11;
  b.add(rim, base, 'plastik', root);
  const top = CreateCylinder(
    'feld-deckel',
    { diameter: 1.12, height: 0.06, tessellation: b.seg },
    b.scene,
  );
  top.position.y = 0.23;
  b.add(top, p.white, 'plastik', root);
  // Symbol
  const ink = base;
  if (kind === 'plus' || kind === 'minus') {
    const bar = CreateBox('symbol', { width: 0.6, height: 0.1, depth: 0.16 }, b.scene);
    bar.position.y = 0.29;
    b.add(bar, ink, 'glanz', root);
    if (kind === 'plus') {
      const bar2 = CreateBox('symbol', { width: 0.16, height: 0.1, depth: 0.6 }, b.scene);
      bar2.position.y = 0.29;
      b.add(bar2, ink, 'glanz', root);
    }
  } else if (kind === 'gold') {
    const coin = CreateCylinder(
      'muenze',
      { diameter: 0.5, height: 0.1, tessellation: b.seg },
      b.scene,
    );
    coin.position.y = 0.31;
    b.add(coin, p.gold, 'metall', root);
    const ring = CreateTorus(
      'muenze-rand',
      { diameter: 0.5, thickness: 0.08, tessellation: b.seg },
      b.scene,
    );
    ring.position.y = 0.34;
    b.add(ring, p.gold, 'metall', root);
  } else {
    const box = CreateBox('geschenk', { size: 0.46 }, b.scene);
    box.position.y = 0.5;
    box.rotation.y = 0.5;
    b.add(box, ink, 'plastik', root);
    const band1 = CreateBox('band', { width: 0.48, height: 0.48, depth: 0.1 }, b.scene);
    band1.position.y = 0.5;
    band1.rotation.y = 0.5;
    b.add(band1, p.white, 'glanz', root);
    const band2 = CreateBox('band', { width: 0.1, height: 0.48, depth: 0.48 }, b.scene);
    band2.position.y = 0.5;
    band2.rotation.y = 0.5;
    b.add(band2, p.white, 'glanz', root);
    const bow = CreateTorus(
      'schleife',
      { diameter: 0.2, thickness: 0.07, tessellation: 16 },
      b.scene,
    );
    bow.position.y = 0.78;
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = 0.5;
    b.add(bow, p.white, 'glanz', root);
  }
}

function roundTree(b: Builder, at: Vector3, scale: number, rnd: () => number): void {
  const p = b.look.palette;
  const root = new TransformNode('baum', b.scene);
  root.position = at.clone();
  root.scaling.setAll(scale);
  const trunk = CreateCylinder(
    'stamm',
    { diameterTop: 0.22, diameterBottom: 0.34, height: 1.1, tessellation: Math.min(b.seg, 14) },
    b.scene,
  );
  trunk.position.y = 0.55;
  b.add(trunk, p.trunk, 'matt', root);
  const leaf = p.leaves[Math.floor(rnd() * 3) % 3] ?? p.leaves[0];
  const blobs: [number, number, number, number][] = [
    [0, 1.55, 0, 1.25],
    [0.42, 1.3, 0.18, 0.85],
    [-0.38, 1.35, -0.12, 0.9],
    [0.05, 2.05, 0.05, 0.8],
  ];
  for (const [x, y, z, d] of blobs) {
    const s = b.look.facetted
      ? CreateIcoSphere('krone', { radius: d / 2, subdivisions: 1 }, b.scene)
      : CreateSphere('krone', { diameter: d, segments: Math.max(8, b.seg / 2) }, b.scene);
    s.position.set(x, y, z);
    b.add(s, leaf, 'creme', root);
  }
}

function pineTree(b: Builder, at: Vector3, scale: number, rnd: () => number): void {
  const p = b.look.palette;
  const root = new TransformNode('tanne', b.scene);
  root.position = at.clone();
  root.scaling.setAll(scale);
  root.rotation.y = rnd() * Math.PI;
  const trunk = CreateCylinder(
    'stamm',
    { diameter: 0.24, height: 0.6, tessellation: Math.min(b.seg, 12) },
    b.scene,
  );
  trunk.position.y = 0.3;
  b.add(trunk, p.trunk, 'matt', root);
  const leaf = p.leaves[1];
  const layers: [number, number, number][] = [
    [0.55, 1.5, 1.0],
    [1.15, 1.15, 0.85],
    [1.7, 0.8, 0.7],
  ];
  for (const [y, d, h] of layers) {
    const cone = b.look.facetted
      ? CreateCylinder(
          'nadeln',
          { diameterTop: 0, diameterBottom: d, height: h, tessellation: 6 },
          b.scene,
        )
      : CreateLathe(
          'nadeln',
          {
            shape: [
              new Vector3(0, 0, 0),
              new Vector3(d / 2, 0.02, 0),
              new Vector3(d / 2 - 0.04, 0.12, 0),
              new Vector3(0.05, h - 0.04, 0),
              new Vector3(0, h, 0),
            ],
            tessellation: b.seg,
          },
          b.scene,
        );
    cone.position.y = b.look.facetted ? y + h / 2 : y;
    b.add(cone, leaf, 'creme', root);
  }
}

function rock(b: Builder, at: Vector3, size: number, rnd: () => number): void {
  const r = CreateIcoSphere(
    'stein',
    { radius: size, subdivisions: b.look.facetted ? 1 : 3 },
    b.scene,
  );
  r.position = at.clone();
  r.position.y += size * 0.3;
  r.scaling.set(1 + rnd() * 0.3, 0.65 + rnd() * 0.2, 1 + rnd() * 0.2);
  r.rotation.y = rnd() * 3;
  b.add(r, b.look.palette.rock, 'matt');
}

function mushroom(b: Builder, at: Vector3, scale: number): void {
  const p = b.look.palette;
  const root = new TransformNode('pilz', b.scene);
  root.position = at.clone();
  root.scaling.setAll(scale);
  const stem = CreateCylinder(
    'pilz-stiel',
    { diameterTop: 0.22, diameterBottom: 0.3, height: 0.42, tessellation: Math.min(b.seg, 16) },
    b.scene,
  );
  stem.position.y = 0.21;
  b.add(stem, p.white, 'creme', root);
  const cap = CreateSphere(
    'pilz-hut',
    { diameter: 0.7, segments: Math.max(6, b.seg / 3), slice: 0.5 },
    b.scene,
  );
  cap.position.y = 0.38;
  cap.scaling.y = 0.8;
  b.add(cap, p.cap, 'plastik', root);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const dot = CreateSphere('punkt', { diameter: 0.1, segments: 6 }, b.scene);
    dot.position.set(Math.cos(a) * 0.22, 0.58, Math.sin(a) * 0.22);
    dot.scaling.y = 0.4;
    b.add(dot, p.white, 'creme', root);
  }
}

function trophy(b: Builder, at: Vector3): void {
  const p = b.look.palette;
  const root = new TransformNode('trophaee', b.scene);
  root.position = at.clone();
  const cup = CreateLathe(
    'pokal',
    {
      shape: [
        new Vector3(0, 0, 0),
        new Vector3(0.3, 0, 0),
        new Vector3(0.3, 0.08, 0),
        new Vector3(0.1, 0.14, 0),
        new Vector3(0.07, 0.4, 0),
        new Vector3(0.18, 0.48, 0),
        new Vector3(0.36, 0.7, 0),
        new Vector3(0.4, 0.98, 0),
        new Vector3(0.34, 0.98, 0),
        new Vector3(0.3, 0.74, 0),
        new Vector3(0, 0.6, 0),
      ],
      tessellation: b.seg,
    },
    b.scene,
  );
  b.add(cup, p.gold, 'metall', root);
  for (const side of [-1, 1]) {
    const handle = CreateTorus(
      'henkel',
      { diameter: 0.3, thickness: 0.06, tessellation: 20 },
      b.scene,
    );
    handle.position.set(side * 0.4, 0.72, 0);
    handle.rotation.x = Math.PI / 2;
    b.add(handle, p.gold, 'metall', root);
  }
  const star = CreateIcoSphere('glanz', { radius: 0.09, subdivisions: 1 }, b.scene);
  star.position.y = 1.18;
  b.add(star, p.gold, 'metall', root);
}

function signpost(b: Builder, at: Vector3): void {
  const p = b.look.palette;
  const root = new TransformNode('wegweiser', b.scene);
  root.position = at.clone();
  root.rotation.y = -0.4;
  const post = CreateCylinder(
    'pfosten',
    { diameter: 0.14, height: 1.5, tessellation: 10 },
    b.scene,
  );
  post.position.y = 0.75;
  b.add(post, p.wood, 'matt', root);
  const board = CreateBox('schild', { width: 1.2, height: 0.34, depth: 0.08 }, b.scene);
  board.position.set(0.32, 1.25, 0);
  b.add(board, p.wood, 'matt', root);
  const tip = CreateCylinder('spitze', { diameter: 0.48, height: 0.08, tessellation: 3 }, b.scene);
  tip.rotation.x = Math.PI / 2;
  tip.rotation.y = Math.PI / 2;
  tip.position.set(0.98, 1.25, 0);
  b.add(tip, p.wood, 'matt', root);
}

export function buildBoard(scene: Scene, look: Look): BuiltContent {
  const b = new Builder(scene, look);
  const p = look.palette;
  const rnd = seeded(56);

  // Insel: Grasdecke mit runder Kante, darunter Erdschichten.
  const top = CreateCylinder(
    'insel',
    { diameter: 20, height: 0.5, tessellation: b.seg * 2 },
    scene,
  );
  top.position.y = -0.25;
  top.scaling.z = 0.78;
  b.add(top, p.grass, 'matt');
  const edge = CreateTorus(
    'insel-kante',
    { diameter: 20, thickness: 0.5, tessellation: b.seg * 2 },
    scene,
  );
  edge.position.y = -0.25;
  edge.scaling.z = 0.78;
  b.add(edge, p.grassEdge, 'matt');
  const soil = CreateCylinder(
    'erde',
    { diameterTop: 19.6, diameterBottom: 16, height: 1.6, tessellation: b.seg * 2 },
    scene,
  );
  soil.position.y = -1.3;
  soil.scaling.z = 0.78;
  b.add(soil, p.soil, 'matt');
  const soil2 = CreateCylinder(
    'erde-tief',
    { diameterTop: 15.8, diameterBottom: 9, height: 1.8, tessellation: b.seg * 2 },
    scene,
  );
  soil2.position.y = -2.95;
  soil2.scaling.z = 0.78;
  b.add(soil2, p.soilDark, 'matt');

  // Weg: S-Kurve mit Feldern und Trittsteinen.
  const kinds = ['plus', 'minus', 'plus', 'gift', 'plus', 'gold', 'plus', 'minus'] as const;
  const tiles: Vector3[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const x = -6.4 + i * 1.85;
    const z = -1.2 + Math.sin(i * 0.75) * 1.9;
    tiles.push(new Vector3(x, 0, z));
  }
  tiles.forEach((at, i) => {
    tile(b, at, kinds[i] ?? 'plus');
    const next = tiles[i + 1];
    if (next) {
      const mid = Vector3.Lerp(at, next, 0.5);
      const stone = CreateCylinder(
        'trittstein',
        { diameter: 0.42, height: 0.08, tessellation: Math.min(b.seg, 16) },
        scene,
      );
      stone.position = mid;
      stone.position.y = 0.04;
      stone.scaling.z = 0.7;
      stone.rotation.y = Math.atan2(next.x - at.x, next.z - at.z);
      b.add(stone, p.path, 'matt');
    }
  });

  // Teich mit Steinrand und Seerosen.
  const pond = new Vector3(4.6, 0, 3.3);
  const water = CreateDisc('teich', { radius: 1.9, tessellation: b.seg }, scene);
  water.rotation.x = Math.PI / 2;
  water.position = pond.add(new Vector3(0, 0.03, 0));
  water.scaling.y = 0.7;
  b.add(water, p.water, 'wasser', undefined, true);
  const bank = CreateTorus(
    'teich-rand',
    { diameter: 3.9, thickness: 0.3, tessellation: b.seg },
    scene,
  );
  bank.position = pond.add(new Vector3(0, 0.04, 0));
  bank.scaling.z = 0.7;
  b.add(bank, p.path, 'matt');
  for (const [dx, dz] of [
    [-0.6, 0.2],
    [0.5, -0.3],
    [0.2, 0.5],
  ] as const) {
    const pad = CreateCylinder('seerose', { diameter: 0.5, height: 0.03, tessellation: 12 }, scene);
    pad.position = pond.add(new Vector3(dx, 0.06, dz));
    b.add(pad, p.leaves[2], 'glanz', undefined, true);
  }

  // Bäume hinter dem Weg, ein paar davor am Rand.
  const treeSpots: [number, number, number, 'r' | 'p'][] = [
    [-7.5, 4.0, 1.1, 'p'],
    [-5.6, 5.2, 1.3, 'r'],
    [-3.2, 4.4, 1.0, 'p'],
    [-1.0, 5.6, 1.4, 'r'],
    [1.4, 4.6, 1.15, 'p'],
    [7.4, 4.6, 1.2, 'r'],
    [8.2, 1.4, 0.9, 'p'],
    [-8.4, 0.6, 1.0, 'r'],
    [-2.4, 2.4, 0.75, 'r'],
    [6.6, -4.2, 0.8, 'p'],
  ];
  for (const [x, z, s, kind] of treeSpots) {
    if (kind === 'r') roundTree(b, new Vector3(x, 0, z), s, rnd);
    else pineTree(b, new Vector3(x, 0, z), s, rnd);
  }
  rock(b, new Vector3(2.6, 0, 1.2), 0.45, rnd);
  rock(b, new Vector3(3.1, 0, 1.6), 0.28, rnd);
  rock(b, new Vector3(-7.6, 0, -3.2), 0.5, rnd);
  rock(b, new Vector3(7.8, 0, -2.0), 0.36, rnd);
  mushroom(b, new Vector3(-4.6, 0, 1.9), 1);
  mushroom(b, new Vector3(-4.1, 0, 2.4), 0.7);
  mushroom(b, new Vector3(0.6, 0, -3.9), 0.8);
  signpost(b, new Vector3(-6.9, 0, -2.6));

  // Trophäe auf eigenem Podest neben dem Goldfeld.
  const goldTile = tiles[5] ?? new Vector3(3, 0, 0);
  const podium = CreateCylinder(
    'podest',
    { diameterTop: 0.9, diameterBottom: 1.1, height: 0.5, tessellation: b.seg },
    scene,
  );
  podium.position = goldTile.add(new Vector3(0.3, 0.25, 1.6));
  b.add(podium, p.white, 'plastik');
  trophy(b, goldTile.add(new Vector3(0.3, 0.5, 1.6)));

  // Gras-Büschel für Struktur.
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 2 + rnd() * 7;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.7;
    if (tiles.some((t) => Math.hypot(t.x - x, t.z - z) < 1.1)) continue;
    if (Math.hypot(pond.x - x, pond.z - z) < 2.3) continue;
    const tuft = CreateCylinder(
      'gras',
      { diameterTop: 0, diameterBottom: 0.16, height: 0.32, tessellation: 4 },
      scene,
    );
    tuft.position.set(x, 0.16, z);
    tuft.rotation.z = (rnd() - 0.5) * 0.4;
    b.add(tuft, p.grassEdge, 'matt');
  }

  return {
    meshes: b.meshes,
    tiles: tiles.map((t) => t.add(new Vector3(0, 0.26, 0))),
    arenaSpots: [],
  };
}

export function buildArena(scene: Scene, look: Look): BuiltContent {
  const b = new Builder(scene, look);
  const p = look.palette;
  const rnd = seeded(7);

  // Tisch mit Tischdecke.
  const table = CreateCylinder(
    'tisch',
    { diameter: 26, height: 0.4, tessellation: b.seg * 2 },
    scene,
  );
  table.position.y = -0.2;
  b.add(table, p.cloth, 'matt');

  // Teller (Drehkörper mit Rand).
  const plate = CreateLathe(
    'teller',
    {
      shape: [
        new Vector3(0, 0.02, 0),
        new Vector3(4.6, 0.02, 0),
        new Vector3(5.6, 0.32, 0),
        new Vector3(5.8, 0.42, 0),
        new Vector3(5.7, 0.44, 0),
        new Vector3(4.6, 0.16, 0),
        new Vector3(0, 0.16, 0),
      ],
      tessellation: b.seg * 2,
    },
    scene,
  );
  b.add(plate, p.plate, 'glanz');

  // Pudding (Glockenform) mit Karamell-Kappe.
  const pudding = CreateLathe(
    'pudding',
    {
      shape: [
        new Vector3(0, 0.16, 0),
        new Vector3(3.9, 0.16, 0),
        new Vector3(3.95, 0.3, 0),
        new Vector3(3.7, 0.9, 0),
        new Vector3(3.45, 1.45, 0),
        new Vector3(3.3, 1.62, 0),
        new Vector3(0, 1.66, 0),
      ],
      tessellation: b.seg * 2,
    },
    scene,
  );
  b.add(pudding, p.pudding, 'creme');
  const caramel = CreateLathe(
    'karamell',
    {
      shape: [
        new Vector3(0, 1.66, 0),
        new Vector3(3.32, 1.62, 0),
        new Vector3(3.42, 1.5, 0),
        new Vector3(3.38, 1.4, 0),
        new Vector3(3.2, 1.62, 0),
        new Vector3(0, 1.72, 0),
      ],
      tessellation: b.seg * 2,
    },
    scene,
  );
  b.add(caramel, p.caramel, 'glanz');

  // Sahnehaube und Kirsche in der Mitte (das Ziel).
  const cream = CreateLathe(
    'sahne',
    {
      shape: [
        new Vector3(0, 1.7, 0),
        new Vector3(0.8, 1.7, 0),
        new Vector3(0.72, 1.95, 0),
        new Vector3(0.5, 2.1, 0),
        new Vector3(0.36, 2.35, 0),
        new Vector3(0.12, 2.55, 0),
        new Vector3(0, 2.6, 0),
      ],
      tessellation: b.seg,
    },
    scene,
  );
  b.add(cream, p.cream, 'creme');
  const cherry = CreateSphere(
    'kirsche',
    { diameter: 0.62, segments: Math.max(8, b.seg / 2) },
    scene,
  );
  cherry.position.set(0, 2.82, 0);
  b.add(cherry, p.cherry, 'glanz');
  const stem = CreateCylinder(
    'kirsch-stiel',
    { diameter: 0.05, height: 0.7, tessellation: 6 },
    scene,
  );
  stem.position.set(0.12, 3.3, 0);
  stem.rotation.z = -0.35;
  b.add(stem, p.stem, 'matt');

  // Sahnetupfen am Rand.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const dollop = CreateSphere(
      'tupfen',
      { diameter: 0.42, segments: Math.max(6, b.seg / 4) },
      scene,
    );
    dollop.position.set(Math.cos(a) * 4.9, 0.32, Math.sin(a) * 4.9);
    dollop.scaling.y = 0.7;
    b.add(dollop, p.cream, 'creme');
  }

  // Riesenlöffel als Hindernis.
  const spoon = new TransformNode('loeffel', scene);
  spoon.position.set(-1.8, 2.3, -0.6);
  spoon.rotation.y = 0.6;
  spoon.rotation.z = 0.12;
  const handle = CreateCylinder(
    'griff',
    { diameter: 0.24, height: 4.2, tessellation: Math.min(b.seg, 16) },
    scene,
  );
  handle.rotation.z = Math.PI / 2;
  b.add(handle, p.gold, 'metall', spoon);
  const bowl = CreateSphere('kelle', { diameter: 1.1, segments: Math.max(8, b.seg / 2) }, scene);
  bowl.position.x = 2.4;
  bowl.scaling.set(1.2, 0.35, 0.9);
  b.add(bowl, p.gold, 'metall', spoon);

  // Beeren auf dem Tisch.
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 7 + rnd() * 3.5;
    const berry = CreateSphere('beere', { diameter: 0.7, segments: Math.max(8, b.seg / 3) }, scene);
    berry.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r);
    b.add(berry, p.cherry, 'glanz');
  }

  const arenaSpots = [0, 1, 2, 3].map((i) => {
    const a = -Math.PI / 2 + (i - 1.5) * 0.62;
    return new Vector3(Math.cos(a) * 2.2, 1.68, Math.sin(a) * 2.2);
  });
  return { meshes: b.meshes, tiles: [], arenaSpots };
}
