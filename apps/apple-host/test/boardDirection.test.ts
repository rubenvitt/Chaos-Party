import { DEFAULT_BOARD } from '@chaos-party/game-core';
import { createMessage, type BoardEvent } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { POPUP_MS } from '../../host/src/board/animation.ts';
import { createDemoMessages, DEMO_VIEW } from '../../host/src/board/demo.ts';
import { HOP_HEIGHT } from '../../host/src/board/layout.ts';
import {
  createBoardDirection,
  MAX_STEP_MS,
  reactionFor,
  SOUND_WINDOW_MS,
  type BoardDirection,
} from '../src/boardDirection.ts';
import { BoardStateSchema } from '../src/contract.ts';

const STEP = 1000 / 60;
const pos = (id: string) => {
  const space = DEFAULT_BOARD.spaces.find((s) => s.id === id);
  if (!space) throw new Error(id);
  return space.position;
};

function run(direction: BoardDirection, ms: number, visible = true): void {
  for (let t = 0; t < ms; t += STEP) direction.advance(STEP, visible);
}

/** Felder wie in `renderState().board` und gegen das strenge Schema geprüft. */
function board(direction: BoardDirection) {
  const fields = direction.fields();
  const state = {
    round: 2,
    rounds: 5,
    activeSlot: 1,
    spaces: [],
    messages: [],
    notice: null,
    ...fields,
  };
  const parsed = BoardStateSchema.safeParse(state);
  expect(parsed.success, parsed.error?.message).toBe(true);
  return fields;
}

