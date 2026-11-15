/**
 * Spiellogik „Sockenregen“ (CHAOS-29/30, EXP-005 Variante A4) – rein, ohne Babylon.
 *
 * Waschmaschine Wumms schleudert Socken und Bügeleisen in eine runde Arena. Wo etwas
 * landet, zeigt ein Schatten. Socken fängt, wer beim Landen darunter steht, oder sammelt
 * sie danach vom Boden auf (nächste Person gewinnt). Bügeleisen plätten alle im roten
 * Kreis: kurz bewegungsunfähig, und eine Socke springt heraus, die jeder schnappen darf.
 * Gezielte Bügeleisen fliegen bevorzugt auf die alleinige Führung. In den letzten Sekunden
 * kommt der Schleudergang: doppelt so viele Würfe, mehr Goldsocken.
 *
 * Koordinaten: Ebene x/z, +z = vom Fernseher weg („Stick nach oben“), Arena-Mitte (0, 0).
 * Zeit nur über `step(dt)`, Zufall nur über den übergebenen `MinigameRng`.
 */
import type { MinigameRng, Slot } from '@chaos-party/minigame-sdk';

export const SOCKENREGEN_RULES = {
  arenaRadius: 6.2,
  /** Würfe landen höchstens so weit von der Mitte (Rand bleibt frei). */
  landingRadius: 5.6,
  startRadius: 3,
  firstSpawnS: 0.8,
  spawnS: 0.6,
  /** Letzte Sekunden: Schleudergang. */
  finaleS: 8,
  finaleSpawnS: 0.34,
  ironChance: 0.22,
  goldChance: 0.08,
  finaleGoldFactor: 2,
  /** Anteil Bügeleisen, die auf eine Person zielen (bevorzugt die alleinige Führung). */
  aimedIronShare: 0.5,
  flightS: 1.3,
  groundS: 2.5,
  catchRadius: 0.8,
  ironRadius: 1.2,
  stunS: 1.4,
  speed: 5.5,
  dashFactor: 2.6,
  dashS: 0.22,
  dashCooldownS: 1.6,
  dropFlightS: 0.5,
  dropDistance: 1.6,
  goldPoints: 3,
} as const;

export type SockenregenRules = { readonly [K in keyof typeof SOCKENREGEN_RULES]: number };

/** Abwurfpunkt: Bullauge der Waschmaschine hinter der Arena. */
export const LAUNCH_POINT = { x: 0, y: 2.6, z: 8.1 } as const;

/** Toleranz für aufsummierte Schrittzeiten. */
const EPSILON = 1e-6;

export type ItemKind = 'sock' | 'gold' | 'iron';

export interface Item {
  readonly id: number;
  readonly kind: ItemKind;
  /** Startpunkt der Flugbahn (Waschmaschine oder geplättete Person). */
  readonly fromX: number;
  readonly fromY: number;
  readonly fromZ: number;
  readonly x: number;
  readonly z: number;
  readonly launchT: number;
  readonly landT: number;
  /** Aus einer geplätteten Person gesprungen. */
  readonly dropped: boolean;
  /** Bügeleisen, das auf eine Person gezielt war. */
  readonly target: Slot | null;
  state: 'flying' | 'ground' | 'gone';
  groundUntil: number;
}

export interface Runner {
  readonly slot: Slot;
  x: number;
  z: number;
  /** Blickrichtung (Radiant um y, 0 = +z). */
  heading: number;
  stickX: number;
  stickY: number;
  stunUntil: number;
  dashUntil: number;
  dashReadyAt: number;
  score: number;
  socks: number;
  golds: number;
  hits: number;
  dashes: number;
}

export type SockEvent =
  | { readonly type: 'spawn'; readonly item: Item }
  | { readonly type: 'land'; readonly item: Item }
  | { readonly type: 'collect'; readonly slot: Slot; readonly item: Item }
  | { readonly type: 'hit'; readonly slot: Slot; readonly item: Item; readonly drop: Item | null }
  | { readonly type: 'expire'; readonly item: Item }
  | { readonly type: 'dash'; readonly slot: Slot }
  | { readonly type: 'finale' }
  | { readonly type: 'end' };

export class SockenregenLogic {
  readonly runners: Runner[];
  readonly items: Item[] = [];
  /** Spielzeit in s. */
  time = 0;
  finale = false;
  finished = false;
  /** Wer zuletzt eine Socke gesammelt hat (Höhepunkt). */
  lastCollector: Slot | null = null;
  private nextSpawn: number;
  private nextId = 1;
  private readonly limitS: number;

