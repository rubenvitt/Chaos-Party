/**
 * Figuren-Vitrine (nur Dev-Server, nicht im Build): alle vier Figuren nebeneinander im
 * Brett-Licht, für Optik-Prüfung und Belegbilder (docs/art-direction.md).
 *
 *   http://localhost:5173/host/src/characters/preview.html?anim=idle
 *
 * Parameter: `anim` (Animation für alle), `test=1` (keine Render-Schleife, feste Schritte über
 * `window.__vitrine.step(n)`), `names=0` (ohne Namensschilder), `view=top` (Brett-Blickwinkel),
 * `nah=<Slot 1–4>` (eine Figur aus der Nähe, CHAOS-162).
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { Scene } from '@babylonjs/core/scene.js';
import '@fontsource-variable/nunito/wght.css';
import { CHARACTER_NAMES, defaultCharacterFor, type Slot } from '@chaos-party/minigame-sdk';
import { CHARACTER_ANIMATIONS, type CharacterAnimation } from '@chaos-party/minigame-sdk/babylon';
import { PLAYER_SLOTS } from '@chaos-party/protocol';
import { loadCharacters, type HostCharacterHandle } from './index.ts';

declare global {
  interface Window {
    __vitrine?: {
      ready: boolean;
      step(frames: number): void;
      play(animation: CharacterAnimation): void;
    };
  }
}

const params = new URLSearchParams(location.search);
const testMode = params.get('test') === '1';
const anim = (params.get('anim') ?? 'idle') as CharacterAnimation;
const top = params.get('view') === 'top';

const canvas = document.getElementById('vitrine') as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, !testMode);
const scene = new Scene(engine);
scene.clearColor = new Color4(0, 0, 0, 0);
scene.useConstantAnimationDeltaTime = testMode;

// `nah=<Slot 1–4>`: Kamera ≈ 2,6 m vor dieser Figur (Nahansicht, CHAOS-162).
const near = Number(params.get('nah') ?? 0);
const nearX = near >= 1 && near <= 4 ? (1.5 - (near - 1)) * 2.2 : null;
const camera = top
  ? new ArcRotateCamera('kamera', -Math.PI / 2, 0.98, 14, new Vector3(0, 0.6, 0), scene)
  : nearX !== null
    ? new ArcRotateCamera('kamera', Math.PI / 2, 1.42, 4.6, new Vector3(nearX, 0.78, 0), scene)
    : new ArcRotateCamera('kamera', Math.PI / 2, 1.38, 10.2, new Vector3(0, 0.95, 0), scene);
camera.fov = 0.55;
camera.minZ = 0.1;

// Licht wie auf dem Brett (createBoardScene.ts).
const hemi = new HemisphericLight('himmel', new Vector3(0.2, 1, -0.3), scene);
hemi.intensity = 0.7;
hemi.diffuse = new Color3(1, 0.97, 0.92);
hemi.groundColor = new Color3(0.5, 0.45, 0.7);
hemi.specular = new Color3(0.05, 0.05, 0.05);
const direction = new Vector3(0.45, -1, top ? 0.35 : -0.35).normalize();
const sun = new DirectionalLight('sonne', direction, scene);
sun.position = direction.scale(-30);
sun.intensity = 0.55;
sun.shadowMinZ = 10;
sun.shadowMaxZ = 50;
const shadows = new ShadowGenerator(1024, sun);
shadows.usePercentageCloserFiltering = true;
shadows.bias = 0.004;
shadows.darkness = 0.5;

const grass = new StandardMaterial('gras', scene);
grass.diffuseColor = Color3.FromHexString('#8fd16a');
grass.emissiveColor = grass.diffuseColor.scale(0.06);
grass.specularColor = new Color3(0.05, 0.05, 0.05);
const ground = CreateCylinder('boden', { diameter: 11, height: 0.3, tessellation: 48 }, scene);
ground.scaling.z = 0.45;
ground.position.y = -0.15;
ground.material = grass;
ground.receiveShadows = true;

const library = await loadCharacters(scene);
const handles: HostCharacterHandle[] = [];
const names = document.getElementById('names');
([1, 2, 3, 4] as const).forEach((slot: Slot, i) => {
  const style = PLAYER_SLOTS[slot];
  const character = defaultCharacterFor(slot);
  const handle = library.create(scene, {
    slot,
    name: style.label,
    color: style.color,
    symbol: style.symbol,
    character,
  });
  // Kamera blickt von vorn (+Z): links im Bild ist +X. Leicht gedreht (Dreiviertelansicht).
  handle.root.position.x = (1.5 - i) * 2.2;
  handle.root.rotation.y = top ? 0 : Number(params.get('yaw') ?? -0.5);
  for (const mesh of handle.meshes) shadows.addShadowCaster(mesh, false);
  handle.play(anim);
  handles.push(handle);
  if (names && params.get('names') !== '0') {
    const label = document.createElement('span');
    label.textContent = CHARACTER_NAMES[character].name;
    const blurb = document.createElement('small');
    blurb.textContent = `${style.symbol} ${style.label}`;
    label.append(blurb);
    names.append(label);
  }
});

await scene.whenReadyAsync(true);
window.__vitrine = {
  ready: true,
  step(frames) {
    for (let i = 0; i < frames; i++) scene.render();
  },
  play(animation) {
    if (!CHARACTER_ANIMATIONS.includes(animation)) return;
    for (const handle of handles) handle.play(animation);
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
