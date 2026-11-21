/**
 * Kulisse des Rummelplatzes (CHAOS-199): Karussell in der Mitte (Drehteil mit Ausfahrt-Tor,
 * zeigt auf den Ausgang der Runde), Riesenrad hinten rechts am Riesenradweg, Portale und
 * Gespenster an der Geisterbahn, Losbuden an der Losbudengasse, Spiegelkabinett, Zuckerwatte-
 * Stände und Lichterketten. Alles prozedural aus Grundkörpern, keine fremden Assets
 * (Art-Direction: `docs/art-direction.md`, Abschnitt „Rummelplatz“).
 *
 * Lagen kommen aus der `BoardDefinition` (Felder mit Wegweiser, Karussell aus `rotations`), damit
 * kleine Layout-Änderungen die Deko mitnehmen. Drehende Teile hängen an benannten Knoten
 * (`CAROUSEL_NODE`, `WHEEL_NODE` aus `./rides.ts`); der Apple-Host findet sie im USDZ wieder.
 * Glühbirnen sind unbeleuchtete Kugeln: Nachts leuchten sie über das Bloom der Nachbearbeitung.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { BoardDefinition, BoardSpace } from '@chaos-party/game-core';
import { StaticBatch } from '../nature/geometry.ts';
import type { NatureMaterials } from '../nature/materials.ts';
import type { Terrain } from '../nature/terrain.ts';
import type { Point2 } from './layout.ts';
import { CAROUSEL_NODE, WHEEL_NODE } from './rides.ts';

/** Jahrmarkt-Farben (kräftig, aber wie die Feld-Einlagen leicht gedeckt). */
export const FAIR_COLORS = {
  red: '#d9443b',
  yellow: '#f2c14e',
  teal: '#2aa69a',
  purple: '#7a4cc2',
  pink: '#f08bb8',
  cream: '#f6efe2',
  wood: '#8a5a3b',
  night: '#2a2238',
} as const;

const BULB_COLORS = ['#ffd27a', '#ff8a7a', '#8fe3ff', '#c9a3ff', '#ffe9a8'] as const;

export interface FairgroundWorld {
  /** Drehteil des Karussells (`rotation.y`) oder `null` ohne Karussell. */
  readonly carousel: TransformNode | null;
  /** Riesenrad (`rotation.z`). */
  readonly wheel: TransformNode;
  /** Schattenwerfer. */
  readonly casters: readonly Mesh[];
}

export interface FairgroundOptions {
  readonly mats: NatureMaterials;
  readonly terrain: Terrain;
  readonly rnd: () => number;
}

/**
 * Felder ab dem ersten Feld mit Wegweiser `label` bis zur nächsten Gabel oder Zusammenführung.
 * Mit `keep` laufen Zusammenführungen durch; der Weg endet am ersten Feld, das `keep` ablehnt.
 */
function routeFrom(
  board: BoardDefinition,
  label: string,
  keep?: (space: BoardSpace, first: BoardSpace) => boolean,
): BoardSpace[] {
  const byId = new Map(board.spaces.map((s) => [s.id, s]));
  const incoming = new Map<string, number>();
  for (const s of board.spaces) for (const n of s.next) incoming.set(n, (incoming.get(n) ?? 0) + 1);
  const start = board.spaces.find((s) => s.label === label);
  const route: BoardSpace[] = [];
  let current = start;
  while (current && start && route.length < 14 && !route.includes(current)) {
    route.push(current);
    const next = current.next.length === 1 ? byId.get(current.next[0] ?? '') : undefined;
    if (!next) break;
    if (keep ? !keep(next, start) : (incoming.get(next.id) ?? 0) > 1 || next.label) break;
    current = next;
  }
  return route;
}

/** Glühbirnen entlang eines durchhängenden Kabels von `a` nach `b` (Höhen `ya`, `yb`). */
function bulbChain(
  scene: Scene,
  mats: NatureMaterials,
  batch: StaticBatch,
  a: Vector3,
  b: Vector3,
  sag: number,
  spacing: number,
  phase: number,
): void {
  const length = Vector3.Distance(a, b);
  const count = Math.max(2, Math.round(length / spacing));
  const wire = mats.plain('#1d1a22', { roughness: 0.6 });
  let previous: Vector3 | null = null;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = Vector3.Lerp(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    if (previous) {
      const mid = Vector3.Lerp(previous, p, 0.5);
      const segment = CreateCylinder(
        'lichterkette-kabel',
        { diameter: 0.025, height: Vector3.Distance(previous, p), tessellation: 3 },
        scene,
      );
      segment.position = mid;
      const dir = p.subtract(previous).normalize();
      // Zylinder steht entlang y: auf die Kabelrichtung kippen.
      const axis = Vector3.Cross(Vector3.Up(), dir);
      const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Up(), dir))));
      if (axis.lengthSquared() > 1e-6) segment.rotate(axis.normalize(), angle);
      batch.add(segment, wire);
    }
    if (i > 0 && i < count) {
      const bulb = CreateSphere('lichterkette-birne', { diameter: 0.16, segments: 4 }, scene);
      bulb.position.set(p.x, p.y - 0.08, p.z);
      const color = BULB_COLORS[(i + phase) % BULB_COLORS.length] ?? '#ffd27a';
      batch.add(bulb, mats.plain(color, { unlit: true }));
    }
    previous = p;
  }
}

