/**
 * Look-Dev-Vitrine (CHAOS-56, nur Dev-Server, nicht im Build): derselbe Ausschnitt aus Brett,
 * Figur und Minispiel in drei Stilrichtungen, als Entscheidungsgrundlage für die neue
 * Art Direction.
 *
 *   http://localhost:5173/host/src/lookdev/lookdev.html?look=weich&shot=brett
 *
 * Parameter: `look` (weich | toon | diorama), `shot` (brett | figur | minispiel),
 * `hud=0` (ohne UI-Overlay), `test=1` (keine Render-Schleife; feste Schritte über
 * `window.__lookdev.step(n)`, Messung über `window.__lookdev.measure(n)`).
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import '@fontsource-variable/nunito/wght.css';
import { defaultCharacterFor, type Slot } from '@chaos-party/minigame-sdk';
import { PLAYER_SLOTS } from '@chaos-party/protocol';
import { loadCharacters, type HostCharacterHandle } from '../characters/index.ts';
import { buildArena, buildBoard } from './content.ts';
import { LOOK_IDS, LOOKS, type Look, type LookId } from './looks.ts';

declare global {
  interface Window {
    __lookdev?: {
      ready: boolean;
      look: LookId;
      shot: Shot;
      step(frames: number): void;
      measure(frames: number): LookdevStats;
    };
  }
}

type Shot = 'brett' | 'figur' | 'minispiel';

export interface LookdevStats {
  readonly msPerFrame: number;
  readonly drawCalls: number;
  readonly activeMeshes: number;
  readonly totalVertices: number;
}

const params = new URLSearchParams(location.search);
const lookParam = params.get('look') ?? 'weich';
const lookId: LookId = (LOOK_IDS as readonly string[]).includes(lookParam)
  ? (lookParam as LookId)
  : 'weich';
const shotParam = params.get('shot') ?? 'brett';
const shot: Shot =
  shotParam === 'figur' || shotParam === 'minispiel' ? shotParam : ('brett' as const);
const testMode = params.get('test') === '1';
const look: Look = LOOKS[lookId];

document.body.dataset.look = lookId;
document.body.dataset.shot = shot;
if (params.get('hud') === '0') document.body.dataset.hud = 'aus';
const title = document.getElementById('look-title');
if (title) title.textContent = `${look.title} – ${look.blurb}`;

const canvas = document.getElementById('lookdev') as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, !testMode);
const scene = new Scene(engine);
scene.useConstantAnimationDeltaTime = testMode;

const camera = new ArcRotateCamera('kamera', -Math.PI / 2, 1, 20, Vector3.Zero(), scene);
camera.fov = 0.6;
camera.minZ = 0.1;
camera.maxZ = 600;
if (!testMode) camera.attachControl(canvas, true);

/** Figur im Stil der Richtung einfärben (Materialien aus der GLB-Grundfarbe). */
function restyle(handle: HostCharacterHandle): void {
  const cache = new Map<string, Material>();
  for (const mesh of handle.meshes) {
    const old = mesh.material;
    if (!(old instanceof StandardMaterial)) continue;
    const hex = old.diffuseColor.toHexString();
    let mat = cache.get(hex);
    if (!mat) {
      mat = look.material(scene, `figur-${hex}`, hex, 'plastik');
      cache.set(hex, mat);
    }
    mesh.material = mat;
    mesh.receiveShadows = true;
    if (look.facetted && mesh instanceof Mesh) mesh.convertToFlatShadedMesh();
    if (look.outline) {
      mesh.renderOutline = true;
      mesh.outlineWidth = 0.012;
      mesh.outlineColor = old.diffuseColor.scale(0.3);
    }
  }
}

const library = await loadCharacters(scene);
const handles: HostCharacterHandle[] = [];

