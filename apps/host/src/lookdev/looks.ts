/**
 * Drei Stilrichtungen für die Grafik-Neuausrichtung (CHAOS-56, Look-Dev). Jede Richtung legt
 * Palette, Materialien, Licht, Himmel und Nachbearbeitung fest; die Szene (`content.ts`) ist für
 * alle gleich gebaut, nur Facettierung und Rundungsgrad wechseln.
 *
 * - **weich:** „Premium-Spielzeug“ – PBR mit Umgebungslicht aus einem prozeduralen Himmel,
 *   Klarlack, weiche Kontaktschatten, Umgebungsverdeckung (SSAO), ACES-Tonemapping, leichtes Bloom.
 * - **toon:** „Cel-Shading“ – Licht in klaren Stufen, farbige Konturen, Randlicht, saubere
 *   Flächen, Wolken; wirkt wie ein moderner Animationsfilm.
 * - **diorama:** „Low-Poly-Miniatur“ – facettierte Formen, gedeckte Pastelltöne, warmes,
 *   tiefes Licht mit langen Schatten, Dunst und Tilt-Shift-Unschärfe (Modellbau-Wirkung).
 */
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { DepthOfFieldEffectBlurLevel } from '@babylonjs/core/PostProcesses/depthOfFieldEffect.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js';
import '@babylonjs/core/Rendering/depthRendererSceneComponent.js';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent.js';
import '@babylonjs/core/Rendering/outlineRenderer.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { createSkyEnvironment, skyColor, type SkySpec } from './environment.ts';
import { ToonPlugin } from './toonPlugin.ts';

export const LOOK_IDS = ['weich', 'toon', 'diorama'] as const;
export type LookId = (typeof LOOK_IDS)[number];

/** Oberflächenart – jede Richtung übersetzt sie in ihr Material. */
export type Surface = 'matt' | 'plastik' | 'glanz' | 'metall' | 'wasser' | 'creme';

export interface Palette {
  readonly grass: string;
  readonly grassEdge: string;
  readonly soil: string;
  readonly soilDark: string;
  readonly path: string;
  readonly tileBlue: string;
  readonly tileRed: string;
  readonly tileGold: string;
  readonly tileGift: string;
  readonly white: string;
  readonly wood: string;
  readonly leaves: readonly [string, string, string];
  readonly trunk: string;
  readonly rock: string;
  readonly water: string;
  readonly cap: string;
  readonly gold: string;
  readonly cloth: string;
  readonly plate: string;
  readonly pudding: string;
  readonly caramel: string;
  readonly cream: string;
  readonly cherry: string;
  readonly stem: string;
}

export interface LookContext {
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  /** Alle Meshes der Szene, die Schatten werfen sollen (nach dem Aufbau). */
  readonly casters: readonly Mesh[];
  /** Abstand Kamera → Bildmitte (für die Schärfeebene). */
  readonly focusDistance: number;
}

export interface Look {
  readonly id: LookId;
  readonly title: string;
  readonly blurb: string;
  /** Facettierte Formen (Flat-Shading, wenige Segmente). */
  readonly facetted: boolean;
  /** Segmente für runde Formen. */
  readonly tessellation: number;
  readonly palette: Palette;
  material(scene: Scene, name: string, hex: string, surface: Surface): Material;
  /** Licht, Himmel, Schatten, Nachbearbeitung (nach dem Aufbau der Szene). */
  setup(context: LookContext): void;
  /** Farbe für Konturen (nur toon). */
  readonly outline: boolean;
}

const color = (hex: string): Color3 => Color3.FromHexString(hex);

