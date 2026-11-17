import type { MinigameInfo } from '@chaos-party/minigame-sdk';

/**
 * Krümel-Kehraus (Physik, CHAOS-79, EXP-023): Alle schieben Kekskrümel über ein Holzblech in
 * das eigene Mauseloch in ihrer Ecke. Überarbeitung des in EXP-006 verworfenen Konzepts:
 * feste Ecken statt Lücken im Rand, niemand fällt mehr herunter, weniger Krümel, dafür
 * Goldkrümel und am Ende ein zerbröselnder Riesenkeks.
 */
export const KRUEMEL_KEHRAUS_INFO: MinigameInfo = {
  id: 'kruemel-kehraus',
  category: 'physics',
  title: 'Krümel-Kehraus',
  tagline: 'Wer schiebt die meisten Krümel in das eigene Mauseloch?',
  instructions: [
    'Schieb Krümel in das Mauseloch in deiner Ecke.',
    'Goldkrümel zählen 3. Am Ende zerbröselt ein Riesenkeks.',
    'A = Rempeln: schießt Krümel und schubst andere weg.',
  ],
  controls: { joystick: 'Laufen', a: 'Rempeln', b: null },
  durationMs: 30_000,
  physics: true,
  scoring: 'higher',
  scoreUnit: 'Krümel',
};
