/**
 * Look-Dev Runde 2 „Stilisierte Natur“ (CHAOS-57): eine lebendige kleine Welt mit echten
 * Materialien (CC0-Texturen und HDRI von Poly Haven, siehe `polyhaven.json`), eigenen,
 * stilisierten Formen und tausenden Grashalmen. Lichtstimmungen kommen als Daten aus
 * `../lighting/moods.ts` (CHAOS-60), nachts mit Laternen, Glühwürmchen und leuchtenden Feldern.
 *
 * Werkbank, nicht Spielcode: Das Spiel nutzt seit CHAOS-62 die Module unter `../nature/`
 * (Gelände, Gras, Pflanzen, Licht, Grafikstufen) und die eingecheckten, verkleinerten Assets
 * aus `@chaos-party/assets` (ADR-014). Änderungen am Look dort vornehmen.
 *
 * Assets liegen nach `node scripts/fetch-lookdev-assets.mjs` unter
 * `apps/host/public/lookdev-assets/` (nicht eingecheckt) und werden vom Dev-Server unter
 * `/host/lookdev-assets/` ausgeliefert.
 */
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer.js';
import '@babylonjs/core/Layers/effectLayerSceneComponent.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js';
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder.js';
import { CreateRibbon } from '@babylonjs/core/Meshes/Builders/ribbonBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js';
import { DepthOfFieldEffectBlurLevel } from '@babylonjs/core/PostProcesses/depthOfFieldEffect.js';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js';
import '@babylonjs/core/Rendering/depthRendererSceneComponent.js';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent.js';
import type { Scene } from '@babylonjs/core/scene.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {
  LIGHT_MOOD_IDS,
  LIGHT_MOODS,
  type LightMood,
  type LightMoodId,
} from '../lighting/moods.ts';

export const NATURE_VARIANTS = LIGHT_MOOD_IDS.map((id) => `natur-${id}` as const);
export type NatureVariant = `natur-${LightMoodId}`;

export function natureMood(variant: NatureVariant): LightMood {
  const mood = LIGHT_MOODS[variant.slice('natur-'.length) as LightMoodId];
  // Feinabstimmung ohne Neubau: `tune={"key":{"intensity":2}}` überschreibt Felder (nur Vitrine).
  const tune = new URLSearchParams(location.search).get('tune');
  return tune ? (merge(mood, JSON.parse(tune)) as LightMood) : mood;
}

function merge(base: unknown, patch: unknown): unknown {
  if (typeof base !== 'object' || base === null || typeof patch !== 'object' || patch === null) {
    return patch;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) out[key] = merge(out[key], value);
  return out;
}

export function natureTitle(variant: NatureVariant): string {
  const mood = natureMood(variant);
  return `${mood.title} – ${mood.blurb}`;
}

const ASSETS = `${import.meta.env.BASE_URL}lookdev-assets/`;
/**
 * Dateiendungen im Artefakt-Paket (`scripts/pack-lookdev-artifact.mjs`): Artefakte liefern nur
 * Web-Standardtypen aus, deshalb heißen glTF dort `.gltf.json` und Binärdateien `.wasm`.
 */
const PACKED = import.meta.env.VITE_LOOKDEV_PACKED === '1';
const GLTF_SUFFIX = PACKED ? '.json' : '';
const BINARY_SUFFIX = PACKED ? '.wasm' : '';

// ---------------------------------------------------------------------------------------------
// Zufall und Rauschen (deterministisch)
// ---------------------------------------------------------------------------------------------

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Wertrauschen 0…1 in 3D. */
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

function fbm(x: number, y: number, z: number): number {
  return (
    noise3(x, y, z) * 0.55 +
    noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 +
    noise3(x * 4.3, y * 4.3, z * 4.3) * 0.15
  );
}

