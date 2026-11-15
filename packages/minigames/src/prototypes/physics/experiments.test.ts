/**
 * EXP-006 Physik-Konzepte (CHAOS-29/31). Der Smoke-Test läuft immer (je Variante ein kurzer
 * Lauf); die vollen Tabellen für `docs/experiments.md` nur mit:
 *
 * ```sh
 * EXPERIMENTS=1 pnpm exec vitest run packages/minigames/src/prototypes/physics --silent=false
 * ```
 */
import { describe, expect, it } from 'vitest';
import { createKruemelPrototype, kruemelBot } from './kruemel.ts';
import {
  simulate,
  SKILLS,
  summarize,
  toMarkdown,
  type BotPolicy,
  type ProtoView,
  type Prototype,
  type RunMetrics,
} from './shared.ts';
import { PuddingGerangel } from '../../pudding-gerangel/index.ts';
import { PUDDING_GERANGEL_INFO } from '../../pudding-gerangel/info.ts';
import { TUNING } from '../../pudding-gerangel/logic.ts';
import {
  createWackelPrototype,
  wackelBot,
  type WackelConfig,
  type WackelTuning,
  type WackelView,
} from './wackel.ts';

const DURATION_MS = 30_000;

/** Iteration nach Runde 1: glitschiger, stärker kippend, schnellerer Besen, kräftigere Rempler. */
const CHAOS: Partial<WackelTuning> = {
  platterFriction: 0.12,
  tiltPerPawn: 0.09,
  maxTilt: 0.3,
  wobbleStart: 0.05,
  wobbleEnd: 0.15,
  whiskSpeedStart: 0.8,
  whiskSpeedEnd: 1.8,
  whiskHeight: 0.7,
  bonkBoost: 1.3,
};

/** Das umgesetzte Minispiel mit denselben Bots wie die Prototypen (Zeile „Z“). */
function createFinalPrototype(): Prototype<WackelView> {
  let game: PuddingGerangel | null = null;
  return {
    module: {
      info: PUDDING_GERANGEL_INFO,
      create: () => {
        game = new PuddingGerangel();
        return game;
      },
    },
    peek: () => {
      if (!game) return null;
      const snap = game.snapshot();
      return {
        pawns: snap.pawns.map(({ slot, x, y, z, vx, vy, vz, out, canDash }) => ({
          slot,
          x,
          y,
          z,
          vx,
          vy,
          vz,
          out,
          canDash,
        })),
        props: [],
        killY: TUNING.killY,
        tunneled: () =>
          snap.pawns.filter((p) => !p.out && p.localR < TUNING.radius - 0.8 && p.localY < 0).length,
        counters: { ...snap.counters },
        tilt: snap.tilt,
        whiskAngle: snap.spoonAngle,
        zone: snap.zone,
        leader: snap.leader,
      };
    },
  };
}

interface Variant {
  readonly name: string;
  readonly make: () => Prototype<ProtoView>;
  readonly policy: BotPolicy<ProtoView>;
}

const wackel = (name: string, config: Omit<WackelConfig, 'durationMs'>): Variant => ({
  name,
  make: () => createWackelPrototype({ ...config, durationMs: DURATION_MS }),
  policy: wackelBot as BotPolicy<ProtoView>,
});

