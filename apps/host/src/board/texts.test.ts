import type { BoardEvent, BoardView } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { DEMO_VIEW } from './demo.ts';
import {
  bannerText,
  countdownText,
  eventNotice,
  eventText,
  playerName,
  promptDetail,
  promptStatus,
  roundText,
  signedAmount,
  tailwindAmount,
  tailwindRows,
  winnerText,
} from './texts.ts';
import { minigameView } from '../minigame/testViews.ts';

const text = (event: BoardEvent, view: BoardView | null = DEMO_VIEW) =>
  eventText(event, view, (id) => (id === 's30' ? 'Pilzpfad' : undefined))?.text ?? null;

function withPrompt(
  kind: NonNullable<BoardView['prompt']>['kind'],
  slot: 1 | 2 | 3 | 4,
): BoardView {
  return {
    ...DEMO_VIEW,
    prompt: {
      id: 1,
      slot,
      kind,
      title: 'Frage',
      options: [{ id: 'x', label: 'X' }],
      remainingMs: null,
    },
  };
}

describe('eventNotice (CHAOS-120)', () => {
  it('kündigt wachsende Sabotage mit den neuen Werten an', () => {
    expect(
      eventNotice({ type: 'round-started', round: 6, sabotage: { steal: 6, trap: 5 } }),
    ).toEqual({
      title: 'Sabotage wird stärker!',
      detail: 'Klau: 6 Münzen · Falle: 5 Münzen',
    });
  });

  it('sonst keine Einblendung', () => {
    expect(eventNotice({ type: 'round-started', round: 7 })).toBeNull();
    expect(eventNotice({ type: 'turn-started', slot: 1, round: 6 })).toBeNull();
  });
});