/** Pfahl für Lichterketten; liefert den Aufhängepunkt oben. */
function pole(
  scene: Scene,
  mats: NatureMaterials,
  batch: StaticBatch,
  terrain: Terrain,
  x: number,
  z: number,
  height: number,
): Vector3 {
  const ground = terrain.height(x, z) - 0.05;
  const post = CreateCylinder(
    'lichterkette-mast',
    { diameter: 0.12, height, tessellation: 8 },
    scene,
  );
  post.position.set(x, ground + height / 2, z);
  batch.add(post, mats.plain(FAIR_COLORS.night, { roughness: 0.5, metallic: 0.4 }));
  const cap = CreateSphere('lichterkette-kappe', { diameter: 0.2, segments: 6 }, scene);
  cap.position.set(x, ground + height + 0.05, z);
  batch.add(cap, mats.plain(FAIR_COLORS.yellow, { metallic: 0.6, roughness: 0.3 }));
  return new Vector3(x, ground + height, z);
}

/** Gestreifter Ring (Baldachin) aus Kreissegmenten in zwei Farben. */
function stripedRing(
  scene: Scene,
  mats: NatureMaterials,
  batch: StaticBatch,
  center: Vector3,
  radius: number,
  y: number,
  segments: number,
): void {
  for (let i = 0; i < segments; i++) {
    const a = ((i + 0.5) / segments) * Math.PI * 2;
    const panel = CreateBox(
      'baldachin',
      { width: ((Math.PI * 2 * radius) / segments) * 1.04, height: 0.42, depth: 0.08 },
      scene,
    );
    panel.position.set(center.x + Math.sin(a) * radius, y, center.z + Math.cos(a) * radius);
    panel.rotation.y = a;
    batch.add(
      panel,
      mats.plain(i % 2 === 0 ? FAIR_COLORS.red : FAIR_COLORS.cream, { roughness: 0.6 }),
    );
  }
}

/**
 * Karussell: feste Plattform unter dem Feld, darauf der Drehteil mit Pferdchen, Stangen,
 * Baldachin-Ring und einem goldenen Ausfahrt-Tor (lokal +z). Der Drehteil liegt bei (0, 0, 0)
 * aufgebaut und wird erst nach dem Verschmelzen auf das Feld gesetzt (`StaticBatch.flush` backt
 * Weltkoordinaten).
 */
function buildCarousel(
  scene: Scene,
  mats: NatureMaterials,
  statics: StaticBatch,
  at: Point2,
): { node: TransformNode; casters: Mesh[] } {
  const platform = CreateCylinder(
    'karussell-plattform',
    { diameter: 3.6, height: 0.22, tessellation: 40 },
    scene,
  );
  platform.position.set(at.x, 0.11, at.z);
  statics.add(platform, mats.textured('brown_planks_05', { u: 1.5, v: 1.5, tint: '#c79a6b' }));
  const rim = CreateTorus(
    'karussell-rand',
    { diameter: 3.6, thickness: 0.12, tessellation: 40 },
    scene,
  );
  rim.position.set(at.x, 0.2, at.z);
  statics.add(rim, mats.plain(FAIR_COLORS.yellow, { metallic: 0.7, roughness: 0.3 }));

  const node = new TransformNode(CAROUSEL_NODE, scene);
  const batch = new StaticBatch('karussell');
  const brass = mats.plain('#d8b25a', { metallic: 0.9, roughness: 0.25 });
  const horses = [FAIR_COLORS.cream, FAIR_COLORS.teal, FAIR_COLORS.pink, FAIR_COLORS.yellow];
  const count = 6;
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5) / count) * Math.PI * 2;
    const x = Math.sin(a) * 1.4;
    const z = Math.cos(a) * 1.4;
    const rod = CreateCylinder(
      'karussell-stange',
      { diameter: 0.07, height: 2.2, tessellation: 8 },
      scene,
    );
    rod.position.set(x, 1.3, z);
    batch.add(rod, brass);
    // Pferdchen: Rumpf, Hals, Kopf, quer zur Fahrtrichtung.
    const color = mats.plain(horses[i % horses.length] ?? FAIR_COLORS.cream, {
      roughness: 0.35,
      clearCoat: 0.6,
    });
    const body = CreateBox('karussell-pferd', { width: 0.26, height: 0.3, depth: 0.7 }, scene);
    body.position.set(x, 0.85 + (i % 2) * 0.18, z);
    body.rotation.y = a + Math.PI / 2;
    batch.add(body, color);
    const head = CreateBox('karussell-kopf', { width: 0.2, height: 0.34, depth: 0.22 }, scene);
    const fx = Math.sin(a + Math.PI / 2) * 0.32;
    const fz = Math.cos(a + Math.PI / 2) * 0.32;
    head.position.set(x + fx, 1.1 + (i % 2) * 0.18, z + fz);
    head.rotation.y = a + Math.PI / 2;
    batch.add(head, color);
  }
  stripedRing(scene, mats, batch, Vector3.Zero(), 1.45, 2.45, 16);
  const crown = CreateTorus(
    'karussell-krone',
    { diameter: 2.9, thickness: 0.1, tessellation: 32 },
    scene,
  );
  crown.position.y = 2.68;
  batch.add(crown, brass);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const bulb = CreateSphere('karussell-birne', { diameter: 0.13, segments: 4 }, scene);
    bulb.position.set(Math.sin(a) * 1.45, 2.2, Math.cos(a) * 1.45);
    batch.add(bulb, mats.plain(BULB_COLORS[i % BULB_COLORS.length] ?? '#ffd27a', { unlit: true }));
  }
  // Ausfahrt-Tor (lokal +z): zwei Pfosten, Bogen, Pfeil und helle Birnen.
  const gold = mats.plain('#f2c14e', { metallic: 0.8, roughness: 0.25, glow: 0.25 });
  for (const side of [-1, 1]) {
    const post = CreateBox(
      'karussell-tor-pfosten',
      { width: 0.14, height: 1.6, depth: 0.14 },
      scene,
    );
    post.position.set(side * 0.62, 0.95, 1.92);
    batch.add(post, gold);
  }
  const lintel = CreateBox(
    'karussell-tor-balken',
    { width: 1.42, height: 0.16, depth: 0.16 },
    scene,
  );
  lintel.position.set(0, 1.78, 1.92);
  batch.add(lintel, gold);
  const arrow = CreateCylinder(
    'karussell-tor-pfeil',
    { diameterTop: 0, diameterBottom: 0.5, height: 0.55, tessellation: 3 },
    scene,
  );
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 2.45, 2.0);
  batch.add(arrow, mats.plain(FAIR_COLORS.red, { roughness: 0.4, glow: 0.35 }));
  for (let i = 0; i < 7; i++) {
    const bulb = CreateSphere('karussell-tor-birne', { diameter: 0.12, segments: 4 }, scene);
    bulb.position.set(-0.6 + i * 0.2, 1.9, 1.82);
    batch.add(bulb, mats.plain('#fff2b0', { unlit: true }));
  }
  const casters = batch.flush(node);
  node.position.set(at.x, 0.2, at.z);
  return { node, casters };
}

