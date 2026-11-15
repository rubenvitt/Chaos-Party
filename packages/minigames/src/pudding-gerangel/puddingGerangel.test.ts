/**
 * Pudding-Gerangel headless mit echtem Havok: Steckbrief, Läufe mit 2–4 Bots über mehrere
 * Seeds und Physik-Invarianten (keine NaN, niemand fällt unbemerkt durch, Tempo begrenzt,
 * kein Durchtunneln), Wertung, Ende, Trennung und Aufräumen. Physik wird nicht bitgenau
 * verglichen, sondern über Invarianten (ARCHITECTURE.md).
 */
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { checkInfo, checkResult, type MinigameInput, type Slot } from '@chaos-party/minigame-sdk';
import type { MinigameModule } from '@chaos-party/minigame-sdk/babylon';
import {
  createHeadlessScene,
  createRecordingFx,
  createTestCharacters,
  EMPTY_RESIDUE,
  loadHavokForNode,
  runMinigameHeadless,
  sceneResidue,
  testPlayers,
  type InputScript,
} from '@chaos-party/minigame-sdk/testing';
import { createMinigameRunner } from '@chaos-party/minigame-sdk/babylon';
import { describe, expect, it } from 'vitest';
import { PuddingGerangel, puddingGerangel, type PuddingSnapshot } from './index.ts';
import { PUDDING_GERANGEL_INFO } from './info.ts';
import { PAWN, TUNING } from './logic.ts';

/** Modul, das die Instanz für Bots und Prüfungen offenlegt. */
function observed() {
  let game: PuddingGerangel | null = null;
  const module: MinigameModule = {
    info: PUDDING_GERANGEL_INFO,
    create: () => {
      game = new PuddingGerangel();
      return game;
    },
  };
  return { module, snapshot: () => game?.snapshot() ?? null };
}

interface Invariants {
  steps: number;
  nan: number;
  lost: number;
  tunneled: number;
  maxSpeed: number;
  minY: number;
  last: PuddingSnapshot | null;
}

/** Bot: zum Kirschfleck, dort Rivalen wegrempeln; vom Rand zurück zur Mitte. */
function botInputs(me: PuddingSnapshot['pawns'][number], snap: PuddingSnapshot, step: number) {
  const inputs: MinigameInput[] = [];
  let tx = -me.x;
  let tz = -me.z;
  if (me.localR < TUNING.radius - 1.5 && snap.zone) {
    tx = snap.zone.x - me.x;
    tz = snap.zone.z - me.z;
    const rival = snap.pawns.find(
      (other) =>
        other.slot !== me.slot && !other.out && Math.hypot(other.x - me.x, other.z - me.z) < 1.7,
    );
    if (rival && me.canDash && (step + me.slot * 5) % 20 === 0) {
      tx = rival.x - me.x;
      tz = rival.z - me.z;
      const length = Math.hypot(tx, tz) || 1;
      inputs.push({ type: 'move', x: tx / length, y: tz / length });
      inputs.push({ type: 'press', button: 'a' }, { type: 'release', button: 'a' });
      return inputs;
    }
  }
  const length = Math.hypot(tx, tz);
  const speed = length < 0.4 ? 0 : Math.min(1, length);
  inputs.push({
    type: 'move',
    x: length > 0 ? (tx / length) * speed : 0,
    y: length > 0 ? (tz / length) * speed : 0,
  });
  return inputs;
}

function botScript(
  snapshot: () => PuddingSnapshot | null,
  inv: Invariants,
  options: { readonly idle?: readonly Slot[]; readonly every?: number } = {},
): InputScript {
  return (_elapsed, send) => {
    const snap = snapshot();
    if (!snap) return;
    inv.last = snap;
    for (const pawn of snap.pawns) {
      const values = [pawn.x, pawn.y, pawn.z, pawn.vx, pawn.vy, pawn.vz];
      if (values.some((value) => !Number.isFinite(value))) inv.nan++;
      if (pawn.out) continue;
      inv.maxSpeed = Math.max(inv.maxSpeed, Math.hypot(pawn.vx, pawn.vy, pawn.vz));
      inv.minY = Math.min(inv.minY, pawn.y);
      // Untergrenze: Wer tiefer als die Sahne hängt, muss als „raus“ gelten.
      if (pawn.y < TUNING.killY - 1) inv.lost++;
      // Über der Puddingfläche, aber mit der Kapselmitte darunter = durchgetunnelt.
      if (pawn.localR < TUNING.radius - 0.8 && pawn.localY < 0) inv.tunneled++;
    }
    if (inv.steps % (options.every ?? 6) === 0) {
      for (const pawn of snap.pawns) {
        if (pawn.out || options.idle?.includes(pawn.slot)) continue;
        for (const input of botInputs(pawn, snap, inv.steps)) send(pawn.slot, input);
      }
    }
    inv.steps++;
  };
}

