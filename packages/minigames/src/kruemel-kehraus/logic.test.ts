/**
 * Reine Logik von Krümel-Kehraus: Geometrie der Ecken und Löcher, Größen (Krümel passen unter
 * den Sturz, Figuren nicht), Fallpunkte, Führung, Texte für HUD und Ergebnis.
 */
import { checkInfo, createMinigameRng } from '@chaos-party/minigame-sdk';
import { describe, expect, it } from 'vitest';
import { KRUEMEL_KEHRAUS_INFO } from './info.ts';
import {
  allCorners,
  bannerFor,
  beyondCut,
  buildHighlights,
  cornersFor,
  dropAreaFor,
  dropPoint,
  hasBackHole,
  MOUTH_WIDTH,
  holeOf,
  inRain,
  KRUEMEL_RULES,
  leaderOf,
  PAWN,
  rainPoints,
  spawnFor,
  statusFor,
  TUNING,
  type PlayerStats,
} from './logic.ts';

describe('Krümel-Kehraus: Steckbrief', () => {
  it('ist gültig: Physik, 30 s, Stick + Rempeln, höchstens 3 kurze Zeilen', () => {
    expect(checkInfo(KRUEMEL_KEHRAUS_INFO)).toEqual({ ok: true });
    expect(KRUEMEL_KEHRAUS_INFO.category).toBe('physics');
    expect(KRUEMEL_KEHRAUS_INFO.physics).toBe(true);
    expect(KRUEMEL_KEHRAUS_INFO.controls).toEqual({ joystick: 'Laufen', a: 'Rempeln', b: null });
    for (const line of KRUEMEL_KEHRAUS_INFO.instructions)
      expect(line.length).toBeLessThanOrEqual(64);
  });
});

describe('Krümel-Kehraus: Ecken und Mauslöcher', () => {
  it('zwei Personen spielen diagonal, drei vorn + hinten in der Mitte, vier in allen Ecken', () => {
    const two = cornersFor(2);
    expect(two.map((c) => [c.sx, c.sz])).toEqual([
      [-1, -1],
      [1, 1],
    ]);
    // Drei Personen: Spiegelbilder vorn, das dritte Loch als Kerbe mitten in der Rückwand.
    expect(cornersFor(3).map((c) => [c.sx, c.sz])).toEqual([
      [-1, -1],
      [1, -1],
      [0, 1],
    ]);
    expect(hasBackHole(3)).toBe(true);
    expect(hasBackHole(4)).toBe(false);
    const four = cornersFor(4).map((c) => `${c.sx}${c.sz}`);
    expect(new Set(four).size).toBe(4);
    expect(allCorners(3).filter((entry) => entry.open)).toHaveLength(2);
    expect(allCorners(2).filter((entry) => !entry.open)).toHaveLength(2);
  });

  it('die Schräge liegt durch die Lochmitte; innen negativ, dahinter positiv', () => {
    for (const corner of [...cornersFor(4), ...cornersFor(3)]) {
      expect(beyondCut(corner, corner.mouth)).toBeCloseTo(0, 6);
      expect(beyondCut(corner, { x: 0, z: 0 })).toBeLessThan(-5);
      const behind = {
        x: corner.mouth.x + corner.normal.x * 0.6,
        z: corner.mouth.z + corner.normal.z * 0.6,
      };
      expect(beyondCut(corner, behind)).toBeCloseTo(0.6, 6);
    }
  });

  it('ein Krümel hinter der Schräge zählt für die Person dieser Ecke, sonst für niemanden', () => {
    const corners = cornersFor(3);
    corners.forEach((corner, index) => {
      const inHole = {
        x: corner.mouth.x + corner.normal.x * 0.5,
        z: corner.mouth.z + corner.normal.z * 0.5,
      };
      expect(holeOf(corners, inHole, TUNING.crumbRadius)).toBe(index);
    });
    expect(holeOf(corners, { x: 0, z: 0 }, TUNING.crumbRadius)).toBeNull();
    // Knapp vor der Öffnung noch nicht.
    const first = corners[0];
    if (!first) throw new Error('Ecke fehlt');
    expect(holeOf(corners, first.mouth, TUNING.crumbRadius)).toBeNull();
  });

  it('Krümel und Goldkrümel passen unter den Sturz, Figuren nicht', () => {
    expect(TUNING.crumbRadius * 2).toBeLessThan(TUNING.lintelBottom - 0.05);
    expect(TUNING.goldRadius * 2).toBeLessThan(TUNING.lintelBottom - 0.05);
    expect(PAWN.height).toBeGreaterThan(TUNING.lintelBottom + 0.4);
    // Die unsichtbare Kollisionswand ist deutlich höher als ein Rempler hebt.
    expect(TUNING.colliderTop).toBeGreaterThan(PAWN.height + 1);
    // Die Öffnung ist breiter als ein Krümel, aber schmaler als zwei Figuren.
    const gap = MOUTH_WIDTH;
    expect(gap).toBeGreaterThan(TUNING.goldRadius * 2 + 0.4);
    expect(gap).toBeLessThan(PAWN.radius * 4 + 0.2);
  });

  it('Startpunkte liegen auf dem Blech vor dem eigenen Loch', () => {
    for (const corner of [...cornersFor(4), ...cornersFor(3)]) {
      const spawn = spawnFor(corner);
      expect(Math.abs(spawn.x)).toBeLessThan(TUNING.halfX - PAWN.radius);
      expect(Math.abs(spawn.z)).toBeLessThan(TUNING.halfZ - PAWN.radius);
      expect(beyondCut(corner, spawn)).toBeLessThan(-2);
    }
  });
});

