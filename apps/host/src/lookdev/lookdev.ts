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
import { CHARACTER_ANIMATIONS } from '@chaos-party/minigame-sdk/babylon';
import { PLAYER_SLOTS } from '@chaos-party/protocol';
import { loadCharacters, type HostCharacterHandle } from '../characters/index.ts';
import { buildArena, buildBoard } from './content.ts';
import { LOOK_IDS, LOOKS, type Look, type LookId } from './looks.ts';
import {
  buildNatureArena,
  buildNatureBoard,
  NATURE_VARIANTS,
  natureTitle,
  type NatureStage,
  type NatureVariant,
} from './nature.ts';

declare global {
  interface Window {
    __lookdev?: {
      ready: boolean;
      look: LookId;
      shot: Shot;
      step(frames: number): void;
      measure(frames: number): LookdevStats;
      debug(): unknown;
      play(animation: string): void;
    };
  }
}

type Shot = 'brett' | 'figur' | 'minispiel' | 'portraet';

export interface LookdevStats {
  readonly msPerFrame: number;
  readonly drawCalls: number;
  readonly activeMeshes: number;
  readonly totalVertices: number;
}

// Parameter aus der Query oder – im Artefakt, das keine Query weitergibt – aus dem Hash
// (`#natur-morgen-brett`: Look und Ansicht mit Bindestrich).
const params = new URLSearchParams(location.search);
{
  const hash = location.hash.replace(/^#/, '');
  const match = /^(.+)-(brett|figur|minispiel)(-neu)?$/.exec(hash);
  if (match?.[1] && match[2] && !params.has('look')) {
    params.set('look', match[1]);
    params.set('shot', match[2]);
    if (match[3]) params.set('figuren', 'neu');
  }
}
const lookParam = params.get('look') ?? 'weich';
const natureVariant: NatureVariant | null = (NATURE_VARIANTS as readonly string[]).includes(
  lookParam,
)
  ? (lookParam as NatureVariant)
  : null;
const lookId: LookId = (LOOK_IDS as readonly string[]).includes(lookParam)
  ? (lookParam as LookId)
  : 'weich';
const shotParam = params.get('shot') ?? 'brett';
const shot: Shot =
  shotParam === 'figur' || shotParam === 'minispiel' || shotParam === 'portraet'
    ? shotParam
    : ('brett' as const);
/** Porträt-Ansicht (CHAOS-59/61): eine Figur nah, `slot=1…4` wählt sie. */
const portraitSlot = Math.min(4, Math.max(1, Number(params.get('slot') ?? '1'))) as Slot;
const testMode = params.get('test') === '1';
const look: Look = LOOKS[lookId];

document.body.dataset.look = natureVariant ? 'natur' : lookId;
document.body.dataset.shot = shot;
if (params.get('hud') === '0') document.body.dataset.hud = 'aus';
const title = document.getElementById('look-title');
if (title) {
  title.textContent = natureVariant ? natureTitle(natureVariant) : `${look.title} – ${look.blurb}`;
}

const canvas = document.getElementById('lookdev') as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, !testMode);
const scene = new Scene(engine);
scene.useConstantAnimationDeltaTime = testMode;

const camera = new ArcRotateCamera('kamera', -Math.PI / 2, 1, 20, Vector3.Zero(), scene);
camera.fov = 0.6;
camera.minZ = 0.1;
camera.maxZ = 600;
if (!testMode) camera.attachControl(canvas, true);

/** Material für Figuren und Slot-Ringe (Runde 1: aus der Richtung; Natur: lackiertes PBR). */
let figureMaterial = (hex: string, surface: 'plastik' | 'glanz'): Material =>
  look.material(scene, `figur-${hex}-${surface}`, hex, surface);
const styleRound1 = natureVariant === null;

