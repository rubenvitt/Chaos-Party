import type { MinigameInfo } from '@chaos-party/minigame-sdk';

/**
 * Pudding-Gerangel (M3, Kategorie Physik, CHAOS-29/31; Konzeptvergleich EXP-006): Alle
 * rangeln auf einem riesigen Wackelpudding um den Kirschfleck. Der Pudding kippt dorthin, wo
 * alle stehen, ein Rührlöffel fegt herum, Rempler schubsen in die Sahne.
 */
export const PUDDING_GERANGEL_INFO: MinigameInfo = {
  id: 'pudding-gerangel',
  category: 'physics',
  title: 'Pudding-Gerangel',
  tagline: 'Wer hält sich auf der Kirsche, wenn der Pudding wackelt?',
  instructions: [
    'Steh auf dem Kirschfleck – jede Sekunde gibt Punkte.',
    'Der Pudding kippt, wo alle stehen. Nicht runterfallen!',
    'A = Rempeln. Wer führt, trägt die wackelige Krone.',
  ],
  controls: { joystick: 'Laufen', a: 'Rempeln', b: null },
  durationMs: 30_000,
  physics: true,
  scoring: 'higher',
  scoreUnit: 'Punkte',
};
