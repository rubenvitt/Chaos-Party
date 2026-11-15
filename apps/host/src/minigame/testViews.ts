/**
 * Brett-Stände in den Minispiel-Phasen für Unit-Tests der Bühne (nur Tests importieren das).
 */
import type { BoardView } from '@chaos-party/protocol';
import { DEMO_VIEW } from '../board/demo.ts';

export type MinigameFields = NonNullable<BoardView['minigame']>;

export function minigameView(
  gamePhase: 'minigame-intro' | 'minigame-play' | 'minigame-results' | 'round-end',
  minigame: Partial<MinigameFields> = {},
  view: Partial<BoardView> = {},
): BoardView {
  return {
    ...DEMO_VIEW,
    gamePhase,
    activeSlot: null,
    prompt: null,
    remainingMs: gamePhase === 'minigame-intro' ? 6000 : null,
    ...view,
    minigame: {
      id: 'pump-parade',
      round: 2,
      seed: 1234,
      playMs: 8000,
      elapsedMs: gamePhase === 'minigame-intro' ? null : 0,
      placements: null,
      highlights: [],
      aborted: false,
      rewards: null,
      ...minigame,
    },
  };
}