describe('Brett-Regie im JS-Kern (CHAOS-143)', () => {
  it('springt bei der ersten Nachricht ohne Animation auf den Stand', () => {
    const direction = createBoardDirection();
    const [first] = createDemoMessages();
    if (!first) throw new Error('Demo leer');
    direction.receive(first);
    const fields = board(direction);
    expect(fields.pawns.map((p) => [p.slot, p.spaceId, p.hop, p.y])).toEqual(
      DEMO_VIEW.players.map((p) => [p.slot, p.spaceId, null, 0]),
    );
    const blue = fields.pawns.find((p) => p.slot === 1);
    expect(blue).toMatchObject({
      x: pos('s07').x,
      z: pos('s07').z,
      heading: null,
      connected: true,
    });
    expect(fields.trophySpaces).toEqual(['s12', 's24', 's36']);
    expect(fields.traps).toEqual([{ spaceId: 's15', owner: 2 }]);
    expect(fields.hud).toMatchObject({
      boardName: DEFAULT_BOARD.name,
      roundText: 'Runde 2/5',
      status: { slot: 1, kind: 'path', text: 'Blau wählt einen Weg …', countdown: null },
    });
    expect(fields.hud?.players.map((p) => [p.slot, p.coins, p.active])).toEqual([
      [1, 12, true],
      [2, 7, false],
      [3, 18, false],
      [4, 3, false],
    ]);
    expect(fields.popups).toEqual([]);
    expect(fields.sounds).toEqual([]);
  });

  it('lässt die Figur Feld für Feld hüpfen, mit Popup, Ticker, Reaktion und Klang', () => {
    const direction = createBoardDirection();
    const [first, second] = createDemoMessages();
    if (!first || !second) throw new Error('Demo zu kurz');
    direction.receive(first);
    direction.receive(second);
    // Halber erster Sprung (Takt 320 ms, Sprung 85 %): Scheitel über der Mitte s07 → s08.
    run(direction, 136);
    let fields = board(direction);
    const blue = fields.pawns.find((p) => p.slot === 1);
    expect(blue?.hop).toMatchObject({ from: 's07', to: 's08', style: 'walk' });
    expect(blue?.y).toBeGreaterThan(HOP_HEIGHT * 0.9);
    expect(blue?.x).toBeCloseTo((pos('s07').x + pos('s08').x) / 2, 0);
    expect(blue?.heading).toBeCloseTo(
      Math.atan2(pos('s08').x - pos('s07').x, pos('s08').z - pos('s07').z),
    );
    expect(fields.ticker.map((m) => m.text)).toEqual(['Blau nimmt: Klippenweg']);
    // Die Kamera folgt der hüpfenden Figur ein Stück.
    expect(fields.camera.x).not.toBe(0);
    // Ende des Wegs (3 Felder): Item-Popup über Blau, Klang „pop“.
    run(direction, 3 * 320);
    fields = board(direction);
    expect(fields.pawns.find((p) => p.slot === 1)).toMatchObject({ spaceId: 's10', hop: null });
    expect(fields.popups).toMatchObject([
      { kind: 'item', slot: 1, text: 'Münzklau', tone: 'good', reaction: null },
    ]);
    expect(fields.sounds.map((s) => s.name)).toEqual(['pop']);
    expect(fields.sounds[0]?.voices[0]).toMatchObject({ wave: 'sine', freq: 520 * 1.2 });
    // Popup und Klang verschwinden nach ihrer Zeit.
    run(direction, Math.max(POPUP_MS, SOUND_WINDOW_MS) + 100);
    fields = board(direction);
    expect(fields.popups).toEqual([]);
    expect(fields.sounds).toEqual([]);
  });

  it('zeigt Münzverlust mit Reaktion „hit“ und zählt die Münzen im HUD erst beim Abspielen', () => {
    const direction = createBoardDirection();
    const messages = createDemoMessages();
    for (const message of messages.slice(0, 3)) direction.receive(message);
    run(direction, 3000);
    const fourth = messages[3];
    if (!fourth) throw new Error('Demo zu kurz');
    direction.receive(fourth);
    run(direction, 100);
    let fields = board(direction);
    expect(fields.popups).toMatchObject([{ kind: 'dice', slot: 3, text: '4' }]);
    expect(fields.sounds.map((s) => s.name)).toContain('dice');
    expect(fields.hud?.players.find((p) => p.slot === 3)?.coins).toBe(18);
    run(direction, 900 + 3 * 320 + 50);
    fields = board(direction);
    const coins = fields.popups.find((p) => p.kind === 'coins');
    expect(coins).toMatchObject({ slot: 3, text: '−3', tone: 'bad', reaction: 'hit' });
    expect(fields.hud?.players.find((p) => p.slot === 3)?.coins).toBe(15);
    expect(fields.sounds.map((s) => s.name)).toContain('coin-loss');
  });

  it('zeigt das Reaktionsfenster mit Countdown', () => {
    const direction = createBoardDirection();
    const messages = createDemoMessages();
    for (const message of messages.slice(0, 6)) direction.receive(message);
    run(direction, 8000);
    const status = board(direction).hud?.status;
    expect(status).toMatchObject({ slot: 1, kind: 'reaction', text: 'Blau kann reagieren!' });
    expect(status?.countdown).toMatch(/^\d( … \d)*$/);
  });

  it('fliegt beim Windstoß in einem Bogen und dreht sich dabei', () => {
    const direction = createBoardDirection();
    const view = { ...DEMO_VIEW, prompt: null };
    direction.receive(createMessage('board', { view, events: [], eventSeq: 0 }));
    const events: BoardEvent[] = [
      { type: 'board-event', slot: 1, event: 'gust' },
      { type: 'moved', slot: 1, path: ['s08', 's09', 's10', 's11'] },
    ];
    const moved = {
      ...view,
      players: view.players.map((p) => (p.slot === 1 ? { ...p, spaceId: 's11' } : p)),
    };
    direction.receive(createMessage('board', { view: moved, events, eventSeq: 0 }));
    run(direction, 400 + 450);
    const fields = board(direction);
    const blue = fields.pawns.find((p) => p.slot === 1);
    expect(blue?.hop).toMatchObject({ from: 's07', to: 's11', style: 'gust' });
    expect(blue?.y).toBeGreaterThan(0.5);
    expect(blue?.heading).not.toBeNull();
    expect(fields.popups.map((p) => p.text)).toContain('Windböe!');
    expect(fields.ticker.map((m) => m.text)).toContain('Ereignis für Blau: Windböe!');
  });

  it('steht während des Minispiels und holt danach ohne Animation und ohne Klänge auf', () => {
    const direction = createBoardDirection();
    const [first, second] = createDemoMessages();
    if (!first || !second) throw new Error('Demo zu kurz');
    direction.receive(first);
    direction.receive(second);
    run(direction, 2000, false);
    expect(board(direction).pawns.find((p) => p.slot === 1)).toMatchObject({ spaceId: 's07' });
    direction.advance(STEP, true);
    const fields = board(direction);
    expect(fields.pawns.find((p) => p.slot === 1)).toMatchObject({ spaceId: 's10', hop: null });
    expect(fields.sounds).toEqual([]);
    expect(fields.popups).toEqual([]);
  });

  it('begrenzt große Zeitsprünge auf MAX_STEP_MS je Aufruf', () => {
    const direction = createBoardDirection();
    const [first, second] = createDemoMessages();
    if (!first || !second) throw new Error('Demo zu kurz');
    direction.receive(first);
    direction.receive(second);
    direction.advance(5000, true);
    const blue = board(direction).pawns.find((p) => p.slot === 1);
    // Nach höchstens 100 ms Regie-Zeit hüpft Blau noch zum ersten Feld.
    expect(MAX_STEP_MS).toBe(100);
    expect(blue?.hop).toMatchObject({ from: 's07', to: 's08' });
  });

  it('übernimmt die Reaktionen des Babylon-Hosts', () => {
    expect(reactionFor({ kind: 'trophy', tone: 'gold' })).toBe('cheer');
    expect(reactionFor({ kind: 'trap', tone: 'bad' })).toBe('hit');
    expect(reactionFor({ kind: 'steal', tone: 'bad' })).toBe('hit');
    expect(reactionFor({ kind: 'coins', tone: 'good' })).toBe('jump');
    expect(reactionFor({ kind: 'coins', tone: 'gold' })).toBeNull();
    expect(reactionFor({ kind: 'dice', tone: 'neutral' })).toBeNull();
  });
});