/** Figur im Stil der Richtung einfärben (Materialien aus der GLB-Grundfarbe). */
function restyle(handle: HostCharacterHandle): void {
  const cache = new Map<string, Material>();
  for (const mesh of handle.meshes) {
    const old = mesh.material;
    if (!(old instanceof StandardMaterial)) continue;
    const hex = old.diffuseColor.toHexString();
    let mat = cache.get(hex);
    if (!mat) {
      mat = figureMaterial(hex, 'plastik');
      cache.set(hex, mat);
    }
    mesh.material = mat;
    mesh.receiveShadows = true;
    if (styleRound1 && look.facetted && mesh instanceof Mesh) mesh.convertToFlatShadedMesh();
    if (styleRound1 && look.outline) {
      mesh.renderOutline = true;
      mesh.outlineWidth = 0.012;
      mesh.outlineColor = old.diffuseColor.scale(0.3);
    }
  }
}

/**
 * `figuren=neu` (CHAOS-58): neu modellierte Figuren aus Blender (`packages/assets/blender/`),
 * erzeugt nach `apps/host/public/lookdev-figures/`; PBR-Materialien bleiben erhalten.
 */
const newFigures = params.get('figuren') === 'neu';
const FIGURE_SUFFIX = import.meta.env.VITE_LOOKDEV_PACKED === '1' ? '.wasm' : '';
const library = await loadCharacters(
  scene,
  newFigures
    ? {
        keepPbr: true,
        sources: Object.fromEntries(
          (['robot', 'cactus', 'raccoon', 'sock'] as const).map((id) => [
            id,
            `${import.meta.env.BASE_URL}lookdev-figures/${id}.glb${FIGURE_SUFFIX}`,
          ]),
        ),
      }
    : {},
);
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
  // Neue Figuren bringen ihre PBR-Materialien mit (Fell, Vertexfarben); nicht umfärben.
  if (!newFigures) restyle(handle);
  // Slot-Ring unter der Figur (Farbe + Symbol am Abzeichen).
  const ring = CreateTorus(
    `slot-ring-${String(slot)}`,
    { diameter: 1.0, thickness: 0.09, tessellation: look.tessellation },
    scene,
  );
  ring.position.copyFrom(at);
  ring.position.y += 0.05;
  ring.material = figureMaterial(style.color, 'glanz');
  ring.receiveShadows = true;
  if (styleRound1 && look.facetted) ring.convertToFlatShadedMesh();
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

/** Runde 2: Natur-Szene (asynchron, lädt Texturen, HDRI und Pflanzen). */
async function stageNature(variant: NatureVariant): Promise<Staging & { nature: NatureStage }> {
  const nature =
    shot === 'minispiel'
      ? await buildNatureArena(scene, variant)
      : await buildNatureBoard(scene, variant);
  figureMaterial = (hex) => nature.material(hex);
  if (shot === 'minispiel') {
    nature.spots.forEach((spot, i) => {
      placeFigure((i + 1) as Slot, spot, Math.PI + (i - 1.5) * 0.25);
    });
    return {
      nature,
      casters: nature.casters,
      focus: new Vector3(0, 1.5, -0.4),
      view: { alpha: -Math.PI / 2 - 0.35, beta: 0.98, radius: 16 },
    };
  }
  const a = nature.tiles[2] ?? Vector3.Zero();
  const b = nature.tiles[4] ?? Vector3.Zero();
  if (shot === 'portraet') {
    placeFigure(portraitSlot, a, Math.PI - 0.25);
    return {
      nature,
      casters: nature.casters,
      focus: a.add(new Vector3(0, 1.05, 0)),
      view: { alpha: -Math.PI / 2 - 0.15, beta: 1.4, radius: 3.1 },
    };
  }
  placeFigure(3, a, Math.PI - 0.5);
  placeFigure(1, b, Math.PI + 0.3);
  return shot === 'figur'
    ? {
        nature,
        casters: nature.casters,
        focus: Vector3.Lerp(a, b, 0.5).add(new Vector3(0, 0.9, 0)),
        view: { alpha: -Math.PI / 2 - 0.25, beta: 1.28, radius: 6.4 },
      }
    : {
        nature,
        casters: nature.casters,
        focus: new Vector3(0.2, 0, 0.6),
        view: { alpha: -Math.PI / 2 - 0.3, beta: 0.9, radius: 27 },
      };
}

