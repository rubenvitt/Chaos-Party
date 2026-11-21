/**
 * CHAOS-214: „Bereit“ in der Minispiel-Anleitung über die Session – Kontext bietet den Knopf an,
 * das Spiel startet mit dem letzten Bereit, Sicherheitsfrist, Pause und verspätetes Bereit.
 */
import { DEFAULT_RULES } from '@chaos-party/game-core';
import { createMessage } from '@chaos-party/protocol';
import { rotationInfos } from '@chaos-party/minigames/catalog';
import { describe, expect, it } from 'vitest';
import { INTEGRATION_SEEDS, setupMinigameGame, type Harness } from './testHarness.ts';

const ID = rotationInfos()[0]?.id ?? 'pump-parade';

function intro(): Harness {
  const h = setupMinigameGame(ID, 3, INTEGRATION_SEEDS.three, 1, { minigameReady: false });
  h.runUntil((x) => x.gamePhase === 'minigame-intro');
  return h;
}

function context(h: Harness, slot: 1 | 2 | 3) {
  const entry = h.contexts.get(slot);
  if (!entry) throw new Error(`kein Kontext für ${String(slot)}`);
  return entry.context;
}

describe('Minispiel-Anleitung wartet auf „Bereit“ (CHAOS-214)', () => {
  it('bietet „Bereit“ an und startet erst nach dem letzten', () => {
    const h = intro();
    for (const slot of [1, 2, 3] as const) {
      expect(context(h, slot)).toMatchObject({
        actions: ['ready'],
        minigame: { stage: 'intro', ready: false },
      });
    }
    expect(h.boards.at(-1)?.view.minigame?.ready).toEqual([]);
    h.minigameReady(2);
    expect(context(h, 2)).toMatchObject({ actions: [], minigame: { ready: true } });
    expect(context(h, 1).actions).toEqual(['ready']);
    expect(h.boards.at(-1)?.view.minigame?.ready).toEqual([2]);
    h.minigameReady(1);
    for (let i = 0; i < 100; i++) h.tick();
    expect(h.gamePhase).toBe('minigame-intro');
    h.minigameReady(3);
    expect(h.gamePhase).toBe('minigame-play');
    expect(context(h, 3).minigame?.stage).toBe('play');
    expect(context(h, 3).minigame).not.toHaveProperty('ready');
    expect(h.errors).toEqual([]);
  });

  it('alle früh bereit: Start nach der Mindestdauer; verspätetes Bereit ist out-of-phase', () => {
    const h = intro();
    const minMs = DEFAULT_RULES.pacing.minigameReadyMinMs ?? 0;
    expect(minMs).toBeGreaterThan(0);
    // Beginn der Anleitung laut Server (zwischen zwei Takten).
    const enteredAt = (h.session.snapshot().game?.state.resumeAt ?? 0) - minMs;
    for (const slot of [1, 2, 3] as const) h.minigameReady(slot);
    expect(h.gamePhase).toBe('minigame-intro');
    while (h.gamePhase === 'minigame-intro' && h.clock < enteredAt + minMs + 1_000) h.tick();
    expect(h.gamePhase).toBe('minigame-play');
    expect(h.session.snapshot().game?.state.minigame?.playStartedAt).toBe(enteredAt + minMs);
    h.minigameReady(1);
    expect(h.errors).toEqual([{ to: h.controllerOf(1).id, code: 'out-of-phase' }]);
    expect(h.closes).toEqual([]);
  });

  it('ohne alle Bereit startet das Spiel nach der Sicherheitsfrist', () => {
    const h = intro();
    h.minigameReady(1);
    const timeout = DEFAULT_RULES.pacing.minigameReadyTimeoutMs ?? 0;
    expect(timeout).toBeGreaterThan(0);
    const until = h.clock + timeout + 200;
    while (h.clock < until && h.gamePhase === 'minigame-intro') h.tick();
    expect(h.gamePhase).toBe('minigame-play');
  });

  it('in der Pause kein Knopf, Bereit abgewiesen; danach wieder angeboten', () => {
    const h = intro();
    h.pause();
    expect(context(h, 1).actions).toEqual([]);
    h.minigameReady(1);
    expect(h.errors.at(-1)?.code).toBe('paused');
    h.resume();
    expect(context(h, 1).actions).toEqual(['ready']);
  });

  it('Bereit gilt nur für eigene Slots', () => {
    const h = intro();
    const other = h.controllerOf(2);
    h.send(other.id, createMessage('ready', { slot: 1, seq: ++other.seq }));
    expect(h.errors.at(-1)?.code).toBe('not-your-slot');
    expect(h.boards.at(-1)?.view.minigame?.ready).toEqual([]);
  });
});
