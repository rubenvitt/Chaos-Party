import type { MinigameInfo } from '@chaos-party/minigame-sdk';

/**
 * Sockenregen – Arcade-Minispiel (CHAOS-29/30, EXP-005 Variante A4): Positionierung und
 * Reflex. Waschmaschine Wumms schleudert Socken und Bügeleisen in die Arena.
 */
export const SOCKENREGEN_INFO: MinigameInfo = {
  id: 'sockenregen',
  category: 'arcade',
  title: 'Sockenregen',
  tagline: 'Waschmaschine Wumms spuckt Socken. Fang sie alle!',
  instructions: [
    'Lauf unter die Schatten und fang die Socken. Gold zählt 3.',
    'Roter Kreis = Bügeleisen! Wer drin steht, wird geplättet.',
    'A = Hechtsprung, wenn es knapp wird.',
  ],
  controls: { joystick: 'Laufen', a: 'Hechtsprung', b: null },
  durationMs: 30_000,
  physics: false,
  scoring: 'higher',
  scoreUnit: 'Socken',
  family: 'fangen-sammeln',
  verb: 'fangen',
  form: 'ffa',
  ipadZone: true,
};
