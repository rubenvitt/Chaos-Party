import type { InputIntent } from '@chaos-party/protocol';
import { describe, expect, it, vi } from 'vitest';
import {
  createIntentHub,
  createWebSocketInputSource,
  intentToPlayerInput,
} from './webSocketInputSource.ts';

describe('intentToPlayerInput', () => {
  it.each<[InputIntent, ReturnType<typeof intentToPlayerInput>]>([
    [
      { type: 'move', slot: 1, seq: 1, x: 0.5, y: -0.25 },
      { slot: 1, input: { type: 'move', x: 0.5, y: -0.25 } },
    ],
    [
      { type: 'press', slot: 2, seq: 2, button: 'a' },
      { slot: 2, input: { type: 'button', button: 'dash', pressed: true } },
    ],
    [
      { type: 'release', slot: 2, seq: 3, button: 'a' },
      { slot: 2, input: { type: 'button', button: 'dash', pressed: false } },
    ],
    [
      { type: 'press', slot: 3, seq: 4, button: 'b' },
      { slot: 3, input: { type: 'button', button: 'dash', pressed: true } },
    ],
    [{ type: 'gesture', slot: 4, seq: 5, kind: 'swipe-up' }, null],
    [{ type: 'reaction', slot: 4, seq: 6, windowId: 1 }, null],
  ])('%j → %j', (intent, expected) => {
    expect(intentToPlayerInput(intent)).toEqual(expected);
  });
});

describe('createWebSocketInputSource', () => {
  it('gibt übersetzte Eingaben an die Szene und hört nach stop() auf', () => {
    const hub = createIntentHub();
    const sink = { applyInput: vi.fn() };
    const applied = vi.fn();
    const stop = createWebSocketInputSource(hub, applied).start(sink);

    hub.emit({ type: 'move', slot: 1, seq: 1, x: 1, y: 0 });
    hub.emit({ type: 'gesture', slot: 1, seq: 2, kind: 'swipe-left' });
    expect(sink.applyInput).toHaveBeenCalledExactlyOnceWith(1, { type: 'move', x: 1, y: 0 });
    expect(applied).toHaveBeenCalledExactlyOnceWith({
      slot: 1,
      input: { type: 'move', x: 1, y: 0 },
    });

    stop();
    hub.emit({ type: 'move', slot: 1, seq: 3, x: 0, y: 1 });
    expect(sink.applyInput).toHaveBeenCalledOnce();
  });
});