function placeFigure(slot: Slot, at: Vector3, yaw: number): HostCharacterHandle {
  const style = PLAYER_SLOTS[slot];
  const handle = library.create(scene, {
    slot,
    name: style.label,
    color: style.color,
    symbol: style.symbol,
    character: defaultCharacterFor(slot),
  });
  handle.root.position.copyFrom(at);
  handle.root.rotation.y = yaw;
  restyle(handle);
  // Slot-Ring unter der Figur (Farbe + Symbol am Abzeichen).
  const ring = CreateTorus(
    `slot-ring-${String(slot)}`,
    { diameter: 1.0, thickness: 0.09, tessellation: look.tessellation },
    scene,
  );
  ring.position.copyFrom(at);
  ring.position.y += 0.05;
  ring.material = look.material(scene, `slot-${String(slot)}`, style.color, 'glanz');
  ring.receiveShadows = true;
  if (look.facetted) ring.convertToFlatShadedMesh();
  handle.play('idle');
  handles.push(handle);
  return handle;
}

interface Staging {
  readonly casters: Mesh[];
  readonly focus: Vector3;
  readonly view: { readonly alpha: number; readonly beta: number; readonly radius: number };
}

/** Baut den Ausschnitt der gewählten Ansicht und liefert Schattenwerfer und Kamera. */
function stage(): Staging {
  if (shot === 'minispiel') {
    const arena = buildArena(scene, look);
    arena.arenaSpots.forEach((spot, i) => {
      // Figuren schauen zur Kamera (Kamera steht bei −Z, Figuren blicken nach +Z).
      placeFigure((i + 1) as Slot, spot, Math.PI + (i - 1.5) * 0.25);
    });
    return {
      casters: arena.meshes,
      focus: new Vector3(0, 1.4, -0.4),
      view: { alpha: -Math.PI / 2 - 0.35, beta: 0.98, radius: 15.5 },
    };
  }
  const board = buildBoard(scene, look);
  const a = board.tiles[2] ?? Vector3.Zero();
  const b = board.tiles[4] ?? Vector3.Zero();
  placeFigure(3, a, Math.PI - 0.5);
  placeFigure(1, b, Math.PI + 0.3);
  return shot === 'figur'
    ? {
        casters: board.meshes,
        focus: Vector3.Lerp(a, b, 0.5).add(new Vector3(0, 0.9, 0)),
        view: { alpha: -Math.PI / 2 - 0.25, beta: 1.28, radius: 6.4 },
      }
    : {
        casters: board.meshes,
        focus: new Vector3(0.2, 0, 0.4),
        view: { alpha: -Math.PI / 2 - 0.3, beta: 0.92, radius: 26 },
      };
}

const { casters, focus, view } = stage();
// Erst das Ziel, dann Winkel/Abstand (setTarget rechnet sie sonst aus der Position neu).
camera.setTarget(focus);
camera.alpha = view.alpha;
camera.beta = view.beta;
camera.radius = view.radius;
for (const handle of handles) {
  for (const mesh of handle.meshes) if (mesh instanceof Mesh) casters.push(mesh);
}

look.setup({ scene, camera, casters, focusDistance: camera.radius });

const instrumentation = new SceneInstrumentation(scene);
instrumentation.captureFrameTime = true;

await scene.whenReadyAsync(true);

window.__lookdev = {
  ready: true,
  look: lookId,
  shot,
  step(frames) {
    for (let i = 0; i < frames; i++) scene.render();
  },
  measure(frames) {
    const start = performance.now();
    for (let i = 0; i < frames; i++) scene.render();
    // Lesen erzwingt, dass die GPU fertig ist (sonst misst man nur das Absenden).
    const gl = engine._gl as WebGL2RenderingContext | null;
    gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    const ms = (performance.now() - start) / Math.max(1, frames);
    return {
      msPerFrame: Math.round(ms * 10) / 10,
      drawCalls: instrumentation.drawCallsCounter.current,
      activeMeshes: scene.getActiveMeshes().length,
      totalVertices: scene.getTotalVertices(),
    };
  },
};

if (testMode) {
  scene.render();
} else {
  engine.runRenderLoop(() => {
    scene.render();
  });
  window.addEventListener('resize', () => {
    engine.resize();
  });
}
