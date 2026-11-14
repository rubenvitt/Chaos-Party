import { describe, expect, it } from 'vitest';
import type { SlotContext } from '../state/reducer.ts';
import { contextKey, zoneControlsInput } from './zoneInput.ts';

const lobby: SlotContext = { phase: 'lobby', layout: 'lobby', actions: ['ready'] };
const play: SlotContext = {
  phase: 'play',
  layout: 'joystick-buttons',
  actions: ['move', 'button-a', 'button-b'],
};

describe('zoneControlsInput', () => {
  it('ohne Kontext wartet die Zone', () => {
    expect(zoneControlsInput(undefined, undefined)).toEqual({ layout: 'wait', actions: [] });
  });

  it('„Bereit gesendet“ gilt nur für denselben Kontext', () => {
    expect(zoneControlsInput(lobby, undefined).readySent).toBe(false);
    expect(zoneControlsInput(lobby, contextKey(lobby)).readySent).toBe(true);
    // Neuer Lobby-Kontext (z. B. nach Neustart der Runde): Knopf erscheint wieder.
    expect(zoneControlsInput(lobby, contextKey(play)).readySent).toBe(false);
    expect(zoneControlsInput(play, undefined)).toEqual({
      layout: 'joystick-buttons',
      actions: play.actions,
      readySent: false,
    });
  });
});
