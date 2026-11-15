/**
 * Wackelturm – reine Spielregeln (ohne Babylon). Die Babylon-Schicht (`index.ts`) zeigt nur
 * an, was hier steht; Bots in `prototypes/hybrid/` spielen dieselben Regeln (EXP-007).
 *
 * Kern: Törtchen am Berg in der Mitte holen (A), als Turm auf dem Kopf ins eigene Nest
 * tragen, dort zählt er. Ein hoher Turm bringt mehr (Turmbonus), macht langsam und wackelt
 * bei scharfen Lenkbewegungen – zu viel Wackeln, und er kippt. B rempelt: Wer mit leeren
 * Händen in einen fremden Turm rennt, wirft ihn um und schnappt sich ein Stück davon.
 *
 * Koordinaten: x nach rechts, z nach hinten (vom Fernseher weg), Joystick y > 0 = +z.
 * Zeit nur über `stepWackelturm(state, dt)`; Zufall nur über die übergebene `next()`.
 */
import type { Slot } from '@chaos-party/minigame-sdk';

export interface WackelturmParams {
  /** Halbe Arenabreite (x) und -tiefe (z). */
  readonly halfX: number;
  readonly halfZ: number;
  /** Radius des Törtchenbergs in der Mitte (dort wirkt A). */
  readonly pileRadius: number;
  /** Radius der Nester in den Ecken. */
  readonly nestRadius: number;
  /** Abstand der Nest-Mitte vom Arenarand. */
  readonly nestInset: number;
  /** Radius einer Figur (Abstoßen untereinander). */
  readonly bodyRadius: number;
  readonly baseSpeed: number;
  /** Tempo = baseSpeed / (1 + loadSlowdown · Turmhöhe). */
  readonly loadSlowdown: number;
  /** Höchste Beschleunigung ohne Turm (Einheiten/s²); bestimmt, wie hart Lenken ist. */
  readonly accel: number;
  /** Trägheit: Beschleunigung = accel / (1 + loadInertia · Turmhöhe). */
  readonly loadInertia: number;
  readonly maxStack: number;
  /** Bis zu dieser Höhe wackelt nichts. */
  readonly safeStack: number;
  /** Wackel-Zuwachs: gain · (Höhe − safe) · (a/accel)² je Sekunde. */
  readonly wobbleGain: number;
  /** Wackeln durchs Laufen: walkWobble · (Höhe − safe) · (v/baseSpeed)² je Sekunde. */
  readonly walkWobble: number;
  /** Abklingen des Wackelns je Sekunde (exponentiell). */
  readonly wobbleDecay: number;
  /** Mindestabstand zwischen zwei Griffen in den Berg (s) … */
  readonly grabCooldown: number;
  /** … plus so viel je Törtchen, das schon auf dem Kopf liegt (hoch stapeln ist fummelig). */
  readonly grabSlowdown: number;
  /** Ab dieser Turmhöhe zählt die Lieferung `bonusFactor`-fach (null = kein Bonus). */
  readonly bonusFrom: number | null;
  readonly bonusFactor: number;
  /** Alle so viele Sekunden erscheint ein Goldtörtchen irgendwo (0 = nie). */
  readonly goldEvery: number;
  readonly goldValue: number;
  /** Goldtörtchen verschwindet nach so vielen Sekunden. */
  readonly goldLifetime: number;
  readonly bump: {
    readonly enabled: boolean;
    readonly speed: number;
    readonly duration: number;
    readonly cooldown: number;
    /** Trefferabstand (Mitte zu Mitte). */
    readonly reach: number;
    /** Nur mit leeren Händen rempeln. */
    readonly emptyHandsOnly: boolean;
    /** Anteil des umgeworfenen Turms, den der Rempler bekommt (abgerundet). */
    readonly steal: number;
    readonly stun: number;
    /** Daneben gerempelt: so lange selbst benommen (Bauchklatscher). */
    readonly missStun: number;
  };
  /** Benommen nach einem Sturz durch Wackeln (s). */
  readonly toppleStun: number;
}

export const WACKELTURM_PARAMS: WackelturmParams = {
  halfX: 8,
  halfZ: 4.5,
  pileRadius: 1.5,
  nestRadius: 1.15,
  nestInset: 1.4,
  bodyRadius: 0.45,
  baseSpeed: 4.6,
  loadSlowdown: 0.06,
  accel: 14,
  loadInertia: 0.12,
  maxStack: 10,
  safeStack: 2,
  wobbleGain: 0.5,
  walkWobble: 0.7,
  wobbleDecay: 1.3,
  grabCooldown: 0.25,
  grabSlowdown: 0.12,
  bonusFrom: 6,
  bonusFactor: 2,
  goldEvery: 7,
  goldValue: 3,
  goldLifetime: 6,
  bump: {
    enabled: true,
    speed: 10,
    duration: 0.22,
    cooldown: 2,
    reach: 1.05,
    emptyHandsOnly: true,
    steal: 1,
    stun: 0.7,
    missStun: 0.6,
  },
  toppleStun: 0.8,
};

