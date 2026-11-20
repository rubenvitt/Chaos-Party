import type { MinigameInfo } from '@chaos-party/minigame-sdk';

/**
 * Muster-Minispiel des Baukastens (CHAOS-83, ADR-020): zeigt, wie ein Spiel den Unterbau nutzt.
 * Nicht in der Rotation – eine Vorlage zum Lesen, keine Spielidee zum Kopieren (README §5.5).
 */
export const HALLO_BAUKASTEN_INFO: MinigameInfo = {
  id: 'hallo-baukasten',
  category: 'arcade',
  title: 'Hallo Baukasten',
  tagline: 'Fangt am Teich die Glühwürmchen, bevor der Frosch spritzt!',
  instructions: [
    'Stell dich in den Lichtkreis, dann landet dein Glühwürmchen.',
    'Roter Kreis = Froschspritzer: wer drin steht, ist benommen.',
    'A = Hechten.',
  ],
  controls: { joystick: 'Laufen', a: 'Hechten', b: null },
  durationMs: 20_000,
  physics: false,
  scoring: 'higher',
  scoreUnit: 'Glühwürmchen',
};
