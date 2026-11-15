import { createMinigameRng, MINIGAME_TEXT_LIMITS, type Slot } from '@chaos-party/minigame-sdk';
import { describe, expect, it } from 'vitest';
import { BOT_PROFILES, metrics, seedRange } from '../prototypes/arcade/common.ts';
import { simulateSockenregenLogic } from '../prototypes/arcade/sockenregenBot.ts';
import { sockenregenHighlights } from './highlights.ts';
import {
  SOCKENREGEN_RULES as RULES,
  SockenregenLogic,
  clampToRadius,
  flightPosition,
  type Item,
  type ItemKind,
  type SockEvent,
} from './logic.ts';

const DT = 1 / 60;
const SLOTS: readonly Slot[] = [1, 2, 3, 4];

function game(players = 2, seed = 1, limitMs = 30_000) {
  return new SockenregenLogic(SLOTS.slice(0, players), createMinigameRng(seed), limitMs);
}

/** Läuft, bis ein Ding der Art geworfen wird, und liefert es (Figuren stehen still). */
function untilSpawn(logic: SockenregenLogic, kind: ItemKind): Item {
  for (let step = 0; step < 60 * 30; step++) {
    for (const event of logic.step(DT)) {
      if (event.type === 'spawn' && event.item.kind === kind) return event.item;
    }
  }
  throw new Error(`kein ${kind} geworfen`);
}

function stepFor(logic: SockenregenLogic, seconds: number): SockEvent[] {
  const events: SockEvent[] = [];
  for (let step = 0; step < Math.round(seconds / DT); step++) events.push(...logic.step(DT));
  return events;
}

/** Figuren weit weg vom Geschehen parken (Rand gegenüber dem Landepunkt). */
function park(logic: SockenregenLogic, except: Slot | null, item: Item): void {
  for (const runner of logic.runners) {
    if (runner.slot === except) continue;
    const angle = Math.atan2(-item.z, -item.x);
    runner.x = Math.cos(angle) * RULES.arenaRadius;
    runner.z = Math.sin(angle) * RULES.arenaRadius;
  }
}

describe('Sockenregen-Logik: Bewegung', () => {
  it('stellt alle Figuren getrennt in die Arena', () => {
    const logic = game(4);
    for (const runner of logic.runners) {
      expect(Math.hypot(runner.x, runner.z)).toBeLessThan(RULES.arenaRadius);
    }
    const spots = new Set(logic.runners.map((r) => `${r.x.toFixed(2)}:${r.z.toFixed(2)}`));
    expect(spots.size).toBe(4);
  });

  it('läuft mit Stick-Tempo, normiert Diagonalen und bleibt in der Arena', () => {
    const logic = game();
    const runner = logic.runners[0];
    if (!runner) throw new Error('kein Läufer');
    runner.x = 0;
    runner.z = 0;
    logic.setStick(1, 0, 1);
    logic.step(0.1);
    expect(runner.z).toBeCloseTo(RULES.speed * 0.1, 5);
    expect(runner.heading).toBeCloseTo(0, 5);
    logic.setStick(1, 1, 1);
    expect(Math.hypot(runner.stickX, runner.stickY)).toBeCloseTo(1, 5);
    logic.setStick(1, 1, 0);
    stepFor(logic, 3);
    expect(Math.hypot(runner.x, runner.z)).toBeLessThanOrEqual(RULES.arenaRadius + 1e-9);
  });

  it('Hechtsprung ist schneller, hat Abklingzeit und geht nicht geplättet', () => {
    const logic = game();
    const runner = logic.runners[0];
    if (!runner) throw new Error('kein Läufer');
    runner.x = -3;
    runner.z = 0;
    logic.setStick(1, 1, 0);
    expect(logic.dash(1)).toBe(true);
    expect(logic.dash(1)).toBe(false);
    stepFor(logic, RULES.dashS);
    expect(runner.x + 3).toBeGreaterThan(RULES.speed * RULES.dashS * 2);
    stepFor(logic, RULES.dashCooldownS);
    runner.stunUntil = logic.time + 1;
    expect(logic.dash(1)).toBe(false);
  });
});

