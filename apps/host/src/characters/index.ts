/**
 * Figuren im Host (CHAOS-27/28): lädt die generierten GLB-Figuren aus `@chaos-party/assets`
 * (`packages/assets/models/characters/<id>.glb`, Manifest + Prüfung `pnpm check:assets`).
 *
 * `loadCharacters(scene)` lädt alle Figuren für **eine** Szene vor (je Figur ein
 * `AssetContainer`, asynchron); danach erzeugt `create()` Figuren synchron (Vertrag
 * `CharacterFactory` aus dem minigame-sdk). `dispose()` entfernt alles Vorgeladene. Brett,
 * Lobby-Vitrine und Minispiele nutzen dieselbe Bibliothek.
 *
 * Je Figur: eigene Materialkopien (das Material `akzent` in Slot-Farbe), Slot-Abzeichen auf der
 * Brust (Symbol + Farbe), Animationen mit den Namen aus `CHARACTER_ANIMATIONS`
 * (idle/run als Schleife, sonst einmal und danach idle, weich überblendet).
 *
 * Die glTF-PBR-Materialien werden beim Laden in `StandardMaterial` umgewandelt: gleiche
 * Lichtwirkung wie das prozedurale Brett (Halbkugel- und Sonnenlicht, keine Umgebungstextur).
 */
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';
import type { AssetContainer } from '@babylonjs/core/assetContainer.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Observer } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import cactusUrl from '@chaos-party/assets/models/characters/cactus.glb?url';
import raccoonUrl from '@chaos-party/assets/models/characters/raccoon.glb?url';
import robotUrl from '@chaos-party/assets/models/characters/robot.glb?url';
import sockUrl from '@chaos-party/assets/models/characters/sock.glb?url';
import { CHARACTER_IDS, type CharacterId } from '@chaos-party/minigame-sdk';
import type {
  CharacterAnimation,
  CharacterFactory,
  CharacterHandle,
  MinigamePlayer,
} from '@chaos-party/minigame-sdk/babylon';
import { createBadge } from './badge.ts';

/** Material, das die Slot-Farbe bekommt, und Ankerknoten des Abzeichens (wie im Generator). */
export const ACCENT_MATERIAL = 'akzent';
export const BADGE_NODE = 'abzeichen';
/** Gelenk, das Hüpfen und Squash & Stretch trägt (der Schattenkörper hängt daran). */
const BOUNCE_NODE = 'huepfer';

/**
 * Ebene nur für Schattenkörper: Kameras (Standard-Maske `0x0FFFFFFF`) zeigen sie nicht, der
 * Schattengenerator rendert seine Liste ohne Masken-Prüfung.
 */
export const SHADOW_ONLY_LAYER = 0x10000000;

/** URLs der GLB-Dateien (Vite kopiert sie in den Host-Build). */
export const CHARACTER_MODEL_URLS: Readonly<Record<CharacterId, string>> = {
  robot: robotUrl,
  cactus: cactusUrl,
  raccoon: raccoonUrl,
  sock: sockUrl,
};

/** Quelle je Figur: URL oder die Bytes der GLB-Datei (Tests in Node). */
export type CharacterSource = string | ArrayBufferView;

export interface LoadCharactersOptions {
  readonly sources?: Partial<Readonly<Record<CharacterId, CharacterSource>>>;
}

/** Host-Erweiterung des Vertrags (additiv): Meshes, aktuelle Animation, Transparenz. */
export interface HostCharacterHandle extends CharacterHandle {
  /** Alle sichtbaren Meshes der Figur (inkl. Abzeichen). */
  readonly meshes: readonly AbstractMesh[];
  /**
   * Unsichtbarer, grober Schattenkörper (Kapsel, hüpft und staucht mit). Für
   * `ShadowGenerator.addShadowCaster` – viel günstiger als alle Detail-Meshes, besonders mit
   * Software-Rendering (CI). Nur in Schattenkarten sichtbar (`SHADOW_ONLY_LAYER`).
   */
  readonly shadowCaster: Mesh;
  /** Zuletzt gestartete Animation (nach einer Einmal-Animation wieder `idle`). */
  readonly animation: CharacterAnimation;
  /** Deckkraft 0…1 (getrennte Spieler halbtransparent). */
  setOpacity(alpha: number): void;
}

export interface CharacterLibrary extends CharacterFactory {
  create(scene: Scene, player: MinigamePlayer): HostCharacterHandle;
  dispose(): void;
}

