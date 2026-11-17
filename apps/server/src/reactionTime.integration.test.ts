/**
 * Lobby-Einstellung „Mehr Zeit zum Reagieren“ (CHAOS-124): Über die echte Session (Host,
 * Controller, künstliche Uhr) mit beiden Werten. Ohne Option bleibt das Reaktionsfenster bei
 * 3000 ms (EXP-004), mit Option sind es `MORE_REACTION_TIME_MS`; die Revanche übernimmt die
 * Einstellung.
 */
import { DEFAULT_RULES } from '@chaos-party/game-core';
import type { BoardEvent, ContextMessage } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { MORE_REACTION_TIME_MS, rulesForGame } from './game.ts';
import { Harness, HOST, TICK_MS } from './testHarness.ts';

const SEED = 7;
/** Antwort nach 4 s: zu spät im Standardfenster, rechtzeitig mit der Option. */
const ANSWER_AFTER_MS = 4_000;

type Prompt = NonNullable<ContextMessage['prompt']>;

/** Lobby mit drei Spielern; Bots reagieren nie selbst auf Münzklau (Frist läuft ab). */
function lobby(moreReactionTime: boolean | undefined): Harness {
  const h = new Harness(
    { game: { seed: SEED, rounds: 4, minigames: [] } },
    { useItems: true, reaction: 'timeout' },
    SEED,
  );
  h.host();
  for (const id of [1, 2, 3]) h.join(id);
  if (moreReactionTime !== undefined) h.configureReactionTime(moreReactionTime);
  for (const id of [1, 2, 3]) h.ready(id);
  return h;
}

/** Spielt bis zum ersten offenen Reaktionsfenster. */
function untilReaction(h: Harness): { slot: 1 | 2 | 3 | 4; prompt: Prompt; openedAt: number } {
  h.runUntil((x) => x.openPrompt('reaction') !== null || x.gamePhase === 'game-results');
  const open = h.openPrompt('reaction');
  if (!open) throw new Error(`Kein Reaktionsfenster mit Seed ${String(SEED)}`);
  return { ...open, openedAt: h.clock };
}

function reactionOpened(h: Harness): Extract<BoardEvent, { type: 'reaction-opened' }>[] {
  return h.events.filter(
    (e): e is Extract<BoardEvent, { type: 'reaction-opened' }> => e.type === 'reaction-opened',
  );
}

/** Der PC bekommt dieselbe Frist im Ereignis `reaction-opened` (bis auf einen Takt). */
function expectHostDeadline(
  h: Harness,
  open: ReturnType<typeof untilReaction>,
  windowMs: number,
): void {
  const deadline = reactionOpened(h).at(-1)?.deadline ?? 0;
  expect(deadline - open.openedAt).toBeLessThanOrEqual(windowMs);
  expect(deadline - open.openedAt).toBeGreaterThan(windowMs - 2 * TICK_MS);
}

function resolvedAfter(h: Harness, from: number): BoardEvent[] {
  return h.events.slice(from).filter((e) => e.type === 'reaction-resolved');
}

/** Wartet bis `ms` nach Fensterbeginn und hält dann fest („brace“) – von Hand, nicht per Bot. */
function answerLate(h: Harness, open: ReturnType<typeof untilReaction>): void {
  while (h.clock - open.openedAt < ANSWER_AFTER_MS) h.tick();
  h.choose(h.controllerOf(open.slot).id, open.slot, open.prompt.id, 'brace');
}