export type Piece = 'normal' | 'gold';

export interface Runner {
  readonly slot: Slot;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Blickrichtung (Einheitsvektor), für das Rempeln. */
  fx: number;
  fz: number;
  stickX: number;
  stickZ: number;
  readonly stack: Piece[];
  /** 0 = ruhig, ≥ 1 = kippt. */
  wobble: number;
  score: number;
  stun: number;
  grabCooldown: number;
  bumpCooldown: number;
  dash: number;
  /** Statistik für Höhepunkte. */
  readonly stats: {
    delivered: number;
    bestDelivery: number;
    topples: number;
    bumpsLanded: number;
    stolen: number;
    gold: number;
  };
}

export interface GoldPiece {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  age: number;
}

export type WackelturmEvent =
  | { readonly type: 'grab'; readonly slot: Slot; readonly height: number }
  | { readonly type: 'gold'; readonly slot: Slot; readonly id: number }
  | { readonly type: 'gold-spawn'; readonly id: number; readonly x: number; readonly z: number }
  | { readonly type: 'gold-expire'; readonly id: number }
  | {
      readonly type: 'deliver';
      readonly slot: Slot;
      readonly count: number;
      readonly points: number;
      readonly bonus: boolean;
    }
  | {
      readonly type: 'topple';
      readonly slot: Slot;
      readonly count: number;
      readonly cause: 'wobble' | 'bump';
      readonly by?: Slot;
      readonly stolen?: number;
    }
  | { readonly type: 'dash'; readonly slot: Slot }
  | { readonly type: 'miss'; readonly slot: Slot }
  | { readonly type: 'bump'; readonly slot: Slot; readonly target: Slot }
  | { readonly type: 'end' };

export interface WackelturmState {
  readonly params: WackelturmParams;
  readonly limitSeconds: number;
  time: number;
  finished: boolean;
  readonly runners: Runner[];
  readonly gold: GoldPiece[];
  nextGoldAt: number;
  goldCounter: number;
}

/** Ecke des Nests je Slot: 1 hinten links, 2 hinten rechts, 3 vorn links, 4 vorn rechts. */
export function nestPosition(
  slot: Slot,
  params: WackelturmParams = WACKELTURM_PARAMS,
): { x: number; z: number } {
  const sx = slot === 1 || slot === 3 ? -1 : 1;
  const sz = slot === 1 || slot === 2 ? 1 : -1;
  return { x: sx * (params.halfX - params.nestInset), z: sz * (params.halfZ - params.nestInset) };
}

/** Laufgeschwindigkeit bei voller Auslenkung mit `height` Törtchen auf dem Kopf. */
export function speedFor(height: number, params: WackelturmParams = WACKELTURM_PARAMS): number {
  return params.baseSpeed / (1 + params.loadSlowdown * height);
}

/** Höchste Beschleunigung mit `height` Törtchen (schwere Türme sind träge). */
export function accelFor(height: number, params: WackelturmParams = WACKELTURM_PARAMS): number {
  return params.accel / (1 + params.loadInertia * height);
}

/** Wert eines Turms bei Lieferung: Summe der Stücke, ab `bonusFrom` mal `bonusFactor`. */
export function deliveryPoints(
  stack: readonly Piece[],
  params: WackelturmParams = WACKELTURM_PARAMS,
): { points: number; bonus: boolean } {
  const base = stack.reduce((sum, piece) => sum + (piece === 'gold' ? params.goldValue : 1), 0);
  const bonus = params.bonusFrom !== null && stack.length >= params.bonusFrom;
  return { points: bonus ? base * params.bonusFactor : base, bonus };
}

/**
 * Wackel-Zuwachs in einem Schritt: quadratisch in der Beschleunigung (sanftes Lenken ist
 * viel billiger als ein Haken) und im Tempo (wer mit hohem Turm rennt, schaukelt ihn auf),
 * linear in der Höhe über `safeStack`.
 */
