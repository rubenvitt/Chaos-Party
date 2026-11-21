/**
 * Bausteine des Natur-Looks (CHAOS-62, aus der Look-Dev-Vitrine CHAOS-57 übernommen): Insel
 * mit Erdkante, Gras als Thin Instances, Laub- und Nadelbäume, Moosfelsen, Pilze, Blumen,
 * Laternen, Pokal und Glühwürmchen. Alles deterministisch aus einem Zufallsgenerator.
 *
 * Statische Teile laufen über `StaticBatch`: Am Ende verschmilzt je Material ein Mesh (wenige
 * Zeichenaufrufe, auch für die Schattenkarte).
 */
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js';
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder.js';
import { CreateRibbon } from '@babylonjs/core/Meshes/Builders/ribbonBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { NatureMaterials } from './materials.ts';
import { fbm } from './noise.ts';
import type { Terrain } from './terrain.ts';

// ---------------------------------------------------------------------------------------------
// Statische Teile sammeln und verschmelzen
// ---------------------------------------------------------------------------------------------

export class StaticBatch {
  private readonly parts = new Map<Material, Mesh[]>();
  constructor(private readonly name: string) {}

  add(mesh: Mesh, material: Material): Mesh {
    mesh.material = material;
    const list = this.parts.get(material) ?? [];
    list.push(mesh);
    this.parts.set(material, list);
    return mesh;
  }

  /** Verschmilzt je Material; liefert die neuen Meshes (Schatten werfen und empfangen). */
  flush(parent?: TransformNode): Mesh[] {
    const merged: Mesh[] = [];
    for (const [material, list] of this.parts) {
      for (const mesh of list) mesh.computeWorldMatrix(true);
      const mesh = list.length === 1 ? list[0] : Mesh.MergeMeshes(list, true, true);
      if (!mesh) continue;
      if (list.length > 1) mesh.name = `${this.name}-${material.name}`;
      if (list.length === 1 && mesh.parent) {
        // Einzelstück: in Weltkoordinaten übernehmen, damit `parent` gilt.
        mesh.bakeCurrentTransformIntoVertices();
        mesh.parent = null;
      }
      mesh.material = material;
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      if (parent) mesh.parent = parent;
      else mesh.freezeWorldMatrix();
      merged.push(mesh);
    }
    this.parts.clear();
    return merged;
  }
}

/** Verschiebt die Eckpunkte entlang der Normalen (organische Formen). */
export function displace(mesh: Mesh, amount: number, frequency: number, seed: number): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!positions || !normals) return;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    const n = (fbm(x * frequency + seed, y * frequency, z * frequency) - 0.5) * 2 * amount;
    positions[i] = x + (normals[i] ?? 0) * n;
    positions[i + 1] = y + (normals[i + 1] ?? 0) * n;
    positions[i + 2] = z + (normals[i + 2] ?? 0) * n;
  }
  mesh.setVerticesData(VertexBuffer.PositionKind, positions);
  const indices = mesh.getIndices();
  const fresh: number[] = [];
  if (indices) VertexData.ComputeNormals(positions, indices, fresh);
  mesh.setVerticesData(VertexBuffer.NormalKind, fresh);
}

// ---------------------------------------------------------------------------------------------
// Insel
// ---------------------------------------------------------------------------------------------

