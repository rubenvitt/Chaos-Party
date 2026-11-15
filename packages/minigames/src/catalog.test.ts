/**
 * Prüfungen für **jedes** registrierte Minispiel (CHAOS-34): Katalog stimmig, Lebenszyklus
 * mit 2–4 Spielern und Zufalls-Bots, gültiges Ergebnis ohne Rückfallwertung, Ende
 * spätestens am Zeitlimit, Szene nach `dispose` leer (keine Meshes, Materialien, Texturen,
 * Beobachter, Physik-Körper), getrennter Spieler bricht nichts.
 *
 * Neue Minispiele werden hier automatisch mitgeprüft.
 */
import { checkInfo, CHARACTER_IDS, type Slot } from '@chaos-party/minigame-sdk';
import { FIXED_STEP_SECONDS } from '@chaos-party/minigame-sdk/babylon';
import {
  EMPTY_RESIDUE,
  runMinigameHeadless,
  type InputScript,
} from '@chaos-party/minigame-sdk/testing';
import { createMinigameRng } from '@chaos-party/minigame-sdk';
import { describe, expect, it } from 'vitest';
import { getMinigameInfo, MINIGAME_INFOS, ROTATION, rotationInfos } from './catalog.ts';
import { getMinigameModule, MINIGAME_MODULES } from './index.ts';

/** Zufalls-Bots: wechseln alle ~0,4 s Stick und Knöpfe (seeded). */
function randomBots(seed: number, slots: readonly Slot[]): InputScript {
  const rng = createMinigameRng(seed);
  const held = new Map<Slot, Set<'a' | 'b'>>();
  return (elapsedMs, send) => {
    const step = Math.round(elapsedMs / (FIXED_STEP_SECONDS * 1000));
    if (step % 24 !== 0) return;
    for (const slot of slots) {
      const angle = rng.next() * Math.PI * 2;
      const length = rng.next() < 0.2 ? 0 : 1;
      send(slot, { type: 'move', x: Math.cos(angle) * length, y: Math.sin(angle) * length });
      const buttons = held.get(slot) ?? new Set();
      for (const button of ['a', 'b'] as const) {
        if (buttons.has(button)) {
          send(slot, { type: 'release', button });
          buttons.delete(button);
        } else if (rng.next() < 0.5) {
          send(slot, { type: 'press', button });
          buttons.add(button);
        }
      }
      held.set(slot, buttons);
    }
  };
}

describe('Minispiel-Katalog', () => {
  it('Katalog und Module passen zusammen, Steckbriefe sind gültig', () => {
    expect(MINIGAME_MODULES.map((m) => m.info.id)).toEqual(MINIGAME_INFOS.map((i) => i.id));
    for (const module of MINIGAME_MODULES) {
      expect(getMinigameInfo(module.info.id)).toBe(module.info);
      expect(checkInfo(module.info)).toEqual({ ok: true });
    }
    expect(new Set(MINIGAME_INFOS.map((info) => info.id)).size).toBe(MINIGAME_INFOS.length);
    for (const id of ROTATION) expect(getMinigameModule(id)).toBeDefined();
    expect(rotationInfos().length).toBeGreaterThan(0);
    expect(CHARACTER_IDS).toHaveLength(4);
  });
});

describe.each(MINIGAME_MODULES.map((module) => [module.info.id, module] as const))(
  'Minispiel %s (Vertrag, CHAOS-34)',
  (_id, module) => {
    it.each([2, 3, 4])(
      'läuft mit %i Spielern und Zufalls-Bots bis zum gültigen Ergebnis und räumt auf',
      async (players) => {
        const slots = ([1, 2, 3, 4] as const).slice(0, players);
        const run = await runMinigameHeadless(module, {
          players,
          seed: 1000 + players,
          script: randomBots(players, slots),
        });
        expect(run.outcome).not.toBeNull();
        expect(run.outcome?.forced).toBe(false);
        expect(run.outcome?.elapsedMs).toBeLessThanOrEqual(module.info.durationMs + 50);
        expect(run.outcome?.result.placements.map((p) => p.slot).sort()).toEqual([...slots]);
        expect(run.residue).toEqual(EMPTY_RESIDUE);
      },
    );

    it('bleibt stabil, wenn ein Spieler mitten im Spiel die Verbindung verliert', async () => {
      const run = await runMinigameHeadless(module, {
        players: 3,
        seed: 77,
        script: (elapsedMs, send, runner) => {
          randomBots(5, [1, 2, 3])(elapsedMs, send, runner);
          if (Math.abs(elapsedMs - 3000) < 10) runner.setConnected(2, false);
          if (Math.abs(elapsedMs - 6000) < 10) runner.setConnected(2, true);
        },
      });
      expect(run.outcome?.forced).toBe(false);
      expect(run.outcome?.result.placements).toHaveLength(3);
      expect(run.residue).toEqual(EMPTY_RESIDUE);
    });
  },
);
