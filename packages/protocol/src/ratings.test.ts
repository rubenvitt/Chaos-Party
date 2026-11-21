/**
 * Minispiel-Galerie und Daumen (v4-Nachtrag CHAOS-87): `start.practice`, `rate`, `ratings`,
 * `BoardView.practice` und Minispiel-Kontext `practice`/`vote`. Gültige und kaputte Werte.
 */
import { describe, expect, it } from 'vitest';
import {
  createMessage,
  encode,
  parseControllerMessage,
  parseHostMessage,
  parseServerToHostMessage,
} from './parse.ts';
import { MAX_RATED_MINIGAMES } from './schemas.ts';
import { PROTOCOL_VERSION } from './version.ts';

const v = PROTOCOL_VERSION;

describe('Minispiel-Galerie und Daumen (CHAOS-87)', () => {
  it('nimmt start mit Übungs-Minispiel an und lehnt kaputte Kennungen ab', () => {
    const ok = parseHostMessage(encode(createMessage('start', { practice: 'sockenregen' })));
    expect(ok.ok && ok.message.type === 'start' && ok.message.practice).toBe('sockenregen');
    const bad = parseHostMessage(JSON.stringify({ v, type: 'start', practice: 'Socken Regen' }));
    expect(bad.ok).toBe(false);
  });

  it('nimmt rate mit Daumen hoch/runter an', () => {
    for (const vote of ['up', 'down'] as const) {
      const parsed = parseControllerMessage(
        encode(
          createMessage('rate', { slot: 2, seq: 7, minigameId: 'wackelturm', round: 3, vote }),
        ),
      );
      expect(parsed.ok).toBe(true);
    }
  });

  it.each([
    { vote: 'meh' },
    { vote: 'up', round: -1 },
    { vote: 'up', minigameId: 'x' },
    { vote: 'up', extra: true },
  ])('lehnt rate mit %o ab', (patch) => {
    const raw = { v, type: 'rate', slot: 1, seq: 1, minigameId: 'wackelturm', round: 1, ...patch };
    expect(parseControllerMessage(JSON.stringify(raw)).ok).toBe(false);
  });

  it('nimmt ratings an, begrenzt die Länge und verlangt ganze Zahlen', () => {
    const ok = parseServerToHostMessage(
      encode(createMessage('ratings', { games: [{ id: 'sockenregen', up: 3, down: 1 }] })),
    );
    expect(ok.ok).toBe(true);
    const tooMany = Array.from({ length: MAX_RATED_MINIGAMES + 1 }, (_, i) => ({
      id: `spiel-${String(i)}`,
      up: 0,
      down: 1,
    }));
    expect(
      parseServerToHostMessage(JSON.stringify({ v, type: 'ratings', games: tooMany })).ok,
    ).toBe(false);
    const fraction = { v, type: 'ratings', games: [{ id: 'sockenregen', up: 0.5, down: 0 }] };
    expect(parseServerToHostMessage(JSON.stringify(fraction)).ok).toBe(false);
  });
});
