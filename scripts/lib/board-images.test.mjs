import { describe, expect, it } from 'vitest';
import { boardImageProblems, glbImageNames } from './board-images.mjs';

/** @param {unknown} json */
function glb(json) {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(0x20);
  padded.set(bytes);
  const out = new Uint8Array(20 + padded.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(padded, 20);
  return out;
}

const manifest = {
  assets: [
    { id: 'natur-gras', path: 'packages/assets/textures/nature/gras.webp' },
    { id: 'natur-fels', path: 'packages/assets/textures/nature/fels.webp' },
  ],
};

describe('Brett-Texturen: Herkunft (CHAOS-140)', () => {
  it('liest Bildnamen aus einer GLB', () => {
    expect(glbImageNames(glb({ images: [{ name: 'a' }, { uri: 'b.png' }, {}] }))).toEqual([
      'a',
      'b.png',
      'Bild 2',
    ]);
    expect(glbImageNames(glb({}))).toEqual([]);
    expect(() => glbImageNames(new Uint8Array(20))).toThrow(/GLB/);
  });

  it('akzeptiert Manifest-Texturen aus „from“ und Beschriftungen mit Nunito', () => {
    const names = [
      '/host/@fs/home/x/packages/assets/textures/nature/gras.webp',
      'wegweiser-s08-tex',
      'am-zug-pfeil-tex',
    ];
    expect(boardImageProblems(names, manifest, ['natur-gras', 'schrift-nunito'])).toEqual([]);
  });

  it('meldet fehlende Einträge, fehlendes „from“ und unbekannte Bilder', () => {
    const names = [
      '/x/packages/assets/textures/nature/fels.webp',
      '/x/packages/assets/textures/nature/neu.webp',
      'wegweiser-s08-tex',
      'irgendwas.png',
    ];
    expect(boardImageProblems(names, manifest, ['natur-gras'])).toEqual([
      expect.stringContaining('„natur-fels“ fehlt in „from“'),
      expect.stringContaining('nicht im Manifest'),
      expect.stringContaining('schrift-nunito'),
      expect.stringContaining('Herkunft unbekannt'),
    ]);
  });
});
