/**
 * Natur-Look für Minispiele (CHAOS-62): erfüllt `MinigameLook` aus dem minigame-sdk. Das
 * Minispiel nennt in `prepare` seine Spielfläche (`backdrop`), der Host baut drumherum eine
 * kleine Insel mit Wiese oder Picknickdecke, Gras, Bäumen, Blumen und Laternen. Nach
 * `prepare` (Kamera steht) setzt `finish` Licht, Himmel und Nachbearbeitung der Stimmung.
 *
 * Materialien aus `material()` gehören dem Minispiel (es entsorgt sie selbst); alles aus
 * `backdrop()` gehört der Bühne und verschwindet mit der Szene.
 */
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type {
  LookArea,
  LookMaterialOptions,
  MinigameLook,
} from '@chaos-party/minigame-sdk/babylon';
import {
  buildIsland,
  flowers,
  lantern,
  pine,
  rock,
  scatterGrass,
  StaticBatch,
  tree,
  type Grass,
} from '../nature/geometry.ts';
import { applyNatureLook, type NatureLook } from '../nature/lighting.ts';
import { NatureMaterials, type PlainOptions } from '../nature/materials.ts';
import { fbm, seeded } from '../nature/noise.ts';
import { QUALITY } from '../nature/quality.ts';
import type { LookSettings } from '../nature/settings.ts';
import { createTerrain, type Terrain } from '../nature/terrain.ts';

/**
 * Höchstzahl fester Schritte je Bild bei Software-Rendering (4 s Spielzeit): Ein Bild dauert
 * dort 0,5–3 s (je nach Last); so bleibt die Minispiel-Uhr bei der echten Zeit und das
 * Ergebnis kommt rechtzeitig beim Server an (Frist: Spielzeit + 15 s).
 */
export const SOFTWARE_MAX_STEPS = 240;

/** Halme bei Grafikstufe `hoch` (kleinere Insel als das Brett). */
export const MINIGAME_GRASS = 30000;

export interface HostMinigameLook extends MinigameLook {
  /**
   * Nach `prepare`: Licht, Himmel, Nachbearbeitung. Hat das Minispiel keine Kulisse bestellt
   * (`backdrop`), bringt es sein eigenes Licht mit – dann bleibt alles, wie es ist (`null`).
   */
  finish(camera: Camera): Promise<NatureLook | null>;
  /** Figur oder Requisit wirft Schatten. */
  addCaster(mesh: AbstractMesh): void;
  /** Je Bild (Glühwürmchen). */
  update(seconds: number): void;
  readonly settings: LookSettings;
}

function plainOptions(options: LookMaterialOptions): PlainOptions {
  const glow = (options.emissive ?? 0) * 0.5;
  const base: PlainOptions = {
    ...(glow > 0 ? { glow } : {}),
    ...(options.alpha !== undefined ? { alpha: options.alpha } : {}),
    ...(options.translucency ? { translucency: options.translucency } : {}),
  };
  switch (options.finish ?? 'lack') {
    case 'matt':
      return { ...base, roughness: 0.85 };
    case 'glanz':
      return { ...base, roughness: 0.15, clearCoat: 0.9 };
    case 'metall':
      return { ...base, roughness: 0.25, metallic: 1 };
    case 'stoff':
      return { ...base, roughness: 0.95 };
    case 'lack':
      return { ...base, roughness: 0.4, clearCoat: 0.35 };
  }
}

