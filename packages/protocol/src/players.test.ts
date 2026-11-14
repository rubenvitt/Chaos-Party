import { describe, expect, it } from 'vitest';
import { PLAYER_SLOTS, SLOT_NUMBERS } from './players.ts';
import { ColorSchema, PlayerLabelSchema, SlotSchema } from './schemas.ts';

describe('PLAYER_SLOTS', () => {
  it('hat für jeden Slot gültige, unterschiedliche Farbe, Bezeichnung und Symbol', () => {
    expect(SLOT_NUMBERS).toEqual([1, 2, 3, 4]);
    const styles = SLOT_NUMBERS.map((slot) => PLAYER_SLOTS[slot]);
    for (const [index, style] of styles.entries()) {
      expect(SlotSchema.safeParse(SLOT_NUMBERS[index]).success).toBe(true);
      expect(ColorSchema.safeParse(style.color).success).toBe(true);
      expect(PlayerLabelSchema.safeParse(style.label).success).toBe(true);
    }
    for (const key of ['color', 'label', 'symbol'] as const) {
      expect(new Set(styles.map((style) => style[key])).size).toBe(4);
    }
  });
});
