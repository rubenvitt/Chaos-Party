import { checkInfo, checkResult } from '@chaos-party/minigame-sdk';
import type { MinigameHud } from '@chaos-party/minigame-sdk/babylon';
import {
  EMPTY_RESIDUE,
  runMinigameHeadless,
  stepsFor,
  type InputScript,
} from '@chaos-party/minigame-sdk/testing';
import { describe, expect, it } from 'vitest';
import { MINIGAME_INFOS, ROTATION, getMinigameModule } from '../index.ts';
import { sockenregen } from './index.ts';

const STEP_MS = 1000 / 60;
const { info } = sockenregen;

/**
 * Skript-Bots: Slot 1 läuft Kreise und hechtet alle 2 s, Slot 2 zickzackt quer, Slot 3 läuft
 * eine Acht, Slot 4 steht still (wird so gern geplättet).
 */
function botScript(players: number): InputScript {
  return (elapsedMs, send) => {
    const t = elapsedMs / 1000;
    const step = Math.round(elapsedMs / STEP_MS);
    send(1, { type: 'move', x: Math.cos(t * 1.4), y: Math.sin(t * 1.4) });
    if (step % stepsFor(2) === 0) send(1, { type: 'press', button: 'a' });
    if (step % stepsFor(2) === 6) send(1, { type: 'release', button: 'a' });
    if (players >= 2) send(2, { type: 'move', x: Math.sign(Math.sin(t * 1.1)) || 1, y: 0.4 });
    if (players >= 3) send(3, { type: 'move', x: Math.sin(t * 1.6), y: Math.sin(t * 0.8) });
  };
}

describe('Sockenregen: Steckbrief und Katalog', () => {
  it('hat einen gültigen Steckbrief (Arcade, 20–45 s, Stick + A)', () => {
    expect(checkInfo(info)).toEqual({ ok: true });
    expect(info.category).toBe('arcade');
    expect(info.physics).toBe(false);
    expect(info.durationMs).toBeGreaterThanOrEqual(20_000);
    expect(info.durationMs).toBeLessThanOrEqual(45_000);
    expect(info.controls).toEqual({ joystick: 'Laufen', a: 'Hechtsprung', b: null });
  });

  it('ist im Katalog, in der Rotation und als Modul registriert', () => {
    expect(MINIGAME_INFOS).toContain(info);
    expect(ROTATION).toContain(info.id);
    expect(getMinigameModule(info.id)).toBe(sockenregen);
  });
});

