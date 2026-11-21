/**
 * Bühne eines Minispiels (aus Sockenregen, Kuckucks-Klatsche, Wackelturm und Pudding-Gerangel
 * herausgelöst): sammelt alles Angelegte für `dispose()`, liefert Materialien im Look des Hosts
 * (`ctx.look`, ADR-014) oder ohne Look als einfache `StandardMaterial`, teilt gleiche Wünsche
 * und baut ohne Look ein Grundlicht.
 *
 * Gehört dem Minispiel: Es erzeugt die Bühne in `prepare` und ruft in `dispose` `stage.dispose()`.
 */
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { LookArea, LookFinish, MinigameContext } from '@chaos-party/minigame-sdk/babylon';
import { markVisual } from '@chaos-party/minigame-sdk/babylon';

export interface StageMaterialOptions {
  /** Eigenleuchten als Anteil der Farbe, 0–1. */
  readonly emissive?: number;
  readonly alpha?: number;
  /** Nur mit Look wirksam. */
  readonly finish?: LookFinish;
  readonly translucency?: number;
}

export interface Disposable {
  dispose(): void;
}

export class MinigameStage {
  private readonly disposables: Disposable[] = [];
  private readonly materials = new Map<string, Material>();

  /** `prefix` beginnt alle Namen (Meshes, Materialien), z. B. „socken“. */
  constructor(
    readonly ctx: MinigameContext,
    readonly prefix: string,
  ) {}

  get scene(): Scene {
    return this.ctx.scene;
  }

  /** Name mit Präfix: `name('ring', 2)` → „socken-ring-2“. */
  name(...parts: (string | number)[]): string {
    return [this.prefix, ...parts.map(String)].join('-');
  }

  /** Zählt Angelegtes (eindeutige Nummern für Objekte). */
  get count(): number {
    return this.disposables.length;
  }

  track<T extends Disposable>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  /**
   * Leerer Knoten als Wurzel eines Objekts; mit `role` gekennzeichnet für native Hosts
   * (`markVisual`, Schlüssel = laufende Nummer, wenn keiner angegeben ist).
   */
  node(name: string, role?: string, key?: string | number): TransformNode {
    const n = this.count;
    const node = this.track(new TransformNode(this.name(name, n), this.scene));
    return role === undefined ? node : markVisual(node, role, key ?? n);
  }

  /** Mesh übernehmen: aufräumen, Material in `hex`, optional an `parent` hängen. */
  add<T extends Mesh>(
    mesh: T,
    hex: string,
    options: StageMaterialOptions & { readonly parent?: TransformNode } = {},
  ): T {
    this.track(mesh);
    mesh.material = this.material(hex, options);
    if (options.parent) mesh.parent = options.parent;
    return mesh;
  }

  /** Bild abgeben, wenn das Aufbau-Budget verbraucht ist (CHAOS-141). */
  async pace(): Promise<void> {
    await this.ctx.pace();
  }

  /**
   * Material im Look (oder ohne Look als `StandardMaterial`). Gleiche Wünsche teilen sich ein
   * Material; die Bühne entsorgt alle in `dispose()`.
   */
  material(hex: string, options: StageMaterialOptions = {}): Material {
    const key = [
      hex,
      String(options.emissive ?? 0),
      String(options.alpha ?? 1),
      options.finish ?? '',
      options.translucency === undefined ? '' : String(options.translucency),
    ].join('|');
    const cached = this.materials.get(key);
    if (cached) return cached;
    const look = this.ctx.look;
    let material: Material;
    if (look) {
      material = look.material(hex, {
        ...(options.emissive !== undefined ? { emissive: options.emissive } : {}),
        ...(options.alpha !== undefined ? { alpha: options.alpha } : {}),
        ...(options.finish !== undefined ? { finish: options.finish } : {}),
        ...(options.translucency !== undefined ? { translucency: options.translucency } : {}),
      });
    } else {
      const plain = new StandardMaterial(this.name('material', this.materials.size), this.scene);
      const color = Color3.FromHexString(hex);
      plain.diffuseColor = color;
      plain.specularColor = new Color3(0.12, 0.12, 0.12);
      if (options.emissive) plain.emissiveColor = color.scale(options.emissive);
      if (options.alpha !== undefined && options.alpha < 1) plain.alpha = options.alpha;
      material = plain;
    }
    this.materials.set(key, material);
    return material;
  }

  /**
   * Kulisse: mit Look `look.backdrop(area)` (Wiese/Decke, Himmel, Licht, Schatten), ohne Look
   * ein Grundlicht. Liefert, ob der Look die Kulisse gebaut hat (dann kein eigener Boden bis zum
   * Horizont und kein eigenes Licht).
   */
  backdrop(area: LookArea): boolean {
    if (this.ctx.look) {
      this.ctx.look.backdrop(area);
      return true;
    }
    this.fallbackLights();
    return false;
  }

  /** Grundlicht ohne Look (Himmel + Sonne), wie es Sockenregen hatte. */
  fallbackLights(): void {
    const hemi = new HemisphericLight(this.name('licht'), new Vector3(0.2, 1, -0.4), this.scene);
    hemi.intensity = 0.62;
    hemi.groundColor = new Color3(0.45, 0.4, 0.55);
    const sun = new DirectionalLight(this.name('sonne'), new Vector3(-0.35, -1, 0.45), this.scene);
    sun.intensity = 0.5;
    this.track(hemi);
    this.track(sun);
  }

  /** Alles entsorgen (rückwärts: Kinder vor Eltern), dann die Materialien. Idempotent. */
  dispose(): void {
    for (const item of this.disposables.splice(0).reverse()) item.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}
