import { describe, expect, it } from 'vitest';
import { toPublicView } from './view.ts';
import { newGame, start, tick, TEST_RULES } from './testUtils.ts';

describe('toPublicView', () => {
  it('liefert die öffentliche Sicht ohne internal, mit Restzeit statt Frist', () => {
    const s = start(newGame({ ruleSet: TEST_RULES }), 1000).state;
    const view = toPublicView(s, 1500);
    expect(view).toMatchObject({
      boardId: 'testwald',
      gamePhase: 'turn-start',
      round: 1,
      rounds: 1,
      activeSlot: s.activeSlot,
      trophyPrice: 20,
      stepMs: 350,
      remainingMs: 700,
      prompt: null,
      ranking: null,
    });
    expect(Object.keys(view)).not.toContain('internal');
    expect(view.players[0]).toEqual({
      slot: 1,
      name: 'Rot',
      spaceId: 's00',
      coins: 10,
      trophies: 0,
      items: [],
      connected: true,
    });
  });

  it('Prompt ohne Standardoption und absolute Frist, Restzeit nie negativ', () => {
    const s0 = start(newGame({ ruleSet: TEST_RULES }), 0).state;
    const s = tick(s0, s0.resumeAt ?? 0).state;
    const view = toPublicView(s);
    expect(view.prompt).toEqual({
      id: 1,
      slot: s.activeSlot,
      kind: 'roll',
      title: 'Du bist dran!',
      options: [{ id: 'roll', label: 'Würfeln' }],
      remainingMs: null,
    });
    expect(view.remainingMs).toBeNull();
    const withDeadline = { ...s, prompt: s.prompt ? { ...s.prompt, deadline: 100 } : null };
    expect(toPublicView(withDeadline, 5000).prompt?.remainingMs).toBe(0);
    expect(toPublicView(withDeadline, 50.5).prompt?.remainingMs).toBe(50);
  });
});
