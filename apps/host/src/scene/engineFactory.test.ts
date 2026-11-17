import { describe, expect, it } from 'vitest';
import { loadWebGpuEngine } from './engineFactory.ts';

describe('loadWebGpuEngine (CHAOS-117)', () => {
  it('registriert die Mehrfach-Renderziele, die SSAO2 und der Geometriepuffer brauchen', async () => {
    const WebGPUEngine = await loadWebGpuEngine();
    // Ohne diese Methoden bricht der Aufbau des Bretts ab Stufe `hoch` ab (kein Bild).
    for (const method of [
      'createMultipleRenderTarget',
      'updateMultipleRenderTargetTextureSampleCount',
      'bindAttachments',
      'buildTextureLayout',
      'restoreSingleAttachment',
      'clearAttachments',
      'unBindMultiColorAttachmentFramebuffer',
    ] as const) {
      expect(typeof WebGPUEngine.prototype[method], method).toBe('function');
    }
  });
});
