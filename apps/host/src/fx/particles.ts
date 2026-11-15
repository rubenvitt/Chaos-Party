/**
 * Partikel-Effekte für Minispiele (CHAOS-33): kurze Ausbrüche (`burst`) für alle `VFX_IDS`.
 * Texturen entstehen prozedural als RGBA-Pixel (`particleTexturePixels`, keine Bilddateien).
 * Jeder Ausbruch ist ein eigenes `ParticleSystem`, das sich nach dem Verglühen selbst
 * entsorgt; `dispose()` räumt alles Übrige samt Texturen weg (Szenen-Rest = 0).
 */
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import '@babylonjs/core/Particles/particleSystemComponent.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Vec3Like, VfxId } from '@chaos-party/minigame-sdk/babylon';

export type ParticleShape = 'dot' | 'star' | 'square' | 'ring';

export interface VfxPreset {
  readonly description: string;
  readonly shape: ParticleShape;
  /** Zahl der Partikel je Ausbruch. */
  readonly count: number;
  /** Lebensdauer in s [min, max]. */
  readonly lifetime: readonly [number, number];
  /** Größe in Welteinheiten [min, max]. */
  readonly size: readonly [number, number];
  /** Startgeschwindigkeit [min, max]. */
  readonly speed: readonly [number, number];
  /** Schwerkraft (negativ = fällt). */
  readonly gravity: number;
  /** `sphere` = in alle Richtungen, `up` = Fontäne nach oben, `flat` = flach am Boden. */
  readonly spread: 'sphere' | 'up' | 'flat';
  /** Zwei Grundfarben (zufällig gemischt), wenn `burst` keine Farbe nennt. */
  readonly colors: readonly [string, string];
  readonly additive: boolean;
}

export const VFX_PRESETS: Readonly<Record<VfxId, VfxPreset>> = {
  sparkle: {
    description: 'Goldene Glitzersterne (Punkte, Einsammeln)',
    shape: 'star',
    count: 24,
    lifetime: [0.35, 0.7],
    size: [0.18, 0.36],
    speed: [1.5, 3.2],
    gravity: -1,
    spread: 'sphere',
    colors: ['#fff4a3', '#ffd23f'],
    additive: true,
  },
  dust: {
    description: 'Staubwölkchen am Boden (Landen, Bremsen)',
    shape: 'dot',
    count: 14,
    lifetime: [0.4, 0.8],
    size: [0.3, 0.6],
    speed: [0.6, 1.4],
    gravity: 0.4,
    spread: 'flat',
    colors: ['#e9dcc3', '#c8b48f'],
    additive: false,
  },
  confetti: {
    description: 'Bunte Konfetti-Fontäne (Sieg)',
    shape: 'square',
    count: 60,
    lifetime: [1.0, 1.8],
    size: [0.12, 0.22],
    speed: [4, 7],
    gravity: -6,
    spread: 'up',
    colors: ['#ff5d8f', '#3ec1ff'],
    additive: false,
  },
  impact: {
    description: 'Weißer Aufprall-Ring (Treffer)',
    shape: 'ring',
    count: 10,
    lifetime: [0.18, 0.32],
    size: [0.4, 0.8],
    speed: [2, 4],
    gravity: 0,
    spread: 'sphere',
    colors: ['#ffffff', '#ffe9b0'],
    additive: true,
  },
  splash: {
    description: 'Wasserspritzer (Reinfallen)',
    shape: 'dot',
    count: 30,
    lifetime: [0.5, 0.9],
    size: [0.12, 0.26],
    speed: [3, 5.5],
    gravity: -9,
    spread: 'up',
    colors: ['#9be7ff', '#3aa7e8'],
    additive: false,
  },
  stars: {
    description: 'Kreisende Benommenheits-Sterne (umgehauen)',
    shape: 'star',
    count: 8,
    lifetime: [0.6, 1.0],
    size: [0.22, 0.34],
    speed: [0.8, 1.4],
    gravity: 0.6,
    spread: 'flat',
    colors: ['#fff07a', '#ffffff'],
    additive: true,
  },
  smoke: {
    description: 'Graue Rauchwölkchen (Puff, Ausscheiden)',
    shape: 'dot',
    count: 16,
    lifetime: [0.7, 1.2],
    size: [0.5, 0.9],
    speed: [0.4, 1.0],
    gravity: 1.2,
    spread: 'sphere',
    colors: ['#b8b2c8', '#7f7a91'],
    additive: false,
  },
};

/** Kantenlänge der prozeduralen Partikeltexturen (Pixel). */
export const PARTICLE_TEXTURE_SIZE = 32;

/**
 * RGBA-Pixel einer weißen Partikelform mit weicher Kante (Farbe kommt vom Partikel).
 * Rein und deterministisch.
 */
