/**
 * WebP-Leser der Asset-Prüfung (CHAOS-61): Maße und Alpha aus den drei Bitstream-Formen,
 * verständliche Fehler bei kaputten Dateien. Die echten Porträts liest `checkAssets.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { WebpError, webpInfo } from './webp.ts';

function riff(chunk: string, payload: number[]): Uint8Array {
  const body = [...new TextEncoder().encode(`WEBP${chunk}`), 0, 0, 0, 0, ...payload];
  while (body.length < 22) body.push(0);
  const out = new Uint8Array(8 + body.length);
  out.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(out.buffer).setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}

describe('webpInfo', () => {
  it('VP8X mit Alpha-Flag und 24-Bit-Maßen', () => {
    // Flags (Alpha = 0x10), 3 Reserve-Bytes, Breite-1 = 383, Höhe-1 = 383.
    const info = webpInfo(riff('VP8X', [0x10, 0, 0, 0, 0x7f, 0x01, 0, 0x7f, 0x01, 0]));
    expect(info).toEqual({ format: 'VP8X', width: 384, height: 384, alpha: true });
  });

  it('VP8L mit 14-Bit-Maßen und Alpha-Bit', () => {
    const bits = (640 - 1) | ((480 - 1) << 14) | (1 << 28);
    const info = webpInfo(
      riff('VP8L', [0x2f, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, bits >>> 24]),
    );
    expect(info).toEqual({ format: 'VP8L', width: 640, height: 480, alpha: true });
  });

  it('VP8 (verlustbehaftet) hat nie Alpha', () => {
    const info = webpInfo(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00]));
    expect(info).toEqual({ format: 'VP8', width: 320, height: 240, alpha: false });
  });

  it('lehnt Nicht-WebP und falsche RIFF-Größe ab', () => {
    expect(() => webpInfo(new Uint8Array(40))).toThrow(WebpError);
    const broken = riff('VP8X', [0x10]);
    new DataView(broken.buffer).setUint32(4, 999, true);
    expect(() => webpInfo(broken)).toThrow(/RIFF-Größe/);
    expect(() => webpInfo(riff('ABCD', []))).toThrow(/unbekannter Bild-Chunk/);
  });
});
