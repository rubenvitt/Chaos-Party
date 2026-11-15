/**
 * Baukasten des Figuren-Generators (CHAOS-27): Materialien, Teile aus Grundkörpern,
 * eigene Geometrie (gerippte Säule) und Gelenk-Knoten. Läuft in Node mit NullEngine.
 *
 * Koordinaten wie im Figuren-Vertrag: Füße bei y = 0, Blick +Z, Einheiten = Meter.
 * Jede Figur besteht aus wenigen **starren Teilen** (je ein Mesh mit Untermeshes je Material),
 * die an Gelenk-Knoten (`TransformNode`) hängen; Animationen bewegen nur Gelenke.
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import type { Scene } from '@babylonjs/core/scene.js';

export { ACCENT_MATERIAL, BADGE_NODE } from '../contract.ts';
/** Standardfarbe des Akzents in der Datei (neutral, wird immer überschrieben). */
export const ACCENT_DEFAULT = '#ff4fa3';

/** Gemeinsame Farben aller Figuren (Brett-Optik M2: Tinte, Weiß). */
export const INK = '#1b1530';
export const EYE_WHITE = '#ffffff';

export type Vec3 = readonly [number, number, number];

export interface Kit {
  readonly scene: Scene;
  /** Material je Name (einmal je Figur angelegt). Farbe als sRGB-Hex. */
  material(name: string, hex: string, roughness?: number): PBRMaterial;
  /** Gelenk-Knoten an `position` (lokal zum Eltern-Knoten). */
  joint(
    name: string,
    parent: TransformNode | null,
    position?: Vec3,
    rotation?: Vec3,
  ): TransformNode;
  /** Starres Teil: Stücke je Material zusammenfassen, als ein Mesh an `parent` hängen. */
  part(name: string, parent: TransformNode, pieces: readonly Piece[]): Mesh;
}

/** Ein Stück eines Teils: Mesh in lokalen Koordinaten des Teils plus Material. */
export interface Piece {
  readonly mesh: Mesh;
  readonly material: PBRMaterial;
}

/** glTF speichert Farben linear; der Host rechnet beim Laden zurück in sRGB. */
function linear(hex: string): Color3 {
  return Color3.FromHexString(hex).toLinearSpace();
}

export function createKit(scene: Scene): Kit {
  const materials = new Map<string, PBRMaterial>();
  return {
    scene,
    material(name, hex, roughness = 0.85) {
      const existing = materials.get(name);
      if (existing) return existing;
      const mat = new PBRMaterial(name, scene);
      mat.albedoColor = linear(hex);
      mat.metallic = 0;
      mat.roughness = roughness;
      materials.set(name, mat);
      return mat;
    },
    joint(name, parent, position = [0, 0, 0], rotation = [0, 0, 0]) {
      const node = new TransformNode(name, scene);
      node.parent = parent;
      node.position.set(...position);
      node.rotation.set(...rotation);
      return node;
    },
    part(name, parent, pieces) {
      const byMaterial = new Map<PBRMaterial, Mesh[]>();
      for (const piece of pieces) {
        // Ohne Texturen keine UVs (kleinere Dateien, gleiche Attribute zum Zusammenfassen).
        piece.mesh.removeVerticesData('uv');
        const list = byMaterial.get(piece.material) ?? [];
        list.push(piece.mesh);
        byMaterial.set(piece.material, list);
      }
      const groups: Mesh[] = [];
      for (const [mat, list] of byMaterial) {
        const merged = list.length === 1 ? list[0] : Mesh.MergeMeshes(list, true, false);
        if (!merged) throw new Error(`Teil ${name}: Zusammenfassen fehlgeschlagen`);
        merged.material = mat;
        groups.push(merged);
      }
      let mesh: Mesh;
      if (groups.length === 1 && groups[0]) {
        mesh = groups[0];
        mesh.bakeCurrentTransformIntoVertices();
      } else {
        const merged = Mesh.MergeMeshes(groups, true, false, undefined, false, true);
        if (!merged) throw new Error(`Teil ${name}: Zusammenfassen fehlgeschlagen`);
        mesh = merged;
      }
      mesh.name = name;
      mesh.parent = parent;
      return mesh;
    },
  };
}

// ---------------------------------------------------------------------------
// Grundkörper (lokal positioniert, noch ohne Eltern)
// ---------------------------------------------------------------------------

interface Placement {
  readonly at?: Vec3;
  readonly rot?: Vec3;
  readonly scale?: Vec3;
  /** Drehung, die vor `rot` fest eingerechnet wird (z. B. Dreieck in seiner Ebene drehen). */
  readonly pre?: Vec3;
}

function place(mesh: Mesh, p: Placement): Mesh {
  if (p.pre) {
    mesh.rotation.set(...p.pre);
    mesh.bakeCurrentTransformIntoVertices();
  }
  if (p.at) mesh.position.set(...p.at);
  if (p.rot) mesh.rotation.set(...p.rot);
  if (p.scale) mesh.scaling.set(...p.scale);
  return mesh;
}

export function sphere(
  scene: Scene,
  material: PBRMaterial,
  diameter: number,
  p: Placement = {},
  segments = 10,
): Piece {
  return { mesh: place(CreateSphere('s', { diameter, segments }, scene), p), material };
}

export function box(scene: Scene, material: PBRMaterial, size: Vec3, p: Placement = {}): Piece {
  const [width, height, depth] = size;
  return { mesh: place(CreateBox('b', { width, height, depth }, scene), p), material };
}

