import { useEffect, useRef, useState } from 'react';
import { CODE_LENGTH, isValidJoinCode, normalizeJoinCode } from '../config.ts';
import { errorRemedy, errorText, type UiErrorCode } from '../state/errors.ts';
import type { Notice } from '../state/reducer.ts';

interface CodeEntryProps {
  error: UiErrorCode | null;
  onSubmit: (code: string) => void;
}

/**
 * Code-Eingabe, falls der QR-Link keinen gültigen Code enthält. Ein Eingabefeld
 * (iOS-Tastatur, Großbuchstaben); sobald vier Zeichen da sind, wird gesendet.
 * Schriftgröße ≥ 16 px, sonst zoomt iOS beim Fokussieren.
 */
export function CodeEntry({ error, onSubmit }: CodeEntryProps) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  function submit(code: string) {
    if (isValidJoinCode(code)) onSubmit(code);
  }

  return (
    <main className="screen code-screen" data-testid="code-entry">
      <h1 className="logo ui-text">Chaos Party</h1>
      <form
        className="code-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
      >
        <label className="code-label ui-text" htmlFor="join-code">
          Gib den Code vom Spiel-Bildschirm ein
        </label>
        <input
          ref={input}
          id="join-code"
          className="code-input"
          data-testid="code-input"
          value={value}
          maxLength={CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          placeholder={'•'.repeat(CODE_LENGTH)}
          aria-invalid={error !== null}
          onChange={(event) => {
            const next = normalizeJoinCode(event.target.value, CODE_LENGTH);
            setValue(next);
            if (next.length === CODE_LENGTH) submit(next);
          }}
        />
        {error !== null && (
          <p className="code-error ui-text" role="alert" data-testid="code-error">
            {errorText(error)}
          </p>
        )}
      </form>
    </main>
  );
}

export function ConnectingScreen() {
  return (
    <main className="screen connecting-screen" data-testid="connecting">
      <span className="wait-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <p className="panel-lead ui-text">Verbinde mit dem Spiel …</p>
    </main>
  );
}

interface ErrorScreenProps {
  code: UiErrorCode;
  onRetry: () => void;
}

export function ErrorScreen({ code, onRetry }: ErrorScreenProps) {
  const remedy = errorRemedy(code);
  return (
    <main className="screen error-screen" data-testid="error-screen" data-code={code}>
      <span className="error-face" aria-hidden="true">
        ?!
      </span>
      <p className="panel-lead ui-text" role="alert">
        {errorText(code)}
      </p>
      <button
        type="button"
        className="ready-button"
        data-testid="error-action"
        onClick={() => {
          if (remedy === 'reload') window.location.reload();
          else onRetry();
        }}
      >
        <span className="ui-text">{remedy === 'reload' ? 'Neu laden' : 'Neu verbinden'}</span>
      </button>
    </main>
  );
}

/** Wie lange ein Hinweis stehen bleibt. */
export const NOTICE_MS = 3000;

interface ToastProps {
  notice: Notice;
  onDismiss: (id: number) => void;
}

export function Toast({ notice, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(notice.id);
    }, NOTICE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice.id, onDismiss]);

  return (
    <div className="toast ui-text" role="status" data-testid="toast" data-code={notice.code}>
      {errorText(notice.code)}
    </div>
  );
}