/**
 * Riesenrad: zwei Ringe mit Speichen und Gondeln (dreht um z, Knoten `WHEEL_NODE`), dazu das
 * feste Gestell. Steht hinten am Brettrand und verdeckt keine Felder.
 */
function buildWheel(
  scene: Scene,
  mats: NatureMaterials,
  statics: StaticBatch,
  terrain: Terrain,
  at: Point2,
): { node: TransformNode; casters: Mesh[] } {
  const radius = 4.2;
  const hub = 5.0;
  const ground = terrain.height(at.x, at.z) - 0.05;
  const steel = mats.plain('#e8e2d6', { metallic: 0.5, roughness: 0.35 });
  // Gestell: zwei A-Böcke vor und hinter dem Rad.
  for (const dz of [-0.55, 0.55]) {
    for (const side of [-1, 1]) {
      const leg = CreateCylinder(
        'riesenrad-bein',
        { diameter: 0.2, height: 5.6, tessellation: 8 },
        scene,
      );
      leg.position.set(at.x + side * 1.3, ground + hub / 2, at.z + dz);
      leg.rotation.z = side * 0.27;
      statics.add(leg, steel);
    }
  }
  const node = new TransformNode(WHEEL_NODE, scene);
  const batch = new StaticBatch('riesenrad');
  for (const dz of [-0.4, 0.4]) {
    const ring = CreateTorus(
      'riesenrad-ring',
      { diameter: radius * 2, thickness: 0.14, tessellation: 48 },
      scene,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.z = dz;
    batch.add(ring, steel);
  }
  const spokes = 12;
  const gondolas = [FAIR_COLORS.red, FAIR_COLORS.yellow, FAIR_COLORS.teal, FAIR_COLORS.purple];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const spoke = CreateCylinder(
      'riesenrad-speiche',
      { diameter: 0.07, height: radius, tessellation: 5 },
      scene,
    );
    spoke.rotation.z = a;
    spoke.position.set((-Math.sin(a) * radius) / 2, (Math.cos(a) * radius) / 2, 0);
    batch.add(spoke, steel);
    const gondola = CreateCylinder(
      'riesenrad-gondel',
      { diameter: 0.7, height: 0.55, tessellation: 12 },
      scene,
    );
    gondola.position.set(-Math.sin(a) * radius, Math.cos(a) * radius - 0.35, 0);
    batch.add(
      gondola,
      mats.plain(gondolas[i % gondolas.length] ?? FAIR_COLORS.red, {
        roughness: 0.4,
        clearCoat: 0.5,
      }),
    );
    const bulb = CreateSphere('riesenrad-birne', { diameter: 0.18, segments: 4 }, scene);
    bulb.position.set(-Math.sin(a) * radius, Math.cos(a) * radius, -0.5);
    batch.add(bulb, mats.plain(BULB_COLORS[i % BULB_COLORS.length] ?? '#ffd27a', { unlit: true }));
  }
  const axle = CreateCylinder(
    'riesenrad-achse',
    { diameter: 0.5, height: 1.3, tessellation: 12 },
    scene,
  );
  axle.rotation.x = Math.PI / 2;
  batch.add(axle, mats.plain(FAIR_COLORS.yellow, { metallic: 0.8, roughness: 0.3 }));
  const casters = batch.flush(node);
  node.position.set(at.x, ground + hub, at.z);
  return { node, casters };
}

