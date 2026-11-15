/**
 * Spielregeln (Zustandsautomat, Würfel, Bewegung, Ökonomie, Items, Reaktionsfenster;
 * CHAOS-17/19/20/21) und Bot-Simulation für Balance-Experimente (CHAOS-24).
 */
export { createGame, step } from './machine.ts';
export { DEFAULT_RULES, ZERO_PACING, withRules, type RuleOverrides } from './defaults.ts';
export { rankPlayers } from './economy.ts';
export { stealLoss, type ReactionResult } from './reaction.ts';
export {
  BOARD_EVENT_KINDS,
  COIN_RAIN_AMOUNT,
  GUST_MAX_STEPS,
  GUST_MIN_STEPS,
  LUCKY_FIND_AMOUNT,
} from './spaces.ts';
export { ITEM_KINDS } from './items.ts';
export {
  ACTIVE_ITEMS,
  BRACE_OPTION,
  BUY_OPTION,
  CANCEL_OPTION,
  NO_REACTION_OPTION,
  ROLL_OPTION,
  SHIELD_OPTION,
  SKIP_OPTION,
  itemOption,
  slotOption,
} from './prompts.ts';
export { toPublicView, type PublicGameView, type PublicPlayer, type PublicPrompt } from './view.ts';
export {
  DEFAULT_BOT_POLICY,
  simulateGame,
  summarizeSimulations,
  type BotPolicy,
  type MsRange,
  type SimulationOptions,
  type SimulationPlayerResult,
  type SimulationResult,
  type SimulationSummary,
} from './simulate.ts';