describe('Mehr Zeit zum Reagieren (CHAOS-124)', () => {
  it('ist standardmäßig aus: Lobby meldet false, Fenster 3000 ms, Antwort nach 4 s zu spät', () => {
    const h = lobby(undefined);
    expect(h.lobby?.settings.moreReactionTime).toBe(false);
    expect(h.session.snapshot().moreReactionTime).toBe(false);
    h.start();
    const open = untilReaction(h);
    const windowMs = DEFAULT_RULES.pacing.reactionWindowMs;
    expect(windowMs).toBe(3_000);
    expect(open.prompt.remainingMs).toBeLessThanOrEqual(windowMs);
    expect(open.prompt.remainingMs).toBeGreaterThan(windowMs - TICK_MS);
    expectHostDeadline(h, open, windowMs);

    const before = h.events.length;
    answerLate(h, open);
    expect(resolvedAfter(h, before)).toEqual([
      { type: 'reaction-resolved', slot: open.slot, result: 'timeout' },
    ]);
    expect(h.errors.at(-1)).toMatchObject({ to: h.controllerOf(open.slot).id });
  });

  it('mit Option: Lobby meldet true, Fenster 5000 ms im Countdown, Antwort nach 4 s zählt', () => {
    const h = lobby(true);
    expect(h.lobby?.settings.moreReactionTime).toBe(true);
    expect(h.session.snapshot().moreReactionTime).toBe(true);
    h.start();
    const open = untilReaction(h);
    expect(MORE_REACTION_TIME_MS).toBe(5_000);
    expect(open.prompt.remainingMs).toBeLessThanOrEqual(MORE_REACTION_TIME_MS);
    expect(open.prompt.remainingMs).toBeGreaterThan(MORE_REACTION_TIME_MS - TICK_MS);
    expectHostDeadline(h, open, MORE_REACTION_TIME_MS);

    const before = h.events.length;
    answerLate(h, open);
    expect(resolvedAfter(h, before)).toEqual([
      { type: 'reaction-resolved', slot: open.slot, result: 'brace' },
    ]);
    expect(h.errors).toEqual([]);
  });

  it('mit Option läuft eine unbeantwortete Reaktion nach 5000 ms ab', () => {
    const h = lobby(true);
    h.start();
    const open = untilReaction(h);
    const before = h.events.length;
    h.runUntil((x) => resolvedAfter(x, before).length > 0);
    const waited = h.clock - open.openedAt;
    expect(waited).toBeGreaterThan(DEFAULT_RULES.pacing.reactionWindowMs + TICK_MS);
    expect(waited).toBeLessThanOrEqual(MORE_REACTION_TIME_MS + TICK_MS);
    expect(resolvedAfter(h, before)).toEqual([
      { type: 'reaction-resolved', slot: open.slot, result: 'timeout' },
    ]);
  });

  it('lässt sich wieder ausschalten; configure ohne Änderung schickt keine neue Lobby', () => {
    const h = lobby(true);
    h.configureReactionTime(false);
    expect(h.lobby?.settings.moreReactionTime).toBe(false);
    const lobbies = h.lobbies.length;
    h.configureReactionTime(false);
    expect(h.lobbies.length).toBe(lobbies);
    h.start();
    const open = untilReaction(h);
    expect(open.prompt.remainingMs).toBeLessThanOrEqual(DEFAULT_RULES.pacing.reactionWindowMs);
  });

  it('configure mit Rundenzahl lässt die Option stehen und umgekehrt', () => {
    const h = lobby(true);
    h.configure(6);
    expect(h.lobby?.settings).toMatchObject({ rounds: 6, moreReactionTime: true });
    h.configureReactionTime(false);
    expect(h.lobby?.settings).toMatchObject({ rounds: 6, moreReactionTime: false });
  });

  it('ist nur in der Lobby erlaubt und weist kaputte Werte ab', () => {
    const h = lobby(undefined);
    h.send(HOST, { v: 4, type: 'configure', moreReactionTime: 'ja' } as never);
    expect(h.errors.at(-1)).toEqual({ to: HOST, code: 'bad-message' });
    h.send(HOST, { v: 4, type: 'configure' } as never);
    expect(h.errors.at(-1)).toEqual({ to: HOST, code: 'bad-message' });
    expect(h.lobby?.settings.moreReactionTime).toBe(false);
    h.start();
    h.configureReactionTime(true);
    expect(h.errors.at(-1)).toEqual({ to: HOST, code: 'out-of-phase' });
    expect(h.session.snapshot().moreReactionTime).toBe(false);
  });

  it('Revanche übernimmt die Einstellung; die nächste Partie hat wieder 5000 ms', () => {
    const h = lobby(true);
    h.start();
    h.runToEnd();
    h.rematch();
    expect(h.session.phase).toBe('lobby');
    expect(h.lobby?.settings.moreReactionTime).toBe(true);
    for (const id of [1, 2, 3]) h.ready(id);
    h.start();
    const open = untilReaction(h);
    expect(open.prompt.remainingMs).toBeGreaterThan(MORE_REACTION_TIME_MS - TICK_MS);
  });
});

describe('rulesForGame (CHAOS-124)', () => {
  it('ändert ohne Option nichts und verkürzt mit Option kein längeres Fenster', () => {
    expect(rulesForGame(DEFAULT_RULES, false)).toBe(DEFAULT_RULES);
    expect(rulesForGame(DEFAULT_RULES, true).pacing.reactionWindowMs).toBe(MORE_REACTION_TIME_MS);
    const slow = { ...DEFAULT_RULES, pacing: { ...DEFAULT_RULES.pacing, reactionWindowMs: 8_000 } };
    expect(rulesForGame(slow, true).pacing.reactionWindowMs).toBe(8_000);
    expect(rulesForGame(DEFAULT_RULES, true).pacing.turnStartMs).toBe(
      DEFAULT_RULES.pacing.turnStartMs,
    );
  });
});