function freshInvariants(): Invariants {
  return { steps: 0, nan: 0, lost: 0, tunneled: 0, maxSpeed: 0, minY: Infinity, last: null };
}

function expectStable(inv: Invariants) {
  expect(inv.nan).toBe(0);
  expect(inv.lost).toBe(0);
  expect(inv.tunneled).toBe(0);
  expect(inv.maxSpeed).toBeLessThan(30);
}

describe('Pudding-Gerangel: Steckbrief', () => {
  it('ist gültig, Physik-Kategorie, 20–45 s, Joystick + ein Knopf', () => {
    expect(checkInfo(puddingGerangel.info)).toEqual({ ok: true });
    expect(puddingGerangel.info.category).toBe('physics');
    expect(puddingGerangel.info.physics).toBe(true);
    expect(puddingGerangel.info.durationMs).toBeGreaterThanOrEqual(20_000);
    expect(puddingGerangel.info.durationMs).toBeLessThanOrEqual(45_000);
    expect(puddingGerangel.info.controls).toEqual({ joystick: 'Laufen', a: 'Rempeln', b: null });
    expect(puddingGerangel.info.instructions.length).toBeLessThanOrEqual(3);
  });
});

describe('Pudding-Gerangel: Läufe mit Bots (Havok, Invarianten)', () => {
  for (const players of [2, 3, 4]) {
    for (const seed of [1, 2, 3]) {
      it(`${players} Bots, Seed ${seed}: stabil, gültig gewertet, pünktlich, aufgeräumt`, async () => {
        const { module, snapshot } = observed();
        const inv = freshInvariants();
        const run = await runMinigameHeadless(module, {
          players,
          seed,
          script: botScript(snapshot, inv),
        });
        expectStable(inv);
        const outcome = run.outcome;
        expect(outcome?.forced).toBe(false);
        expect(outcome?.elapsedMs).toBeGreaterThanOrEqual(PUDDING_GERANGEL_INFO.durationMs);
        expect(outcome?.elapsedMs).toBeLessThanOrEqual(PUDDING_GERANGEL_INFO.durationMs + 20);
        if (!outcome) throw new Error('kein Ergebnis');
        const slots = testPlayers(players).map((player) => player.slot);
        expect(
          checkResult(outcome.result, {
            minigameId: PUDDING_GERANGEL_INFO.id,
            slots,
            scoring: 'higher',
          }),
        ).toEqual({ ok: true });
        // Punkte plausibel: 0 … Spielzeit × Rate, und jemand war auf der Kirsche.
        const maxPoints = (PUDDING_GERANGEL_INFO.durationMs / 1000) * TUNING.zoneRate;
        for (const placement of outcome.result.placements) {
          expect(placement.score).toBeGreaterThanOrEqual(0);
          expect(placement.score).toBeLessThanOrEqual(maxPoints);
        }
        expect(Math.max(...outcome.result.placements.map((p) => p.score))).toBeGreaterThan(10);
        for (const line of outcome.result.highlights ?? []) {
          expect(line.length).toBeLessThanOrEqual(64);
        }
        expect(run.residue).toEqual(EMPTY_RESIDUE);
        expect(run.fx.sounds).toContain('go');
        expect(run.fx.sounds).toContain('win');
      });
    }
  }

  it('wertet Gleichstand mit gleichem Platz (niemand bewegt sich, Fleck weit weg)', async () => {
    // Ohne Eingaben stehen alle am Start; landet der Fleck auf niemandem, haben alle 0.
    let checked = 0;
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const { module, snapshot } = observed();
      const inv = freshInvariants();
      const run = await runMinigameHeadless(module, {
        players: 3,
        seed,
        timeLimitMs: 3_000,
        script: () => {
          inv.last = snapshot();
        },
      });
      const placements = run.outcome?.result.placements ?? [];
      if (placements.every((p) => p.score === 0)) {
        expect(placements.map((p) => p.place)).toEqual([1, 1, 1]);
        checked++;
      }
      expect(run.residue).toEqual(EMPTY_RESIDUE);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('beendet spätestens zum (verkürzten) Zeitlimit', async () => {
    const { module, snapshot } = observed();
    const inv = freshInvariants();
    const run = await runMinigameHeadless(module, {
      players: 2,
      seed: 4,
      timeLimitMs: 12_000,
      script: botScript(snapshot, inv),
    });
    expect(run.outcome?.forced).toBe(false);
    expect(run.outcome?.elapsedMs).toBeGreaterThanOrEqual(12_000);
    expect(run.outcome?.elapsedMs).toBeLessThanOrEqual(12_020);
    expectStable(inv);
  });
});

describe('Pudding-Gerangel: Spielmechanik', () => {
  it('kippt zur Seite, auf der alle stehen (Havok-Teller folgt)', async () => {
    const { module, snapshot } = observed();
    let roll = 0;
    let minLocalY = Infinity;
    await runMinigameHeadless(module, {
      players: 4,
      seed: 5,
      timeLimitMs: 2_500,
      script: (elapsed, send) => {
        const snap = snapshot();
        if (!snap) return;
        if (elapsed === 0) for (const p of snap.pawns) send(p.slot, { type: 'move', x: 1, y: 0 });
        // Vor dem Rand anhalten.
        for (const p of snap.pawns) {
          if (p.x > 3.5) send(p.slot, { type: 'move', x: 0, y: 0 });
          if (!p.out && p.localR < TUNING.radius - 0.5) minLocalY = Math.min(minLocalY, p.localY);
        }
        roll = snap.tilt.roll;
      },
    });
    expect(roll).toBeLessThan(-0.05); // +X-Seite gesenkt (Schwabbeln überlagert)
    expect(minLocalY).toBeGreaterThan(0.5); // Kapselmitte bleibt über der Fläche
  });

  it('Babylon-Drehsinn: positive Neigung um X senkt +Z, negative um Z senkt +X', () => {
    const q = Quaternion.RotationYawPitchRoll(0, 0.2, -0.2);
    const front = new Vector3(0, 0, 5).rotateByQuaternionToRef(q, new Vector3());
    const right = new Vector3(5, 0, 0).rotateByQuaternionToRef(q, new Vector3());
    expect(front.y).toBeLessThan(0);
    expect(right.y).toBeLessThan(0);
  });

  it('wer allein auf den Fleck läuft, gewinnt deutlich', async () => {
    const { module, snapshot } = observed();
    const inv = freshInvariants();
    const run = await runMinigameHeadless(module, {
      players: 4,
      seed: 6,
      script: botScript(snapshot, inv, { idle: [2, 3, 4] }),
    });
    const placements = run.outcome?.result.placements ?? [];
    expect(placements[0]?.slot).toBe(1);
    expect(placements[0]?.score).toBeGreaterThan(40);
    expectStable(inv);
  });

  it('Rempler schubst, Sturz in die Sahne, Comeback von oben', async () => {
    const { module, snapshot } = observed();
    const states: { t: number; out: boolean; y: number }[] = [];
    const run = await runMinigameHeadless(module, {
      players: 2,
      seed: 7,
      timeLimitMs: 6_000,
      script: (elapsed, send) => {
        const snap = snapshot();
        if (!snap) return;
        const me = snap.pawns.find((p) => p.slot === 1);
        const other = snap.pawns.find((p) => p.slot === 2);
        if (!me || !other) return;
        states.push({ t: elapsed, out: other.out, y: other.y });
        // Slot 1 rennt auf Slot 2 zu und rempelt immer wieder; Slot 2 läuft vom Teller.
        if (!me.out && !other.out) {
          const dx = other.x - me.x;
          const dz = other.z - me.z;
          const length = Math.hypot(dx, dz) || 1;
          send(1, { type: 'move', x: dx / length, y: dz / length });
          if (length < 1.6) {
            send(1, { type: 'press', button: 'a' });
            send(1, { type: 'release', button: 'a' });
          }
        }
        if (elapsed < 2_500) send(2, { type: 'move', x: 1, y: 0 });
        else send(2, { type: 'move', x: 0, y: 0 });
      },
    });
    const fallIndex = states.findIndex((s) => s.out);
    expect(fallIndex).toBeGreaterThan(0);
    const back = states.slice(fallIndex).find((s) => !s.out);
    expect(back).toBeDefined();
    expect(back?.y).toBeGreaterThan(2); // fällt von oben wieder herein
    expect(run.fx.sounds).toContain('splash');
    expect(run.fx.sounds).toContain('pop');
    expect(run.animations.get(2)).toContain('fall');
    expect(run.residue).toEqual(EMPTY_RESIDUE);
  });

  it('Rempler treffen: Stoß, Geräusch und Treffer-Animation', async () => {
    const { module, snapshot } = observed();
    const run = await runMinigameHeadless(module, {
      players: 2,
      seed: 8,
      timeLimitMs: 4_000,
      script: (_elapsed, send) => {
        const snap = snapshot();
        const me = snap?.pawns.find((p) => p.slot === 1);
        const other = snap?.pawns.find((p) => p.slot === 2);
        if (!me || !other || me.out || other.out) return;
        const dx = other.x - me.x;
        const dz = other.z - me.z;
        const length = Math.hypot(dx, dz) || 1;
        send(1, { type: 'move', x: dx / length, y: dz / length });
        if (length < 1.5 && me.canDash) {
          send(1, { type: 'press', button: 'a' });
          send(1, { type: 'release', button: 'a' });
        }
      },
    });
    expect(run.fx.sounds).toContain('bump');
    expect(run.animations.get(2)).toContain('hit');
    expect(run.fx.bursts.some((burst) => burst.id === 'impact')).toBe(true);
  });

  it('getrennter Spieler steht still, das Spiel läuft sauber weiter', async () => {
    const { module, snapshot } = observed();
    const inv = freshInvariants();
    const base = botScript(snapshot, inv);
    const run = await runMinigameHeadless(module, {
      players: 4,
      seed: 9,
      script: (elapsed, send, runner) => {
        if (elapsed === 5_000) runner.setConnected(2, false);
        if (elapsed === 15_000) runner.setConnected(2, true);
        base(elapsed, send, runner);
      },
    });
    expect(run.outcome?.forced).toBe(false);
    expect(run.outcome?.result.placements.map((p) => p.slot).sort()).toEqual([1, 2, 3, 4]);
    expectStable(inv);
    expect(run.residue).toEqual(EMPTY_RESIDUE);
  });

  it('HUD zeigt Punkte, Restzeit, Status und Banner', async () => {
    const { module, snapshot } = observed();
    const inv = freshInvariants();
    const huds: ReturnType<PuddingGerangel['getHud']>[] = [];
    await runMinigameHeadless(module, {
      players: 3,
      seed: 10,
      script: (elapsed, send, runner) => {
        botScript(snapshot, inv)(elapsed, send, runner);
        if (elapsed % 500 === 0) huds.push(runner.hud());
      },
    });
    expect(huds[0]?.remainingMs).toBe(PUDDING_GERANGEL_INFO.durationMs);
    expect(huds.every((hud) => hud.scores.length === 3)).toBe(true);
    const statuses = new Set(huds.flatMap((hud) => hud.scores.map((s) => s.status)));
    expect(statuses.has('Kirsche!')).toBe(true);
    const banners = new Set(huds.map((hud) => hud.banner).filter(Boolean));
    expect(banners.has('Letzte 5 Sekunden!')).toBe(true);
    for (const hud of huds) {
      expect(hud.banner === undefined || hud.banner.length <= 32).toBe(true);
      for (const entry of hud.scores) expect((entry.status ?? '').length).toBeLessThanOrEqual(16);
    }
  });
});

describe('Pudding-Gerangel: Aufräumen', () => {
  it('räumt auch ohne Start und doppelt aufgerufen alles weg', async () => {
    const headless = createHeadlessScene();
    const runner = createMinigameRunner(puddingGerangel, {
      scene: headless.scene,
      players: testPlayers(4),
      seed: 3,
      fx: createRecordingFx(),
      characters: createTestCharacters(),
      havok: await loadHavokForNode(),
      testMode: true,
    });
    await runner.prepare();
    expect(sceneResidue(headless.scene).physicsBodies).toBe(4 + 2);
    runner.dispose();
    runner.dispose();
    expect(sceneResidue(headless.scene)).toEqual(EMPTY_RESIDUE);
    headless.dispose();
  });

  it('Hitbox ist unabhängig von der Figur (Kapsel 1,5 × 0,45)', () => {
    expect(PAWN.height).toBe(1.5);
    expect(PAWN.radius).toBeLessThanOrEqual(0.5);
  });
});
