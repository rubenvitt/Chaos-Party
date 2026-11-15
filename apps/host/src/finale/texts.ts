/**
 * Texte des Finales (CHAOS-37): Gleichstand-Ansage, Begründung am Siegerbildschirm und kurze
 * Kennzeichnung je Platz (`decidedBy`). Rein, unit-getestet.
 */
import type { RankingCriterion } from '@chaos-party/protocol';
import type { TiebreakCriterion } from './finalePlan.ts';

/** Kurzer Text, warum ein Platz so entschieden wurde (Rangliste am Ende). */
export const CRITERION_BADGE: Readonly<Record<RankingCriterion, string | null>> = {
  trophies: null,
  coins: 'per Münzen',
  'minigame-wins': 'per Minispiel-Siegen',
  shared: 'geteilt',
};

/** Ansage im Gleichstand-Abschnitt und Untertitel des Siegerbildschirms. */
export function tiebreakText(criterion: TiebreakCriterion): { title: string; lead: string } {
  switch (criterion) {
    case 'coins':
      return {
        title: 'Gleichstand bei den Trophäen!',
        lead: 'Jetzt entscheiden die Münzen …',
      };
    case 'minigame-wins':
      return {
        title: 'Trophäen und Münzen gleich!',
        lead: 'Jetzt entscheiden die Minispiel-Siege …',
      };
    case 'shared':
      return {
        title: 'Unglaublich – alles gleich!',
        lead: 'Trophäen, Münzen und Minispiel-Siege gleich: Der Sieg wird geteilt.',
      };
  }
}

/** Begründung unter „… gewinnt!“, wenn der Sieg nicht über die Trophäen fiel. */
export function winnerReason(criterion: TiebreakCriterion): string {
  switch (criterion) {
    case 'coins':
      return 'Gleich viele Trophäen – die Münzen haben entschieden.';
    case 'minigame-wins':
      return 'Trophäen und Münzen gleich – die Minispiel-Siege haben entschieden.';
    case 'shared':
      return 'Alles gleich – der Sieg wird geteilt.';
  }
}