export function wobbleIncrease(
  height: number,
  acceleration: number,
  speed: number,
  dt: number,
  params: WackelturmParams = WACKELTURM_PARAMS,
): number {
  const over = height - params.safeStack;
  if (over <= 0) return 0;
  const turn = Math.min(1, acceleration / params.accel);
  const pace = Math.min(1.5, speed / params.baseSpeed);
  return (params.wobbleGain * turn * turn + params.walkWobble * pace * pace) * over * dt;
}

/**
 * Stick-Auslenkung, bei der ein Turm dieser Höhe auf Dauer gerade nicht kippt
 * (Gleichgewicht aus Laufwackeln und Abklingen, ohne Lenken). ≥ 1 heißt: Vollgas ist sicher.
 */
export function steadyPace(height: number, params: WackelturmParams = WACKELTURM_PARAMS): number {
  const over = height - params.safeStack;
  if (over <= 0 || params.walkWobble <= 0) return Number.POSITIVE_INFINITY;
  const fullSpeed = speedFor(height, params) / params.baseSpeed;
  return Math.sqrt(params.wobbleDecay / (params.walkWobble * over)) / fullSpeed;
}

/** Darf `runner` gerade rempeln? */
export function canBump(runner: Runner, params: WackelturmParams = WACKELTURM_PARAMS): boolean {
  const { bump } = params;
  return (
    bump.enabled &&
    runner.stun <= 0 &&
    runner.dash <= 0 &&
    runner.bumpCooldown <= 0 &&
    (!bump.emptyHandsOnly || runner.stack.length === 0)
  );
}

export function inPile(runner: Runner, params: WackelturmParams = WACKELTURM_PARAMS): boolean {
  return Math.hypot(runner.x, runner.z) <= params.pileRadius;
}

export function inOwnNest(runner: Runner, params: WackelturmParams = WACKELTURM_PARAMS): boolean {
  const nest = nestPosition(runner.slot, params);
  return Math.hypot(runner.x - nest.x, runner.z - nest.z) <= params.nestRadius;
}

export function createWackelturm(
  slots: readonly Slot[],
  limitSeconds: number,
  params: WackelturmParams = WACKELTURM_PARAMS,
): WackelturmState {
  return {
    params,
    limitSeconds,
    time: 0,
    finished: false,
    gold: [],
    nextGoldAt: params.goldEvery > 0 ? params.goldEvery * 0.6 : Number.POSITIVE_INFINITY,
    goldCounter: 0,
    runners: slots.map((slot) => {
      const nest = nestPosition(slot, params);
      const length = Math.hypot(nest.x, nest.z) || 1;
      return {
        slot,
        x: nest.x,
        z: nest.z,
        vx: 0,
        vz: 0,
        fx: -nest.x / length,
        fz: -nest.z / length,
        stickX: 0,
        stickZ: 0,
        stack: [],
        wobble: 0,
        score: 0,
        stun: 0,
        grabCooldown: 0,
        bumpCooldown: 0,
        dash: 0,
        stats: { delivered: 0, bestDelivery: 0, topples: 0, bumpsLanded: 0, stolen: 0, gold: 0 },
      };
    }),
  };
}

export function findRunner(state: WackelturmState, slot: Slot): Runner | undefined {
  return state.runners.find((runner) => runner.slot === slot);
}

/** Joystick setzen (x rechts, y vorn/oben); Länge wird auf 1 begrenzt. */
export function setStick(state: WackelturmState, slot: Slot, x: number, y: number): void {
  const runner = findRunner(state, slot);
  if (!runner) return;
  const length = Math.hypot(x, y);
  const scale = length > 1 ? 1 / length : 1;
  runner.stickX = x * scale;
  runner.stickZ = y * scale;
}

/** A: ein Törtchen greifen (im Berg, mit Abklingzeit). */
export function pressGrab(state: WackelturmState, slot: Slot): WackelturmEvent[] {
  const runner = findRunner(state, slot);
  const { params } = state;
  if (!runner || state.finished || runner.stun > 0 || runner.grabCooldown > 0) return [];
  if (!inPile(runner, params) || runner.stack.length >= params.maxStack) return [];
  runner.grabCooldown = params.grabCooldown + params.grabSlowdown * runner.stack.length;
  runner.stack.push('normal');
  return [{ type: 'grab', slot, height: runner.stack.length }];
}

/** B: Rempel-Sprint in Blickrichtung. */
export function pressBump(state: WackelturmState, slot: Slot): WackelturmEvent[] {
  const runner = findRunner(state, slot);
  const { params } = state;
  if (!runner || state.finished || !canBump(runner, params)) return [];
  const stickLength = Math.hypot(runner.stickX, runner.stickZ);
  if (stickLength > 0.2) {
    runner.fx = runner.stickX / stickLength;
    runner.fz = runner.stickZ / stickLength;
  }
  runner.dash = params.bump.duration;
  runner.bumpCooldown = params.bump.cooldown;
  return [{ type: 'dash', slot }];
}