describe('Sockenregen: headless mit Skript-Bots', () => {
  it.each([2, 3, 4])(
    'läuft mit %i Spielern bis zum Zeitlimit, wertet gültig und räumt auf',
    async (players) => {
      const run = await runMinigameHeadless(sockenregen, {
        players,
        seed: 42 + players,
        script: botScript(players),
      });
      const outcome = run.outcome;
      expect(outcome?.forced).toBe(false);
      expect(outcome?.elapsedMs).toBeGreaterThanOrEqual(info.durationMs);
      expect(outcome?.elapsedMs).toBeLessThanOrEqual(info.durationMs + STEP_MS);
      const result = outcome?.result;
      if (!result) throw new Error('kein Ergebnis');
      const slots = ([1, 2, 3, 4] as const).slice(0, players);
      expect(checkResult(result, { minigameId: info.id, slots, scoring: 'higher' })).toEqual({
        ok: true,
      });
      expect(result.placements.map((entry) => entry.slot).sort()).toEqual(slots);
      expect(Math.max(...result.placements.map((entry) => entry.score))).toBeGreaterThan(0);
      expect(result.highlights?.length).toBeGreaterThan(0);
      expect(run.residue).toEqual(EMPTY_RESIDUE);
      expect(run.animations.get(1)).toContain('run');
      expect(run.animations.get(1)).toContain('jump');
      const winners = result.placements.filter((entry) => entry.place === 1);
      for (const entry of result.placements) {
        expect(run.animations.get(entry.slot)?.at(-1)).toBe(entry.place === 1 ? 'cheer' : 'sad');
      }
      expect(winners.length).toBeGreaterThan(0);
      expect(run.fx.sounds[0]).toBe('go');
      expect(run.fx.sounds).toContain('coin');
      expect(run.fx.sounds.at(-1)).toBe('win');
      expect(run.fx.bursts.some((burst) => burst.id === 'confetti')).toBe(true);
    },
  );

  it('Gleichstand: ohne Würfe (sehr kurzes Zeitlimit) teilen sich alle Platz 1', async () => {
    const run = await runMinigameHeadless(sockenregen, { players: 4, timeLimitMs: 1_000 });
    expect(run.outcome?.forced).toBe(false);
    expect(run.outcome?.result.placements.map((entry) => entry.place)).toEqual([1, 1, 1, 1]);
    expect(run.outcome?.result.highlights).toBeUndefined();
    expect(run.residue).toEqual(EMPTY_RESIDUE);
  });

  it('endet bei verkürztem Zeitlimit (Host neu geladen) genau dort', async () => {
    const run = await runMinigameHeadless(sockenregen, {
      players: 2,
      timeLimitMs: 12_000,
      script: botScript(2),
    });
    expect(run.outcome?.forced).toBe(false);
    expect(run.outcome?.elapsedMs).toBeGreaterThanOrEqual(12_000);
    expect(run.outcome?.elapsedMs).toBeLessThanOrEqual(12_000 + STEP_MS);
  });

  it('gleicher Seed und gleiches Skript → gleiches Ergebnis', async () => {
    const play = async (seed: number) => {
      const run = await runMinigameHeadless(sockenregen, {
        players: 4,
        seed,
        script: botScript(4),
      });
      return { result: run.outcome?.result, sounds: run.fx.sounds, shakes: run.fx.shakes };
    };
    const a = await play(7);
    expect(await play(7)).toEqual(a);
    expect((await play(8)).sounds).not.toEqual(a.sounds);
  });

  it('getrennter Spieler bricht nichts: Figur steht, Spiel läuft weiter', async () => {
    const huds: MinigameHud[] = [];
    const run = await runMinigameHeadless(sockenregen, {
      players: 3,
      seed: 5,
      script: (elapsedMs, send, runner) => {
        botScript(3)(elapsedMs, send, runner);
        if (Math.round(elapsedMs / STEP_MS) === stepsFor(5)) runner.setConnected(2, false);
        if (Math.round(elapsedMs / STEP_MS) === stepsFor(20)) runner.setConnected(2, true);
        if (Math.round(elapsedMs / STEP_MS) % 60 === 0) huds.push(runner.hud());
      },
    });
    expect(run.outcome?.forced).toBe(false);
    expect(run.outcome?.result.placements).toHaveLength(3);
    expect(run.residue).toEqual(EMPTY_RESIDUE);
    // Während der Trennung stand Slot 2 still (idle/fall), danach lief er wieder.
    const anims = run.animations.get(2) ?? [];
    expect(anims).toContain('idle');
    expect(anims.lastIndexOf('run')).toBeGreaterThan(anims.indexOf('idle'));
    expect(huds.at(-1)?.remainingMs).toBeLessThan(huds[0]?.remainingMs ?? 0);
  });

  it('HUD: Startbanner, Schleudergang, Restzeit und „geplättet“', async () => {
    const huds: { at: number; hud: MinigameHud }[] = [];
    const run = await runMinigameHeadless(sockenregen, {
      players: 4,
      seed: 9,
      script: (elapsedMs, send, runner) => {
        botScript(4)(elapsedMs, send, runner);
        huds.push({ at: elapsedMs, hud: runner.hud() });
      },
    });
    expect(huds.find((entry) => entry.at === 0)?.hud.remainingMs).toBe(info.durationMs);
    expect(huds.find((entry) => entry.at > 500 && entry.at < 1000)?.hud.banner).toBe(
      'Fangt die Socken!',
    );
    expect(huds.find((entry) => entry.at > 5_000 && entry.at < 6_000)?.hud.banner).toBeUndefined();
    expect(huds.find((entry) => entry.at > 25_000)?.hud.banner).toBe('Schleudergang!');
    const statuses = huds.flatMap((entry) => entry.hud.scores.map((score) => score.status));
    expect(statuses).toContain('geplättet');
    for (const entry of huds) {
      for (const score of entry.hud.scores) {
        expect((score.status ?? '').length).toBeLessThanOrEqual(16);
      }
      expect((entry.hud.banner ?? '').length).toBeLessThanOrEqual(32);
    }
    // Geplättete Figuren spielen „fall“.
    expect([...run.animations.values()].some((played) => played.includes('fall'))).toBe(true);
    expect(run.fx.sounds).toContain('hit');
    expect(run.fx.shakes.length).toBeGreaterThan(0);
  });

  it('dispose ist idempotent, auch ohne prepare', () => {
    const game = sockenregen.create();
    expect(() => {
      game.dispose();
      game.dispose();
    }).not.toThrow();
    expect(game.getResult()).toBeNull();
    expect(game.getHud().remainingMs).toBe(info.durationMs);
  });
});
