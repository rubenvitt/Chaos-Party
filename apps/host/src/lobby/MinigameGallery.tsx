import type { MinigameRating } from '@chaos-party/protocol';
import { useEffect, useMemo, useRef } from 'react';
import { galleryRows, votesText, type GalleryRow } from './gallery.ts';

interface MinigameGalleryProps {
  readonly ratings: readonly MinigameRating[];
  /** Übungsrunde möglich (verbunden, mindestens ein Controller da)? */
  readonly canPractice: boolean;
  readonly onPractice: (minigameId: string) => void;
  readonly onClose: () => void;
  /** Download-Link des Exports (`/ratings.json` des Servers). */
  readonly exportHref: string;
}

/**
 * Minispiel-Galerie (CHAOS-87, README §5.4): alle startbaren Minispiele mit Status, Kategorie,
 * Familie, Bedienung und Daumen. „Üben“ startet eine Übungsrunde mit den verbundenen Controllern
 * (ein Minispiel, keine Münzen, danach zurück in die Lobby). Spiele der Rotation mit vielen
 * Daumen runter tragen einen Rauswurf-Vorschlag – die Entscheidung bleibt bei Ruben.
 * Escape oder „Schließen“ führt zurück zur Lobby.
 */
export function MinigameGallery({
  ratings,
  canPractice,
  onPractice,
  onClose,
  exportHref,
}: MinigameGalleryProps) {
  const rows = useMemo(() => galleryRows(ratings), [ratings]);
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

  return (
    <div className="gallery" role="dialog" aria-modal="true" aria-labelledby="gallery-title">
      <div className="gallery-card" data-testid="minigame-gallery">
        <header className="gallery-head">
          <div>
            <h2 id="gallery-title">Minispiel-Galerie</h2>
            <p className="gallery-lead">
              Einzeln üben – ohne Münzen. Nach jedem Minispiel gibt’s am Handy Daumen hoch oder
              runter.
            </p>
          </div>
          <div className="gallery-actions">
            <a className="gallery-export" href={exportHref} download data-testid="gallery-export">
              Stimmen exportieren
            </a>
            <button
              ref={closeRef}
              type="button"
              className="gallery-close"
              data-testid="gallery-close"
              onClick={onClose}
            >
              Schließen
            </button>
          </div>
        </header>
        {!canPractice && (
          <p className="gallery-hint" data-testid="gallery-hint">
            Üben geht, sobald mindestens ein Controller verbunden ist.
          </p>
        )}
        <ul className="gallery-list" aria-label="Minispiele">
          {rows.map((row) => (
            <GalleryItem key={row.id} row={row} canPractice={canPractice} onPractice={onPractice} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function GalleryItem({
  row,
  canPractice,
  onPractice,
}: {
  readonly row: GalleryRow;
  readonly canPractice: boolean;
  readonly onPractice: (minigameId: string) => void;
}) {
  return (
    <li
      className="gallery-item"
      data-testid={`gallery-item-${row.id}`}
      data-status={row.status}
      data-suggest-removal={row.suggestRemoval}
    >
      <div className="gallery-item-main">
        <h3 className="gallery-item-title">
          {row.title}
          <span className={`gallery-status gallery-status--${row.status}`}>{row.statusLabel}</span>
        </h3>
        <p className="gallery-item-tagline">{row.tagline}</p>
        <p className="gallery-item-meta">
          {row.category}
          {row.family === null ? '' : ` · ${row.family}`} · {String(row.seconds)} s · {row.controls}
        </p>
        {row.suggestRemoval && (
          <p className="gallery-removal" data-testid={`gallery-removal-${row.id}`}>
            Viele Daumen runter – aus der Rotation nehmen?
          </p>
        )}
      </div>
      <div
        className="gallery-votes"
        data-testid={`gallery-votes-${row.id}`}
        data-up={row.up}
        data-down={row.down}
        aria-label={`${String(row.up)} Daumen hoch, ${String(row.down)} Daumen runter`}
      >
        <span className="gallery-vote">
          <span aria-hidden="true">👍</span> {row.up}
        </span>
        <span className="gallery-vote">
          <span aria-hidden="true">👎</span> {row.down}
        </span>
        <span className="gallery-votes-total">{votesText(row)}</span>
      </div>
      <button
        type="button"
        className="gallery-practice"
        data-testid={`gallery-practice-${row.id}`}
        disabled={!canPractice}
        aria-label={`${row.title} üben`}
        onClick={() => {
          onPractice(row.id);
        }}
      >
        Üben
      </button>
    </li>
  );
}
