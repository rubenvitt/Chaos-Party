/**
 * Optik von „Pudding-Gerangel“: klobige, bunte Spielzeugteile aus Babylon-Grundkörpern.
 * Reine Darstellung – Hitboxen baut `index.ts` getrennt davon. Alles, was hier entsteht, wird
 * in `disposables` gesammelt und vom Minispiel in `dispose()` entfernt.
 */
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { TUNING } from './logic.ts';

export interface Disposable {
  dispose(): void;
}

export const COLORS = {
  pudding: '#3fb83a',
  puddingTop: '#5fd14a',
  plate: '#f4f8ff',
  plateRim: '#7fb8f0',
  cream: '#ffe7c4',
  lake: '#f7d9b5',
  cherry: '#e0233d',
  stem: '#5b8c2a',
  creamSpot: '#fffaf0',
  spoon: '#d08a4a',
  spoonDark: '#a8642c',
  gold: '#ffc83d',
  strawberry: '#ff4f6d',
} as const;

export function toyMaterial(
  name: string,
  hex: string,
  scene: Scene,
  disposables: Disposable[],
  glow = 0.15,
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  const color = Color3.FromHexString(hex);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(glow);
  material.specularColor = new Color3(0.15, 0.15, 0.15);
  disposables.push(material);
  return material;
}

function track<T extends Disposable>(item: T, disposables: Disposable[]): T {
  disposables.push(item);
  return item;
}

/** Sahnesee unter dem Pudding mit ein paar Erdbeeren als Deko (ohne Physik). */
export function buildCreamLake(scene: Scene, disposables: Disposable[]): void {
  const lake = track(
    CreateGround('pudding-sahnesee', { width: 80, height: 50 }, scene),
    disposables,
  );
  lake.position.y = TUNING.killY - 0.3;
  lake.material = toyMaterial('pudding-sahnesee-mat', COLORS.lake, scene, disposables, 0.1);
  const berry = toyMaterial('pudding-erdbeere-mat', COLORS.strawberry, scene, disposables, 0.25);
  const leaf = toyMaterial('pudding-blatt-mat', COLORS.stem, scene, disposables);
  const spots = [
    [-11, 2],
    [-9.5, -4],
    [10.5, 3],
    [12, -2.5],
    [-13, 7],
    [13.5, 8],
  ] as const;
  spots.forEach(([x, z], index) => {
    const body = track(
      CreateSphere(`pudding-erdbeere-${index}`, { diameter: 1.4, segments: 10 }, scene),
      disposables,
    );
    body.scaling.set(1, 1.2, 1);
    body.position.set(x, TUNING.killY + 0.2, z);
    body.material = berry;
    const top = track(
      CreateCylinder(
        `pudding-erdbeer-blatt-${index}`,
        { diameterTop: 0.1, diameterBottom: 0.9, height: 0.35, tessellation: 6 },
        scene,
      ),
      disposables,
    );
    top.parent = body;
    top.position.y = 0.65;
    top.material = leaf;
  });
}

/**
 * Teller und Pudding als Kinder der (unsichtbaren) Pudding-Hitbox. Gibt den Knoten zurück,
 * der fürs Schwabbeln skaliert wird.
 */
