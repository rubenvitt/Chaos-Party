import { describe, expect, it } from 'vitest';
import { RenderStateSchema } from '../src/contract.ts';
import { RENDER_STATE_EXAMPLES } from '../src/examples.ts';

describe('Beispielnachrichten für Swift', () => {
  it('halten den Vertrag ein', () => {
    for (const [name, example] of Object.entries(RENDER_STATE_EXAMPLES)) {
      const result = RenderStateSchema.safeParse(example);
      expect(result.success, `${name}: ${result.error?.message ?? ''}`).toBe(true);
    }
  });

  it('decken jede Phase und jede Minispiel-Stufe ab', () => {
    const keys = new Set(
      Object.values(RENDER_STATE_EXAMPLES).map((s) =>
        s.phase === 'minigame' ? `minigame-${s.minigame?.stage ?? '?'}` : s.phase,
      ),
    );
    for (const key of [
      'lobby',
      'board',
      'paused',
      'final',
      'minigame-intro',
      'minigame-play',
      'minigame-results',
    ]) {
      expect(keys.has(key), key).toBe(true);
    }
  });
});

describe('RenderStateSchema', () => {
  const valid = RENDER_STATE_EXAMPLES['minigame-play'];

  it('lehnt unbekannte Felder ab (neue Felder erst in den Vertrag)', () => {
    expect(RenderStateSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
  });

  it('lehnt falsche Formen und Vektorlängen ab', () => {
    const body = valid?.minigame?.bodies[0];
    expect(body).toBeDefined();
    const broken = (patch: object) => ({
      ...valid,
      minigame: { ...valid?.minigame, bodies: [{ ...body, ...patch }] },
    });
    expect(RenderStateSchema.safeParse(broken({ shape: 'capsule' })).success).toBe(false);
    expect(RenderStateSchema.safeParse(broken({ pos: [1, 2] })).success).toBe(false);
    expect(RenderStateSchema.safeParse(broken({ color: 'rot' })).success).toBe(false);
  });
});
