import { checkInfo, checkResult, MINIGAME_TEXT_LIMITS, type Slot } from '@chaos-party/minigame-sdk';
import type { MinigameModule } from '@chaos-party/minigame-sdk/babylon';
import {
  EMPTY_RESIDUE,
  runMinigameHeadless,
  type InputScript,
} from '@chaos-party/minigame-sdk/testing';
import { describe, expect, it } from 'vitest';
import { getMinigameInfo, getMinigameModule, ROTATION } from '../index.ts';
import { KuckucksKlatsche, kuckucksKlatsche } from './index.ts';
import { KUCKUCKS_KLATSCHE_INFO } from './info.ts';
import type { KuckucksKlatscheLogic } from './logic.ts';

/** Modul-Hülle, die das Spiel festhält – Skripte lesen den Regelzustand (nur lesen!). */
function observed(): { module: MinigameModule; rules: () => Readonly<KuckucksKlatscheLogic> } {
  let game: KuckucksKlatsche | null = null;
  return {
    module: {
      info: kuckucksKlatsche.info,
      create: () => {
        game = new KuckucksKlatsche();
        return game;
      },
    },
    rules: () => {
      const state = game?.rules;
      if (!state) throw new Error('Spiel nicht vorbereitet');
      return state;
    },
  };
}

type Style = 'aufmerksam' | 'raffzahn' | 'dauer' | 'still';

/**
 * Skript-Spieler wie Menschen am Controller: Eingaben nur über `send`, Entscheidungen aus dem
 * sichtbaren Zustand, mit fester Reaktionszeit in Frames.
 * - aufmerksam: klatscht nur den eigenen Kuckuck (keine Finten).
 * - raffzahn: wie aufmerksam, klaut zusätzlich nach dem Gong.
 * - dauer: drückt alle 12 Frames, egal was passiert.
 */
function players(
  rules: () => Readonly<KuckucksKlatscheLogic>,
  styles: Partial<Record<Slot, Style>>,
  reactionFrames = 18,
): InputScript {
  let frame = 0;
  const seenSince = new Map<string, number>();
  return (_elapsed, send) => {
    frame++;
    const state = rules();
    for (const clapper of state.clappers) {
      const style = styles[clapper.slot] ?? 'still';
      const press = () => {
        send(clapper.slot, { type: 'press', button: 'a' });
        send(clapper.slot, { type: 'release', button: 'a' });
      };
      if (style === 'still') continue;
      if (style === 'dauer') {
        if (frame % 12 === 0) press();
        continue;
      }
      const own = state.door(clapper.slot);
      const ownKey = `${String(clapper.slot)}-${String(own?.openings)}-${own?.phase ?? ''}`;
      if (own?.phase === 'own') {
        const since = seenSince.get(ownKey) ?? frame;
        seenSince.set(ownKey, since);
        if (frame - since >= reactionFrames) press();
        continue;
      }
      if (style === 'raffzahn' && !state.isDizzy(clapper.slot)) {
        const free = state.doors.find(
          (door) => door.slot !== clapper.slot && door.phase === 'free',
        );
        if (free && own?.phase !== 'finte') {
          const key = `${String(free.slot)}-${String(free.openings)}-free`;
          const since = seenSince.get(key) ?? frame;
          seenSince.set(key, since);
          if (frame - since >= reactionFrames) press();
        }
      }
    }
  };
}

describe('Kuckucks-Klatsche: Steckbrief und Registrierung', () => {
  it('Steckbrief ist gültig: Arcade, 30 s, nur Knopf A, ohne Physik', () => {
    expect(checkInfo(KUCKUCKS_KLATSCHE_INFO)).toEqual({ ok: true });
    expect(KUCKUCKS_KLATSCHE_INFO.category).toBe('arcade');
    expect(KUCKUCKS_KLATSCHE_INFO.controls).toEqual({ joystick: null, a: 'Klatschen', b: null });
    expect(KUCKUCKS_KLATSCHE_INFO.physics).toBe(false);
    expect(KUCKUCKS_KLATSCHE_INFO.instructions.length).toBeLessThanOrEqual(
      MINIGAME_TEXT_LIMITS.instructions,
    );
  });

  it('ist im Katalog, als Modul und in der Rotation eingetragen', () => {
    expect(getMinigameInfo('kuckucks-klatsche')).toBe(KUCKUCKS_KLATSCHE_INFO);
    expect(getMinigameModule('kuckucks-klatsche')).toBe(kuckucksKlatsche);
    expect(ROTATION).toContain('kuckucks-klatsche');
  });
});