describe('eventText', () => {
  it('meldet Münzklau und Falle wie im Konzept', () => {
    expect(text({ type: 'coins-stolen', from: 1, to: 3, amount: 6 })).toBe(
      'Grün klaut Blau 6 Münzen!',
    );
    expect(text({ type: 'trap-triggered', slot: 2, owner: 4, spaceId: 's15', amount: 5 })).toBe(
      'Falle! Orange zahlt 5 Münzen an Rosa',
    );
    expect(text({ type: 'coins-stolen', from: 4, to: 2, amount: 0 })).toBe(
      'Orange will klauen – Rosa hat nichts!',
    );
  });

  it('meldet Würfel, Münzen (Einzahl/Mehrzahl) und Wege', () => {
    expect(text({ type: 'dice-rolled', slot: 2, faces: [4], total: 4 })).toBe('Orange würfelt 4!');
    expect(text({ type: 'dice-rolled', slot: 2, faces: [4, 6], total: 10 })).toBe(
      'Orange würfelt 4 + 6 = 10!',
    );
    expect(text({ type: 'coins-changed', slot: 1, delta: 1, balance: 13, reason: 'space' })).toBe(
      'Blau bekommt 1 Münze',
    );
    expect(text({ type: 'coins-changed', slot: 1, delta: -3, balance: 9, reason: 'event' })).toBe(
      'Blau verliert 3 Münzen',
    );
    expect(
      text({ type: 'coins-changed', slot: 3, delta: 10, balance: 28, reason: 'minigame' }),
    ).toBe('Grün gewinnt 10 Münzen im Minispiel');
    expect(text({ type: 'coins-changed', slot: 2, delta: 4, balance: 9, reason: 'tailwind' })).toBe(
      'Rückenwind: Orange +4 Münzen',
    );
    expect(text({ type: 'path-chosen', slot: 4, spaceId: 's30' })).toBe('Rosa nimmt: Pilzpfad');
    expect(text({ type: 'path-chosen', slot: 4, spaceId: 's35' })).toBe('Rosa wählt einen Weg');
  });

  it('meldet Items, Trophäe, Ereignisse, Reaktionen und Rundenwechsel', () => {
    expect(text({ type: 'item-gained', slot: 3, item: 'shield' })).toBe(
      'Grün findet ein Item: Schild',
    );
    expect(text({ type: 'item-used', slot: 2, item: 'coin-steal', target: 1 })).toBe(
      'Orange will Blau Münzen klauen!',
    );
    expect(text({ type: 'item-used', slot: 2, item: 'double-dice' })).toBe(
      'Orange nimmt den Doppelwürfel!',
    );
    expect(text({ type: 'trap-placed', slot: 2, spaceId: 's15' })).toBe(
      'Orange versteckt eine Falle',
    );
    expect(text({ type: 'trophy-bought', slot: 1, spaceId: 's24' })).toBe(
      'Blau kauft eine Trophäe!',
    );
    expect(text({ type: 'trophy-moved', from: 's24', to: 's12' })).toBe(
      'Die Trophäe wandert weiter!',
    );
    expect(text({ type: 'board-event', slot: 4, event: 'coin-rain' })).toBe(
      'Ereignis für Rosa: Münzregen!',
    );
    expect(text({ type: 'reaction-resolved', slot: 1, result: 'shield' })).toBe(
      'Blau wehrt mit dem Schild ab!',
    );
    expect(text({ type: 'reaction-resolved', slot: 1, result: 'brace' })).toContain(
      'hält sich fest',
    );
    expect(
      text({ type: 'player-auto', slot: 4, option: 'roll', reason: 'disconnected' }),
    ).toContain('Rosa ist getrennt');
    expect(text({ type: 'round-started', round: 3 })).toBe('Runde 3 beginnt!');
    expect(
      text({
        type: 'minigame-results',
        ranking: [4, 1],
        placements: [
          { slot: 4, place: 1, score: 0 },
          { slot: 1, place: 2, score: 0 },
        ],
        aborted: false,
      }),
    ).toBe('Minispiel: Rosa gewinnt!');
  });

  it('schweigt bei Ereignissen, die Banner, Status oder andere Meldungen schon zeigen', () => {
    expect(text({ type: 'moved', slot: 1, path: ['s08'] })).toBeNull();
    expect(text({ type: 'turn-started', slot: 1, round: 2 })).toBeNull();
    expect(text({ type: 'item-used', slot: 2, item: 'trap' })).toBeNull();
    expect(
      text({ type: 'coins-changed', slot: 1, delta: -6, balance: 6, reason: 'steal' }),
    ).toBeNull();
    expect(
      text({ type: 'coins-changed', slot: 1, delta: 0, balance: 0, reason: 'space' }),
    ).toBeNull();
    expect(
      text({
        type: 'reaction-opened',
        promptId: 3,
        slot: 1,
        attacker: 2,
        item: 'coin-steal',
        deadline: 0,
      }),
    ).toBeNull();
  });

  it('nutzt Spielernamen aus dem Stand, sonst den Farbnamen', () => {
    const named = {
      ...DEMO_VIEW,
      players: DEMO_VIEW.players.map((p) => (p.slot === 2 ? { ...p, name: 'Mia' } : p)),
    };
    expect(text({ type: 'trophy-bought', slot: 2, spaceId: 's24' }, named)).toBe(
      'Mia kauft eine Trophäe!',
    );
    expect(text({ type: 'trophy-bought', slot: 2, spaceId: 's24' }, null)).toBe(
      'Orange kauft eine Trophäe!',
    );
    expect(playerName(null, 4)).toBe('Rosa');
  });

  it('färbt Meldungen nach Spieler und Ton', () => {
    expect(eventText({ type: 'coins-stolen', from: 1, to: 3, amount: 6 }, DEMO_VIEW)).toEqual({
      text: 'Grün klaut Blau 6 Münzen!',
      slot: 3,
      tone: 'bad',
    });
  });
});

