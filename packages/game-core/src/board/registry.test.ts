import { describe, expect, it } from 'vitest';
import {
  BOARD_REGISTRY,
  BOARDS,
  DEFAULT_BOARD,
  getBoardInfo,
  MAX_BOARD_TAGLINE_LENGTH,
  randomBoard,
  validateBoard,
} from './index.ts';

describe('Brett-Register (CHAOS-197)', () => {
  it('enthält das Standardbrett und jedes Brett genau einmal', () => {
    const ids = BOARD_REGISTRY.map((info) => info.id);
    expect(ids).toContain(DEFAULT_BOARD.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('jeder Eintrag passt zu seinem Brett und ist gültig', () => {
    for (const info of BOARD_REGISTRY) {
      expect(info.board.id).toBe(info.id);
      // Gleiches Muster wie `SpaceIdSchema` im Protokoll: sonst wäre das Brett nicht wählbar.
      expect(info.id).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(info.board.name.length).toBeGreaterThan(0);
      expect(info.tagline.length).toBeGreaterThan(0);
      expect(info.tagline.length).toBeLessThanOrEqual(MAX_BOARD_TAGLINE_LENGTH);
      expect(info.recommendedRounds).toBeGreaterThanOrEqual(1);
      expect(info.recommendedRounds).toBeLessThanOrEqual(20);
      expect(validateBoard(info.board)).toEqual({ ok: true });
    }
  });

  it('BOARDS und getBoardInfo folgen dem Register', () => {
    expect(Object.keys(BOARDS)).toEqual(BOARD_REGISTRY.map((info) => info.id));
    expect(getBoardInfo('wackelwald')?.board).toBe(DEFAULT_BOARD);
    expect(getBoardInfo('gibt-es-nicht')).toBeUndefined();
  });

  it('randomBoard ist je Seed fest und liefert nur Bretter aus dem Register', () => {
    for (const seed of [0, 1, 42, 2 ** 31 - 1, 0xffff_ffff]) {
      const board = randomBoard(seed);
      expect(randomBoard(seed)).toBe(board);
      expect(BOARD_REGISTRY.map((info) => info.board)).toContain(board);
    }
  });
});