export function particleTexturePixels(
  shape: ParticleShape,
  size = PARTICLE_TEXTURE_SIZE,
): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const alpha = shapeAlpha(shape, dx, dy);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  return data;
}

/** Deckkraft 0…1 an der Stelle (dx, dy) ∈ [-1, 1]². */
function shapeAlpha(shape: ParticleShape, dx: number, dy: number): number {
  const r = Math.hypot(dx, dy);
  switch (shape) {
    case 'dot':
      return 1 - smooth(0.55, 1, r);
    case 'ring':
      return 1 - smooth(0.12, 0.3, Math.abs(r - 0.72));
    case 'square': {
      const edge = Math.max(Math.abs(dx), Math.abs(dy));
      return 1 - smooth(0.7, 0.9, edge);
    }
    case 'star': {
      // Fünfzackiger Stern: Radius schwankt mit dem Winkel.
      const angle = Math.atan2(dy, dx);
      const limit = 0.5 + 0.45 * Math.pow(Math.abs(Math.cos((angle * 5) / 2)), 3);
      return 1 - smooth(limit - 0.12, limit, r);
    }
  }
}

function smooth(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface ParticleFx {
  burst(id: VfxId, at: Vec3Like, color?: string): void;
  /** Laufende Ausbrüche (Tests). */
  readonly active: number;
  dispose(): void;
}

/** Höchstens so viele Ausbrüche gleichzeitig (Schutz vor Effekt-Fluten). */
export const MAX_ACTIVE_BURSTS = 24;

export function createParticleFx(scene: Scene): ParticleFx {
  const textures = new Map<ParticleShape, RawTexture>();
  const systems = new Set<ParticleSystem>();
  let disposed = false;

  const textureFor = (shape: ParticleShape): RawTexture => {
    let texture = textures.get(shape);
    if (!texture) {
      texture = RawTexture.CreateRGBATexture(
        particleTexturePixels(shape),
        PARTICLE_TEXTURE_SIZE,
        PARTICLE_TEXTURE_SIZE,
        scene,
        false,
        false,
        Texture.BILINEAR_SAMPLINGMODE,
      );
      texture.name = `fx-textur-${shape}`;
      textures.set(shape, texture);
    }
    return texture;
  };

  return {
    burst(id, at, color) {
      if (disposed || systems.size >= MAX_ACTIVE_BURSTS) return;
      const preset = VFX_PRESETS[id];
      const system = new ParticleSystem(`fx-${id}`, preset.count, scene);
      system.particleTexture = textureFor(preset.shape);
      system.emitter = new Vector3(at.x, at.y, at.z);
      system.minEmitBox = new Vector3(-0.15, 0, -0.15);
      system.maxEmitBox = new Vector3(0.15, 0.1, 0.15);
      switch (preset.spread) {
        case 'sphere':
          system.createSphereEmitter(0.2, 1);
          break;
        case 'up':
          system.direction1 = new Vector3(-0.45, 1, -0.45);
          system.direction2 = new Vector3(0.45, 1, 0.45);
          break;
        case 'flat':
          system.direction1 = new Vector3(-1, 0.15, -1);
          system.direction2 = new Vector3(1, 0.35, 1);
          break;
      }
      const [first, second] = color
        ? [color, mixWithWhite(color, 0.45)]
        : [preset.colors[0], preset.colors[1]];
      system.color1 = Color4.FromHexString(`${first}ff`);
      system.color2 = Color4.FromHexString(`${second}ff`);
      system.colorDead = new Color4(system.color2.r, system.color2.g, system.color2.b, 0);
      system.minLifeTime = preset.lifetime[0];
      system.maxLifeTime = preset.lifetime[1];
      system.minSize = preset.size[0];
      system.maxSize = preset.size[1];
      system.minEmitPower = preset.speed[0];
      system.maxEmitPower = preset.speed[1];
      system.minAngularSpeed = -4;
      system.maxAngularSpeed = 4;
      system.gravity = new Vector3(0, preset.gravity, 0);
      system.blendMode = preset.additive
        ? ParticleSystem.BLENDMODE_ADD
        : ParticleSystem.BLENDMODE_STANDARD;
      system.updateSpeed = 1 / 60;
      system.manualEmitCount = preset.count;
      system.targetStopDuration = 0.1;
      system.disposeOnStop = true;
      system.onDisposeObservable.addOnce(() => {
        systems.delete(system);
      });
      systems.add(system);
      system.start();
    },
    get active() {
      return systems.size;
    },
    dispose() {
      disposed = true;
      for (const system of [...systems]) system.dispose(false);
      systems.clear();
      for (const texture of textures.values()) texture.dispose();
      textures.clear();
    },
  };
}

/** `#rrggbb` aufgehellt (t = 0 … 1 Richtung Weiß). */
export function mixWithWhite(hex: string, t: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) return '#ffffff';
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 0xff;
    return Math.round(c + (255 - c) * t)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}
