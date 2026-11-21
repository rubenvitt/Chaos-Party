import type { LobbyMinigame } from '@chaos-party/protocol';
import { useEffect, useRef } from 'react';

interface MinigameRotationDialogProps {
  readonly minigames: readonly LobbyMinigame[];
  readonly onToggle: (id: string, kind: 'blocked' | 'favorite') => void;
  readonly onClose: () => void;
}

/**
 * Minispiele der Rotation am PC (CHAOS-85): je Spiel „Favorit“ (kommt öfter) und „Sperren“
 * (kommt nicht). Zeigt den Stand des Servers (`lobby.settings.minigames`); jeder Klick sendet
 * `configure`. Modal, per Tastatur bedienbar, Escape schließt.
 */
export function MinigameRotationDialog({
  minigames,
  onToggle,
  onClose,
}: MinigameRotationDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const allBlocked = minigames.every((game) => game.blocked);
  return (
    <div className="rotation-backdrop" data-testid="minigame-rotation">
      <div
        className="rotation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rotation-title"
      >
        <h2 id="rotation-title">Minispiele</h2>
        <p className="rotation-lead">
          ★ Favoriten kommen öfter dran, gesperrte gar nicht. Gilt ab der nächsten Partie.
        </p>
        <ul className="rotation-list">
          {minigames.map((game) => (
            <li
              key={game.id}
              className="rotation-item"
              data-testid={`rotation-${game.id}`}
              data-blocked={game.blocked}
              data-favorite={game.favorite}
            >
              <span className="rotation-title">{game.title}</span>
              <button
                type="button"
                className="rotation-toggle rotation-toggle--favorite"
                data-testid={`rotation-favorite-${game.id}`}
                aria-pressed={game.favorite}
                aria-label={`${game.title} als Favorit`}
                onClick={() => {
                  onToggle(game.id, 'favorite');
                }}
              >
                <span className="rotation-toggle-label">
                  <span aria-hidden="true">★</span> Favorit
                </span>
              </button>
              <button
                type="button"
                className="rotation-toggle rotation-toggle--blocked"
                data-testid={`rotation-blocked-${game.id}`}
                aria-pressed={game.blocked}
                aria-label={`${game.title} sperren`}
                onClick={() => {
                  onToggle(game.id, 'blocked');
                }}
              >
                <span className="rotation-toggle-label">
                  <span aria-hidden="true">⦸</span> Sperren
                </span>
              </button>
            </li>
          ))}
        </ul>
        {allBlocked && (
          <p className="rotation-warning" role="note">
            Alle gesperrt – dann kommen trotzdem alle dran.
          </p>
        )}
        <button
          ref={closeRef}
          type="button"
          className="rotation-close"
          data-testid="minigame-rotation-close"
          onClick={onClose}
        >
          Fertig
        </button>
      </div>
    </div>
  );
}
