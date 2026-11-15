/**
 * Licht, Himmel und Nachbearbeitung des Natur-Looks (CHAOS-62): setzt eine `LightMood`
 * (`../lighting/moods.ts`) in einer Szene um – HDRI als Umgebungslicht und Himmel, Sonne aus
 * den Harmonischen des HDRI (schräg von vorn, kein Gegenlicht), Bodenlicht, Schatten, Dunst,
 * Nachtlichter (Laternen, Glühwürmchen) und Nachbearbeitung (ACES, Bloom, SSAO, Unschärfe).
 *
 * Die teuren Teile hängen an der Grafikstufe (`quality.ts`); `setQuality` stuft zur Laufzeit
 * ab (Gras, SSAO, Unschärfe, Kantenglättung, Bloom), ohne die Szene neu zu bauen.
 */
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer.js';
import '@babylonjs/core/Layers/effectLayerSceneComponent.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js';
import { DepthOfFieldEffectBlurLevel } from '@babylonjs/core/PostProcesses/depthOfFieldEffect.js';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js';
import '@babylonjs/core/Rendering/depthRendererSceneComponent.js';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { LightMood } from '../lighting/moods.ts';
import { skyUrl } from './assets.ts';
import { fireflies } from './geometry.ts';
import { seeded } from './noise.ts';
import { QUALITY, type QualityLevel } from './quality.ts';
import type { Terrain } from './terrain.ts';

/** Kamera-Blickrichtung, aus der die Sonne schräg von vorn links kommen soll (Weltraum). */
export interface SunAim {
  /** Gewünschte Richtung der Sonne in der xz-Ebene (Bogenmaß, atan2(z, x)). */
  readonly azimuth: number;
}

export interface NatureLookOptions {
  readonly mood: LightMood;
  readonly quality: QualityLevel;
  /** Woher die Sonne kommt (Standard: von vorn links für eine Kamera, die nach +z blickt). */
  readonly sun?: SunAim;
  /** Tiefenunschärfe: Schärfeebene (Abstand zur Kamera) und Blende (größer = schärfer). */
  readonly focus: { readonly distance: number; readonly fStop: number };
  /** Laternen (Weltposition des Glases) und ihr Glas-Mesh (leuchtet nachts). */
  readonly lanterns?: readonly { readonly light: Vector3; readonly glass: Mesh }[];
  /** Für Glühwürmchen (nur nachts). */
  readonly terrain?: Terrain;
  /** Grasmeshes, die abgestuft werden (Anteil je Stufe). */
  readonly grass?: { setDensity(fraction: number): void };
  /** Größe des Himmelswürfels und Höhe der Dunst-Ebene unter der Insel. */
  readonly skySize?: number;
  readonly hazeY?: number;
  /**
   * Abstand der Kamera zum Geschehen. Der Dunst der Stimmungen ist auf ≈ 20 Einheiten
   * abgestimmt (Vitrine); weiter entfernte Kameras bekommen entsprechend dünneren Dunst.
   */
  readonly viewDistance?: number;
}

export interface NatureLook {
  /** `null`, wenn die Grafikstufe keine Schatten rendert. */
  readonly shadows: ShadowGenerator | null;
  readonly quality: QualityLevel;
  /** Mesh wirft Schatten (Figuren, Requisiten). */
  addCaster(mesh: AbstractMesh): void;
  removeCaster(mesh: AbstractMesh): void;
  /** Grafikstufe wechseln (nur Laufzeit-Teile: Gras, SSAO, Unschärfe, MSAA, Bloom). */
  setQuality(level: QualityLevel): void;
  /** Je Bild: Glühwürmchen bewegen. */
  update(seconds: number): void;
}

/** Sonne kommt schräg von vorn links, Schatten fallen nach hinten rechts. */
const DEFAULT_SUN: SunAim = { azimuth: Math.atan2(-0.66, -0.75) };

async function loaded(texture: HDRCubeTexture): Promise<void> {
  if (texture.isReady()) return;
  await new Promise<void>((resolve, reject) => {
    texture.onLoadObservable.addOnce(() => {
      resolve();
    });
    // HDRCubeTexture meldet Fehler nur über die Konsole; Zeitlimit als Notbremse.
    setTimeout(() => {
      if (texture.isReady()) resolve();
      else reject(new Error(`Himmel lädt nicht: ${texture.url}`));
    }, 30_000);
  });
}