  constructor(
    slots: readonly Slot[],
    private readonly rng: MinigameRng,
    timeLimitMs: number,
    readonly rules: SockenregenRules = SOCKENREGEN_RULES,
  ) {
    this.limitS = timeLimitMs / 1000;
    this.nextSpawn = rules.firstSpawnS;
    this.runners = slots.map((slot, index) => {
      // Im Halbkreis vor der Maschine aufstellen, Blick zur Maschine.
      const angle = Math.PI + (Math.PI * (index + 1)) / (slots.length + 1);
      return {
        slot,
        x: Math.cos(angle) * rules.startRadius,
        z: Math.sin(angle) * rules.startRadius * 0.6,
        heading: 0,
        stickX: 0,
        stickY: 0,
        stunUntil: 0,
        dashUntil: 0,
        dashReadyAt: 0,
        score: 0,
        socks: 0,
        golds: 0,
        hits: 0,
        dashes: 0,
      };
    });
  }

  get remainingS(): number {
    return Math.max(0, this.limitS - this.time);
  }

  runner(slot: Slot): Runner | undefined {
    return this.runners.find((runner) => runner.slot === slot);
  }

  isStunned(runner: Runner): boolean {
    return this.time < runner.stunUntil;
  }

  isDashing(runner: Runner): boolean {
    return this.time < runner.dashUntil;
  }

  /** Stick-Stellung (Achsen −1…1, y > 0 = nach hinten/+z). */
  setStick(slot: Slot, x: number, y: number): void {
    const runner = this.runner(slot);
    if (!runner) return;
    const length = Math.hypot(x, y);
    const scale = length > 1 ? 1 / length : 1;
    runner.stickX = x * scale;
    runner.stickY = y * scale;
  }

  /** Hechtsprung (Knopf A). Liefert `true`, wenn er ausgelöst wurde. */
  dash(slot: Slot): boolean {
    const runner = this.runner(slot);
    if (!runner || this.finished) return false;
    if (this.isStunned(runner) || this.time < runner.dashReadyAt) return false;
    const stick = Math.hypot(runner.stickX, runner.stickY);
    if (stick > 0.2) runner.heading = Math.atan2(runner.stickX, runner.stickY);
    runner.dashUntil = this.time + this.rules.dashS;
    runner.dashReadyAt = this.time + this.rules.dashCooldownS;
    runner.dashes++;
    return true;
  }

  /** Ein fester Logikschritt; liefert, was passiert ist (für Anzeige und Effekte). */
  step(dt: number): SockEvent[] {
    if (this.finished) return [];
    const events: SockEvent[] = [];
    this.time += dt;
    const { rules } = this;

    if (!this.finale && this.time >= this.limitS - rules.finaleS - EPSILON) {
      this.finale = true;
      events.push({ type: 'finale' });
    }
    // Würfe nur, solange sie vor dem Ende landen.
    while (this.time >= this.nextSpawn) {
      this.nextSpawn += this.finale ? rules.finaleSpawnS : rules.spawnS;
      if (this.time + rules.flightS < this.limitS) events.push(this.spawn());
    }

    this.moveRunners(dt);
    this.resolveItems(events);

    // Gleitkomma-Summe der festen Schritte: 1800 × 1/60 s soll genau 30 s sein.
    if (this.time >= this.limitS - EPSILON) {
      this.finished = true;
      events.push({ type: 'end' });
    }
    return events;
  }