describe('Sockenregen-Logik: Socken und Bügeleisen', () => {
  it('fängt eine Socke, wer beim Landen darunter steht (1 Punkt)', () => {
    const logic = game(2, 3);
    const sock = untilSpawn(logic, 'sock');
    park(logic, 1, sock);
    const runner = logic.runner(1);
    if (!runner) throw new Error('kein Läufer');
    runner.x = sock.x;
    runner.z = sock.z;
    const before = runner.score;
    const events = stepFor(logic, RULES.flightS + 0.05);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'collect', slot: 1, item: sock }),
    );
    expect(runner.score).toBeGreaterThanOrEqual(before + 1);
  });

  it('liegende Socken kann man aufsammeln, bis sie verschwinden', () => {
    const logic = game(2, 4);
    const sock = untilSpawn(logic, 'sock');
    park(logic, null, sock);
    const landed = stepFor(logic, RULES.flightS + 0.05);
    expect(landed).toContainEqual(expect.objectContaining({ type: 'land', item: sock }));
    expect(sock.state).toBe('ground');
    const runner = logic.runner(2);
    if (!runner) throw new Error('kein Läufer');
    runner.x = sock.x + 0.5;
    runner.z = sock.z;
    const events = logic.step(DT);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'collect', slot: 2, item: sock }),
    );
  });

  it('unberührte Socken verschwinden nach der Liegezeit', () => {
    const logic = game(2, 5);
    const sock = untilSpawn(logic, 'sock');
    // Figuren in eine Ecke stellen und dort halten (Würfe dürfen sie dort nicht erreichen).
    const events: SockEvent[] = [];
    for (let step = 0; step < Math.round((RULES.flightS + RULES.groundS + 0.1) / DT); step++) {
      park(logic, null, sock);
      events.push(...logic.step(DT));
    }
    expect(events).toContainEqual(expect.objectContaining({ type: 'expire', item: sock }));
  });

  it('die nächste Figur bekommt die Socke', () => {
    const logic = game(2, 6);
    const sock = untilSpawn(logic, 'sock');
    const [a, b] = logic.runners;
    if (!a || !b) throw new Error('keine Läufer');
    a.x = sock.x + 0.6;
    a.z = sock.z;
    b.x = sock.x - 0.2;
    b.z = sock.z;
    const events = stepFor(logic, RULES.flightS + 0.02);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'collect', slot: 2, item: sock }),
    );
  });

  it('Goldsocke zählt drei', () => {
    const logic = game(2, 7);
    const gold = untilSpawn(logic, 'gold');
    park(logic, 1, gold);
    const runner = logic.runner(1);
    if (!runner) throw new Error('kein Läufer');
    runner.x = gold.x;
    runner.z = gold.z;
    const before = runner.score;
    const events = stepFor(logic, RULES.flightS + 0.02);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'collect', slot: 1, item: gold }),
    );
    expect(runner.score - before).toBeGreaterThanOrEqual(RULES.goldPoints);
    expect(runner.golds).toBeGreaterThanOrEqual(1);
  });

  it('Bügeleisen plättet, kostet eine Socke und die springt heraus', () => {
    const logic = game(2, 8);
    const iron = untilSpawn(logic, 'iron');
    park(logic, 1, iron);
    const runner = logic.runner(1);
    if (!runner) throw new Error('kein Läufer');
    runner.x = iron.x + 0.5;
    runner.z = iron.z;
    runner.score = 2;
    let hit: Extract<SockEvent, { type: 'hit' }> | undefined;
    for (let step = 0; step < Math.round((RULES.flightS + 0.05) / DT) && !hit; step++) {
      runner.x = iron.x + 0.5;
      runner.z = iron.z;
      hit = logic.step(DT).find((e): e is Extract<SockEvent, { type: 'hit' }> => e.type === 'hit');
    }
    expect(hit?.slot).toBe(1);
    expect(runner.score).toBe(1);
    expect(runner.hits).toBe(1);
    expect(logic.isStunned(runner)).toBe(true);
    expect(hit?.drop?.dropped).toBe(true);
    // Geplättet: kein Laufen, kein Sammeln.
    const x = runner.x;
    logic.setStick(1, 1, 0);
    stepFor(logic, RULES.stunS * 0.5);
    expect(runner.x).toBe(x);
    stepFor(logic, RULES.stunS);
    expect(logic.isStunned(runner)).toBe(false);
  });

  it('ohne Socken kostet ein Treffer nichts (keine negativen Punkte)', () => {
    const logic = game(2, 9);
    const iron = untilSpawn(logic, 'iron');
    park(logic, 1, iron);
    const runner = logic.runner(1);
    if (!runner) throw new Error('kein Läufer');
    runner.score = 0;
    const events: SockEvent[] = [];
    for (let step = 0; step < Math.round((RULES.flightS + 0.05) / DT); step++) {
      runner.x = iron.x;
      runner.z = iron.z;
      events.push(...logic.step(DT));
    }
    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', slot: 1, drop: null }));
    expect(runner.score).toBe(0);
  });

  it('gezielte Bügeleisen fliegen auf die alleinige Führung', () => {
    const logic = game(4, 10);
    const runner = logic.runner(3);
    if (!runner) throw new Error('kein Läufer');
    let aimed = 0;
    while (!logic.finished) {
      runner.score = Math.max(runner.score, 50);
      const leader = logic.leader();
      for (const event of logic.step(DT)) {
        if (event.type === 'spawn' && event.item.target !== null) {
          aimed++;
          expect(event.item.target).toBe(leader?.slot);
        }
      }
    }
    expect(aimed).toBeGreaterThan(3);
  });
});

