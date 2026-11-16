/**
 * Spiellogik „Kuckucks-Klatsche“ (CHAOS-54, EXP-016) – rein, ohne Babylon.
 *
 * Überarbeitung des in EXP-005 verworfenen Reflex-Konzepts B. Damals öffnete eine einzige
 * Uhr ihr Türchen, und nur der schnellste Finger bekam den Punkt: viel Warten, viele
 * Gleichstände, Schwächere chancenlos. Neu:
 *
 * - **Eigene Tür je Person** (in der Slot-Farbe). Springt dort der Kuckuck heraus, hat nur
 *   diese Person ein kurzes Zeitfenster (`ownS`) – kein Wettrennen gegen schnellere Finger.
 * - **Gong und Klauen:** Wer zu lahm ist, hört den Gong; danach darf jeder den Kuckuck
 *   wegklatschen (`freeS`). Der Erste bekommt ihn.
 * - **Finten** (Gummiente, Socke, Blume) aus der eigenen Tür: wer klatscht, verliert Punkte.
 * - **Leerklatscher:** Wer drückt, obwohl nichts zu klatschen ist, ist kurz benommen. Das
 *   macht Dauerdrücken teuer und Vorausdrücken (Tür rappelt schon) riskant.
 * - **Mitternacht:** in den letzten Sekunden öffnen die Türen doppelt so oft.
 *
 * Bedienung: nur Knopf A. Ein Druck trifft zuerst die eigene Tür (Kuckuck oder Finte), sonst
 * den ältesten freigegebenen fremden Kuckuck, sonst ins Leere.
 *
 * Zeit nur über `step(dt)`, Zufall nur über den übergebenen `MinigameRng`.
 */
import type { MinigameRng, Slot } from '@chaos-party/minigame-sdk';

export const KUCKUCK_RULES = {
  /** Erste Öffnung je Tür zufällig in diesem Bereich (versetzt). */
  firstWaitMinS: 0.5,
  firstWaitMaxS: 1.8,
  /** Geschlossen zwischen zwei Öffnungen. */
  waitMinS: 0.9,
  waitMaxS: 2.3,
  /** Die Tür rappelt so lange, bevor sie aufspringt (sichtbare Vorwarnung). */
  rattleS: 0.35,
  /** Nur die Besitzerin darf klatschen. */
  ownS: 0.8,
  /** Nach dem Gong darf jeder klatschen. */
  freeS: 0.9,
  /** So lange schaut eine Finte heraus. */
  finteS: 1.1,
  finteChance: 0.28,
  /**
   * Beutel je Tür: in jedem Block von `finteBag` Öffnungen genau `round(finteBag · finteChance)`
   * Finten (gleich viele Chancen für alle). 0 = jede Öffnung unabhängig gewürfelt.
   * EXP-016 (K8): Der Beutel nimmt Schwächeren die meisten Siege und verdoppelt Gleichstände
   * unter gleich Starken – darum aus.
   */
  finteBag: 0,
  ownPoints: 2,
  /** Eigener Kuckuck nach dem Gong. */
  latePoints: 1,
  stealPoints: 1,
  fintePenalty: 1,
  /** Benommen nach Leerklatscher oder Finte (EXP-016: 0,7 s ließ Dauerklatschen gewinnen). */
  dizzyS: 1.0,
  /** Letzte Sekunden: Mitternacht. */
  finaleS: 8,
  finaleWaitFactor: 0.5,
  /** 1 = nach dem Gong dürfen andere klauen, 0 = nur die Besitzerin (spät). */
  steal: 1,
} as const;

export type KuckuckRules = { readonly [K in keyof typeof KUCKUCK_RULES]: number };

export type DoorPhase = 'closed' | 'rattle' | 'own' | 'free' | 'finte';
export type FinteKind = 'ente' | 'socke' | 'blume';
export const FINTE_KINDS: readonly FinteKind[] = ['ente', 'socke', 'blume'];

export interface Door {
  readonly slot: Slot;
  phase: DoorPhase;
  /** Beginn der aktuellen Phase (s Spielzeit). */
  phaseT: number;
  /** Nächster Phasenwechsel (s Spielzeit). */
  nextT: number;
  /** Was beim nächsten bzw. aktuellen Öffnen herauskommt. */
  occupant: 'kuckuck' | 'finte';
  finteKind: FinteKind;
  openings: number;
  /** Restlicher Beutel (true = Finte), wird von hinten gezogen. */
  bag: boolean[];
}

