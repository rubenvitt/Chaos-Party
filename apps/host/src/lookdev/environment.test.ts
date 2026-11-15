import { RGBE_ReadHeader, RGBE_ReadPixels } from '@babylonjs/core/Misc/HighDynamicRange/hdr.js';
import { describe, expect, it } from 'vitest';
import { encodeSkyHdr, skyColor, type SkySpec } from './environment.ts';

const SPEC: SkySpec = {
  zenith: [0.2, 0.5, 1.1],
  horizon: [0.9, 0.95, 1.0],
  ground: [0.4, 0.5, 0.3],
  sunDirection: [0, 1, 0],
  sun: [3, 2.8, 2.5],
  sunSharpness: 32,
};

describe('prozeduraler Himmel (CHAOS-56)', () => {
  it('kodiert ein Radiance-HDR, das Babylons Parser liest', () => {
    const bytes = encodeSkyHdr(SPEC);
    const header = RGBE_ReadHeader(bytes);
    expect(header.width).toBe(256);
    expect(header.height).toBe(128);
    const pixels = RGBE_ReadPixels(bytes, header);
    expect(pixels.length).toBe(256 * 128 * 3);
  });

  it('legt den Zenit nach oben (Babylon liest die Zeilen von unten)', () => {
    const bytes = encodeSkyHdr(SPEC);
    const header = RGBE_ReadHeader(bytes);
    const pixels = RGBE_ReadPixels(bytes, header);
    // Letzte Zeile = Zenit (mit Sonne, die senkrecht steht), erste Zeile = Boden.
    const top = (header.height - 1) * header.width * 3;
    const zenithBlue = pixels[top + 2] ?? 0;
    const groundBlue = pixels[2] ?? 0;
    expect(zenithBlue).toBeGreaterThan(groundBlue);
    // Werte stimmen mit der Himmelsfunktion überein (RGBE: ~1 % Genauigkeit).
    const expected = skyColor(SPEC, 0, -1, 0);
    expect(pixels[1] ?? 0).toBeCloseTo(expected[1], 1);
  });
});