/** Verschiebt die Eckpunkte entlang der Normalen (organische Formen). */
function displace(mesh: Mesh, amount: number, frequency: number, seed: number): void {
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
// Materialien
// ---------------------------------------------------------------------------------------------

class Materials {
  private readonly cache = new Map<string, Material>();
  constructor(private readonly scene: Scene) {}

  private texture(id: string, map: 'diff' | 'nor' | 'arm', u: number, v: number): Texture {
    const tex = new Texture(`${ASSETS}${id}/${id}_${map}_1k.jpg`, this.scene);
    tex.uScale = u;
    tex.vScale = v;
    if (map !== 'diff') tex.gammaSpace = false;
    return tex;
  }

  /** PBR mit Poly-Haven-Satz (Farbe, Normalen, AO/Rauheit/Metall). */
  textured(
    id: string,
    options: { u?: number; v?: number; tint?: string; bump?: number; key?: string } = {},
  ): Material {
    const u = options.u ?? 1;
    const v = options.v ?? u;
    const key = options.key ?? `${id}-${String(u)}-${String(v)}-${options.tint ?? ''}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const mat = new PBRMaterial(key, this.scene);
    mat.albedoTexture = this.texture(id, 'diff', u, v);
    const bump = this.texture(id, 'nor', u, v);
    bump.level = options.bump ?? 1;
    mat.bumpTexture = bump;
    // Poly Haven liefert OpenGL-Normalen; Babylon ist linkshändig.
    mat.invertNormalMapX = true;
    mat.metallicTexture = this.texture(id, 'arm', u, v);
    mat.useAmbientOcclusionFromMetallicTextureRed = true;
    mat.useRoughnessFromMetallicTextureGreen = true;
    mat.useMetallnessFromMetallicTextureBlue = true;
    mat.metallic = 1;
    mat.roughness = 1;
    if (options.tint) mat.albedoColor = Color3.FromHexString(options.tint).toLinearSpace();
    this.cache.set(key, mat);
    return mat;
  }

  /** Einfarbiges PBR (gemalt, lackiert, Laub …). */
  plain(
    hex: string,
    options: {
      roughness?: number;
      metallic?: number;
      clearCoat?: number;
      translucency?: number;
      bumpFrom?: string;
      bumpScale?: number;
      alpha?: number;
      /** Eigenleuchten als Anteil der eigenen Farbe (Nachtstimmungen, Lesbarkeit). */
      glow?: number;
    } = {},
  ): Material {
    const key = `${hex}-${JSON.stringify(options)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const mat = new PBRMaterial(key, this.scene);
    mat.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    mat.roughness = options.roughness ?? 0.6;
    mat.metallic = options.metallic ?? 0;
    if (options.clearCoat) {
      mat.clearCoat.isEnabled = true;
      mat.clearCoat.intensity = options.clearCoat;
      mat.clearCoat.roughness = 0.1;
    }
    if (options.translucency) {
      mat.subSurface.isTranslucencyEnabled = true;
      mat.subSurface.translucencyIntensity = options.translucency;
      mat.subSurface.tintColor = Color3.FromHexString(hex);
    }
    if (options.bumpFrom) {
      const scale = options.bumpScale ?? 2;
      const bump = this.texture(options.bumpFrom, 'nor', scale, scale);
      bump.level = 0.8;
      mat.bumpTexture = bump;
      mat.invertNormalMapX = true;
    }
    if (options.alpha !== undefined) mat.alpha = options.alpha;
    if (options.glow) mat.emissiveColor = Color3.FromHexString(hex).scale(options.glow);
    this.cache.set(key, mat);
    return mat;
  }
}

// ---------------------------------------------------------------------------------------------
// Gelände
// ---------------------------------------------------------------------------------------------

/** Umriss der Insel: Radius je Winkel. */
const ISLAND_RADIUS = 10;
const Z_SQUASH = 0.8;
function rim(a: number): number {
  return (
    ISLAND_RADIUS *
    (1 + 0.06 * Math.sin(3 * a + 0.5) + 0.04 * Math.sin(5 * a + 2.1) + 0.025 * Math.sin(9 * a + 1))
  );
}

interface Terrain {
  /** Höhe der Grasdecke an (x, z). */
  height(x: number, z: number): number;
  /** Liegt (x, z) auf der Insel (mit Randabstand)? */
  inside(x: number, z: number, margin?: number): boolean;
}

function makeTerrain(pond: Vector3 | null, flatSpots: readonly Vector3[]): Terrain {
  const inside = (x: number, z: number, margin = 0): boolean => {
    const a = Math.atan2(z / Z_SQUASH, x);
    return Math.hypot(x, z / Z_SQUASH) < rim(a) - margin;
  };
  const height = (x: number, z: number): number => {
    const a = Math.atan2(z / Z_SQUASH, x);
    const r = Math.hypot(x, z / Z_SQUASH) / rim(a);
    let h = (fbm(x * 0.12 + 3, 0, z * 0.12) - 0.45) * 0.9;
    // Weg und Stellflächen eben halten.
    for (const spot of flatSpots) {
      const d = Math.hypot(spot.x - x, spot.z - z);
      if (d < 1.6) h *= smooth(Math.min(1, d / 1.6));
    }
    if (pond) {
      const d = Math.hypot((x - pond.x) / 1.0, (z - pond.z) / 0.72);
      if (d < 2.4) h -= 0.42 * (1 - smooth(Math.min(1, d / 2.4)));
    }
    // Weiche Kante zum Abhang.
    if (r > 0.88) h -= smooth((r - 0.88) / 0.12) * 0.35;
    return h;
  };
  return { height, inside };
}

function buildIsland(scene: Scene, mats: Materials, terrain: Terrain, out: Mesh[]): void {
  const size = ISLAND_RADIUS * 2.4;
  const ground = CreateGround('wiese', { width: size, height: size, subdivisions: 160 }, scene);
  const positions = ground.getVerticesData(VertexBuffer.PositionKind) ?? [];
  for (let i = 0; i < positions.length; i += 3) {
    let x = positions[i] ?? 0;
    let z = positions[i + 2] ?? 0;
    const a = Math.atan2(z / Z_SQUASH, x);
    const r = Math.hypot(x, z / Z_SQUASH);
    const max = rim(a);
    if (r > max) {
      // Auf den Rand ziehen (entartete Dreiecke außerhalb sind unsichtbar).
      x = Math.cos(a) * max;
      z = Math.sin(a) * max * Z_SQUASH;
    }
    positions[i] = x;
    positions[i + 1] = terrain.height(x, z);
    positions[i + 2] = z;
  }
  ground.setVerticesData(VertexBuffer.PositionKind, positions);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, ground.getIndices() ?? [], normals);
  ground.setVerticesData(VertexBuffer.NormalKind, normals);
  ground.material = mats.textured('leafy_grass', { u: 7, tint: '#b8d48a' });
  ground.receiveShadows = true;
  out.push(ground);

  // Abhang: Ringe vom Grasrand nach unten, nach innen eingezogen.
  const depths: [number, number][] = [
    [0, 1],
    [-0.5, 0.985],
    [-1.3, 0.95],
    [-2.3, 0.86],
    [-3.2, 0.68],
    [-3.9, 0.4],
    [-4.2, 0.05],
  ];
  const paths = depths.map(([y, s], k) => {
    const path: Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      const wobble = k === 0 ? 0 : (fbm(Math.cos(a) * 2 + k, k * 0.7, Math.sin(a) * 2) - 0.5) * 0.9;
      const r = rim(a) * s + wobble;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * Z_SQUASH;
      path.push(new Vector3(x, k === 0 ? terrain.height(x, z) - 0.02 : y, z));
    }
    return path;
  });
  const cliff = CreateRibbon('abhang', { pathArray: paths, closePath: false }, scene);
  cliff.material = mats.textured('brown_mud_rocks_01', { u: 14, v: 2, tint: '#d9c2a8' });
  cliff.receiveShadows = true;
  out.push(cliff);
}

// ---------------------------------------------------------------------------------------------
// Gras
// ---------------------------------------------------------------------------------------------

function grassBlade(scene: Scene, tipHex: string): Mesh {
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
  for (let i = 0; i < normals.length; i += 3) {
    normals[i + 1] = (normals[i + 1] ?? 0) + 0.6;
  }
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.colors = colors;
  const blade = new Mesh('grashalm', scene);
  data.applyToMesh(blade);
  const mat = new PBRMaterial('grashalm', scene);
  mat.albedoColor = Color3.White();
  mat.roughness = 0.75;
  mat.metallic = 0;
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  mat.subSurface.isTranslucencyEnabled = true;
  mat.subSurface.translucencyIntensity = 0.5;
  blade.material = mat;
  blade.receiveShadows = true;
  return blade;
}

function scatterGrass(
  scene: Scene,
  terrain: Terrain,
  count: number,
  avoid: (x: number, z: number) => boolean,
  tipHex: string,
  rnd: () => number,
  region?: { cx: number; cz: number; r: number },
): Mesh[] {
  // Drei Halm-Sorten (Spitzenfarbe) statt Instanzfarben: die würden den Verlauf ersetzen.
  const tip = Color3.FromHexString(tipHex);
  const tips = [
    tipHex,
    Color3.Lerp(tip, Color3.FromHexString('#4f7d2c'), 0.45).toHexString(),
    Color3.Lerp(tip, Color3.FromHexString('#d8c46a'), 0.4).toHexString(),
  ];
  const blades = tips.map((hex) => grassBlade(scene, hex));
  const matrices: number[][] = tips.map(() => []);
  const m = new Matrix();
  const q = new Quaternion();
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 4) {
    tries++;
    let x: number;
    let z: number;
    if (region) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * region.r;
      x = region.cx + Math.cos(a) * r;
      z = region.cz + Math.sin(a) * r;
    } else {
      x = (rnd() * 2 - 1) * ISLAND_RADIUS * 1.1;
      z = (rnd() * 2 - 1) * ISLAND_RADIUS * Z_SQUASH * 1.1;
    }
    if (!terrain.inside(x, z, 0.35) || avoid(x, z)) continue;
    // Büschel: dichter, wo das Rauschen hoch ist.
    if (fbm(x * 0.35, 7, z * 0.35) < 0.33 && rnd() < 0.55) continue;
    const s = 0.65 + rnd() * 0.75;
    Quaternion.RotationYawPitchRollToRef(
      rnd() * Math.PI * 2,
      (rnd() - 0.5) * 0.35,
      (rnd() - 0.5) * 0.35,
      q,
    );
    Matrix.ComposeToRef(
      new Vector3(s, s * (0.8 + rnd() * 0.6), s),
      q,
      new Vector3(x, terrain.height(x, z) - 0.02, z),
      m,
    );
    // Sorte nach großflächigem Rauschen: Flecken statt Salz und Pfeffer.
    const patch = fbm(x * 0.22, 11, z * 0.22) + (rnd() - 0.5) * 0.25;
    const sort = patch < 0.42 ? 1 : patch > 0.58 ? 2 : 0;
    const target = matrices[sort] ?? matrices[0];
    for (let i = 0; i < 16; i++) target?.push(m.m[i] ?? 0);
    placed++;
  }
  blades.forEach((blade, i) => {
    blade.thinInstanceSetBuffer('matrix', new Float32Array(matrices[i] ?? []), 16, true);
  });
  return blades;
}

