/**
 * Renderer-Spike (CHAOS-75, nur Dev-Server, nicht im Build): baut das echte Spielbrett mit dem
 * Beispiel-Spielstand des lokalen Brett-Modus und exportiert die Kulisse als GLB plus eine
 * Beschreibung (Kamera, Licht, Figurenorte, Instanzen) für den Bevy-Prototyp
 * (`spikes/renderer-bevy`). Aufruf über `node scripts/spike-export-board.mjs`.
 *
 *   http://localhost:5173/host/src/spike/exportBoard.html?qualitaet=hoch
 */
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { EngineStore } from '@babylonjs/core/Engines/engineStore.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Node } from '@babylonjs/core/node.js';
import { GLTF2Export } from '@babylonjs/serializers/glTF/2.0/glTFSerializer.js';
import { DEFAULT_BOARD } from '@chaos-party/game-core';
import { createBoardScene } from '../board/createBoardScene.ts';
import { createDemoMessages } from '../board/demo.ts';
import { createBoardDirector } from '../board/director.ts';

declare global {
  interface Window {
    __spikeExport?: {
      ready: boolean;
      error?: string;
      meta?: unknown;
      glbBase64?: string;
      names?: unknown;
      instances?: unknown;
    };
  }
}

window.__spikeExport = { ready: false };

/**
 * Babylon rechnet linkshändig; glTF und Bevy rechtshändig. Der Babylon-Serializer spiegelt dafür
 * x (`ConvertToRightHandedPosition`: x · −1); Kamera, Licht, Figuren und Instanzen genauso.
 */
const rh = (v: { x: number; y: number; z: number }): [number, number, number] => [-v.x, v.y, v.z];

async function run(): Promise<void> {
  const canvas = document.getElementById('brett') as HTMLCanvasElement;
  const director = createBoardDirector();
  const first = createDemoMessages()[0];
  if (first) director.receive(first);
  // Kein Testmodus (der erzwingt die Sparstufe); `?qualitaet=hoch` in der URL wählt die Stufe,
  // die ein echter PC zuerst bekommt (Grasdichte, Schatten, Materialdetail).
  const board = createBoardScene(canvas, { board: DEFAULT_BOARD, source: director });
  console.log('Export: Szene angelegt, warte auf Aufbau …');
  await board.ready;
  console.log('Export: Brett steht');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const scene = EngineStore.LastCreatedScene;
  if (!scene) throw new Error('keine Szene');
  // Render-Schleife anhalten: Unter Software-Rendering kostet ein Bild der Stufe `hoch`
  // Sekunden und würde den Export (Texturen auslesen) aushungern.
  scene.getEngine().stopRenderLoop();

  // Figuren (Skelett, Animationen) lädt Bevy aus den Original-GLBs; hier nur ihr Ort.
  // Ihre Wurzelknoten heißen `figur-<slot>` (createBoardScene).
  const characters = board.getPawnCharacters();
  const figureRoots = new Set<Node>(
    scene.transformNodes.filter((n) => n.name.startsWith('figur-')),
  );
  const isFigure = (node: Node): boolean => {
    for (let n: Node | null = node; n; n = n.parent) {
      if (figureRoots.has(n)) return true;
    }
    return false;
  };

  // Thin Instances (Gras, Blumen, Punkte): Matrizen getrennt, Grundmesh ohne Instanzen im GLB.
  const instanced: { mesh: string; matrices: number[][] }[] = [];
  for (const mesh of scene.meshes) {
    if (!(mesh instanceof Mesh) || mesh.thinInstanceCount <= 0) continue;
    const raw = mesh.thinInstanceGetWorldMatrices();
    instanced.push({
      mesh: mesh.name,
      // Spaltenweise (glTF/glam), linkshändig → rechtshändig: S·M·S mit S = diag(-1,1,1,1),
      // also jedes Element mit genau einem x-Index (Zeile 0 oder Spalte 0) negieren.
      matrices: raw.map((m) => {
        const a = Array.from(m.asArray());
        for (const i of [1, 2, 3, 4, 8, 12]) a[i] = -(a[i] ?? 0);
        return a;
      }),
    });
    mesh.thinInstanceCount = 0;
  }

  const camera = scene.activeCamera as FreeCamera;
  const sun = scene.lights.find((l): l is DirectionalLight => l instanceof DirectionalLight);
  const sky = scene.lights.find((l): l is HemisphericLight => l instanceof HemisphericLight);
  const pawns = board.getPawnPositions().map((p) => ({
    slot: p.slot,
    character: characters[p.slot] ?? 'robot',
    position: rh({ x: p.x, y: p.y, z: p.z }),
  }));

  console.log(`Export: ${String(instanced.length)} Instanz-Gruppen, schreibe GLB …`);
  const glb = await GLTF2Export.GLBAsync(scene, 'brett', {
    // Kamera und Licht setzt Bevy selbst (sonst rendert eine zweite Kamera aus dem GLB mit).
    shouldExportNode: (node) => !isFigure(node) && node.isEnabled() && !(node instanceof Camera),
    // Figuren-Animationen zeigen sonst auf ausgelassene Knoten (ungültiges glTF); die Kulisse
    // bewegt Babylon per Code, nicht per Animation.
    shouldExportAnimation: () => false,
  });
  const file = Object.values(glb.files)[0];
  if (!(file instanceof Blob)) throw new Error('GLB fehlt');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  window.__spikeExport = {
    ready: true,
    glbBase64: btoa(binary),
    names: {
      figureRoots: [...figureRoots].map((n) => n.name),
      transformNodes: scene.transformNodes.slice(0, 80).map((n) => n.name),
      meshes: scene.meshes.length,
    },
    meta: {
      $comment:
        'CHAOS-75: erzeugt von apps/host/src/spike/exportBoard.ts aus dem Beispiel-Spielstand; rechtshändig (glTF).',
      board: DEFAULT_BOARD.id,
      camera: {
        position: rh(camera.position),
        target: rh(camera.getTarget()),
        fovY: camera.fov,
        near: camera.minZ,
        far: camera.maxZ,
      },
      sun: sun
        ? {
            direction: rh(sun.direction),
            intensity: sun.intensity,
            color: sun.diffuse.asArray(),
          }
        : null,
      sky: sky
        ? {
            intensity: sky.intensity,
            color: sky.diffuse.asArray(),
            ground: sky.groundColor.asArray(),
          }
        : null,
      clearColor: scene.clearColor.asArray(),
      pawns,
      instanced: instanced.map((i) => ({ mesh: i.mesh, count: i.matrices.length })),
      stats: {
        meshes: scene.meshes.length,
        activeMeshes: scene.getActiveMeshes().length,
        vertices: scene.getTotalVertices(),
        materials: scene.materials.length,
        textures: scene.textures.length,
      },
    },
    // Matrizen getrennt, damit die Meta-Datei lesbar bleibt.
    ...{ instances: instanced },
  };
}

run().catch((error: unknown) => {
  window.__spikeExport = {
    ready: true,
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
  };
});