/** Wiese (Höhenfeld im Inselumriss) und Erdkante bis unter die Insel. */
export function buildIsland(
  scene: Scene,
  mats: NatureMaterials,
  terrain: Terrain,
  options: {
    readonly subdivisions?: number;
    readonly grassTiling?: number;
    /** Boden statt Wiese (CHAOS-198: Schnee am Frostgipfel). */
    readonly ground?: Material;
    /** Tönung der Erdkante (Standard warmes Braun). */
    readonly cliffTint?: string;
  } = {},
): Mesh[] {
  const { shape } = terrain;
  const extent = Math.max(shape.halfX, shape.halfZ) * 2.3;
  const ground = CreateGround(
    'wiese',
    { width: extent, height: extent, subdivisions: options.subdivisions ?? 160 },
    scene,
  );
  const positions = ground.getVerticesData(VertexBuffer.PositionKind) ?? [];
  for (let i = 0; i < positions.length; i += 3) {
    let x = (positions[i] ?? 0) + shape.centerX;
    let z = (positions[i + 2] ?? 0) + shape.centerZ;
    const a = Math.atan2(z - shape.centerZ, x - shape.centerX);
    const r = Math.hypot(x - shape.centerX, z - shape.centerZ);
    const max = terrain.rim(a);
    if (r > max) {
      // Auf den Rand ziehen (entartete Dreiecke außerhalb sind unsichtbar).
      x = shape.centerX + Math.cos(a) * max;
      z = shape.centerZ + Math.sin(a) * max;
    }
    positions[i] = x;
    positions[i + 1] = terrain.height(x, z);
    positions[i + 2] = z;
  }
  ground.setVerticesData(VertexBuffer.PositionKind, positions);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, ground.getIndices() ?? [], normals);
  ground.setVerticesData(VertexBuffer.NormalKind, normals);
  const tiling = options.grassTiling ?? extent / 3.4;
  ground.material = options.ground ?? mats.textured('leafy_grass', { u: tiling, tint: '#b8d48a' });
  ground.receiveShadows = true;
  ground.isPickable = false;

  // Abhang: Ringe vom Grasrand nach unten, nach innen eingezogen.
  const depths: [number, number][] = [
    [0, 1],
    [-0.5, 0.985],
    [-1.3, 0.95],
    [-2.3, 0.88],
    [-3.2, 0.74],
    [-3.9, 0.5],
    [-4.2, 0.1],
  ];
  const steps = 200;
  const paths = depths.map(([y, s], k) => {
    const path: Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const wobble = k === 0 ? 0 : (fbm(Math.cos(a) * 2 + k, k * 0.7, Math.sin(a) * 2) - 0.5) * 0.9;
      const r = terrain.rim(a) * s + wobble;
      const x = shape.centerX + Math.cos(a) * r;
      const z = shape.centerZ + Math.sin(a) * r;
      path.push(new Vector3(x, k === 0 ? terrain.height(x, z) - 0.02 : terrain.baseY + y, z));
    }
    return path;
  });
  const cliff = CreateRibbon('abhang', { pathArray: paths, closePath: false }, scene);
  const circumference = 2 * Math.PI * Math.max(shape.halfX, shape.halfZ);
  cliff.material = mats.textured('brown_mud_rocks_01', {
    u: Math.round(circumference / 4),
    v: 2,
    tint: options.cliffTint ?? '#d9c2a8',
  });
  cliff.receiveShadows = true;
  cliff.isPickable = false;
  ground.freezeWorldMatrix();
  cliff.freezeWorldMatrix();
  return [ground, cliff];
}

// ---------------------------------------------------------------------------------------------
// Gras
// ---------------------------------------------------------------------------------------------

function grassBlade(scene: Scene, tipHex: string, name: string): Mesh {
  const segments = 4;
  const height = 0.27;
  const width = 0.042;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const base = Color3.FromHexString('#355d22').toLinearSpace();
  const tip = Color3.FromHexString(tipHex).toLinearSpace();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = width * (1 - t * 0.92);
    const bend = t * t * 0.09;
    positions.push(-w / 2, t * height, bend, w / 2, t * height, bend);
    const c = Color3.Lerp(base, tip, Math.pow(t, 0.8));
    colors.push(c.r, c.g, c.b, 1, c.r, c.g, c.b, 1);
    if (i < segments) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  // Normalen leicht nach oben kippen: Halme wirken im Licht weicher.
  for (let i = 0; i < normals.length; i += 3) normals[i + 1] = (normals[i + 1] ?? 0) + 0.6;
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.colors = colors;
  const blade = new Mesh(name, scene);
  data.applyToMesh(blade);
  const mat = new PBRMaterial(`${name}-mat`, scene);
  mat.albedoColor = Color3.White();
  mat.roughness = 0.75;
  mat.metallic = 0;
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  mat.subSurface.isTranslucencyEnabled = true;
  mat.subSurface.translucencyIntensity = 0.5;
  blade.material = mat;
  blade.receiveShadows = true;
  blade.isPickable = false;
  return blade;
}

