/**
 * Konzept B „Geysir-Gier“ (EXP-007): Logik-Prototyp mit Bots, ohne Babylon.
 *
 * Vier Blubberbecken mit verschiedenem Ertrag. Wer in einem Becken steht, füllt seinen Topf
 * (Ertrag wird unter allen im Becken geteilt; je länger man bleibt, desto höher der
 * Multiplikator ×1/×2/×3). Wer das Becken verlässt, sichert den Topf. Die ertragreichen
 * Becken brechen öfter aus – mit kürzerer Vorwarnung. Wer beim Ausbruch drinsteht, verliert
 * den Topf. A = Hüpfer: Wer beim Ausbruch in der Luft ist, reitet den Geysir (Topf ×2).
 * B = Schubsen.
 */
import { createMinigameRng, type MinigameRng } from '@chaos-party/minigame-sdk';
import {
  botRng,
  gauss,
  InputCounter,
  LeadTracker,
  STEP,
  type BotProfile,
  type Concept,
  type GameRecord,
} from './common.ts';

export interface PadSpec {
  readonly x: number;
  readonly z: number;
  /** Punkte je Sekunde (geteilt durch Anzahl im Becken). */
  readonly rate: number;
  /** Mittlerer Abstand zwischen Ausbrüchen (s), 0 = nie. */
  readonly every: number;
  /** Vorwarnzeit (s). */
  readonly warn: number;
}

export interface GeysirParams {
  readonly pads: readonly PadSpec[];
  readonly padRadius: number;
  readonly speed: number;
  /** Sekunden je Multiplikatorstufe; höchstens ×`maxMult`. */
  readonly multEvery: number;
  readonly maxMult: number;
  readonly burst: number;
  readonly airTime: number;
  readonly jumpCooldown: number;
  readonly rideFactor: number;
  /** Anteil der Ausbrüche mit sehr kurzer Vorwarnung (0,15 s). */
  readonly surprise: number;
  readonly shove: boolean;
}

export const GEYSIR_PARAMS: GeysirParams = {
  pads: [
    { x: -4.6, z: 0, rate: 1, every: 0, warn: 0 },
    { x: 0, z: 2.3, rate: 2, every: 9, warn: 1.1 },
    { x: 4.6, z: 0, rate: 3, every: 7, warn: 0.85 },
    { x: 0, z: -2.3, rate: 5, every: 5, warn: 0.6 },
  ],
  padRadius: 1.5,
  speed: 4.5,
  multEvery: 3,
  maxMult: 3,
  burst: 0.5,
  airTime: 0.7,
  jumpCooldown: 1.2,
  rideFactor: 2,
  surprise: 0.15,
  shove: true,
};

interface Pad extends PadSpec {
  phase: 'calm' | 'warn' | 'burst';
  timer: number;
  riders: Set<number>;
}

interface Player {
  x: number;
  z: number;
  stickX: number;
  stickZ: number;
  pad: number;
  tOn: number;
  pot: number;
  score: number;
  air: number;
  jumpCd: number;
  shoveCd: number;
  stun: number;
}

export interface GeysirState {
  readonly params: GeysirParams;
  readonly pads: Pad[];
  readonly players: Player[];
  time: number;
  readonly limit: number;
  /** Zuschauer-Momente: Treffer und Ritte. */
  drama: number;
  /** Sicherungen (gesicherte Töpfe) für Führungswechsel. */
  banked: boolean;
}

function padAt(state: GeysirState, x: number, z: number): number {
  return state.pads.findIndex((pad) => Math.hypot(pad.x - x, pad.z - z) <= state.params.padRadius);
}

export function createGeysir(
  players: number,
  limit: number,
  params: GeysirParams,
  rng: MinigameRng,
): GeysirState {
  const corners = [
    [-7, 3.5],
    [7, 3.5],
    [-7, -3.5],
    [7, -3.5],
  ] as const;
  return {
    params,
    limit,
    time: 0,
    drama: 0,
    banked: false,
    pads: params.pads.map((spec) => ({
      ...spec,
      phase: 'calm',
      timer: spec.every > 0 ? spec.every * (0.5 + rng.next()) : Number.POSITIVE_INFINITY,
      riders: new Set(),
    })),
    players: Array.from({ length: players }, (_, index) => ({
      x: corners[index]?.[0] ?? 0,
      z: corners[index]?.[1] ?? 0,
      stickX: 0,
      stickZ: 0,
      pad: -1,
      tOn: 0,
      pot: 0,
      score: 0,
      air: 0,
      jumpCd: 0,
      shoveCd: 0,
      stun: 0,
    })),
  };
}

