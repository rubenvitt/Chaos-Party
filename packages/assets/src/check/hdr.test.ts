import { describe, expect, it } from 'vitest';
import { decodeHdr, downsampleHdr, encodeHdr, HdrError, hdrInfo, type HdrImage } from './hdr.ts';

function gradient(width: number, height: number): HdrImage {
  const data = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3;
      // Himmelsverlauf plus eine sehr helle „Sonne“ (Werte weit über 1).
      const sun = x === 3 && y === 1 ? 4000 : 0;
      data[at] = 0.2 + x / width + sun;
      data[at + 1] = 0.4 + y / height + sun;
      data[at + 2] = y < height / 2 ? 0.9 : 0;
    }
  }
  return { width, height, data };
}

describe('Radiance-HDR', () => {
  it('kodiert und dekodiert verlustarm, auch Werte weit über 1', () => {
    const image = gradient(32, 8);
    const round = decodeHdr(encodeHdr(image));
    expect(round.width).toBe(32);
    expect(round.height).toBe(8);
    for (let i = 0; i < image.data.length; i++) {
      const want = image.data[i] ?? 0;
      const pixel = i - (i % 3);
      // RGBE hat 8 Bit Mantisse je Pixel, relativ zum hellsten Kanal des Pixels.
      const brightest = Math.max(...[0, 1, 2].map((c) => image.data[pixel + c] ?? 0));
      expect(Math.abs((round.data[i] ?? 0) - want)).toBeLessThanOrEqual(brightest * 0.01 + 1e-3);
    }
    expect(hdrInfo(encodeHdr(image)).peak).toBeGreaterThan(3900);
  });

  it('nutzt Lauflängen für gleichförmige Zeilen', () => {
    const flat: HdrImage = { width: 256, height: 4, data: new Float32Array(256 * 4 * 3).fill(0.5) };
    const bytes = encodeHdr(flat);
    expect(bytes.byteLength).toBeLessThan((256 * 4 * 4) / 4);
    expect(decodeHdr(bytes).data[100]).toBeCloseTo(0.5, 2);
  });

  it('verkleinert per Mittelwert und erhält die Energie', () => {
    const image = gradient(32, 8);
    const half = downsampleHdr(image, 2);
    expect(half.width).toBe(16);
    expect(half.height).toBe(4);
    const sum = (img: HdrImage): number => img.data.reduce((a, b) => a + b, 0);
    expect(sum(half) * 4).toBeCloseTo(sum(image), 1);
  });

  it('meldet kaputte Dateien verständlich', () => {
    expect(() => decodeHdr(new TextEncoder().encode('kein bild\n'))).toThrow(HdrError);
    const bytes = encodeHdr(gradient(16, 4));
    expect(() => decodeHdr(bytes.subarray(0, bytes.length - 10))).toThrow(/endet/);
  });
});