// ---------------------------------------------------------------------------------------------
// Pflanzen, Steine, Bäume
// ---------------------------------------------------------------------------------------------

const LEAF_TONES = ['#5f8f3c', '#6e9c42', '#557f36', '#7aa64a'] as const;

function tree(
  scene: Scene,
  mats: Materials,
  at: Vector3,
  scale: number,
  rnd: () => number,
  out: Mesh[],
): void {
  const root = new TransformNode('baum', scene);
  root.position = at.clone();
  root.scaling.setAll(scale);
  root.rotation.y = rnd() * Math.PI * 2;
  const bark = mats.textured('bark_brown_02', { u: 2, v: 3, tint: '#c8b8a8' });
  const trunk = CreateCylinder(
    'stamm',
    { diameterTop: 0.26, diameterBottom: 0.5, height: 2.4, tessellation: 14, subdivisions: 6 },
    scene,
  );
  trunk.position.y = 1.15;
  displace(trunk, 0.05, 1.4, rnd() * 10);
  trunk.material = bark;
  trunk.parent = root;
  out.push(trunk);
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
    branch.material = bark;
    branch.parent = root;
    out.push(branch);
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
    const blob = CreateIcoSphere('krone', { radius: r, subdivisions: 12, flat: false }, scene);
    displace(blob, 0.13, 0.85, rnd() * 50);
    blob.position.set(
      Math.cos(a) * ring,
      2.7 + (i === 0 ? 0.35 : rnd() * 0.6 - 0.1),
      Math.sin(a) * ring,
    );
    blob.scaling.y = 0.85;
    blob.material = leaves;
    blob.parent = root;
    out.push(blob);
  }
}

function pine(
  scene: Scene,
  mats: Materials,
  at: Vector3,
  scale: number,
  rnd: () => number,
  out: Mesh[],
): void {
  const root = new TransformNode('tanne', scene);
  root.position = at.clone();
  root.scaling.setAll(scale);
  root.rotation.y = rnd() * Math.PI * 2;
  const trunk = CreateCylinder(
    'stamm',
    { diameterTop: 0.12, diameterBottom: 0.3, height: 1.2, tessellation: 10 },
    scene,
  );
  trunk.position.y = 0.6;
  trunk.material = mats.textured('bark_brown_02', { u: 1, v: 2, tint: '#a89484' });
  trunk.parent = root;
  out.push(trunk);
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
      { diameterTop: 0, diameterBottom: d, height: h, tessellation: 24, subdivisions: 4 },
      scene,
    );
    displace(cone, 0.08, 3, rnd() * 20);
    cone.position.y = y + h / 2;
    cone.material = needles;
    cone.parent = root;
    out.push(cone);
  }
}

function rock(
  scene: Scene,
  mats: Materials,
  at: Vector3,
  size: number,
  rnd: () => number,
  out: Mesh[],
): Mesh {
  const r = CreateIcoSphere('stein', { radius: size, subdivisions: 8, flat: false }, scene);
  displace(r, size * 0.28, 1.2 / size, rnd() * 100);
  r.position = at.clone();
  r.position.y += size * 0.2;
  r.scaling.set(1 + rnd() * 0.3, 0.55 + rnd() * 0.2, 1 + rnd() * 0.2);
  r.rotation.y = rnd() * 3;
  r.material = mats.textured('mossy_rock', { u: 1, tint: '#d8d6cc' });
  r.receiveShadows = true;
  out.push(r);
  return r;
}