export interface Grass {
  readonly meshes: readonly Mesh[];
  /** Halme insgesamt (bei Anteil 1). */
  readonly total: number;
  /** Sichtbarer Anteil 0…1 (Grafikstufe); ohne Neubau, nur weniger Instanzen zeichnen. */
  setDensity(fraction: number): void;
}

export interface GrassOptions {
  readonly count: number;
  /** Stellen ohne Gras (Felder, Wege, Teich …). */
  readonly avoid: (x: number, z: number) => boolean;
  readonly tipHex: string;
  readonly rnd: () => number;
  /** Größe der Halme (Brett aus der Ferne: etwas größer). */
  readonly scale?: number;
}

/**
 * Gras als Thin Instances in drei Farbsorten (Instanzfarben würden den Verlauf ersetzen). Die
 * Reihenfolge der Instanzen ist zufällig, deshalb verteilt jeder Anteil gleichmäßig.
 */
export function scatterGrass(scene: Scene, terrain: Terrain, options: GrassOptions): Grass {
  const { rnd, tipHex } = options;
  const shape = terrain.shape;
  const tip = Color3.FromHexString(tipHex);
  const tips = [
    tipHex,
    Color3.Lerp(tip, Color3.FromHexString('#4f7d2c'), 0.45).toHexString(),
    Color3.Lerp(tip, Color3.FromHexString('#d8c46a'), 0.4).toHexString(),
  ];
  const blades = tips.map((hex, i) => grassBlade(scene, hex, `gras-${String(i)}`));
  const matrices: number[][] = tips.map(() => []);
  const scale = options.scale ?? 1;
  const m = new Matrix();
  const q = new Quaternion();
  const s3 = new Vector3();
  const p3 = new Vector3();
  let placed = 0;
  let tries = 0;
  while (placed < options.count && tries < options.count * 5) {
    tries++;
    const x = shape.centerX + (rnd() * 2 - 1) * shape.halfX * 1.1;
    const z = shape.centerZ + (rnd() * 2 - 1) * shape.halfZ * 1.1;
    if (!terrain.inside(x, z, 0.35) || options.avoid(x, z)) continue;
    // Büschel: dichter, wo das Rauschen hoch ist.
    if (fbm(x * 0.35, 7, z * 0.35) < 0.33 && rnd() < 0.55) continue;
    const s = (0.65 + rnd() * 0.75) * scale;
    Quaternion.RotationYawPitchRollToRef(
      rnd() * Math.PI * 2,
      (rnd() - 0.5) * 0.35,
      (rnd() - 0.5) * 0.35,
      q,
    );
    s3.set(s, s * (0.8 + rnd() * 0.6), s);
    p3.set(x, terrain.height(x, z) - 0.02, z);
    Matrix.ComposeToRef(s3, q, p3, m);
    // Sorte nach großflächigem Rauschen: Flecken statt Salz und Pfeffer.
    const patch = fbm(x * 0.22, 11, z * 0.22) + (rnd() - 0.5) * 0.25;
    const sort = patch < 0.42 ? 1 : patch > 0.58 ? 2 : 0;
    const target = matrices[sort] ?? matrices[0];
    for (let i = 0; i < 16; i++) target?.push(m.m[i] ?? 0);
    placed++;
  }
  const counts = matrices.map((list) => list.length / 16);
  blades.forEach((blade, i) => {
    blade.thinInstanceSetBuffer('matrix', new Float32Array(matrices[i] ?? []), 16, true);
    blade.freezeWorldMatrix();
    // Halme werfen keine Schatten (zu teuer), empfangen sie aber.
    blade.alwaysSelectAsActiveMesh = true;
  });
  return {
    meshes: blades,
    total: placed,
    setDensity(fraction) {
      const f = Math.min(1, Math.max(0, fraction));
      blades.forEach((blade, i) => {
        const n = Math.round((counts[i] ?? 0) * f);
        blade.thinInstanceCount = n;
        blade.setEnabled(n > 0);
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Bäume, Felsen, Pilze, Blumen
// ---------------------------------------------------------------------------------------------

const LEAF_TONES = ['#5f8f3c', '#6e9c42', '#557f36', '#7aa64a'] as const;

/** Laubbaum: Rindenstamm mit zwei Ästen, weiche Krone aus Blättermassen. Zwei Meshes. */
export function tree(
  scene: Scene,
  mats: NatureMaterials,
  at: Vector3,
  scale: number,
  rnd: () => number,
  name = 'baum',
): TransformNode {
  const root = new TransformNode(name, scene);
  root.position = at.clone();
  root.scaling.setAll(scale);
  root.rotation.y = rnd() * Math.PI * 2;
  const batch = new StaticBatch(name);
  const bark = mats.textured('bark_brown_02', { u: 2, v: 3, tint: '#c8b8a8' });
  const trunk = CreateCylinder(
    'stamm',
    { diameterTop: 0.26, diameterBottom: 0.5, height: 2.4, tessellation: 12, subdivisions: 5 },
    scene,
  );
  trunk.position.y = 1.15;
  displace(trunk, 0.05, 1.4, rnd() * 10);
  batch.add(trunk, bark);
  for (const [ry, rz, h, y] of [
    [0.4, 0.7, 1.0, 1.6],
    [2.6, -0.65, 0.9, 1.9],
  ] as const) {
    const branch = CreateCylinder(
      'ast',
      { diameterTop: 0.08, diameterBottom: 0.16, height: h, tessellation: 8 },
      scene,
    );
    branch.position.set(Math.cos(ry) * 0.25, y, Math.sin(ry) * 0.25);
    branch.rotation.set(0, ry, rz);
    batch.add(branch, bark);
  }
  const tone = LEAF_TONES[Math.floor(rnd() * LEAF_TONES.length)] ?? LEAF_TONES[0];
  const leaves = mats.plain(tone, {
    roughness: 0.85,
    translucency: 0.55,
    bumpFrom: 'leafy_grass',
    bumpScale: 3,
  });
  const blobs = 6 + Math.floor(rnd() * 3);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rnd() * 0.6;
    const ring = i === 0 ? 0 : 0.75 + rnd() * 0.35;
    const r = i === 0 ? 1.15 : 0.7 + rnd() * 0.35;
    const blob = CreateIcoSphere('krone', { radius: r, subdivisions: 8, flat: false }, scene);
    displace(blob, 0.13, 0.85, rnd() * 50);
    blob.position.set(
      Math.cos(a) * ring,
      2.7 + (i === 0 ? 0.35 : rnd() * 0.6 - 0.1),
      Math.sin(a) * ring,
    );
    blob.scaling.y = 0.85;
    batch.add(blob, leaves);
  }
  batch.flush(root);
  return root;
}

/** Tanne aus gestapelten, unruhigen Kegeln. Zwei Meshes. */
export function pine(
  scene: Scene,
  mats: NatureMaterials,
  at: Vector3,
  scale: number,
  rnd: () => number,
  name = 'tanne',
): TransformNode {
  const root = new TransformNode(name, scene);
  root.position = at.clone();
  root.scaling.setAll(scale);
  root.rotation.y = rnd() * Math.PI * 2;
  const batch = new StaticBatch(name);
  const trunk = CreateCylinder(
    'stamm',
    { diameterTop: 0.12, diameterBottom: 0.3, height: 1.2, tessellation: 10 },
    scene,
  );
  trunk.position.y = 0.6;
  batch.add(trunk, mats.textured('bark_brown_02', { u: 1, v: 2, tint: '#a89484' }));
  const needles = mats.plain('#3f6a3a', {
    roughness: 0.9,
    translucency: 0.3,
    bumpFrom: 'leafy_grass',
    bumpScale: 4,
  });
  const layers: [number, number, number][] = [
    [0.7, 1.9, 1.3],
    [1.4, 1.55, 1.15],
    [2.05, 1.15, 1.0],
    [2.6, 0.75, 0.85],
  ];
  for (const [y, d, h] of layers) {
    const cone = CreateCylinder(
      'nadeln',
      { diameterTop: 0, diameterBottom: d, height: h, tessellation: 20, subdivisions: 4 },
      scene,
    );
    displace(cone, 0.08, 3, rnd() * 20);
    cone.position.y = y + h / 2;
    batch.add(cone, needles);
  }
  batch.flush(root);
  return root;
}

/** Moosfels (organisch verformt), flach liegend. Für `StaticBatch`. */
export function rock(
  scene: Scene,
  mats: NatureMaterials,
  at: Vector3,
  size: number,
  rnd: () => number,
  batch: StaticBatch,
  flatten = 1,
): Mesh {
  const r = CreateIcoSphere('stein', { radius: size, subdivisions: 6, flat: false }, scene);
  displace(r, size * 0.28, 1.2 / size, rnd() * 100);
  r.position = at.clone();
  r.position.y += size * 0.2 * flatten;
  r.scaling.set(1 + rnd() * 0.3, (0.55 + rnd() * 0.2) * flatten, 1 + rnd() * 0.2);
  r.rotation.y = rnd() * 3;
  return batch.add(r, mats.textured('mossy_rock', { u: 1, tint: '#d8d6cc' }));
}

/** Fliegenpilz-Gruppe (Pilzpfad). Für `StaticBatch`. */
export function mushroom(
  scene: Scene,
  mats: NatureMaterials,
  at: Vector3,
  size: number,
  rnd: () => number,
  batch: StaticBatch,
): void {
  const stemMat = mats.plain('#efe6d2', { roughness: 0.7 });
  const capMat = mats.plain('#c43a2e', { roughness: 0.35, clearCoat: 0.5 });
  const dotMat = mats.plain('#f6efe2', { roughness: 0.6 });
  const stem = CreateCylinder(
    'pilz-stiel',
    { diameterTop: 0.22 * size, diameterBottom: 0.3 * size, height: 0.55 * size, tessellation: 12 },
    scene,
  );
  stem.position = at.add(new Vector3(0, 0.27 * size, 0));
  batch.add(stem, stemMat);
  const cap = CreateSphere('pilz-hut', { diameter: 0.85 * size, segments: 16, slice: 0.5 }, scene);
  cap.position = at.add(new Vector3(0, 0.5 * size, 0));
  cap.scaling.y = 0.75;
  cap.rotation.z = (rnd() - 0.5) * 0.2;
  batch.add(cap, capMat);
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.18 * size + rnd() * 0.14 * size;
    const dot = CreateSphere('pilz-punkt', { diameter: 0.09 * size, segments: 6 }, scene);
    const h = Math.sqrt(Math.max(0, (0.425 * size) ** 2 - r * r)) * 0.75;
    dot.position = at.add(new Vector3(Math.cos(a) * r, 0.5 * size + h, Math.sin(a) * r));
    dot.scaling.y = 0.5;
    batch.add(dot, dotMat);
  }
}

/** Blumen als Thin Instances: Stiel + Blütenkopf in wenigen Farben. */
export function flowers(
  scene: Scene,
  mats: NatureMaterials,
  spots: readonly Vector3[],
  rnd: () => number,
): Mesh[] {
  const colors = ['#f2d24b', '#f4f1ea', '#d96fa0', '#8f7fe0'] as const;
  const stem = CreateCylinder(
    'blume-stiel',
    { diameterTop: 0.015, diameterBottom: 0.025, height: 0.32, tessellation: 5 },
    scene,
  );
  stem.material = mats.plain('#4f7d2c', { roughness: 0.8 });
  stem.isPickable = false;
  const heads = colors.map((hex, i) => {
    const head = CreateSphere(`blume-${String(i)}`, { diameter: 0.11, segments: 6 }, scene);
    head.scaling.y = 0.45;
    head.bakeCurrentTransformIntoVertices();
    head.material = mats.plain(hex, { roughness: 0.55, translucency: 0.4 });
    head.isPickable = false;
    return head;
  });
  const stems: number[] = [];
  const headMatrices: number[][] = colors.map(() => []);
  const m = new Matrix();
  for (const at of spots) {
    const tilt = Quaternion.RotationYawPitchRoll(
      rnd() * 6,
      (rnd() - 0.5) * 0.3,
      (rnd() - 0.5) * 0.3,
    );
    const s = 0.8 + rnd() * 0.5;
    Matrix.ComposeToRef(new Vector3(s, s, s), tilt, at.add(new Vector3(0, 0.16 * s, 0)), m);
    for (let i = 0; i < 16; i++) stems.push(m.m[i] ?? 0);
    const top = at.add(new Vector3(0, 0.33 * s, 0));
    Matrix.ComposeToRef(new Vector3(s, s, s), tilt, top, m);
    const list = headMatrices[Math.floor(rnd() * colors.length)] ?? headMatrices[0];
    for (let i = 0; i < 16; i++) list?.push(m.m[i] ?? 0);
  }
  stem.thinInstanceSetBuffer('matrix', new Float32Array(stems), 16, true);
  heads.forEach((head, i) => {
    head.thinInstanceSetBuffer('matrix', new Float32Array(headMatrices[i] ?? []), 16, true);
  });
  return [stem, ...heads];
}

// ---------------------------------------------------------------------------------------------
// Requisiten
// ---------------------------------------------------------------------------------------------

/**
 * Laterne aus Pfosten, Arm und Glaskörper. Liefert das Glas (leuchtet nachts) und seine
 * Weltposition (Lichtquelle).
 */
export function lantern(
  scene: Scene,
  mats: NatureMaterials,
  at: Vector3,
  yaw: number,
  batch: StaticBatch,
): { glass: Mesh; light: Vector3 } {
  const wood = mats.textured('bark_brown_02', { u: 0.5, v: 1, tint: '#9c8572' });
  const iron = mats.plain('#2b2a28', { metallic: 0.8, roughness: 0.45 });
  const rot = Matrix.RotationY(yaw);
  const place = (mesh: Mesh, local: Vector3): Mesh => {
    mesh.position = at.add(Vector3.TransformCoordinates(local, rot));
    mesh.rotation.y = yaw;
    return mesh;
  };
  batch.add(
    place(
      CreateCylinder('laterne-pfahl', { diameter: 0.1, height: 1.5, tessellation: 8 }, scene),
      new Vector3(0, 0.75, 0),
    ),
    wood,
  );
  batch.add(
    place(
      CreateBox('laterne-arm', { width: 0.42, height: 0.05, depth: 0.05 }, scene),
      new Vector3(0.18, 1.45, 0),
    ),
    iron,
  );
  batch.add(
    place(
      CreateCylinder(
        'laterne-dach',
        { diameterTop: 0.04, diameterBottom: 0.26, height: 0.12, tessellation: 6 },
        scene,
      ),
      new Vector3(0.36, 1.36, 0),
    ),
    iron,
  );
  const glass = place(
    CreateCylinder(
      'laterne-glas',
      { diameterTop: 0.2, diameterBottom: 0.15, height: 0.24, tessellation: 6 },
      scene,
    ),
    new Vector3(0.36, 1.18, 0),
  );
  glass.material = mats.plain('#fff1d6', { roughness: 0.2, alpha: 0.9 });
  glass.isPickable = false;
  return { glass, light: glass.position.clone() };
}

/** Goldener Pokal (Drehkörper mit Henkeln), Fuß bei y = 0 des Knotens. */
export function trophyCup(scene: Scene, mats: NatureMaterials, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const gold = mats.plain('#e9b949', { metallic: 1, roughness: 0.22 });
  const cup = CreateLathe(
    `${name}-schale`,
    {
      shape: [
        new Vector3(0, 0, 0),
        new Vector3(0.28, 0, 0),
        new Vector3(0.28, 0.07, 0),
        new Vector3(0.09, 0.13, 0),
        new Vector3(0.06, 0.38, 0),
        new Vector3(0.16, 0.46, 0),
        new Vector3(0.33, 0.66, 0),
        new Vector3(0.37, 0.92, 0),
        new Vector3(0.33, 0.93, 0),
        new Vector3(0.29, 0.7, 0),
        new Vector3(0, 0.58, 0),
      ],
      tessellation: 32,
    },
    scene,
  );
  cup.material = gold;
  cup.parent = root;
  for (const side of [-1, 1]) {
    const handle = CreateTorus(
      `${name}-henkel`,
      { diameter: 0.28, thickness: 0.05, tessellation: 16 },
      scene,
    );
    handle.position.set(side * 0.37, 0.68, 0);
    handle.rotation.x = Math.PI / 2;
    handle.material = gold;
    handle.parent = root;
  }
  return root;
}

/** Glühwürmchen: kleine leuchtende Punkte, die langsam über dem Gras schweben. */
export function fireflies(
  scene: Scene,
  terrain: Terrain,
  count: number,
  rnd: () => number,
): { mesh: Mesh; update(seconds: number): void; setFade(fraction: number): void } {
  const dot = CreateSphere('gluehwuermchen', { diameter: 0.06, segments: 4 }, scene);
  const mat = new PBRMaterial('gluehwuermchen', scene);
  mat.unlit = true;
  mat.albedoColor = Color3.Black();
  mat.emissiveColor = Color3.FromHexString('#d9ff7a');
  mat.emissiveIntensity = 3;
  dot.material = mat;
  dot.isPickable = false;
  const shape = terrain.shape;
  const base: { x: number; y: number; z: number; phase: number; speed: number }[] = [];
  let tries = 0;
  while (base.length < count && tries < count * 20) {
    tries++;
    const x = shape.centerX + (rnd() * 2 - 1) * shape.halfX * 0.9;
    const z = shape.centerZ + (rnd() * 2 - 1) * shape.halfZ * 0.9;
    if (!terrain.inside(x, z, 0.8)) continue;
    base.push({
      x,
      z,
      y: terrain.height(x, z) + 0.35 + rnd() * 1.3,
      phase: rnd() * Math.PI * 2,
      speed: 0.4 + rnd() * 0.6,
    });
  }
  const matrices = new Float32Array(base.length * 16);
  const scaleV = new Vector3();
  const posV = new Vector3();
  const identity = Quaternion.Identity();
  const m = new Matrix();
  /** Einblenden über die Größe (0 = unsichtbar), ohne Material- oder Sichtbarkeitswechsel. */
  let fade = 1;
  let lastTime = 0;
  const update = (time: number): void => {
    lastTime = time;
    base.forEach((b, i) => {
      const t = time * b.speed + b.phase;
      const pulse = (0.55 + 0.45 * Math.sin(t * 2.3)) * fade;
      scaleV.set(pulse, pulse, pulse);
      posV.set(
        b.x + Math.sin(t) * 0.35,
        b.y + Math.sin(t * 1.7) * 0.15,
        b.z + Math.cos(t * 0.8) * 0.35,
      );
      Matrix.ComposeToRef(scaleV, identity, posV, m);
      m.copyToArray(matrices, i * 16);
    });
    dot.thinInstanceSetBuffer('matrix', matrices, 16, false);
  };
  update(0);
  return {
    mesh: dot,
    update,
    setFade(fraction) {
      const next = Math.min(1, Math.max(0, fraction));
      if (next === fade) return;
      fade = next;
      update(lastTime);
    },
  };
}