/** Portal der Geisterbahn: dunkler Rahmen, Giebel, zwei leuchtende Augen. */
function ghostPortal(
  scene: Scene,
  mats: NatureMaterials,
  statics: StaticBatch,
  at: Point2,
  yaw: number,
): void {
  const dark = mats.plain('#2b2236', { roughness: 0.8 });
  const trim = mats.plain(FAIR_COLORS.purple, { roughness: 0.5, glow: 0.4 });
  const place = (mesh: Mesh, x: number, y: number, z: number): void => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    mesh.position.set(at.x + x * c + z * s, y, at.z - x * s + z * c);
    mesh.rotation.y = yaw;
  };
  for (const side of [-1, 1]) {
    const tower = CreateBox('geisterbahn-turm', { width: 0.5, height: 2.6, depth: 0.6 }, scene);
    place(tower, side * 1.15, 1.3, 0);
    statics.add(tower, dark);
  }
  const lintel = CreateBox('geisterbahn-giebel', { width: 2.8, height: 0.6, depth: 0.62 }, scene);
  place(lintel, 0, 2.75, 0);
  statics.add(lintel, dark);
  const edge = CreateBox('geisterbahn-kante', { width: 2.9, height: 0.1, depth: 0.66 }, scene);
  place(edge, 0, 2.45, 0);
  statics.add(edge, trim);
  for (const side of [-1, 1]) {
    const eye = CreateSphere('geisterbahn-auge', { diameter: 0.22, segments: 6 }, scene);
    place(eye, side * 0.4, 2.8, -0.34);
    statics.add(eye, mats.plain('#b7ff6a', { unlit: true }));
  }
}

/** Gespenst: weißer Tropfen mit dunklen Augen (schwebt neben der Geisterbahn). */
function ghost(
  scene: Scene,
  mats: NatureMaterials,
  statics: StaticBatch,
  x: number,
  y: number,
  z: number,
): void {
  const body = CreateSphere(
    'gespenst',
    { diameterX: 0.6, diameterY: 0.85, diameterZ: 0.6, segments: 8 },
    scene,
  );
  body.position.set(x, y, z);
  statics.add(body, mats.plain('#f4f1ff', { roughness: 0.6, glow: 0.35 }));
  for (const side of [-1, 1]) {
    const eye = CreateSphere('gespenst-auge', { diameter: 0.1, segments: 4 }, scene);
    eye.position.set(x + side * 0.12, y + 0.12, z - 0.27);
    statics.add(eye, mats.plain('#1b1530', { roughness: 0.5 }));
  }
}

/** Losbude: Theke, Pfosten, gestreiftes Vordach, Preise (Teddy-Kugeln) im Regal. */
function booth(
  scene: Scene,
  mats: NatureMaterials,
  statics: StaticBatch,
  terrain: Terrain,
  at: Point2,
  yaw: number,
  colors: readonly [string, string],
): void {
  const ground = terrain.height(at.x, at.z) - 0.05;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const place = (mesh: Mesh, x: number, y: number, z: number): void => {
    mesh.position.set(at.x + x * c + z * s, ground + y, at.z - x * s + z * c);
    mesh.rotation.y = yaw;
  };
  const wood = mats.textured('brown_planks_05', { u: 0.6, v: 0.3, tint: '#d8b894' });
  const counter = CreateBox('losbude-theke', { width: 1.8, height: 0.8, depth: 0.5 }, scene);
  place(counter, 0, 0.4, 0);
  statics.add(counter, wood);
  const back = CreateBox('losbude-wand', { width: 1.8, height: 1.9, depth: 0.1 }, scene);
  place(back, 0, 0.95, 0.75);
  statics.add(back, mats.plain(colors[1], { roughness: 0.7 }));
  for (const side of [-1, 1]) {
    const post = CreateBox('losbude-pfosten', { width: 0.1, height: 2.1, depth: 0.1 }, scene);
    place(post, side * 0.85, 1.05, -0.2);
    statics.add(post, wood);
  }
  for (let i = 0; i < 6; i++) {
    const stripe = CreateBox('losbude-dach', { width: 0.32, height: 0.06, depth: 1.25 }, scene);
    place(stripe, -0.8 + i * 0.32, 2.15, 0.25);
    stripe.rotation.x = -0.25;
    statics.add(
      stripe,
      mats.plain(i % 2 === 0 ? colors[0] : FAIR_COLORS.cream, { roughness: 0.6 }),
    );
  }
  const prizes = [FAIR_COLORS.pink, FAIR_COLORS.teal, FAIR_COLORS.yellow];
  for (let i = 0; i < 3; i++) {
    const teddy = CreateSphere('losbude-preis', { diameter: 0.3, segments: 6 }, scene);
    place(teddy, -0.5 + i * 0.5, 1.15, 0.62);
    statics.add(teddy, mats.plain(prizes[i] ?? FAIR_COLORS.pink, { roughness: 0.9 }));
  }
  const sign = CreateBox('losbude-schild', { width: 1.0, height: 0.32, depth: 0.06 }, scene);
  place(sign, 0, 2.45, -0.15);
  statics.add(sign, mats.plain(FAIR_COLORS.yellow, { roughness: 0.4, glow: 0.3 }));
}