describe('Sockenregen-Logik: Ablauf', () => {
  it('Schleudergang in den letzten Sekunden, Ende genau am Zeitlimit', () => {
    const logic = game(3, 11, 20_000);
    const spawns: number[] = [];
    let finaleAt = -1;
    let endAt = -1;
    while (!logic.finished) {
      for (const event of logic.step(DT)) {
        if (event.type === 'spawn') spawns.push(logic.time);
        if (event.type === 'finale') finaleAt = logic.time;
        if (event.type === 'end') endAt = logic.time;
      }
    }
    expect(finaleAt).toBeCloseTo(20 - RULES.finaleS, 1);
    expect(endAt).toBeCloseTo(20, 1);
    expect(logic.step(DT)).toEqual([]);
    expect(spawns[0]).toBeCloseTo(RULES.firstSpawnS, 1);
    // Nichts wird geworfen, das erst nach dem Ende landet.
    for (const at of spawns) expect(at + RULES.flightS).toBeLessThan(20 + DT);
    const early = spawns.filter((at) => at < finaleAt).length / finaleAt;
    const late = spawns.filter((at) => at >= finaleAt).length / RULES.finaleS;
    expect(late).toBeGreaterThan(early * 1.4);
  });

  it('gleicher Seed, gleiche Eingaben → gleicher Ablauf', () => {
    const play = () => {
      const logic = game(4, 12);
      const log: string[] = [];
      let step = 0;
      while (!logic.finished) {
        logic.setStick(1, Math.sin(step / 40), Math.cos(step / 40));
        if (step % 90 === 0) logic.dash(1);
        for (const event of logic.step(DT)) log.push(event.type);
        step++;
      }
      return { log, scores: logic.runners.map((r) => r.score) };
    };
    expect(play()).toEqual(play());
  });

  it('Hilfsfunktionen: Flugbahn und Begrenzung', () => {
    expect(clampToRadius(10, 0, 5)).toEqual({ x: 5, z: 0 });
    expect(clampToRadius(1, 1, 5)).toEqual({ x: 1, z: 1 });
    const logic = game(2, 13);
    const sock = untilSpawn(logic, 'sock');
    const start = flightPosition(sock, sock.launchT);
    const end = flightPosition(sock, sock.landT);
    expect(start.y).toBeCloseTo(sock.fromY, 5);
    expect(end.x).toBeCloseTo(sock.x, 9);
    expect(end.z).toBeCloseTo(sock.z, 9);
    expect(end.progress).toBe(1);
    expect(end.y).toBeCloseTo(0, 5);
    expect(flightPosition(sock, (sock.launchT + sock.landT) / 2).y).toBeGreaterThan(start.y);
  });
});

describe('Sockenregen-Logik mit Bots', () => {
  it('stärkere Bots gewinnen meist, aber nicht immer; 2–4 Spieler laufen durch', () => {
    const { profi, normal, neuling } = BOT_PROFILES;
    const duel = metrics(
      seedRange(20).map((seed) => simulateSockenregenLogic(2, seed, [profi, neuling])),
    );
    expect(duel.strongestWins).toBeGreaterThan(0.6);
    const close = metrics(
      seedRange(20).map((seed) => simulateSockenregenLogic(2, seed, [normal, normal])),
    );
    expect(close.strongestWins).toBeGreaterThan(0.15);
    expect(close.strongestWins).toBeLessThan(0.85);
    for (const players of [2, 3, 4] as const) {
      const record = simulateSockenregenLogic(players, 21);
      expect(record.scores).toHaveLength(players);
      expect(Math.max(...record.scores)).toBeGreaterThan(5);
    }
  });
});

describe('Sockenregen: Höhepunkte', () => {
  it('nennt Namen, hält Grenzen ein und lässt Gleichstände aus', () => {
    const logic = game(4, 14);
    const [a, b, c, d] = logic.runners;
    if (!a || !b || !c || !d) throw new Error('keine Läufer');
    Object.assign(a, { score: 12, socks: 9, golds: 1, hits: 0, dashes: 2 });
    Object.assign(b, { score: 7, socks: 7, golds: 0, hits: 3, dashes: 9 });
    Object.assign(c, { score: 3, socks: 3, golds: 0, hits: 1, dashes: 0 });
    Object.assign(d, { score: 0, socks: 0, golds: 0, hits: 0, dashes: 0 });
    logic.lastCollector = 3;
    const names = new Map<Slot, string>([
      [1, 'Blau'],
      [2, 'Orange mit einem wirklich sehr sehr langen Namen'],
      [3, 'Grün'],
      [4, 'Rosa'],
    ]);
    const lines = sockenregenHighlights(logic, names);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(MINIGAME_TEXT_LIMITS.highlights);
    for (const line of lines)
      expect(line.length).toBeLessThanOrEqual(MINIGAME_TEXT_LIMITS.highlight);
    expect(lines[0]).toBe('Blau holt 12 Socken – Sockenkönig!');
    expect(lines.some((line) => line.startsWith('Orange') && line.endsWith('…'))).toBe(true);
    expect(lines.some((line) => line.includes('Goldsocke'))).toBe(true);

    b.score = 12;
    expect(sockenregenHighlights(logic, names).some((l) => l.includes('Sockenkönig'))).toBe(false);
    expect(sockenregenHighlights(game(2), names)).toEqual([]);
  });
});
