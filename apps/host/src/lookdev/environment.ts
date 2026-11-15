/**
 * Prozedurales Umgebungslicht (CHAOS-56, Look-Dev): ein Himmel als Funktion der Richtung,
 * im Speicher als Radiance-HDR (RGBE, unkomprimiert) kodiert und über `HDRCubeTexture`
 * geladen. Babylon berechnet daraus die sphärischen Harmonischen (diffuses Umgebungslicht) und
 * filtert die Spiegelungen vor – ohne heruntergeladene HDRI-Dateien (Lizenz/Größe).
 */
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture.js';
import type { Scene } from '@babylonjs/core/scene.js';

export type Rgb = readonly [number, number, number];

export interface SkySpec {
  /** Farbe senkrecht oben (linear, HDR erlaubt). */
  readonly zenith: Rgb;
  /** Farbe am Horizont. */
  readonly horizon: Rgb;
  /** Farbe unter dem Horizont (Bodenreflex). */
  readonly ground: Rgb;
  /** Richtung zur Sonne (wird normalisiert). */
  readonly sunDirection: Rgb;
  /** Farbe/Stärke der Sonnenscheibe und ihres Hofs. */
  readonly sun: Rgb;
  /** Breite des Hofs (größer = schmaler). */
  readonly sunSharpness: number;
}

const WIDTH = 256;
const HEIGHT = 128;

function mix(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Himmelsfarbe für eine Richtung (x, y, z), y = oben. */
export function skyColor(spec: SkySpec, x: number, y: number, z: number): [number, number, number] {
  let color: [number, number, number];
  if (y >= 0) {
    color = mix(spec.horizon, spec.zenith, Math.pow(y, 0.55));
  } else {
    color = mix(spec.horizon, spec.ground, Math.min(1, Math.pow(-y, 0.4) * 1.4));
  }
  const [sx, sy, sz] = spec.sunDirection;
  const len = Math.hypot(sx, sy, sz) || 1;
  const cos = Math.max(0, (x * sx + y * sy + z * sz) / len);
  const glow = Math.pow(cos, spec.sunSharpness) + Math.pow(cos, 2000) * 40;
  return [
    color[0] + spec.sun[0] * glow,
    color[1] + spec.sun[1] * glow,
    color[2] + spec.sun[2] * glow,
  ];
}

/** RGBE-Kodierung eines linearen Farbwerts (Radiance-Format). */
function toRgbe(r: number, g: number, b: number, out: Uint8Array, offset: number): void {
  const max = Math.max(r, g, b);
  if (max < 1e-32) {
    out[offset] = out[offset + 1] = out[offset + 2] = out[offset + 3] = 0;
    return;
  }
  const exponent = Math.ceil(Math.log2(max));
  const scale = 256 / Math.pow(2, exponent);
  out[offset] = Math.min(255, Math.floor(r * scale));
  out[offset + 1] = Math.min(255, Math.floor(g * scale));
  out[offset + 2] = Math.min(255, Math.floor(b * scale));
  out[offset + 3] = exponent + 128;
}

/**
 * Equirektangulares Panorama als Radiance-HDR. Babylon liest die Zeilen von unten nach oben
 * (`invertY`), daher zeigt Zeile 0 nach unten (φ = π) und die letzte Zeile zum Zenit.
 */
export function encodeSkyHdr(spec: SkySpec): Uint8Array {
  const header = new TextEncoder().encode(
    `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${String(HEIGHT)} +X ${String(WIDTH)}\n`,
  );
  const bytes = new Uint8Array(header.length + WIDTH * HEIGHT * 4);
  bytes.set(header, 0);
  for (let row = 0; row < HEIGHT; row++) {
    const phi = ((HEIGHT - 1 - row + 0.5) / HEIGHT) * Math.PI;
    for (let col = 0; col < WIDTH; col++) {
      const theta = ((col + 0.5) / WIDTH) * 2 * Math.PI - Math.PI;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      const [r, g, b] = skyColor(spec, x, y, z);
      toRgbe(r, g, b, bytes, header.length + (row * WIDTH + col) * 4);
    }
  }
  // Ein Zeilenanfang 2,2 würde als RLE gelesen – erstes Pixel minimal verschieben.
  const first = header.length;
  if (bytes[first] === 2 && bytes[first + 1] === 2) bytes[first] = 3;
  return bytes;
}

/** Umgebungstextur aus dem Himmel (Harmonische + vorgefilterte Spiegelungen). */
export function createSkyEnvironment(scene: Scene, spec: SkySpec): HDRCubeTexture {
  const bytes = encodeSkyHdr(spec);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/vnd.radiance' }));
  // size, noMipmap, generateHarmonics, gammaSpace, prefilterOnLoad
  const texture = new HDRCubeTexture(url, scene, 128, false, true, false, true);
  texture.name = 'himmel-hdr';
  return texture;
}
