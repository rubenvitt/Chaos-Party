import { describe, expect, it } from 'vitest';
import type { HostPlayer } from '../players.ts';
import { diffPlayers, playerEventText } from './playerEvents.ts';

const blue: HostPlayer = {
  slot: 1,
  color: '#0072B2',
  label: 'Blau',
  symbol: '●',
  connected: true,
  ready: false,
};
const orange: HostPlayer = {
  slot: 2,
  color: '#E69F00',
  label: 'Mia',
  symbol: '▲',
  connected: true,
  ready: true,
};
const off = (player: HostPlayer): HostPlayer => ({ ...player, connected: false });

describe('diffPlayers', () => {
  it('meldet nichts beim ersten Schnappschuss und ohne Änderung', () => {
    expect(diffPlayers(null, [off(blue)])).toEqual([]);
    expect(diffPlayers([blue, orange], [blue, { ...orange, ready: false }])).toEqual([]);
    // Neu beigetretene Spieler zeigt die Lobby-Liste; kein Toast.
    expect(diffPlayers([blue], [blue, orange])).toEqual([]);
  });

  it('meldet Verlust und Rückkehr je Spieler', () => {
    const lost = diffPlayers([blue, orange], [blue, off(orange)]);
    expect(lost).toEqual([{ kind: 'lost', slot: 2, label: 'Mia', color: '#E69F00', symbol: '▲' }]);
    expect(lost.map(playerEventText)).toEqual(['Mia hat die Verbindung verloren']);

    const back = diffPlayers([blue, off(orange)], [blue, orange]);
    expect(back.map((e) => [e.kind, e.slot])).toEqual([['back', 2]]);
    expect(back.map(playerEventText)).toEqual(['Mia ist wieder da']);
  });

  it('meldet freigegebene Plätze getrennter Spieler, sortiert nach Slot', () => {
    const events = diffPlayers([off(blue), orange], [off(orange)]);
    expect(events.map((e) => [e.kind, e.slot])).toEqual([
      ['released', 1],
      ['lost', 2],
    ]);
    expect(events.map(playerEventText)[0]).toBe('Platz von Blau ist wieder frei');
  });
});