/** Himmelskuppel mit Vertexfarben aus derselben Himmelsfunktion wie das Umgebungslicht. */
function skyDome(scene: Scene, spec: SkySpec, exposure: number): Mesh {
  const dome = CreateSphere(
    'himmel',
    { diameter: 400, segments: 32, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  const positions = dome.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const colors: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    const len = Math.hypot(x, y, z) || 1;
    // Unter dem Horizont zeigt die Kuppel Dunst statt Boden (die Kamera blickt von oben).
    const [r, g, b] = skyColor(
      { ...spec, sun: [0, 0, 0], ground: spec.horizon },
      x / len,
      y / len,
      z / len,
    );
    const c = new Color3(r * exposure, g * exposure, b * exposure).toGammaSpace();
    colors.push(c.r, c.g, c.b, 1);
  }
  dome.setVerticesData(VertexBuffer.ColorKind, colors);
  const mat = new StandardMaterial('himmel', scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.White();
  mat.backFaceCulling = false;
  mat.fogEnabled = false;
  dome.material = mat;
  dome.isPickable = false;
  dome.infiniteDistance = true;
  return dome;
}

function sunLight(
  scene: Scene,
  direction: Vector3,
  intensity: number,
  tint: string,
): DirectionalLight {
  const dir = direction.normalize();
  const sun = new DirectionalLight('sonne', dir, scene);
  sun.position = dir.scale(-40);
  sun.intensity = intensity;
  sun.diffuse = color(tint);
  sun.autoCalcShadowZBounds = true;
  return sun;
}

// ---------------------------------------------------------------------------------------------
// weich – PBR-Spielzeug
// ---------------------------------------------------------------------------------------------

const SOFT_SKY: SkySpec = {
  zenith: [0.12, 0.38, 1.1],
  horizon: [0.62, 0.8, 1.12],
  ground: [0.42, 0.5, 0.36],
  sunDirection: [-0.45, 0.75, -0.5],
  sun: [3.2, 2.9, 2.5],
  sunSharpness: 48,
};

const ROUGHNESS: Readonly<Record<Surface, number>> = {
  matt: 0.78,
  plastik: 0.42,
  glanz: 0.22,
  metall: 0.24,
  wasser: 0.04,
  creme: 0.5,
};

const soft: Look = {
  id: 'weich',
  title: 'A · Weich & glänzend',
  blurb: 'PBR-Spielzeug: Umgebungslicht, Klarlack, weiche Schatten, Bloom',
  facetted: false,
  tessellation: 48,
  outline: false,
  palette: {
    grass: '#79cc57',
    grassEdge: '#62b546',
    soil: '#c98a5b',
    soilDark: '#9c6542',
    path: '#f4e8d0',
    tileBlue: '#3b8cff',
    tileRed: '#ff5a64',
    tileGold: '#ffc23d',
    tileGift: '#9a6cff',
    white: '#fffaf2',
    wood: '#b9794a',
    leaves: ['#5cc35f', '#3fa95b', '#94d856'],
    trunk: '#87573a',
    rock: '#b9c0cc',
    water: '#3fb7f0',
    cap: '#ff5252',
    gold: '#ffcc48',
    cloth: '#ffd7e1',
    plate: '#ffffff',
    pudding: '#ffc54f',
    caramel: '#d4863a',
    cream: '#fff6e6',
    cherry: '#e3223b',
    stem: '#5b8c2a',
  },
  material(scene, name, hex, surface) {
    const mat = new PBRMaterial(name, scene);
    mat.albedoColor = color(hex).toLinearSpace();
    mat.metallic = surface === 'metall' ? 1 : 0;
    mat.roughness = ROUGHNESS[surface];
    if (surface === 'plastik' || surface === 'glanz') {
      mat.clearCoat.isEnabled = true;
      mat.clearCoat.intensity = surface === 'glanz' ? 0.8 : 0.45;
      mat.clearCoat.roughness = 0.12;
    }
    if (surface === 'wasser') {
      mat.alpha = 0.82;
      mat.albedoColor = color(hex).toLinearSpace().scale(0.6);
    }
    if (surface === 'creme') {
      mat.subSurface.isTranslucencyEnabled = true;
      mat.subSurface.translucencyIntensity = 0.4;
    }
    return mat;
  },
  setup({ scene, camera, casters }) {
    const env = createSkyEnvironment(scene, SOFT_SKY);
    scene.environmentTexture = env;
    scene.environmentIntensity = 1.0;
    skyDome(scene, SOFT_SKY, 1);
    scene.clearColor = new Color4(0.8, 0.9, 1, 1);

    const sun = sunLight(scene, new Vector3(0.45, -0.75, 0.5), 3.6, '#fff1dc');
    const shadows = new ShadowGenerator(2048, sun);
    shadows.useContactHardeningShadow = true;
    shadows.contactHardeningLightSizeUVRatio = 0.04;
    shadows.bias = 0.0015;
    shadows.normalBias = 0.01;
    shadows.darkness = 0;
    for (const mesh of casters) shadows.addShadowCaster(mesh, false);

    const ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.75, blurRatio: 1 }, [
      camera,
    ]);
    ssao.radius = 1.2;
    ssao.totalStrength = 1.1;
    ssao.samples = 16;
    ssao.maxZ = 120;

    const pipeline = new DefaultRenderingPipeline('nachbearbeitung', true, scene, [camera]);
    pipeline.samples = 4;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipeline.imageProcessing.exposure = 1.15;
    pipeline.imageProcessing.contrast = 1.12;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 1.2;
    pipeline.imageProcessing.vignetteColor = new Color4(0.1, 0.12, 0.3, 0);
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.8;
    pipeline.bloomWeight = 0.3;
    pipeline.bloomKernel = 64;
    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.15;
  },
};

