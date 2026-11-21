/**
 * Requisiten-Katalog (CHAOS-88): deckt die Pilotwelle ab und passt zum Blender-Generator.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MINIGAME_PROP_SETS,
  PROP_IDS,
  PROP_RUNTIME,
  PROP_SET_IDS,
  PROP_SETS,
  minigameProps,
  propAssetId,
  propModelPath,
} from './props.ts';

const blenderDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'blender');

/** Pilotwelle aus `docs/minigames/katalog.md` (★, CHAOS-91). */
const PILOT = ['MG-001', 'MG-011', 'MG-023', 'MG-033', 'MG-045', 'MG-101', 'MG-111', 'MG-121'];

describe('Requisiten-Katalog', () => {
  it('jedes Pilot-Spiel hat Requisiten aus seinem Familien-Set', () => {
    for (const game of PILOT) {
      const sets = MINIGAME_PROP_SETS[game];
      expect(sets, game).toBeDefined();
      expect(
        sets?.some((set) => PROP_SETS[set].family !== null),
        game,
      ).toBe(true);
      expect(minigameProps(game).length, game).toBeGreaterThan(0);
    }
  });

  it('je Familie höchstens ein Set, jedes Requisit in genau einem Set', () => {
    const families = PROP_SET_IDS.map((set) => PROP_SETS[set].family).filter((f) => f !== null);
    expect(new Set(families).size).toBe(families.length);
    expect(new Set(PROP_IDS).size).toBe(PROP_IDS.length);
  });

  it('Laufzeit-Materialien nur an Requisiten aus dem Katalog', () => {
    for (const id of Object.keys(PROP_RUNTIME)) expect(PROP_IDS).toContain(id);
  });

  it('Katalog = Liste PROPS im Blender-Generator', async () => {
    const source = await readFile(join(blenderDir, 'requisiten.py'), 'utf8');
    const block = /^PROPS:[^\n]*\{([\s\S]*?)\n\}/m.exec(source)?.[1] ?? '';
    const generated = [...block.matchAll(/"([a-z-]+)":/g)].map((m) => m[1]);
    expect([...generated].sort()).toEqual([...PROP_IDS].sort());
  });

  it('ids und Pfade', () => {
    expect(propAssetId('toaster')).toBe('requisit-toaster');
    expect(propModelPath('toaster')).toBe('models/props/toaster.glb');
    expect(minigameProps('MG-999')).toEqual([]);
    // Ein Requisit, das in zwei Sets eines Spiels stünde, zählt einmal.
    expect(new Set(minigameProps('MG-001')).size).toBe(minigameProps('MG-001').length);
  });
});
