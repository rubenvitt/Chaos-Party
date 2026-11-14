import { describe, expect, it } from 'vitest';
import { PLAYER_SLOTS } from '@chaos-party/protocol';
import {
  isValidJoinCode,
  normalizeJoinCode,
  parseLaunchParams,
  withJoinCode,
  withSeats,
} from './config.ts';
import { contrastRatio, readableTextColor } from './ui/color.ts';

describe('parseLaunchParams', () => {
  it('liest einen gültigen Code aus der URL (auch klein geschrieben)', () => {
    expect(parseLaunchParams('?code=ABCD')).toEqual({ joinCode: 'ABCD', seats: 1 });
    expect(parseLaunchParams('?code=ab12').joinCode).toBe('AB12');
    expect(parseLaunchParams('?code=%20ABCD%20').joinCode).toBe('ABCD');
  });

  it('ohne oder mit ungültigem Code → Code-Eingabe', () => {
    expect(parseLaunchParams('').joinCode).toBeNull();
    expect(parseLaunchParams('?code=').joinCode).toBeNull();
    expect(parseLaunchParams('?code=AB').joinCode).toBeNull();
    expect(parseLaunchParams('?code=AB-CD').joinCode).toBeNull();
    expect(parseLaunchParams('?code=ABCDEFGHI').joinCode).toBeNull();
    expect(parseLaunchParams('?code=<script>').joinCode).toBeNull();
  });

  it('ohne seats/mode: iPhone-Modus mit einem Platz', () => {
    expect(parseLaunchParams('?code=ABCD').seats).toBe(1);
    expect(parseLaunchParams('').seats).toBe(1);
  });

  it('seats=2–4 schaltet das geteilte iPad ein (CHAOS-13)', () => {
    expect(parseLaunchParams('?code=ABCD&seats=2')).toEqual({ joinCode: 'ABCD', seats: 2 });
    expect(parseLaunchParams('?seats=3').seats).toBe(3);
    expect(parseLaunchParams('?seats=4').seats).toBe(4);
    expect(parseLaunchParams('?seats=1').seats).toBe(1);
  });

  it('mode=ipad ohne seats bedeutet zwei Plätze', () => {
    expect(parseLaunchParams('?mode=ipad').seats).toBe(2);
    expect(parseLaunchParams('?mode=IPAD&seats=4').seats).toBe(4);
    expect(parseLaunchParams('?mode=ipad&seats=9').seats).toBe(2);
    expect(parseLaunchParams('?mode=phone').seats).toBe(1);
  });

  it('ungültige seats fallen auf den iPhone-Modus zurück', () => {
    for (const bad of ['0', '5', '2.5', '-2', 'zwei', '', '22', '1e1']) {
      expect(parseLaunchParams(`?seats=${bad}`).seats).toBe(1);
    }
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

  it('setzt die Platzzahl, ersetzt mode und begrenzt auf 1–4', () => {
    expect(withSeats('', 2)).toBe('?seats=2');
    expect(withSeats('?code=ABCD&mode=ipad', 1)).toBe('?code=ABCD&seats=1');
    expect(withSeats('?seats=2', 9)).toBe('?seats=4');
    expect(withSeats('?seats=2', 0)).toBe('?seats=1');
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