/** Picknickdecke mit Karomuster (prozedural, aus der Vitrine). */
function blanketTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('decke', { width: 512, height: 512 }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
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

export function createMinigameLook(scene: Scene, settings: LookSettings): HostMinigameLook {
  const quality = QUALITY[settings.quality];
  const mats = new NatureMaterials(scene, {
    reflections: quality.environment,
    detail: quality.materialDetail,
  });
  const casters = new Set<AbstractMesh>();
  const own = new Set<AbstractMesh>();
  let world: {
    terrain: Terrain;
    grass: Grass;
    lanterns: { light: Vector3; glass: Mesh }[];
  } | null = null;
  let lighting: NatureLook | null = null;

  const backdrop = (area: LookArea): void => {
    if (world) return;
    const rnd = seeded(7);
    const groundY = area.groundY ?? 0;
    const shape = {
      centerX: 0,
      centerZ: 2,
      halfX: area.halfX + 10,
      halfZ: area.halfZ + 9,
      squareness: 3,
    };
    const terrain = createTerrain({
      shape,
      flats: [{ x: 0, z: 0, radius: Math.hypot(area.halfX, area.halfZ) + 0.6, blend: 2 }],
      baseY: groundY,
      relief: 0.4,
    });
    const before = new Set(scene.meshes);
    buildIsland(scene, mats, terrain, { subdivisions: 120 });
    const blanketHalf = Math.max(area.halfX, area.halfZ) + 2;
    const turn = 0.3;
    const onBlanket = (x: number, z: number, margin: number): boolean => {
      if ((area.surface ?? 'wiese') !== 'decke') return false;
      const lx = x * Math.cos(turn) - z * Math.sin(turn);
      const lz = x * Math.sin(turn) + z * Math.cos(turn);
      return Math.abs(lx) < blanketHalf + margin && Math.abs(lz) < blanketHalf + margin;
    };
    const inArea = (x: number, z: number, margin: number): boolean =>
      (Math.abs(x) < area.halfX + margin && Math.abs(z) < area.halfZ + margin) ||
      onBlanket(x, z, margin);

    if ((area.surface ?? 'wiese') === 'decke') {
      const size = blanketHalf * 2;
      const blanket = CreateGround('decke', { width: size, height: size, subdivisions: 40 }, scene);
      const pos = blanket.getVerticesData(VertexBuffer.PositionKind) ?? [];
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i] ?? 0;
        const z = pos[i + 2] ?? 0;
        const wx = x * Math.cos(turn) + z * Math.sin(turn);
        const wz = -x * Math.sin(turn) + z * Math.cos(turn);
        pos[i + 1] = terrain.height(wx, wz) + 0.04 + (fbm(x * 0.5, 1, z * 0.5) - 0.5) * 0.06;
      }
      blanket.setVerticesData(VertexBuffer.PositionKind, pos);
      const normals: number[] = [];
      VertexData.ComputeNormals(pos, blanket.getIndices() ?? [], normals);
      blanket.setVerticesData(VertexBuffer.NormalKind, normals);
      blanket.rotation.y = turn;
      const cloth = new PBRMaterial('decke', scene);
      cloth.albedoTexture = blanketTexture(scene);
      cloth.roughness = 0.9;
      cloth.metallic = 0;
      cloth.sheen.isEnabled = true;
      cloth.sheen.intensity = 0.4;
      blanket.material = cloth;
      blanket.receiveShadows = true;
      blanket.isPickable = false;
    }

    // Bäume hinten und seitlich (Kameras blicken von −z), nie vor der Spielfläche.
    const statics = new StaticBatch('kulisse');
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rnd() * 0.2;
      if (Math.sin(a) < -0.2) continue;
      const r = terrain.rim(a) - 1.6 - rnd() * 1.4;
      const x = shape.centerX + Math.cos(a) * r;
      const z = shape.centerZ + Math.sin(a) * r;
      if (inArea(x, z, 2.5)) continue;
      const at = new Vector3(x, terrain.height(x, z) - 0.05, z);
      const node =
        rnd() < 0.55
          ? tree(scene, mats, at, 0.9 + rnd() * 0.3, rnd)
          : pine(scene, mats, at, 0.9 + rnd() * 0.3, rnd);
      for (const mesh of node.getChildMeshes()) casters.add(mesh);
    }
    for (let i = 0; i < 8; i++) {
      const a = rnd() * Math.PI * 2;
      const r = terrain.rim(a) - 1 - rnd() * 2;
      const x = Math.cos(a) * r;
      const z = shape.centerZ + Math.sin(a) * r;
      if (inArea(x, z, 1.5)) continue;
      rock(scene, mats, new Vector3(x, terrain.height(x, z), z), 0.3 + rnd() * 0.35, rnd, statics);
    }
    const lanterns: { light: Vector3; glass: Mesh }[] = [];
    for (const [sx, sz] of [
      [-1, 1],
      [1, 1],
      [-1, -0.4],
      [1, -0.4],
    ] as const) {
      const x = sx * (area.halfX + 1.6);
      const z = sz * (area.halfZ + 1.2);
      const yaw = sx < 0 ? 0 : Math.PI;
      lanterns.push(
        lantern(scene, mats, new Vector3(x, terrain.height(x, z) - 0.03, z), yaw, statics),
      );
    }
    const spots: Vector3[] = [];
    for (let i = 0; i < 90; i++) {
      const x = (rnd() * 2 - 1) * shape.halfX * 0.9;
      const z = shape.centerZ + (rnd() * 2 - 1) * shape.halfZ * 0.9;
      if (!terrain.inside(x, z, 0.8) || inArea(x, z, 0.8)) continue;
      spots.push(new Vector3(x, terrain.height(x, z) - 0.02, z));
    }
    flowers(scene, mats, spots, rnd);
    for (const mesh of statics.flush()) casters.add(mesh);
    for (const l of lanterns) casters.add(l.glass);

    const grass = scatterGrass(scene, terrain, {
      count: MINIGAME_GRASS,
      avoid: (x, z) => inArea(x, z, 0.3),
      tipHex: settings.mood.grassTip,
      rnd,
    });
    for (const mesh of scene.meshes) if (!before.has(mesh)) own.add(mesh);
    world = { terrain, grass, lanterns };
  };

  return {
    settings,
    material(hex, options = {}) {
      return mats.fresh(hex, plainOptions(options), `look-${hex}`);
    },
    backdrop,
    addCaster(mesh) {
      casters.add(mesh);
      lighting?.addCaster(mesh);
    },
    async finish(camera) {
      if (!world) return null;
      // Schärfe auf den Blickpunkt (Arc-Rotate- und Free-Kamera sind beide TargetCameras).
      const aim = (camera as Partial<{ getTarget(): Vector3 }>).getTarget;
      const target = typeof aim === 'function' ? aim.call(camera) : Vector3.Zero();
      // Vor dem ersten Bild ist `globalPosition` einer Free-Kamera noch nicht berechnet.
      camera.computeWorldMatrix();
      const distance = Vector3.Distance(camera.globalPosition, target);
      const lit = await applyNatureLook(scene, camera, {
        mood: settings.mood,
        quality: settings.quality,
        // Minispiele: Spielfläche komplett scharf, nur Bäume und Horizont werden weich.
        focus: { distance, fStop: 10 },
        viewDistance: distance,
        lanterns: world.lanterns,
        terrain: world.terrain,
        grass: world.grass,
      });
      lighting = lit;
      // Schatten: alles Sichtbare des Minispiels (ohne Kulisse) plus Bäume und Requisiten.
      for (const mesh of scene.meshes) {
        if (own.has(mesh) || !mesh.isVisible || !mesh.isEnabled()) continue;
        if (mesh.skeleton) continue; // Figuren werfen über ihren Schattenkörper
        casters.add(mesh);
        if (mesh.getClassName() !== 'InstancedMesh') mesh.receiveShadows = true;
      }
      for (const mesh of casters) lit.addCaster(mesh);
      return lit;
    },
    update(seconds) {
      lighting?.update(seconds);
    },
  };
}