export async function applyNatureLook(
  scene: Scene,
  camera: Camera,
  options: NatureLookOptions,
): Promise<NatureLook> {
  const { mood } = options;
  let level = options.quality;
  const settings = QUALITY[level];
  const wanted = (options.sun ?? DEFAULT_SUN).azimuth;
  const skySize = options.skySize ?? 500;
  let toSun: Vector3;
  if (settings.environment) {
    const url = skyUrl(mood.sky.hdri);
    // size, noMipmap, generateHarmonics, gammaSpace, prefilterOnLoad
    const env = new HDRCubeTexture(url, scene, settings.environmentSize, false, true, false, true);
    env.name = `himmel-${mood.sky.hdri}`;
    scene.environmentTexture = env;
    scene.environmentIntensity = mood.sky.intensity;
    const background = new HDRCubeTexture(url, scene, 256, false, false, false, false);
    background.coordinatesMode = Texture.SKYBOX_MODE;
    // Nachthimmel sind sehr dunkel: der sichtbare Himmel folgt der Umgebungsstärke.
    background.level = Math.max(1, mood.sky.intensity * 0.6);
    const sky = CreateBox('himmel', { size: skySize }, scene);
    const skyMat = new PBRMaterial('himmel', scene);
    skyMat.backFaceCulling = false;
    skyMat.reflectionTexture = background;
    skyMat.microSurface = 1;
    skyMat.disableLighting = true;
    skyMat.fogEnabled = false;
    sky.material = skyMat;
    sky.infiniteDistance = true;
    sky.isPickable = false;

    await loaded(env);

    // Licht-Richtung aus dem linearen Anteil der Harmonischen (Texturraum, zeigt zur hellsten
    // Seite: Sonne, nachts der Mond).
    const sh = env.sphericalPolynomial;
    const lum = (v: Vector3): number => v.x * 0.2126 + v.y * 0.7152 + v.z * 0.0722;
    let sunInTexture = sh ? new Vector3(lum(sh.x), lum(sh.y), lum(sh.z)) : new Vector3(0, 1, 0);
    if (sunInTexture.lengthSquared() < 1e-6) sunInTexture = new Vector3(0, 1, 0);
    sunInTexture.normalize();
    const toWorld = (rotation: number): Vector3 => {
      env.rotationY = rotation;
      const inverse = env.getReflectionTextureMatrix().clone().invert();
      return Vector3.TransformNormal(sunInTexture, inverse);
    };
    let best = 0;
    let bestError = Infinity;
    for (let deg = 0; deg < 360; deg += 2) {
      const w = toWorld((deg * Math.PI) / 180);
      const az = Math.atan2(w.z, w.x);
      const diff = Math.abs(Math.atan2(Math.sin(az - wanted), Math.cos(az - wanted)));
      if (diff < bestError) {
        bestError = diff;
        best = (deg * Math.PI) / 180;
      }
    }
    toSun = toWorld(best);
    background.rotationY = best;
  } else {
    // Sparstufe: kein Umgebungslicht aus dem HDRI (auf Software-GPUs das Teuerste), die Sonne
    // steht fest schräg von vorn; das Bodenlicht übernimmt den Himmel (siehe unten).
    const elevation = (mood.key.minElevation + mood.key.maxElevation) / 2;
    const flat = Math.sqrt(1 - elevation * elevation);
    toSun = new Vector3(Math.cos(wanted) * flat, elevation, Math.sin(wanted) * flat);
  }
  // Nicht zu steil und nicht unter den Horizont (Lesbarkeit der Schatten).
  toSun.y = Math.min(mood.key.maxElevation, Math.max(mood.key.minElevation, toSun.y));
  toSun.normalize();
  const sun = new DirectionalLight('sonne', toSun.scale(-1), scene);
  sun.position = toSun.scale(60);
  sun.intensity = mood.key.intensity;
  sun.diffuse = Color3.FromHexString(mood.key.tint);
  sun.autoCalcShadowZBounds = true;
  // Puresky-HDRIs sind unten schwarz: ein schwaches Halbkugellicht ersetzt das Bodenlicht.
  // Ohne HDRI übernimmt es auch das Himmelslicht (heller, in der Himmelsfarbe).
  const fill = new HemisphericLight('bodenlicht', new Vector3(0, 1, 0), scene);
  fill.intensity = settings.environment
    ? mood.fill.intensity
    : mood.fill.intensity + mood.sky.intensity * 0.9;
  fill.diffuse = Color3.FromHexString(mood.fill.sky);
  fill.groundColor = Color3.FromHexString(mood.fill.ground);
  fill.specular = Color3.Black();

  let shadows: ShadowGenerator | null = null;
  if (settings.shadows) {
    shadows = new ShadowGenerator(settings.shadowMapSize, sun);
    if (settings.softShadows) {
      shadows.useContactHardeningShadow = true;
      shadows.contactHardeningLightSizeUVRatio = mood.key.penumbra;
    } else {
      shadows.usePercentageCloserFiltering = true;
      shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    }
    // Kleine Karten mit einfacher Filterung brauchen mehr Abstand gegen Schatten-Akne.
    shadows.bias = settings.softShadows ? 0.0015 : 0.005;
    shadows.normalBias = settings.softShadows ? 0.012 : 0.03;
    shadows.darkness = 0;
  }

  // Nachtlichter: Laternen als Punktlichter, leuchtendes Glas, Glühwürmchen mit Schein.
  const night = mood.night;
  let flies: ReturnType<typeof fireflies> | null = null;
  if (night) {
    const glow = new GlowLayer('schein', scene, {
      mainTextureSamples: settings.msaa > 1 ? 4 : 1,
      blurKernelSize: 48,
    });
    glow.intensity = 0.9;
    const lanternColor = Color3.FromHexString(night.lanternColor);
    const lit = new PBRMaterial('laterne-glas-an', scene);
    lit.unlit = true;
    lit.albedoColor = Color3.Black();
    lit.emissiveColor = lanternColor;
    lit.emissiveIntensity = 1.4;
    (options.lanterns ?? []).forEach((lantern, i) => {
      lantern.glass.material = lit;
      glow.addIncludedOnlyMesh(lantern.glass);
      if (i >= night.lanterns) return;
      const light = new PointLight(`laternenlicht-${String(i)}`, lantern.light, scene);
      light.diffuse = lanternColor;
      light.specular = lanternColor.scale(0.5);
      light.intensity = night.lanternIntensity;
      light.range = night.lanternRange;
    });
    if (night.fireflies > 0 && options.terrain) {
      flies = fireflies(scene, options.terrain, night.fireflies, seeded(60));
      glow.addIncludedOnlyMesh(flies.mesh);
    }
    // Sonne, Bodenlicht und bis zu sechs Laternen pro Material.
    const lights = 2 + Math.min(night.lanterns, options.lanterns?.length ?? 0);
    const raise = (mat: unknown): void => {
      if (mat instanceof PBRMaterial) mat.maxSimultaneousLights = lights;
    };
    for (const mat of scene.materials) raise(mat);
    scene.onNewMaterialAddedObservable.add(raise);
  }

  // Dunst unter der Insel: Kameras blicken unter den Horizont, wo Puresky-HDRIs schwarz sind.
  const haze = CreateDisc('dunst', { radius: skySize * 0.5, tessellation: 64 }, scene);
  haze.rotation.x = Math.PI / 2;
  haze.position.y = options.hazeY ?? -9;
  const hazeMat = new PBRMaterial('dunst', scene);
  hazeMat.unlit = true;
  hazeMat.albedoColor = Color3.FromHexString(mood.haze.color).toLinearSpace();
  haze.material = hazeMat;
  haze.isPickable = false;
  scene.fogMode = 2; // FOGMODE_EXP2
  scene.fogColor = Color3.FromHexString(mood.haze.color);
  scene.fogDensity = mood.haze.density * Math.min(1, 20 / (options.viewDistance ?? 20));
  scene.clearColor = Color4.FromHexString(`${mood.haze.color}ff`);

  let ssao: SSAO2RenderingPipeline | null = null;
  if (settings.ssao) {
    ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.75, blurRatio: 1 }, [camera]);
    ssao.radius = 1.0;
    ssao.totalStrength = night ? 0.9 : 1.2;
    ssao.samples = 16;
    ssao.maxZ = 150;
  }

  // Farbabstimmung: als Nachbearbeitung (mit Bloom, Unschärfe …) oder billig in den Shadern.
  let pipeline: DefaultRenderingPipeline | null = null;
  type Grade = Pick<
    ImageProcessingConfiguration,
    | 'toneMappingEnabled'
    | 'toneMappingType'
    | 'exposure'
    | 'contrast'
    | 'vignetteEnabled'
    | 'vignetteWeight'
    | 'vignetteColor'
  >;
  const grade = (config: Grade): void => {
    config.toneMappingEnabled = true;
    config.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    config.exposure = mood.grade.exposure;
    config.contrast = mood.grade.contrast;
    config.vignetteEnabled = true;
    config.vignetteWeight = 1.4;
    config.vignetteColor = new Color4(0.05, 0.06, 0.08, 0);
  };
  if (settings.postProcess) {
    pipeline = new DefaultRenderingPipeline('nachbearbeitung', true, scene, [camera]);
    pipeline.imageProcessingEnabled = true;
    grade(pipeline.imageProcessing);
    pipeline.bloomThreshold = mood.grade.bloomThreshold;
    pipeline.bloomWeight = mood.grade.bloomWeight;
    pipeline.bloomKernel = 64;
    pipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.Low;
    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.2;
    pipeline.grainEnabled = true;
    pipeline.grain.intensity = 4;
    pipeline.grain.animated = false;
  } else {
    grade(scene.imageProcessingConfiguration);
  }

  const applyRuntime = (next: QualityLevel): void => {
    const s = QUALITY[next];
    options.grass?.setDensity(s.grass);
    if (pipeline) {
      pipeline.samples = s.msaa;
      pipeline.bloomEnabled = s.bloom;
      pipeline.depthOfFieldEnabled = s.depthOfField;
      if (s.depthOfField) {
        pipeline.depthOfField.focusDistance = options.focus.distance * 1000;
        pipeline.depthOfField.focalLength = 90;
        pipeline.depthOfField.fStop = options.focus.fStop;
      }
    }
    if (!s.ssao && ssao) {
      ssao.dispose(true);
      ssao = null;
    }
  };
  applyRuntime(level);

  return {
    shadows,
    get quality() {
      return level;
    },
    addCaster(mesh) {
      shadows?.addShadowCaster(mesh, false);
    },
    removeCaster(mesh) {
      shadows?.removeShadowCaster(mesh, false);
    },
    setQuality(next) {
      if (next === level) return;
      level = next;
      applyRuntime(next);
    },
    update(seconds) {
      flies?.update(seconds);
    },
  };
}