export const VARIANTS: readonly Variant[] = [
  wackel('A: Letzter oben', { respawn: false, scoring: 'survival', whisk: true }),
  wackel('A2: Comeback, Saldo', { respawn: true, scoring: 'saldo', whisk: true }),
  wackel('A2: Comeback, Stürze', { respawn: true, scoring: 'stuerze', whisk: true }),
  wackel('A2 ohne Besen, Saldo', { respawn: true, scoring: 'saldo', whisk: false }),
  wackel('A3: Wackel-Wahnsinn, Saldo', {
    respawn: true,
    scoring: 'saldo',
    whisk: true,
    tuning: CHAOS,
  }),
  wackel('A3: Wackel-Wahnsinn, Stürze', {
    respawn: true,
    scoring: 'stuerze',
    whisk: true,
    tuning: CHAOS,
  }),
  wackel('A4: Kirschfleck', { respawn: true, scoring: 'kirsche', whisk: true, tuning: CHAOS }),
  wackel('A4b: Kirschfleck flink+groß', {
    respawn: true,
    scoring: 'kirsche',
    whisk: true,
    tuning: { ...CHAOS, zoneMoveMs: 4000, zoneRadius: 1.7 },
  }),
  wackel('A4c: Kirschfleck geteilt', {
    respawn: true,
    scoring: 'kirsche',
    whisk: true,
    tuning: { ...CHAOS, zoneMoveMs: 4000, zoneRadius: 1.7, zoneShare: 1 },
  }),
  wackel('A5: Kirschfleck + Wackelkrone', {
    respawn: true,
    scoring: 'kirsche',
    whisk: true,
    tuning: { ...CHAOS, zoneMoveMs: 4000, zoneRadius: 1.7, leaderBonk: 1.5 },
  }),
  wackel('A4: Kirschfleck ohne Besen', {
    respawn: true,
    scoring: 'kirsche',
    whisk: false,
    tuning: CHAOS,
  }),
  wackel('A3: Wackel-Wahnsinn, Letzter', {
    respawn: false,
    scoring: 'survival',
    whisk: true,
    tuning: CHAOS,
  }),
  {
    name: 'Z: Pudding-Gerangel (Umsetzung)',
    make: createFinalPrototype,
    policy: wackelBot as BotPolicy<ProtoView>,
  },
  {
    name: 'B: Krümel-Kehraus',
    make: () => createKruemelPrototype(DURATION_MS),
    policy: kruemelBot as BotPolicy<ProtoView>,
  },
];

const SENSITIVITY = [
  'A3: Wackel-Wahnsinn, Saldo',
  'A5: Kirschfleck + Wackelkrone',
  'Z: Pudding-Gerangel (Umsetzung)',
  'B: Krümel-Kehraus',
];

const runtime = globalThis as {
  process?: { env?: Record<string, string | undefined> };
};

describe('EXP-006 Physik-Prototypen (Smoke)', () => {
  for (const variant of VARIANTS) {
    it(`${variant.name}: läuft stabil mit 4 Bots`, async () => {
      const run = await simulate(variant.make, variant.policy, 4, 3, 6_000);
      expect(run.forced).toBe(false);
      expect(run.nan).toBe(0);
      expect(run.lost).toBe(0);
      expect(run.tunneled).toBe(0);
      expect(run.residueOk).toBe(true);
    });
  }
});

describe.runIf(runtime.process?.env?.EXPERIMENTS === '1')('EXP-006 Tabellen', () => {
  it('vergleicht die Varianten (Seeds 1–40, 2–4 Bots)', async () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    const rows = [];
    const filter = runtime.process?.env?.EXP_FILTER ?? '';
    for (const variant of VARIANTS.filter((v) => v.name.includes(filter))) {
      for (const players of [2, 3, 4]) {
        const runs: RunMetrics[] = [];
        for (const seed of seeds)
          runs.push(await simulate(variant.make, variant.policy, players, seed));
        rows.push(summarize(variant.name, runs));
      }
    }
    console.log(
      toMarkdown('EXP-006 Physik-Prototypen (30 s, Seeds 1–40 je Zeile)', rows, [
        { key: 'falls', label: 'Stürze' },
        { key: 'knockoffs', label: 'Schubser' },
        { key: 'crumbs', label: 'Krümel' },
        { key: 'idleShare', label: 'Zuschauer-Anteil' },
        { key: 'spoonFalls', label: 'Löffel-Stürze' },
      ]),
    );
    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);

  it('Empfindlichkeit: etwas schwächerer statt schwacher Bot', async () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    const rows = [];
    for (const variant of VARIANTS.filter((v) => SENSITIVITY.includes(v.name))) {
      for (const players of [2, 3, 4]) {
        const runs: RunMetrics[] = [];
        for (const seed of seeds) {
          runs.push(
            await simulate(
              variant.make,
              variant.policy,
              players,
              seed,
              undefined,
              SKILLS.slightlyWeak,
            ),
          );
        }
        rows.push(summarize(variant.name, runs));
      }
    }
    console.log(
      toMarkdown('EXP-006 Empfindlichkeit: etwas schwächerer Bot (Seeds 1–40)', rows, []),
    );
    expect(rows.length).toBe(SENSITIVITY.length * 3);
  }, 600_000);
});
