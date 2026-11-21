import { RUMMELPLATZ } from '@chaos-party/game-core';
import { createHeadlessScene } from '@chaos-party/minigame-sdk/testing';
import { describe, expect, it } from 'vitest';
import { StaticBatch } from '../nature/geometry.ts';
import { NatureMaterials } from '../nature/materials.ts';
import { createTerrain } from '../nature/terrain.ts';
import { buildFairground } from './fairground.ts';
import { boardEdges, boardIsland } from './natureBoard.ts';
import { CAROUSEL_NODE, WHEEL_NODE } from './rides.ts';

describe('Rummelplatz-Kulisse (CHAOS-199, NullEngine)', () => {
  const { scene } = createHeadlessScene();
  const board = RUMMELPLATZ;
  const edges = boardEdges(board);
  const terrain = createTerrain({
    shape: boardIsland(board),
    flats: [
      ...board.spaces.map((s) => ({ x: s.position.x, z: s.position.z, radius: 0.95 })),
      ...edges.map(([a, b]) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, radius: 0.5 })),
    ],
  });
  const statics = new StaticBatch('test');
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const fair = buildFairground(scene, board, statics, {
    mats: new NatureMaterials(scene, { reflections: false, detail: false }),
    terrain,
    rnd,
  });
  statics.flush();

  it('baut Karussell und Riesenrad als benannte Drehteile (Namen für den Apple-Host)', () => {
    expect(fair.carousel?.name).toBe(CAROUSEL_NODE);
    expect(fair.wheel.name).toBe(WHEEL_NODE);
    const hub = board.spaces.find((s) => s.id === board.rotations?.[0]?.space);
    expect(fair.carousel?.position.x).toBeCloseTo(hub?.position.x ?? NaN);
    expect(fair.carousel?.position.z).toBeCloseTo(hub?.position.z ?? NaN);
    expect(fair.carousel?.getChildMeshes().length).toBeGreaterThan(0);
    expect(fair.wheel.getChildMeshes().length).toBeGreaterThan(0);
  });
});
