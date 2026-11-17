/**
 * Herkunft der Texturen im Brett-Export (CHAOS-140): Jede Textur in `brett.glb` muss aus einem
 * Manifest-Asset stammen, das das Artefakt `brett.usdz` in `from` nennt, oder eine zur Laufzeit
 * gezeichnete Beschriftung sein (Wegweiser, „Am Zug“-Pfeil; mit Nunito gezeichnet). So kann
 * keine Datei unbemerkt und ohne Lizenzangabe ins USDZ wandern.
 */

/** Zur Laufzeit gezeichnete Beschriftungen (DynamicTexture mit Nunito). */
const LABEL_TEXTURES = [/^wegweiser-[a-z0-9]+-tex$/, /^am-zug-pfeil-tex$/];
const LABEL_FONT = 'schrift-nunito';

/**
 * Bildnamen (bzw. URIs) aus einer GLB-Datei.
 * @param {Uint8Array} glb
 * @returns {string[]}
 */
export function glbImageNames(glb) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('keine GLB-Datei');
  const length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length)));
  /** @type {{ name?: string, uri?: string }[]} */
  const images = json.images ?? [];
  return images.map((image, i) => image.name ?? image.uri ?? `Bild ${String(i)}`);
}

/**
 * @param {readonly string[]} names Bildnamen aus `glbImageNames`
 * @param {{ assets: readonly { id: string, path: string }[] }} manifest
 * @param {readonly string[]} from Asset-IDs des Artefakts
 * @returns {string[]} Probleme (leer = alles belegt)
 */
export function boardImageProblems(names, manifest, from) {
  const allowed = new Set(from);
  const byPath = new Map(manifest.assets.map((a) => [a.path, a.id]));
  const problems = [];
  for (const name of names) {
    const at = name.indexOf('packages/assets/');
    if (at >= 0) {
      const path = name.slice(at);
      const id = byPath.get(path);
      if (!id) problems.push(`${path}: nicht im Manifest`);
      else if (!allowed.has(id))
        problems.push(`${path}: Asset „${id}“ fehlt in „from“ des Artefakts`);
    } else if (LABEL_TEXTURES.some((re) => re.test(name))) {
      if (!allowed.has(LABEL_FONT))
        problems.push(`${name}: Beschriftung, aber „${LABEL_FONT}“ fehlt in „from“`);
    } else {
      problems.push(`${name}: Herkunft unbekannt`);
    }
  }
  return problems;
}