/** Ein fester Schritt. `next` liefert Zufall in [0, 1) (nur für Goldtörtchen). */
export function stepWackelturm(
  state: WackelturmState,
  dt: number,
  next: () => number,
): WackelturmEvent[] {
  if (state.finished) return [];
  const { params } = state;
  const events: WackelturmEvent[] = [];
  state.time += dt;

  for (const runner of state.runners) moveRunner(state, runner, dt, events);
  separate(state);
  for (const runner of state.runners) resolveDash(state, runner, events);
  for (const runner of state.runners) {
    collectGold(state, runner, events);
    if (runner.stack.length > 0 && inOwnNest(runner, params)) deliver(runner, params, events);
  }
  updateGold(state, dt, next, events);

  if (state.time >= state.limitSeconds - 1e-9) {
    state.finished = true;
    events.push({ type: 'end' });
  }
  return events;
}

function moveRunner(
  state: WackelturmState,
  runner: Runner,
  dt: number,
  events: WackelturmEvent[],
): void {
  const { params } = state;
  runner.grabCooldown = Math.max(0, runner.grabCooldown - dt);
  runner.bumpCooldown = Math.max(0, runner.bumpCooldown - dt);
  runner.stun = Math.max(0, runner.stun - dt);

  if (runner.dash > 0) {
    runner.dash = Math.max(0, runner.dash - dt);
    runner.vx = runner.fx * params.bump.speed;
    runner.vz = runner.fz * params.bump.speed;
    if (runner.dash <= 0 && params.bump.missStun > 0) {
      runner.stun = params.bump.missStun;
      events.push({ type: 'miss', slot: runner.slot });
    }
  } else if (runner.stun <= 0) {
    const speed = speedFor(runner.stack.length, params);
    const targetX = runner.stickX * speed;
    const targetZ = runner.stickZ * speed;
    const stickLength = Math.hypot(runner.stickX, runner.stickZ);
    if (stickLength > 0.2) {
      runner.fx = runner.stickX / stickLength;
      runner.fz = runner.stickZ / stickLength;
    }
    let dvx = targetX - runner.vx;
    let dvz = targetZ - runner.vz;
    const dv = Math.hypot(dvx, dvz);
    const maxDv = accelFor(runner.stack.length, params) * dt;
    if (dv > maxDv) {
      dvx *= maxDv / dv;
      dvz *= maxDv / dv;
    }
    runner.vx += dvx;
    runner.vz += dvz;
    const acceleration = Math.min(dv, maxDv) / dt;
    const speedNow = Math.hypot(runner.vx, runner.vz);
    runner.wobble += wobbleIncrease(runner.stack.length, acceleration, speedNow, dt, params);
  } else {
    // Benommen: ausrollen.
    const damping = Math.max(0, 1 - 6 * dt);
    runner.vx *= damping;
    runner.vz *= damping;
  }
  runner.wobble *= Math.exp(-params.wobbleDecay * dt);
  if (runner.stack.length === 0) runner.wobble = 0;

  runner.x += runner.vx * dt;
  runner.z += runner.vz * dt;
  const limitX = params.halfX - params.bodyRadius;
  const limitZ = params.halfZ - params.bodyRadius;
  if (Math.abs(runner.x) > limitX) {
    runner.x = Math.sign(runner.x) * limitX;
    runner.vx = 0;
  }
  if (Math.abs(runner.z) > limitZ) {
    runner.z = Math.sign(runner.z) * limitZ;
    runner.vz = 0;
  }

  if (runner.wobble >= 1 && runner.stack.length > 0) {
    events.push({ type: 'topple', slot: runner.slot, count: runner.stack.length, cause: 'wobble' });
    runner.stats.topples += 1;
    runner.stack.length = 0;
    runner.wobble = 0;
    runner.stun = params.toppleStun;
  }
}

/** Figuren schieben sich gegenseitig weg (feste Reihenfolge, deterministisch). */
function separate(state: WackelturmState): void {
  const min = state.params.bodyRadius * 2;
  const { runners } = state;
  for (let i = 0; i < runners.length; i++) {
    for (let j = i + 1; j < runners.length; j++) {
      const a = runners[i];
      const b = runners[j];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= min) continue;
      // Genau übereinander: fest nach Slot-Reihenfolge trennen.
      const nx = distance < 1e-6 ? (a.slot < b.slot ? 1 : -1) : dx / distance;
      const nz = distance < 1e-6 ? 0 : dz / distance;
      const push = (min - distance) / 2;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
    }
  }
}