export function cylinder(
  scene: Scene,
  material: PBRMaterial,
  options: {
    readonly diameter?: number;
    readonly diameterTop?: number;
    readonly diameterBottom?: number;
    readonly height: number;
    readonly tessellation?: number;
  },
  p: Placement = {},
): Piece {
  return {
    mesh: place(CreateCylinder('c', { tessellation: 14, ...options }, scene), p),
    material,
  };
}

export function torus(
  scene: Scene,
  material: PBRMaterial,
  diameter: number,
  thickness: number,
  p: Placement = {},
  tessellation = 16,
): Piece {
  return {
    mesh: place(CreateTorus('t', { diameter, thickness, tessellation }, scene), p),
    material,
  };
}

/** Röhre entlang eines Pfads (z. B. Arme, Mund), Radius optional je Punkt. */
export function tube(
  scene: Scene,
  material: PBRMaterial,
  path: readonly Vec3[],
  radius: number | ((t: number) => number),
  p: Placement = {},
  tessellation = 12,
): Piece {
  const points = path.map((v) => new Vector3(...v));
  const last = Math.max(1, points.length - 1);
  const mesh = CreateTube(
    'r',
    {
      path: points,
      tessellation,
      ...(typeof radius === 'number'
        ? { radius }
        : { radiusFunction: (i: number) => radius(i / last) }),
      cap: Mesh.CAP_ALL,
    },
    scene,
  );
  return { mesh: place(mesh, p), material };
}

/** Glatter Pfad durch Stützpunkte (Catmull-Rom), für runde Röhren. */
export function smoothPath(points: readonly Vec3[], perSegment = 6): Vec3[] {
  const out: Vec3[] = [];
  const get = (i: number): Vec3 => points[Math.min(points.length - 1, Math.max(0, i))] ?? [0, 0, 0];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, cc: number, d: number): number =>
        0.5 *
        (2 * b +
          (-a + cc) * t +
          (2 * a - 5 * b + 4 * cc - d) * t2 +
          (-a + 3 * b - 3 * cc + d) * t3);
      out.push([
        c(p0[0], p1[0], p2[0], p3[0]),
        c(p0[1], p1[1], p2[1], p3[1]),
        c(p0[2], p1[2], p2[2], p3[2]),
      ]);
    }
  }
  const end = points[points.length - 1];
  if (end) out.push(end);
  return out;
}

/**
 * Eigene Geometrie: Rotationskörper mit Rippen (Kaktus). `profile` liefert je Höhe den
 * Radius; `ribs` Rippen mit relativer Tiefe `ribDepth`. Oben und unten geschlossen.
 */
export function ribbedColumn(
  scene: Scene,
  material: PBRMaterial,
  options: {
    readonly profile: readonly (readonly [y: number, radius: number])[];
    readonly ribs: number;
    readonly ribDepth: number;
    readonly segments?: number;
  },
  p: Placement = {},
): Piece {
  const segments = options.segments ?? options.ribs * 4;
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = options.profile;
  for (const [y, r] of rings) {
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      // Rippe: weich gerundet (|cos| hoch 0,6), Täler schmal.
      const rib = Math.pow(Math.abs(Math.cos((a * options.ribs) / 2)), 0.6);
      const rr = r * (1 - options.ribDepth + options.ribDepth * rib);
      positions.push(Math.sin(a) * rr, y, Math.cos(a) * rr);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = i * row + s;
      const b = a + row;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  // Deckel unten und oben (Fächer um den Mittelpunkt).
  const first = rings[0];
  const lastRing = rings[rings.length - 1];
  if (first && lastRing) {
    const bottom = positions.length / 3;
    positions.push(0, first[0], 0);
    for (let s = 0; s < segments; s++) indices.push(bottom, s + 1, s);
    const top = positions.length / 3;
    positions.push(0, lastRing[0], 0);
    const base = (rings.length - 1) * row;
    for (let s = 0; s < segments; s++) indices.push(top, base + s, base + s + 1);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  const mesh = new Mesh('saeule', scene);
  data.applyToMesh(mesh);
  return { mesh: place(mesh, p), material };
}

/** Großes Cartoon-Auge: Weiß, Pupille, Glanzpunkt; blickt nach +Z. */
export function eye(
  scene: Scene,
  white: PBRMaterial,
  ink: PBRMaterial,
  at: Vec3,
  diameter: number,
  look: Vec3 = [0, 0, 1],
): Piece[] {
  const [x, y, z] = at;
  const r = diameter / 2;
  const pupil = diameter * 0.52;
  const px = x + look[0] * r * 0.25;
  const py = y + look[1] * r * 0.25;
  return [
    sphere(scene, white, diameter, { at, scale: [1, 1.08, 0.8] }, 9),
    sphere(scene, ink, pupil, { at: [px, py, z + r * 0.62], scale: [1, 1.1, 0.6] }, 7),
    sphere(
      scene,
      white,
      pupil * 0.36,
      { at: [px + pupil * 0.18, py + pupil * 0.22, z + r * 0.8] },
      4,
    ),
  ];
}

/** Dreieckiger Tuch-Zipfel, Spitze nach unten, Vorderseite +Z, um `tilt` nach vorn geneigt. */
export function pennant(
  scene: Scene,
  material: PBRMaterial,
  size: number,
  at: Vec3,
  tilt: number,
): Piece {
  return cylinder(
    scene,
    material,
    { diameter: size, height: 0.05, tessellation: 3 },
    { pre: [0, -Math.PI / 2, 0], rot: [Math.PI / 2 - tilt, 0, 0], at, scale: [1.1, 1, 1] },
  );
}
