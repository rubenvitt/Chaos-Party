import { createMinigameRng } from '@chaos-party/minigame-sdk';
import { describe, expect, it } from 'vitest';
import {
  approachAngle,
  bannerFor,
  buildHighlights,
  clampStick,
  followTilt,
  inZone,
  leaderOf,
  nextZone,
  PAWN,
  spoonSpeedAt,
  statusFor,
  steeringDeltaV,
  targetTilt,
  TUNING,
  wobbleAt,
  yawFor,
  zonePoints,
  type PlayerStats,
} from './logic.ts';

describe('Pudding-Gerangel: Neigung', () => {
  it('senkt die Seite, auf der die Figuren stehen', () => {
    const tilt = targetTilt([{ x: 0, z: 5 }], 0, 0, 0);
    expect(tilt.pitch).toBeGreaterThan(0); // positive Neigung um X senkt +Z
    expect(tilt.roll).toBeCloseTo(0);
    const side = targetTilt([{ x: 5, z: 0 }], 0, 0, 0);
    expect(side.roll).toBeLessThan(0); // negative Neigung um Z senkt +X
  });

  it('gleicht sich bei gegenüberstehenden Figuren aus und bleibt unter dem Maximum', () => {
    const even = targetTilt(
      [
        { x: 4, z: 0 },
        { x: -4, z: 0 },
      ],
      0,
      0,
      0,
    );
    expect(Math.hypot(even.pitch, even.roll)).toBeCloseTo(0);
    const crowd = targetTilt(
      Array.from({ length: 4 }, () => ({ x: 6, z: 6 })),
      3,
      TUNING.wobbleEnd,
      1,
    );
    expect(Math.hypot(crowd.pitch, crowd.roll)).toBeLessThanOrEqual(TUNING.maxTilt + 1e-9);
  });

  it('folgt dem Ziel gedämpft und wackelt mit der Zeit stärker', () => {
    const next = followTilt({ pitch: 0, roll: 0 }, { pitch: 0.2, roll: -0.2 }, 1 / 60);
    expect(next.pitch).toBeGreaterThan(0);
    expect(next.pitch).toBeLessThan(0.2);
    expect(wobbleAt(0)).toBe(TUNING.wobbleStart);
    expect(wobbleAt(1)).toBe(TUNING.wobbleEnd);
    expect(wobbleAt(2)).toBe(TUNING.wobbleEnd);
    expect(spoonSpeedAt(0.5)).toBeGreaterThan(TUNING.spoonSpeedStart);
    expect(spoonSpeedAt(0.5)).toBeLessThan(TUNING.spoonSpeedEnd);
  });
});

describe('Pudding-Gerangel: Kirschfleck und Punkte', () => {
  it('setzt den Fleck in den Ring und mindestens 60° vom alten weg (deterministisch)', () => {
    const rng = createMinigameRng(42);
    const again = createMinigameRng(42);
    let previous = nextZone(rng, null);
    expect(nextZone(again, null)).toEqual(previous);
    for (let index = 0; index < 200; index++) {
      const zone = nextZone(rng, previous);
      const r = Math.hypot(zone.x, zone.z);
      expect(r).toBeGreaterThanOrEqual(TUNING.zoneMinR - 1e-9);
      expect(r).toBeLessThanOrEqual(TUNING.zoneMaxR + 1e-9);
      // Ganz drauf bleiben kann man nach dem Sprung nicht.
      const between = Math.abs(
        Math.atan2(
          Math.sin(Math.atan2(zone.z, zone.x) - Math.atan2(previous.z, previous.x)),
          Math.cos(Math.atan2(zone.z, zone.x) - Math.atan2(previous.z, previous.x)),
        ),
      );
      expect(between).toBeGreaterThanOrEqual(Math.PI / 3 - 1e-9);
      previous = zone;
    }
  });

  it('zählt nur im Fleck und rundet Punkte ab', () => {
    expect(inZone({ x: 1, z: 1 }, { x: 1.5, z: 1 })).toBe(true);
    expect(inZone({ x: 1, z: 1 }, { x: 1 + TUNING.zoneRadius, z: 1 })).toBe(false);
    expect(inZone({ x: 0, z: 0 }, null)).toBe(false);
    expect(zonePoints(0)).toBe(0);
    expect(zonePoints(249)).toBe(0);
    expect(zonePoints(1000)).toBe(TUNING.zoneRate);
    expect(zonePoints(-5)).toBe(0);
  });

  it('vergibt die Krone nur bei alleiniger Führung über 0', () => {
    expect(leaderOf([])).toBeNull();
    expect(
      leaderOf([
        { slot: 1, score: 0 },
        { slot: 2, score: 0 },
      ]),
    ).toBeNull();
    expect(
      leaderOf([
        { slot: 1, score: 5 },
        { slot: 2, score: 5 },
        { slot: 3, score: 1 },
      ]),
    ).toBeNull();
    expect(
      leaderOf([
        { slot: 1, score: 5 },
        { slot: 2, score: 9 },
      ]),
    ).toBe(2);
  });
});