describe('Krümel-Kehraus: Fallpunkte', () => {
  it('liegen in der Innenfläche, gleicher Seed = gleiche Punkte', () => {
    const a = createMinigameRng(42);
    const b = createMinigameRng(42);
    for (let index = 0; index < 50; index++) {
      const p = dropPoint(a, []);
      expect(p).toEqual(dropPoint(b, []));
      expect(Math.abs(p.x)).toBeLessThanOrEqual(TUNING.halfX - TUNING.spawnMarginX);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(TUNING.halfZ - TUNING.spawnMarginZ);
    }
  });

  it('bei drei Personen im eigenen Fallfeld, das ganz auf dem Blech liegt', () => {
    const area = dropAreaFor(3);
    expect(Math.abs(area.cx) + area.hx).toBeLessThan(TUNING.halfX - 1);
    expect(Math.abs(area.cz) + area.hz).toBeLessThan(TUNING.halfZ - 1);
    const rng = createMinigameRng(11);
    for (let index = 0; index < 50; index++) {
      const p = dropPoint(rng, [], area);
      expect(Math.abs(p.x - area.cx)).toBeLessThanOrEqual(area.hx);
      expect(Math.abs(p.z - area.cz)).toBeLessThanOrEqual(area.hz);
    }
    for (const p of rainPoints(createMinigameRng(2), 6, { x: area.cx, z: area.cz })) {
      expect(Math.abs(p.x)).toBeLessThan(TUNING.halfX - 1);
      expect(Math.abs(p.z)).toBeLessThan(TUNING.halfZ - 0.5);
    }
  });

  it('meidet Figuren, wenn Platz ist', () => {
    const rng = createMinigameRng(7);
    const avoid = cornersFor(4)
      .map(spawnFor)
      .concat([{ x: 0, z: 0 }]);
    for (let index = 0; index < 50; index++) {
      const p = dropPoint(rng, avoid);
      for (const q of avoid)
        expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(TUNING.spawnClearance);
    }
  });

  it('Keksregen: Krümel im Kreis um die Mitte, nur in den letzten Sekunden', () => {
    const points = rainPoints(createMinigameRng(3), KRUEMEL_RULES.rainCrumbs);
    expect(points).toHaveLength(KRUEMEL_RULES.rainCrumbs);
    for (const p of points) {
      expect(Math.abs(p.x)).toBeLessThan(TUNING.halfX - 2);
      expect(Math.abs(p.z)).toBeLessThan(TUNING.halfZ - 1);
    }
    expect(inRain(KRUEMEL_RULES, 21_000, 30_000)).toBe(false);
    expect(inRain(KRUEMEL_RULES, 22_000, 30_000)).toBe(true);
    expect(inRain({ ...KRUEMEL_RULES, rainMs: null }, 29_000, 30_000)).toBe(false);
  });
});

describe('Krümel-Kehraus: Führung und Texte', () => {
  it('Führung nur allein und mit Punkten', () => {
    expect(
      leaderOf([
        { slot: 1, score: 3 },
        { slot: 2, score: 1 },
      ]),
    ).toBe(1);
    expect(
      leaderOf([
        { slot: 1, score: 3 },
        { slot: 2, score: 3 },
      ]),
    ).toBeNull();
    expect(leaderOf([{ slot: 1, score: 0 }])).toBeNull();
  });

  it('Höhepunkte: höchstens 4 Zeilen à 64 Zeichen, Gold zuerst', () => {
    const stats: PlayerStats[] = [
      { slot: 1, name: 'Blau', score: 9, own: 5, gifts: 0, golds: 2, bonks: 1 },
      {
        slot: 2,
        name: 'Orange mit sehr langem Namen',
        score: 3,
        own: 1,
        gifts: 3,
        golds: 0,
        bonks: 7,
      },
    ];
    const lines = buildHighlights(stats, 2);
    expect(lines[0]).toBe('Blau versenkte 2 Goldkrümel');
    expect(lines).toContain('Aus dem Riesenkeks landeten 2 Krümel in Löchern');
    expect(lines.length).toBeLessThanOrEqual(4);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(64);
    const quiet: PlayerStats = {
      slot: 1,
      name: 'Blau',
      score: 1,
      own: 1,
      gifts: 0,
      golds: 0,
      bonks: 0,
    };
    expect(buildHighlights([quiet], 0)).toEqual([]);
  });

  it('HUD-Zustand und Banner bleiben kurz', () => {
    expect(statusFor({ lastValue: 1, recent: true })).toBe('+1');
    expect(statusFor({ lastValue: 3, recent: true })).toBe('Gold +3');
    expect(statusFor({ lastValue: 3, recent: false })).toBeUndefined();
    const banners = [
      bannerFor({ elapsedMs: 22_500, limitMs: 30_000, rainStartMs: 22_000, goldSinceMs: null }),
      bannerFor({ elapsedMs: 26_000, limitMs: 30_000, rainStartMs: 22_000, goldSinceMs: null }),
      bannerFor({ elapsedMs: 6_500, limitMs: 30_000, rainStartMs: null, goldSinceMs: 6_000 }),
      bannerFor({ elapsedMs: 10_000, limitMs: 30_000, rainStartMs: null, goldSinceMs: 6_000 }),
    ];
    expect(banners).toEqual([
      'Ein Riesenkeks zerbröselt!',
      'Letzte 5 Sekunden!',
      'Ein Goldkrümel!',
      undefined,
    ]);
    for (const banner of banners) expect((banner ?? '').length).toBeLessThanOrEqual(32);
  });
});
