import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, Prompt } from '../types.ts';
import { pickOne, createRng } from '../rng.ts';
import { DEFAULT_RULES } from './defaults.ts';
import { displayText, MAX_DETAIL, MAX_OPTION_LABEL, MAX_TITLE, playerLabel } from './labels.ts';
import { createGame, step } from './machine.ts';
import { TEST_BOARD } from './testBoards.ts';

const OPTION_ID = /^[a-z0-9:-]{1,32}$/;
// Steuerzeichen und Bidi-Steuerzeichen wie im Protokoll verboten.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;

function expectDisplayText(text: string, max: number): void {
  expect(text.length).toBeGreaterThan(0);
  expect(text.length).toBeLessThanOrEqual(max);
  expect(text.trim()).toBe(text);
  expect(FORBIDDEN.test(text)).toBe(false);
}

function checkPrompt(prompt: Prompt): void {
  expectDisplayText(prompt.title, MAX_TITLE);
  expect(prompt.options.length).toBeGreaterThanOrEqual(1);
  expect(prompt.options.length).toBeLessThanOrEqual(8);
  expect(OPTION_ID.test(prompt.defaultOption)).toBe(true);
  const ids = prompt.options.map((o) => o.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const option of prompt.options) {
    expect(OPTION_ID.test(option.id)).toBe(true);
    expectDisplayText(option.label, MAX_OPTION_LABEL);
    if (option.detail !== undefined) expectDisplayText(option.detail, MAX_DETAIL);
  }
}

describe('displayText', () => {
  it('entfernt Steuerzeichen, kürzt Rand und Länge, nutzt Ersatz für Leeres', () => {
    expect(displayText('  Hallo\u0007 ', 32, 'X')).toBe('Hallo');
    expect(displayText('‮', 32, 'Ersatz')).toBe('Ersatz');
    const long = displayText('a'.repeat(40), 32, 'X');
    expect(long).toHaveLength(32);
    expect(long.endsWith('…')).toBe(true);
    expect(playerLabel('   ', 3)).toBe('Spieler 3');
  });
});

describe('Prompts und Ereignisse bleiben protokollfest', () => {
  it('über viele zufällige Partien mit schwierigen Namen', () => {
    const names = ['Ä'.repeat(40), ' \u0001Bob ', '⁦', 'Zoë 🎉 sehr langer Name!!'];
    const prompts: Prompt[] = [];
    const events: GameEvent[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed * 31);
      const players = (seed % 3) + 2;
      let state: GameState = createGame({
        board: TEST_BOARD,
        rules: DEFAULT_RULES,
        rounds: 3,
        seed,
        players: ([1, 2, 3, 4] as const)
          .slice(0, players)
          .map((slot) => ({ slot, name: names[slot - 1] ?? 'X' })),
      });
      let t = 0;
      const first = step(state, { type: 'start', at: 0 });
      if (!first.ok) throw new Error('Start abgewiesen');
      state = first.state;
      events.push(...first.events);
      for (let i = 0; i < 5000 && state.phase !== 'game-results'; i++) {
        t = Math.max(state.now, t) + 400;
        const prompt = state.prompt;
        if (prompt) prompts.push(prompt);
        const r =
          prompt && rng.next() < 0.8
            ? step(state, {
                type: 'choose',
                slot: prompt.slot,
                promptId: prompt.id,
                option: pickOne(rng, prompt.options).id,
                at: t,
              })
            : step(state, { type: 'tick', at: t });
        if (!r.ok) continue;
        state = r.state;
        events.push(...r.events);
      }
      expect(state.phase).toBe('game-results');
    }
    const kinds = new Set(prompts.map((p) => p.kind));
    expect([...kinds].sort()).toEqual(['path', 'reaction', 'roll', 'target', 'trophy']);
    for (const prompt of prompts) checkPrompt(prompt);
    for (const event of events) {
      if (event.type === 'dice-rolled') {
        expect(event.faces.length).toBeGreaterThanOrEqual(1);
        expect(event.faces.length).toBeLessThanOrEqual(4);
      }
      if (event.type === 'moved') expect(event.path.length).toBeLessThanOrEqual(64);
      if (event.type === 'coins-changed') expect(event.balance).toBeGreaterThanOrEqual(0);
      if (event.type === 'player-auto') expect(OPTION_ID.test(event.option)).toBe(true);
    }
  });
});