export function multiplier(tOn: number, params: GeysirParams): number {
  return 1 + Math.min(params.maxMult - 1, Math.floor(tOn / params.multEvery));
}

export function jump(state: GeysirState, index: number): boolean {
  const player = state.players[index];
  if (!player || player.stun > 0 || player.air > 0 || player.jumpCd > 0) return false;
  player.air = state.params.airTime;
  player.jumpCd = state.params.jumpCooldown;
  return true;
}

export function shove(state: GeysirState, index: number): boolean {
  const player = state.players[index];
  if (!state.params.shove || !player || player.stun > 0 || player.shoveCd > 0) return false;
  player.shoveCd = 2;
  const target = state.players
    .map((other, otherIndex) => ({ other, otherIndex }))
    .filter(({ other, otherIndex }) => otherIndex !== index && other.air <= 0)
    .map((entry) => ({
      ...entry,
      d: Math.hypot(entry.other.x - player.x, entry.other.z - player.z),
    }))
    .filter((entry) => entry.d < 1.3)
    .sort((a, b) => a.d - b.d)[0];
  if (!target) return true;
  const dx = target.other.x - player.x;
  const dz = target.other.z - player.z;
  const length = Math.hypot(dx, dz) || 1;
  target.other.x += (dx / length) * 2.2;
  target.other.z += (dz / length) * 2.2;
  target.other.stun = 0.4;
  return true;
}

export function stepGeysir(state: GeysirState, rng: MinigameRng): void {
  const { params } = state;
  state.time += STEP;
  state.banked = false;
  state.players.forEach((player) => {
    player.air = Math.max(0, player.air - STEP);
    player.jumpCd = Math.max(0, player.jumpCd - STEP);
    player.shoveCd = Math.max(0, player.shoveCd - STEP);
    player.stun = Math.max(0, player.stun - STEP);
    if (player.stun <= 0) {
      const speed = params.speed * (player.air > 0 ? 0.6 : 1);
      player.x = Math.max(-7.6, Math.min(7.6, player.x + player.stickX * speed * STEP));
      player.z = Math.max(-4.1, Math.min(4.1, player.z + player.stickZ * speed * STEP));
    }
  });
  // Beckenwechsel sichert den Topf.
  state.players.forEach((player) => {
    const pad = padAt(state, player.x, player.z);
    if (pad !== player.pad) {
      if (player.pot > 0) state.banked = true;
      player.score += player.pot;
      player.pot = 0;
      player.tOn = 0;
      player.pad = pad;
    } else if (pad >= 0) {
      player.tOn += STEP;
    }
  });
  state.pads.forEach((pad, padIndex) => {
    const grounded = state.players.filter((p) => p.pad === padIndex && p.air <= 0);
    if (pad.phase !== 'burst') {
      for (const player of grounded) {
        player.pot += (pad.rate * multiplier(player.tOn, params) * STEP) / grounded.length;
      }
    }
    pad.timer -= STEP;
    if (pad.timer > 0) return;
    if (pad.phase === 'calm') {
      pad.phase = 'warn';
      pad.timer = rng.next() < params.surprise ? 0.15 : pad.warn;
    } else if (pad.phase === 'warn') {
      pad.phase = 'burst';
      pad.timer = params.burst;
      pad.riders = new Set(
        state.players.flatMap((p, index) => (p.pad === padIndex && p.air > 0 ? [index] : [])),
      );
    } else {
      pad.phase = 'calm';
      pad.timer = pad.every * (0.6 + rng.next() * 0.8);
      for (const index of pad.riders) {
        const rider = state.players[index];
        if (rider?.pad === padIndex) {
          rider.pot *= params.rideFactor;
          state.drama++;
        }
      }
      pad.riders.clear();
    }
  });
  // Treffer während des Ausbruchs.
  state.pads.forEach((pad, padIndex) => {
    if (pad.phase !== 'burst') return;
    state.players.forEach((player, index) => {
      if (player.pad !== padIndex || player.air > 0) return;
      pad.riders.delete(index);
      if (player.pot > 0.5) state.drama++;
      player.pot = 0;
      player.tOn = 0;
      player.stun = 1;
      const dx = player.x - pad.x;
      const dz = player.z - pad.z;
      const length = Math.hypot(dx, dz) || 1;
      player.x = pad.x + (dx / length) * (params.padRadius + 0.8);
      player.z = pad.z + (dz / length) * (params.padRadius + 0.8);
      player.pad = -1;
    });
  });
}

