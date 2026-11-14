/**
 * Fehlercodes → freundliche deutsche Texte. Der Controller zeigt nie die
 * technische `message` des Servers, sondern nur diese Texte (ADR-006).
 */
import type { ErrorCode } from '@chaos-party/protocol';

/** Fehler, die nur im Controller entstehen (Verbindung). */
export type ClientErrorCode = 'connection-failed' | 'connection-lost';

export type UiErrorCode = ErrorCode | ClientErrorCode;

/**
 * Wie auffällig ein Fehler erscheint:
 * - `silent`: gar nicht (z. B. verspätete Eingabe, abgelaufenes Token mit automatischem Neubeitritt),
 * - `toast`: kurzer Hinweis, Spiel geht weiter,
 * - `code`: zurück zur Code-Eingabe,
 * - `blocking`: ganzer Bildschirm mit Knopf (neu laden / neu verbinden).
 */
export type ErrorSeverity = 'silent' | 'toast' | 'code' | 'blocking';

interface ErrorPresentation {
  readonly severity: ErrorSeverity;
  readonly text: string;
}

const PRESENTATION: Readonly<Record<UiErrorCode, ErrorPresentation>> = {
  'bad-message': {
    severity: 'toast',
    text: 'Da ist etwas schiefgelaufen. Lade die Seite neu, falls es hakt.',
  },
  'too-large': {
    severity: 'toast',
    text: 'Da ist etwas schiefgelaufen. Lade die Seite neu, falls es hakt.',
  },
  'version-mismatch': {
    severity: 'blocking',
    text: 'Das Spiel wurde aktualisiert. Bitte lade die Seite neu.',
  },
  'not-joined': {
    severity: 'blocking',
    text: 'Du bist noch nicht im Spiel. Bitte verbinde dich neu.',
  },
  'bad-join-code': {
    severity: 'code',
    text: 'Diesen Code gibt es nicht. Schau noch mal auf den Fernseher.',
  },
  'session-full': {
    severity: 'blocking',
    text: 'Das Spiel ist schon voll. Mehr als vier Spieler gehen nicht.',
  },
  'bad-token': {
    severity: 'silent',
    text: 'Deine alte Sitzung ist abgelaufen. Du trittst neu bei.',
  },
  'host-taken': {
    severity: 'blocking',
    text: 'Auf diesem Spiel läuft schon ein anderer Bildschirm.',
  },
  'not-your-slot': { severity: 'toast', text: 'Das ist nicht dein Platz.' },
  'out-of-phase': { severity: 'toast', text: 'Das geht gerade nicht. Warte kurz.' },
  'stale-seq': { severity: 'silent', text: 'Eine Eingabe kam zu spät an.' },
  'rate-limited': { severity: 'toast', text: 'Nicht so hastig! Kurz durchatmen.' },
  internal: {
    severity: 'toast',
    text: 'Der Spiel-PC hat ein Problem. Versuch es gleich noch mal.',
  },
  'connection-failed': {
    severity: 'blocking',
    text: 'Der Spiel-PC ist nicht erreichbar. Bist du im selben WLAN?',
  },
  'connection-lost': { severity: 'blocking', text: 'Die Verbindung zum Spiel-PC ist weg.' },
};

export function errorText(code: UiErrorCode): string {
  return PRESENTATION[code].text;
}

export function errorSeverity(code: UiErrorCode): ErrorSeverity {
  return PRESENTATION[code].severity;
}

/** Was der Knopf auf dem Fehlerbildschirm tut. */
export function errorRemedy(code: UiErrorCode): 'reload' | 'retry' {
  return code === 'version-mismatch' ? 'reload' : 'retry';
}