function resolveDash(state: WackelturmState, runner: Runner, events: WackelturmEvent[]): void {
  const { params } = state;
  if (runner.dash <= 0) return;
  for (const target of state.runners) {
    if (target === runner || target.stun > 0) continue;
    if (Math.hypot(target.x - runner.x, target.z - runner.z) > params.bump.reach) continue;
    if (inOwnNest(target, params)) continue;
    runner.dash = 0;
    runner.vx *= 0.2;
    runner.vz *= 0.2;
    runner.stats.bumpsLanded += 1;
    events.push({ type: 'bump', slot: runner.slot, target: target.slot });
    const count = target.stack.length;
    if (count > 0) {
      const room = params.maxStack - runner.stack.length;
      const stolen = Math.min(room, Math.floor(count * params.bump.steal));
      const taken = target.stack.splice(count - stolen, stolen);
      runner.stack.push(...taken);
      runner.stats.stolen += stolen;
      target.stack.length = 0;
      target.stats.topples += 1;
      events.push({
        type: 'topple',
        slot: target.slot,
        count,
        cause: 'bump',
        by: runner.slot,
        stolen,
      });
    }
    target.wobble = 0;
    target.stun = params.bump.stun;
    target.vx = runner.fx * 5;
    target.vz = runner.fz * 5;
    return;
  }
}

function collectGold(state: WackelturmState, runner: Runner, events: WackelturmEvent[]): void {
  const { params } = state;
  if (runner.stun > 0 || runner.stack.length >= params.maxStack) return;
  const index = state.gold.findIndex(
    (gold) => Math.hypot(gold.x - runner.x, gold.z - runner.z) <= params.bodyRadius + 0.35,
  );
  if (index < 0) return;
  const [gold] = state.gold.splice(index, 1);
  if (!gold) return;
  runner.stack.push('gold');
  runner.stats.gold += 1;
  events.push({ type: 'gold', slot: runner.slot, id: gold.id });
}

function deliver(runner: Runner, params: WackelturmParams, events: WackelturmEvent[]): void {
  const { points, bonus } = deliveryPoints(runner.stack, params);
  const count = runner.stack.length;
  runner.score += points;
  runner.stats.delivered += count;
  runner.stats.bestDelivery = Math.max(runner.stats.bestDelivery, count);
  runner.stack.length = 0;
  runner.wobble = 0;
  events.push({ type: 'deliver', slot: runner.slot, count, points, bonus });
}

function updateGold(
  state: WackelturmState,
  dt: number,
  next: () => number,
  events: WackelturmEvent[],
): void {
  const { params } = state;
  for (let index = state.gold.length - 1; index >= 0; index--) {
    const gold = state.gold[index];
    if (!gold) continue;
    gold.age += dt;
    if (gold.age >= params.goldLifetime) {
      state.gold.splice(index, 1);
      events.push({ type: 'gold-expire', id: gold.id });
    }
  }
  // Kein neues Gold in den letzten Sekunden (wäre unerreichbar).
  if (state.time < state.nextGoldAt || state.time > state.limitSeconds - 3) return;
  state.nextGoldAt = state.time + params.goldEvery;
  const spot = goldSpot(state, next);
  const id = ++state.goldCounter;
  state.gold.push({ id, x: spot.x, z: spot.z, age: 0 });
  events.push({ type: 'gold-spawn', id, x: spot.x, z: spot.z });
}

/**
 * Goldtörtchen liegen zwischen Berg und Rand, nie in einem Nest und nie im Berg – ein
 * Umweg, der sich lohnt, wenn der Turm noch niedrig ist.
 */
export function goldSpot(state: WackelturmState, next: () => number): { x: number; z: number } {
  const { params } = state;
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = (next() * 2 - 1) * (params.halfX - 1);
    const z = (next() * 2 - 1) * (params.halfZ - 0.8);
    if (Math.hypot(x, z) < params.pileRadius + 1) continue;
    const nearNest = ([1, 2, 3, 4] as const).some((slot) => {
      const nest = nestPosition(slot, params);
      return Math.hypot(nest.x - x, nest.z - z) < params.nestRadius + 1.2;
    });
    if (!nearNest) return { x, z };
  }
  return { x: 0, z: params.halfZ - 1 };
}

/** Rangliste nach Punkten (für Bots und Simulation). */
export function scoresOf(state: WackelturmState): { slot: Slot; score: number }[] {
  return state.runners.map((runner) => ({ slot: runner.slot, score: runner.score }));
}
