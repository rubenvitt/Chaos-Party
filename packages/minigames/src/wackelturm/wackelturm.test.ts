import { checkInfo, checkResult, MINIGAME_TEXT_LIMITS, type Slot } from '@chaos-party/minigame-sdk';
import type { MinigameModule } from '@chaos-party/minigame-sdk/babylon';
import {
  EMPTY_RESIDUE,
  runMinigameHeadless,
  testPlayers,
  type InputScript,
} from '@chaos-party/minigame-sdk/testing';
import { describe, expect, it } from 'vitest';
import { getMinigameInfo, getMinigameModule, ROTATION } from '../index.ts';
import { wackelturm, Wackelturm } from './index.ts';
import { WACKELTURM_INFO } from './info.ts';
import {
  inOwnNest,
  inPile,
  nestPosition,
  steadyPace,
  WACKELTURM_PARAMS,
  type WackelturmState,
} from './logic.ts';
import { bannerFor, buildHighlights, hudStatus } from './texts.ts';

/**
 * Modul-Hülle, die das erzeugte Spiel festhält – so können Test-Skripte den Regelzustand
 * lesen (nur lesen!) und wie ein Mensch am Controller darauf reagieren.
 */
function observed(): { module: MinigameModule; rules: () => Readonly<WackelturmState> } {
  let game: Wackelturm | null = null;
  return {
    module: {
      info: wackelturm.info,
      create: () => {
        game = new Wackelturm();
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

/**
 * Kurier: holt `height` Törtchen und trägt sie langsam genug heim. `null` = steht still.
 * Eingaben nur über `send` (wie Controller), Entscheidungen aus dem gelesenen Zustand.
 */
function couriers(
  rules: () => Readonly<WackelturmState>,
  heights: Partial<Record<Slot, number | null>>,
): InputScript {
  let frame = 0;
  return (_elapsed, send) => {
    frame++;
    const state = rules();
    for (const runner of state.runners) {
      const height = heights[runner.slot];
      if (height === undefined || height === null) continue;
      const carrying = runner.stack.length;
      const target = carrying >= height ? nestPosition(runner.slot) : { x: 0, z: 0 };
      const dx = target.x - runner.x;
      const dz = target.z - runner.z;
      const distance = Math.hypot(dx, dz);
      if (carrying < height && inPile(runner, state.params) && distance < 0.9) {
        send(runner.slot, { type: 'move', x: 0, y: 0 });
        // A tippen: abwechselnd drücken und loslassen.
        send(runner.slot, { type: frame % 4 === 0 ? 'press' : 'release', button: 'a' });
        continue;
      }
      const pace = Math.min(1, steadyPace(carrying, state.params) * 0.7, distance / 0.8);
      send(runner.slot, { type: 'move', x: (dx / distance) * pace, y: (dz / distance) * pace });
    }
  };
}

describe('Wackelturm: Steckbrief und Registrierung', () => {
  it('Steckbrief ist gültig, Hybrid, 20–45 s, Joystick + A + B', () => {
    expect(checkInfo(WACKELTURM_INFO)).toEqual({ ok: true });
    expect(WACKELTURM_INFO.category).toBe('hybrid');
    expect(WACKELTURM_INFO.physics).toBe(false);
    expect(WACKELTURM_INFO.durationMs).toBeGreaterThanOrEqual(20_000);
    expect(WACKELTURM_INFO.durationMs).toBeLessThanOrEqual(45_000);
    expect(WACKELTURM_INFO.controls.joystick).not.toBeNull();
    expect(WACKELTURM_INFO.controls.a).not.toBeNull();
    expect(WACKELTURM_INFO.controls.b).not.toBeNull();
  });

  it('steht im Katalog, in der Rotation und als Modul', () => {
    expect(getMinigameInfo('wackelturm')).toBe(WACKELTURM_INFO);
    expect(ROTATION).toContain('wackelturm');
    expect(getMinigameModule('wackelturm')).toBe(wackelturm);
  });
});

describe('Wackelturm: Läufe mit Kurier-Bots (headless)', () => {
  it.each([2, 3, 4])(
    'mit %i Spielern: Ergebnis am Zeitlimit, gültig, Szene leer',
    async (count) => {
      const { module, rules } = observed();
      const heights: Partial<Record<Slot, number>> = { 1: 6, 2: 3, 3: 2, 4: 1 };
      const run = await runMinigameHeadless(module, {
        players: count,
        seed: 11,
        script: couriers(rules, heights),
      });
      const outcome = run.outcome;
      expect(outcome?.forced).toBe(false);
      expect(outcome?.elapsedMs).toBeGreaterThanOrEqual(WACKELTURM_INFO.durationMs);
      expect(outcome?.elapsedMs).toBeLessThanOrEqual(WACKELTURM_INFO.durationMs + 20);
      const result = outcome?.result;
      if (!result) throw new Error('kein Ergebnis');
      const slots = testPlayers(count).map((player) => player.slot);
      expect(checkResult(result, { minigameId: 'wackelturm', slots, scoring: 'higher' })).toEqual({
        ok: true,
      });
      // Alle Kuriere liefern; der 6er-Kurier gewinnt dank Turmbonus.
      for (const placement of result.placements) expect(placement.score).toBeGreaterThan(0);
      expect(result.placements[0]?.slot).toBe(1);
      expect(result.highlights?.length).toBeGreaterThan(0);
      for (const line of result.highlights ?? []) {
        expect(line.length).toBeLessThanOrEqual(MINIGAME_TEXT_LIMITS.highlight);
      }
      expect(run.residue).toEqual(EMPTY_RESIDUE);
      expect(run.fx.sounds).toContain('pop');
      expect(run.fx.sounds).toContain('cheer');
      expect(run.animations.get(1)).toContain('run');
      expect(run.animations.get(1)).toContain('cheer');
    },
  );

  it('ohne Eingaben: alle 0 Punkte, alle gemeinsam Erster', async () => {
    const run = await runMinigameHeadless(wackelturm, { players: 3, seed: 2 });
    expect(run.outcome?.forced).toBe(false);
    expect(run.outcome?.result.placements.map((entry) => entry.place)).toEqual([1, 1, 1]);
    expect(run.outcome?.result.placements.map((entry) => entry.score)).toEqual([0, 0, 0]);
    expect(run.outcome?.result.highlights).toEqual(['Blau gewinnt mit 0 Punkten.']);
    expect(run.residue).toEqual(EMPTY_RESIDUE);
  });

  it('Gleichstand: zwei gleiche Kuriere teilen sich Platz 1', async () => {
    const { module, rules } = observed();
    const run = await runMinigameHeadless(module, {
      players: 3,
      seed: 4,
      script: couriers(rules, { 1: 2, 2: 2, 3: null }),
    });
    const placements = run.outcome?.result.placements ?? [];
    const one = placements.find((entry) => entry.slot === 1);
    const two = placements.find((entry) => entry.slot === 2);
    // Symmetrische Nester (1 hinten links, 2 hinten rechts) → gleiche Punkte, gleicher Platz.
    expect(one?.score).toBe(two?.score);
    expect(one?.place).toBe(1);
    expect(two?.place).toBe(1);
    expect(placements.find((entry) => entry.slot === 3)?.place).toBe(3);
  });

  it('kürzeres Zeitlimit (Host neu geladen) endet genau dort', async () => {
    const run = await runMinigameHeadless(wackelturm, { players: 2, timeLimitMs: 12_000 });
    expect(run.outcome?.forced).toBe(false);
    expect(run.outcome?.elapsedMs).toBeGreaterThanOrEqual(12_000);
    expect(run.outcome?.elapsedMs).toBeLessThan(12_100);
  });

  it('gleicher Seed + gleiches Skript → gleiches Ergebnis; Gold hängt am Seed', async () => {
    const play = async (seed: number) => {
      const { module, rules } = observed();
      let goldSpots = '';
      const script = couriers(rules, { 1: 7, 2: 4, 3: 5, 4: 2 });
      const run = await runMinigameHeadless(module, {
        players: 4,
        seed,
        script: (elapsed, send, runner) => {
          script(elapsed, send, runner);
          goldSpots =
            rules()
              .gold.map((gold) => `${gold.x.toFixed(3)},${gold.z.toFixed(3)}`)
              .join(';') || goldSpots;
        },
      });
      return { result: run.outcome?.result, goldSpots };
    };
    const a = await play(21);
    const b = await play(21);
    expect(b).toEqual(a);
    const c = await play(22);
    expect(c.goldSpots).not.toBe(a.goldSpots);
  });

  it('getrennter Spieler: Figur bleibt stehen, Spiel läuft weiter, Ergebnis vollständig', async () => {
    const { module, rules } = observed();
    let frozenAt: { x: number; z: number } | null = null;
    let movedWhileOffline = false;
    const script = couriers(rules, { 1: 4, 2: 4, 3: 3 });
    const run = await runMinigameHeadless(module, {
      players: 3,
      seed: 5,
      script: (elapsed, send, runner) => {
        script(elapsed, send, runner);
        const two = rules().runners.find((entry) => entry.slot === 2);
        if (!two) return;
        if (elapsed >= 5_000 && frozenAt === null) {
          runner.setConnected(2, false);
          frozenAt = { x: two.x, z: two.z };
        }
        // Nach dem Ausrollen (1 s) darf sich die Figur nicht mehr bewegen.
        if (frozenAt && elapsed > 6_000 && elapsed < 15_000) {
          const speed = Math.hypot(two.vx, two.vz);
          if (speed > 0.01 && !inOwnNest(two, rules().params)) movedWhileOffline = true;
        }
        if (elapsed >= 15_000) runner.setConnected(2, true);
      },
    });
    expect(movedWhileOffline).toBe(false);
    expect(run.outcome?.forced).toBe(false);
    expect(run.outcome?.result.placements).toHaveLength(3);
    expect(run.residue).toEqual(EMPTY_RESIDUE);
  });

  it('HUD zeigt Turmhöhe, ×2, Restzeit und den Schlussaufruf', async () => {
    const { module, rules } = observed();
    const statuses = new Set<string>();
    const banners = new Set<string>();
    let lastRemaining = Number.POSITIVE_INFINITY;
    let monotonic = true;
    const script = couriers(rules, { 1: 6, 2: 3 });
    await runMinigameHeadless(module, {
      players: 2,
      seed: 8,
      script: (elapsed, send, runner) => {
        script(elapsed, send, runner);
        if (elapsed % 100 !== 0) return;
        const hud = runner.hud();
        if (hud.remainingMs > lastRemaining) monotonic = false;
        lastRemaining = hud.remainingMs;
        for (const entry of hud.scores) if (entry.status) statuses.add(entry.status);
        if (hud.banner) banners.add(hud.banner);
      },
    });
    expect(monotonic).toBe(true);
    expect(statuses).toContain('Turm 6 ×2');
    expect(statuses).toContain('Turm 3');
    expect(banners).toContain('Letzte Sekunden – abliefern!');
    for (const status of statuses) expect(status.length).toBeLessThanOrEqual(16);
    for (const banner of banners) expect(banner.length).toBeLessThanOrEqual(32);
  });

  it('Rempeln über den Controller: B stößt den Turm um, Effekte laufen', async () => {
    const { module, rules } = observed();
    const script = couriers(rules, { 1: 5 });
    let chased = false;
    const run = await runMinigameHeadless(module, {
      players: 2,
      seed: 9,
      maxMs: 20_000,
      timeLimitMs: 15_000,
      script: (elapsed, send, runner) => {
        script(elapsed, send, runner);
        // Slot 2 jagt Slot 1, sobald der einen Turm trägt, und drückt B aus der Nähe.
        const state = rules();
        const hunter = state.runners.find((entry) => entry.slot === 2);
        const prey = state.runners.find((entry) => entry.slot === 1);
        if (!hunter || !prey || prey.stack.length < 3 || chased) return;
        const dx = prey.x - hunter.x;
        const dz = prey.z - hunter.z;
        const distance = Math.hypot(dx, dz);
        send(2, { type: 'move', x: dx / distance, y: dz / distance });
        if (distance < 1.6) {
          send(2, { type: 'press', button: 'b' });
          send(2, { type: 'release', button: 'b' });
          chased = runner.elapsedMs > 0;
        }
      },
    });
    expect(run.fx.sounds).toContain('whoosh');
    expect(run.fx.sounds).toContain('bump');
    expect(run.animations.get(1)).toContain('hit');
    expect(run.outcome?.result.highlights?.some((line) => line.includes('klaute'))).toBe(true);
  });
});

describe('Wackelturm: Texte', () => {
  const base = {
    slot: 1 as const,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    fx: 0,
    fz: 1,
    stickX: 0,
    stickZ: 0,
    wobble: 0,
    score: 0,
    stun: 0,
    grabCooldown: 0,
    bumpCooldown: 0,
    dash: 0,
    stats: { delivered: 0, bestDelivery: 0, topples: 0, bumpsLanded: 0, stolen: 0, gold: 0 },
  };
  const params = WACKELTURM_PARAMS;

  it('HUD-Status: leer, benommen, Turmhöhe, ×2, kippelt', () => {
    expect(hudStatus({ ...base, stack: [] }, params)).toBeUndefined();
    expect(hudStatus({ ...base, stack: [], stun: 0.3 }, params)).toBe('benommen');
    expect(hudStatus({ ...base, stack: ['normal', 'normal'] }, params)).toBe('Turm 2');
    const ten = Array.from({ length: 10 }, () => 'normal' as const);
    expect(hudStatus({ ...base, stack: ten }, params)).toBe('Turm 10 ×2');
    expect(hudStatus({ ...base, stack: ten, wobble: 0.7 }, params)).toBe('10er kippelt!');
  });

  it('Banner: Meldung, Schlussaufruf, nichts nach dem Ende; höchstens 32 Zeichen', () => {
    const long = { text: 'Ein sehr langer Spielername klaut den Turm!', until: 10 };
    expect(bannerFor(long, 9, 20_000, false)?.length).toBe(32);
    expect(bannerFor(long, 11, 20_000, false)).toBeUndefined();
    expect(bannerFor(null, 31, 4_000, false)).toBe('Letzte Sekunden – abliefern!');
    expect(bannerFor(long, 9, 4_000, true)).toBeUndefined();
  });

  it('Höhepunkte: höchstens 4 Zeilen à 64 Zeichen, mit Namen', () => {
    const state = {
      runners: [
        { ...base, stack: [], stats: { ...base.stats, bestDelivery: 9, gold: 2 } },
        {
          ...base,
          slot: 2 as const,
          stack: [],
          stats: { ...base.stats, stolen: 7, topples: 3 },
        },
      ],
    } as unknown as WackelturmState;
    const players = testPlayers(2).map((player) =>
      player.slot === 1 ? { ...player, name: 'Ein unglaublich langer Name' } : player,
    );
    const lines = buildHighlights(state, players, []);
    expect(lines).toEqual([
      'Ein unglaublich… lieferte einen 9er-Turm ab!',
      'Orange klaute 7 Törtchen.',
      'Orange verlor 3 Türme.',
      'Ein unglaublich… schnappte 2 Goldtörtchen.',
    ]);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(64);
  });
});