/** Zuckerwatte-Stand: kleiner Wagen mit rosa Wolke. */
function cottonCandy(
  scene: Scene,
  mats: NatureMaterials,
  statics: StaticBatch,
  terrain: Terrain,
  at: Point2,
): void {
  const ground = terrain.height(at.x, at.z) - 0.05;
  const cart = CreateBox('zuckerwatte-wagen', { width: 1.1, height: 0.8, depth: 0.7 }, scene);
  cart.position.set(at.x, ground + 0.55, at.z);
  statics.add(cart, mats.plain(FAIR_COLORS.teal, { roughness: 0.4, clearCoat: 0.6 }));
  for (const side of [-1, 1]) {
    const wheel = CreateCylinder(
      'zuckerwatte-rad',
      { diameter: 0.34, height: 0.08, tessellation: 12 },
      scene,
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(at.x + side * 0.58, ground + 0.17, at.z);
    statics.add(wheel, mats.plain(FAIR_COLORS.night, { roughness: 0.6 }));
  }
  const cloud = CreateSphere('zuckerwatte', { diameter: 0.7, segments: 8 }, scene);
  cloud.position.set(at.x, ground + 1.3, at.z);
  statics.add(cloud, mats.plain(FAIR_COLORS.pink, { roughness: 1, translucency: 0.4, glow: 0.15 }));
  const stick = CreateCylinder(
    'zuckerwatte-stiel',
    { diameter: 0.05, height: 0.5, tessellation: 5 },
    scene,
  );
  stick.position.set(at.x, ground + 1.0, at.z);
  statics.add(stick, mats.plain(FAIR_COLORS.cream, { roughness: 0.6 }));
}

/** Spiegelkabinett: Pavillon mit spiegelnden Wänden und spitzem Dach. */
function mirrorHouse(
  scene: Scene,
  mats: NatureMaterials,
  statics: StaticBatch,
  terrain: Terrain,
  at: Point2,
): void {
  const ground = terrain.height(at.x, at.z) - 0.05;
  const mirror = mats.plain('#c9d6e6', { metallic: 1, roughness: 0.05 });
  const frame = mats.plain(FAIR_COLORS.purple, { roughness: 0.4, clearCoat: 0.5 });
  const sides = 6;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const wall = CreateBox('spiegel-wand', { width: 1.25, height: 1.8, depth: 0.08 }, scene);
    wall.position.set(at.x + Math.sin(a) * 1.05, ground + 0.95, at.z + Math.cos(a) * 1.05);
    wall.rotation.y = a;
    statics.add(wall, mirror);
  }
  const roof = CreateCylinder(
    'spiegel-dach',
    { diameterTop: 0, diameterBottom: 2.7, height: 1.2, tessellation: sides },
    scene,
  );
  roof.position.set(at.x, ground + 2.45, at.z);
  statics.add(roof, frame);
  const tip = CreateSphere('spiegel-spitze', { diameter: 0.22, segments: 6 }, scene);
  tip.position.set(at.x, ground + 3.1, at.z);
  statics.add(tip, mats.plain(FAIR_COLORS.yellow, { unlit: true }));
}

