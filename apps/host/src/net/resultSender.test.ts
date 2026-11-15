import { describe, expect, it } from 'vitest';
import { minigameView } from '../minigame/testViews.ts';
import type { MinigameResultPayload } from './hostConnection.ts';
import { createResultSender, MAX_RESULT_ATTEMPTS } from './resultSender.ts';

const RESULT: MinigameResultPayload = {
  minigameId: 'pump-parade',
  round: 2,
  placements: [
    { slot: 1, place: 1, score: 5 },
    { slot: 2, place: 2, score: 2 },
    { slot: 3, place: 3, score: 1 },
    { slot: 4, place: 4, score: 0 },
  ],
};

const PLAY = minigameView('minigame-play');
const RESULTS = minigameView('minigame-results', { placements: RESULT.placements });

function setup(connected = true) {
  const sent: MinigameResultPayload[] = [];
  const warnings: string[] = [];
  const link = { connected };
  const sender = createResultSender({
    send: (result) => {
      if (!link.connected) return false;
      sent.push(result);
      return true;
    },
    warn: (message) => warnings.push(message),
  });
  return { sender, sent, warnings, link };
}

describe('createResultSender', () => {
  it('sendet genau einmal je Minispiel und gilt mit der Ergebnisanzeige als angenommen', () => {
    const t = setup();
    t.sender.onView(PLAY);
    expect(t.sender.state).toBe('idle');
    t.sender.submit(RESULT);
    expect(t.sent).toEqual([RESULT]);
    expect(t.sender.state).toBe('sent');
    // Zweites Ergebnis desselben Minispiels (z. B. doppelter Rückruf) und weitere Stände
    // mit `minigame-play` lösen nichts aus.
    t.sender.submit({ ...RESULT, placements: [...RESULT.placements].reverse() });
    t.sender.onView(PLAY);
    expect(t.sent).toHaveLength(1);
    t.sender.onView(RESULTS);
    expect(t.sender.state).toBe('accepted');
    expect(t.sender.attempts).toBe(1);
    expect(t.warnings).toEqual([]);
  });

  it('wartet ohne Verbindung und sendet mit dem ersten passenden Stand danach', () => {
    const t = setup(false);
    t.sender.onView(PLAY);
    t.sender.submit(RESULT);
    expect(t.sender.state).toBe('pending');
    expect(t.sent).toEqual([]);
    t.link.connected = true;
    t.sender.onView(PLAY);
    expect(t.sent).toEqual([RESULT]);
    expect(t.sender.state).toBe('sent');
  });

  it('sendet nach Verbindungsverlust erneut, solange der Server noch minigame-play zeigt', () => {
    const t = setup();
    t.sender.onView(PLAY);
    t.sender.submit(RESULT);
    t.link.connected = false;
    t.sender.onDisconnected();
    expect(t.sender.state).toBe('pending');
    t.link.connected = true;
    // Schnappschuss nach host-hello: noch dasselbe Minispiel → kam nicht an → erneut senden.
    t.sender.onView(minigameView('minigame-play', { elapsedMs: 6000 }));
    expect(t.sent).toHaveLength(2);
    expect(t.sender.state).toBe('sent');
    t.sender.onView(RESULTS);
    expect(t.sender.state).toBe('accepted');
  });

  it('sendet nach Verbindungsverlust nicht erneut, wenn der Server es schon angenommen hat', () => {
    const t = setup();
    t.sender.onView(PLAY);
    t.sender.submit(RESULT);
    t.sender.onDisconnected();
    t.sender.onView(RESULTS);
    expect(t.sent).toHaveLength(1);
    expect(t.sender.state).toBe('accepted');
  });

  it('gibt auf, wenn der Server weiter ist (Abbruch, andere Runde)', () => {
    const t = setup(false);
    t.sender.onView(PLAY);
    t.sender.submit(RESULT);
    t.sender.onView(minigameView('minigame-results', { placements: [], aborted: true }));
    expect(t.sender.state).toBe('expired');
    t.link.connected = true;
    t.sender.onView(PLAY);
    expect(t.sent).toEqual([]);
    expect(t.warnings).toHaveLength(1);

    const other = setup(false);
    other.sender.onView(PLAY);
    other.sender.submit(RESULT);
    other.sender.onView(minigameView('minigame-play', { round: 3 }));
    expect(other.sender.state).toBe('expired');
  });

  it('protokolliert invalid-result und wiederholt dann nicht', () => {
    const t = setup();
    t.sender.onView(PLAY);
    t.sender.submit(RESULT);
    t.sender.onError({ code: 'invalid-result', message: 'Plätze passen nicht' });
    expect(t.sender.state).toBe('rejected');
    expect(t.warnings).toEqual([
      'Server lehnt Minispiel-Ergebnis pump-parade:2 ab: Plätze passen nicht',
    ]);
    t.sender.onDisconnected();
    t.sender.onView(PLAY);
    expect(t.sent).toHaveLength(1);
    // Andere Fehler (z. B. Drosselung) betreffen das Ergebnis nicht.
    const u = setup();
    u.sender.onView(PLAY);
    u.sender.submit(RESULT);
    u.sender.onError({ code: 'rate-limited', message: 'langsam' });
    expect(u.sender.state).toBe('sent');
  });

  it('wertet minigame-result-ack aus (v4, CHAOS-55)', () => {
    const t = setup();
    t.sender.onView(PLAY);
    t.sender.submit(RESULT);
    // Bestätigung zu einem anderen Minispiel zählt nicht.
    t.sender.onAck({ minigameId: 'pump-parade', round: 1, accepted: false, code: 'out-of-phase' });
    expect(t.sender.state).toBe('sent');
    expect(t.sender.lastAck).toBeNull();
    t.sender.onAck({ minigameId: 'pump-parade', round: 2, accepted: true });
    expect(t.sender.state).toBe('accepted');
    expect(t.sender.lastAck).toEqual({ minigameId: 'pump-parade', round: 2, accepted: true });

    const u = setup();
    u.sender.onView(PLAY);
    u.sender.submit(RESULT);
    // `out-of-phase` allein (könnte ein Steuerbefehl sein) ändert nichts, das `ack` entscheidet.
    u.sender.onError({ code: 'out-of-phase', message: 'Kein Spiel' });
    expect(u.sender.state).toBe('sent');
    u.sender.onAck({
      minigameId: 'pump-parade',
      round: 2,
      accepted: false,
      code: 'invalid-result',
    });
    expect(u.sender.state).toBe('rejected');
    expect(u.sender.lastAck?.code).toBe('invalid-result');
    expect(u.warnings).toEqual([
      'Server lehnt Minispiel-Ergebnis pump-parade:2 ab (invalid-result)',
    ]);
  });

  it('höchstens MAX_RESULT_ATTEMPTS Sendungen bei ständigem Verbindungsverlust', () => {
    const t = setup();
    t.sender.onView(PLAY);
    t.sender.submit(RESULT);
    for (let index = 0; index < MAX_RESULT_ATTEMPTS + 3; index++) {
      t.sender.onDisconnected();
      t.sender.onView(PLAY);
    }
    expect(t.sent).toHaveLength(MAX_RESULT_ATTEMPTS);
    expect(t.sender.state).toBe('rejected');
  });

  it('Sendefunktion kann später gesetzt werden (Verbindung jünger als der Versand)', () => {
    const sent: MinigameResultPayload[] = [];
    const sender = createResultSender({ warn: () => undefined });
    sender.onView(PLAY);
    sender.submit(RESULT);
    expect(sender.state).toBe('pending');
    sender.setTransport((result) => {
      sent.push(result);
      return true;
    });
    expect(sent).toEqual([RESULT]);
    sender.setTransport(null);
    sender.onDisconnected();
    sender.onView(PLAY);
    expect(sent).toHaveLength(1);
    expect(sender.state).toBe('pending');
  });

  it('ein neues Minispiel (nächste Runde) wird wieder gesendet', () => {
    const t = setup();
    t.sender.onView(PLAY);
    t.sender.submit(RESULT);
    t.sender.onView(RESULTS);
    const next = minigameView('minigame-play', { round: 3 });
    t.sender.onView(next);
    t.sender.submit({ ...RESULT, round: 3 });
    expect(t.sent.map((r) => r.round)).toEqual([2, 3]);
  });
});