  private spawn(): SockEvent {
    const { rules, rng } = this;
    const roll = rng.next();
    const goldChance = rules.goldChance * (this.finale ? rules.finaleGoldFactor : 1);
    const kind: ItemKind =
      roll < rules.ironChance ? 'iron' : roll < rules.ironChance + goldChance ? 'gold' : 'sock';
    let x: number;
    let z: number;
    let target: Slot | null = null;
    if (kind === 'iron' && rng.next() < rules.aimedIronShare) {
      const leader = this.leader();
      const victim = leader ?? rng.pick(this.runners);
      target = victim.slot;
      ({ x, z } = clampToRadius(victim.x, victim.z, rules.landingRadius));
    } else {
      const r = Math.sqrt(rng.next()) * rules.landingRadius;
      const a = rng.next() * Math.PI * 2;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    const item: Item = {
      id: this.nextId++,
      kind,
      fromX: LAUNCH_POINT.x,
      fromY: LAUNCH_POINT.y,
      fromZ: LAUNCH_POINT.z,
      x,
      z,
      launchT: this.time,
      landT: this.time + rules.flightS,
      dropped: false,
      target,
      state: 'flying',
      groundUntil: 0,
    };
    this.items.push(item);
    return { type: 'spawn', item };
  }

  /** Alleinige Führung mit mindestens einem Punkt, sonst `null`. */
  leader(): Runner | null {
    let best: Runner | null = null;
    let tie = false;
    for (const runner of this.runners) {
      if (!best || runner.score > best.score) {
        best = runner;
        tie = false;
      } else if (runner.score === best.score) {
        tie = true;
      }
    }
    return best && !tie && best.score > 0 ? best : null;
  }

  private moveRunners(dt: number): void {
    const { rules } = this;
    for (const runner of this.runners) {
      if (this.isStunned(runner)) continue;
      let vx: number;
      let vz: number;
      if (this.isDashing(runner)) {
        const speed = rules.speed * rules.dashFactor;
        vx = Math.sin(runner.heading) * speed;
        vz = Math.cos(runner.heading) * speed;
      } else {
        vx = runner.stickX * rules.speed;
        vz = runner.stickY * rules.speed;
        if (Math.hypot(runner.stickX, runner.stickY) > 0.15) {
          runner.heading = Math.atan2(runner.stickX, runner.stickY);
        }
      }
      ({ x: runner.x, z: runner.z } = clampToRadius(
        runner.x + vx * dt,
        runner.z + vz * dt,
        rules.arenaRadius,
      ));
    }
  }

  private resolveItems(events: SockEvent[]): void {
    const { rules } = this;
    // Über eine Kopie laufen: Treffer erzeugen neue (herausgesprungene) Socken.
    for (const item of [...this.items]) {
      if (item.state === 'flying' && this.time >= item.landT) {
        if (item.kind === 'iron') {
          item.state = 'gone';
          events.push({ type: 'land', item });
          for (const runner of this.runners) {
            if (this.isStunned(runner)) continue;
            if (Math.hypot(runner.x - item.x, runner.z - item.z) > rules.ironRadius) continue;
            runner.stunUntil = this.time + rules.stunS;
            runner.dashUntil = 0;
            runner.hits++;
            const drop = runner.score > 0 ? this.dropSock(runner) : null;
            events.push({ type: 'hit', slot: runner.slot, item, drop });
          }
          continue;
        }
        item.state = 'ground';
        item.groundUntil = this.time + rules.groundS;
        events.push({ type: 'land', item });
      }
      if (item.state !== 'ground') continue;
      const collector = this.nearestCollector(item);
      if (collector) {
        item.state = 'gone';
        const points = item.kind === 'gold' ? rules.goldPoints : 1;
        collector.score += points;
        if (item.kind === 'gold') collector.golds++;
        else collector.socks++;
        this.lastCollector = collector.slot;
        events.push({ type: 'collect', slot: collector.slot, item });
      } else if (this.time >= item.groundUntil) {
        item.state = 'gone';
        events.push({ type: 'expire', item });
      }
    }
    // Erledigte Dinge entfernen (Liste bleibt klein).
    for (let index = this.items.length - 1; index >= 0; index--) {
      if (this.items[index]?.state === 'gone') this.items.splice(index, 1);
    }
  }

  private nearestCollector(item: Item): Runner | null {
    let best: Runner | null = null;
    let bestDistance = this.rules.catchRadius;
    for (const runner of this.runners) {
      if (this.isStunned(runner)) continue;
      const d = Math.hypot(runner.x - item.x, runner.z - item.z);
      if (d <= bestDistance) {
        best = runner;
        bestDistance = d;
      }
    }
    return best;
  }

  /** Geplättet: eine Socke (1 Punkt) springt heraus und landet daneben. */
  private dropSock(runner: Runner): Item {
    const { rules, rng } = this;
    runner.score -= 1;
    const a = rng.next() * Math.PI * 2;
    const { x, z } = clampToRadius(
      runner.x + Math.cos(a) * rules.dropDistance,
      runner.z + Math.sin(a) * rules.dropDistance,
      rules.landingRadius,
    );
    const item: Item = {
      id: this.nextId++,
      kind: 'sock',
      fromX: runner.x,
      fromY: 1,
      fromZ: runner.z,
      x,
      z,
      launchT: this.time,
      landT: this.time + rules.dropFlightS,
      dropped: true,
      target: null,
      state: 'flying',
      groundUntil: 0,
    };
    this.items.push(item);
    return item;
  }
}

export function clampToRadius(x: number, z: number, radius: number): { x: number; z: number } {
  const r = Math.hypot(x, z);
  if (r <= radius) return { x, z };
  return { x: (x / r) * radius, z: (z / r) * radius };
}

/** Position eines fliegenden Dings (Parabel vom Start zum Landepunkt) für die Anzeige. */
export function flightPosition(
  item: Item,
  time: number,
): { x: number; y: number; z: number; progress: number } {
  const span = Math.max(1e-6, item.landT - item.launchT);
  const p = Math.min(1, Math.max(0, (time - item.launchT) / span));
  const apex = item.dropped ? 1.6 : 5.5;
  return {
    x: item.fromX + (item.x - item.fromX) * p,
    z: item.fromZ + (item.z - item.fromZ) * p,
    y: item.fromY * (1 - p) + 4 * apex * p * (1 - p),
    progress: p,
  };
}
