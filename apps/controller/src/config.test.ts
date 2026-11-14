import { describe, expect, it } from 'vitest';
import { PLAYER_SLOTS } from '@chaos-party/protocol';
import { isValidJoinCode, normalizeJoinCode, parseLaunchParams, withJoinCode } from './config.ts';
import { contrastRatio, readableTextColor } from './ui/color.ts';

describe('parseLaunchParams', () => {
  it('liest einen gültigen Code aus der URL (auch klein geschrieben)', () => {
    expect(parseLaunchParams('?code=ABCD')).toEqual({ joinCode: 'ABCD', seats: 1 });
    expect(parseLaunchParams('?code=ab12')).toEqual({ joinCode: 'AB12', seats: 1 });
    expect(parseLaunchParams('?code=%20ABCD%20')).toEqual({ joinCode: 'ABCD', seats: 1 });
  });

  it('ohne oder mit ungültigem Code → Code-Eingabe', () => {
    expect(parseLaunchParams('').joinCode).toBeNull();
    expect(parseLaunchParams('?code=').joinCode).toBeNull();
    expect(parseLaunchParams('?code=AB').joinCode).toBeNull();
    expect(parseLaunchParams('?code=AB-CD').joinCode).toBeNull();
    expect(parseLaunchParams('?code=ABCDEFGHI').joinCode).toBeNull();
    expect(parseLaunchParams('?code=<script>').joinCode).toBeNull();
  });

  it('iPhone-Modus hat immer einen Platz', () => {
    expect(parseLaunchParams('?code=ABCD&seats=3').seats).toBe(1);
  });
});

describe('normalizeJoinCode / withJoinCode', () => {
  it('macht Eingaben großgeschrieben und filtert Fremdzeichen', () => {
    expect(normalizeJoinCode('ab c-d', 4)).toBe('ABCD');
    expect(normalizeJoinCode('äöü12345', 4)).toBe('1234');
    expect(isValidJoinCode('ABCD')).toBe(true);
    expect(isValidJoinCode('ABC')).toBe(false);
  });

  it('setzt den Code und behält andere Parameter', () => {
    expect(withJoinCode('', 'ABCD')).toBe('?code=ABCD');
    expect(withJoinCode('?mode=ipad&code=OLD1', 'ABCD')).toBe('?mode=ipad&code=ABCD');
  });
});

describe('readableTextColor', () => {
  it('wählt für jede Spielerfarbe die Textfarbe mit mindestens 3:1 Kontrast', () => {
    for (const slot of [1, 2, 3, 4] as const) {
      const { color } = PLAYER_SLOTS[slot];
      expect(contrastRatio(color, readableTextColor(color))).toBeGreaterThanOrEqual(3);
    }
    expect(readableTextColor('#0072B2')).toBe('#ffffff');
    expect(readableTextColor('#E69F00')).toBe('#1b1530');
  });
});
