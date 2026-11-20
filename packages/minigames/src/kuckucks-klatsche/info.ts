import type { MinigameInfo } from '@chaos-party/minigame-sdk';

/**
 * Kuckucks-Klatsche – Arcade-Minispiel nur mit Knopf A (CHAOS-54, EXP-016): Reflex und
 * Aufmerksamkeit statt Wettrennen. Jede Person hat ihre eigene Tür im Kuckuckshaus; wer zu
 * lahm ist, verliert den Kuckuck nach dem Gong an die anderen.
 */
export const KUCKUCKS_KLATSCHE_INFO: MinigameInfo = {
  id: 'kuckucks-klatsche',
  category: 'arcade',
  title: 'Kuckucks-Klatsche',
  tagline: 'Die Kuckucksuhr spinnt – klatsch deinen Kuckuck!',
  instructions: [
    'Kuckuck aus deiner Tür? Schnell A – das gibt 2 Punkte!',
    'Zu lahm? Nach dem Gong darf jeder ihn wegklatschen.',
    'Ente, Socke, Blume: Finger weg! Leer klatschen macht benommen.',
  ],
  controls: { joystick: null, a: 'Klatschen', b: null },
  durationMs: 30_000,
  physics: false,
  scoring: 'higher',
  scoreUnit: 'Punkte',
  family: 'reflex-reaktion',
  verb: 'reagieren',
  form: 'ffa',
  ipadZone: true,
};
