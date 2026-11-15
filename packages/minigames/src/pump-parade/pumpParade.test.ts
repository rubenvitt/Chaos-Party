import { checkInfo } from '@chaos-party/minigame-sdk';
import { EMPTY_RESIDUE, runMinigameHeadless, stepsFor } from '@chaos-party/minigame-sdk/testing';
import { describe, expect, it } from 'vitest';
import { pumpParade } from './index.ts';

describe('Pump-Parade (Referenz-Minispiel des Vertrags)', () => {
  it('hat einen gültigen Steckbrief', () => {
    expect(checkInfo(pumpParade.info)).toEqual({ ok: true });
  });

  it('wertet nach Pumpstößen, mit Gleichstand, und räumt die Szene restlos auf', async () => {
    // Slot 1 pumpt jede 6. Runde, Slot 2 jede 12., Slot 3 und 4 gleich oft (Gleichstand).
    const run = await runMinigameHeadless(pumpParade, {
      players: 4,
      seed: 7,
      script: (_elapsed, send, runner) => {
        const step = Math.round(runner.elapsedMs / (1000 / 60));
        if (step % 6 === 0) send(1, { type: 'press', button: 'a' });
        if (step % 6 === 3) send(1, { type: 'release', button: 'a' });
        if (step % 12 === 0) send(2, { type: 'press', button: 'a' });
        if (step % 12 === 6) send(2, { type: 'release', button: 'a' });
        if (step === stepsFor(1)) {
          send(3, { type: 'press', button: 'a' });
          send(4, { type: 'press', button: 'a' });
        }
      },
    });
    expect(run.outcome?.forced).toBe(false);
    const placements = run.outcome?.result.placements ?? [];
    expect(placements.map((entry) => entry.slot)).toEqual([1, 2, 3, 4]);
    expect(placements.map((entry) => entry.place)).toEqual([1, 2, 3, 3]);
    expect(run.outcome?.elapsedMs).toBeGreaterThanOrEqual(pumpParade.info.durationMs);
    expect(run.residue).toEqual(EMPTY_RESIDUE);
    expect(run.animations.get(1)).toContain('cheer');
  });

  it('läuft mit 2 Spielern und ohne Eingaben (alle gleich)', async () => {
    const run = await runMinigameHeadless(pumpParade, { players: 2 });
    expect(run.outcome?.result.placements.map((entry) => entry.place)).toEqual([1, 1]);
    expect(run.residue).toEqual(EMPTY_RESIDUE);
  });
});
