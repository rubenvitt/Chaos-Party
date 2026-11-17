import { simulateGame } from '../../packages/game-core/src/rules/simulate.ts';
import { DEFAULT_BOARD } from '../../packages/game-core/src/board/index.ts';
(globalThis as any).runGames = (n: number) => {
  const t0 = Date.now();
  let turns = 0;
  for (let i = 0; i < n; i++) {
    const r: any = simulateGame({
      players: 4,
      rounds: 10,
      seed: 100 + i,
      board: DEFAULT_BOARD,
    } as any);
    turns += r?.turns ?? 0;
  }
  return JSON.stringify({ games: n, ms: Date.now() - t0, turns });
};
