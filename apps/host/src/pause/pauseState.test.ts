import { describe, expect, it } from 'vitest';
import { canPause, pauseKeyAction } from './pauseState.ts';

const view = (
  gamePhase: 'turn-start' | 'minigame-play' | 'game-results' | 'setup',
  paused = false,
) => ({
  gamePhase,
  paused,
});

describe('canPause', () => {
  it('in der Brettphase und im Minispiel, nicht vor dem Start oder im Endstand', () => {
    expect(canPause(view('turn-start'))).toBe(true);
    expect(canPause(view('minigame-play'))).toBe(true);
    expect(canPause(view('setup'))).toBe(false);
    expect(canPause(view('game-results'))).toBe(false);
    expect(canPause(view('turn-start', true))).toBe(false);
    expect(canPause(null)).toBe(false);
  });
});

describe('pauseKeyAction', () => {
  it('P und Esc pausieren im laufenden Spiel; andere Tasten nicht', () => {
    expect(pauseKeyAction('KeyP', { view: view('turn-start'), confirming: false })).toBe('pause');
    expect(pauseKeyAction('Escape', { view: view('minigame-play'), confirming: false })).toBe(
      'pause',
    );
    expect(pauseKeyAction('Space', { view: view('turn-start'), confirming: false })).toBeNull();
    expect(pauseKeyAction('KeyP', { view: view('game-results'), confirming: false })).toBeNull();
    expect(pauseKeyAction('KeyP', { view: null, confirming: false })).toBeNull();
  });

  it('in der Pause: P setzt fort, Esc schließt erst die Rückfrage', () => {
    const paused = view('turn-start', true);
    expect(pauseKeyAction('KeyP', { view: paused, confirming: false })).toBe('resume');
    expect(pauseKeyAction('KeyP', { view: paused, confirming: true })).toBe('resume');
    expect(pauseKeyAction('Escape', { view: paused, confirming: true })).toBe('close-confirm');
    expect(pauseKeyAction('Escape', { view: paused, confirming: false })).toBe('resume');
  });
});