async function loadPlant(
  scene: Scene,
  id: string,
): Promise<(at: Vector3, scale: number, yaw: number) => void> {
  // Format explizit: Im Artefakt heißen die Dateien `.gltf.json` (nur Web-Standardtypen).
  const container = await LoadAssetContainerAsync(
    `${ASSETS}${id}/${id}_1k.gltf${GLTF_SUFFIX}`,
    scene,
    {
      pluginExtension: '.gltf',
    },
  );
  return (at, scale, yaw) => {
    const entries = container.instantiateModelsToScene((n) => `${id}-${n}`, false, {
      doNotInstantiate: false,
    });
    for (const node of entries.rootNodes) {
      const holder = new TransformNode(`${id}-halter`, scene);
      holder.position = at.clone();
      holder.scaling.setAll(scale);
      holder.rotation.y = yaw;
      node.parent = holder;
      for (const mesh of node.getChildMeshes(false)) mesh.receiveShadows = true;
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Spielbrett: Baumscheiben-Felder, Trittsteine, Trophäe, Wegweiser
// ---------------------------------------------------------------------------------------------

type TileKind = 'plus' | 'minus' | 'gold' | 'gift';
const PAINT: Readonly<Record<TileKind, string>> = {
  plus: '#3c7bd6',
  minus: '#d4534b',
  gold: '#e3ae38',
  gift: '#8a68cc',
};
const CREAM = '#f6efe2';

function tile(
  scene: Scene,
  mats: Materials,
  at: Vector3,
  kind: TileKind,
  rnd: () => number,
  out: Mesh[],
  glow: number,
): void {
  const root = new TransformNode(`feld-${kind}`, scene);
  root.position = at.clone();
  root.rotation.y = rnd() * Math.PI * 2;
  root.rotation.x = (rnd() - 0.5) * 0.04;
  root.rotation.z = (rnd() - 0.5) * 0.04;
  const side = CreateCylinder(
    'scheibe-rinde',
    { diameter: 1.42, height: 0.26, tessellation: 40, cap: Mesh.NO_CAP },
    scene,
  );
  side.position.y = 0.1;
  displace(side, 0.025, 4, rnd() * 10);
  side.material = mats.textured('bark_brown_02', {
    u: 4,
    v: 0.4,
    tint: '#b8a594',
    key: 'scheibe-rinde',
  });
  side.parent = root;
  out.push(side);
  const top = CreateCylinder('scheibe', { diameter: 1.4, height: 0.02, tessellation: 40 }, scene);
  top.position.y = 0.225;
  top.material = mats.textured('oak_veneer_01', { u: 0.6, tint: '#e6cfae', key: 'scheibe-holz' });
  top.parent = root;
  out.push(top);
  const inlay = CreateCylinder('farbe', { diameter: 0.98, height: 0.02, tessellation: 40 }, scene);
  inlay.position.y = 0.238;
  inlay.material = mats.plain(PAINT[kind], { roughness: 0.45, clearCoat: 0.6, glow });
  inlay.parent = root;
  out.push(inlay);
  const ring = CreateTorus(
    'farbring',
    { diameter: 1.08, thickness: 0.035, tessellation: 40 },
    scene,
  );
  ring.position.y = 0.24;
  ring.material = mats.plain(CREAM, { roughness: 0.5, glow: glow * 0.5 });
  ring.parent = root;
  out.push(ring);
  const ink = mats.plain(CREAM, { roughness: 0.4, clearCoat: 0.4, glow: glow * 0.7 });
  const symbol = new TransformNode('symbol', scene);
  symbol.parent = root;
  symbol.rotation.y = -root.rotation.y;
  if (kind === 'plus' || kind === 'minus') {
    const bar = CreateBox('balken', { width: 0.46, height: 0.05, depth: 0.13 }, scene);
    bar.position.y = 0.26;
    bar.material = ink;
    bar.parent = symbol;
    out.push(bar);
    if (kind === 'plus') {
      const bar2 = CreateBox('balken', { width: 0.13, height: 0.05, depth: 0.46 }, scene);
      bar2.position.y = 0.26;
      bar2.material = ink;
      bar2.parent = symbol;
      out.push(bar2);
    }
  } else if (kind === 'gold') {
    const coin = CreateCylinder(
      'muenze',
      { diameter: 0.46, height: 0.07, tessellation: 40 },
      scene,
    );
    coin.position.y = 0.28;
    coin.material = mats.plain('#e8b94a', { metallic: 1, roughness: 0.28 });
    coin.parent = symbol;
    out.push(coin);
  } else {
    const box = CreateBox('geschenk', { size: 0.4 }, scene);
    box.position.y = 0.45;
    box.rotation.y = 0.4;
    box.material = mats.plain(PAINT.gift, { roughness: 0.5, clearCoat: 0.4, glow });
    box.parent = symbol;
    out.push(box);
    for (const [w, d] of [
      [0.42, 0.08],
      [0.08, 0.42],
    ] as const) {
      const band = CreateBox('band', { width: w, height: 0.42, depth: d }, scene);
      band.position.y = 0.45;
      band.rotation.y = 0.4;
      band.material = ink;
      band.parent = symbol;
      out.push(band);
    }
  }
}

function trophy(scene: Scene, mats: Materials, at: Vector3, out: Mesh[]): void {
  const gold = mats.plain('#e9b949', { metallic: 1, roughness: 0.22 });
  const cup = CreateLathe(
    'pokal',
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
      tessellation: 48,
    },
    scene,
  );
  cup.position = at.clone();
  cup.material = gold;
  out.push(cup);
  for (const side of [-1, 1]) {
    const handle = CreateTorus(
      'henkel',
      { diameter: 0.28, thickness: 0.05, tessellation: 24 },
      scene,
    );
    handle.position = at.add(new Vector3(side * 0.37, 0.68, 0));
    handle.rotation.x = Math.PI / 2;
    handle.material = gold;
    out.push(handle);
  }
}

// ---------------------------------------------------------------------------------------------
// Licht, Himmel, Nachbearbeitung
// ---------------------------------------------------------------------------------------------

/** Laterne aus Pfosten, Arm und Glaskörper; liefert die Position des Glases (Lichtquelle). */
function lantern(scene: Scene, mats: Materials, at: Vector3, yaw: number, out: Mesh[]): Vector3 {
  const root = new TransformNode('laterne', scene);
  root.position = at.clone();
  root.rotation.y = yaw;
  const wood = mats.textured('bark_brown_02', { u: 0.5, v: 1, tint: '#9c8572' });
  const iron = mats.plain('#2b2a28', { metallic: 0.8, roughness: 0.45 });
  const post = CreateCylinder(
    'laterne-pfahl',
    { diameter: 0.1, height: 1.5, tessellation: 10 },
    scene,
  );
  post.position.y = 0.75;
  post.material = wood;
  post.parent = root;
  out.push(post);
  const arm = CreateBox('laterne-arm', { width: 0.42, height: 0.05, depth: 0.05 }, scene);
  arm.position.set(0.18, 1.45, 0);
  arm.material = iron;
  arm.parent = root;
  out.push(arm);
  const cap = CreateCylinder(
    'laterne-dach',
    { diameterTop: 0.04, diameterBottom: 0.26, height: 0.12, tessellation: 6 },
    scene,
  );
  cap.position.set(0.36, 1.36, 0);
  cap.material = iron;
  cap.parent = root;
  out.push(cap);
  const glass = CreateCylinder(
    'laterne-glas',
    { diameterTop: 0.2, diameterBottom: 0.15, height: 0.24, tessellation: 6 },
    scene,
  );
  glass.position.set(0.36, 1.18, 0);
  glass.parent = root;
  glass.material = mats.plain('#fff1d6', { roughness: 0.2, alpha: 0.9 });
  root.computeWorldMatrix(true);
  glass.computeWorldMatrix(true);
  return glass.getAbsolutePosition().clone();
}

/** Glühwürmchen: kleine leuchtende Punkte, die langsam über dem Gras schweben. */
function fireflies(scene: Scene, terrain: Terrain, count: number, rnd: () => number): Mesh {
  const dot = CreateSphere('gluehwuermchen', { diameter: 0.06, segments: 4 }, scene);
  const mat = new PBRMaterial('gluehwuermchen', scene);
  mat.unlit = true;
  mat.albedoColor = Color3.Black();
  mat.emissiveColor = Color3.FromHexString('#d9ff7a');
  mat.emissiveIntensity = 3;
  dot.material = mat;
  dot.isPickable = false;
  const base: { x: number; y: number; z: number; phase: number; speed: number }[] = [];
  while (base.length < count) {
    const x = (rnd() * 2 - 1) * 9;
    const z = (rnd() * 2 - 1) * 7;
    if (!terrain.inside(x, z, 0.8)) continue;
    base.push({
      x,
      z,
      y: terrain.height(x, z) + 0.35 + rnd() * 1.3,
      phase: rnd() * Math.PI * 2,
      speed: 0.4 + rnd() * 0.6,
    });
  }
  const matrices = new Float32Array(count * 16);
  let time = 0;
  const update = (): void => {
    base.forEach((b, i) => {
      const t = time * b.speed + b.phase;
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.3);
      Matrix.ComposeToRef(
        new Vector3(pulse, pulse, pulse),
        Quaternion.Identity(),
        new Vector3(
          b.x + Math.sin(t) * 0.35,
          b.y + Math.sin(t * 1.7) * 0.15,
          b.z + Math.cos(t * 0.8) * 0.35,
        ),
        Matrix.Identity(),
      ).copyToArray(matrices, i * 16);
    });
    dot.thinInstanceSetBuffer('matrix', matrices, 16, false);
  };
  update();
  scene.onBeforeRenderObservable.add(() => {
    time += scene.getEngine().getDeltaTime() / 1000;
    update();
  });
  return dot;
}

async function lightScene(
  scene: Scene,
  camera: ArcRotateCamera,
  mood: LightMood,
  casters: readonly AbstractMesh[],
  focusDistance: number,
  lanterns: readonly Vector3[],
  terrain: Terrain,
): Promise<void> {
  const url = `${ASSETS}${mood.sky.hdri}/${mood.sky.hdri}_1k.hdr${BINARY_SUFFIX}`;
  const env = new HDRCubeTexture(url, scene, 256, false, true, false, true);
  scene.environmentTexture = env;
  scene.environmentIntensity = mood.sky.intensity;
  const background = new HDRCubeTexture(url, scene, 1024, false, false, false, false);
  const sky = CreateBox('himmel', { size: 500 }, scene);
  const skyMat = new PBRMaterial('himmel', scene);
  skyMat.backFaceCulling = false;
  skyMat.reflectionTexture = background;
  background.coordinatesMode = Texture.SKYBOX_MODE;
  // Nachthimmel sind sehr dunkel: der sichtbare Himmel folgt der Umgebungsstärke.
  background.level = Math.max(1, mood.sky.intensity * 0.6);
  skyMat.microSurface = 1;
  skyMat.disableLighting = true;
  skyMat.fogEnabled = false;
  sky.material = skyMat;
  sky.infiniteDistance = true;
  sky.isPickable = false;

  await new Promise<void>((resolve) => {
    env.onLoadObservable.addOnce(() => {
      resolve();
    });
    if (env.isReady()) resolve();
  });
  // Licht-Richtung aus dem linearen Anteil der Harmonischen (Texturraum, zeigt zur hellsten
  // Seite: Sonne, nachts der Mond).
  const sh = env.sphericalPolynomial;
  const lum = (v: Vector3): number => v.x * 0.2126 + v.y * 0.7152 + v.z * 0.0722;
  let sunInTexture = sh ? new Vector3(lum(sh.x), lum(sh.y), lum(sh.z)) : new Vector3(0, 1, 0);
  if (sunInTexture.lengthSquared() < 1e-6) sunInTexture = new Vector3(0, 1, 0);
  sunInTexture.normalize();
  // Himmel so drehen, dass das Licht schräg von vorn links kommt (Kamera blickt nach +Z):
  // keine Gegenlicht-Szene, Schatten fallen nach hinten rechts.
  const wanted = Math.atan2(-0.66, -0.75);
  const toWorld = (rotation: number): Vector3 => {
    env.rotationY = rotation;
    const inverse = env.getReflectionTextureMatrix().clone().invert();
    return Vector3.TransformNormal(sunInTexture, inverse);
  };
  let best = 0;
  let bestError = Infinity;
  for (let deg = 0; deg < 360; deg += 2) {
    const w = toWorld((deg * Math.PI) / 180);
    const diff = Math.abs(
      Math.atan2(Math.sin(Math.atan2(w.z, w.x) - wanted), Math.cos(Math.atan2(w.z, w.x) - wanted)),
    );
    if (diff < bestError) {
      bestError = diff;
      best = (deg * Math.PI) / 180;
    }
  }
  const toSun = toWorld(best);
  background.rotationY = best;
  // Nicht zu steil und nicht unter den Horizont (Lesbarkeit der Schatten).
  toSun.y = Math.min(mood.key.maxElevation, Math.max(mood.key.minElevation, toSun.y));
  toSun.normalize();
  const direction = toSun.scale(-1);
  const sun = new DirectionalLight('sonne', direction, scene);
  sun.position = toSun.scale(40);
  sun.intensity = mood.key.intensity;
  sun.diffuse = Color3.FromHexString(mood.key.tint);
  sun.autoCalcShadowZBounds = true;
  (window as unknown as { __sonne?: number[] }).__sonne = [toSun.x, toSun.y, toSun.z];
  // Puresky-HDRIs sind unten schwarz: ein schwaches Halbkugellicht ersetzt das Bodenlicht.
  const fill = new HemisphericLight('bodenlicht', new Vector3(0, 1, 0), scene);
  fill.intensity = mood.fill.intensity;
  fill.diffuse = Color3.FromHexString(mood.fill.sky);
  fill.groundColor = Color3.FromHexString(mood.fill.ground);
  fill.specular = Color3.Black();
  const shadows = new ShadowGenerator(4096, sun);
  shadows.useContactHardeningShadow = true;
  shadows.contactHardeningLightSizeUVRatio = mood.key.penumbra;
  shadows.bias = 0.0015;
  shadows.normalBias = 0.012;
  shadows.darkness = 0;
  for (const mesh of casters) shadows.addShadowCaster(mesh, false);

  // Nachtlichter: Laternen als Punktlichter, leuchtendes Glas, Glühwürmchen mit Schein.
  const night = mood.night;
  if (night) {
    const glow = new GlowLayer('schein', scene, { mainTextureSamples: 4, blurKernelSize: 48 });
    glow.intensity = 0.9;
    const lanternColor = Color3.FromHexString(night.lanternColor);
    lanterns.slice(0, night.lanterns).forEach((at, i) => {
      const light = new PointLight(`laternenlicht-${String(i)}`, at, scene);
      light.diffuse = lanternColor;
      light.specular = lanternColor.scale(0.5);
      light.intensity = night.lanternIntensity;
      light.range = night.lanternRange;
    });
    for (const mesh of scene.meshes) {
      if (mesh.name !== 'laterne-glas') continue;
      const lit = new PBRMaterial('laterne-glas-an', scene);
      lit.unlit = true;
      lit.albedoColor = Color3.Black();
      lit.emissiveColor = lanternColor;
      lit.emissiveIntensity = 1.4;
      mesh.material = lit;
      glow.addIncludedOnlyMesh(mesh as Mesh);
    }
    if (night.fireflies > 0) {
      glow.addIncludedOnlyMesh(fireflies(scene, terrain, night.fireflies, seeded(60)));
    }
    // Sonne, Bodenlicht und bis zu sechs Laternen pro Material.
    for (const mat of scene.materials) {
      if (mat instanceof PBRMaterial) mat.maxSimultaneousLights = 2 + night.lanterns;
    }
  }

  // Dunst unter der Insel: Die Brettkamera blickt unter den Horizont, wo Puresky-HDRIs schwarz sind.
  const haze = CreateDisc('dunst', { radius: 260, tessellation: 64 }, scene);
  haze.rotation.x = Math.PI / 2;
  haze.position.y = -9;
  const hazeMat = new PBRMaterial('dunst', scene);
  hazeMat.unlit = true;
  hazeMat.albedoColor = Color3.FromHexString(mood.haze.color).toLinearSpace();
  haze.material = hazeMat;
  haze.isPickable = false;
  scene.fogMode = 2;
  scene.fogColor = Color3.FromHexString(mood.haze.color);
  scene.fogDensity = mood.haze.density;
  scene.clearColor = Color4.FromHexString(`${mood.haze.color}ff`);

  const ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.75, blurRatio: 1 }, [
    camera,
  ]);
  ssao.radius = 1.0;
  ssao.totalStrength = night ? 0.9 : 1.2;
  ssao.samples = 16;
  ssao.maxZ = 150;

  const pipeline = new DefaultRenderingPipeline('nachbearbeitung', true, scene, [camera]);
  pipeline.samples = 4;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = mood.grade.exposure;
  pipeline.imageProcessing.contrast = mood.grade.contrast;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 1.4;
  pipeline.imageProcessing.vignetteColor = new Color4(0.05, 0.06, 0.08, 0);
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = mood.grade.bloomThreshold;
  pipeline.bloomWeight = mood.grade.bloomWeight;
  pipeline.bloomKernel = 64;
  pipeline.depthOfFieldEnabled = true;
  pipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.Low;
  pipeline.depthOfField.focusDistance = focusDistance * 1000;
  pipeline.depthOfField.focalLength = 90;
  pipeline.depthOfField.fStop = 3.2;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.2;
  pipeline.grainEnabled = true;
  pipeline.grain.intensity = 4;
  pipeline.grain.animated = false;
}