export interface Clapper {
  readonly slot: Slot;
  score: number;
  /** Benommen bis (s Spielzeit). */
  dizzyUntil: number;
  /** Eigene Kuckucke rechtzeitig geklatscht. */
  own: number;
  /** Eigene Kuckucke nach dem Gong geklatscht. */
  late: number;
  /** Fremde Kuckucke geklaut. */
  steals: number;
  /** Eigene Kuckucke, die andere geklaut haben. */
  stolen: number;
  /** Eigene Kuckucke, die entwischt sind. */
  escaped: number;
  /** Auf Finten hereingefallen. */
  fintes: number;
  /** Ins Leere geklatscht. */
  empty: number;
  /** Alle Drücke (auch benommen). */
  presses: number;
}

export type KuckuckEvent =
  | { readonly type: 'rattle'; readonly door: Slot }
  | {
      readonly type: 'open';
      readonly door: Slot;
      readonly occupant: 'kuckuck' | 'finte';
      readonly finteKind: FinteKind;
    }
  | { readonly type: 'gong'; readonly door: Slot }
  | { readonly type: 'clap'; readonly by: Slot; readonly late: boolean; readonly points: number }
  | { readonly type: 'steal'; readonly by: Slot; readonly door: Slot; readonly points: number }
  | {
      readonly type: 'finte';
      readonly by: Slot;
      readonly finteKind: FinteKind;
      readonly lost: number;
    }
  | { readonly type: 'empty'; readonly by: Slot }
  | { readonly type: 'escape'; readonly door: Slot }
  | { readonly type: 'finte-gone'; readonly door: Slot }
  | { readonly type: 'finale' };

const EPSILON = 1e-6;

export class KuckucksKlatscheLogic {
  readonly doors: Door[];
  readonly clappers: Clapper[];
  readonly rules: KuckuckRules;
  readonly durationS: number;
  /** Spielzeit in Sekunden. */
  t = 0;
  ended = false;
  finale = false;
  /** Letzter Klatsch, der Punkte brachte (für Höhepunkte). */
  lastScorer: Slot | null = null;
  /** Geklaut: Täter → Opfer → Anzahl. */
  readonly thefts = new Map<Slot, Map<Slot, number>>();
  private events: KuckuckEvent[] = [];

  constructor(
    slots: readonly Slot[],
    private readonly rng: MinigameRng,
    durationMs: number,
    rules: KuckuckRules = KUCKUCK_RULES,
  ) {
    this.rules = rules;
    this.durationS = durationMs / 1000;
    this.clappers = slots.map((slot) => ({
      slot,
      score: 0,
      dizzyUntil: 0,
      own: 0,
      late: 0,
      steals: 0,
      stolen: 0,
      escaped: 0,
      fintes: 0,
      empty: 0,
      presses: 0,
    }));
    this.doors = slots.map((slot) => {
      const door: Door = {
        slot,
        phase: 'closed',
        phaseT: 0,
        nextT: this.range(rules.firstWaitMinS, rules.firstWaitMaxS),
        occupant: 'kuckuck',
        finteKind: 'ente',
        openings: 0,
        bag: [],
      };
      return door;
    });
  }

  /** Neue Ereignisse seit dem letzten Aufruf (für Ansicht, Ton und Bots). */
  drainEvents(): KuckuckEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  clapper(slot: Slot): Clapper | undefined {
    return this.clappers.find((clapper) => clapper.slot === slot);
  }

  door(slot: Slot): Door | undefined {
    return this.doors.find((door) => door.slot === slot);
  }

  isDizzy(slot: Slot): boolean {
    const clapper = this.clapper(slot);
    return clapper !== undefined && this.t < clapper.dizzyUntil;
  }

  step(dt: number): void {
    if (this.ended) return;
    this.t += dt;
    if (!this.finale && this.t >= this.durationS - this.rules.finaleS - EPSILON) {
      this.finale = true;
      this.events.push({ type: 'finale' });
    }
    if (this.t >= this.durationS - EPSILON) {
      this.t = this.durationS;
      this.ended = true;
      return;
    }
    for (const door of this.doors) {
      // Mehrere Wechsel in einem Schritt sind möglich (große dt in Tests).
      while (this.t >= door.nextT - EPSILON) this.advance(door);
    }
  }

