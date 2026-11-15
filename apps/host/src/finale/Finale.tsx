/**
 * Finale am PC (CHAOS-37): Trophäenzählung mit Spannungsaufbau, danach Siegerbildschirm mit
 * 3D-Podest (`podiumStage.ts`), Endstand, Bonus-Titeln und „Nochmal spielen“ (`rematch`).
 *
 * Der Ablauf ist eine reine Zeitfunktion (`finalePlan.ts`); diese Komponente lässt nur die Uhr
 * laufen, spielt Klänge und zeichnet. Tempo per URL (`?finale=normal|fast|skip|manual`), im
 * Testmodus standardmäßig `skip`. Testhaken: `window.__chaosFinale` (nur `?test=1`).
 */
import {
  CHARACTER_NAMES,
  PLAYER_SLOTS,
  type BoardView,
  type CharacterId,
  type RankingEntryInfo,
  type SlotNumber,
} from '@chaos-party/protocol';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { CoinIcon, TrophyIcon } from '../board/icons.tsx';
import type { FinaleSpeed } from '../config.ts';
import { attachPerf } from '../debug/perf.ts';
import { playerName, winnerText } from '../board/texts.ts';
import { soundEngine } from '../fx/audio.ts';
import { CharacterPortrait } from '../lobby/CharacterPortrait.tsx';
import { bonusAwards } from './awards.ts';
import {
  buildFinalePlan,
  finaleCues,
  finaleStateAt,
  winningCriterion,
  type FinaleCard,
  type FinaleState,
} from './finalePlan.ts';
import { createPodiumStage } from './podiumStage.ts';
import { CRITERION_BADGE, tiebreakText, winnerReason } from './texts.ts';
import type { ChaosFinaleTestHook } from './testHook.ts';
import './finale.css';

/** Faktor für `fast` (E2E und ungeduldige Spielrunden). */
export const FAST_FACTOR = 4;

interface FinaleProps {
  /** Stand in `game-results` mit `ranking`. */
  readonly view: BoardView;
  readonly ranking: readonly RankingEntryInfo[];
  readonly speed: FinaleSpeed;
  readonly test: boolean;
  /** „Nochmal spielen“ (sendet `rematch`); `null` = Knopf aus. */
  readonly onRematch: (() => void) | null;
}

function colorStyle(slot: SlotNumber): CSSProperties {
  return { '--player-color': PLAYER_SLOTS[slot].color } as CSSProperties;
}

function characterOf(view: BoardView, slot: SlotNumber) {
  return view.players.find((p) => p.slot === slot)?.character ?? 'robot';
}

