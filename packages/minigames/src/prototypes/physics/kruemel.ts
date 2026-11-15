/**
 * Prototyp B „Krümel-Kehraus“ (EXP-006): Runder Tisch mit Rand, darauf Kekskrümel (Kugeln).
 * Jede Person hat eine Lücke im Rand in ihrer Farbe. Krümel durch die eigene Lücke schubsen =
 * Punkt. Ein schweres Wollknäuel wird regelmäßig quer über den Tisch gekickt (Chaos).
 * Wer selbst durch eine Lücke fällt, kommt nach 1 s am eigenen Tor zurück.
 */
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import {
  rankByScore,
  type MinigameInfo,
  type MinigameInput,
  type MinigameResult,
  type Slot,
} from '@chaos-party/minigame-sdk';
import type { Minigame, MinigameContext, MinigameHud } from '@chaos-party/minigame-sdk/babylon';
import {
  aim,
  applyPawnInput,
  bodyView,
  bonkCheck,
  clampSpeed,
  createPawn,
  PAWN,
  steerPawn,
  Teleporter,
  type BotPolicy,
  type Pawn,
  type PawnView,
  type ProtoView,
  type Prototype,
} from './shared.ts';

export const KRUEMEL = {
  radius: 7,
  crumbs: 10,
  crumbRadius: 0.33,
  crumbMass: 0.3,
  ballRadius: 0.8,
  ballMass: 3,
  ballKickEveryMs: 5000,
  ballKickSpeed: 8,
  gapHalfAngle: 0.25,
  rimSegments: 40,
  killY: -2,
  respawnMs: 1000,
  speedLimit: 18,
} as const;

export interface KruemelView extends ProtoView {
  /** Torwinkel je Slot (Mitte der Lücke). */
  readonly goals: ReadonlyMap<Slot, number>;
}

interface Goalie extends Pawn {
  out: boolean;
  respawnAtMs: number | null;
  score: number;
  falls: number;
}

export function createKruemelPrototype(durationMs: number): Prototype<KruemelView> {
  let current: KruemelProto | null = null;
  const info: MinigameInfo = {
    id: 'proto-kruemel',
    category: 'physics',
    title: 'Krümel-Kehraus',
    tagline: 'Prototyp',
    instructions: ['Schubs Krümel in dein Loch.'],
    controls: { joystick: 'Laufen', a: 'Rempeln', b: null },
    durationMs,
    physics: true,
    scoring: 'higher',
    scoreUnit: 'Krümel',
  };
  return {
    module: {
      info,
      create: () => {
        current = new KruemelProto(info);
        return current;
      },
    },
    peek: () => current?.view() ?? null,
  };
}

class KruemelProto implements Minigame {
  private ctx: MinigameContext | null = null;
  private readonly pawns: Goalie[] = [];
  private readonly crumbs: { mesh: Mesh; aggregate: PhysicsAggregate }[] = [];
  private ball: { mesh: Mesh; aggregate: PhysicsAggregate } | null = null;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly teleporter = new Teleporter();
  private readonly goals = new Map<Slot, number>();
  private elapsedMs = 0;
  private nextKickMs: number = KRUEMEL.ballKickEveryMs;
  private running = false;
  private result: MinigameResult | null = null;
  private scored = 0;

  constructor(private readonly info: MinigameInfo) {}

  prepare(ctx: MinigameContext): Promise<void> {
    this.ctx = ctx;
    const { scene } = ctx;
    const camera = new FreeCamera('proto-kamera', new Vector3(0, 16, -12), scene);
    camera.setTarget(Vector3.Zero());
    const light = new HemisphericLight('proto-licht', new Vector3(0, 1, 0), scene);
    this.disposables.push(camera, light);

    const table = CreateCylinder(
      'proto-tisch',
      { diameter: KRUEMEL.radius * 2, height: 0.6, tessellation: 48 },
      scene,
    );
    table.position.y = -0.3;
    this.disposables.push(
      new PhysicsAggregate(table, PhysicsShapeType.CYLINDER, { mass: 0, friction: 0.5 }, scene),
      table,
    );

    ctx.players.forEach((player, index) => {
      this.goals.set(player.slot, Math.PI + (index * Math.PI * 2) / ctx.players.length);
    });
    const segmentLength = (2 * Math.PI * (KRUEMEL.radius + 0.15)) / KRUEMEL.rimSegments;
    for (let i = 0; i < KRUEMEL.rimSegments; i++) {
      const angle = (i + 0.5) * ((Math.PI * 2) / KRUEMEL.rimSegments);
      if (this.goalAt(angle) !== null) continue;
      const rim = CreateBox(
        `proto-rand-${i}`,
        { width: 0.3, height: 0.7, depth: segmentLength + 0.05 },
        scene,
      );
      rim.position.set(
        Math.cos(angle) * (KRUEMEL.radius + 0.15),
        0.35,
        Math.sin(angle) * (KRUEMEL.radius + 0.15),
      );
      rim.rotation.y = -angle;
      this.disposables.push(
        new PhysicsAggregate(rim, PhysicsShapeType.BOX, { mass: 0, restitution: 0.5 }, scene),
        rim,
      );
    }

    for (let i = 0; i < KRUEMEL.crumbs; i++) {
      const mesh = CreateSphere(
        `proto-kruemel-${i}`,
        { diameter: KRUEMEL.crumbRadius * 2, segments: 8 },
        scene,
      );
      mesh.position.copyFrom(this.randomInner(3.5, KRUEMEL.crumbRadius + 0.02));
      const aggregate = new PhysicsAggregate(
        mesh,
        PhysicsShapeType.SPHERE,
        { mass: KRUEMEL.crumbMass, friction: 0.6, restitution: 0.3 },
        scene,
      );
      aggregate.body.setLinearDamping(0.6);
      aggregate.body.setAngularDamping(1.5);
      this.crumbs.push({ mesh, aggregate });
    }
    const ballMesh = CreateSphere(
      'proto-knaeuel',
      { diameter: KRUEMEL.ballRadius * 2, segments: 12 },
      scene,
    );
    ballMesh.position.set(0, KRUEMEL.ballRadius + 0.02, 0);
    const ballAggregate = new PhysicsAggregate(
      ballMesh,
      PhysicsShapeType.SPHERE,
      { mass: KRUEMEL.ballMass, friction: 0.4, restitution: 0.5 },
      scene,
    );
    ballAggregate.body.setLinearDamping(0.3);
    this.ball = { mesh: ballMesh, aggregate: ballAggregate };

    ctx.players.forEach((player) => {
      const pawn = createPawn(scene, player.slot, this.spawnOf(player.slot));
      this.pawns.push({ ...pawn, out: false, respawnAtMs: null, score: 0, falls: 0 });
    });
    return Promise.resolve();
  }

