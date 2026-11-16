/**
 * Licht, Himmel und Nachbearbeitung des Natur-Looks (CHAOS-62): setzt eine `LightMood`
 * (`../lighting/moods.ts`) in einer Szene um – HDRI als Umgebungslicht und Himmel, Sonne aus
 * den Harmonischen des HDRI (schräg von vorn, kein Gegenlicht), Bodenlicht, Schatten, Dunst,
 * Nachtlichter (Laternen, Glühwürmchen) und Nachbearbeitung (ACES, Bloom, SSAO, Unschärfe).
 *
 * Die teuren Teile hängen an der Grafikstufe (`quality.ts`); `setQuality` stuft zur Laufzeit
 * ab (Gras, SSAO, Unschärfe, Kantenglättung, Bloom), ohne die Szene neu zu bauen.
 *
 * Lichtverlauf je Runde (CHAOS-63): `setMood` blendet in eine andere Stimmung über
 * (`../lighting/transition.ts`). Die Himmel aller angekündigten Stimmungen (`upcoming`) lädt
 * `applyNatureLook` vorab; beim Übergang wird nichts geladen und kein Shader neu übersetzt:
 * Der neue Himmel liegt als zweiter Würfel mit wachsender Deckkraft über dem alten, Sonne,
 * Bodenlicht, Dunst und Farbabstimmung werden gemischt, das Umgebungslicht (HDRI) wechselt
 * zur Hälfte. Nachtlichter entstehen nur, wenn die Szene Dämmerung oder Nacht erreichen kann,
 * und blenden über ihre Stärke ein (Laternen, Schein, Glühwürmchen, leuchtende Felder).
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
import type { Material } from '@babylonjs/core/Materials/material.js';
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
import { LIGHT_MOODS, type LightMood, type LightMoodId } from '../lighting/moods.ts';
import {
  createMoodTransition,
  MOOD_TRANSITION_MS,
  type LightState,
  type MoodTransitionSnapshot,
  type Rgb,
} from '../lighting/transition.ts';
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
  /**
   * Stimmungen, in die die Szene später überblenden kann (CHAOS-63): Ihre Himmel werden vorab
   * geladen, Nachtlichter vorbereitet, falls eine davon Dämmerung oder Nacht ist.
   */
  readonly upcoming?: readonly LightMood[];
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
  /**
   * Leuchtende Felder: Anteil der eigenen Farbe als Eigenleuchten (`LightMood.night.tileGlow`),
   * je Bild der Überblendung aufgerufen.
   */
  readonly tileGlow?: (fraction: number) => void;
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
  /** Ziel- bzw. aktuelle Stimmung und Stand der Überblendung. */
  readonly transition: MoodTransitionSnapshot;
  /** Mesh wirft Schatten (Figuren, Requisiten). */
  addCaster(mesh: AbstractMesh): void;
  removeCaster(mesh: AbstractMesh): void;
  /** Grafikstufe wechseln (nur Laufzeit-Teile: Gras, SSAO, Unschärfe, MSAA, Bloom). */
  setQuality(level: QualityLevel): void;
  /**
   * In eine andere Stimmung überblenden (`durationMs` 0 = sofort). Ist ihr Himmel nicht
   * vorab geladen (nicht in `upcoming`), lädt er nach und die Überblendung beginnt danach.
   */
  setMood(mood: LightMood, durationMs?: number): void;
  /**
   * Je Bild mit der Szenenzeit (Sekunden, steigend): Glühwürmchen bewegen, Überblendung
   * fortschreiben. Deterministisch, wenn die Zeit es ist (Testmodus).
   */
  update(seconds: number): void;
}

/** Sonne kommt schräg von vorn links, Schatten fallen nach hinten rechts. */
const DEFAULT_SUN: SunAim = { azimuth: Math.atan2(-0.66, -0.75) };

/** Himmelswürfel der Überblendung etwas kleiner, damit er sicher vor dem alten liegt. */
const FADE_SKY_SCALE = 0.98;

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

const color3 = (rgb: Rgb): Color3 => new Color3(rgb[0], rgb[1], rgb[2]);