export function buildPudding(scene: Scene, hitbox: Mesh, disposables: Disposable[]): Mesh {
  const half = TUNING.thickness / 2;
  const pudding = track(
    CreateCylinder(
      'pudding-koerper',
      {
        diameterTop: TUNING.radius * 2,
        diameterBottom: TUNING.radius * 2 + 0.7,
        height: TUNING.thickness,
        tessellation: 64,
      },
      scene,
    ),
    disposables,
  );
  pudding.parent = hitbox;
  const jelly = toyMaterial('pudding-koerper-mat', COLORS.pudding, scene, disposables, 0.18);
  // Glänzend wie Götterspeise.
  jelly.specularColor = new Color3(0.7, 0.9, 0.7);
  jelly.specularPower = 24;
  pudding.material = jelly;
  const top = track(
    CreateCylinder(
      'pudding-deckel',
      { diameter: TUNING.radius * 2 + 0.02, height: 0.06, tessellation: 64 },
      scene,
    ),
    disposables,
  );
  top.parent = pudding;
  top.position.y = half - 0.02;
  const topMaterial = toyMaterial(
    'pudding-deckel-mat',
    COLORS.puddingTop,
    scene,
    disposables,
    0.12,
  );
  topMaterial.specularColor = new Color3(0.5, 0.7, 0.5);
  topMaterial.specularPower = 32;
  top.material = topMaterial;

  const plate = track(
    CreateCylinder(
      'pudding-teller',
      { diameterTop: TUNING.radius * 2 + 2.2, diameterBottom: TUNING.radius * 2 + 1, height: 0.3 },
      scene,
    ),
    disposables,
  );
  plate.parent = hitbox;
  plate.position.y = -half - 0.15;
  plate.material = toyMaterial('pudding-teller-mat', COLORS.plate, scene, disposables, 0.3);
  const rim = track(
    CreateTorus(
      'pudding-tellerrand',
      { diameter: TUNING.radius * 2 + 2.1, thickness: 0.22, tessellation: 64 },
      scene,
    ),
    disposables,
  );
  rim.parent = plate;
  rim.position.y = 0.15;
  rim.material = toyMaterial('pudding-tellerrand-mat', COLORS.plateRim, scene, disposables);

  // Sahnetupfer rund um die Puddingkante: markieren den Rand, ohne auf der Lauffläche zu liegen.
  const cream = toyMaterial('pudding-tupfer-mat', COLORS.cream, scene, disposables, 0.4);
  const count = 20;
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    const dollop = track(
      CreateSphere(`pudding-tupfer-${index}`, { diameter: 0.7, segments: 8 }, scene),
      disposables,
    );
    dollop.parent = pudding;
    dollop.scaling.set(1, 0.7, 1);
    dollop.position.set(
      Math.cos(angle) * (TUNING.radius + 0.25),
      -0.1,
      Math.sin(angle) * (TUNING.radius + 0.25),
    );
    dollop.material = cream;
  }
  return pudding;
}

export interface ZoneVisual {
  readonly root: TransformNode;
  readonly cherry: TransformNode;
  readonly ghost: Mesh;
}

/** Kirschfleck (Sahnefleck mit rotem Rand und schwebender Kirsche) und Vorwarn-Ring. */
export function buildZone(scene: Scene, hitbox: Mesh, disposables: Disposable[]): ZoneVisual {
  const root = track(new TransformNode('pudding-kirschfleck', scene), disposables);
  root.parent = hitbox;
  const spot = track(
    CreateCylinder(
      'pudding-kirschfleck-sahne',
      { diameter: TUNING.zoneRadius * 2, height: 0.05, tessellation: 40 },
      scene,
    ),
    disposables,
  );
  spot.parent = root;
  spot.material = toyMaterial('pudding-kirschfleck-mat', COLORS.creamSpot, scene, disposables, 0.5);
  const border = track(
    CreateTorus(
      'pudding-kirschfleck-rand',
      { diameter: TUNING.zoneRadius * 2, thickness: 0.26, tessellation: 40 },
      scene,
    ),
    disposables,
  );
  border.parent = root;
  border.position.y = 0.04;
  const red = toyMaterial('pudding-kirsche-mat', COLORS.cherry, scene, disposables, 0.35);
  border.material = red;

  const cherry = track(new TransformNode('pudding-kirsche', scene), disposables);
  cherry.parent = root;
  cherry.position.y = 2.6;
  // Dünne Stange vom Fleck zur Kirsche: zeigt auch aus der Schräge, wo der Fleck ist.
  const pole = track(
    CreateCylinder('pudding-kirschstange', { diameter: 0.08, height: 2.6, tessellation: 8 }, scene),
    disposables,
  );
  pole.parent = root;
  pole.position.y = 1.3;
  const stemMaterial = toyMaterial('pudding-stiel-mat', COLORS.stem, scene, disposables);
  pole.material = red;
  for (const side of [-1, 1]) {
    const fruit = track(
      CreateSphere(`pudding-kirsche-${side}`, { diameter: 0.7, segments: 12 }, scene),
      disposables,
    );
    fruit.parent = cherry;
    fruit.position.set(side * 0.28, 0, 0);
    fruit.material = red;
    const stem = track(
      CreateCylinder(`pudding-kirschstiel-${side}`, { diameter: 0.07, height: 0.75 }, scene),
      disposables,
    );
    stem.parent = cherry;
    stem.position.set(side * 0.14, 0.55, 0);
    stem.rotation.z = side * -0.45;
    stem.material = stemMaterial;
  }

  const ghost = track(
    CreateTorus(
      'pudding-kirschfleck-vorwarnung',
      { diameter: TUNING.zoneRadius * 2, thickness: 0.12, tessellation: 40 },
      scene,
    ),
    disposables,
  );
  ghost.parent = hitbox;
  const ghostMaterial = toyMaterial(
    'pudding-vorwarnung-mat',
    COLORS.cherry,
    scene,
    disposables,
    0.6,
  );
  ghostMaterial.alpha = 0.55;
  ghost.material = ghostMaterial;
  ghost.setEnabled(false);
  return { root, cherry, ghost };
}

