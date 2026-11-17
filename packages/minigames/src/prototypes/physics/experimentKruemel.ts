/**
 * EXP-023 (CHAOS-79): Krümel-Kehraus überarbeitet. Vergleicht die neue Fassung (echte
 * Spiellogik, Varianten = Regel-Sätze) mit dem alten Prototyp aus EXP-006 (B) und erzeugt die
 * Tabellen für `docs/experiments.md`:
 *
 * ```sh
 * EXPERIMENTS=1 pnpm exec vitest run packages/minigames/src/prototypes/physics/experimentKruemel --silent=false
 * ```
 *
 * Seeds je Zeile: `KRUEMEL_SEEDS` (Standard 60).
 */
import { createMinigameRng, type MinigameRng, type Slot } from '@chaos-party/minigame-sdk';
import type { MinigameModule } from '@chaos-party/minigame-sdk/babylon';
import { runMinigameHeadless } from '@chaos-party/minigame-sdk/testing';
import { KruemelKehraus, type KruemelSnapshot } from '../../kruemel-kehraus/index.ts';
import { KRUEMEL_KEHRAUS_INFO } from '../../kruemel-kehraus/info.ts';
import { KRUEMEL_RULES, leaderOf, TUNING, type KruemelRules } from '../../kruemel-kehraus/logic.ts';
import { createKruemelPrototype, KRUEMEL as PROTO } from './kruemel.ts';
import {
  clampToTray,
  kruemelDecision,
  slideOnTray,
  type BotView,
  type KruemelStrategy,
} from './kruemelKehrausBot.ts';
import { SKILLS, type BotDecision, type BotSkill } from './shared.ts';

const DURATION_MS = 30_000;

export interface KruemelVariant {
  readonly id: string;
  readonly label: string;
  /** Regeln der neuen Fassung; ohne = alter Prototyp aus EXP-006. */
  readonly rules?: KruemelRules;
}

const R1: KruemelRules = { ...KRUEMEL_RULES, goldEveryMs: null, rainMs: null };
const R2: KruemelRules = { ...KRUEMEL_RULES, rainMs: null };

export const KRUEMEL_VARIANTS: readonly KruemelVariant[] = [
  { id: 'B', label: 'alt (EXP-006): runder Tisch, 10 Krümel, Lücken, Knäuel' },
  { id: 'R1', label: 'Blech, Ecken-Löcher, 6 Krümel', rules: R1 },
  { id: 'R2', label: 'R1 + Goldkrümel (3)', rules: R2 },
  { id: 'R3', label: 'R2 + Keksregen (gewählt)', rules: KRUEMEL_RULES },
  { id: 'R4', label: 'R3 mit 4 Krümeln', rules: { ...KRUEMEL_RULES, crumbs: 4 } },
  { id: 'R5', label: 'R3 mit 9 Krümeln', rules: { ...KRUEMEL_RULES, crumbs: 9 } },
  { id: 'R6', label: 'R3 + Wollknäuel', rules: { ...KRUEMEL_RULES, ball: true } },
];

export interface Seat {
  readonly skill: BotSkill;
  readonly strategy: KruemelStrategy;
}

export interface KruemelRecord {
  readonly players: number;
  readonly seed: number;
  /** Punkte und Platz je Sitz (Index = Spielerreihenfolge = Ecke). */
  readonly seats: readonly {
    readonly slot: Slot;
    readonly score: number;
    readonly place: number;
  }[];
  readonly leadChanges: number;
  /** Sieger führte nach 2/3 der Zeit nicht allein (nur bei alleinigem Sieg). */
  readonly comeback: boolean;
  readonly tieFirst: boolean;
  /** (Punkte P1 − P2) / Punkte P1. */
  readonly gap12: number;
  readonly counters: Readonly<Record<string, number>>;
  readonly unstable: number;
  readonly maxSpeed: number;
  readonly stepMs: number;
}

interface Adapter {
  readonly module: MinigameModule;
  view(): (BotView & { counters: Record<string, number>; unstable: number }) | null;
  /** Nur der alte Prototyp: Punkte kommen aus dem HUD der Laufzeit. */
  setScores?(scores: readonly { slot: Slot; score: number }[]): void;
}

