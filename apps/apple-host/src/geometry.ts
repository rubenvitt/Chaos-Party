/**
 * Geometrie der Minispiel-Meshes für den Apple-Host (CHAOS-144, ADR-019 §3 Nachtrag 2).
 *
 * Die Minispiele bauen ihre Requisiten aus Babylon-Grundkörpern und eigenen Vertexdaten. Statt
 * jede Rolle in Swift nachzubauen, schickt der Kern die echte Geometrie einmal je Minispiel an
 * Swift: dedupliziert (gleiche Vertexdaten = ein Eintrag), um die Mitte der lokalen
 * Bounding-Box verschoben und binär als Base64 (Float32-Positionen, Int8-Normalen,
 * Uint16/Uint32-Indizes, little-endian). Je Bild bewegt Swift nur noch Körper mit `mesh`-Verweis.
 *
 * Koordinaten bleiben roh (Babylon, linkshändig); Swift spiegelt z (die Dreiecksreihenfolge bleibt).
 */
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { MinigameGeometry } from './contract.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Standard-Base64 mit Auffüllung (Swift: `Data(base64Encoded:)`) von `bytes[from, to)`; `from`
 * muss durch 3 teilbar sein, `to` ebenso oder das Ende. So lässt sich ein langes Array in
 * Stücken kodieren (über mehrere Bilder). JSC hat kein `btoa`.
 */
export function base64(bytes: Uint8Array, from = 0, to = bytes.length): string {
  const parts: string[] = [];
  let line = '';
  const end = Math.min(to, bytes.length);
  const full = end - ((end - from) % 3);
  for (let i = from; i < full; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    line +=
      ALPHABET.charAt(n >>> 18) +
      ALPHABET.charAt((n >>> 12) & 63) +
      ALPHABET.charAt((n >>> 6) & 63) +
      ALPHABET.charAt(n & 63);
    // Lange Zeichenketten in Stücken: hält die Verkettung in JavaScriptCore flach.
    if (line.length >= 4096) {
      parts.push(line);
      line = '';
    }
  }
  const rest = end - full;
  if (rest === 1) {
    const n = (bytes[full] ?? 0) << 16;
    line += `${ALPHABET.charAt(n >>> 18)}${ALPHABET.charAt((n >>> 12) & 63)}==`;
  } else if (rest === 2) {
    const n = ((bytes[full] ?? 0) << 16) | ((bytes[full + 1] ?? 0) << 8);
    line += `${ALPHABET.charAt(n >>> 18)}${ALPHABET.charAt((n >>> 12) & 63)}${ALPHABET.charAt((n >>> 6) & 63)}=`;
  }
  parts.push(line);
  return parts.join('');
}

/** Rohdaten eines Meshes, wie sie in den Katalog gehen (vor dem Kodieren). */
export interface MeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  /** Mitte der lokalen Bounding-Box (um sie ist die Geometrie verschoben). */
  readonly center: readonly [number, number, number];
  /** Kantenlängen der lokalen Bounding-Box. */
  readonly extent: readonly [number, number, number];
}

/**
 * Vertexdaten eines Meshes (bei `InstancedMesh` die der Quelle), um die Mitte der lokalen
 * Bounding-Box verschoben. `null`, wenn das Mesh keine Dreiecke hat.
 */
export function readMeshData(mesh: AbstractMesh): MeshData | null {
  const source = (mesh as { sourceMesh?: AbstractMesh }).sourceMesh ?? mesh;
  const raw = source.getVerticesData(VertexBuffer.PositionKind);
  if (!raw || raw.length < 9) return null;
  const count = raw.length / 3;
  const rawIndices = source.getIndices();
  const indices = new Uint32Array(
    rawIndices && rawIndices.length >= 3 ? rawIndices : Array.from({ length: count }, (_, i) => i),
  );
  if (indices.length < 3) return null;
  let rawNormals = source.getVerticesData(VertexBuffer.NormalKind);
  if (rawNormals?.length !== raw.length) {
    const computed: number[] = [];
    VertexData.ComputeNormals(raw, indices, computed);
    rawNormals = computed;
  }
  const { minimum, maximum } = mesh.getBoundingInfo().boundingBox;
  const center: [number, number, number] = [
    (minimum.x + maximum.x) / 2,
    (minimum.y + maximum.y) / 2,
    (minimum.z + maximum.z) / 2,
  ];
  const positions = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i += 3) {
    positions[i] = (raw[i] ?? 0) - center[0];
    positions[i + 1] = (raw[i + 1] ?? 0) - center[1];
    positions[i + 2] = (raw[i + 2] ?? 0) - center[2];
  }
  return {
    positions,
    normals: Float32Array.from(rawNormals),
    indices,
    center,
    extent: [maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z],
  };
}

