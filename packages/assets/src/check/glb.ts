/**
 * Kleiner GLB-Leser für die Asset-Prüfung (ohne Babylon, ohne Browser): Kopf und Chunks
 * prüfen, JSON lesen, Eckpunkte in der Ruhepose mit allen Knoten-Transformen in Weltkoordinaten
 * umrechnen (exakt, nicht nur über Accessor-min/max) und Kennzahlen bilden.
 */

export interface GltfNode {
  readonly name?: string;
  readonly children?: readonly number[];
  readonly mesh?: number;
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly matrix?: readonly number[];
}

interface GltfAccessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
}

interface GltfBufferView {
  readonly byteOffset?: number;
  readonly byteLength: number;
  readonly byteStride?: number;
}

interface GltfPrimitive {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly material?: number;
  readonly mode?: number;
}

/** Material mit beliebigen Textur-Plätzen (`normalTexture`, `pbrMetallicRoughness.baseColorTexture` …). */
export interface GltfMaterial {
  readonly name?: string;
  readonly [key: string]: unknown;
}

/** Eingebettetes Bild (CHAOS-172: Normal-Texturen der Feinstruktur). */
export interface GlbImage {
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

/** Verwendung einer Textur: Material und Platz (Pfad im Material, z. B. `normalTexture`). */
export interface GlbTextureSlot {
  readonly material: string;
  readonly slot: string;
}

export interface GltfJson {
  readonly asset?: { readonly version?: string };
  readonly scene?: number;
  readonly scenes?: readonly { readonly nodes?: readonly number[] }[];
  readonly nodes?: readonly GltfNode[];
  readonly meshes?: readonly {
    readonly name?: string;
    readonly primitives: readonly GltfPrimitive[];
  }[];
  readonly materials?: readonly GltfMaterial[];
  readonly animations?: readonly { readonly name?: string }[];
  readonly accessors?: readonly GltfAccessor[];
  readonly bufferViews?: readonly GltfBufferView[];
  readonly textures?: readonly {
    readonly source?: number;
    readonly extensions?: Readonly<Record<string, { readonly source?: number }>>;
  }[];
  readonly images?: readonly {
    readonly mimeType?: string;
    readonly bufferView?: number;
    readonly uri?: string;
  }[];
  readonly skins?: readonly unknown[];
}

export interface GlbStats {
  readonly animations: readonly string[];
  readonly materials: readonly string[];
  /** Materialnamen, die mindestens ein Primitive benutzt. */
  readonly usedMaterials: readonly string[];
  readonly nodes: readonly string[];
  readonly meshes: number;
  readonly primitives: number;
  readonly triangles: number;
  readonly textures: number;
  /** Eingebettete Bilder (Bytes aus dem Binär-Chunk; externe URIs sind nicht erlaubt). */
  readonly images: readonly GlbImage[];
  /** Alle Stellen, an denen ein Material eine Textur benutzt. */
  readonly textureSlots: readonly GlbTextureSlot[];
  /** Achsenparalleler Rahmen in Weltkoordinaten (Ruhepose). */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  /** Größter Abstand eines Eckpunkts von der Hochachse (Grundfläche). */
  readonly footprintRadius: number;
}

export class GlbError extends Error {}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function parseGlb(bytes: Uint8Array): { json: GltfJson; bin: Uint8Array | null } {
  if (bytes.byteLength < 20) throw new GlbError('Datei zu kurz für GLB');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC)
    throw new GlbError('keine GLB-Datei (Kennung „glTF“ fehlt)');
  if (view.getUint32(4, true) !== 2) throw new GlbError('GLB-Version ist nicht 2');
  const length = view.getUint32(8, true);
  if (length !== bytes.byteLength) throw new GlbError('GLB-Länge im Kopf passt nicht zur Datei');
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= length) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + chunkLength > length) throw new GlbError('GLB-Chunk ragt über das Dateiende');
    const chunk = bytes.subarray(start, start + chunkLength);
    if (chunkType === CHUNK_JSON && json === null) {
      try {
        json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
      } catch {
        throw new GlbError('JSON-Chunk ist kein gültiges JSON');
      }
    } else if (chunkType === CHUNK_BIN && bin === null) {
      bin = chunk;
    }
    offset = start + chunkLength;
  }
  if (!json) throw new GlbError('JSON-Chunk fehlt');
  return { json, bin };
}

type Mat4 = number[];

