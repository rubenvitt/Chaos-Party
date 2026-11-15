import type { Pacing, RuleSet } from '../types.ts';

/** Startwerte der Regeln; werden per Experiment justiert (CHAOS-24). */
export const DEFAULT_RULES: RuleSet = {
  diceFaces: [1, 2, 3, 4, 5, 6],
  economy: {
    startCoins: 10,
    coinsPlus: 3,
    coinsMinus: 3,
    minigameRewards: [10, 5, 3, 0],
  },
  trophy: { price: 20, mode: 'wandering' },
  items: {
    capacity: 3,
    weights: { 'double-dice': 3, 'coin-steal': 3, trap: 3, shield: 2 },
    stealAmount: 6,
    trapAmount: 5,
  },
  pacing: {
    turnStartMs: 1200,
    rollMs: 1000,
    stepMs: 350,
    spaceEventMs: 1500,
    turnEndMs: 600,
    minigameIntroMs: 2500,
    minigamePlayMs: 3000,
    minigameResultsMs: 3000,
    roundEndMs: 1500,
    reactionWindowMs: 3000,
    disconnectGraceMs: 15000,
  },
};

/** Alle automatischen Pausen 0 (Fristen für Reaktion/Disconnect bleiben): für Tests und Simulation. */
export const ZERO_PACING: Pacing = {
  ...DEFAULT_RULES.pacing,
  turnStartMs: 0,
  rollMs: 0,
  stepMs: 0,
  spaceEventMs: 0,
  turnEndMs: 0,
  minigameIntroMs: 0,
  minigamePlayMs: 0,
  minigameResultsMs: 0,
  roundEndMs: 0,
};

/** Regeln mit überschriebenen Teilen (flach je Gruppe zusammengeführt). */
export interface RuleOverrides {
  readonly diceFaces?: readonly number[];
  readonly economy?: Partial<RuleSet['economy']>;
  readonly trophy?: Partial<RuleSet['trophy']>;
  readonly items?: Partial<Omit<RuleSet['items'], 'weights'>> & {
    readonly weights?: Partial<RuleSet['items']['weights']>;
  };
  readonly pacing?: Partial<Pacing>;
}

export function withRules(overrides: RuleOverrides, base: RuleSet = DEFAULT_RULES): RuleSet {
  return {
    diceFaces: overrides.diceFaces ?? base.diceFaces,
    economy: { ...base.economy, ...overrides.economy },
    trophy: { ...base.trophy, ...overrides.trophy },
    items: {
      ...base.items,
      ...overrides.items,
      weights: { ...base.items.weights, ...overrides.items?.weights },
    },
    pacing: { ...base.pacing, ...overrides.pacing },
  };
}
