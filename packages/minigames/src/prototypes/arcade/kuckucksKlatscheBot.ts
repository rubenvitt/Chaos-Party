/**
 * EXP-016 (CHAOS-54): Bots für die **echte** Logik von Kuckucks-Klatsche
 * (`packages/minigames/src/kuckucks-klatsche/logic.ts`), fester Schritt 1/60 s.
 *
 * Bots sehen nur, was ein Mensch am Fernseher sieht: welche Tür rappelt, was herausspringt,
 * wann der Gong kommt, ob ein Kuckuck schon weg ist. Reaktionszeiten und Fehler stammen aus
 * den Profilen von EXP-005 (`common.ts`, Annahmen, nicht gemessen).
 *
 * Strategien:
 * - `normal`: reagiert auf die eigene Tür, klaut mit Wahrscheinlichkeit `judgement`.
 * - `brav`: klaut nie.
 * - `raffzahn`: klaut jeden freigegebenen Kuckuck.
 * - `dauer`: drückt stur alle `spamS` Sekunden, egal was passiert („Dauerklatscher“).
 */
import { createMinigameRng, type MinigameRng, type Slot } from '@chaos-party/minigame-sdk';
import {
  KUCKUCK_RULES,
  KuckucksKlatscheLogic,
  type KuckuckRules,
} from '../../kuckucks-klatsche/logic.ts';
import {
  BOT_PROFILES,
  LeadTracker,
  lineup,
  reactionSample,
  type BotProfile,
  type GameRecord,
  type PlayerCount,
} from './common.ts';

export type KuckuckStrategy = 'normal' | 'brav' | 'raffzahn' | 'dauer';

const STEP_S = 1 / 60;
const SLOTS: readonly Slot[] = [1, 2, 3, 4];
/** Anteil der Profi-Ungeduld (`falseStart`), mit der jemand eine rappelnde Tür vorab klatscht. */
const EAGER_OWN = 0.12;
/** Dasselbe bei einer fremden Tür, deren Kuckuck noch nicht freigegeben ist. */
const EAGER_FOREIGN = 0.04;
/** Wer den eigenen Kuckuck verpennt, merkt es am Gong mit dieser Wahrscheinlichkeit. */
const LATE_NOTICE = 0.5;

interface Plan {
  readonly at: number;
  /** Tür, für die der Druck gedacht ist (null = Ungeduld, Dauerklatscher). */
  readonly door: Slot | null;
  readonly kind: 'own' | 'steal' | 'eager' | 'spam' | 'finte';
}

class Bot {
  private plans: Plan[] = [];
  private nextSpam: number;

  constructor(
    readonly slot: Slot,
    private readonly profile: BotProfile,
    private readonly strategy: KuckuckStrategy,
    private readonly rng: MinigameRng,
    private readonly spamS: number,
  ) {
    this.nextSpam = rng.next() * spamS;
  }

  private reaction(): number {
    return reactionSample(this.rng, this.profile.reactionMs) / 1000;
  }

  private stealWill(): number {
    if (this.strategy === 'brav') return 0;
    if (this.strategy === 'raffzahn') return 1;
    return this.profile.judgement;
  }

  observe(
    logic: KuckucksKlatscheLogic,
    events: ReturnType<KuckucksKlatscheLogic['drainEvents']>,
  ): void {
    if (this.strategy === 'dauer') return;
    const now = logic.t;
    for (const event of events) {
      if (event.type === 'rattle') {
        const eager = event.door === this.slot ? EAGER_OWN : EAGER_FOREIGN;
        if (this.rng.next() < this.profile.falseStart * eager) {
          this.plans.push({ at: now + this.reaction() * 0.6, door: event.door, kind: 'eager' });
        }
      } else if (event.type === 'open' && event.door === this.slot) {
        if (event.occupant === 'finte') {
          if (this.rng.next() < this.profile.falseStart) {
            this.plans.push({ at: now + this.reaction() * 0.9, door: this.slot, kind: 'finte' });
          }
        } else if (this.rng.next() >= this.profile.lapse) {
          this.plans.push({ at: now + this.reaction(), door: this.slot, kind: 'own' });
        }
      } else if (event.type === 'gong') {
        const own = event.door === this.slot;
        const will = own ? LATE_NOTICE : this.stealWill();
        if (this.rng.next() < will) {
          this.plans.push({
            at: now + this.reaction(),
            door: event.door,
            kind: own ? 'own' : 'steal',
          });
        }
      }
    }
  }