// ---------------------------------------------------------------------------------------------
// toon – Cel-Shading mit Konturen
// ---------------------------------------------------------------------------------------------

const TOON_SKY: SkySpec = {
  zenith: [0.16, 0.48, 1.0],
  horizon: [0.62, 0.86, 1.0],
  ground: [0.5, 0.75, 0.95],
  sunDirection: [-0.4, 0.8, -0.45],
  sun: [0, 0, 0],
  sunSharpness: 8,
};

const toon: Look = {
  id: 'toon',
  title: 'B · Cel-Shading',
  blurb: 'Animationsfilm-Look: Licht in Stufen, farbige Konturen, Randlicht',
  facetted: false,
  tessellation: 40,
  outline: true,
  palette: {
    grass: '#6ad85e',
    grassEdge: '#4fbf4f',
    soil: '#ef9a5a',
    soilDark: '#c8703f',
    path: '#fff0d4',
    tileBlue: '#2f7dff',
    tileRed: '#ff4766',
    tileGold: '#ffcf2e',
    tileGift: '#a463ff',
    white: '#ffffff',
    wood: '#d08a4f',
    leaves: ['#3fcf6b', '#26b468', '#a0e44f'],
    trunk: '#9a5b35',
    rock: '#c9d3e6',
    water: '#36cfff',
    cap: '#ff4a5a',
    gold: '#ffd13a',
    cloth: '#ffe1ea',
    plate: '#ffffff',
    pudding: '#ffc93e',
    caramel: '#e8963c',
    cream: '#ffffff',
    cherry: '#ff2d4b',
    stem: '#4fa52d',
  },
  material(scene, name, hex, surface) {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = color(hex);
    const glossy = surface === 'glanz' || surface === 'metall' || surface === 'wasser';
    const plastic = surface === 'plastik' || surface === 'creme';
    mat.specularColor = glossy
      ? new Color3(1, 1, 1)
      : plastic
        ? new Color3(0.5, 0.5, 0.5)
        : new Color3(0, 0, 0);
    mat.specularPower = glossy ? 48 : 24;
    new ToonPlugin(mat);
    return mat;
  },
  setup({ scene, camera, casters }) {
    skyDome(scene, TOON_SKY, 1);
    scene.clearColor = new Color4(0.6, 0.85, 1, 1);
    const hemi = new HemisphericLight('himmel-licht', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.42;
    hemi.diffuse = new Color3(0.85, 0.92, 1);
    hemi.groundColor = new Color3(0.42, 0.4, 0.62);
    hemi.specular = Color3.Black();
    const sun = sunLight(scene, new Vector3(0.4, -0.8, 0.45), 0.85, '#fff6e8');
    const shadows = new ShadowGenerator(2048, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    shadows.bias = 0.002;
    shadows.normalBias = 0.01;
    shadows.darkness = 0.0;
    for (const mesh of casters) shadows.addShadowCaster(mesh, false);

    const pipeline = new DefaultRenderingPipeline('nachbearbeitung', false, scene, [camera]);
    pipeline.samples = 4;
    pipeline.fxaaEnabled = true;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled = false;
    pipeline.imageProcessing.contrast = 1.05;
    pipeline.imageProcessing.colorCurvesEnabled = false;
  },
};

// ---------------------------------------------------------------------------------------------
// diorama – Low-Poly-Miniatur
// ---------------------------------------------------------------------------------------------

const DIORAMA_SKY: SkySpec = {
  zenith: [0.5, 0.55, 0.85],
  horizon: [1.1, 0.82, 0.68],
  ground: [0.62, 0.5, 0.48],
  sunDirection: [-0.7, 0.42, -0.4],
  sun: [2.4, 1.6, 0.9],
  sunSharpness: 24,
};

const diorama: Look = {
  id: 'diorama',
  title: 'C · Low-Poly-Diorama',
  blurb: 'Miniatur-Welt: Facetten, Pastell, warmes Abendlicht, Tilt-Shift',
  facetted: true,
  tessellation: 9,
  outline: false,
  palette: {
    grass: '#a3c78f',
    grassEdge: '#8fb67c',
    soil: '#d9a07a',
    soilDark: '#b47b5c',
    path: '#efe2cc',
    tileBlue: '#7aa3dd',
    tileRed: '#e5877e',
    tileGold: '#eec266',
    tileGift: '#b49ddc',
    white: '#fbf6ee',
    wood: '#c08f66',
    leaves: ['#86b88a', '#6c9f7d', '#b7d18c'],
    trunk: '#98705a',
    rock: '#cbc4bd',
    water: '#8fd0d4',
    cap: '#e17669',
    gold: '#e9bd5c',
    cloth: '#f2d8d1',
    plate: '#f8f3ea',
    pudding: '#f2c66f',
    caramel: '#d39a62',
    cream: '#fcf5ea',
    cherry: '#cc4658',
    stem: '#7d9a4f',
  },
  material(scene, name, hex, surface) {
    const mat = new PBRMaterial(name, scene);
    mat.albedoColor = color(hex).toLinearSpace();
    mat.metallic = surface === 'metall' ? 0.7 : 0;
    mat.roughness = surface === 'wasser' ? 0.15 : surface === 'metall' ? 0.45 : 0.92;
    if (surface === 'wasser') mat.alpha = 0.88;
    return mat;
  },
  setup({ scene, camera, casters, focusDistance }) {
    const env = createSkyEnvironment(scene, DIORAMA_SKY);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.7;
    skyDome(scene, DIORAMA_SKY, 0.95);
    scene.clearColor = new Color4(0.95, 0.8, 0.72, 1);
    scene.fogMode = 2; // FOGMODE_EXP2
    scene.fogDensity = 0.005;
    scene.fogColor = new Color3(0.98, 0.84, 0.76);

    const sun = sunLight(scene, new Vector3(0.7, -0.42, 0.4), 3.6, '#ffd2a0');
    const shadows = new ShadowGenerator(2048, sun);
    shadows.useContactHardeningShadow = true;
    shadows.contactHardeningLightSizeUVRatio = 0.03;
    shadows.bias = 0.002;
    shadows.normalBias = 0.015;
    shadows.darkness = 0.2;
    for (const mesh of casters) shadows.addShadowCaster(mesh, false);

    const ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.75, blurRatio: 1 }, [
      camera,
    ]);
    ssao.radius = 1.6;
    ssao.totalStrength = 1.4;
    ssao.samples = 16;
    ssao.maxZ = 120;

    const pipeline = new DefaultRenderingPipeline('nachbearbeitung', true, scene, [camera]);
    pipeline.samples = 4;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipeline.imageProcessing.exposure = 1.15;
    pipeline.imageProcessing.contrast = 1.3;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 2.2;
    pipeline.imageProcessing.vignetteColor = new Color4(0.35, 0.18, 0.2, 0);
    pipeline.depthOfFieldEnabled = true;
    pipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.Medium;
    pipeline.depthOfField.focusDistance = focusDistance * 1000;
    pipeline.depthOfField.focalLength = 160;
    pipeline.depthOfField.fStop = 1.4;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.9;
    pipeline.bloomWeight = 0.2;
  },
};

export const LOOKS: Readonly<Record<LookId, Look>> = { weich: soft, toon, diorama };