describe('Status, Banner, Countdown', () => {
  it('beschreibt den offenen Prompt', () => {
    expect(promptStatus(withPrompt('path', 1))).toBe('Blau wählt einen Weg …');
    expect(promptStatus(withPrompt('trophy', 2))).toBe('Orange überlegt: Trophäe kaufen?');
    expect(promptDetail(withPrompt('trophy', 2))).toBe('Preis: 20 Münzen');
    expect(promptDetail(withPrompt('path', 2))).toBeNull();
    expect(promptStatus(withPrompt('reaction', 4))).toBe('Rosa kann reagieren!');
    expect(promptStatus(withPrompt('roll', 3))).toBe('Grün darf würfeln …');
    expect(promptStatus(withPrompt('target', 3))).toBe('Grün wählt ein Ziel …');
    expect(promptStatus({ ...DEMO_VIEW, prompt: null })).toBeNull();
    expect(promptStatus(null)).toBeNull();
  });

  it('zeigt das Banner nur zu Zugbeginn', () => {
    expect(bannerText({ ...DEMO_VIEW, gamePhase: 'turn-start' })).toBe('Blau ist dran!');
    expect(bannerText(DEMO_VIEW)).toBeNull();
    expect(bannerText({ ...DEMO_VIEW, gamePhase: 'turn-start', activeSlot: null })).toBeNull();
  });

  it('formatiert Countdown, Runde und Beträge', () => {
    expect(countdownText(3)).toBe('3 … 2 … 1');
    expect(countdownText(1)).toBe('1');
    expect(countdownText(0)).toBe('0');
    expect(roundText(DEMO_VIEW)).toBe('Runde 2/5');
    expect(roundText({ ...DEMO_VIEW, round: 0 })).toBe('Runde –/5');
    expect(roundText(null)).toBe('Runde –');
    expect(signedAmount(3)).toBe('+3');
    expect(signedAmount(-5)).toBe('−5');
    expect(signedAmount(0)).toBe('±0');
  });

  it('nennt Sieger und Gleichstand', () => {
    const ranking = (places: number[]) =>
      ({
        ...DEMO_VIEW,
        gamePhase: 'game-results',
        ranking: places.map((place, i) => ({
          slot: (i + 1) as 1 | 2 | 3 | 4,
          place,
          trophies: 1,
          coins: 3,
          minigameWins: 0,
          decidedBy: 'shared' as const,
        })),
      }) satisfies BoardView;
    expect(winnerText(ranking([1, 2, 3, 4]))).toBe('Blau gewinnt!');
    expect(winnerText(ranking([1, 1, 3, 4]))).toBe('Blau und Orange gewinnen!');
    expect(winnerText(ranking([1, 1, 1, 4]))).toBe('Blau, Orange und Grün gewinnen!');
    expect(winnerText(DEMO_VIEW)).toBeNull();
  });
});

describe('Rückenwind-Ansage (CHAOS-125)', () => {
  const tailwind = [
    { slot: 2 as const, coins: 2 },
    { slot: 3 as const, coins: 6 },
    { slot: 4 as const, coins: 2 },
  ];

  it('nur im Rundenende mit Rückenwind; die meisten Münzen zuerst, Namen aus dem Stand', () => {
    expect(tailwindRows(minigameView('round-end', { tailwind }))).toEqual([
      { slot: 3, name: 'Grün', coins: 6 },
      { slot: 2, name: 'Orange', coins: 2 },
      { slot: 4, name: 'Rosa', coins: 2 },
    ]);
    expect(tailwindRows(minigameView('minigame-results', { tailwind }))).toBeNull();
    expect(tailwindRows(minigameView('round-end'))).toBeNull();
    expect(tailwindRows(null)).toBeNull();
  });

  it('Betrag mit Einzahl und Mehrzahl', () => {
    expect(tailwindAmount(1)).toBe('+1 Münze');
    expect(tailwindAmount(4)).toBe('+4 Münzen');
  });
});