/** So viele Werte je Array fließen höchstens in den Schlüssel (Kosten begrenzt, ohne JIT). */
const KEY_SAMPLES = 4096;

/**
 * FNV-1a über Längen, Ausdehnung und (bei großen Meshes gleichmäßig ausgewählte) Positionen und
 * Indizes: gleiche Geometrie = gleicher Schlüssel. Gleiche Längen und Ausdehnung bei anderen
 * Werten genau zwischen den Stichproben sind praktisch ausgeschlossen (Builder-Meshes).
 */
export function geometryKey(data: MeshData): string {
  let hash = 0x811c9dc5;
  const mix = (word: number) => {
    hash ^= word & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (word >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (word >>> 16) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= word >>> 24;
    hash = Math.imul(hash, 0x01000193);
  };
  const bits = new Int32Array(
    data.positions.buffer,
    data.positions.byteOffset,
    data.positions.length,
  );
  const sample = (values: ArrayLike<number>) => {
    const stride = Math.max(1, Math.floor(values.length / KEY_SAMPLES));
    for (let i = 0; i < values.length; i += stride) mix(values[i] ?? 0);
    mix(values.length);
  };
  sample(bits);
  sample(data.indices);
  for (const value of data.extent) mix(Math.round(value * 1e4));
  return `${String(data.positions.length)}:${String(data.indices.length)}:${(hash >>> 0).toString(36)}`;
}

const round = (value: number) => Math.round(value * 1e4) / 1e4;

/** So viele Bytes kodiert ein Schritt (durch 3 teilbar). */
const STEP_BYTES = 12 * 1024;

/**
 * Eine Geometrie auf dem Weg zu Swift: Bytes stehen fest, Base64 entsteht in Schritten
 * (`encodeStep`), damit ein großes Mesh kein Bild lang blockiert (CHAOS-141).
 */
export interface PendingGeometry {
  readonly id: string;
  readonly vertices: number;
  readonly wideIndices: boolean;
  readonly extent: readonly [number, number, number];
  readonly fields: readonly {
    readonly bytes: Uint8Array;
    readonly parts: string[];
    cursor: number;
  }[];
  /** Zeichen nach dem Kodieren (für die Stückelung je `renderState`). */
  readonly chars: number;
}

export function pendingGeometry(id: string, data: MeshData): PendingGeometry {
  const vertices = data.positions.length / 3;
  const normals = new Int8Array(data.normals.length);
  for (let i = 0; i < data.normals.length; i += 3) {
    const x = data.normals[i] ?? 0;
    const y = data.normals[i + 1] ?? 0;
    const z = data.normals[i + 2] ?? 0;
    const length = Math.hypot(x, y, z) || 1;
    normals[i] = Math.round((x / length) * 127);
    normals[i + 1] = Math.round((y / length) * 127);
    normals[i + 2] = Math.round((z / length) * 127);
  }
  const wide = vertices > 0xffff;
  const indices = wide ? data.indices : Uint16Array.from(data.indices);
  const view = (array: ArrayBufferView) =>
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  const fields = [view(data.positions), view(normals), view(indices)].map((bytes) => ({
    bytes,
    parts: [] as string[],
    cursor: 0,
  }));
  return {
    id,
    vertices,
    wideIndices: wide,
    extent: [round(data.extent[0]), round(data.extent[1]), round(data.extent[2])],
    fields,
    chars: fields.reduce((sum, field) => sum + Math.ceil(field.bytes.length / 3) * 4, 0),
  };
}

/** Ein Schritt (höchstens `STEP_BYTES`); `true`, wenn alles kodiert ist. */
export function encodeStep(pending: PendingGeometry): boolean {
  const field = pending.fields.find((entry) => entry.cursor < entry.bytes.length);
  if (!field) return true;
  const to = Math.min(field.bytes.length, field.cursor + STEP_BYTES);
  field.parts.push(base64(field.bytes, field.cursor, to));
  field.cursor = to;
  return pending.fields.every((entry) => entry.cursor >= entry.bytes.length);
}

/** Fertig kodierte Geometrie als Katalogeintrag für `renderState.minigame.geometry`. */
export function finishGeometry(pending: PendingGeometry): MinigameGeometry {
  const [positions, normals, indices] = pending.fields.map((field) => field.parts.join(''));
  return {
    id: pending.id,
    vertices: pending.vertices,
    positions: positions ?? '',
    normals: normals ?? '',
    indices: indices ?? '',
    wideIndices: pending.wideIndices,
    extent: [pending.extent[0], pending.extent[1], pending.extent[2]],
  };
}

/** Am Stück (Tests). */
export function encodeGeometry(id: string, data: MeshData): MinigameGeometry {
  const pending = pendingGeometry(id, data);
  while (!encodeStep(pending));
  return finishGeometry(pending);
}
