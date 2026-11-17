/**
 * Ersatz für `node:crypto` im JavaScriptCore-Bündel (esbuild-Alias): Zufall kommt von Swift
 * (`env.randomBytes`, SecRandomCopyBytes). Deckt genau ab, was `apps/server` benutzt:
 * `randomInt(max)`, `randomInt(min, max)` und `randomBytes(n).toString('base64url')`.
 */
let source: ((n: number) => number[]) | null = null;

export function setRandomSource(next: (n: number) => number[]): void {
  source = next;
}

function bytes(n: number): Uint8Array {
  if (!source) throw new Error('Zufallsquelle fehlt (ChaosHost.create noch nicht aufgerufen)');
  const raw = source(n);
  if (raw.length !== n) throw new Error(`randomBytes: ${raw.length} statt ${n} Bytes`);
  return Uint8Array.from(raw);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url ohne Auffüllung, wie Nodes `Buffer.toString('base64url')`. */
export function base64url(data: Uint8Array): string {
  let out = '';
  for (let i = 0; i < data.length; i += 3) {
    const a = data[i] ?? 0;
    const b = data[i + 1] ?? 0;
    const c = data[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    const chars = Math.min(4, Math.ceil(((data.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) out += ALPHABET.charAt((triple >> (18 - 6 * k)) & 63);
  }
  return out;
}

export function randomBytes(n: number): { toString(encoding: string): string } {
  const data = bytes(n);
  return {
    toString(encoding) {
      if (encoding !== 'base64url') throw new Error(`Kodierung ${encoding} fehlt im Shim`);
      return base64url(data);
    },
  };
}

/** Gleichverteilt in [min, max) per Verwerfen (wie Node); Spannweite < 2^32. */
export function randomInt(minOrMax: number, max?: number): number {
  const min = max === undefined ? 0 : minOrMax;
  const range = (max ?? minOrMax) - min;
  if (!Number.isInteger(range) || range <= 0 || range > 2 ** 32) {
    throw new Error(`randomInt: ungültiger Bereich ${min}…${max ?? minOrMax}`);
  }
  const limit = 2 ** 32 - (2 ** 32 % range);
  for (;;) {
    const [a = 0, b = 0, c = 0, d = 0] = bytes(4);
    const value = ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
    if (value < limit) return min + (value % range);
  }
}
