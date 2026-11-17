import { describe, expect, it } from 'vitest';
import { loaded } from './lighting.ts';

describe('loaded (Himmel-Textur fertig)', () => {
  it('wartet auf isReady, auch wenn kein Lade-Ereignis kommt (WebGPU, CHAOS-117)', async () => {
    let ready = false;
    setTimeout(() => (ready = true), 60);
    const started = Date.now();
    await loaded({ isReady: () => ready, url: 'himmel.hdr' });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('bricht nach dem Zeitlimit mit Fehler ab', async () => {
    await expect(loaded({ isReady: () => false, url: 'himmel.hdr' }, 50)).rejects.toThrow(
      'Himmel lädt nicht: himmel.hdr',
    );
  });
});
