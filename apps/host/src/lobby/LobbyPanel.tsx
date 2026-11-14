import { MAX_PLAYERS, type LobbyMessage } from '@chaos-party/protocol';
import { useEffect, useState, type CSSProperties } from 'react';
import type { ConnectionStatus } from '../net/hostConnection.ts';
import type { HostPlayer } from '../players.ts';
import { QrCode } from './QrCode.tsx';

interface LobbyPanelProps {
  readonly lobby: LobbyMessage | null;
  readonly players: readonly HostPlayer[];
  readonly status: ConnectionStatus;
  readonly joinHintSeconds: number;
  readonly onStart: () => boolean;
}

/** Hostname eines Join-Links für die Adressauswahl (`[fd00::1]` bleibt geklammert). */
function hostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Lobby am PC (CHAOS-11): QR-Code + Join-Code + Link, Spielerliste, Start-Knopf,
 * Hinweis bei ausbleibenden Controllern (Annahmen B1/B2) und Umschalten auf eine
 * andere LAN-Adresse, falls der Server mehrere kennt (ADR-007).
 */
export function LobbyPanel({ lobby, players, status, joinHintSeconds, onStart }: LobbyPanelProps) {
  const urls = lobby?.joinUrl ? [lobby.joinUrl, ...(lobby.joinUrlAlternatives ?? [])] : [];
  const [chosenUrl, setChosenUrl] = useState<string | null>(null);
  const joinUrl = chosenUrl !== null && urls.includes(chosenUrl) ? chosenUrl : urls[0];

  const connectedCount = players.filter((p) => p.connected).length;
  const canStart = status === 'connected' && connectedCount > 0;
  const allReady = players.length > 0 && players.every((p) => p.ready || !p.connected);

  const [waitedLong, setWaitedLong] = useState(false);
  const waiting = status === 'connected' && players.length === 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setWaitedLong(true);
    }, joinHintSeconds * 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [waiting, joinHintSeconds]);
  const showJoinHelp = waiting && waitedLong;

  if (lobby === null) {
    return (
      <section className="lobby" aria-label="Lobby">
        <div className="lobby-card lobby-card--waiting">
          <h2>Verbinde mit dem Spiel-Server …</h2>
          <p>
            Läuft der Server? Im Projektordner <code>pnpm build &amp;&amp; pnpm start</code>{' '}
            ausführen und diese Seite unter <code>http://localhost:8787/host/</code> öffnen.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="lobby" aria-label="Lobby">
      <div className="lobby-card">
        <div className="lobby-join">
          <h2>Mitspielen!</h2>
          <p className="lobby-lead">Handy-Kamera auf den Code – gleiches WLAN wie dieser PC.</p>
          {joinUrl ? (
            <QrCode value={joinUrl} size={260} />
          ) : (
            <p className="lobby-warning">
              Der Server kennt keinen Join-Link – nur den Code nutzen.
            </p>
          )}
          <div className="join-code">
            <span>Join-Code</span>
            <strong data-testid="join-code">{lobby.joinCode}</strong>
          </div>
          {joinUrl && (
            <p className="join-url" data-testid="join-url">
              {joinUrl}
            </p>
          )}
          {urls.length > 1 && (
            <label className="join-address">
              Andere Adresse:{' '}
              <select
                data-testid="join-address"
                value={joinUrl}
                onChange={(event) => {
                  setChosenUrl(event.target.value);
                }}
              >
                {urls.map((url) => (
                  <option key={url} value={url}>
                    {hostLabel(url)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="lobby-side">
          <h2>
            Spieler{' '}
            <span className="lobby-count">
              {players.length}/{MAX_PLAYERS}
            </span>
          </h2>
          <ul className="lobby-players" aria-label="Beigetretene Spieler">
            {players.map((p) => (
              <li
                key={p.slot}
                className="lobby-player"
                data-testid={`lobby-player-${String(p.slot)}`}
                data-connected={p.connected}
                data-ready={p.ready}
                style={{ '--player-color': p.color } as CSSProperties}
              >
                <span className="player-dot" aria-hidden="true">
                  <span className="player-symbol">{p.symbol}</span>
                </span>
                <span className="lobby-player-label">{p.label}</span>
                <span className="lobby-player-state">
                  {!p.connected ? 'getrennt' : p.ready ? 'bereit ✓' : 'verbunden'}
                </span>
              </li>
            ))}
            {players.length === 0 && (
              <li className="lobby-empty">Noch niemand da – scannt den QR-Code!</li>
            )}
          </ul>

          <button
            type="button"
            className="start-button"
            data-testid="start-button"
            disabled={!canStart}
            onClick={() => {
              onStart();
            }}
          >
            Los geht’s!
          </button>
          <p className="start-hint">
            {!canStart
              ? 'Start, sobald mindestens ein Controller verbunden ist.'
              : allReady
                ? 'Alle bereit.'
                : 'Starten geht auch, bevor alle „bereit“ getippt haben.'}
          </p>

          {showJoinHelp && (
            <div className="join-help" role="note" data-testid="join-help">
              <strong>Noch kein Handy verbunden? Firewall/WLAN prüfen:</strong>
              <ul>
                <li>
                  Handy im selben WLAN wie der PC – kein Gäste-WLAN (Geräte sind dort oft
                  abgeschirmt).
                </li>
                <li>
                  PC-Firewall: Zugriff für Node.js im <em>privaten</em> Netzwerk erlauben (Port{' '}
                  {joinUrl ? new URL(joinUrl).port || '80' : '8787'}).
                </li>
                <li>
                  Seite lädt nicht? {urls.length > 1 ? '„Andere Adresse“ wählen oder ' : ''}
                  Server mit <code>PUBLIC_HOST=&lt;IP des PCs&gt;</code> starten.
                </li>
              </ul>
              <p>
                Ausführlich: <code>docs/network-setup.md</code>
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