describe('Pudding-Gerangel: Bewegung', () => {
  it('lenkt Richtung Stick und begrenzt die Beschleunigung', () => {
    const dv = steeringDeltaV({ x: 0, z: 0 }, { x: 0, y: 1 }, 1 / 60);
    expect(dv.z).toBeGreaterThan(0);
    expect(Math.hypot(dv.x, dv.z)).toBeLessThanOrEqual(PAWN.maxAcceleration / 60 + 1e-9);
    const still = steeringDeltaV({ x: 0, z: 0 }, { x: 0, y: 0 }, 1 / 60);
    expect(still).toEqual({ x: 0, z: 0 });
  });

  it('kürzt Sticks und ersetzt Unsinn', () => {
    expect(clampStick(3, 4)).toEqual({ x: 0.6, y: 0.8 });
    expect(clampStick(Number.NaN, Infinity)).toEqual({ x: 0, y: 0 });
    expect(clampStick(0.2, -0.3)).toEqual({ x: 0.2, y: -0.3 });
  });

  it('dreht auf kürzestem Weg und schaut in Laufrichtung', () => {
    expect(yawFor(0, 1)).toBeCloseTo(0);
    expect(yawFor(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(approachAngle(3, -3, 1)).toBeCloseTo(-3); // über ±π, nicht zurück
    expect(approachAngle(0, 2, 0.5)).toBeCloseTo(0.5);
  });
});

describe('Pudding-Gerangel: Anzeige', () => {
  const stats = (patch: Partial<PlayerStats>[]): PlayerStats[] =>
    patch.map((entry, index) => ({
      slot: (index + 1) as 1 | 2 | 3 | 4,
      name: `Spieler ${index + 1}`,
      score: 0,
      falls: 0,
      knockoffs: 0,
      zoneMs: 0,
      ...entry,
    }));

  it('baut höchstens 4 kurze Höhepunkte mit Namen', () => {
    const lines = buildHighlights(
      stats([{ knockoffs: 3, zoneMs: 12_300 }, { falls: 4 }, { knockoffs: 1, falls: 1 }]),
      2,
    );
    expect(lines).toEqual([
      'Spieler 1 schubste 3-mal jemanden in die Sahne',
      'Spieler 2 plumpste 4-mal vom Pudding',
      'Spieler 1 saß 12 s auf der Kirsche',
      'Der Rührlöffel fegte 2-mal jemanden vom Teller',
    ]);
    expect(buildHighlights(stats([{}, {}]), 0)).toEqual([]);
    expect(buildHighlights(stats([{ zoneMs: 2_000 }]), 0)).toEqual([]);
    const long = buildHighlights(stats([{ knockoffs: 1, name: 'X'.repeat(80) }]), 1);
    expect(long.every((line) => line.length > 0 && line.length <= 64)).toBe(true);
    expect(buildHighlights(stats([{ knockoffs: 1 }]), 1)).toEqual([
      'Spieler 1 schubste jemanden in die Sahne',
      'Der Rührlöffel fegte einmal jemanden vom Teller',
    ]);
  });

  it('zeigt Zustand und Banner kurz genug', () => {
    expect(statusFor({ out: true, inZone: true, leader: true })).toBe('Plumps!');
    expect(statusFor({ out: false, inZone: true, leader: true })).toBe('Kirsche!');
    expect(statusFor({ out: false, inZone: false, leader: true })).toBe('Wackelkrone');
    expect(statusFor({ out: false, inZone: false, leader: false })).toBeUndefined();
    const banners = [
      bannerFor(26_000, 30_000, 0),
      bannerFor(15_200, 30_000, 0),
      bannerFor(4_500, 30_000, 4_000),
    ];
    expect(banners).toEqual([
      'Letzte 5 Sekunden!',
      'Der Rührlöffel dreht auf!',
      'Die Kirsche hüpft!',
    ]);
    expect(banners.every((text) => (text ?? '').length <= 32)).toBe(true);
    expect(bannerFor(2_000, 30_000, 0)).toBeUndefined();
    expect(bannerFor(30_000, 30_000, 0)).toBeUndefined();
  });
});