const staged = natureVariant ? await stageNature(natureVariant) : { ...stage(), nature: null };
const { casters, focus, view } = staged;
// Erst das Ziel, dann Winkel/Abstand (setTarget rechnet sie sonst aus der Position neu).
camera.setTarget(focus);
camera.alpha = view.alpha;
camera.beta = view.beta;
camera.radius = view.radius;
for (const handle of handles) {
  for (const mesh of handle.meshes) if (mesh instanceof Mesh) casters.push(mesh);
}

if (staged.nature) {
  const figures = handles.flatMap((h) => h.meshes);
  await staged.nature.light(camera, figures, camera.radius);
} else {
  look.setup({ scene, camera, casters, focusDistance: camera.radius });
}

const instrumentation = new SceneInstrumentation(scene);
instrumentation.captureFrameTime = true;

await scene.whenReadyAsync(true);

window.__lookdev = {
  ready: true,
  debug() {
    return scene.meshes
      .filter((m) => m.isEnabled() && m.isVisible)
      .map((m) => {
        const b = m.getBoundingInfo().boundingBox;
        return {
          name: m.name,
          size: b.extendSizeWorld
            .scale(2)
            .asArray()
            .map((v) => Math.round(v * 10) / 10),
          center: b.centerWorld.asArray().map((v) => Math.round(v * 10) / 10),
        };
      })
      .filter((d) => (d.center[0] ?? 0) > 7 && !d.name.startsWith('gras'));
  },
  look: lookId,
  shot,
  step(frames) {
    for (let i = 0; i < frames; i++) scene.render();
  },
  play(animation) {
    const anim = CHARACTER_ANIMATIONS.find((a) => a === animation);
    if (anim) for (const handle of handles) handle.play(anim);
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

document.body.dataset.bereit = 'ja';

/** Umschalter für die interaktive Fassung: setzt den Hash und lädt neu. */
function buildSwitcher(): void {
  const nav = document.getElementById('switcher');
  if (!nav || !natureVariant) return;
  document.body.dataset.interaktiv = 'ja';
  const suffix = newFigures ? '-neu' : '';
  const row = (
    entries: readonly (readonly [string, string])[],
    current: string,
    make: (id: string) => string,
  ): HTMLDivElement => {
    const div = document.createElement('div');
    for (const [id, label] of entries) {
      const link = document.createElement('a');
      link.href = `#${make(id)}`;
      link.textContent = label;
      link.setAttribute('aria-current', String(id === current));
      link.addEventListener('click', (event) => {
        event.preventDefault();
        location.hash = make(id);
        location.reload();
      });
      div.append(link);
    }
    return div;
  };
  nav.append(
    row(
      [
        ['natur-morgen', 'Morgen'],
        ['natur-abend', 'Goldene Stunde'],
        ['natur-wolken', 'Bewölkt'],
      ],
      natureVariant,
      (id) => `${id}-${shot}${suffix}`,
    ),
    row(
      [
        ['brett', 'Brett'],
        ['figur', 'Figuren'],
        ['minispiel', 'Minispiel'],
      ],
      shot,
      (id) => `${natureVariant}-${id}${suffix}`,
    ),
    row(
      [
        ['alt', 'Figuren alt'],
        ['neu', 'Figuren neu'],
      ],
      newFigures ? 'neu' : 'alt',
      (id) => `${natureVariant}-${shot}${id === 'neu' ? '-neu' : ''}`,
    ),
  );
  // Animationen ohne Neuladen abspielen (alle Figuren).
  const anims = document.createElement('div');
  for (const anim of CHARACTER_ANIMATIONS) {
    const button = document.createElement('a');
    button.href = '#';
    button.textContent = anim;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      for (const handle of handles) handle.play(anim);
    });
    anims.append(button);
  }
  nav.append(anims);
}

if (testMode) {
  scene.render();
} else {
  buildSwitcher();
  engine.runRenderLoop(() => {
    scene.render();
  });
  window.addEventListener('resize', () => {
    engine.resize();
  });
}