// ---------------------------------------------------------------------------------------------
// Szenen
// ---------------------------------------------------------------------------------------------

export interface NatureStage {
  readonly casters: Mesh[];
  readonly tiles: Vector3[];
  readonly spots: Vector3[];
  readonly material: (hex: string) => Material;
  /** Licht und Nachbearbeitung, nachdem Kamera und Figuren stehen. */
  light(
    camera: ArcRotateCamera,
    extraCasters: readonly AbstractMesh[],
    focusDistance: number,
  ): Promise<void>;
}

export async function buildNatureBoard(scene: Scene, variant: NatureVariant): Promise<NatureStage> {
  const mood = natureMood(variant);
  const glow = mood.night?.tileGlow ?? 0;
  const mats = new Materials(scene);
  const rnd = seeded(57);
  const casters: Mesh[] = [];

  const kinds: TileKind[] = ['plus', 'minus', 'plus', 'gift', 'plus', 'gold', 'plus', 'minus'];
  const flat: Vector3[] = kinds.map(
    (_, i) => new Vector3(-6.4 + i * 1.85, 0, -1.2 + Math.sin(i * 0.75) * 1.9),
  );
  const pond = new Vector3(4.8, 0, 3.4);
  const trophyAt = (flat[5] ?? Vector3.Zero()).add(new Vector3(0.4, 0, 1.7));
  const terrain = makeTerrain(pond, [...flat, trophyAt]);
  const groundMeshes: Mesh[] = [];
  buildIsland(scene, mats, terrain, groundMeshes);

  const tiles = flat.map((p) => new Vector3(p.x, terrain.height(p.x, p.z), p.z));
  tiles.forEach((at, i) => {
    tile(scene, mats, at, kinds[i] ?? 'plus', rnd, casters, glow);
    const next = tiles[i + 1];
    if (next) {
      for (let k = 1; k <= 2; k++) {
        const p = Vector3.Lerp(at, next, k / 3);
        p.x += (rnd() - 0.5) * 0.2;
        p.z += (rnd() - 0.5) * 0.2;
        p.y = terrain.height(p.x, p.z) - 0.06;
        const stone = rock(scene, mats, p, 0.2, rnd, casters);
        stone.scaling.y = 0.32;
      }
    }
  });

  // Teich: Wasser in der Mulde, Steinrand, Seerosen, Schilf.
  const water = CreateDisc('teich', { radius: 2.2, tessellation: 64 }, scene);
  water.rotation.x = Math.PI / 2;
  water.scaling.y = 0.72;
  water.position = new Vector3(pond.x, -0.2, pond.z);
  water.material = mats.plain('#24453f', { roughness: 0.04, alpha: 0.86 });
  water.receiveShadows = true;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rnd() * 0.3;
    const p = new Vector3(pond.x + Math.cos(a) * 2.25, 0, pond.z + Math.sin(a) * 2.25 * 0.72);
    p.y = terrain.height(p.x, p.z) - 0.1;
    rock(scene, mats, p, 0.22 + rnd() * 0.18, rnd, casters);
  }
  for (const [dx, dz, s] of [
    [-0.7, 0.2, 1],
    [0.4, -0.35, 0.8],
    [0.9, 0.45, 0.7],
  ] as const) {
    const pad = CreateCylinder(
      'seerose',
      { diameter: 0.55 * s, height: 0.015, tessellation: 24 },
      scene,
    );
    pad.position = new Vector3(pond.x + dx, -0.19, pond.z + dz);
    pad.material = mats.plain('#4f7d34', { roughness: 0.35 });
  }
  for (let i = 0; i < 14; i++) {
    const a = 2.4 + rnd() * 1.4;
    const reed = CreateCylinder(
      'schilf',
      { diameterTop: 0.01, diameterBottom: 0.04, height: 0.8 + rnd() * 0.5, tessellation: 5 },
      scene,
    );
    const r = 1.6 + rnd() * 0.5;
    reed.position = new Vector3(pond.x + Math.cos(a) * r, 0.2, pond.z + Math.sin(a) * r * 0.72);
    reed.rotation.z = (rnd() - 0.5) * 0.3;
    reed.material = mats.plain('#6b8a3a', { roughness: 0.8, translucency: 0.4 });
    casters.push(reed);
  }

  // Bäume am hinteren Rand, ein paar Tannen, Felsen.
  const trees: [number, number, number, 'b' | 't'][] = [
    [-7.8, 4.2, 0.95, 't'],
    [-5.6, 5.6, 1.1, 'b'],
    [-3.0, 4.6, 0.85, 't'],
    [-0.6, 5.9, 1.2, 'b'],
    [1.8, 5.0, 1.0, 't'],
    [7.6, 4.4, 1.05, 'b'],
    [8.6, 1.0, 0.8, 't'],
    [-8.8, 0.4, 0.9, 'b'],
    [-2.2, 2.6, 0.7, 'b'],
    [7.0, -4.6, 0.75, 't'],
  ];
  for (const [x, z, s, kind] of trees) {
    const at = new Vector3(x, terrain.height(x, z) - 0.05, z);
    if (kind === 'b') tree(scene, mats, at, s, rnd, casters);
    else pine(scene, mats, at, s, rnd, casters);
  }
  for (const [x, z, s] of [
    [2.6, 1.1, 0.5],
    [3.2, 1.6, 0.3],
    [-7.8, -3.4, 0.6],
    [8.0, -2.2, 0.42],
    [-4.0, -4.6, 0.35],
  ] as const) {
    rock(scene, mats, new Vector3(x, terrain.height(x, z), z), s, rnd, casters);
  }

  // Trophäe auf Felssockel neben dem Goldfeld.
  const base = new Vector3(trophyAt.x, terrain.height(trophyAt.x, trophyAt.z), trophyAt.z);
  const plinth = rock(scene, mats, base, 0.55, rnd, casters);
  plinth.scaling.set(1.1, 0.75, 1.0);
  trophy(scene, mats, base.add(new Vector3(0, 0.42, 0)), casters);

  // Wegweiser aus Brettern.
  const signAt = new Vector3(-7.2, 0, -2.7);
  signAt.y = terrain.height(signAt.x, signAt.z);
  const planks = mats.textured('brown_planks_05', { u: 0.5, v: 0.5, tint: '#d8b894' });
  const post = CreateCylinder('pfosten', { diameter: 0.14, height: 1.6, tessellation: 10 }, scene);
  post.position = signAt.add(new Vector3(0, 0.8, 0));
  post.material = mats.textured('bark_brown_02', { u: 0.5, v: 1, tint: '#b39c88' });
  casters.push(post);
  const board = CreateBox('schild', { width: 1.25, height: 0.34, depth: 0.07 }, scene);
  board.position = signAt.add(new Vector3(0.35, 1.3, 0));
  board.rotation.y = -0.4;
  board.material = planks;
  casters.push(board);

  // Gras: überall außer auf Feldern, Wegsteinen, Teich und Sockel.
  const avoid = (x: number, z: number): boolean =>
    tiles.some((t) => Math.hypot(t.x - x, t.z - z) < 0.98) ||
    Math.hypot((x - pond.x) / 1.0, (z - pond.z) / 0.72) < 2.1 ||
    Math.hypot(x - base.x, z - base.z) < 0.55;
  // Laternen hinter dem Weg (von der Kamera aus), je zwischen zwei Feldern.
  const lanternSpots: Vector3[] = [];
  for (const i of [0, 2, 4, 6]) {
    const a = tiles[i];
    const b = tiles[i + 1];
    if (!a || !b) continue;
    const p = Vector3.Lerp(a, b, 0.5).add(new Vector3(0, 0, 1.15));
    p.y = terrain.height(p.x, p.z) - 0.03;
    lanternSpots.push(lantern(scene, mats, p, -Math.PI / 2 + (rnd() - 0.5) * 0.6, casters));
  }

  scatterGrass(scene, terrain, 42000, avoid, mood.grassTip, rnd);

  // Farne und Blumen (CC0-Modelle) in Gruppen.
  const fern = await loadPlant(scene, 'fern_02');
  const flowerA = await loadPlant(scene, 'flower_empodium');
  const flowerB = await loadPlant(scene, 'flower_gazania');
  for (const [x, z] of [
    [-5.0, 3.9],
    [-1.4, 4.4],
    [6.6, 3.0],
    [2.6, 2.7],
    [-8.0, 2.2],
  ] as const) {
    for (let k = 0; k < 3; k++) {
      const px = x + (rnd() - 0.5) * 1.2;
      const pz = z + (rnd() - 0.5) * 0.8;
      fern(new Vector3(px, terrain.height(px, pz) - 0.03, pz), 1.6 + rnd() * 0.8, rnd() * 6);
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = (rnd() * 2 - 1) * 8.5;
    const z = (rnd() * 2 - 1) * 6.5;
    if (
      !terrain.inside(x, z, 0.8) ||
      avoid(x, z) ||
      Math.abs(z - (-1.2 + Math.sin(((x + 6.4) / 1.85) * 0.75) * 1.9)) < 0.9
    )
      continue;
    const place = rnd() < 0.5 ? flowerA : flowerB;
    place(new Vector3(x, terrain.height(x, z) - 0.02, z), 1.4 + rnd() * 0.8, rnd() * 6);
  }

  return {
    casters,
    tiles: tiles.map((t) => t.add(new Vector3(0, 0.25, 0))),
    spots: [],
    material: (hex) => mats.plain(hex, { roughness: 0.5, clearCoat: 0.25, glow }),
    light: (camera, extra, focusDistance) =>
      lightScene(scene, camera, mood, [...casters, ...extra], focusDistance, lanternSpots, terrain),
  };
}