/** Autoscooter: flache Fahrfläche mit Bande und vier bunten Wagen (niedrig, verdeckt nichts). */
function bumperCars(
  scene: Scene,
  mats: NatureMaterials,
  statics: StaticBatch,
  terrain: Terrain,
  at: Point2,
  rnd: () => number,
): void {
  const ground = terrain.height(at.x, at.z) - 0.05;
  const width = 6.4;
  const depth = 4.2;
  const floor = CreateBox('autoscooter-boden', { width, height: 0.12, depth }, scene);
  floor.position.set(at.x, ground + 0.06, at.z);
  statics.add(floor, mats.plain('#3a3f4a', { metallic: 0.6, roughness: 0.35 }));
  const rail = mats.plain(FAIR_COLORS.yellow, { roughness: 0.4, glow: 0.2 });
  for (const [w, d, x, z] of [
    [width, 0.14, 0, -depth / 2],
    [width, 0.14, 0, depth / 2],
    [0.14, depth, -width / 2, 0],
    [0.14, depth, width / 2, 0],
  ] as const) {
    const side = CreateBox('autoscooter-bande', { width: w, height: 0.3, depth: d }, scene);
    side.position.set(at.x + x, ground + 0.25, at.z + z);
    statics.add(side, rail);
  }
  const colors = [FAIR_COLORS.red, FAIR_COLORS.teal, FAIR_COLORS.purple, FAIR_COLORS.pink];
  for (let i = 0; i < 4; i++) {
    const x = at.x + (rnd() - 0.5) * (width - 1.6);
    const z = at.z + (rnd() - 0.5) * (depth - 1.4);
    const yaw = rnd() * Math.PI * 2;
    const car = CreateBox('autoscooter-wagen', { width: 0.7, height: 0.32, depth: 1.0 }, scene);
    car.position.set(x, ground + 0.3, z);
    car.rotation.y = yaw;
    statics.add(car, mats.plain(colors[i] ?? FAIR_COLORS.red, { roughness: 0.3, clearCoat: 0.8 }));
    const bumper = CreateTorus(
      'autoscooter-puffer',
      { diameter: 1.1, thickness: 0.12, tessellation: 16 },
      scene,
    );
    bumper.scaling.set(0.75, 1, 1.05);
    bumper.position.set(x, ground + 0.2, z);
    bumper.rotation.y = yaw;
    statics.add(bumper, mats.plain(FAIR_COLORS.night, { roughness: 0.7 }));
    const rod = CreateCylinder(
      'autoscooter-stange',
      { diameter: 0.05, height: 1.4, tessellation: 5 },
      scene,
    );
    rod.position.set(x - Math.sin(yaw) * 0.35, ground + 1.0, z - Math.cos(yaw) * 0.35);
    statics.add(rod, mats.plain('#d8b25a', { metallic: 0.9, roughness: 0.3 }));
    const spark = CreateSphere('autoscooter-funke', { diameter: 0.12, segments: 4 }, scene);
    spark.position.set(rod.position.x, ground + 1.72, rod.position.z);
    statics.add(spark, mats.plain('#9fe8ff', { unlit: true }));
  }
}

/** Spitzes Zelt mit Streifen (Zirkus-Stil), Eingang zur Kamera. */
function tent(
  scene: Scene,
  mats: NatureMaterials,
  statics: StaticBatch,
  terrain: Terrain,
  at: Point2,
  radius: number,
  color: string,
): void {
  const ground = terrain.height(at.x, at.z) - 0.05;
  const sides = 12;
  for (let i = 0; i < sides; i++) {
    const a = ((i + 0.5) / sides) * Math.PI * 2;
    const wall = CreateBox(
      'zelt-wand',
      { width: ((Math.PI * 2 * radius) / sides) * 1.05, height: 1.1, depth: 0.06 },
      scene,
    );
    wall.position.set(at.x + Math.sin(a) * radius, ground + 0.55, at.z + Math.cos(a) * radius);
    wall.rotation.y = a;
    statics.add(wall, mats.plain(i % 2 === 0 ? color : FAIR_COLORS.cream, { roughness: 0.7 }));
  }
  const roof = CreateCylinder(
    'zelt-dach',
    { diameterTop: 0, diameterBottom: radius * 2.25, height: 1.5, tessellation: sides },
    scene,
  );
  roof.position.set(at.x, ground + 1.85, at.z);
  statics.add(roof, mats.plain(color, { roughness: 0.6 }));
  const flag = CreateBox('zelt-wimpel', { width: 0.4, height: 0.22, depth: 0.03 }, scene);
  flag.position.set(at.x + 0.22, ground + 2.85, at.z);
  statics.add(flag, mats.plain(FAIR_COLORS.yellow, { roughness: 0.5 }));
  const mast = CreateCylinder('zelt-mast', { diameter: 0.05, height: 0.6, tessellation: 5 }, scene);
  mast.position.set(at.x, ground + 2.75, at.z);
  statics.add(mast, mats.plain(FAIR_COLORS.wood, { roughness: 0.6 }));
}

/** „Hau den Lukas“: Sockel, hohe Skala mit Lämpchen, Glocke oben. */
function strengthTester(
  scene: Scene,
  mats: NatureMaterials,
  statics: StaticBatch,
  terrain: Terrain,
  at: Point2,
): void {
  const ground = terrain.height(at.x, at.z) - 0.05;
  const base = CreateBox('lukas-sockel', { width: 0.7, height: 0.3, depth: 0.7 }, scene);
  base.position.set(at.x, ground + 0.15, at.z);
  statics.add(base, mats.plain(FAIR_COLORS.red, { roughness: 0.5 }));
  const column = CreateBox('lukas-skala', { width: 0.32, height: 3.2, depth: 0.12 }, scene);
  column.position.set(at.x, ground + 1.9, at.z + 0.2);
  statics.add(column, mats.plain(FAIR_COLORS.cream, { roughness: 0.5 }));
  for (let i = 0; i < 8; i++) {
    const lamp = CreateSphere('lukas-lampe', { diameter: 0.14, segments: 4 }, scene);
    lamp.position.set(at.x, ground + 0.6 + i * 0.36, at.z + 0.1);
    statics.add(
      lamp,
      mats.plain(BULB_COLORS[i % BULB_COLORS.length] ?? '#ffd27a', { unlit: true }),
    );
  }
  const bell = CreateSphere('lukas-glocke', { diameter: 0.4, segments: 8, slice: 0.55 }, scene);
  bell.position.set(at.x, ground + 3.55, at.z + 0.2);
  statics.add(bell, mats.plain('#e9b949', { metallic: 1, roughness: 0.25 }));
}

