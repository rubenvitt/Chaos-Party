import { describe, expect, it } from 'vitest';
import { rendererLine } from './summary.ts';

describe('rendererLine', () => {
  const base = {
    webgl: 2,
    renderer: 'ANGLE (Test GPU)',
    vendor: 'Test',
    width: 1920,
    height: 1080,
  };

  it('nennt WebGL, Grafikkarte und Auflösung', () => {
    expect(rendererLine(base)).toBe('WebGL2 ANGLE (Test GPU) 1920×1080');
    expect(rendererLine(null)).toBe('WebGL ?');
  });

  it('hängt die Grafikstufe des Natur-Looks an (CHAOS-62)', () => {
    expect(rendererLine({ ...base, quality: 'hoch (auto)' })).toBe(
      'WebGL2 ANGLE (Test GPU) 1920×1080 Grafik hoch (auto)',
    );
  });

  it('nennt WebGPU statt der WebGL-Version (CHAOS-75)', () => {
    expect(rendererLine({ ...base, webgl: 0, api: 'WebGPU', renderer: 'apple metal-3' })).toBe(
      'WebGPU apple metal-3 1920×1080',
    );
  });
});
