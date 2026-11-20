import { BoardViewSchema } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { introReadiness, READY_HEADLINE, waitsForReady } from './readiness.ts';
import { minigameView } from './testViews.ts';

/** Anleitung, die auf Bereitschaft wartet: Blau und Grün bereit, Rosa getrennt. */
function waitingIntro() {
  const view = minigameView('minigame-intro', { ready: [1, 3] });
  return {
    ...view,
    players: view.players.map((p) => (p.slot === 4 ? { ...p, connected: false } : p)),
  };
}

describe('Bereitschaft in der Anleitung (CHAOS-214)', () => {
  it('Testansicht ist protokollgültig', () => {
    expect(BoardViewSchema.safeParse(waitingIntro()).success).toBe(true);
  });

  it('zeigt je Spieler bereit, wartend oder getrennt mit Farbe, Symbol und Figur', () => {
    const readiness = introReadiness(waitingIntro());
    expect(readiness?.headline).toBe(READY_HEADLINE);
    expect(
      readiness?.players.map((p) => [p.slot, p.name, p.state, p.text, p.ready, p.connected]),
    ).toEqual([
      [1, 'Blau', 'ready', 'Bereit', true, true],
      [2, 'Orange', 'waiting', 'Drückt Bereit …', false, true],
      [3, 'Grün', 'ready', 'Bereit', true, true],
      [4, 'Rosa', 'disconnected', 'getrennt', false, false],
    ]);
    const first = readiness?.players[0];
    expect(first?.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(first?.symbol).toBe('●');
    expect(first?.character.length).toBeGreaterThan(0);
  });

  it('getrennt geht vor bereit (zählt beim Server ohnehin als bereit)', () => {
    const view = waitingIntro();
    const readiness = introReadiness({
      ...view,
      minigame: view.minigame ? { ...view.minigame, ready: [4] } : null,
    });
    expect(readiness?.players.find((p) => p.slot === 4)?.state).toBe('disconnected');
  });

  it('ohne `ready` oder außerhalb der Anleitung: keine Bereitschaft (feste Anleitungszeit)', () => {
    expect(introReadiness(minigameView('minigame-intro'))).toBeNull();
    expect(waitsForReady(minigameView('minigame-intro'))).toBe(false);
    expect(introReadiness(minigameView('minigame-play', { ready: [1] }))).toBeNull();
    expect(waitsForReady(minigameView('minigame-play', { ready: [1] }))).toBe(false);
    expect(waitsForReady(waitingIntro())).toBe(true);
    expect(waitsForReady(null)).toBe(false);
  });

  it('niemand bereit: alle wartend', () => {
    const readiness = introReadiness(minigameView('minigame-intro', { ready: [] }));
    expect(readiness?.players.every((p) => p.state === 'waiting')).toBe(true);
  });
});
