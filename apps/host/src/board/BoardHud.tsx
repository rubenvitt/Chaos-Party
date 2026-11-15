/**
 * React-HUD der Brettphase (CHAOS-20): Spielerleiste, Runde, „Blau ist dran!“, Status zur
 * offenen Entscheidung mit Countdown, Ereignis-Ticker, Minispiel-Platzhalter, Endstand.
 * Liest nur den `HudSnapshot` der Regie; steuert nichts. Große Schrift für den Sofa-Abstand.
 */
import {
  PLAYER_SLOTS,
  type BoardPlayer,
  type BoardView,
  type SlotNumber,
} from '@chaos-party/protocol';
import type { CSSProperties } from 'react';
import type { ConnectionStatus } from '../net/hostConnection.ts';
import type { HudMessage, HudSnapshot, MinigameSummary } from './director.ts';
import { CoinIcon, ItemIcon, TrophyIcon } from './icons.tsx';
import {
  bannerText,
  countdownText,
  ITEM_NAMES,
  playerName,
  promptDetail,
  promptStatus,
  roundText,
  winnerText,
} from './texts.ts';

const CONNECTION_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Server: verbinde …',
  connected: 'Server: verbunden',
  disconnected: 'Server: getrennt – verbinde neu …',
  'host-taken': 'Anderes Spielfenster ist schon verbunden – warte …',
};

interface BoardHudProps {
  readonly hud: HudSnapshot;
  /** Name des Bretts („Wackelwald“). */
  readonly boardName: string;
  /** Verbindungsstatus zum Server; `null` im lokalen Modus. */
  readonly connection: ConnectionStatus | null;
}

function colorStyle(slot: SlotNumber): CSSProperties {
  return { '--player-color': PLAYER_SLOTS[slot].color } as CSSProperties;
}

function PlayerDot({ slot }: { readonly slot: SlotNumber }) {
  return (
    <span className="player-dot" aria-hidden="true" style={colorStyle(slot)}>
      <span className="player-symbol">{PLAYER_SLOTS[slot].symbol}</span>
    </span>
  );
}

function PlayerCard({
  player,
  active,
}: {
  readonly player: BoardPlayer;
  readonly active: boolean;
}) {
  return (
    <li
      className="board-player"
      data-testid={`board-player-${player.slot}`}
      data-active={active}
      data-connected={player.connected}
      style={colorStyle(player.slot)}
    >
      {active && <span className="board-player-turn">am Zug</span>}
      <div className="board-player-head">
        <PlayerDot slot={player.slot} />
        <span className="board-player-name">{player.name}</span>
      </div>
      <div className="board-player-stats">
        <span className="board-stat board-stat--trophies" title="Trophäen">
          <TrophyIcon size={26} />
          <span data-testid={`board-trophies-${player.slot}`}>{player.trophies}</span>
        </span>
        <span className="board-stat board-stat--coins" title="Münzen">
          <CoinIcon size={26} />
          <span data-testid={`board-coins-${player.slot}`}>{player.coins}</span>
        </span>
      </div>
      <ul className="board-items" aria-label="Items" data-testid={`board-items-${player.slot}`}>
        {player.items.map((item, i) => (
          <li key={`${item}-${i}`} className="board-item" data-item={item} title={ITEM_NAMES[item]}>
            <ItemIcon item={item} size={22} />
            <span className="board-item-name">{ITEM_NAMES[item]}</span>
          </li>
        ))}
        {player.items.length === 0 && <li className="board-item board-item--empty">keine Items</li>}
      </ul>
      {!player.connected && <span className="board-player-warn">⚠ getrennt</span>}
    </li>
  );
}

function Messages({ messages }: { readonly messages: readonly HudMessage[] }) {
  return (
    <ol className="board-messages" data-testid="board-messages" aria-live="polite">
      {messages.map((m) => (
        <li
          key={m.id}
          className="board-message"
          data-tone={m.tone}
          style={m.slot === null ? undefined : colorStyle(m.slot)}
        >
          {m.slot !== null && <PlayerDot slot={m.slot} />}
          <span>{m.text}</span>
        </li>
      ))}
    </ol>
  );
}

function StatusLine({
  view,
  seconds,
}: {
  readonly view: BoardView;
  readonly seconds: number | null;
}) {
  const status = promptStatus(view);
  if (!status || !view.prompt) return null;
  const detail = promptDetail(view);
  const showCountdown = view.prompt.kind === 'reaction' && seconds !== null;
  return (
    <div
      className="board-status"
      data-testid="board-status"
      data-kind={view.prompt.kind}
      style={colorStyle(view.prompt.slot)}
    >
      <PlayerDot slot={view.prompt.slot} />
      <span className="board-status-text">{status}</span>
      {detail && <span className="board-status-detail">{detail}</span>}
      {showCountdown && (
        <span className="board-countdown" data-testid="board-countdown" data-seconds={seconds}>
          {countdownText(seconds)}
        </span>
      )}
    </div>
  );
}

