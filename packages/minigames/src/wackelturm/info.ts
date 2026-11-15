import type { MinigameInfo } from '@chaos-party/minigame-sdk';

/**
 * Wackelturm – Hybrid-Minispiel (CHAOS-29, CHAOS-32, EXP-007): schnell greifen und sanft
 * lenken (Ausführung) plus Turmhöhe, Goldumweg und Rempeln abwägen (Taktik).
 */
export const WACKELTURM_INFO: MinigameInfo = {
  id: 'wackelturm',
  category: 'hybrid',
  title: 'Wackelturm',
  tagline: 'Stapelt Törtchen auf den Kopf – je höher, desto wackliger!',
  instructions: [
    'A greift Törtchen am Berg. Trag den Turm in dein Nest.',
    'Ab 6 Stück zählt er doppelt. Lenk sanft, sonst kippt er!',
    'Leere Hände? B rempelt fremde Türme um und klaut.',
  ],
  controls: { joystick: 'Laufen', a: 'Greifen', b: 'Rempeln' },
  durationMs: 35_000,
  physics: false,
  scoring: 'higher',
  scoreUnit: 'Punkte',
};
