import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { HostPlayer } from '../players.ts';
import { diffPlayers, playerEventText, type PlayerEvent } from './playerEvents.ts';

/** So lange bleibt eine Meldung stehen. */
export const PLAYER_TOAST_MS = 4000;
/** Höchstens so viele Meldungen gleichzeitig (älteste fällt weg). */
const MAX_TOASTS = 4;

interface Toast {
  readonly id: number;
  readonly event: PlayerEvent;
}

interface PlayerToastsProps {
  readonly players: readonly HostPlayer[];
  /** Im lokalen Tastatur-Modus gibt es keine Verbindungen und damit keine Meldungen. */
  readonly enabled: boolean;
}

/**
 * Große, kurze Meldungen am PC (CHAOS-12): „Blau hat die Verbindung verloren“,
 * „Blau ist wieder da“, „Platz von Blau ist wieder frei“ – vom Sofa aus lesbar,
 * in Lobby und Spiel. Leitet die Ereignisse aus den Lobby-Schnappschüssen ab.
 */
export function PlayerToasts({ players, enabled }: PlayerToastsProps) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const previous = useRef<readonly HostPlayer[] | null>(null);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!enabled) return;
    const before = previous.current;
    previous.current = players;
    const events = diffPlayers(before, players);
    if (events.length === 0) return;
    const added = events.map((event) => ({ id: nextId.current++, event }));
    setToasts((current) => [...current, ...added].slice(-MAX_TOASTS));
    // Bewusst kein Aufräumen bei neuem Schnappschuss: Jede Meldung steht ihre volle Zeit.
    const ids = new Set(added.map((toast) => toast.id));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((current) => current.filter((toast) => !ids.has(toast.id)));
    }, PLAYER_TOAST_MS);
    timers.current.add(timer);
  }, [players, enabled]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <ul className="player-toasts" aria-live="polite" aria-label="Verbindungsmeldungen">
      {toasts.map(({ id, event }) => (
        <li
          key={id}
          className="player-toast"
          data-testid="player-toast"
          data-kind={event.kind}
          data-slot={event.slot}
          style={{ '--player-color': event.color } as CSSProperties}
        >
          <span className="player-dot" aria-hidden="true">
            <span className="player-symbol">{event.symbol}</span>
          </span>
          <span className="player-toast-icon" aria-hidden="true">
            {event.kind === 'back' ? '✓' : '⚠'}
          </span>
          {playerEventText(event)}
        </li>
      ))}
    </ul>
  );
}
