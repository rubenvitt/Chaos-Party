import type { MinigameInfo } from '@chaos-party/minigame-sdk';

/**
 * Referenz-Minispiel des Vertrags (CHAOS-26): so einfach wie möglich, aber vollständig.
 * Nicht in der Rotation; dient als Vorlage und als Rückfall, falls kein anderes Minispiel
 * registriert ist.
 */
export const PUMP_PARADE_INFO: MinigameInfo = {
  id: 'pump-parade',
  category: 'arcade',
  title: 'Pump-Parade',
  tagline: 'Pumpt euren Ballon am schnellsten auf!',
  instructions: ['Tippe A so oft du kannst.', 'Größter Ballon gewinnt.'],
  controls: { joystick: null, a: 'Pumpen', b: null },
  durationMs: 8_000,
  physics: false,
  scoring: 'higher',
  scoreUnit: 'Pumpstöße',
  family: 'pumpen-dosieren',
  verb: 'pumpen',
  form: 'ffa',
  ipadZone: true,
};