  private goalAt(angle: number): Slot | null {
    for (const [slot, goal] of this.goals) {
      const diff = Math.abs(((angle - goal + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < KRUEMEL.gapHalfAngle) return slot;
    }
    return null;
  }

  private spawnOf(slot: Slot): Vector3 {
    const angle = this.goals.get(slot) ?? 0;
    return new Vector3(Math.cos(angle) * 4.5, PAWN.height / 2 + 0.02, Math.sin(angle) * 4.5);
  }

  private randomInner(maxR: number, y: number): Vector3 {
    const rng = this.ctx?.rng;
    const angle = (rng?.next() ?? 0) * Math.PI * 2;
    const r = Math.sqrt(rng?.next() ?? 0) * maxR;
    return new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
  }

  start(): void {
    this.running = true;
  }

  handleInput(slot: Slot, input: MinigameInput): void {
    const pawn = this.pawns.find((p) => p.slot === slot);
    if (pawn && !pawn.out) applyPawnInput(pawn, input);
  }

  update(dt: number): void {
    this.teleporter.settle();
    if (!this.running || !this.ctx) return;
    this.elapsedMs += dt * 1000;
    const time = this.elapsedMs / 1000;
    for (const pawn of this.pawns) {
      if (pawn.out) {
        if (pawn.respawnAtMs !== null && this.elapsedMs >= pawn.respawnAtMs) {
          pawn.out = false;
          pawn.respawnAtMs = null;
          pawn.aggregate.body.setGravityFactor(1);
          this.teleporter.move(pawn.aggregate, this.spawnOf(pawn.slot));
        }
        continue;
      }
      const p = pawn.mesh.position;
      steerPawn(pawn, time, Math.hypot(p.x, p.z) < KRUEMEL.radius && p.y > -0.5 && p.y < 2.2);
      if (p.y < KRUEMEL.killY) {
        pawn.falls++;
        pawn.out = true;
        pawn.stick = { x: 0, y: 0 };
        pawn.respawnAtMs = this.elapsedMs + KRUEMEL.respawnMs;
        pawn.aggregate.body.setGravityFactor(0);
        this.teleporter.move(pawn.aggregate, new Vector3(100 + pawn.slot * 5, -20, 0));
      }
    }
    bonkCheck(
      this.pawns.filter((p) => !p.out),
      time,
      () => undefined,
    );

    for (const crumb of this.crumbs) {
      clampSpeed(crumb.aggregate, KRUEMEL.speedLimit);
      const p = crumb.mesh.position;
      if (p.y >= KRUEMEL.killY) continue;
      const slot = this.goalAt(Math.atan2(p.z, p.x));
      const pawn = slot === null ? undefined : this.pawns.find((g) => g.slot === slot);
      if (pawn) {
        pawn.score++;
        this.scored++;
      }
      this.teleporter.move(crumb.aggregate, this.randomInner(3, 3));
    }
    if (this.ball) {
      clampSpeed(this.ball.aggregate, KRUEMEL.speedLimit);
      if (this.ball.mesh.position.y < KRUEMEL.killY) {
        this.teleporter.move(this.ball.aggregate, new Vector3(0, 4, 0));
      }
      if (this.elapsedMs >= this.nextKickMs) {
        this.nextKickMs += KRUEMEL.ballKickEveryMs;
        const angle = this.ctx.rng.next() * Math.PI * 2;
        this.ball.aggregate.body.applyImpulse(
          new Vector3(
            Math.cos(angle) * KRUEMEL.ballKickSpeed * KRUEMEL.ballMass,
            1,
            Math.sin(angle) * KRUEMEL.ballKickSpeed * KRUEMEL.ballMass,
          ),
          this.ball.mesh.position,
        );
      }
    }
    if (this.elapsedMs >= this.ctx.timeLimitMs) {
      this.running = false;
      this.result = {
        minigameId: this.info.id,
        placements: rankByScore(this.pawns.map((p) => ({ slot: p.slot, score: p.score }))),
      };
    }
  }

  getResult(): MinigameResult | null {
    return this.result;
  }

  getHud(): MinigameHud {
    return {
      remainingMs: Math.max(0, Math.round((this.ctx?.timeLimitMs ?? 0) - this.elapsedMs)),
      scores: this.pawns.map((p) => ({ slot: p.slot, score: p.score })),
    };
  }

  dispose(): void {
    for (const item of [...this.pawns, ...this.crumbs, ...(this.ball ? [this.ball] : [])]) {
      item.aggregate.dispose();
      item.mesh.dispose();
    }
    this.pawns.length = 0;
    this.crumbs.length = 0;
    this.ball = null;
    for (const item of this.disposables.splice(0)) item.dispose();
  }

  view(): KruemelView {
    const pawns: PawnView[] = this.pawns.map((p) => ({
      ...bodyView(p.aggregate),
      slot: p.slot,
      out: p.out,
      canDash: this.elapsedMs / 1000 - p.lastDashAt >= PAWN.dashCooldown,
    }));
    const props = [...this.crumbs, ...(this.ball ? [this.ball] : [])].map((c) => ({
      ...bodyView(c.aggregate),
      active: true,
    }));
    return {
      pawns,
      props,
      killY: KRUEMEL.killY,
      goals: this.goals,
      tunneled: () => {
        let count = 0;
        for (const body of [...this.pawns.filter((p) => !p.out), ...this.crumbs]) {
          const pos = body.mesh.position;
          if (Math.hypot(pos.x, pos.z) < KRUEMEL.radius - 0.8 && pos.y < -0.15) count++;
        }
        return count;
      },
      counters: {
        crumbs: this.scored,
        falls: this.pawns.reduce((s, p) => s + p.falls, 0),
      },
    };
  }
}

/**
 * Bot: Krümel mit bestem Verhältnis aus Weg und Torabstand wählen, sich dahinter stellen und
 * Richtung eigenes Tor schieben; bei guter Linie rempeln (schießt den Krümel).
 */
export const kruemelBot: BotPolicy<KruemelView> = (me, view, skill, rng) => {
  const goalAngle = view.goals.get(me.slot) ?? 0;
  const goal = { x: Math.cos(goalAngle) * KRUEMEL.radius, z: Math.sin(goalAngle) * KRUEMEL.radius };
  const crumbs = view.props.slice(0, KRUEMEL.crumbs).filter((c) => c.y > -0.2 && c.y < 1);
  let best: (typeof crumbs)[number] | null = null;
  let bestCost = Infinity;
  for (const crumb of crumbs) {
    const cost =
      Math.hypot(crumb.x - me.x, crumb.z - me.z) +
      0.7 * Math.hypot(goal.x - crumb.x, goal.z - crumb.z);
    if (cost < bestCost) {
      bestCost = cost;
      best = crumb;
    }
  }
  if (!best) return aim(-me.x, -me.z, skill.noise, rng, 0.5);
  const gx = goal.x - best.x;
  const gz = goal.z - best.z;
  const gl = Math.hypot(gx, gz) || 1;
  const dir = { x: gx / gl, z: gz / gl };
  const behind = { x: best.x - dir.x * 0.9, z: best.z - dir.z * 0.9 };
  const toCrumb = { x: best.x - me.x, z: best.z - me.z };
  const dist = Math.hypot(toCrumb.x, toCrumb.z) || 1;
  const alignment = (toCrumb.x * dir.x + toCrumb.z * dir.z) / dist;
  if (alignment > 0.85 && dist < 1.6) {
    const decision = aim(
      dir.x + toCrumb.x / dist,
      dir.z + toCrumb.z / dist,
      skill.noise * 0.5,
      rng,
    );
    return { ...decision, dash: me.canDash && gl < 5 && rng.next() < skill.dashChance * 0.5 };
  }
  // Steht man zwischen Krümel und Tor: seitlich herum.
  if ((me.x - best.x) * dir.x + (me.z - best.z) * dir.z > 0 && dist < 2) {
    const side = { x: -dir.z, z: dir.x };
    const sign = (me.x - best.x) * side.x + (me.z - best.z) * side.z >= 0 ? 1 : -1;
    return aim(
      best.x + side.x * sign * 1.3 - me.x,
      best.z + side.z * sign * 1.3 - me.z,
      skill.noise,
      rng,
    );
  }
  return aim(behind.x - me.x, behind.z - me.z, skill.noise, rng);
};
