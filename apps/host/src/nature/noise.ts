/**
 * Deterministischer Zufall und Rauschen für den Natur-Look (CHAOS-62, aus der Look-Dev-Vitrine
 * CHAOS-57 übernommen). Rein, ohne Babylon: Gelände, Gras und Pflanzen sehen bei jedem Start
 * gleich aus (stabile Screenshots, gleiche Szene auf jedem PC).
 */

/** Linearer Kongruenzgenerator 0 ≤ x < 1. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** Glatte Stufe 0…1 (Hermite). */
export const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Wertrauschen 0…1 in 3D. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

/** Drei Oktaven Wertrauschen, 0…1. */
export function fbm(x: number, y: number, z: number): number {
  return (
    noise3(x, y, z) * 0.55 +
    noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 +
    noise3(x * 4.3, y * 4.3, z * 4.3) * 0.15
  );
}