const LOOPING: ReadonlySet<CharacterAnimation> = new Set(['idle', 'run']);
/** Anteil je Frame, mit dem eine neue Animation die alte überblendet. */
const BLENDING_SPEED = 0.12;

/** glTF-PBR → StandardMaterial (sRGB zurück aus linear, wenig Glanz, leichtes Eigenleuchten). */
function toStandard(scene: Scene, source: Material): StandardMaterial {
  const mat = new StandardMaterial(source.name, scene);
  const pbr = source instanceof PBRMaterial ? source : null;
  const color = (pbr?.albedoColor ?? new Color3(0.8, 0.8, 0.8)).toGammaSpace();
  const roughness = pbr?.roughness ?? 0.8;
  mat.diffuseColor = color;
  mat.emissiveColor = color.scale(0.14);
  const shine = Math.max(0, 0.9 - roughness) * 0.5;
  mat.specularColor = new Color3(0.05 + shine, 0.05 + shine, 0.05 + shine);
  mat.specularPower = 48;
  return mat;
}

async function loadContainer(
  scene: Scene,
  id: CharacterId,
  source: CharacterSource,
): Promise<AssetContainer> {
  const container = await LoadAssetContainerAsync(
    source instanceof ArrayBuffer || ArrayBuffer.isView(source)
      ? new Uint8Array(
          ArrayBuffer.isView(source) ? source.buffer : source,
          ArrayBuffer.isView(source) ? source.byteOffset : 0,
          ArrayBuffer.isView(source) ? source.byteLength : undefined,
        )
      : source,
    scene,
    {
      pluginExtension: '.glb',
      name: `${id}.glb`,
      pluginOptions: { gltf: { animationStartMode: GLTFLoaderAnimationStartMode.NONE } },
    },
  );
  // Materialien tauschen (in den Container, nicht in die Szene).
  const replaced = new Map<Material, StandardMaterial>();
  for (const old of container.materials) {
    const mat = toStandard(scene, old);
    scene.removeMaterial(mat);
    replaced.set(old, mat);
  }
  for (const mesh of container.meshes) {
    const mat = mesh.material ? replaced.get(mesh.material) : undefined;
    if (mat) mesh.material = mat;
  }
  for (const old of replaced.keys()) old.dispose();
  container.materials.length = 0;
  container.materials.push(...replaced.values());
  for (const group of container.animationGroups) group.stop();
  return container;
}

/** Name ohne Klon-Endung (`akzent#2` → `akzent`). */
function baseName(name: string): string {
  const hash = name.indexOf('#');
  return hash < 0 ? name : name.slice(0, hash);
}

let instanceCounter = 0;