/** Ein vorab geladener Himmel: Umgebungslicht, sichtbarer Würfel und Richtung zur Sonne. */
interface Sky {
  readonly hdri: string;
  readonly env: HDRCubeTexture;
  readonly box: Mesh;
  /** Deckend (Ruhezustand) und überblendend (Würfel wird während des Übergangs sichtbar). */
  readonly opaque: PBRMaterial;
  readonly fade: PBRMaterial;
  /** Weltrichtung zur Sonne, schon auf die Höhengrenzen der Stimmung geklemmt. */
  readonly toSun: Vector3;
}

export async function applyNatureLook(
  scene: Scene,
  camera: Camera,
  options: NatureLookOptions,
): Promise<NatureLook> {
  const { mood } = options;
  // Tiefenunschärfe und SSAO lesen die Tiefe normiert auf die Sichtweite: Mit der
  // Standard-Sichtweite 10 000 ist sie zu grob, alles wird unscharf. Himmel und Dunst liegen
  // innerhalb von 600 Einheiten.
  camera.maxZ = Math.min(camera.maxZ, 600);
  let level = options.quality;
  const settings = QUALITY[level];
  const wanted = (options.sun ?? DEFAULT_SUN).azimuth;
  const skySize = options.skySize ?? 500;
  const moods = new Map<LightMoodId, LightMood>();
  for (const m of [mood, ...(options.upcoming ?? [])]) moods.set(m.id, m);

  // --- Himmel (nur mit Umgebungslicht) --------------------------------------------------------
  const skies = new Map<string, Promise<Sky>>();
  const readySkies = new Map<string, Sky>();

  async function createSky(m: LightMood): Promise<Sky> {
    const url = skyUrl(m.sky.hdri);
    // size, noMipmap, generateHarmonics, gammaSpace, prefilterOnLoad
    const env = new HDRCubeTexture(url, scene, settings.environmentSize, false, true, false, true);
    env.name = `himmel-${m.sky.hdri}`;
    const background = new HDRCubeTexture(url, scene, 256, false, false, false, false);
    background.coordinatesMode = Texture.SKYBOX_MODE;
    // Nachthimmel sind sehr dunkel: der sichtbare Himmel folgt der Umgebungsstärke.
    background.level = Math.max(1, m.sky.intensity * 0.6);
    const box = CreateBox(`himmel-${m.sky.hdri}`, { size: skySize }, scene);
    const material = (name: string, blend: boolean): PBRMaterial => {
      const mat = new PBRMaterial(name, scene);
      mat.backFaceCulling = false;
      mat.reflectionTexture = background;
      mat.microSurface = 1;
      mat.disableLighting = true;
      mat.fogEnabled = false;
      if (blend) {
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
        mat.alpha = 0;
      }
      return mat;
    };
    const opaque = material(`himmel-${m.sky.hdri}`, false);
    const fade = material(`himmel-${m.sky.hdri}-blende`, true);
    box.material = opaque;
    box.infiniteDistance = true;
    box.isPickable = false;
    // Vor allen anderen durchsichtigen Dingen zeichnen (Wasser, Glas).
    box.alphaIndex = -1;
    box.isVisible = false;

    await Promise.all([loaded(env), loaded(background)]);

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
    const toSun = toWorld(best);
    background.rotationY = best;
    // Nicht zu steil und nicht unter den Horizont (Lesbarkeit der Schatten).
    toSun.y = Math.min(m.key.maxElevation, Math.max(m.key.minElevation, toSun.y));
    toSun.normalize();
    // Beide Varianten jetzt übersetzen, nicht erst mitten in der Überblendung.
    await Promise.all([opaque.forceCompilationAsync(box), fade.forceCompilationAsync(box)]);
    const sky: Sky = { hdri: m.sky.hdri, env, box, opaque, fade, toSun };
    readySkies.set(m.sky.hdri, sky);
    return sky;
  }

  function skyFor(m: LightMood): Promise<Sky> {
    let promise = skies.get(m.sky.hdri);
    if (!promise) {
      promise = createSky(m);
      skies.set(m.sky.hdri, promise);
    }
    return promise;
  }

  if (settings.environment) {
    // Alle angekündigten Himmel jetzt laden: Beim Rundenwechsel lädt nichts mehr nach.
    await Promise.all([...moods.values()].map((m) => skyFor(m)));
  }

  /** Sparstufe: Sonne fest schräg von vorn, Höhe aus der Stimmung. */
  const flatSun = (elevation: number): Vector3 => {
    const flat = Math.sqrt(1 - elevation * elevation);
    return new Vector3(Math.cos(wanted) * flat, elevation, Math.sin(wanted) * flat);
  };

  const sun = new DirectionalLight('sonne', new Vector3(0, -1, 0), scene);
  sun.autoCalcShadowZBounds = true;
  // Puresky-HDRIs sind unten schwarz: ein schwaches Halbkugellicht ersetzt das Bodenlicht.
  // Ohne HDRI übernimmt es auch das Himmelslicht (heller, in der Himmelsfarbe).
  const fill = new HemisphericLight('bodenlicht', new Vector3(0, 1, 0), scene);
  fill.specular = Color3.Black();

  let shadows: ShadowGenerator | null = null;
  if (settings.shadows) {
    shadows = new ShadowGenerator(settings.shadowMapSize, sun);
    if (settings.softShadows) {
      shadows.useContactHardeningShadow = true;
      shadows.contactHardeningLightSizeUVRatio = mood.key.penumbra;
    } else {
      shadows.usePercentageCloserFiltering = true;
    }
    // Auch bei PCSS: Die Standardstufe HIGH kostete auf einer M3 Max am Brett ≈ 23 ms je Bild
    // (1080p), LOW ≈ 1 ms bei kaum sichtbarem Unterschied (CHAOS-73, docs/experiments.md).
    shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    // Kleine Karten mit einfacher Filterung brauchen mehr Abstand gegen Schatten-Akne.
    shadows.bias = settings.softShadows ? 0.0015 : 0.005;
    shadows.normalBias = settings.softShadows ? 0.012 : 0.03;
    shadows.darkness = 0;
  }

  // --- Nachtlichter: nur, wenn die Szene Dämmerung oder Nacht erreichen kann -------------------
  interface NightRig {
    readonly glow: GlowLayer;
    readonly lit: PBRMaterial;
    readonly lights: PointLight[];
    readonly glass: { readonly mesh: Mesh; readonly day: Material | null }[];
    readonly flies: ReturnType<typeof fireflies> | null;
  }
  let rig: NightRig | null = null;
  function buildNightRig(): NightRig {
    const lanternCount = Math.max(0, ...[...moods.values()].map((m) => m.night?.lanterns ?? 0));
    const fireflyCount = Math.max(0, ...[...moods.values()].map((m) => m.night?.fireflies ?? 0));
    const glow = new GlowLayer('schein', scene, {
      mainTextureSamples: settings.msaa > 1 ? 4 : 1,
      blurKernelSize: 48,
    });
    glow.intensity = 0;
    const lit = new PBRMaterial('laterne-glas-an', scene);
    lit.unlit = true;
    lit.albedoColor = Color3.Black();
    const lights: PointLight[] = [];
    const glass: NightRig['glass'][number][] = [];
    (options.lanterns ?? []).forEach((lantern, i) => {
      glass.push({ mesh: lantern.glass, day: lantern.glass.material });
      glow.addIncludedOnlyMesh(lantern.glass);
      if (i >= lanternCount) return;
      const light = new PointLight(`laternenlicht-${String(i)}`, lantern.light, scene);
      light.intensity = 0;
      lights.push(light);
    });
    let flies: ReturnType<typeof fireflies> | null = null;
    if (fireflyCount > 0 && options.terrain) {
      flies = fireflies(scene, options.terrain, fireflyCount, seeded(60));
      flies.setFade(0);
      glow.addIncludedOnlyMesh(flies.mesh);
    }
    // Sonne, Bodenlicht und bis zu sechs Laternen pro Material.
    const count = 2 + lights.length;
    const raise = (mat: unknown): void => {
      if (mat instanceof PBRMaterial) mat.maxSimultaneousLights = count;
    };
    for (const mat of scene.materials) raise(mat);
    scene.onNewMaterialAddedObservable.add(raise);
    return { glow, lit, lights, glass, flies };
  }
  const needsNight = (): boolean => [...moods.values()].some((m) => m.night !== null);
  if (needsNight()) rig = buildNightRig();

  // Dunst unter der Insel: Kameras blicken unter den Horizont, wo Puresky-HDRIs schwarz sind.
  const haze = CreateDisc('dunst', { radius: skySize * 0.5, tessellation: 64 }, scene);
  haze.rotation.x = Math.PI / 2;
  haze.position.y = options.hazeY ?? -9;
  const hazeMat = new PBRMaterial('dunst', scene);
  hazeMat.unlit = true;
  haze.material = hazeMat;
  haze.isPickable = false;
  scene.fogMode = 2; // FOGMODE_EXP2
  const hazeScale = Math.min(1, 20 / (options.viewDistance ?? 20));

  let ssao: SSAO2RenderingPipeline | null = null;
  if (settings.ssao) {
    ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.75, blurRatio: 1 }, [camera]);
    ssao.radius = 1.0;
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
  const gradeBase = (config: Grade): void => {
    config.toneMappingEnabled = true;
    config.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    config.vignetteEnabled = true;
    config.vignetteWeight = 1.4;
    config.vignetteColor = new Color4(0.05, 0.06, 0.08, 0);
  };
  let grade: Grade;
  if (settings.postProcess) {
    pipeline = new DefaultRenderingPipeline('nachbearbeitung', true, scene, [camera]);
    pipeline.imageProcessingEnabled = true;
    grade = pipeline.imageProcessing;
    pipeline.bloomKernel = 64;
    pipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.Low;
    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.2;
    pipeline.grainEnabled = true;
    pipeline.grain.intensity = 4;
    pipeline.grain.animated = false;
  } else {
    grade = scene.imageProcessingConfiguration;
  }
  gradeBase(grade);

  // --- Zustand einer (gemischten) Stimmung in die Szene setzen ---------------------------------
  const transition = createMoodTransition(mood.id, (id) => moods.get(id) ?? LIGHT_MOODS[id]);
  /** Himmel, der gerade deckend steht, und der, der einblendet. */
  let baseSky: Sky | null = readySkies.get(mood.sky.hdri) ?? null;
  let fadeSky: Sky | null = null;
  if (baseSky) {
    baseSky.box.isVisible = true;
    scene.environmentTexture = baseSky.env;
  }

  function applyState(snap: MoodTransitionSnapshot): void {
    const s: LightState = snap.state;
    // Sonne: Richtung zwischen den Himmeln mischen (Sparstufe: Höhe aus der Stimmung).
    let toSun: Vector3;
    if (baseSky && fadeSky) {
      toSun = Vector3.Lerp(baseSky.toSun, fadeSky.toSun, snap.mix).normalize();
    } else if (baseSky) {
      toSun = baseSky.toSun.clone();
    } else {
      toSun = flatSun(s.keyElevation);
    }
    sun.direction = toSun.scale(-1);
    sun.position = toSun.scale(60);
    sun.intensity = s.keyIntensity;
    sun.diffuse = color3(s.keyTint);
    if (shadows && settings.softShadows) shadows.contactHardeningLightSizeUVRatio = s.penumbra;

    if (baseSky) {
      scene.environmentIntensity = s.skyIntensity;
      // Umgebungslicht lässt sich nicht mischen: zur Hälfte der Überblendung wechseln.
      const env = fadeSky && snap.mix >= 0.5 ? fadeSky.env : baseSky.env;
      if (scene.environmentTexture !== env) scene.environmentTexture = env;
      if (fadeSky) fadeSky.fade.alpha = snap.mix;
    }
    fill.intensity = baseSky ? s.fillIntensity : s.fillIntensity + s.skyIntensity * 0.9;
    fill.diffuse = color3(s.fillSky);
    fill.groundColor = color3(s.fillGround);

    const hazeColor = color3(s.hazeColor);
    hazeMat.albedoColor = hazeColor.toLinearSpace();
    scene.fogColor = hazeColor;
    scene.fogDensity = s.hazeDensity * hazeScale;
    scene.clearColor = new Color4(hazeColor.r, hazeColor.g, hazeColor.b, 1);

    grade.exposure = s.exposure;
    grade.contrast = s.contrast;
    if (pipeline) {
      pipeline.bloomThreshold = s.bloomThreshold;
      pipeline.bloomWeight = s.bloomWeight;
    }
    if (ssao) ssao.totalStrength = 1.2 - 0.3 * s.lampsOn;

    if (rig) {
      const on = s.lampsOn;
      rig.glow.intensity = 0.9 * on;
      const lantern = color3(s.lanternColor);
      rig.lit.emissiveColor = lantern;
      rig.lit.emissiveIntensity = 1.4 * on;
      // Glas bei Tag wie gebaut, ab einem Viertel der Dämmerung leuchtend (beide übersetzt).
      for (const g of rig.glass) {
        const next = on >= 0.25 ? rig.lit : g.day;
        if (g.mesh.material !== next) g.mesh.material = next;
      }
      for (const light of rig.lights) {
        light.diffuse = lantern;
        light.specular = lantern.scale(0.5);
        light.intensity = s.lanternIntensity;
        light.range = s.lanternRange;
      }
      rig.flies?.setFade(s.fireflies);
    }
    options.tileGlow?.(s.tileGlow);
  }

  /** Überblendung des Himmels beginnen bzw. abschließen. */
  function beginSkyFade(target: LightMood): void {
    const next = readySkies.get(target.sky.hdri) ?? null;
    if (!baseSky || !next || next === baseSky) return;
    fadeSky = next;
    next.box.material = next.fade;
    next.fade.alpha = 0;
    next.box.scaling.setAll(FADE_SKY_SCALE);
    next.box.alphaIndex = 0;
    next.box.isVisible = true;
  }
  function finishSkyFade(): void {
    if (!fadeSky || !baseSky) return;
    baseSky.box.isVisible = false;
    fadeSky.box.material = fadeSky.opaque;
    fadeSky.box.scaling.setAll(1);
    fadeSky.box.alphaIndex = -1;
    baseSky = fadeSky;
    fadeSky = null;
    scene.environmentTexture = baseSky.env;
  }

  /** Wartet ein Übergang auf einen nachgeladenen Himmel? */
  let pending: { mood: LightMood; durationMs: number } | null = null;

  function startMood(target: LightMood, durationMs: number): void {
    // Ein laufender Übergang springt ans Ende (Runden wechseln nie schneller als 4 s).
    if (transition.active) {
      transition.advance(Number.MAX_SAFE_INTEGER);
      finishSkyFade();
    }
    transition.setTarget(target.id, durationMs);
    beginSkyFade(target);
    const snap = transition.current;
    applyState(snap);
    if (snap.progress >= 1) finishSkyFade();
  }

  applyState(transition.current);

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

  let lastSeconds: number | null = null;

  return {
    shadows,
    get quality() {
      return level;
    },
    get transition() {
      return transition.current;
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
    setMood(target, durationMs = MOOD_TRANSITION_MS) {
      if (target.id === (pending?.mood.id ?? transition.current.to)) return;
      if (!moods.has(target.id)) {
        moods.set(target.id, target);
        // Notfall (nicht angekündigt): Nachtlichter jetzt bauen, kostet einmal Übersetzen.
        if (!rig && target.night) rig = buildNightRig();
      }
      if (!baseSky || readySkies.has(target.sky.hdri)) {
        pending = null;
        startMood(target, durationMs);
        return;
      }
      pending = { mood: target, durationMs: durationMs };
      void skyFor(target).then(
        () => {
          if (pending?.mood.id !== target.id || scene.isDisposed) return;
          pending = null;
          startMood(target, durationMs);
        },
        () => {
          // Himmel fehlt: Licht trotzdem überblenden, der alte Himmel bleibt stehen.
          if (pending?.mood.id !== target.id || scene.isDisposed) return;
          pending = null;
          startMood(target, durationMs);
        },
      );
    },
    update(seconds) {
      const dtMs = lastSeconds === null ? 0 : Math.max(0, (seconds - lastSeconds) * 1000);
      lastSeconds = seconds;
      rig?.flies?.update(seconds);
      if (transition.active) {
        const snap = transition.advance(dtMs);
        applyState(snap);
        if (snap.progress >= 1) finishSkyFade();
      }
    },
  };
}
