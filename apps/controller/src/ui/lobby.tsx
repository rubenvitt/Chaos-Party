/**
 * Lobby mit Charakterwahl (v4, CHAOS-36): Figurenkarten, Rundenzahl, „Bereit!“.
 * `CharacterFace` und `LobbyHead` teilen sich iPhone (`CharacterLobby`) und iPad-Zone
 * (`ZoneBoard`, dort absolut an den Rechtecken der Zonen-Geometrie).
 */
import { useState } from 'react';
import { PLAYER_SLOTS, type CharacterId, type SlotNumber } from '@chaos-party/protocol';
import { LOBBY_TITLE, type CharacterCard, type LobbyView } from '../lobby/view.ts';
import type { SlotIntent } from '../net/client.ts';
import { cardData, cardTag, ownerStyle } from './lobbyCard.ts';
import { Portrait } from './portrait.tsx';

/** Inhalt einer Figurenkarte: Porträt im Lichtfenster, Name, ggf. Hinweis. */
export function CharacterFace({ card }: { card: CharacterCard }) {
  const tag = cardTag(card);
  return (
    <>
      <span className="character-window">
        <Portrait character={card.id} className="character-portrait" />
        {card.ownerSlot !== null && (
          <span className="character-owner player-symbol" aria-hidden="true">
            {PLAYER_SLOTS[card.ownerSlot].symbol}
          </span>
        )}
        {card.state === 'mine' && (
          <span className="character-check" aria-hidden="true">
            ✓
          </span>
        )}
      </span>
      <span className="character-name ui-text">{card.name}</span>
      {tag !== null && <span className="character-tag ui-text">{tag}</span>}
    </>
  );
}

/** Titel und Rundenzahl über der Auswahl. */
export function LobbyHead({ view }: { view: LobbyView }) {
  return (
    <div className="lobby-head">
      <h2 className="lobby-title ui-text">{LOBBY_TITLE}</h2>
      <span className="lobby-rounds ui-text" data-testid="lobby-rounds" data-rounds={view.rounds}>
        {view.roundsLabel}
      </span>
    </div>
  );
}

/** Bestätigung „bereit“ (Server-Layout `wait`). */
export function ReadyBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div className="lobby-ready-done" data-testid="ready-done" data-compact={compact}>
      <span className="ready-check" aria-hidden="true">
        ✓
      </span>
      <span className="ui-text">Bereit!</span>
    </div>
  );
}

interface CharacterLobbyProps {
  slot: SlotNumber;
  view: LobbyView;
  /** Kennung des Kontexts: Ein neuer Kontext setzt „Bereit gesendet“ zurück. */
  contextKey: string;
  send: (intent: SlotIntent) => void;
}

/**
 * iPhone: Auswahl als 2×2-Raster großer Karten (hoch) bzw. links neben „Bereit!“ (quer).
 * Antippen einer freien Figur sendet `pick-character`; die Wahl leuchtet sofort (vorgemerkt)
 * und wird mit dem nächsten Kontext bestätigt oder – bei `character-taken` – zurückgenommen.
 */
export function CharacterLobby({ slot, view, contextKey, send }: CharacterLobbyProps) {
  const pick = (character: CharacterId) => {
    send({ type: 'pick-character', slot, character });
  };
  return (
    <div
      className="panel lobby-panel character-lobby"
      data-testid="lobby-panel"
      data-ready={view.ready ? 'true' : 'false'}
      data-character={view.character ?? ''}
    >
      <LobbyHead view={view} />
      <div className="character-grid" role="group" aria-label={LOBBY_TITLE}>
        {view.cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="character-card"
            {...cardData(card)}
            aria-pressed={card.state === 'mine'}
            aria-disabled={!card.selectable}
            style={ownerStyle(card)}
            onClick={() => {
              if (card.selectable) pick(card.id);
            }}
          >
            <CharacterFace card={card} />
          </button>
        ))}
      </div>
      <div className="lobby-foot">
        <p className="lobby-hint ui-text" data-testid="lobby-hint">
          {view.hint}
        </p>
        {view.ready ? (
          <ReadyBadge />
        ) : (
          view.canReady && (
            <ReadyAction
              key={contextKey}
              onReady={() => {
                send({ type: 'ready', slot });
              }}
            />
          )
        )}
      </div>
    </div>
  );
}

/** „Bereit!“-Knopf; nach dem Tippen bis zum nächsten Kontext ausgeblendet. */
function ReadyAction({ onReady }: { onReady: () => void }) {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <p className="lobby-sending ui-text" data-testid="ready-sending" role="status">
        Gesendet …
      </p>
    );
  }
  return (
    <button
      type="button"
      className="ready-button lobby-ready"
      data-testid="ready-button"
      onClick={() => {
        setSent(true);
        onReady();
      }}
    >
      <span className="ui-text">Bereit!</span>
    </button>
  );
}