/** Bot für Geysir-Gier. */
class GeysirBot {
  private readonly reaction: number;
  private readonly timing: number;
  private nextThink = 0;
  private goal = -1;
  private leaveAt = 0;
  private jumpAt = Number.POSITIVE_INFINITY;
  private leaving = false;
  readonly counter = new InputCounter();

  constructor(
    private readonly profile: BotProfile,
    private readonly rng: MinigameRng,
  ) {
    this.reaction = 0.45 - 0.3 * profile.skill;
    this.timing = 0.05 + (1 - profile.skill) * 0.2;
  }

  private riskWeight(rate: number): number {
    const order = [1, 2, 3, 5].indexOf(rate);
    switch (this.profile.strategy) {
      case 'vorsichtig':
        return [1, 0.8, 0.45, 0.2][order] ?? 0.5;
      case 'gierig':
      case 'raufbold':
        return [0.5, 0.8, 1, 1.2][order] ?? 1;
      case 'zufaellig':
        return 0.3 + this.rng.next();
    }
  }

  private stayFor(): number {
    switch (this.profile.strategy) {
      case 'vorsichtig':
        return 3.2;
      case 'gierig':
        return 9;
      case 'raufbold':
        return 6.5;
      case 'zufaellig':
        return 1 + this.rng.next() * 9;
    }
  }

  act(state: GeysirState, index: number): void {
    const me = state.players[index];
    if (!me) return;
    if (state.time >= this.jumpAt) {
      this.jumpAt = Number.POSITIVE_INFINITY;
      if (jump(state, index)) this.counter.press('a');
    }
    if (state.time < this.nextThink) return;
    this.nextThink = state.time + this.reaction * (0.8 + this.rng.next() * 0.4);
    const pad = me.pad >= 0 ? state.pads[me.pad] : undefined;

    // Warnung gesehen?
    if (pad?.phase === 'warn' && !this.leaving && this.jumpAt === Infinity) {
      const ride =
        this.profile.strategy === 'gierig' ||
        (this.profile.strategy === 'zufaellig' && this.rng.next() < 0.5) ||
        (this.profile.strategy === 'raufbold' && this.rng.next() < 0.3);
      if (ride && me.pot > 1 && state.params.rideFactor > 0) {
        // Ausbruch beginnt in pad.timer; in der Luft sein, wenn er beginnt.
        this.jumpAt = state.time + Math.max(0, pad.timer - 0.2 + gauss(this.rng, this.timing));
      } else {
        this.leaving = true;
      }
    }

    const onGoal = me.pad >= 0 && me.pad === this.goal;
    if (onGoal && !this.leaving) {
      if (me.tOn >= this.leaveAt) {
        this.leaving = true;
      } else {
        // Raufbold schubst Mitbewohner raus.
        if (this.profile.strategy === 'raufbold' && state.params.shove) {
          const crowded = state.players.some(
            (other, otherIndex) =>
              otherIndex !== index &&
              other.pad === me.pad &&
              Math.hypot(other.x - me.x, other.z - me.z) < 1.3,
          );
          if (crowded && shove(state, index)) this.counter.press('b');
        }
        this.setStick(me, 0, 0, 0);
        return;
      }
    }
    if (this.leaving) {
      if (pad) {
        this.setStick(me, me.x - pad.x || 0.1, me.z - pad.z, 1);
        return;
      }
      this.leaving = false;
      this.goal = -1;
    }
    if (this.goal < 0) {
      this.goal = this.choosePad(state, me);
      this.leaveAt = this.stayFor();
    }
    const target = state.pads[this.goal];
    if (!target) return;
    const dx = target.x - me.x;
    const dz = target.z - me.z;
    const distance = Math.hypot(dx, dz);
    this.setStick(me, dx, dz, distance < 0.6 ? 0 : Math.min(1, distance));
  }