function newGameAdapter(rules: KruemelRules): Adapter {
  let game: KruemelKehraus | null = null;
  return {
    module: {
      info: KRUEMEL_KEHRAUS_INFO,
      create: () => {
        game = new KruemelKehraus(rules);
        return game;
      },
    },
    view: () => {
      if (!game) return null;
      const snap: KruemelSnapshot = game.snapshot();
      let unstable = 0;
      for (const pawn of snap.pawns) {
        const inside = Math.abs(pawn.x) < TUNING.halfX && Math.abs(pawn.z) < TUNING.halfZ;
        if (inside && pawn.y < 0.3) unstable++;
      }
      for (const crumb of snap.crumbs) {
        if (!crumb.active) continue;
        const inside =
          Math.abs(crumb.x) < TUNING.halfX - 0.5 && Math.abs(crumb.z) < TUNING.halfZ - 0.5;
        if (inside && crumb.y < -0.1) unstable++;
      }
      return {
        pawns: snap.pawns,
        crumbs: snap.crumbs,
        goals: snap.goals,
        scores: snap.scores,
        clamp: clampToTray,
        slide: slideOnTray(snap.pawns.length),
        counters: { ...snap.counters, falls: 0 },
        unstable,
      };
    },
  };
}

function prototypeAdapter(): Adapter {
  const proto = createKruemelPrototype(DURATION_MS);
  let scores: readonly { slot: Slot; score: number }[] = [];
  return {
    module: proto.module,
    setScores: (next) => {
      scores = next;
    },
    view: () => {
      const view = proto.peek();
      if (!view) return null;
      const r = PROTO.radius;
      const clamp = (x: number, z: number) => {
        const max = r - 0.6;
        const len = Math.hypot(x, z);
        return len <= max ? { x, z } : { x: (x / len) * max, z: (z / len) * max };
      };
      return {
        pawns: view.pawns
          .filter((pawn) => !pawn.out)
          .map(({ slot, x, y, z, vx, vy, vz, canDash }) => ({
            slot,
            x,
            y,
            z,
            vx,
            vy,
            vz,
            canDash,
          })),
        crumbs: view.props.slice(0, PROTO.crumbs).map((prop, index) => ({
          index,
          x: prop.x,
          y: prop.y,
          z: prop.z,
          vx: prop.vx,
          vy: prop.vy,
          vz: prop.vz,
          active: prop.active,
          value: 1,
          radius: PROTO.crumbRadius,
        })),
        goals: [...view.goals].map(([slot, angle]) => ({
          slot,
          corner: {
            mouth: { x: Math.cos(angle) * r, z: Math.sin(angle) * r },
            normal: { x: Math.cos(angle), z: Math.sin(angle) },
          },
        })),
        scores,
        clamp,
        slide: (_crumb, dir) => dir,
        counters: { scored: view.counters.crumbs ?? 0, falls: view.counters.falls ?? 0 },
        unstable: view.tunneled(),
      };
    },
  };
}

