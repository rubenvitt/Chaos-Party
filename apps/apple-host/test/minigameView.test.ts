/**
 * Anleitung mit Bereitschaft für Swift (CHAOS-214): `readinessView` wie die Chips im
 * Browser-Host, kein Countdown, solange die Anleitung auf „Bereit“ wartet.
 */
import { describe, expect, it } from 'vitest';
import { minigameView } from '../../host/src/minigame/testViews.ts';
import { MinigameReadinessSchema } from '../src/contract.ts';
import { introCountdown, readinessView } from '../src/minigameView.ts';

function waitingIntro() {
  const view = minigameView('minigame-intro', { ready: [1, 3] }, { remainingMs: 60_000 });
  return {
    ...view,
    players: view.players.map((p) => (p.slot === 4 ? { ...p, connected: false } : p)),
  };
}

describe('Anleitung mit Bereitschaft (CHAOS-214)', () => {
  it('liefert je Spieler Zustand und Text, gültig nach Vertrag', () => {
    const readiness = readinessView(waitingIntro());
    expect(MinigameReadinessSchema.safeParse(readiness).success).toBe(true);
    expect(readiness?.headline).toContain('Bereit!');
    expect(readiness?.players.map((p) => [p.slot, p.state, p.text])).toEqual([
      [1, 'ready', 'Bereit'],
      [2, 'waiting', 'Drückt Bereit …'],
      [3, 'ready', 'Bereit'],
      [4, 'disconnected', 'getrennt'],
    ]);
  });

  it('zeigt keinen Countdown, solange die Anleitung wartet', () => {
    expect(introCountdown(waitingIntro(), 0, 0)).toBeNull();
    expect(introCountdown(waitingIntro(), 0, 58_500)).toBeNull();
  });

  it('ohne `ready`: fester Countdown wie bisher, keine Bereitschaft', () => {
    const intro = minigameView('minigame-intro', {}, { remainingMs: 6000 });
    expect(readinessView(intro)).toBeNull();
    expect(introCountdown(intro, 0, 0)).toBe(6);
    expect(readinessView(minigameView('minigame-play', { ready: [1] }))).toBeNull();
  });
});
