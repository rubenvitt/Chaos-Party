/**
 * Materialien des Natur-Looks (CHAOS-62): PBR mit Poly-Haven-Texturen (Farbe, Normalen,
 * AO/Rauheit/Metall) oder einfarbig (lackiert, Laub, Metall …). Je Szene ein Satz; gleiche
 * Wünsche teilen sich ein Material. Die Szene räumt alles mit `scene.dispose()` weg.
 */
import type { Material } from '@babylonjs/core/Materials/material.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { textureUrl, type NatureTexture, type TextureMap } from './assets.ts';

export interface TexturedOptions {
  readonly u?: number;
  readonly v?: number;
  /** Farbstich (Hex), multipliziert mit der Textur. */
  readonly tint?: string;
  /** Stärke der Normalen. */
  readonly bump?: number;
  /** Eigener Cache-Schlüssel (sonst aus den Werten). */
  readonly key?: string;
}

export interface PlainOptions {
  readonly roughness?: number;
  readonly metallic?: number;
  readonly clearCoat?: number;
  /** Licht scheint durch (Blätter, Pudding). */
  readonly translucency?: number;
  /** Feine Struktur aus den Normalen einer Natur-Textur. */
  readonly bumpFrom?: NatureTexture;
  readonly bumpScale?: number;
  readonly alpha?: number;
  /** Eigenleuchten als Anteil der eigenen Farbe (Nachtstimmungen, Lesbarkeit). */
  readonly glow?: number;
  /** Ohne Licht (Leuchtpunkte, Signale). */
  readonly unlit?: boolean;
}

export class NatureMaterials {
  private readonly cache = new Map<string, Material>();
  private readonly textures = new Map<string, Texture>();
  private readonly reflections: boolean;
  private readonly detail: boolean;
  /**
   * Sparstufe (`quality.ts`): `reflections: false` (ohne HDRI-Umgebungslicht) zeigt Metall
   * matt lackiert, sonst bliebe es ohne Spiegelbild schwarz; `detail: false` lässt Normalen-
   * und AO/Rauheit-Karten, Klarlack und Durchscheinen weg (Software-GPUs).
   */
  constructor(
    private readonly scene: Scene,
    options: { readonly reflections?: boolean; readonly detail?: boolean } = {},
  ) {
    this.reflections = options.reflections ?? true;
    this.detail = options.detail ?? true;
  }

  private texture(id: NatureTexture, map: TextureMap, u: number, v: number): Texture {
    const key = `${id}|${map}|${String(u)}|${String(v)}`;
    const hit = this.textures.get(key);
    if (hit) return hit;
    const tex = new Texture(textureUrl(id, map), this.scene);
    tex.uScale = u;
    tex.vScale = v;
    if (map !== 'diff') tex.gammaSpace = false;
    this.textures.set(key, tex);
    return tex;
  }

  /** PBR mit Poly-Haven-Satz (Farbe, Normalen, AO/Rauheit/Metall). */
  textured(id: NatureTexture, options: TexturedOptions = {}): Material {
    const u = options.u ?? 1;
    const v = options.v ?? u;
    const key =
      options.key ??
      `${id}-${String(u)}-${String(v)}-${options.tint ?? ''}-${String(options.bump ?? 1)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const mat = new PBRMaterial(`natur-${key}`, this.scene);
    mat.albedoTexture = this.texture(id, 'diff', u, v);
    if (options.tint) mat.albedoColor = Color3.FromHexString(options.tint).toLinearSpace();
    if (!this.detail) {
      mat.metallic = 0;
      mat.roughness = 0.9;
      this.cache.set(key, mat);
      return mat;
    }
    const bump = this.texture(id, 'nor', u, v);
    bump.level = options.bump ?? 1;
    mat.bumpTexture = bump;
    // Poly Haven liefert OpenGL-Normalen; Babylon ist linkshändig.
    mat.invertNormalMapX = true;
    mat.metallicTexture = this.texture(id, 'arm', u, v);
    mat.useAmbientOcclusionFromMetallicTextureRed = true;
    mat.useRoughnessFromMetallicTextureGreen = true;
    mat.useMetallnessFromMetallicTextureBlue = true;
    mat.metallic = 1;
    mat.roughness = 1;
    this.cache.set(key, mat);
    return mat;
  }

  /** Einfarbiges PBR (gemalt, lackiert, Laub …), gleiche Wünsche teilen ein Material. */
  plain(hex: string, options: PlainOptions = {}): Material {
    const key = `${hex}-${JSON.stringify(options)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const mat = this.fresh(hex, options, `natur-${key}`);
    this.cache.set(key, mat);
    return mat;
  }

  /** Wie `plain`, aber immer ein eigenes Material (gehört dem Aufrufer). */
  fresh(hex: string, wanted: PlainOptions = {}, name = `natur-${hex}`): Material {
    const options: PlainOptions = this.detail
      ? wanted
      : {
          ...(wanted.roughness !== undefined ? { roughness: wanted.roughness } : {}),
          ...(wanted.metallic !== undefined ? { metallic: wanted.metallic } : {}),
          ...(wanted.alpha !== undefined ? { alpha: wanted.alpha } : {}),
          ...(wanted.glow !== undefined ? { glow: wanted.glow } : {}),
          ...(wanted.unlit !== undefined ? { unlit: wanted.unlit } : {}),
        };
    const mat = new PBRMaterial(name, this.scene);
    const color = Color3.FromHexString(hex);
    if (options.unlit) {
      mat.unlit = true;
      mat.albedoColor = Color3.Black();
      mat.emissiveColor = color;
    } else {
      mat.albedoColor = color.toLinearSpace();
    }
    mat.roughness = options.roughness ?? 0.6;
    mat.metallic = this.reflections
      ? (options.metallic ?? 0)
      : Math.min(0.25, options.metallic ?? 0);
    if (options.clearCoat) {
      mat.clearCoat.isEnabled = true;
      mat.clearCoat.intensity = options.clearCoat;
      mat.clearCoat.roughness = 0.1;
    }
    if (options.translucency) {
      mat.subSurface.isTranslucencyEnabled = true;
      mat.subSurface.translucencyIntensity = options.translucency;
      mat.subSurface.tintColor = color;
    }
    if (options.bumpFrom) {
      const scale = options.bumpScale ?? 2;
      const bump = this.texture(options.bumpFrom, 'nor', scale, scale);
      bump.level = 0.8;
      mat.bumpTexture = bump;
      mat.invertNormalMapX = true;
    }
    if (options.alpha !== undefined && options.alpha < 1) mat.alpha = options.alpha;
    if (options.glow && !options.unlit) mat.emissiveColor = color.scale(options.glow);
    return mat;
  }

  /** Alle bisher erzeugten Materialien (z. B. um die Lichterzahl je Material anzuheben). */
  all(): Material[] {
    return [...this.cache.values()];
  }
}