/** Ein Lauf mit Bots; `seats[i]` spielt den i-ten Platz (= Ecke). */
export async function simulateKruemel(
  variant: KruemelVariant,
  seed: number,
  seats: readonly Seat[],
): Promise<KruemelRecord> {
  const players = seats.length;
  const adapter = variant.rules ? newGameAdapter(variant.rules) : prototypeAdapter();
  const rng: MinigameRng = createMinigameRng(seed * 7919 + 13);
  const plans = new Map<Slot, BotDecision>();
  const stepTimes: number[] = [];
  let lastCall: number | null = null;
  let step = 0;
  let leadChanges = 0;
  // Objekt statt `let`: TypeScript verfolgt Zuweisungen in der Skript-Funktion sonst nicht.
  const lead: { last: Slot | null; atTwoThirds: Slot | null } = { last: null, atTwoThirds: null };
  let maxSpeed = 0;
  let unstable = 0;
  let counters: Record<string, number> = {};
  const run = await runMinigameHeadless(adapter.module, {
    players,
    seed,
    timeLimitMs: DURATION_MS,
    script: (elapsedMs, send, runner) => {
      const now = performance.now();
      if (lastCall !== null) stepTimes.push(now - lastCall);
      adapter.setScores?.(runner.hud().scores);
      const view = adapter.view();
      if (view) {
        for (const body of [...view.pawns, ...view.crumbs.filter((crumb) => crumb.active)]) {
          const values = [body.x, body.y, body.z, body.vx, body.vy, body.vz];
          if (values.some((value) => !Number.isFinite(value))) unstable++;
          maxSpeed = Math.max(maxSpeed, Math.hypot(body.vx, body.vy, body.vz));
        }
        unstable += view.unstable;
        counters = view.counters;
        const leader = leaderOf(view.scores);
        if (leader !== null && leader !== lead.last) {
          if (lead.last !== null) leadChanges++;
          lead.last = leader;
        }
        if (elapsedMs <= (DURATION_MS * 2) / 3) lead.atTwoThirds = leader;
        for (const me of view.pawns) {
          const seat = seats[me.slot - 1];
          if (!seat) continue;
          if ((step + me.slot * 3) % seat.skill.replanSteps === 0 || !plans.has(me.slot)) {
            const decision = kruemelDecision(me, view, seat.skill, seat.strategy, rng);
            plans.set(me.slot, decision);
            send(me.slot, { type: 'move', x: decision.x, y: decision.y });
            if (decision.dash) {
              send(me.slot, { type: 'press', button: 'a' });
              send(me.slot, { type: 'release', button: 'a' });
            }
          }
        }
      }
      step++;
      lastCall = performance.now();
    },
  });
  const outcome = run.outcome;
  if (!outcome) throw new Error('Krümel-Kehraus lieferte kein Ergebnis');
  if (Object.values(run.residue).some((count) => count !== 0)) unstable++;
  const placements = outcome.result.placements;
  const bySlot = new Map(placements.map((p) => [p.slot, p]));
  const firsts = placements.filter((p) => p.place === 1);
  const sorted = placements.map((p) => p.score).sort((a, b) => b - a);
  const s1 = sorted[0] ?? 0;
  const s2 = sorted[1] ?? 0;
  const soleWinner = firsts.length === 1 ? firsts[0]?.slot : undefined;
  stepTimes.sort((a, b) => a - b);
  return {
    players,
    seed,
    seats: seats.map((_, index) => {
      const slot = (index + 1) as Slot;
      const placement = bySlot.get(slot);
      return { slot, score: placement?.score ?? 0, place: placement?.place ?? players };
    }),
    leadChanges,
    comeback: soleWinner !== undefined && lead.atTwoThirds !== soleWinner,
    tieFirst: firsts.length > 1,
    gap12: s1 > 0 ? (s1 - s2) / s1 : 0,
    counters: { ...counters },
    unstable,
    maxSpeed,
    stepMs: stepTimes.reduce((sum, t) => sum + t, 0) / Math.max(1, stepTimes.length),
  };
}

// --- Tabellen ---------------------------------------------------------------------------

const de = (value: number, digits = 1) =>
  value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (value: number) => `${Math.round(value * 100)} %`;

