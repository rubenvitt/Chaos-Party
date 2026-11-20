import { bedienungOf, mostSimilar } from '@chaos-party/minigame-kit';
import { describe, expect, it } from 'vitest';
import { MINIGAME_INFOS } from './catalog.ts';
import { STECKBRIEFE, getSteckbrief } from './steckbriefe.ts';

describe('Vielfalts-Steckbriefe (ADR-020)', () => {
  it('jedes Minispiel hat einen Steckbrief, die Bedienung passt zum Controller', () => {
    expect(Object.keys(STECKBRIEFE).sort()).toEqual(MINIGAME_INFOS.map((info) => info.id).sort());
    for (const info of MINIGAME_INFOS) {
      expect(getSteckbrief(info.id)?.bedienung, info.id).toBe(bedienungOf(info.controls));
    }
  });

  it('nennt das ähnlichste Spiel (Mindestabstand prüft CHAOS-84)', () => {
    const others = Object.entries(STECKBRIEFE)
      .filter(([id]) => id !== 'hallo-baukasten')
      .map(([id, steckbrief]) => ({ id, steckbrief }));
    const hallo = getSteckbrief('hallo-baukasten');
    if (!hallo) throw new Error('kein Steckbrief');
    // Das Muster ist bewusst nah an Sockenregen (beide fangen); es ist nicht in der Rotation.
    expect(mostSimilar(hallo, others)?.id).toBe('sockenregen');
  });
});