/** Weg (Felder) nach außen versetzt: Abstand `distance` von der Brettmitte weg. */
function outward(p: Point2, center: Point2, distance: number): Point2 {
  const dx = p.x - center.x;
  const dz = p.z - center.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: p.x + (dx / len) * distance, z: p.z + (dz / len) * distance };
}

/**
 * Baut die Rummelplatz-Kulisse auf ein vorhandenes Gelände. `statics` sammelt feste Teile (der
 * Aufrufer verschmilzt sie), Drehteile verschmelzen hier unter ihrem Knoten.
 */
export function buildFairground(
  scene: Scene,
  board: BoardDefinition,
  statics: StaticBatch,
  options: FairgroundOptions,
): FairgroundWorld {
  const { mats, terrain, rnd } = options;
  const casters: Mesh[] = [];
  const center = { x: terrain.shape.centerX, z: terrain.shape.centerZ };
  const byId = new Map(board.spaces.map((s) => [s.id, s]));

  // Sägemehl-Platz unter dem Karussell und Karussell selbst.
  const rotation = board.rotations?.[0];
  const hub = rotation ? byId.get(rotation.space) : undefined;
  let carousel: TransformNode | null = null;
  if (hub) {
    const sawdust = CreateDisc('saegemehl', { radius: 3.1, tessellation: 40 }, scene);
    sawdust.rotation.x = Math.PI / 2;
    sawdust.position.set(
      hub.position.x,
      terrain.height(hub.position.x, hub.position.z) + 0.01,
      hub.position.z,
    );
    statics.add(sawdust, mats.plain('#b89566', { roughness: 0.95 }));
    const built = buildCarousel(scene, mats, statics, hub.position);
    carousel = built.node;
    casters.push(...built.casters);
  }

  // Riesenrad hinten rechts, hinter dem Riesenradweg.
  const wheelRoute = routeFrom(board, 'Riesenradweg');
  const wheelSpot = wheelRoute.at(-1)?.position ?? { x: center.x + 18, z: center.z + 8 };
  const wheel = buildWheel(scene, mats, statics, terrain, {
    x: Math.min(wheelSpot.x + 0.4, terrain.shape.centerX + terrain.shape.halfX - 4.6),
    z: Math.min(wheelSpot.z + 5.0, terrain.shape.centerZ + terrain.shape.halfZ - 1.4),
  });
  casters.push(...wheel.casters);

  // Geisterbahn: Portal vor dem ersten und hinter dem letzten Feld der Bahn (eine Spur mit
  // gleichem x), Gespenster und Grabsteine daneben.
  const ghostRoute = routeFrom(
    board,
    'Geisterbahn',
    (s, first) => Math.abs(s.position.x - first.position.x) < 1.6,
  );
  const first = ghostRoute[0];
  const last = ghostRoute.at(-1);
  const before = first
    ? board.spaces.find(
        (s) => s.next.includes(first.id) && s.label === undefined && s.next.length > 1,
      )
    : undefined;
  const after = last ? byId.get(last.next[0] ?? '') : undefined;
  const portal = (a: Point2, b: Point2): void => {
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    ghostPortal(scene, mats, statics, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, yaw);
  };
  if (first && last) {
    if (before) portal(before.position, first.position);
    if (after) portal(last.position, after.position);
    ghostRoute.forEach((s, i) => {
      if (i === 0 || i === ghostRoute.length - 1) return;
      const side = i % 2 === 0 ? -1.35 : 1.35;
      ghost(scene, mats, statics, s.position.x + side, 1.2 + rnd() * 0.5, s.position.z + 0.6);
      const stone = CreateBox('grabstein', { width: 0.45, height: 0.6, depth: 0.14 }, scene);
      stone.position.set(
        s.position.x - side,
        terrain.height(s.position.x - side, s.position.z) + 0.25,
        s.position.z - 0.5,
      );
      stone.rotation.z = (rnd() - 0.5) * 0.25;
      statics.add(stone, mats.textured('mossy_rock', { u: 0.4, v: 0.4, tint: '#8f8aa0' }));
    });
  }

  // Losbuden innen an der Losbudengasse, Theke zum Weg, Rücken zur Brettmitte.
  const lotRoute = routeFrom(board, 'Losbudengasse');
  const boothColors: readonly (readonly [string, string])[] = [
    [FAIR_COLORS.red, FAIR_COLORS.yellow],
    [FAIR_COLORS.teal, FAIR_COLORS.cream],
    [FAIR_COLORS.purple, FAIR_COLORS.pink],
    [FAIR_COLORS.red, FAIR_COLORS.teal],
  ];
  lotRoute.forEach((s, i) => {
    if (i % 3 !== 1) return;
    const p = outward(s.position, center, -2.5);
    if (!terrain.inside(p.x, p.z, 0.4)) return;
    const yaw = Math.atan2(center.x - p.x, center.z - p.z);
    const colors = boothColors[(i / 3) | 0] ?? [FAIR_COLORS.red, FAIR_COLORS.yellow];
    booth(scene, mats, statics, terrain, p, yaw, colors);
  });

  // Spiegelkabinett auf der freien Fläche oben links, neben dem Spiegelkabinett-Weg.
  const mirrorRoute = routeFrom(
    board,
    'Spiegelkabinett',
    (s, first) => Math.abs(s.position.x - first.position.x) < 1.6,
  );
  const mirrorTop = mirrorRoute[1];
  if (mirrorTop) {
    mirrorHouse(scene, mats, statics, terrain, {
      x: mirrorTop.position.x + 4.6,
      z: mirrorTop.position.z - 0.4,
    });
  }

  // Zuckerwatte-Stände hinter der Zuckerwattenallee (vom Betrachter weg).
  const candyRoute = routeFrom(board, 'Zuckerwattenallee');
  candyRoute.forEach((s, i) => {
    if (i % 3 !== 0) return;
    const p = { x: s.position.x + 0.9, z: s.position.z + 2.0 };
    if (terrain.inside(p.x, p.z, 0.8)) cottonCandy(scene, mats, statics, terrain, p);
  });

  // Freie Flächen zwischen den Wegen: Autoscooter unten links, Zelte und „Hau den Lukas“ unten
  // rechts, Zelt und Stände oben (alles abseits der Felder, niedrig vor der Kamera).
  const free = (p: Point2, radius: number): boolean =>
    terrain.inside(p.x, p.z, 0.8) &&
    !board.spaces.some((s) => Math.hypot(s.position.x - p.x, s.position.z - p.z) < radius + 0.9);
  const spots: [Point2, (p: Point2) => void, number][] = [
    [
      { x: center.x - 7.4, z: center.z - 6.2 },
      (p) => {
        bumperCars(scene, mats, statics, terrain, p, rnd);
      },
      2.4,
    ],
    [
      { x: center.x + 6.0, z: center.z - 5.6 },
      (p) => {
        tent(scene, mats, statics, terrain, p, 1.4, FAIR_COLORS.red);
      },
      1.5,
    ],
    [
      { x: center.x + 10.6, z: center.z - 7.0 },
      (p) => {
        tent(scene, mats, statics, terrain, p, 1.1, FAIR_COLORS.teal);
      },
      1.2,
    ],
    [
      { x: center.x + 9.6, z: center.z - 3.2 },
      (p) => {
        strengthTester(scene, mats, statics, terrain, p);
      },
      0.5,
    ],
    [
      { x: center.x + 9.4, z: center.z + 6.4 },
      (p) => {
        tent(scene, mats, statics, terrain, p, 1.5, FAIR_COLORS.purple);
      },
      1.6,
    ],
    [
      { x: center.x - 5.0, z: center.z + 7.6 },
      (p) => {
        tent(scene, mats, statics, terrain, p, 1.1, FAIR_COLORS.yellow);
      },
      1.2,
    ],
  ];
  for (const [p, build, radius] of spots) if (free(p, radius)) build(p);

  // Lichterketten: Masten im Kreis um das Karussell, Ketten vom Karussell zu den Masten und
  // reihum zwischen den Masten (hoch über den Figuren).
  if (hub) {
    const poles: Vector3[] = [];
    const ring = 7;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + 0.3;
      let x = hub.position.x + Math.sin(a) * 6.6;
      let z = hub.position.z + Math.cos(a) * 5.4;
      // Nicht auf ein Feld oder einen Weg stellen.
      for (
        let k = 0;
        k < 6 && board.spaces.some((s) => Math.hypot(s.position.x - x, s.position.z - z) < 1.3);
        k++
      ) {
        x += Math.sin(a + Math.PI / 2) * 0.7;
        z += Math.cos(a + Math.PI / 2) * 0.7;
      }
      poles.push(pole(scene, mats, statics, terrain, x, z, 4.2));
    }
    poles.forEach((p, i) => {
      // Vom Baldachin-Ring des Karussells (rund, dreht sich ohne sichtbaren Versatz) zum Mast.
      const dx = p.x - hub.position.x;
      const dz = p.z - hub.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const top = new Vector3(
        hub.position.x + (dx / len) * 1.5,
        2.95,
        hub.position.z + (dz / len) * 1.5,
      );
      bulbChain(scene, mats, statics, top, p, 0.25, 0.55, i);
      const next = poles[(i + 1) % poles.length];
      if (next) bulbChain(scene, mats, statics, p, next, 0.5, 0.6, i + 2);
    });
  }
  // Lichterkette entlang der hinteren Reihe (oben) zwischen Masten.
  const back = board.spaces
    .filter((s) => s.position.z > center.z + 10)
    .sort((a, b) => a.position.x - b.position.x);
  const backPoles: Vector3[] = [];
  for (let i = 0; i < back.length; i += 3) {
    const s = back[i];
    if (!s) continue;
    const x = s.position.x;
    const z = s.position.z + 1.5;
    if (!terrain.inside(x, z, 0.6)) continue;
    backPoles.push(pole(scene, mats, statics, terrain, x, z, 3.2));
  }
  for (let i = 0; i + 1 < backPoles.length; i++) {
    const a = backPoles[i];
    const b = backPoles[i + 1];
    if (a && b) bulbChain(scene, mats, statics, a, b, 0.45, 0.6, i);
  }

  return { carousel, wheel: wheel.node, casters };
}