function MinigameOverlay({
  view,
  minigame,
  seconds,
}: {
  readonly view: BoardView;
  readonly minigame: MinigameSummary | null;
  readonly seconds: number | null;
}) {
  if (view.gamePhase === 'minigame-intro' || view.gamePhase === 'minigame-play') {
    return (
      <div className="board-overlay" data-testid="board-minigame" data-phase={view.gamePhase}>
        <div className="board-overlay-card">
          <p className="board-overlay-kicker">Minispiel</p>
          <h2>Minispiel – kommt in M3</h2>
          <p className="board-overlay-lead">
            Platzhalter: Die Plätze werden diesmal ausgelost. Echte Minispiele folgen.
          </p>
          {seconds !== null && <p className="board-overlay-timer">noch {seconds} s</p>}
        </div>
      </div>
    );
  }
  if (view.gamePhase !== 'minigame-results') return null;
  const ranking = minigame?.ranking ?? [];
  return (
    <div className="board-overlay" data-testid="board-minigame" data-phase={view.gamePhase}>
      <div className="board-overlay-card">
        <p className="board-overlay-kicker">Minispiel</p>
        <h2>Ergebnis</h2>
        <ol className="board-ranking">
          {ranking.map((slot, i) => (
            <li key={slot} className="board-ranking-row" style={colorStyle(slot)}>
              <span className="board-ranking-place">{i + 1}.</span>
              <PlayerDot slot={slot} />
              <span className="board-ranking-name">{playerName(view, slot)}</span>
              {minigame?.rewards[slot] !== undefined && (
                <span className="board-ranking-value">+{minigame.rewards[slot]} Münzen</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ResultsOverlay({ view }: { readonly view: BoardView }) {
  if (view.gamePhase !== 'game-results' || !view.ranking) return null;
  return (
    <div className="board-overlay board-overlay--final" data-testid="board-results">
      <div className="board-overlay-card">
        <p className="board-overlay-kicker">Spielende</p>
        <h2 data-testid="board-winner">{winnerText(view) ?? 'Spielende'}</h2>
        <ol className="board-ranking">
          {view.ranking.map((r) => (
            <li
              key={r.slot}
              className="board-ranking-row"
              data-place={r.place}
              data-testid={`board-rank-${r.slot}`}
              style={colorStyle(r.slot)}
            >
              <span className="board-ranking-place">{r.place}.</span>
              <PlayerDot slot={r.slot} />
              <span className="board-ranking-name">{playerName(view, r.slot)}</span>
              <span className="board-ranking-value">
                <TrophyIcon size={24} /> {r.trophies}
                <CoinIcon size={24} /> {r.coins}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** DOM-Overlay über dem Brett. `pointer-events: none` wie der Arena-HUD (C5). */
export function BoardHud({ hud, boardName, connection }: BoardHudProps) {
  const { view } = hud;
  const banner = bannerText(view);
  const players = view ? [...view.players].sort((a, b) => a.slot - b.slot) : [];
  return (
    <div
      className="hud board-hud"
      data-testid="board-hud"
      data-game-phase={view?.gamePhase ?? 'none'}
    >
      <header className="hud-top">
        <div className="hud-title">
          <h1>Chaos Party</h1>
          <p>
            {boardName} · <span data-testid="board-round">{roundText(view)}</span>
          </p>
        </div>
        {connection !== null && (
          <div className="hud-connection" data-testid="connection" data-status={connection}>
            <span className="hud-connection-dot" aria-hidden="true" />
            {CONNECTION_TEXT[connection]}
          </div>
        )}
      </header>

      <div className="board-center">
        {banner && view?.activeSlot != null && (
          <div
            className="board-banner"
            data-testid="board-banner"
            style={colorStyle(view.activeSlot)}
          >
            {banner}
          </div>
        )}
        {view && <StatusLine view={view} seconds={hud.promptSeconds} />}
        {!view && <div className="hud-status">Warte auf das Spielbrett …</div>}
      </div>

      <Messages messages={hud.messages} />

      <ul className="board-players" aria-label="Spieler">
        {players.map((p) => (
          <PlayerCard key={p.slot} player={p} active={view?.activeSlot === p.slot} />
        ))}
      </ul>

      {view && <MinigameOverlay view={view} minigame={hud.minigame} seconds={hud.phaseSeconds} />}
      {view && <ResultsOverlay view={view} />}
    </div>
  );
}
