import { describe, expect, it, vi } from 'vitest';
import { createKeyboardInputSource, isUiTarget, KeyboardState } from './keyboardInputSource.ts';

describe('KeyboardState', () => {
  it('ordnet WASD Spieler 1 und Pfeile Spieler 2 zu', () => {
    const kb = new KeyboardState();
    expect(kb.key('KeyD', true)).toEqual([{ slot: 1, input: { type: 'move', x: 1, y: 0 } }]);
    expect(kb.key('ArrowUp', true)).toEqual([{ slot: 2, input: { type: 'move', x: 0, y: 1 } }]);
  });

  it('normiert Diagonalen auf Länge 1', () => {
    const kb = new KeyboardState();
    kb.key('KeyW', true);
    const [event] = kb.key('KeyA', true);
    if (event?.input.type !== 'move') throw new Error('erwartet move');
    expect(Math.hypot(event.input.x, event.input.y)).toBeCloseTo(1);
    expect(event.input.x).toBeLessThan(0);
    expect(event.input.y).toBeGreaterThan(0);
  });

  it('gegensätzliche Tasten heben sich auf, Loslassen stoppt', () => {
    const kb = new KeyboardState();
    kb.key('KeyA', true);
    expect(kb.key('KeyD', true)).toEqual([{ slot: 1, input: { type: 'move', x: 0, y: 0 } }]);
    kb.key('KeyA', false);
    expect(kb.key('KeyD', false)).toEqual([{ slot: 1, input: { type: 'move', x: 0, y: 0 } }]);
  });

  it('meldet Dash als Knopf und ignoriert Wiederholungen', () => {
    const kb = new KeyboardState();
    expect(kb.key('Space', true)).toEqual([
      { slot: 1, input: { type: 'button', button: 'dash', pressed: true } },
    ]);
    expect(kb.key('Space', true)).toEqual([]);
    expect(kb.key('Enter', false)).toEqual([]);
  });

  it('ignoriert fremde Tasten', () => {
    const kb = new KeyboardState();
    expect(kb.handles('KeyZ')).toBe(false);
    expect(kb.key('KeyZ', true)).toEqual([]);
  });

  it('lässt bei Fokusverlust alles los', () => {
    const kb = new KeyboardState();
    kb.key('KeyW', true);
    kb.key('ArrowLeft', true);
    kb.key('Enter', true);
    const released = kb.releaseAll();
    expect(released).toContainEqual({ slot: 1, input: { type: 'move', x: 0, y: 0 } });
    expect(released).toContainEqual({ slot: 2, input: { type: 'move', x: 0, y: 0 } });
    expect(released).toContainEqual({
      slot: 2,
      input: { type: 'button', button: 'dash', pressed: false },
    });
    expect(kb.releaseAll()).toEqual([]);
  });
});

describe('isUiTarget', () => {
  it('erkennt fokussierte Bedienelemente, damit Enter/Leertaste dort wirken (CHAOS-36)', () => {
    const element = (match: boolean) =>
      ({ closest: () => (match ? {} : null) }) as unknown as EventTarget;
    expect(isUiTarget(element(true))).toBe(true);
    expect(isUiTarget(element(false))).toBe(false);
    expect(isUiTarget(null)).toBe(false);
    expect(isUiTarget({} as EventTarget)).toBe(false);
  });
});

describe('createKeyboardInputSource', () => {
  function setup() {
    const handlers = new Map<string, (event: KeyboardEvent) => void>();
    const target = {
      addEventListener: (type: string, handler: (event: KeyboardEvent) => void) => {
        handlers.set(type, handler);
      },
      removeEventListener: () => undefined,
    } as unknown as Window;
    const applyInput = vi.fn();
    createKeyboardInputSource(target).start({ applyInput });
    const fire = (type: 'keydown' | 'keyup', code: string, onButton: boolean) => {
      const preventDefault = vi.fn();
      const event = {
        type,
        code,
        repeat: false,
        target: { closest: () => (onButton ? {} : null) },
        preventDefault,
      } as unknown as KeyboardEvent;
      handlers.get(type)?.(event);
      return preventDefault;
    };
    return { fire, applyInput };
  }

  it('lässt die Leertaste auf einem fokussierten Knopf wirken (kein preventDefault, CHAOS-124)', () => {
    const { fire, applyInput } = setup();
    expect(fire('keydown', 'Space', true)).not.toHaveBeenCalled();
    expect(fire('keyup', 'Space', true)).not.toHaveBeenCalled();
    expect(applyInput).not.toHaveBeenCalledWith(1, expect.objectContaining({ pressed: true }));
  });

  it('verhindert außerhalb von Knöpfen weiter das Scrollen und steuert die Figur', () => {
    const { fire, applyInput } = setup();
    expect(fire('keydown', 'Space', false)).toHaveBeenCalled();
    expect(applyInput).toHaveBeenCalledWith(1, { type: 'button', button: 'dash', pressed: true });
    expect(fire('keyup', 'Space', false)).toHaveBeenCalled();
    expect(applyInput).toHaveBeenLastCalledWith(1, {
      type: 'button',
      button: 'dash',
      pressed: false,
    });
  });
});
