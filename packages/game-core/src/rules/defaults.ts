import type { Pacing, RuleSet } from '../types.ts';

/**
 * Standardregeln. Festgelegt per Bot-Simulation in CHAOS-24 (`docs/experiments.md`,
 * EXP-001 … EXP-004; Startwerte davor: `START_RULES` in `experiments.ts`). In M4 (CHAOS-40,
 * EXP-011/012) mit echter Minispiel-Rotation und 10–20 Runden geprüft und unverändert
 * behalten; der Hebel war die Rundenzahl (`apps/server/src/game.ts`). Ob sich das gut anfühlt,
 * entscheidet der Playtest.
 */
export const DEFAULT_RULES: RuleSet = {
  diceFaces: [1, 2, 3, 4, 5, 6],
  economy: {
    startCoins: 10,
    coinsPlus: 3,
    coinsMinus: 3,
    minigameRewards: [10, 5, 3, 0],
  },
  // EXP-002: 3 von 6 Kandidaten aktiv, Preis 15 – sonst fallen in 5 Runden kaum Trophäen.
  trophy: { price: 15, mode: 'wandering', activeCount: 3 },
  items: {
    capacity: 3,
    // EXP-003: Start-Item und Fallen beim Darüberlaufen, damit Sabotage überhaupt vorkommt;
    // Verluste passend zum niedrigeren Trophäenpreis etwas kleiner.
    startItems: 1,
    weights: { 'double-dice': 3, 'coin-steal': 3, trap: 3, shield: 2 },
    stealAmount: 5,
    trapAmount: 4,
    trapTrigger: 'pass',
  },
  pacing: {
    turnStartMs: 1200,
    rollMs: 1000,
    stepMs: 350,
    spaceEventMs: 1500,
    turnEndMs: 600,
    // M3: Zeit zum Lesen der Anleitung bzw. der Ergebniskarte (Platzhalter-Minispiel: 3 s Spiel).
    minigameIntroMs: 7000,
    minigamePlayMs: 3000,
    minigameResultsMs: 6000,
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
