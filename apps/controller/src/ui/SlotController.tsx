import { useMemo, useState, type CSSProperties } from 'react';
import { PLAYER_SLOTS, type PlayerInfo } from '@chaos-party/protocol';
import { createMoveSender } from '../input/moveSender.ts';
import type { SlotIntent } from '../net/client.ts';
import type { FeedbackPulse, SlotContext } from '../state/reducer.ts';
import { ActionButton } from './ActionButton.tsx';
import { INK, readableTextColor } from './color.ts';
import { Joystick } from './Joystick.tsx';

export interface SlotControllerProps {
  player: PlayerInfo;
  /** `undefined`, solange der Server noch keinen Kontext geschickt hat. */
  context: SlotContext | undefined;
  feedback: FeedbackPulse | undefined;
  /** Sendet eine Eingabe für **diesen** Slot (Slot setzt die Komponente selbst). */
  send: (intent: SlotIntent) => void;
}

/**
 * Bedienfläche eines Spielerplatzes. Der iPhone-Modus zeigt genau eine; der
 * iPad-Modus (CHAOS-13) kann mehrere in Zonen anordnen. Alles, was angezeigt
 * wird, folgt dem Server-Kontext (`layout`, `actions`).
 */
export function SlotController({ player, context, feedback, send }: SlotControllerProps) {
  const style = PLAYER_SLOTS[player.slot];
  const cssVars = {
    '--player': player.color,
    '--on-player': readableTextColor(player.color),
    '--ink': INK,
  } as CSSProperties;
  const layout = context?.layout ?? 'wait';

  return (
    <section
      className={`slot layout-${layout}`}
      style={cssVars}
      data-testid={`slot-${player.slot}`}
      data-layout={layout}
      data-phase={context?.phase ?? 'none'}
    >
      <header className="player-badge" data-testid="player-badge">
        <span className="player-symbol" aria-hidden="true">
          {style.symbol}
        </span>
        <span className="player-label ui-text">{player.label}</span>
      </header>

      {layout === 'lobby' && context && (
        <LobbyPanel key={contextKey(context)} context={context} send={send} slot={player.slot} />
      )}
      {layout === 'wait' && <WaitPanel />}
      {layout === 'joystick-buttons' && context && (
        <PlayPanel context={context} send={send} slot={player.slot} />
      )}

      {feedback && (
        <span
          key={feedback.id}
          className={`feedback feedback-${feedback.kind}`}
          data-testid="feedback"
        />
      )}
    </section>
  );
}

function contextKey(context: SlotContext): string {
  return `${context.phase}:${context.layout}:${context.actions.join(',')}`;
}

interface PanelProps {
  context: SlotContext;
  slot: PlayerInfo['slot'];
  send: (intent: SlotIntent) => void;
}

function LobbyPanel({ context, slot, send }: PanelProps) {
  const [sent, setSent] = useState(false);
  const canReady = context.actions.includes('ready') && !sent;

  return (
    <div className="panel lobby-panel">
      {canReady ? (
        <>
          <p className="panel-lead ui-text">Bist du startklar?</p>
          <button
            type="button"
            className="ready-button"
            data-testid="ready-button"
            onClick={() => {
              setSent(true);
              send({ type: 'ready', slot });
            }}
          >
            <span className="ui-text">Bereit!</span>
          </button>
        </>
      ) : (
        <div className="ready-done" data-testid="ready-done">
          <span className="ready-check" aria-hidden="true">
            ✓
          </span>
          <p className="panel-lead ui-text">Du bist dabei! Gleich geht&apos;s los …</p>
        </div>
      )}
    </div>
  );
}

function WaitPanel() {
  return (
    <div className="panel wait-panel" data-testid="wait-panel">
      <span className="wait-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <p className="panel-lead ui-text">Schau auf den großen Bildschirm!</p>
    </div>
  );
}

function PlayPanel({ context, slot, send }: PanelProps) {
  const mover = useMemo(
    () =>
      createMoveSender((stick) => {
        send({ type: 'move', slot, x: stick.x, y: stick.y });
      }),
    [send, slot],
  );
  const canMove = context.actions.includes('move');
  const buttons = (['a', 'b'] as const).filter((button) =>
    context.actions.includes(button === 'a' ? 'button-a' : 'button-b'),
  );

  return (
    <div className="panel play-panel" data-testid="play-panel">
      <div className="stick-area">{canMove && <Joystick onChange={mover.update} />}</div>
      <div className="button-area" data-count={buttons.length}>
        {buttons.map((button) => (
          <ActionButton
            key={button}
            button={button}
            onPress={() => {
              send({ type: 'press', slot, button });
            }}
            onRelease={() => {
              send({ type: 'release', slot, button });
            }}
          />
        ))}
      </div>
    </div>
  );
}