describe('Kuckucks-Klatsche: Ablauf in der Laufzeit (headless)', () => {
  it('volle Runde mit Raffzahn, Dauerklatscher und Stillsitzer: gültig, Szene leer', async () => {
    const { module, rules } = observed();
    const run = await runMinigameHeadless(module, {
      players: 3,
      seed: 17,
      // Ob Dauerklatschen sich lohnt, zeigt EXP-016 über viele Seeds (Faktor 0,55); eine
      // einzelne Runde hängt stark vom Türglück ab. Hier nur Ablauf und Wirkungen.
      script: players(rules, { 1: 'raffzahn', 2: 'dauer', 3: 'still' }),
    });
    const outcome = run.outcome;
    expect(outcome?.forced).toBe(false);
    expect(outcome?.elapsedMs).toBeGreaterThanOrEqual(KUCKUCKS_KLATSCHE_INFO.durationMs);
    expect(outcome?.elapsedMs).toBeLessThanOrEqual(KUCKUCKS_KLATSCHE_INFO.durationMs + 50);
    const result = outcome?.result;
    expect(
      result &&
        checkResult(result, {
          minigameId: 'kuckucks-klatsche',
          slots: [1, 2, 3],
          scoring: 'higher',
        }),
    ).toEqual({ ok: true });
    const score = (slot: Slot) => result?.placements.find((p) => p.slot === slot)?.score ?? -1;
    expect(score(3)).toBe(0);
    expect(score(1)).toBeGreaterThan(10);
    expect(result?.placements.at(-1)?.slot).toBe(3);
    expect(result?.highlights?.length ?? 0).toBeGreaterThan(0);
    for (const line of result?.highlights ?? []) {
      expect(line.length).toBeLessThanOrEqual(MINIGAME_TEXT_LIMITS.highlight);
    }
    expect(run.residue).toEqual(EMPTY_RESIDUE);
    const winner = result?.placements[0]?.slot ?? 1;
    expect(run.animations.get(winner)).toContain('cheer');
    expect(run.animations.get(3)).toContain('sad');
    expect(run.animations.get(2)).toContain('hit'); // benommen nach Leerklatscher
    expect(run.fx.sounds).toContain('buzz'); // Gong
    expect(run.fx.sounds).toContain('lose'); // Finte geklatscht
  });

  it('Raffzahn klaut beim Stillsitzer; das zeigen Wertung und Höhepunkte', async () => {
    const { module, rules } = observed();
    const run = await runMinigameHeadless(module, {
      players: 2,
      seed: 5,
      script: players(rules, { 1: 'still', 2: 'raffzahn' }),
    });
    const result = run.outcome?.result;
    expect(result?.placements[0]?.slot).toBe(2);
    expect(result?.highlights?.some((line) => line.startsWith('Orange klaut Blau'))).toBe(true);
    expect(run.fx.sounds).toContain('whoosh');
    expect(run.residue).toEqual(EMPTY_RESIDUE);
  });

  it('gleiches Skript und Seed → gleiches Ergebnis (deterministisch)', async () => {
    const once = async () => {
      const { module, rules } = observed();
      const run = await runMinigameHeadless(module, {
        players: 4,
        seed: 99,
        script: players(rules, { 1: 'aufmerksam', 2: 'raffzahn', 3: 'dauer', 4: 'raffzahn' }, 14),
      });
      return run.outcome?.result;
    };
    expect(await once()).toEqual(await once());
  });

  it('HUD zeigt Restzeit, Punkte, „benommen“ und die Banner', async () => {
    const { module, rules } = observed();
    const banners = new Set<string>();
    const statuses = new Set<string>();
    let lastRemaining = Infinity;
    let monotonic = true;
    const spam = players(rules, { 1: 'dauer' });
    await runMinigameHeadless(module, {
      players: 2,
      seed: 8,
      script: (elapsed, send, runner) => {
        spam(elapsed, send, runner);
        const hud = runner.hud();
        if (hud.banner) banners.add(hud.banner);
        for (const score of hud.scores) if (score.status) statuses.add(score.status);
        if (hud.remainingMs > lastRemaining) monotonic = false;
        lastRemaining = hud.remainingMs;
      },
    });
    expect(banners).toEqual(new Set(['Klatsch deinen Kuckuck!', 'Mitternacht!']));
    expect(statuses).toEqual(new Set(['benommen']));
    expect(monotonic).toBe(true);
  });
});
