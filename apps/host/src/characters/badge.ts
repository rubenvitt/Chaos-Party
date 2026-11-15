/**
 * Slot-Abzeichen auf der Brust jeder Figur (CHAOS-27): weiße Plakette mit dunklem Rand und
 * dem Slot-Symbol (● ▲ ■ ★) in Slot-Farbe – Farbe **und** Form wie überall im Spiel.
 * Blickt nach +Z (Vorderseite der Figur), hängt am Knoten `abzeichen` aus dem GLB.
 */
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Slot } from '@chaos-party/minigame-sdk';

const INK = '#1b1530';
const DIAMETER = 0.22;

export interface Badge {
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

function flat(mat: StandardMaterial, hex: string, emissive: number): StandardMaterial {
  const color = Color3.FromHexString(hex);
  mat.diffuseColor = color;
  mat.emissiveColor = color.scale(emissive);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  return mat;
}

/** Symbol als flache Form in der XY-Ebene (Dicke entlang Z). */
function symbolShape(scene: Scene, slot: Slot, name: string): Mesh {
  const depth = 0.03;
  const s = DIAMETER * 0.62;
  /** Flaches Vieleck vor dem Abzeichen; `spin` dreht es in seiner Ebene (vor dem Aufrichten). */
  const prism = (tessellation: number, diameter: number, spin: number): Mesh => {
    const mesh = CreateCylinder(name, { diameter, height: depth, tessellation }, scene);
    mesh.rotation.y = spin;
    mesh.bakeCurrentTransformIntoVertices();
    mesh.rotation.set(Math.PI / 2, 0, 0);
    mesh.bakeCurrentTransformIntoVertices();
    return mesh;
  };
  switch (slot) {
    case 1:
      return prism(20, s, 0);
    case 2: {
      // Dreieck mit Spitze nach oben.
      const tri = prism(3, s * 1.2, -Math.PI / 2);
      tri.position.y = s * 0.1;
      tri.bakeCurrentTransformIntoVertices();
      return tri;
    }
    case 3:
      return CreateBox(name, { width: s * 0.85, height: s * 0.85, depth }, scene);
    case 4: {
      const arms = [0, 1, 2].map((i) => {
        const arm = CreateBox(
          `${name}-${String(i)}`,
          { width: s * 1.05, height: s * 0.3, depth },
          scene,
        );
        arm.rotation.z = Math.PI / 2 + (i * Math.PI) / 3;
        return arm;
      });
      return Mesh.MergeMeshes(arms, true) ?? arms[0] ?? CreateBox(name, { size: s }, scene);
    }
  }
}

export function createBadge(
  scene: Scene,
  anchor: TransformNode,
  slot: Slot,
  color: string,
  prefix: string,
): Badge {
  const plateMat = flat(new StandardMaterial(`${prefix}-abzeichen-weiss`, scene), '#ffffff', 0.45);
  const rimMat = flat(new StandardMaterial(`${prefix}-abzeichen-rand`, scene), INK, 0);
  const symbolMat = flat(new StandardMaterial(`${prefix}-abzeichen-symbol`, scene), color, 0.3);

  const rim = CreateCylinder(
    `${prefix}-abzeichen-rand`,
    { diameter: DIAMETER + 0.04, height: 0.02, tessellation: 24 },
    scene,
  );
  rim.rotation.x = Math.PI / 2;
  rim.material = rimMat;
  const plate = CreateCylinder(
    `${prefix}-abzeichen`,
    { diameter: DIAMETER, height: 0.02, tessellation: 24 },
    scene,
  );
  plate.rotation.x = Math.PI / 2;
  plate.position.z = 0.008;
  plate.material = plateMat;
  const symbol = symbolShape(scene, slot, `${prefix}-abzeichen-symbol`);
  symbol.position.z = 0.025;
  symbol.material = symbolMat;

  const meshes = [rim, plate, symbol];
  for (const mesh of meshes) {
    mesh.parent = anchor;
    mesh.isPickable = false;
  }
  return {
    meshes,
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      plateMat.dispose();
      rimMat.dispose();
      symbolMat.dispose();
    },
  };
}
