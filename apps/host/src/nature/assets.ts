/**
 * URLs der Natur-Assets aus `@chaos-party/assets` (CHAOS-62, CC0 von Poly Haven, Manifest +
 * Prüfung `pnpm check:assets`). Vite kopiert die Dateien in den Host-Build; die Liste ist
 * deshalb statisch (Glob zur Build-Zeit), nicht aus dem Manifest gelesen.
 */
const textureFiles = import.meta.glob<string>(
  '../../../../packages/assets/textures/nature/*.webp',
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
);
const skyFiles = import.meta.glob<string>('../../../../packages/assets/textures/sky/*.hdr', {
  query: '?url',
  import: 'default',
  eager: true,
});

function byName(files: Record<string, string>, suffix: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [path, url] of Object.entries(files)) {
    const name = path.slice(path.lastIndexOf('/') + 1, -suffix.length);
    map.set(name, url);
  }
  return map;
}

const TEXTURES = byName(textureFiles, '.webp');
const SKIES = byName(skyFiles, '.hdr');

/** Natur-Texturen (Poly-Haven-ID, siehe `packages/assets/polyhaven.json`). */
export const NATURE_TEXTURES = [
  'leafy_grass',
  'brown_mud_rocks_01',
  'bark_brown_02',
  'mossy_rock',
  'oak_veneer_01',
  'brown_planks_05',
] as const;
export type NatureTexture = (typeof NATURE_TEXTURES)[number];
export type TextureMap = 'diff' | 'nor' | 'arm';

export function textureUrl(id: NatureTexture, map: TextureMap): string {
  const url = TEXTURES.get(`${id}_${map}`);
  if (!url) throw new Error(`Natur-Textur fehlt: ${id}_${map} (packages/assets/textures/nature)`);
  return url;
}

/** Himmel einer Lichtstimmung (`LightMood.sky.hdri`). */
export function skyUrl(id: string): string {
  const url = SKIES.get(id);
  if (!url) throw new Error(`Himmel fehlt: ${id} (packages/assets/textures/sky)`);
  return url;
}

/** Für Tests: alle gebündelten Namen. */
export function bundledNatureAssets(): { textures: string[]; skies: string[] } {
  return { textures: [...TEXTURES.keys()].sort(), skies: [...SKIES.keys()].sort() };
}
