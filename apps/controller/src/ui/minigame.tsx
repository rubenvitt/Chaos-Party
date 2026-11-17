/**
 * Minispiele am Controller (M3, CHAOS-33): Intro (Titel, Anleitung, Bedienlegende) und
 * eigenes Ergebnis, gemeinsam für iPhone (`SlotController`) und iPad-Zone (`ZoneBoard`,
 * `compact`). Das Spiel-Layout selbst bleibt Joystick + Knöpfe (`PlayPanel`, Zonen).
 */
import type { ControllerMinigameInfo } from '@chaos-party/protocol';
import {
  controlLegend,
  describeResult,
  INTRO_READY,
  RESULTS_LEAD,
  type ControlLegendItem,
} from '../minigame/view.ts';
import { ITEM_INFO } from '../board/items.ts';
import { LOOK_AT_SCREEN } from '../board/status.ts';
import { Icon } from './icons.tsx';

/** Kleines Abbild eines Bedienelements (Joystick-Ring bzw. Knopf A/B) für die Legende. */
export function ControlKey({ kind }: { kind: ControlLegendItem['kind'] }) {
  if (kind === 'stick') {
    return (
      <span className="control-key key-stick" aria-hidden="true">
        <i />
      </span>
    );
  }
  return (
    <span className={`control-key key-${kind}`} aria-hidden="true">
      {kind.toUpperCase()}
    </span>
  );
}

const KEY_NAME: Readonly<Record<ControlLegendItem['kind'], string>> = {
  stick: 'Joystick',
  a: 'Knopf A',
  b: 'Knopf B',
};

/** Anleitung vor dem Minispiel: kurz und groß, keine Scroll-Wüste. */
export function MinigameIntro({
  minigame,
  compact = false,
}: {
  minigame: ControllerMinigameInfo;
  compact?: boolean;
}) {
  const legend = controlLegend(minigame.controls);
  return (
    <div
      className="minigame-card minigame-intro"
      data-testid="minigame-intro"
      data-minigame={minigame.id}
      data-compact={compact}
    >
      <div className="minigame-heading">
        <p className="minigame-kicker ui-text">
          <Icon name="star" size={compact ? 20 : 24} />
          Minispiel
        </p>
        <h2 className="minigame-title ui-text" data-testid="minigame-title">
          {minigame.title}
        </h2>
        <p className="minigame-tagline ui-text" data-testid="minigame-tagline">
          {minigame.tagline}
        </p>
      </div>
      <div className="minigame-howto">
        <ol className="minigame-steps" data-testid="minigame-steps">
          {minigame.instructions.map((line, i) => (
            <li key={`${String(i)}-${line}`} className="ui-text">
              {line}
            </li>
          ))}
        </ol>
        {legend.length > 0 && (
          <ul className="control-legend" data-testid="control-legend" aria-label="Bedienung">
            {legend.map((item) => (
              <li
                key={item.kind}
                className="legend-item"
                data-testid={`legend-${item.kind}`}
                aria-label={`${KEY_NAME[item.kind]}: ${item.label}`}
              >
                <ControlKey kind={item.kind} />
                <span className="legend-label ui-text">{item.label}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="minigame-ready ui-text" data-testid="minigame-ready">
          {INTRO_READY}
        </p>
      </div>
    </div>
  );
}

/**
 * Eigenes Ergebnis: Platz groß (bei Gleichstand ausdrücklich „Geteilter Platz“), Punkte mit
 * Einheit, Münzen aus `reward` (CHAOS-55); bei Abbruch ein klarer Hinweis statt Wertung.
 */
export function MinigameResult({
  minigame,
  compact = false,
}: {
  minigame: ControllerMinigameInfo;
  compact?: boolean;
}) {
  const view = describeResult(minigame);
  return (
    <div
      className="minigame-card minigame-result"
      data-testid="minigame-result"
      data-kind={view.kind}
      data-place={view.kind === 'placed' ? view.place : ''}
      data-tied={view.kind === 'placed' && view.tied ? 'true' : 'false'}
      data-compact={compact}
    >
      <p className="minigame-kicker ui-text">
        <Icon name="star" size={compact ? 20 : 24} />
        {minigame.title}
      </p>
      {view.kind === 'placed' ? (
        <>
          <div
            className="result-place"
            data-testid="result-place"
            data-place={view.place}
            data-tied={view.tied ? 'true' : 'false'}
          >
            {view.place === 1 && <Icon name="trophy" size={compact ? 36 : 52} />}
            <b className="ui-text">{view.headline}</b>
          </div>
          <p className="result-cheer ui-text">{view.cheer}</p>
          {view.score !== null && (
            <p className="result-score ui-text" data-testid="result-score">
              {view.score}
            </p>
          )}
          {view.reward !== null && (
            <p className="result-reward" data-testid="result-reward">
              <Icon name="coin" size={compact ? 22 : 28} />
              <b className="ui-text">{view.reward}</b>
            </p>
          )}
          {view.prizes.length > 0 && (
            <p
              className="result-reward result-prize"
              data-testid="result-prize"
              data-items={view.prizes.join(' ')}
            >
              {view.prizes.map((item, i) => (
                <Icon
                  key={`${item}-${String(i)}`}
                  name={ITEM_INFO[item].icon}
                  size={compact ? 22 : 28}
                />
              ))}
              <b className="ui-text">
                Trostpreis: {view.prizes.map((item) => ITEM_INFO[item].name).join(', ')}
              </b>
            </p>
          )}
          <p className="minigame-lead ui-text">{RESULTS_LEAD}</p>
        </>
      ) : (
        <>
          <div className="result-aborted" data-testid="result-aborted">
            <b className="ui-text">{view.headline}</b>
          </div>
          <p className="minigame-lead ui-text">{view.lead}</p>
        </>
      )}
      {!compact && <p className="minigame-look ui-text">{LOOK_AT_SCREEN}</p>}
    </div>
  );
}

/** Intro oder Ergebnis je nach Stage (`play` zeigt das Spiel-Layout, nicht diese Karte). */
export function MinigameCard({
  minigame,
  compact = false,
}: {
  minigame: ControllerMinigameInfo;
  compact?: boolean;
}) {
  if (minigame.stage === 'results') return <MinigameResult minigame={minigame} compact={compact} />;
  return <MinigameIntro minigame={minigame} compact={compact} />;
}

/** Kleiner Kopf im Spiel-Layout: Minispiel-Titel. */
export function MinigameHeader({ title, className }: { title: string; className?: string }) {
  return (
    <div className={`minigame-header ${className ?? ''}`} data-testid="minigame-header">
      <Icon name="star" size={18} />
      <span className="minigame-header-title ui-text">{title}</span>
    </div>
  );
}