function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Spaltenweise 4×4-Matrizen wie in glTF: a · b. */
function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function localMatrix(node: GltfNode): Mat4 {
  if (node.matrix?.length === 16) return [...node.matrix];
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  const [x = 0, y = 0, z = 0, w = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  // Rotation aus Quaternion, dann Skalierung je Spalte, Translation in Spalte 4.
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function readPositions(json: GltfJson, bin: Uint8Array, accessorIndex: number): Float32Array {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new GlbError(`Accessor ${String(accessorIndex)} fehlt`);
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') {
    throw new GlbError('POSITION ist nicht VEC3/float');
  }
  const out = new Float32Array(accessor.count * 3);
  if (accessor.bufferView === undefined) return out;
  const viewDef = json.bufferViews?.[accessor.bufferView];
  if (!viewDef) throw new GlbError(`BufferView ${String(accessor.bufferView)} fehlt`);
  const stride = viewDef.byteStride ?? 12;
  const base = (viewDef.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  for (let i = 0; i < accessor.count; i++) {
    const at = base + i * stride;
    if (at + 12 > bin.byteLength) throw new GlbError('POSITION liegt außerhalb des Puffers');
    out[i * 3] = data.getFloat32(at, true);
    out[i * 3 + 1] = data.getFloat32(at + 4, true);
    out[i * 3 + 2] = data.getFloat32(at + 8, true);
  }
  return out;
}

export function glbStats(bytes: Uint8Array): GlbStats {
  const { json, bin } = parseGlb(bytes);
  if (json.asset?.version !== '2.0') throw new GlbError('glTF-Version ist nicht 2.0');
  const nodes = json.nodes ?? [];
  const materials = (json.materials ?? []).map((m, i) => m.name ?? `#${String(i)}`);
  const used = new Set<string>();
  let primitives = 0;
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      primitives++;
      if (primitive.material !== undefined) used.add(materials[primitive.material] ?? '?');
      const indexCount =
        primitive.indices !== undefined
          ? (json.accessors?.[primitive.indices]?.count ?? 0)
          : (json.accessors?.[primitive.attributes.POSITION ?? -1]?.count ?? 0);
      if ((primitive.mode ?? 4) === 4) triangles += Math.floor(indexCount / 3);
    }
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let footprint = 0;
  const sceneIndex = json.scene ?? 0;
  const roots = json.scenes?.[sceneIndex]?.nodes ?? [];
  const visit = (index: number, parent: Mat4, depth: number): void => {
    if (depth > 64) throw new GlbError('Knoten-Hierarchie zu tief oder zyklisch');
    const node = nodes[index];
    if (!node) throw new GlbError(`Knoten ${String(index)} fehlt`);
    const world = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = json.meshes?.[node.mesh];
      if (!mesh) throw new GlbError(`Mesh ${String(node.mesh)} fehlt`);
      if (!bin) throw new GlbError('Binär-Chunk fehlt');
      for (const primitive of mesh.primitives) {
        const position = primitive.attributes.POSITION;
        if (position === undefined) continue;
        const p = readPositions(json, bin, position);
        for (let i = 0; i < p.length; i += 3) {
          const x = p[i] ?? 0;
          const y = p[i + 1] ?? 0;
          const z = p[i + 2] ?? 0;
          const wx =
            (world[0] ?? 0) * x + (world[4] ?? 0) * y + (world[8] ?? 0) * z + (world[12] ?? 0);
          const wy =
            (world[1] ?? 0) * x + (world[5] ?? 0) * y + (world[9] ?? 0) * z + (world[13] ?? 0);
          const wz =
            (world[2] ?? 0) * x + (world[6] ?? 0) * y + (world[10] ?? 0) * z + (world[14] ?? 0);
          min[0] = Math.min(min[0], wx);
          min[1] = Math.min(min[1], wy);
          min[2] = Math.min(min[2], wz);
          max[0] = Math.max(max[0], wx);
          max[1] = Math.max(max[1], wy);
          max[2] = Math.max(max[2], wz);
          footprint = Math.max(footprint, Math.hypot(wx, wz));
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world, depth + 1);
  };
  for (const root of roots) visit(root, identity(), 0);
  if (!Number.isFinite(min[1])) throw new GlbError('keine Eckpunkte gefunden');
  return {
    animations: (json.animations ?? []).map((a, i) => a.name ?? `#${String(i)}`),
    materials,
    usedMaterials: [...used].sort(),
    nodes: nodes.map((n, i) => n.name ?? `#${String(i)}`),
    meshes: json.meshes?.length ?? 0,
    primitives,
    triangles,
    textures: (json.textures?.length ?? 0) + (json.images?.length ?? 0),
    images: readImages(json, bin),
    textureSlots: textureSlots(json),
    min,
    max,
    footprintRadius: footprint,
  };
}

function readImages(json: GltfJson, bin: Uint8Array | null): GlbImage[] {
  return (json.images ?? []).map((image, i) => {
    if (image.bufferView === undefined || !bin) {
      throw new GlbError(
        `Bild ${String(i)} nicht eingebettet (externe Dateien sind nicht erlaubt)`,
      );
    }
    const view = json.bufferViews?.[image.bufferView];
    if (!view) throw new GlbError(`Bild ${String(i)}: bufferView fehlt`);
    const start = view.byteOffset ?? 0;
    if (start + view.byteLength > bin.byteLength) {
      throw new GlbError(`Bild ${String(i)} ragt über den Binär-Chunk hinaus`);
    }
    return {
      mimeType: image.mimeType ?? '?',
      bytes: bin.subarray(start, start + view.byteLength),
    };
  });
}

/** Sucht in jedem Material alle Objekte unter Schlüsseln `…Texture` mit einem `index`. */
function textureSlots(json: GltfJson): GlbTextureSlot[] {
  const out: GlbTextureSlot[] = [];
  const walk = (material: string, value: unknown, path: string): void => {
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (
        key.endsWith('Texture') &&
        child !== null &&
        typeof child === 'object' &&
        'index' in child
      ) {
        out.push({ material, slot: childPath });
      } else {
        walk(material, child, childPath);
      }
    }
  };
  (json.materials ?? []).forEach((m, i) => {
    walk(m.name ?? `#${String(i)}`, m, '');
  });
  return out;
}
