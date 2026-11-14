import type { CSSProperties } from 'react';
import { KEY_BINDINGS } from './input/keyboardInputSource.ts';
import type { ConnectionStatus } from './net/hostConnection.ts';
import type { HostPlayer } from './players.ts';

export type PhysicsStatus = 'loading' | 'ready' | 'error';

interface HudProps {
  readonly players: readonly HostPlayer[];
  readonly physics: PhysicsStatus;
  readonly showKeyHints: boolean;
  /** Spieler-Chips unten zeigen (lokal immer, mit Server nur im Spiel). */
  readonly showPlayers: boolean;
  /** Verbindungsstatus zum Server; `null` im lokalen Modus. */
  readonly connection: ConnectionStatus | null;
}

const KEY_LABELS: Record<string, string> = {
  KeyW: 'W',
  KeyA: 'A',
  KeyS: 'S',
  KeyD: 'D',
  KeyI: 'I',
  KeyJ: 'J',
  KeyK: 'K',
  KeyL: 'L',
  KeyO: 'O',
  Space: 'Leertaste',
  Enter: 'Enter',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Numpad8: 'Num 8',
  Numpad4: 'Num 4',
  Numpad5: 'Num 5',
  Numpad6: 'Num 6',
  Numpad0: 'Num 0',
};

const CONNECTION_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Server: verbinde …',
  connected: 'Server: verbunden',
  disconnected: 'Server: getrennt – verbinde neu …',
  'host-taken': 'Anderes Spielfenster ist schon verbunden – warte …',
};

function keyHint(player: HostPlayer): string {
  const b = KEY_BINDINGS[player.slot];
  const label = (code: string) => KEY_LABELS[code] ?? code;
  const keys = [b.up, b.left, b.down, b.right].map(label);
  const move = keys.every((k) => k.length === 1) ? keys.join('') : keys.join(' ');
  return `${move} · Schubser ${label(b.dash)}`;
}

/** DOM-Overlay über dem Canvas. Liest nur Zustand, steuert die Szene nicht (C5). */
export function Hud({ players, physics, showKeyHints, showPlayers, connection }: HudProps) {
  return (
    <div className="hud">
      <header className="hud-top">
        <div className="hud-title">
          <h1>Chaos Party</h1>
          <p>Schubs-Arena</p>
        </div>
        {connection !== null && (
          <div className="hud-connection" data-testid="connection" data-status={connection}>
            <span className="hud-connection-dot" aria-hidden="true" />
            {CONNECTION_TEXT[connection]}
          </div>
        )}
      </header>

      {physics !== 'ready' && (
        <div className="hud-status" role="status">
          {physics === 'loading' ? 'Physik lädt …' : 'Physik konnte nicht geladen werden.'}
        </div>
      )}

      {showPlayers && (
        <ul className="hud-players" aria-label="Spieler">
          {players.map((p) => (
            <li
              key={p.slot}
              className="player-chip"
              data-testid={`player-chip-${String(p.slot)}`}
              data-connected={p.connected}
              style={{ '--player-color': p.color } as CSSProperties}
            >
              <span className="player-dot" aria-hidden="true">
                <span className="player-symbol">{p.symbol}</span>
              </span>
              <span className="player-label">{p.label}</span>
              <span className="player-state">
                {!p.connected && (
                  <span className="player-warn" aria-hidden="true">
                    ⚠{' '}
                  </span>
                )}
                {p.connected ? 'verbunden' : 'getrennt'}
              </span>
              {showKeyHints && <span className="player-keys">{keyHint(p)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
