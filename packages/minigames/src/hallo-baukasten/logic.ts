/**
 * Logik von „Hallo Baukasten“ (rein): Glühwürmchen landen angekündigt in Lichtkreisen; wer
 * darin steht, fängt sie. Zeit, Takt, Bewegung, Punkte, Höhepunkte: Baukasten (ADR-020).
 */
import {
  EventTally,
  MatchClock,
  Scoreboard,
  Spawner,
  arenaLayout,
  buildHighlights,
  createWalker,
  nearestWithin,
  randomInBounds,
  setWalkerStick,
  stepWalker,
  tallyFacts,
  tryDash,
  type HighlightRule,
  type SpawnTiming,
  type WalkerState,
} from '@chaos-party/minigame-kit';
import type { MinigameRng, Slot } from '@chaos-party/minigame-sdk';

export const HALLO_RULES = {
  speed: 5,
  dashFactor: 2.4,
  dashS: 0.2,
  dashCooldownS: 1.4,
  catchRadius: 0.9,
  finaleS: 6,
} as const;

/** Takt der Glühwürmchen; in der Abenddämmerung (Endphase) schneller. */
const SPAWNS = { firstS: 0.6, everyS: 0.9, finaleEveryS: 0.5, warnS: 1.1 } as const;
export const HALLO_ARENA = arenaLayout({ form: 'eckig', halfX: 6, halfZ: 4.5 });

const HIGHLIGHTS: readonly HighlightRule[] = [
  { kind: 'top', stat: 'punkte', text: (name, n) => `${name} fängt ${n} Glühwürmchen.` },
  { kind: 'top', stat: 'hecht', min: 5, text: (name, n) => `${name} hechtet ${n}× ins Gras.` },
  { kind: 'last', stat: 'fang', text: (name) => `${name} fängt das letzte Licht.` },
];

export type Firefly = SpawnTiming & { readonly id: number; readonly x: number; readonly z: number };
export type Hopper = WalkerState & { readonly slot: Slot };
export type HalloEvent =
  | { readonly type: 'spawn' | 'escape'; readonly fly: Firefly }
  | { readonly type: 'catch'; readonly fly: Firefly; readonly slot: Slot }
  | { readonly type: 'finale' };

export class HalloLogic {
  readonly clock: MatchClock;
  readonly board: Scoreboard;
  readonly tally = new EventTally<'fang' | 'hecht'>();
  readonly hoppers: Hopper[];
  readonly flies: Firefly[] = [];
  private readonly spawner = new Spawner(SPAWNS);
  private nextId = 1;

  constructor(
    slots: readonly Slot[],
    private readonly rng: MinigameRng,
    timeLimitMs: number,
  ) {
    this.clock = new MatchClock(timeLimitMs, HALLO_RULES.finaleS);
    this.board = new Scoreboard(slots);
    this.hoppers = slots.map((slot, index) => ({ slot, ...createWalker(-4.5 + index * 3, -3) }));
  }

  get finished(): boolean {
    return this.clock.expired;
  }

  hopper(slot: Slot): Hopper | undefined {
    return this.hoppers.find((hopper) => hopper.slot === slot);
  }

  setStick(slot: Slot, x: number, y: number): void {
    const hopper = this.hopper(slot);
    if (hopper) setWalkerStick(hopper, x, y);
  }

  dash(slot: Slot): boolean {
    const hopper = this.hopper(slot);
    if (!hopper || this.finished || !tryDash(hopper, this.clock.time, HALLO_RULES)) return false;
    this.tally.count(slot, 'hecht');
    return true;
  }

  step(dt: number): HalloEvent[] {
    if (this.finished) return [];
    const { clock } = this;
    const events: HalloEvent[] = [];
    if (clock.tick(dt).finaleStarted) events.push({ type: 'finale' });
    const now = clock.time;
    for (let n = this.spawner.poll(now, clock.finale, clock.limitS); n > 0; n--) {
      const spot = randomInBounds(() => this.rng.next(), HALLO_ARENA.bounds, 0.8);
      const fly = { id: this.nextId++, ...spot, ...this.spawner.timing(now) };
      this.flies.push(fly);
      events.push({ type: 'spawn', fly });
    }
    for (const hopper of this.hoppers) stepWalker(hopper, dt, now, HALLO_RULES, HALLO_ARENA.bounds);
    for (const fly of this.flies.filter((candidate) => now >= candidate.arriveAt)) {
      this.flies.splice(this.flies.indexOf(fly), 1);
      const catcher = nearestWithin(this.hoppers, fly, HALLO_RULES.catchRadius);
      if (catcher) {
        this.board.add(catcher.slot, 1);
        this.tally.count(catcher.slot, 'fang');
      }
      events.push(catcher ? { type: 'catch', fly, slot: catcher.slot } : { type: 'escape', fly });
    }
    return events;
  }

  highlights(names: ReadonlyMap<Slot, string>): string[] {
    const punkte = (slot: Slot) => this.board.get(slot);
    return buildHighlights(HIGHLIGHTS, tallyFacts(this.board.slots, names, this.tally, { punkte }));
  }
}