  private choosePad(state: GeysirState, me: Player): number {
    let best = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    state.pads.forEach((pad, padIndex) => {
      const occupants = state.players.filter((p) => p !== me && p.pad === padIndex).length;
      const distance = Math.hypot(pad.x - me.x, pad.z - me.z);
      const value =
        (pad.rate / (occupants + 1)) * this.riskWeight(pad.rate) -
        distance * 0.05 +
        this.rng.next() * 0.2;
      if (value > bestValue) {
        bestValue = value;
        best = padIndex;
      }
    });
    return best;
  }

  private setStick(me: Player, dx: number, dz: number, magnitude: number): void {
    const length = Math.hypot(dx, dz);
    if (length < 1e-6 || magnitude === 0) {
      me.stickX = 0;
      me.stickZ = 0;
    } else {
      const angle = Math.atan2(dz, dx) + gauss(this.rng, (1 - this.profile.skill) * 0.3);
      me.stickX = Math.cos(angle) * magnitude;
      me.stickZ = Math.sin(angle) * magnitude;
    }
    this.counter.stick(me.stickX, me.stickZ);
  }
}

export const GEYSIR_VARIANTS: readonly { key: string; label: string; params: GeysirParams }[] = [
  {
    key: 'B1',
    label: 'B1: ohne Hüpfer-Ritt, ohne Schubsen',
    params: { ...GEYSIR_PARAMS, rideFactor: 0, shove: false },
  },
  { key: 'B2', label: 'B2: + Hüpfer-Ritt ×2, Schubsen', params: GEYSIR_PARAMS },
  {
    key: 'B3',
    label: 'B3: B2 ohne Überraschungs-Ausbrüche',
    params: { ...GEYSIR_PARAMS, surprise: 0 },
  },
  {
    key: 'B4',
    label: 'B4: B2, rotes Becken öfter, Ritt nur ×1,5',
    params: {
      ...GEYSIR_PARAMS,
      rideFactor: 1.5,
      pads: GEYSIR_PARAMS.pads.map((pad) =>
        pad.rate === 5 ? { ...pad, every: 3.5, warn: 0.5 } : pad,
      ),
    },
  },
];

export const GEYSIR_CONCEPT: Concept<GeysirParams> = {
  id: 'B',
  title: 'Geysir-Gier',
  instructions: [
    'Steh im Becken: Dein Topf füllt sich – je länger, je mehr.',
    'Raus aus dem Becken sichert den Topf. Es blubbert? Ausbruch!',
    'A hüpft: Geysir in der Luft reiten = doppelt. B schubst.',
  ],
  controls: { joystick: 'Laufen', a: 'Hüpfen', b: 'Schubsen' },
  durationSeconds: 35,
  play: (profiles, seed, params) => playGeysir(profiles, seed, params),
};

export function playGeysir(
  profiles: readonly BotProfile[],
  seed: number,
  params: GeysirParams = GEYSIR_PARAMS,
  seconds = 35,
): GameRecord {
  const rng = createMinigameRng(seed);
  const state = createGeysir(profiles.length, seconds, params, rng);
  const bots = profiles.map((profile, seat) => new GeysirBot(profile, botRng(seed, seat)));
  const lead = new LeadTracker();
  while (state.time < state.limit - 1e-9) {
    bots.forEach((bot, index) => {
      bot.act(state, index);
    });
    stepGeysir(state, rng);
    if (state.banked) lead.update(state.players.map((player) => Math.round(player.score)));
  }
  // Schlusspfiff sichert alle Töpfe.
  for (const player of state.players) player.score += player.pot;
  const inputs = bots.reduce((sum, bot) => sum + bot.counter.count, 0);
  const presses = bots.reduce((sum, bot) => sum + bot.counter.presses, 0);
  const bPresses = bots.reduce((sum, bot) => sum + bot.counter.bPresses, 0);
  return {
    scores: state.players.map((player) => Math.round(player.score)),
    seconds: state.time,
    dramaticMoments: state.drama,
    inputsPerSecond: inputs / profiles.length / state.time,
    bShare: presses > 0 ? bPresses / presses : 0,
    leadChanges: lead.changes,
  };
}
