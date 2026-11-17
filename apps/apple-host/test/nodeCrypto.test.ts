import { describe, expect, it } from 'vitest';
import { base64url, randomBytes, randomInt, setRandomSource } from '../src/nodeCrypto.ts';

/** Liefert die Bytes der Reihe nach (für vorhersagbare Ergebnisse). */
function scripted(bytes: number[]): (n: number) => number[] {
  let at = 0;
  return (n) => {
    const out = bytes.slice(at, at + n);
    at += n;
    return out;
  };
}

describe('base64url', () => {
  it('stimmt für alle Restlängen mit Node überein', () => {
    const sample = [0, 1, 2, 250, 251, 252, 253, 254, 255, 42, 7, 63, 62];
    for (let n = 0; n <= sample.length; n++) {
      const data = Uint8Array.from(sample.slice(0, n));
      expect(base64url(data)).toBe(Buffer.from(data).toString('base64url'));
    }
  });
});

describe('randomBytes', () => {
  it('kodiert die Bytes der Quelle als base64url', () => {
    setRandomSource(scripted([0xfb, 0xff, 0x00, 0x10]));
    expect(randomBytes(4).toString('base64url')).toBe(
      Buffer.from([0xfb, 0xff, 0x00, 0x10]).toString('base64url'),
    );
  });

  it('lehnt andere Kodierungen ab', () => {
    setRandomSource(scripted([1]));
    expect(() => randomBytes(1).toString('hex')).toThrow(/hex/);
  });

  it('scheitert, wenn die Quelle zu wenige Bytes liefert', () => {
    setRandomSource(() => [1, 2]);
    expect(() => randomBytes(3)).toThrow(/2 statt 3/);
  });
});

describe('randomInt', () => {
  it('liegt in [min, max) und deckt den Bereich ab', () => {
    let state = 1;
    setRandomSource((n) =>
      Array.from({ length: n }, () => {
        state = (state * 1103515245 + 12345) >>> 0;
        return state >>> 24;
      }),
    );
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const value = randomInt(3, 9);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThan(9);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
    expect(randomInt(1)).toBe(0);
  });

  it('verwirft Werte oberhalb der Grenze (keine Schieflage)', () => {
    // range 3: Grenze = 2^32 - (2^32 % 3) = 4294967295; 0xFFFFFFFF liegt darauf und wird verworfen.
    setRandomSource(scripted([0xff, 0xff, 0xff, 0xff, 0, 0, 0, 5]));
    expect(randomInt(0, 3)).toBe(5 % 3);
  });

  it('lehnt leere und ungültige Bereiche ab', () => {
    setRandomSource(scripted([0, 0, 0, 0]));
    expect(() => randomInt(5, 5)).toThrow(/ungültiger Bereich/);
    expect(() => randomInt(0, 1.5)).toThrow(/ungültiger Bereich/);
    expect(() => randomInt(0, 2 ** 33)).toThrow(/ungültiger Bereich/);
  });
});
