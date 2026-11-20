/**
 * Minispiel-Rotation über die echte Session (CHAOS-85): Sperrliste und Favoriten per
 * `configure`, Anzeige in `lobby.settings.minigames`, iPad-Zonen aus der Aufstellung und die
 * Minispiele der letzten Partie als „nicht gleich wieder“.
 */
import type { GameState, MinigameSpec } from '@chaos-party/game-core';
import { getSteckbrief, rotationInfos } from '@chaos-party/minigames/catalog';
import { describe, expect, it } from 'vitest';
import { catalogMinigames, minigameSpecOf } from './game.ts';
import { Harness, HOST } from './testHarness.ts';

const SPECS: readonly MinigameSpec[] = catalogMinigames();
const IDS = SPECS.map((spec) => spec.id);

function lobby(seats: readonly number[] = [1, 1]): Harness {
  const h = new Harness({ game: { seed: 5, rounds: 3 } });
  h.host();
  seats.forEach((count, index) => {
    h.join(index + 1, count);
  });
  return h;
}

function start(h: Harness, ids: readonly number[] = [1, 2]): GameState {
  for (const id of ids) h.ready(id);
  h.start();
  const state = h.session.snapshot().game?.state;
  if (!state) throw new Error('keine Partie');
  return state;
}

function configure(
  h: Harness,
  fields: { minigameBlocklist?: string[]; minigameFavorites?: string[] },
) {
  h.send(HOST, { v: 4, type: 'configure', ...fields });
}

describe('Minispiel-Rotation in der Session (CHAOS-85)', () => {
  it('Katalog-Steckbriefe tragen die Achsen der Rotation (Vielfalts-Steckbrief, ADR-021)', () => {
    for (const info of rotationInfos()) {
      const spec = minigameSpecOf(info);
      const steckbrief = getSteckbrief(info.id);
      expect(spec.family).toBeDefined();
      expect(spec.verb).toBe(steckbrief?.kernverb);
      expect(spec.form).toBe('ffa');
      expect(spec.controls).toBe(steckbrief?.bedienung);
      expect(spec.category).toBe(info.category);
    }
  });

  it('Lobby listet die Rotation; Sperrliste und Favoriten kommen an und bleiben über die Revanche', () => {
    const h = lobby();
    expect(h.lobby?.settings.minigames?.map((game) => game.id)).toEqual(IDS);
    expect(h.lobby?.settings.minigames?.every((g) => !g.blocked && !g.favorite)).toBe(true);

    const blocked = IDS.slice(0, 2);
    const favorite = IDS[2] ?? '';
    // Fremde Kennungen fallen weg, die Reihenfolge folgt dem Katalog.
    configure(h, { minigameBlocklist: ['gibt-es-nicht', ...[...blocked].reverse()] });
    configure(h, { minigameFavorites: [favorite] });
    expect(h.errors).toEqual([]);
    expect(h.session.snapshot()).toMatchObject({
      minigameBlocklist: blocked,
      minigameFavorites: [favorite],
    });
    const games = h.lobby?.settings.minigames ?? [];
    expect(games.filter((g) => g.blocked).map((g) => g.id)).toEqual(blocked);
    expect(games.filter((g) => g.favorite).map((g) => g.id)).toEqual([favorite]);

    // Gleicher Stand schickt keine neue Lobby.
    const lobbies = h.lobbies.length;
    configure(h, { minigameBlocklist: blocked });
    expect(h.lobbies.length).toBe(lobbies);

    const state = start(h);
    expect(state.config.minigameRotation).toEqual({
      ipadZones: false,
      blocked,
      favorites: [favorite],
    });
    // Gesperrte Minispiele kommen in der Partie nicht vor.
    h.runToEnd();
    const played = h.events.flatMap((e) => (e.type === 'minigame-started' ? [e.minigame] : []));
    expect(played).toHaveLength(3);
    expect(played.some((id) => blocked.includes(id))).toBe(false);

    h.rematch();
    expect(h.session.snapshot()).toMatchObject({
      minigameBlocklist: blocked,
      minigameFavorites: [favorite],
    });
    // Die nächste Partie kennt die Minispiele der letzten.
    const next = start(h);
    expect(next.config.minigameRotation?.recent).toEqual([...new Set(played)]);
  });

  it('leere Liste hebt die Sperre auf; im Spiel ist configure nicht erlaubt', () => {
    const h = lobby();
    configure(h, { minigameBlocklist: [IDS[0] ?? ''] });
    configure(h, { minigameBlocklist: [] });
    expect(h.session.snapshot().minigameBlocklist).toEqual([]);
    start(h);
    configure(h, { minigameFavorites: [IDS[0] ?? ''] });
    expect(h.errors.at(-1)).toEqual({ to: HOST, code: 'out-of-phase' });
  });

  it('weist kaputte Listen ab (Form, Doppelte)', () => {
    const h = lobby();
    for (const list of [['Sockenregen'], ['ab'], [IDS[0], IDS[0]], 'sockenregen']) {
      h.send(HOST, { v: 4, type: 'configure', minigameBlocklist: list } as never);
      expect(h.errors.at(-1)).toEqual({ to: HOST, code: 'bad-message' });
    }
    expect(h.session.snapshot().minigameBlocklist).toEqual([]);
  });

  it('erkennt iPad-Zonen: zwei mitspielende Slots an einer Verbindung', () => {
    const ipad = lobby([2]);
    expect(start(ipad, [1]).config.minigameRotation?.ipadZones).toBe(true);
    const phones = lobby([1, 1]);
    expect(start(phones).config.minigameRotation?.ipadZones).toBe(false);
  });
});
