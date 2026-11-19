import { describe, expect, it } from 'vitest';
import { parseHostCommand } from '../src/hostCommand.ts';

describe('parseHostCommand', () => {
  it('kennt die einfachen Befehle', () => {
    for (const type of ['start', 'pause', 'resume', 'end-game', 'rematch'] as const) {
      expect(parseHostCommand(type)).toEqual({ type });
    }
  });

  it('liest configure mit Runden, Schalter oder beidem (CHAOS-166)', () => {
    expect(parseHostCommand('configure:rounds=12')).toEqual({ type: 'configure', rounds: 12 });
    expect(parseHostCommand('configure:rounds=1')).toEqual({ type: 'configure', rounds: 1 });
    expect(parseHostCommand('configure:rounds=20')).toEqual({ type: 'configure', rounds: 20 });
    expect(parseHostCommand('configure:moreReactionTime=1')).toEqual({
      type: 'configure',
      moreReactionTime: true,
    });
    expect(parseHostCommand('configure:moreReactionTime=false')).toEqual({
      type: 'configure',
      moreReactionTime: false,
    });
    expect(parseHostCommand('configure:rounds=16,moreReactionTime=0')).toEqual({
      type: 'configure',
      rounds: 16,
      moreReactionTime: false,
    });
  });

  it('lehnt Unbekanntes und Ungültiges ab', () => {
    for (const cmd of [
      '',
      'gibt-es-nicht',
      'START',
      'configure',
      'configure:',
      'configure:rounds',
      'configure:rounds=',
      'configure:rounds=0',
      'configure:rounds=21',
      'configure:rounds=abc',
      'configure:rounds=1.5',
      'configure:rounds=-3',
      'configure:rounds=012',
      'configure:rounds=12=3',
      'configure:rounds=12,rounds=10',
      'configure:moreReactionTime=ja',
      'configure:moreReactionTime=',
      'configure:moreReactionTime=1,moreReactionTime=0',
      'configure:farbe=rot',
      'configure:rounds=12,',
      'configure:__proto__=1',
      'configure:moreReactionTime=constructor',
    ]) {
      expect(parseHostCommand(cmd), cmd).toBeNull();
    }
  });
});
