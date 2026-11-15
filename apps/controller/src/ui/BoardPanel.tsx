import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { PLAYER_SLOTS, type PlayerInfo, type SlotNumber } from '@chaos-party/protocol';
import type { ActivePrompt } from '../board/countdown.ts';
import {
  chooseIntent,
  describePrompt,
  isLocked,
  ownPrompt,
  type ChoiceView,
} from '../board/prompt.ts';
import { describeWaiting } from '../board/status.ts';
import type { SlotIntent } from '../net/client.ts';
import type { PendingChoice, SlotContext } from '../state/reducer.ts';
import { ChoiceFace, CountdownBar, ReactionBuzz, StatusBar, WaitingCard } from './board.tsx';
import { slotColorVars } from './color.ts';

export interface BoardPanelProps {
  slot: SlotNumber;
  /** Eigene Spieler aus `welcome` (für Namen). */
  players: readonly PlayerInfo[];
  context: SlotContext;
  pending: PendingChoice | undefined;
  send: (intent: SlotIntent) => void;
}

/**
 * Brettphase am iPhone (CHAOS-22): oben der eigene Stand, darunter entweder die eigene
 * Entscheidung (Knöpfe je Prompt-Art) oder, wer gerade dran ist. Alles folgt dem
 * Server-Kontext; der Controller entscheidet nur die Darstellung.
 */
export function BoardPanel({ slot, players, context, pending, send }: BoardPanelProps) {
  const prompt = ownPrompt(context, slot);
  const board = context.board;
  const kind = prompt ? describePrompt(prompt.info).kind : 'none';

  return (
    <div
      className="panel board-panel"
      data-testid="board-panel"
      data-prompt-kind={kind}
      data-game-phase={board?.gamePhase ?? 'none'}
    >
      {board && <StatusBar board={board} />}
      <div className="board-main">
        {prompt ? (
          <PromptPanel
            key={prompt.info.id}
            slot={slot}
            prompt={prompt}
            context={context}
            pending={pending}
            send={send}
          />
        ) : (
          <WaitingCard view={describeWaiting(board, slot, players)} />
        )}
      </div>
    </div>
  );
}

interface PromptPanelProps {
  slot: SlotNumber;
  prompt: ActivePrompt;
  context: SlotContext;
  pending: PendingChoice | undefined;
  send: (intent: SlotIntent) => void;
}

function PromptPanel({ slot, prompt, context, pending, send }: PromptPanelProps) {
  const view = describePrompt(prompt.info);
  const locked = isLocked(prompt, pending);
  const reaction = view.kind === 'reaction';

  function choose(option: string) {
    const intent = chooseIntent(slot, context, pending, option);
    if (intent) send(intent);
  }

  const button = (choice: ChoiceView, size: 'main' | 'extra') => {
    const style = slotColorVars(choice.slot === null ? null : PLAYER_SLOTS[choice.slot].color) as
      CSSProperties | undefined;
    return (
      <button
        key={choice.id}
        type="button"
        className={`choice-button choice-${size} tone-${choice.tone}`}
        data-testid={`choice-${choice.id}`}
        data-option={choice.id}
        data-chosen={pending?.option === choice.id && locked ? 'true' : 'false'}
        disabled={locked}
        style={style}
        // Reaktion zählt ab dem Aufsetzen des Fingers (schneller als `click`).
        onPointerDown={
          reaction
            ? (event: ReactPointerEvent<HTMLButtonElement>) => {
                event.preventDefault();
                choose(choice.id);
              }
            : undefined
        }
        onClick={() => {
          choose(choice.id);
        }}
      >
        <ChoiceFace choice={choice} />
      </button>
    );
  };

  return (
    <div
      className="prompt-panel"
      data-testid="prompt"
      data-kind={view.kind}
      data-prompt-id={prompt.info.id}
      data-locked={locked ? 'true' : 'false'}
    >
      {reaction && <ReactionBuzz promptId={prompt.info.id} />}
      <h2 className="prompt-title ui-text" data-testid="prompt-title">
        {prompt.info.title}
      </h2>
      <CountdownBar prompt={prompt} big={reaction} />
      <div className="choice-main" data-count={view.main.length}>
        {view.main.map((choice) => button(choice, 'main'))}
      </div>
      {view.extra.length > 0 && (
        <div className="choice-extra" data-count={view.extra.length}>
          {view.extra.map((choice) => button(choice, 'extra'))}
        </div>
      )}
      {locked && (
        <p className="choice-sent ui-text" data-testid="choice-sent" role="status">
          Gesendet … warte kurz
        </p>
      )}
    </div>
  );
}