/** Rührlöffel als Kind seiner (unsichtbaren) Hitbox: Stiel innen, Kelle außen. */
export function buildSpoon(scene: Scene, hitbox: Mesh, disposables: Disposable[]): void {
  const length = TUNING.spoonOuter - TUNING.spoonInner;
  const wood = toyMaterial('pudding-loeffel-mat', COLORS.spoon, scene, disposables, 0.2);
  const dark = toyMaterial('pudding-loeffel-dunkel-mat', COLORS.spoonDark, scene, disposables, 0.2);
  const handle = track(
    CreateCylinder(
      'pudding-loeffel-stiel',
      { diameterTop: 0.42, diameterBottom: 0.6, height: length - 1.2, tessellation: 12 },
      scene,
    ),
    disposables,
  );
  handle.parent = hitbox;
  handle.rotation.z = Math.PI / 2;
  handle.position.x = -0.6;
  handle.material = wood;
  const bowl = track(
    CreateSphere('pudding-loeffel-kelle', { diameter: 1, segments: 14 }, scene),
    disposables,
  );
  bowl.parent = hitbox;
  bowl.scaling.set(1.7, 0.75, 1.1);
  bowl.position.x = length / 2 - 0.85;
  bowl.material = wood;
  const knob = track(
    CreateSphere('pudding-loeffel-knauf', { diameter: 0.75, segments: 10 }, scene),
    disposables,
  );
  knob.parent = hitbox;
  knob.position.x = -length / 2 + 0.05;
  knob.material = dark;
}

export interface PawnDecor {
  readonly ring: Mesh;
  readonly pin: Mesh;
}

/** Bodenring und Wimpel über dem Kopf in Slot-Farbe (Farbe immer zusätzlich zur Figur). */
export function buildPawnDecor(
  scene: Scene,
  slot: number,
  color: string,
  disposables: Disposable[],
): PawnDecor {
  const material = toyMaterial(`pudding-slot-${slot}-mat`, color, scene, disposables, 0.45);
  const ring = track(
    CreateTorus(
      `pudding-ring-${slot}`,
      { diameter: 1.25, thickness: 0.16, tessellation: 28 },
      scene,
    ),
    disposables,
  );
  ring.material = material;
  const pin = track(
    CreateCylinder(
      `pudding-wimpel-${slot}`,
      { diameterTop: 0.5, diameterBottom: 0, height: 0.55, tessellation: 4 },
      scene,
    ),
    disposables,
  );
  pin.material = material;
  return { ring, pin };
}

/** Goldene Wackelkrone (folgt der führenden Person). */
export function buildCrown(scene: Scene, disposables: Disposable[]): TransformNode {
  const root = track(new TransformNode('pudding-krone', scene), disposables);
  const gold = toyMaterial('pudding-krone-mat', COLORS.gold, scene, disposables, 0.45);
  const band = track(
    CreateCylinder(
      'pudding-krone-band',
      { diameterTop: 0.78, diameterBottom: 0.66, height: 0.26, tessellation: 20 },
      scene,
    ),
    disposables,
  );
  band.parent = root;
  band.material = gold;
  for (let index = 0; index < 5; index++) {
    const angle = (index / 5) * Math.PI * 2;
    const spike = track(
      CreateCylinder(
        `pudding-krone-zacke-${index}`,
        { diameterTop: 0, diameterBottom: 0.2, height: 0.3, tessellation: 4 },
        scene,
      ),
      disposables,
    );
    spike.parent = root;
    spike.position.set(Math.cos(angle) * 0.33, 0.27, Math.sin(angle) * 0.33);
    spike.material = gold;
  }
  root.setEnabled(false);
  return root;
}