export function Finale({ view, ranking, speed, test, onRematch }: FinaleProps) {
  const plan = useMemo(() => buildFinalePlan(ranking, view.endedEarly), [ranking, view.endedEarly]);
  const [elapsed, setElapsed] = useState(speed === 'skip' ? Number.POSITIVE_INFINITY : 0);
  const state = finaleStateAt(plan, ranking, elapsed);
  const previous = useRef<FinaleState | null>(null);
  const [podiumReady, setPodiumReady] = useState(false);
  const podiumRef = useRef<{ step: (frames: number) => void } | null>(null);

  // Uhr: läuft selbst (normal/fast), steht bei `manual` (nur Testhaken) und `skip`.
  useEffect(() => {
    if (speed === 'manual' || speed === 'skip' || state.done) return;
    const factor = speed === 'fast' ? FAST_FACTOR : 1;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const delta = (now - last) * factor;
      last = now;
      setElapsed((value) => value + delta);
    }, 50);
    return () => {
      clearInterval(timer);
    };
  }, [speed, state.done]);

  // Klänge bei jedem sichtbaren Schritt (im Testmodus ist der Ton ohnehin stumm).
  useEffect(() => {
    const cues = finaleCues(previous.current, state);
    previous.current = state;
    for (const cue of cues) soundEngine().play(cue);
  });

  // Testhaken.
  const latest = useRef({ state, podiumReady });
  useEffect(() => {
    latest.current = { state, podiumReady };
  });
  useEffect(() => {
    if (!test) return;
    const hook: ChaosFinaleTestHook = {
      get beat() {
        return latest.current.state.beat.kind;
      },
      get beatIndex() {
        return latest.current.state.beatIndex;
      },
      get done() {
        return latest.current.state.done;
      },
      get podiumReady() {
        return latest.current.podiumReady;
      },
      winnerAtMs: plan.winnerAtMs,
      advance: (ms: number) => {
        setElapsed((value) => value + ms);
      },
      seek: (ms: number) => {
        setElapsed(ms);
      },
      skip: () => {
        setElapsed(Number.POSITIVE_INFINITY);
      },
      stepPodium: (frames: number) => {
        podiumRef.current?.step(frames);
      },
    };
    window.__chaosFinale = hook;
    return () => {
      if (window.__chaosFinale === hook) delete window.__chaosFinale;
    };
  }, [test, plan]);

  return state.done ? (
    <WinnerScreen
      view={view}
      ranking={ranking}
      test={test}
      onRematch={onRematch}
      podiumRef={podiumRef}
      onPodiumReady={setPodiumReady}
    />
  ) : (
    <Tally
      view={view}
      state={state}
      onSkip={() => {
        setElapsed(Number.POSITIVE_INFINITY);
      }}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Trophäenzählung
// ---------------------------------------------------------------------------------------------

function Tally({
  view,
  state,
  onSkip,
}: {
  readonly view: BoardView;
  readonly state: FinaleState;
  readonly onSkip: () => void;
}) {
  const { beat } = state;
  let title = 'Die Trophäenzählung!';
  let lead = 'Wer hat die meisten Trophäen? Bei Gleichstand zählen die Münzen.';
  if (beat.kind === 'reveal') {
    lead =
      beat.place === 1
        ? 'Und auf Platz 1 …'
        : `Platz ${String(beat.place)}: ${playerName(view, beat.slot)}`;
  } else if (beat.kind === 'tiebreak') {
    ({ title, lead } = tiebreakText(beat.criterion));
  }
  return (
    <div
      className="finale finale--tally"
      data-testid="board-results"
      data-done="false"
      data-beat={beat.kind}
    >
      <header className="finale-head">
        <p className="finale-kicker">
          {view.endedEarly ? 'Partie vorzeitig beendet' : 'Spielende'}
        </p>
        <h2 className="finale-title" data-testid="finale-title">
          {title}
        </h2>
        <p className="finale-lead" data-testid="finale-lead">
          {lead}
        </p>
      </header>
      <ol className="finale-cards" aria-label="Trophäenzählung">
        {state.cards.map((card) => (
          <TallyCard key={card.slot} view={view} card={card} />
        ))}
      </ol>
      <button type="button" className="finale-skip" data-testid="finale-skip" onClick={onSkip}>
        Überspringen ›
      </button>
    </div>
  );
}

function TallyCard({ view, card }: { readonly view: BoardView; readonly card: FinaleCard }) {
  const character = characterOf(view, card.slot);
  const badge = CRITERION_BADGE[card.decidedBy];
  return (
    <li
      className="finale-card"
      data-testid={`finale-card-${String(card.slot)}`}
      data-revealed={card.revealed}
      data-active={card.active}
      data-place={card.placeShown ? card.place : ''}
      style={colorStyle(card.slot)}
    >
      <span className="finale-card-figure">
        <CharacterPortrait character={character} />
        <span className="player-dot" aria-hidden="true">
          <span className="player-symbol">{PLAYER_SLOTS[card.slot].symbol}</span>
        </span>
      </span>
      <span className="finale-card-name">{playerName(view, card.slot)}</span>
      <span className="finale-card-character">{CHARACTER_NAMES[character].name}</span>
      <span className="finale-card-stat finale-card-stat--trophies">
        <TrophyIcon size={40} />
        <span data-testid={`finale-trophies-${String(card.slot)}`}>
          {card.revealed ? card.trophies : '?'}
        </span>
      </span>
      <span className="finale-card-stat finale-card-stat--coins">
        <CoinIcon size={32} />
        <span data-testid={`finale-coins-${String(card.slot)}`}>
          {card.revealed ? card.coins : '?'}
        </span>
      </span>
      {card.placeShown && (
        <span className="finale-card-place" data-testid={`finale-place-${String(card.slot)}`}>
          {card.place}.{badge && <span className="finale-card-badge">{badge}</span>}
        </span>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Siegerbildschirm
// ---------------------------------------------------------------------------------------------

function WinnerScreen({
  view,
  ranking,
  test,
  onRematch,
  podiumRef,
  onPodiumReady,
}: {
  readonly view: BoardView;
  readonly ranking: readonly RankingEntryInfo[];
  readonly test: boolean;
  readonly onRematch: (() => void) | null;
  readonly podiumRef: RefObject<{ step: (frames: number) => void } | null>;
  readonly onPodiumReady: (ready: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const criterion = winningCriterion(ranking);
  const awards = bonusAwards(view.players).slice(0, 3);
  const rows = [...ranking].sort((a, b) => a.place - b.place || a.slot - b.slot);
  const [podiumState, setPodiumState] = useState<'loading' | 'ready' | 'error'>('loading');

  // Podest nur neu bauen, wenn sich Plätze, Namen oder Figuren ändern (nicht bei jedem Stand).
  const entriesKey = JSON.stringify(
    ranking.map((entry) => [
      entry.slot,
      entry.place,
      playerName(view, entry.slot),
      characterOf(view, entry.slot),
    ]),
  );
  const entries = useMemo(
    () =>
      (JSON.parse(entriesKey) as [SlotNumber, number, string, CharacterId][]).map(
        ([slot, place, name, character]) => ({ slot, place, name, character }),
      ),
    [entriesKey],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    canvas.setAttribute('aria-label', 'Siegerpodest');
    container.appendChild(canvas);
    const stage = createPodiumStage({ canvas, entries, testMode: test });
    podiumRef.current = stage;
    const stopPerf = attachPerf('podest', stage);
    let active = true;
    stage.ready.then(
      () => {
        if (!active) return;
        setPodiumState('ready');
        onPodiumReady(true);
      },
      () => {
        if (active) setPodiumState('error');
      },
    );
    return () => {
      active = false;
      stopPerf();
      stage.dispose();
      canvas.remove();
      podiumRef.current = null;
      onPodiumReady(false);
    };
  }, [entries, test, podiumRef, onPodiumReady]);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  return (
    <div
      className="finale finale--winner"
      data-testid="board-results"
      data-done="true"
      data-beat="winner"
      data-podium={podiumState}
    >
      <div className="finale-podium" ref={containerRef} />
      {view.endedEarly && (
        <p className="finale-early" data-testid="finale-ended-early">
          Vorzeitig beendet – es zählt der Stand von Runde {Math.max(1, view.round)}/{view.rounds}
        </p>
      )}
      <aside className="finale-panel" aria-label="Endstand">
        <p className="finale-kicker">Endstand</p>
        <h2 className="finale-winner" data-testid="board-winner">
          {winnerText(view) ?? 'Spielende'}
        </h2>
        {criterion && (
          <p className="finale-reason" data-testid="finale-reason">
            {winnerReason(criterion)}
          </p>
        )}
        <ol className="finale-ranking">
          {rows.map((entry) => {
            const badge = CRITERION_BADGE[entry.decidedBy];
            return (
              <li
                key={entry.slot}
                className="finale-rank"
                data-testid={`board-rank-${String(entry.slot)}`}
                data-place={entry.place}
                style={colorStyle(entry.slot)}
              >
                <span className="finale-rank-place">{entry.place}.</span>
                <span className="finale-rank-figure">
                  <CharacterPortrait character={characterOf(view, entry.slot)} />
                </span>
                <span className="finale-rank-who">
                  <span className="finale-rank-name">
                    <span className="finale-rank-symbol" aria-hidden="true">
                      {PLAYER_SLOTS[entry.slot].symbol}
                    </span>
                    {playerName(view, entry.slot)}
                  </span>
                  {badge && <span className="finale-rank-badge">{badge}</span>}
                </span>
                <span className="finale-rank-values">
                  <TrophyIcon size={24} />
                  {entry.trophies}
                  <CoinIcon size={22} />
                  {entry.coins}
                </span>
              </li>
            );
          })}
        </ol>
        {awards.length > 0 && (
          <ul className="finale-awards" aria-label="Bonus-Titel" data-testid="finale-awards">
            {awards.map((award) => (
              <li key={award.id} className="finale-award" data-award={award.id}>
                <b>{award.title}</b>
                <span>
                  {award.slots.map((slot) => playerName(view, slot)).join(' & ')} · {award.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          ref={buttonRef}
          type="button"
          className="start-button finale-rematch"
          data-testid="rematch-button"
          disabled={onRematch === null}
          onClick={() => {
            onRematch?.();
          }}
        >
          Nochmal spielen
        </button>
        <p className="finale-rematch-hint">Zurück in die Lobby – Figuren und Runden bleiben.</p>
      </aside>
    </div>
  );
}
