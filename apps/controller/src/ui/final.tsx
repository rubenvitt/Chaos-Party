/**
 * Pause und Endstand (M4, CHAOS-36/37) für iPhone und iPad-Zone (`compact`).
 */
import type { ControllerBoardInfo } from '@chaos-party/protocol';
import {
  countLabel,
  describeFinal,
  ENDED_EARLY_NOTE,
  PAUSE_HINT,
  PAUSE_LEAD,
  PAUSE_TITLE,
  REMATCH_HINT,
} from '../board/final.ts';
import { CharacterPortrait } from './CharacterPortrait.tsx';
import { Icon } from './icons.tsx';

/** Pause: klar erkennbar, keine Bedienelemente (der Server bietet nichts an). */
export function PauseCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className="pause-card" data-testid="pause-panel" data-compact={compact} role="status">
      <span className="pause-glyph" aria-hidden="true">
        <i />
        <i />
      </span>
      <p className="pause-title ui-text">{PAUSE_TITLE}</p>
      <p className="pause-lead ui-text">{PAUSE_LEAD}</p>
      {!compact && <p className="pause-hint ui-text">{PAUSE_HINT}</p>}
    </div>
  );
}

/** Endstand: eigener Platz (auch geteilt), Figur, Trophäen, Münzen, Minispiel-Siege. */
export function FinalCard({
  board,
  compact = false,
}: {
  board: ControllerBoardInfo;
  compact?: boolean;
}) {
  const view = describeFinal(board);
  const iconSize = compact ? 22 : 28;
  return (
    <div
      className="final-card"
      data-testid="final-result"
      data-place={view.place ?? ''}
      data-tied={view.tied ? 'true' : 'false'}
      data-ended-early={view.endedEarly ? 'true' : 'false'}
      data-compact={compact}
    >
      <div className="final-hero">
        <CharacterPortrait character={view.character} className="final-portrait" decorative />
        <div className="final-headings">
          {view.placeLabel !== null && (
            <span
              className="final-place"
              data-testid="final-place"
              data-place={view.place ?? ''}
              data-tied={view.tied ? 'true' : 'false'}
            >
              {view.place === 1 && <Icon name="trophy" size={compact ? 26 : 34} />}
              <b className="ui-text">{view.placeLabel}</b>
            </span>
          )}
          <p className="final-headline ui-text" data-testid="final-headline">
            {view.headline}
          </p>
        </div>
      </div>
      <ul className="final-stats" aria-label="Dein Stand">
        <li
          className="final-stat"
          data-testid="final-trophies"
          aria-label={countLabel(view.trophies, 'Trophäe', 'Trophäen')}
        >
          <Icon name="trophy" size={iconSize} />
          <b className="ui-text">{view.trophies}</b>
          <span className="final-stat-label ui-text">Trophäen</span>
        </li>
        <li
          className="final-stat"
          data-testid="final-coins"
          aria-label={countLabel(view.coins, 'Münze', 'Münzen')}
        >
          <Icon name="coin" size={iconSize} />
          <b className="ui-text">{view.coins}</b>
          <span className="final-stat-label ui-text">Münzen</span>
        </li>
        <li
          className="final-stat"
          data-testid="final-wins"
          aria-label={countLabel(view.minigameWins, 'Minispiel gewonnen', 'Minispiele gewonnen')}
        >
          <Icon name="star" size={iconSize} />
          <b className="ui-text">{view.minigameWins}</b>
          <span className="final-stat-label ui-text">Siege</span>
        </li>
      </ul>
      {view.endedEarly && (
        <p className="final-note ui-text" data-testid="final-ended-early">
          {ENDED_EARLY_NOTE}
        </p>
      )}
      <p className="final-rematch ui-text" data-testid="final-rematch">
        {REMATCH_HINT}
      </p>
    </div>
  );
}
