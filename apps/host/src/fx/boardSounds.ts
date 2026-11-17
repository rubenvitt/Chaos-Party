/**
 * Klänge zu den Brett-Ereignissen der Regie (CHAOS-33). Rein: Ereignis → Klang oder `null`.
 * Die Regie meldet jedes Ereignis, sobald sie es abspielt (`onEvent`), damit Ton und
 * Animation zusammenpassen.
 */
import type { BoardEvent } from '@chaos-party/protocol';
import type { PlayOptions, SoundName } from './sounds.ts';

export interface SoundCue {
  readonly name: SoundName;
  readonly options?: PlayOptions;
}

export function boardEventSound(event: BoardEvent): SoundCue | null {
  switch (event.type) {
    case 'turn-started':
      return { name: 'turn' };
    case 'dice-rolled':
      return { name: 'dice' };
    case 'coins-changed':
      if (event.delta === 0) return null;
      // Trophäe, Klau und Falle haben eigene Klänge (eigene Ereignisse).
      if (event.reason === 'trophy' || event.reason === 'steal' || event.reason === 'trap') {
        return null;
      }
      return event.delta > 0 ? { name: 'coin-gain' } : { name: 'coin-loss' };
    case 'coins-stolen':
      return event.amount > 0 ? { name: 'steal' } : { name: 'buzz', options: { volume: 0.6 } };
    case 'trap-placed':
      return { name: 'trap', options: { volume: 0.5, pitch: 1.25 } };
    case 'trap-triggered':
      return { name: 'trap' };
    case 'item-used':
      return event.item === 'shield'
        ? { name: 'shield' }
        : { name: 'whoosh', options: { volume: 0.7 } };
    case 'reaction-resolved':
      if (event.result === 'shield') return { name: 'shield' };
      return event.result === 'brace'
        ? { name: 'bump' }
        : { name: 'buzz', options: { volume: 0.6 } };
    case 'trophy-bought':
      return { name: 'trophy' };
    case 'item-gained':
      return { name: 'pop', options: { pitch: 1.2 } };
    case 'game-ended':
      return { name: 'win' };
    case 'round-started':
      // Wachsende Sabotage (CHAOS-120): tiefer Fallen-Klang zur Ansage.
      return event.sabotage ? { name: 'trap', options: { pitch: 0.8 } } : null;
    // Minispiel-Klänge spielt die Minispiel-Bühne (sie ersetzt das Brett in diesen Phasen).
    case 'game-started':
    case 'path-chosen':
    case 'moved':
    case 'trophy-moved':
    case 'board-event':
    case 'reaction-opened':
    case 'player-auto':
    case 'turn-ended':
    case 'minigame-started':
    case 'minigame-results':
    case 'round-ended':
      return null;
  }
}