  act(logic: KuckucksKlatscheLogic): number {
    const now = logic.t;
    let presses = 0;
    if (this.strategy === 'dauer') {
      while (now >= this.nextSpam) {
        logic.press(this.slot);
        presses++;
        this.nextSpam += this.spamS;
      }
      return presses;
    }
    const due = this.plans.filter((plan) => plan.at <= now);
    if (due.length === 0) return 0;
    this.plans = this.plans.filter((plan) => plan.at > now);
    for (const plan of due) {
      if (logic.isDizzy(this.slot)) {
        // Benommen: der Mensch drückt meist gleich noch mal, sobald es geht.
        const clapper = logic.clapper(this.slot);
        if (clapper && plan.kind !== 'eager' && this.rng.next() < 0.7) {
          this.plans.push({ ...plan, at: clapper.dizzyUntil + 0.08 });
        }
        continue;
      }
      if (plan.door !== null && plan.kind !== 'eager') {
        // Ist das Ziel schon weg, bremst man oft noch rechtzeitig.
        const door = logic.door(plan.door);
        const stillThere =
          door !== undefined &&
          (plan.kind === 'finte'
            ? door.phase === 'finte'
            : door.phase === 'own' || door.phase === 'free');
        if (!stillThere && this.rng.next() < this.profile.judgement) continue;
      }
      logic.press(this.slot);
      presses++;
    }
    return presses;
  }
}

export interface KuckuckSimOptions {
  readonly rules?: KuckuckRules;
  readonly profiles?: readonly BotProfile[];
  readonly strategies?: readonly KuckuckStrategy[];
  readonly durationMs?: number;
  readonly spamS?: number;
}

export interface KuckuckSimRecord extends GameRecord {
  readonly steals: number;
  readonly fintes: number;
  readonly empty: number;
  readonly escaped: number;
}

/** Eine Runde Kuckucks-Klatsche mit Bots. Index 0 der Profile/Strategien = Slot 1. */
export function simulateKuckucksKlatsche(
  players: PlayerCount,
  seed: number,
  options: KuckuckSimOptions = {},
): KuckuckSimRecord {
  const profiles = options.profiles ?? lineup(players);
  const durationMs = options.durationMs ?? 30_000;
  const slots = SLOTS.slice(0, players);
  const logic = new KuckucksKlatscheLogic(
    slots,
    createMinigameRng(seed),
    durationMs,
    options.rules ?? KUCKUCK_RULES,
  );
  const bots = slots.map(
    (slot, index) =>
      new Bot(
        slot,
        profiles[index] ?? BOT_PROFILES.normal,
        options.strategies?.[index] ?? 'normal',
        createMinigameRng((seed * 31 + slot * 977) ^ 0x6b75),
        options.spamS ?? 0.22,
      ),
  );
  const lead = new LeadTracker((durationMs * 2) / 3);
  const actions = slots.map(() => 0);
  while (!logic.ended) {
    logic.step(STEP_S);
    const events = logic.drainEvents();
    bots.forEach((bot, index) => {
      bot.observe(logic, events);
      actions[index] = (actions[index] ?? 0) + bot.act(logic);
    });
    lead.update(
      logic.clappers.map((clapper) => clapper.score),
      logic.t * 1000,
    );
  }
  const sum = (key: 'steals' | 'fintes' | 'empty' | 'escaped') =>
    logic.clappers.reduce((total, clapper) => total + clapper[key], 0);
  return {
    durationMs,
    scores: logic.clappers.map((clapper) => clapper.score),
    leadChanges: lead.changes,
    leaderAtTwoThirds: lead.leaderAtTwoThirds,
    actions,
    steals: sum('steals'),
    fintes: sum('fintes'),
    empty: sum('empty'),
    escaped: sum('escaped'),
  };
}
