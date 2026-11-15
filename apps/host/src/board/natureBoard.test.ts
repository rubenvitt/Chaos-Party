import { DEFAULT_BOARD } from '@chaos-party/game-core';
import { describe, expect, it } from 'vitest';
import { createTerrain } from '../nature/terrain.ts';
import { boardEdges, boardIsland, KIND_STYLES } from './natureBoard.ts';

describe('Natur-Brett (CHAOS-62)', () => {
  const board = DEFAULT_BOARD;
  const shape = boardIsland(board);
  const edges = boardEdges(board);
  const terrain = createTerrain({
    shape,
    flats: [
      ...board.spaces.map((s) => ({ x: s.position.x, z: s.position.z, radius: 0.95 })),
      ...edges.map(([a, b]) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, radius: 0.5 })),
    ],
  });

  it('jedes Feld liegt mit Abstand zum Abhang auf der Insel und genau auf Höhe 0', () => {
    for (const space of board.spaces) {
      const { x, z } = space.position;
      expect(terrain.inside(x, z, 2), space.id).toBe(true);
      expect(terrain.height(x, z), space.id).toBe(0);
    }
  });

  it('jede Verbindung ist ein Weg, Gabeln haben zwei', () => {
    const links = board.spaces.reduce((n, s) => n + s.next.length, 0);
    expect(edges).toHaveLength(links);
  });

  it('jeder Feldtyp hat Farbe und Form (Farbe allein trägt keine Information)', () => {
    const shapes = new Set(
      Object.values(KIND_STYLES).map((s) => `${String(s.tessellation)}-${s.rotation.toFixed(2)}`),
    );
    // Plus und Minus teilen die Kreisform, unterscheiden sich aber im Symbol.
    expect(shapes.size).toBeGreaterThanOrEqual(4);
    for (const style of Object.values(KIND_STYLES)) expect(style.paint).toMatch(/^#[0-9a-f]{6}$/);
  });
});
