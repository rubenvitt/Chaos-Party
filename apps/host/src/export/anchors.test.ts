import { DEFAULT_BOARD, type BoardDefinition } from '@chaos-party/game-core';
import { describe, expect, it } from 'vitest';
import { fieldAnchorName, fieldAnchors } from './anchors.ts';

describe('Feld-Anker (CHAOS-140)', () => {
  it('schreibt IDs in USD-taugliche Namen um', () => {
    expect(fieldAnchorName('s01')).toBe('feld_s01');
    expect(fieldAnchorName('gabel-a.2')).toBe('feld_gabel_a_2');
  });

  it('liefert für jedes Feld des Standardbretts genau einen gültigen Anker', () => {
    const anchors = fieldAnchors(DEFAULT_BOARD, 0.3);
    expect(anchors).toHaveLength(DEFAULT_BOARD.spaces.length);
    expect(new Set(anchors.map((a) => a.anchor)).size).toBe(anchors.length);
    for (const a of anchors) expect(a.anchor).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    const first = DEFAULT_BOARD.spaces[0];
    expect(anchors[0]).toMatchObject({
      id: first?.id,
      next: first?.next,
      position: { x: first?.position.x, y: 0.3, z: first?.position.z },
    });
  });

  it('wirft, wenn zwei Felder nach dem Umschreiben gleich heißen', () => {
    const board: BoardDefinition = {
      id: 'test',
      name: 'Test',
      start: 'a-1',
      spaces: [
        { id: 'a-1', kind: 'start', position: { x: 0, z: 0 }, next: ['a_1'] },
        { id: 'a_1', kind: 'coins-plus', position: { x: 1, z: 0 }, next: ['a-1'] },
      ],
    };
    expect(() => fieldAnchors(board, 0)).toThrow(/doppelt/);
  });
});