export function seedCount(): number {
  const raw = Number(process.env.KRUEMEL_SEEDS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60;
}

const normal: Seat = { skill: SKILLS.normal, strategy: 'normal' };
const weak: Seat = { skill: SKILLS.weak, strategy: 'normal' };
const slightlyWeak: Seat = { skill: SKILLS.slightlyWeak, strategy: 'normal' };

/** Besetzung: ein schwacher Bot reihum auf einem Platz, sonst normale. */
export function weakSeats(players: number, seed: number): { seats: Seat[]; weakIndex: number } {
  const weakIndex = (seed - 1) % players;
  return {
    seats: Array.from({ length: players }, (_, index) => (index === weakIndex ? weak : normal)),
    weakIndex,
  };
}

/** Siegquote mit geteilten Siegen anteilig. */
function winShare(record: KruemelRecord, index: number): number {
  const firsts = record.seats.filter((seat) => seat.place === 1).length;
  return record.seats[index]?.place === 1 ? 1 / Math.max(1, firsts) : 0;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export async function mainTable(
  variants: readonly KruemelVariant[],
  seeds: number,
): Promise<string> {
  const head = [
    'Variante',
    'Sp.',
    'Punkte P1',
    'Abstand 1–2',
    'Gleichstand P1',
    'Führungswechsel',
    'Comeback',
    'Siege schwach',
    'fair',
    'Treffer/Runde',
    'fremde Löcher',
    'Rempler',
    'Stürze',
    'instabil',
    'max m/s',
    'ms/Schritt',
  ];
  const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
  for (const variant of variants) {
    for (const players of [2, 3, 4]) {
      const records: KruemelRecord[] = [];
      const weakWins: number[] = [];
      for (let seed = 1; seed <= seeds; seed++) {
        const { seats, weakIndex } = weakSeats(players, seed);
        const record = await simulateKruemel(variant, seed, seats);
        records.push(record);
        weakWins.push(winShare(record, weakIndex));
      }
      const c = (key: string) => mean(records.map((r) => r.counters[key] ?? 0));
      lines.push(
        `| ${[
          `${variant.id}: ${variant.label}`,
          String(players),
          de(mean(records.map((r) => Math.max(...r.seats.map((s) => s.score))))),
          pct(mean(records.map((r) => r.gap12))),
          pct(mean(records.map((r) => (r.tieFirst ? 1 : 0)))),
          de(mean(records.map((r) => r.leadChanges))),
          pct(mean(records.map((r) => (r.comeback ? 1 : 0)))),
          pct(mean(weakWins)),
          pct(1 / players),
          de(c('scored')),
          de(c('gifts')),
          de(c('bonks')),
          de(c('falls')),
          String(records.reduce((sum, r) => sum + r.unstable, 0)),
          de(Math.max(...records.map((r) => r.maxSpeed))),
          de(mean(records.map((r) => r.stepMs)), 2),
        ].join(' | ')} |`,
      );
    }
  }
  return lines.join('\n');
}

export async function closeTable(
  variants: readonly KruemelVariant[],
  seeds: number,
): Promise<string> {
  const head = [
    'Variante',
    'Duell: Siege etwas schwächer',
    'Duell: Gleichstand',
    '4× normal: Abstand 1–2',
    '4× normal: Gleichstand P1',
    '4× normal: Führungswechsel',
    '4× normal: Comeback',
  ];
  const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
  for (const variant of variants) {
    const duel: number[] = [];
    const duelTie: number[] = [];
    const four: KruemelRecord[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const weakIndex = (seed - 1) % 2;
      const seats = weakIndex === 0 ? [slightlyWeak, normal] : [normal, slightlyWeak];
      const record = await simulateKruemel(variant, seed, seats);
      duel.push(winShare(record, weakIndex));
      duelTie.push(record.tieFirst ? 1 : 0);
      four.push(await simulateKruemel(variant, seed, [normal, normal, normal, normal]));
    }
    lines.push(
      `| ${[
        `${variant.id}: ${variant.label}`,
        pct(mean(duel)),
        pct(mean(duelTie)),
        pct(mean(four.map((r) => r.gap12))),
        pct(mean(four.map((r) => (r.tieFirst ? 1 : 0)))),
        de(mean(four.map((r) => r.leadChanges))),
        pct(mean(four.map((r) => (r.comeback ? 1 : 0)))),
      ].join(' | ')} |`,
    );
  }
  return lines.join('\n');
}

/** Siegquote je Ecke unter gleich starken Bots (Ecken-Fairness). */
export async function seatTable(variant: KruemelVariant, seeds: number): Promise<string> {
  const head = ['Sp.', 'vorn links', 'hinten rechts', 'vorn rechts', 'hinten links', 'fair'];
  const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
  for (const players of [2, 3, 4]) {
    const shares = Array.from({ length: players }, () => [] as number[]);
    for (let seed = 1; seed <= seeds; seed++) {
      const record = await simulateKruemel(
        variant,
        seed,
        Array.from({ length: players }, () => normal),
      );
      for (let index = 0; index < players; index++) shares[index]?.push(winShare(record, index));
    }
    const cells = [0, 1, 2, 3].map((index) => {
      const values = shares[index];
      return values ? pct(mean(values)) : '–';
    });
    lines.push(`| ${[String(players), ...cells, pct(1 / players)].join(' | ')} |`);
  }
  return lines.join('\n');
}

/** Eindringling: eine Strategie gegen zwei normale Bots (3 Sp., alle Profil normal). */
export async function intruderTable(
  variants: readonly KruemelVariant[],
  seeds: number,
): Promise<string> {
  const strategies: KruemelStrategy[] = ['normal', 'torsteher', 'dauerrempler', 'raufbold'];
  const head = ['Variante', ...strategies.map((s) => s)];
  const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
  for (const variant of variants) {
    const cells: string[] = [];
    for (const strategy of strategies) {
      const shares: number[] = [];
      for (let seed = 1; seed <= seeds; seed++) {
        const index = (seed - 1) % 3;
        const seats = [normal, normal, normal].map((seat, i) =>
          i === index ? { skill: SKILLS.normal, strategy } : seat,
        );
        shares.push(winShare(await simulateKruemel(variant, seed, seats), index));
      }
      cells.push(de(mean(shares) * 3, 2));
    }
    lines.push(`| ${[`${variant.id}: ${variant.label}`, ...cells].join(' | ')} |`);
  }
  return lines.join('\n');
}