  /** Knopf A von `slot` zur aktuellen Spielzeit. */
  press(slot: Slot): void {
    if (this.ended) return;
    const clapper = this.clapper(slot);
    if (!clapper) return;
    clapper.presses++;
    if (this.t < clapper.dizzyUntil) return;
    const own = this.door(slot);
    if (own?.phase === 'finte') {
      const lost = Math.min(clapper.score, this.rules.fintePenalty);
      clapper.score -= lost;
      clapper.fintes++;
      clapper.dizzyUntil = this.t + this.rules.dizzyS;
      this.events.push({ type: 'finte', by: slot, finteKind: own.finteKind, lost });
      this.close(own);
      return;
    }
    if (own && (own.phase === 'own' || own.phase === 'free')) {
      const late = own.phase === 'free';
      const points = late ? this.rules.latePoints : this.rules.ownPoints;
      clapper.score += points;
      if (late) clapper.late++;
      else clapper.own++;
      this.lastScorer = slot;
      this.events.push({ type: 'clap', by: slot, late, points });
      this.close(own);
      return;
    }
    const target = this.rules.steal > 0 ? this.oldestFree(slot) : undefined;
    if (target) {
      clapper.score += this.rules.stealPoints;
      clapper.steals++;
      const victim = this.clapper(target.slot);
      if (victim) victim.stolen++;
      const byVictim = this.thefts.get(slot) ?? new Map<Slot, number>();
      byVictim.set(target.slot, (byVictim.get(target.slot) ?? 0) + 1);
      this.thefts.set(slot, byVictim);
      this.lastScorer = slot;
      this.events.push({
        type: 'steal',
        by: slot,
        door: target.slot,
        points: this.rules.stealPoints,
      });
      this.close(target);
      return;
    }
    clapper.empty++;
    clapper.dizzyUntil = this.t + this.rules.dizzyS;
    this.events.push({ type: 'empty', by: slot });
  }

  /** Restzeit in Sekunden. */
  get remainingS(): number {
    return Math.max(0, this.durationS - this.t);
  }

  private oldestFree(except: Slot): Door | undefined {
    let best: Door | undefined;
    for (const door of this.doors) {
      if (door.slot === except || door.phase !== 'free') continue;
      if (!best || door.phaseT < best.phaseT) best = door;
    }
    return best;
  }

  private advance(door: Door): void {
    const at = door.nextT;
    const r = this.rules;
    switch (door.phase) {
      case 'closed': {
        // Inhalt beim Rappeln festlegen (feste Reihenfolge der Zufallszahlen).
        const finte = this.drawFinte(door);
        door.occupant = finte ? 'finte' : 'kuckuck';
        door.finteKind = FINTE_KINDS[Math.floor(this.rng.next() * FINTE_KINDS.length)] ?? 'ente';
        this.enter(door, 'rattle', at, r.rattleS);
        this.events.push({ type: 'rattle', door: door.slot });
        return;
      }
      case 'rattle': {
        door.openings++;
        if (door.occupant === 'finte') this.enter(door, 'finte', at, r.finteS);
        else this.enter(door, 'own', at, r.ownS);
        this.events.push({
          type: 'open',
          door: door.slot,
          occupant: door.occupant,
          finteKind: door.finteKind,
        });
        return;
      }
      case 'own':
        this.enter(door, 'free', at, r.freeS);
        this.events.push({ type: 'gong', door: door.slot });
        return;
      case 'free': {
        const owner = this.clapper(door.slot);
        if (owner) owner.escaped++;
        this.events.push({ type: 'escape', door: door.slot });
        this.closeAt(door, at);
        return;
      }
      case 'finte':
        this.events.push({ type: 'finte-gone', door: door.slot });
        this.closeAt(door, at);
        return;
    }
  }

  private drawFinte(door: Door): boolean {
    const size = Math.round(this.rules.finteBag);
    if (size <= 0) return this.rng.next() < this.rules.finteChance;
    if (door.bag.length === 0) {
      const fintes = Math.round(size * this.rules.finteChance);
      const bag = Array.from({ length: size }, (_, index) => index < fintes);
      // Fisher-Yates mit dem Spielzufall.
      for (let index = bag.length - 1; index > 0; index--) {
        const other = Math.floor(this.rng.next() * (index + 1));
        [bag[index], bag[other]] = [bag[other] ?? false, bag[index] ?? false];
      }
      door.bag = bag;
    }
    return door.bag.pop() ?? false;
  }

  private enter(door: Door, phase: DoorPhase, at: number, durationS: number): void {
    door.phase = phase;
    door.phaseT = at;
    door.nextT = at + durationS;
  }

  private close(door: Door): void {
    this.closeAt(door, this.t);
  }

  private closeAt(door: Door, at: number): void {
    const factor = this.finale ? this.rules.finaleWaitFactor : 1;
    this.enter(door, 'closed', at, this.range(this.rules.waitMinS, this.rules.waitMaxS) * factor);
  }

  private range(min: number, max: number): number {
    return min + this.rng.next() * (max - min);
  }
}
