/**
 * Slot-Kennzeichen an Figuren (aus Sockenregen, Kuckucks-Klatsche und Krümel-Kehraus
 * herausgelöst): flaches Slot-Symbol (● ▲ ■ ★), schwebendes Abzeichen mit Symbol, Ring in
 * Slot-Farbe am Boden und kreisende Sterne bei Benommenheit. Farbe **und** Form, damit es auch
 * ohne Farbsehen lesbar bleibt (M1).
 */
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { MinigamePlayer } from '@chaos-party/minigame-sdk/babylon';
import { markVisual } from '@chaos-party/minigame-sdk/babylon';
import type { MinigameStage } from './stage.ts';

/** Gelb der Benommenheits-Sterne. */
export const STAR_COLOR = '#ffe14d';

/** Flaches Slot-Symbol (● ▲ ■ ★) als Mesh in der x/y-Ebene, Blick −z. */
export function symbolMesh(scene: Scene, name: string, symbol: string, radius = 0.26): Mesh {
  const outline: [number, number][] = [];
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
  // Fächer um die Mitte (alle Formen sind sternförmig um den Ursprung).
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

/**
 * Schwebendes Abzeichen über der Figur: weiße Scheibe mit Slot-Symbol, immer zur Kamera
 * gedreht (Rolle `abzeichen`, Schlüssel = Slot). Position setzt das Spiel.
 */
export function createSlotBadge(stage: MinigameStage, player: MinigamePlayer): TransformNode {
  const { scene } = stage;
  const slot = player.slot;
  const badge = stage.track(new TransformNode(stage.name('abzeichen', slot), scene));
  markVisual(badge, 'abzeichen', slot);
  badge.billboardMode = TransformNode.BILLBOARDMODE_ALL;
  const plate = stage.track(
    CreateDisc(stage.name('abzeichen-platte', slot), { radius: 0.36, tessellation: 32 }, scene),
  );
  plate.parent = badge;
  plate.material = stage.material('#ffffff', { emissive: 0.6 });
  const symbol = stage.track(symbolMesh(scene, stage.name('symbol', slot), player.symbol));
  symbol.parent = badge;
  symbol.position.z = -0.01;
  symbol.material = stage.material(player.color, { emissive: 0.5 });
  plate.material.backFaceCulling = false;
  symbol.material.backFaceCulling = false;
  return badge;
}

/**
 * Ring in Slot-Farbe am Boden mit halbdurchsichtigem Fleck darin (Reichweite, Fangkreis).
 * Liefert den Ring; der Fleck hängt daran.
 */
export async function createSlotRing(
  stage: MinigameStage,
  player: MinigamePlayer,
  radius: number,
  role = 'spielerring',
): Promise<Mesh> {
  const { scene } = stage;
  const slot = player.slot;
  const ring = stage.track(
    CreateTorus(
      stage.name('ring', slot),
      { diameter: radius * 2, thickness: 0.16, tessellation: 32 },
      scene,
    ),
  );
  markVisual(ring, role, slot);
  ring.material = stage.material(player.color, { emissive: 0.2 });
  await stage.pace();
  const spot = stage.track(
    CreateDisc(stage.name('fleck', slot), { radius, tessellation: 40 }, scene),
  );
  spot.rotation.x = Math.PI / 2;
  spot.parent = ring;
  spot.material = stage.material(player.color, { emissive: 0.3, alpha: 0.45 });
  return ring;
}

/** Drei kreisende Sterne über einer benommenen Figur (Rolle `sterne`), anfangs aus. */
export function createStunStars(stage: MinigameStage, player: MinigamePlayer): TransformNode {
  const { scene } = stage;
  const slot = player.slot;
  const stars = stage.track(new TransformNode(stage.name('sterne', slot), scene));
  for (let index = 0; index < 3; index++) {
    const star = stage.track(
      CreateSphere(stage.name('stern', slot, index), { diameter: 0.28, segments: 6 }, scene),
    );
    star.parent = stars;
    const a = (index / 3) * Math.PI * 2;
    star.position.set(Math.cos(a) * 0.55, 0.15 * index, Math.sin(a) * 0.55);
    star.material = stage.material(STAR_COLOR, { emissive: 0.6 });
  }
  markVisual(stars, 'sterne', slot);
  stars.setEnabled(false);
  return stars;
}