/** Picknickdecke mit Karomuster (prozedural). */
function blanketTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('decke', { width: 512, height: 512 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#f3ece0';
  ctx.fillRect(0, 0, 512, 512);
  const stripe = 64;
  ctx.fillStyle = 'rgba(176, 72, 62, 0.55)';
  for (let i = 0; i < 512; i += stripe * 2) {
    ctx.fillRect(i, 0, stripe, 512);
    ctx.fillRect(0, i, 512, stripe);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 512; i += 8) {
    ctx.fillRect(i, 0, 2, 512);
    ctx.fillRect(0, i, 512, 2);
  }
  tex.update();
  tex.uScale = 3;
  tex.vScale = 3;
  return tex;
}

export function buildNatureArena(scene: Scene, variant: NatureVariant): Promise<NatureStage> {
  const mood = natureMood(variant);
  const glow = mood.night?.tileGlow ?? 0;
  const mats = new Materials(scene);
  const rnd = seeded(7);
  const casters: Mesh[] = [];
  const terrain = makeTerrain(null, [
    Vector3.Zero(),
    new Vector3(3, 0, 0),
    new Vector3(-3, 0, 0),
    new Vector3(0, 0, 3),
    new Vector3(0, 0, -3),
  ]);
  const ground: Mesh[] = [];
  buildIsland(scene, mats, terrain, ground);

  // Decke: leicht gewellt.
  const blanket = CreateGround('decke', { width: 13, height: 13, subdivisions: 48 }, scene);
  const pos = blanket.getVerticesData(VertexBuffer.PositionKind) ?? [];
  // Höhe an der gedrehten Weltposition abfragen (die Decke wird um 0,3 rad gedreht).
  const turn = 0.3;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] ?? 0;
    const z = pos[i + 2] ?? 0;
    const wx = x * Math.cos(turn) + z * Math.sin(turn);
    const wz = -x * Math.sin(turn) + z * Math.cos(turn);
    pos[i + 1] = terrain.height(wx, wz) + 0.06 + (fbm(x * 0.5, 1, z * 0.5) - 0.5) * 0.06;
  }
  blanket.setVerticesData(VertexBuffer.PositionKind, pos);
  const bn: number[] = [];
  VertexData.ComputeNormals(pos, blanket.getIndices() ?? [], bn);
  blanket.setVerticesData(VertexBuffer.NormalKind, bn);
  blanket.rotation.y = turn;
  const cloth = new PBRMaterial('decke', scene);
  cloth.albedoTexture = blanketTexture(scene);
  cloth.roughness = 0.9;
  cloth.metallic = 0;
  cloth.sheen.isEnabled = true;
  cloth.sheen.intensity = 0.4;
  blanket.material = cloth;
  blanket.receiveShadows = true;

  const y0 = 0.1;
  const plate = CreateLathe(
    'teller',
    {
      shape: [
        new Vector3(0, y0, 0),
        new Vector3(4.6, y0, 0),
        new Vector3(5.6, y0 + 0.3, 0),
        new Vector3(5.8, y0 + 0.4, 0),
        new Vector3(5.7, y0 + 0.42, 0),
        new Vector3(4.6, y0 + 0.14, 0),
        new Vector3(0, y0 + 0.14, 0),
      ],
      tessellation: 96,
    },
    scene,
  );
  plate.material = mats.plain('#f7f4ee', { roughness: 0.15, clearCoat: 0.8 });
  casters.push(plate);
  const pudding = CreateLathe(
    'pudding',
    {
      shape: [
        new Vector3(0, y0 + 0.14, 0),
        new Vector3(3.9, y0 + 0.14, 0),
        new Vector3(3.95, y0 + 0.28, 0),
        new Vector3(3.72, y0 + 0.9, 0),
        new Vector3(3.48, y0 + 1.45, 0),
        new Vector3(3.3, y0 + 1.6, 0),
        new Vector3(0, y0 + 1.64, 0),
      ],
      tessellation: 96,
    },
    scene,
  );
  pudding.material = mats.plain('#efb64a', { roughness: 0.3, clearCoat: 0.7, translucency: 0.5 });
  casters.push(pudding);
  const caramel = CreateLathe(
    'karamell',
    {
      shape: [
        new Vector3(0, y0 + 1.64, 0),
        new Vector3(3.32, y0 + 1.6, 0),
        new Vector3(3.44, y0 + 1.42, 0),
        new Vector3(3.38, y0 + 1.3, 0),
        new Vector3(3.2, y0 + 1.6, 0),
        new Vector3(0, y0 + 1.69, 0),
      ],
      tessellation: 96,
    },
    scene,
  );
  caramel.material = mats.plain('#a65a22', { roughness: 0.1, clearCoat: 1, translucency: 0.3 });
  casters.push(caramel);
  const cream = CreateLathe(
    'sahne',
    {
      shape: [
        new Vector3(0, y0 + 1.68, 0),
        new Vector3(0.8, y0 + 1.68, 0),
        new Vector3(0.74, y0 + 1.92, 0),
        new Vector3(0.52, y0 + 2.08, 0),
        new Vector3(0.36, y0 + 2.32, 0),
        new Vector3(0.12, y0 + 2.52, 0),
        new Vector3(0, y0 + 2.58, 0),
      ],
      tessellation: 64,
    },
    scene,
  );
  displace(cream, 0.04, 6, 3);
  cream.material = mats.plain('#fbf7ef', { roughness: 0.55, translucency: 0.6 });
  casters.push(cream);
  const cherry = CreateSphere('kirsche', { diameter: 0.62, segments: 32 }, scene);
  cherry.position.set(0, y0 + 2.78, 0);
  cherry.material = mats.plain('#b3122c', { roughness: 0.15, clearCoat: 1, translucency: 0.3 });
  casters.push(cherry);
  const stem = CreateCylinder(
    'stiel',
    { diameterTop: 0.03, diameterBottom: 0.05, height: 0.7, tessellation: 8 },
    scene,
  );
  stem.position.set(0.12, y0 + 3.25, 0);
  stem.rotation.z = -0.35;
  stem.material = mats.plain('#5c6b2a', { roughness: 0.7 });
  casters.push(stem);
  const spoon = new TransformNode('loeffel', scene);
  spoon.position.set(-1.8, y0 + 2.2, -0.6);
  spoon.rotation.y = 0.6;
  spoon.rotation.z = 0.12;
  const silver = mats.plain('#d9dde2', { metallic: 1, roughness: 0.18 });
  const handle = CreateCylinder('griff', { diameter: 0.22, height: 4.2, tessellation: 24 }, scene);
  handle.rotation.z = Math.PI / 2;
  handle.material = silver;
  handle.parent = spoon;
  casters.push(handle);
  const bowl = CreateSphere('kelle', { diameter: 1.1, segments: 32 }, scene);
  bowl.position.x = 2.4;
  bowl.scaling.set(1.2, 0.32, 0.9);
  bowl.material = silver;
  bowl.parent = spoon;
  casters.push(bowl);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 6.4 + rnd() * 0.6;
    const berry = CreateSphere('beere', { diameter: 0.5, segments: 24 }, scene);
    berry.position.set(
      Math.cos(a) * r,
      terrain.height(Math.cos(a) * r, Math.sin(a) * r) + 0.27,
      Math.sin(a) * r,
    );
    berry.material = mats.plain(i % 3 === 0 ? '#3b2a6b' : '#b3122c', {
      roughness: 0.2,
      clearCoat: 1,
    });
    casters.push(berry);
  }

  // Bäume rundum (Hintergrund), Gras außerhalb der Decke.
  for (const [x, z, s] of [
    [-8, 5, 1.0],
    [-3, 7.2, 1.15],
    [3.4, 7.0, 0.95],
    [8.2, 4.6, 1.05],
    [-9, -1, 0.85],
    [9.2, 0, 0.8],
  ] as const) {
    tree(scene, mats, new Vector3(x, terrain.height(x, z) - 0.05, z), s, rnd, casters);
  }
  const blanketAvoid = (x: number, z: number): boolean => {
    const c = Math.cos(-0.3);
    const s = Math.sin(-0.3);
    const lx = x * c - z * s;
    const lz = x * s + z * c;
    return Math.abs(lx) < 6.6 && Math.abs(lz) < 6.6;
  };
  // Laternen an den hinteren Ecken der Decke und seitlich.
  const lanternSpots = (
    [
      [-7.6, 3.6],
      [7.4, 3.2],
      [-8.2, -3.6],
      [8.0, -3.0],
    ] as const
  ).map(([x, z]) =>
    lantern(
      scene,
      mats,
      new Vector3(x, terrain.height(x, z) - 0.03, z),
      x < 0 ? 0 : Math.PI,
      casters,
    ),
  );
  scatterGrass(scene, terrain, 26000, blanketAvoid, mood.grassTip, rnd);

  const spots = [0, 1, 2, 3].map((i) => {
    const a = -Math.PI / 2 + (i - 1.5) * 0.62;
    return new Vector3(Math.cos(a) * 2.2, y0 + 1.66, Math.sin(a) * 2.2);
  });
  return Promise.resolve({
    casters,
    tiles: [],
    spots,
    material: (hex) => mats.plain(hex, { roughness: 0.5, clearCoat: 0.25, glow }),
    light: (camera, extra, focusDistance) =>
      lightScene(scene, camera, mood, [...casters, ...extra], focusDistance, lanternSpots, terrain),
  });
}