function instantiate(
  scene: Scene,
  container: AssetContainer,
  player: MinigamePlayer,
  onDispose: (handle: HostCharacterHandle) => void,
): HostCharacterHandle {
  const tag = `${String(player.slot)}-${String(++instanceCounter)}`;
  const entries = container.instantiateModelsToScene((name) => `${name}#${tag}`, true, {
    doNotInstantiate: true,
  });
  const root = new TransformNode(`figur-${tag}`, scene);
  for (const node of entries.rootNodes) node.parent = root;

  const meshes: AbstractMesh[] = root.getChildMeshes(false);
  const materials = new Set<Material>();
  for (const mesh of meshes) {
    mesh.isPickable = false;
    if (mesh.material) materials.add(mesh.material);
  }
  const accent = Color3.FromHexString(player.color);
  for (const mat of materials) {
    if (baseName(mat.name) === ACCENT_MATERIAL && mat instanceof StandardMaterial) {
      mat.diffuseColor = accent;
      mat.emissiveColor = accent.scale(0.22);
    }
  }

  // Abzeichen: Der glTF-Wurzelknoten spiegelt (Händigkeit); ein Halter gleicht das aus,
  // damit +Z des Abzeichens nach vorn zeigt.
  const anchor = root
    .getChildTransformNodes(false)
    .find((node) => baseName(node.name) === BADGE_NODE);
  let badge: ReturnType<typeof createBadge> | null = null;
  if (anchor) {
    root.computeWorldMatrix(true);
    const world = anchor.computeWorldMatrix(true).getRotationMatrix().m;
    const holder = new TransformNode(`abzeichen-halter-${tag}`, scene);
    holder.parent = anchor;
    holder.scaling = new Vector3(
      Math.sign(world[0] ?? 1) || 1,
      Math.sign(world[5] ?? 1) || 1,
      Math.sign(world[10] ?? 1) || 1,
    );
    badge = createBadge(scene, holder, player.slot, player.color, `figur-${tag}`);
    meshes.push(...badge.meshes);
  }

  // Grober Schattenkörper aus der Ruhepose (Höhe und Breite der Figur).
  const bounds = root.getHierarchyBoundingVectors(true);
  const height = Math.max(0.5, bounds.max.y - bounds.min.y);
  const radius = Math.min(
    0.42,
    Math.max(0.2, 0.75 * Math.max(bounds.max.x, -bounds.min.x, bounds.max.z, -bounds.min.z)),
  );
  const shadowCaster = CreateCapsule(
    `figur-${tag}-schatten`,
    { height, radius, tessellation: 10, capSubdivisions: 2 },
    scene,
  );
  shadowCaster.position.y = height / 2;
  shadowCaster.layerMask = SHADOW_ONLY_LAYER;
  shadowCaster.isPickable = false;
  shadowCaster.parent =
    root.getChildTransformNodes(false).find((node) => baseName(node.name) === BOUNCE_NODE) ?? root;

  const groups = new Map<CharacterAnimation, AnimationGroup>();
  for (const group of entries.animationGroups) {
    group.stop();
    group.enableBlending = true;
    group.blendingSpeed = BLENDING_SPEED;
    groups.set(baseName(group.name) as CharacterAnimation, group);
  }

  let current: CharacterAnimation = 'idle';
  let endObserver: Observer<AnimationGroup> | null = null;
  let disposed = false;

  const play = (animation: CharacterAnimation): void => {
    if (disposed) return;
    const next = groups.get(animation);
    if (!next) return;
    const loop = LOOPING.has(animation);
    if (loop && current === animation && next.isPlaying) return;
    if (endObserver) {
      endObserver.remove();
      endObserver = null;
    }
    for (const group of groups.values()) if (group.isPlaying) group.stop();
    current = animation;
    next.start(loop, 1, next.from, next.to);
    if (!loop) {
      endObserver = next.onAnimationGroupEndObservable.addOnce(() => {
        endObserver = null;
        if (!disposed && current === animation) play('idle');
      });
    }
  };

  play('idle');

  const handle: HostCharacterHandle = {
    root,
    id: player.character,
    meshes,
    shadowCaster,
    get animation() {
      return current;
    },
    play,
    setOpacity(alpha) {
      for (const mesh of meshes) mesh.visibility = alpha;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (endObserver) endObserver.remove();
      for (const group of groups.values()) {
        group.stop();
        group.dispose();
      }
      badge?.dispose();
      shadowCaster.dispose();
      entries.dispose();
      for (const mat of materials) mat.dispose();
      root.dispose(false, false);
      onDispose(handle);
    },
  };
  return handle;
}

/**
 * Lädt alle vier Figuren für `scene` (je Figur ein `AssetContainer`). Schlägt das Laden einer
 * Figur fehl, lehnt das Promise ab (der Aufrufer zeigt dann eine Fehlermeldung).
 */
export async function loadCharacters(
  scene: Scene,
  options: LoadCharactersOptions = {},
): Promise<CharacterLibrary> {
  const containers = new Map<CharacterId, AssetContainer>();
  try {
    await Promise.all(
      CHARACTER_IDS.map(async (id) => {
        const source = options.sources?.[id] ?? CHARACTER_MODEL_URLS[id];
        containers.set(id, await loadContainer(scene, id, source));
      }),
    );
  } catch (error) {
    for (const container of containers.values()) container.dispose();
    throw error;
  }
  let disposed = false;
  const handles = new Set<HostCharacterHandle>();
  return {
    create(target, player) {
      if (target !== scene) throw new Error('Figur gehört zu einer anderen Szene');
      if (disposed) throw new Error('Figuren-Bibliothek wurde schon entsorgt');
      const container = containers.get(player.character);
      if (!container) throw new Error(`Unbekannte Figur: ${player.character}`);
      const handle = instantiate(scene, container, player, (gone) => handles.delete(gone));
      handles.add(handle);
      return handle;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const handle of [...handles]) handle.dispose();
      for (const container of containers.values()) container.dispose();
      containers.clear();
    },
  };
}
