/**
 * Prototyp A „Sockenregen“ (Positionierung + Reflex): Eine Waschmaschine schleudert Socken
 * und Bügeleisen in die runde Arena. Ein Schatten zeigt, wo etwas landet. Unter der Socke
 * stehen oder die liegende Socke einsammeln = Punkte; wer vom Bügeleisen getroffen wird,
 * liegt kurz flach. Nur Joystick (Variante mit A = Hechtsprung).
 */
import { createMinigameRng, type MinigameRng } from '@chaos-party/minigame-sdk';
import {
  LeadTracker,
  distance,
  gaussian,
  lineup,
  reactionSample,
  uniqueLeader,
  type BotProfile,
  type GameRecord,
  type PlayerCount,
} from './common.ts';

export interface SockenregenParams {
  readonly durationMs: number;
  /** Abstand zwischen zwei Würfen (s), im Finale `finaleSpawnS`. */
  readonly spawnS: number;
  readonly finaleS: number;
  readonly finaleSpawnS: number;
  readonly ironChance: number;
  readonly goldChance: number;
  /** Anteil der Bügeleisen, die auf eine Person zielen (sonst zufällig). */
  readonly aimedIronShare: number;
  readonly flightS: number;
  readonly groundS: number;
  readonly catchRadius: number;
  readonly ironRadius: number;
  readonly stunS: number;
  readonly speed: number;
  readonly arenaRadius: number;
  /** A = Hechtsprung (kurz schneller, mit Abklingzeit). */
  readonly dash: boolean;
  /** Treffer kostet eine Socke, die daneben liegen bleibt (für alle greifbar). */
  readonly ironDrop: boolean;
  /** Gezielte Bügeleisen: auf eine zufällige Person oder bevorzugt auf die Führung. */
  readonly ironTarget: 'random' | 'leader';
  /** Anteil Goldsocken, die neben der/dem Letzten landen (sichtbarer Aufholhelfer). */
  readonly goldNearLast: number;
}

export const SOCKENREGEN_BASE: SockenregenParams = {
  durationMs: 30_000,
  spawnS: 0.6,
  finaleS: 8,
  finaleSpawnS: 0.34,
  ironChance: 0.22,
  goldChance: 0.08,
  aimedIronShare: 0.5,
  flightS: 1.3,
  groundS: 2.5,
  catchRadius: 0.8,
  ironRadius: 1.2,
  stunS: 1.4,
  speed: 5.5,
  arenaRadius: 6.2,
  dash: false,
  ironDrop: false,
  ironTarget: 'random',
  goldNearLast: 0,
};

const DT = 1 / 30;
const DASH_SPEED = 2.6;
const DASH_S = 0.22;
const DASH_COOLDOWN_S = 1.6;

type Kind = 'sock' | 'gold' | 'iron';

interface Item {
  readonly kind: Kind;
  readonly x: number;
  readonly z: number;
  readonly spawnT: number;
  readonly landT: number;
  state: 'flying' | 'ground' | 'gone';
  groundUntil: number;
  /** Je Bot: ab wann er das Ding bemerkt hat (Reaktionszeit). */
  readonly noticeT: number[];
  /** Je Bot: weicht er dieser Gefahr aus? */
  readonly aware: boolean[];
}

interface Bot {
  readonly profile: BotProfile;
  x: number;
  z: number;
  stunUntil: number;
  dashUntil: number;
  dashReady: number;
  score: number;
  actions: number;
  target: Item | null;
  nextThink: number;
  dirX: number;
  dirZ: number;
}

export function simulateSockenregen(
  players: PlayerCount,
  seed: number,
  params: SockenregenParams = SOCKENREGEN_BASE,
  profiles: readonly BotProfile[] = lineup(players),
): GameRecord {
  const rng = createMinigameRng(seed);
  const botRng = createMinigameRng(seed ^ 0x5eed);
  const bots: Bot[] = profiles.map((profile, index) => {
    const angle = (index / players) * Math.PI * 2;
    return {
      profile,
      x: Math.cos(angle) * 3,
      z: Math.sin(angle) * 3,
      stunUntil: 0,
      dashUntil: 0,
      dashReady: 0,
      score: 0,
      actions: 0,
      target: null,
      nextThink: 0,
      dirX: 0,
      dirZ: 0,
    };
  });
  const items: Item[] = [];
  const lead = new LeadTracker((params.durationMs * 2) / 3);
  const end = params.durationMs / 1000;
  let nextSpawn = 0.5;

  for (let t = 0; t < end; t += DT) {
    // Würfe
    if (t >= nextSpawn) {
      const finale = t >= end - params.finaleS;
      nextSpawn += finale ? params.finaleSpawnS : params.spawnS;
      const roll = rng.next();
      const kind: Kind =
        roll < params.ironChance
          ? 'iron'
          : roll < params.ironChance + params.goldChance * (finale ? 2 : 1)
            ? 'gold'
            : 'sock';
      let x: number;
      let z: number;
      const leader = uniqueLeader(bots.map((bot) => bot.score));
      const lowest = Math.min(...bots.map((bot) => bot.score));
      if (kind === 'iron' && rng.next() < params.aimedIronShare) {
        const victim =
          params.ironTarget === 'leader' && leader !== null ? bots[leader] : rng.pick(bots);
        x = victim?.x ?? 0;
        z = victim?.z ?? 0;
      } else if (kind === 'gold' && rng.next() < params.goldNearLast) {
        const last = rng.pick(bots.filter((bot) => bot.score === lowest));
        const a = rng.next() * Math.PI * 2;
        x = last.x + Math.cos(a) * 1.5;
        z = last.z + Math.sin(a) * 1.5;
      } else {
        const r = Math.sqrt(rng.next()) * (params.arenaRadius - 0.6);
        const a = rng.next() * Math.PI * 2;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      items.push({
        kind,
        x,
        z,
        spawnT: t,
        landT: t + params.flightS,
        state: 'flying',
        groundUntil: 0,
        noticeT: bots.map((bot) => t + reactionSample(botRng, bot.profile.reactionMs) / 1000),
        aware: bots.map((bot) => botRng.next() < bot.profile.awareness),
      });
    }

    // Bots denken und bewegen sich
    for (const [index, bot] of bots.entries()) {
      if (t < bot.stunUntil) continue;
      if (t >= bot.nextThink) {
        bot.nextThink = t + 0.15;
        think(bot, index, bots, items, t, params, botRng);
      }
      const dashing = t < bot.dashUntil;
      const speed = params.speed * (dashing ? DASH_SPEED : 1);
      bot.x += bot.dirX * speed * DT;
      bot.z += bot.dirZ * speed * DT;
      const r = Math.hypot(bot.x, bot.z);
      if (r > params.arenaRadius) {
        bot.x *= params.arenaRadius / r;
        bot.z *= params.arenaRadius / r;
      }
    }

    // Landungen, Einsammeln, Treffer
    for (const item of items) {
      if (item.state === 'flying' && t >= item.landT) {
        if (item.kind === 'iron') {
          item.state = 'gone';
          for (const bot of bots) {
            if (t >= bot.stunUntil && distance(bot.x, bot.z, item.x, item.z) <= params.ironRadius) {
              bot.stunUntil = t + params.stunS;
              if (params.ironDrop && bot.score > 0) {
                bot.score -= 1;
                const a = rng.next() * Math.PI * 2;
                items.push(droppedSock(bot.x + Math.cos(a) * 1.5, bot.z + Math.sin(a) * 1.5, t));
              }
            }
          }
        } else {
          item.state = 'ground';
          item.groundUntil = t + params.groundS;
        }
      }
      if (item.state === 'ground') {
        if (t > item.groundUntil) {
          item.state = 'gone';
          continue;
        }
        let best: Bot | null = null;
        let bestDistance = params.catchRadius;
        for (const bot of bots) {
          if (t < bot.stunUntil) continue;
          const d = distance(bot.x, bot.z, item.x, item.z);
          if (d <= bestDistance) {
            best = bot;
            bestDistance = d;
          }
        }
        if (best) {
          best.score += item.kind === 'gold' ? 3 : 1;
          item.state = 'gone';
        }
      }
    }
    lead.update(
      bots.map((bot) => bot.score),
      t * 1000,
    );
  }
  return {
    durationMs: params.durationMs,
    scores: bots.map((bot) => bot.score),
    leadChanges: lead.changes,
    leaderAtTwoThirds: lead.leaderAtTwoThirds,
    actions: bots.map((bot) => bot.actions),
  };
}

function droppedSock(x: number, z: number, t: number): Item {
  return {
    kind: 'sock',
    x,
    z,
    spawnT: t,
    landT: t + 0.5,
    state: 'flying',
    groundUntil: 0,
    noticeT: [t + 0.3, t + 0.3, t + 0.3, t + 0.3],
    aware: [true, true, true, true],
  };
}

function think(
  bot: Bot,
  index: number,
  bots: readonly Bot[],
  items: readonly Item[],
  t: number,
  params: SockenregenParams,
  rng: MinigameRng,
): void {
  // 1. Gefahr? Aus dem Landekreis eines bemerkten Bügeleisens heraus.
  for (const item of items) {
    if (item.kind !== 'iron' || item.state !== 'flying') continue;
    if (t < (item.noticeT[index] ?? Infinity) || !item.aware[index]) continue;
    const d = distance(bot.x, bot.z, item.x, item.z);
    if (d < params.ironRadius + 0.4 && item.landT - t < 1.0) {
      const away = Math.atan2(bot.z - item.z, bot.x - item.x);
      setDirection(bot, d < 0.05 ? rng.next() * Math.PI * 2 : away, rng);
      bot.target = null;
      return;
    }
  }
  // 2. Ziel wählen: erreichbare, bemerkte Socke mit bestem Wert je Weg.
  const candidates: { item: Item; value: number }[] = [];
  for (const item of items) {
    if (item.kind === 'iron' || item.state === 'gone') continue;
    if (t < (item.noticeT[index] ?? Infinity)) continue;
    const d = distance(bot.x, bot.z, item.x, item.z);
    const eta = d / params.speed;
    const deadline = (item.state === 'flying' ? item.landT : t) + params.groundS - t;
    if (eta > deadline) continue;
    // Starke Spieler sehen, wenn jemand anderes deutlich näher ist.
    const rival = Math.min(
      ...bots.filter((other) => other !== bot).map((o) => distance(o.x, o.z, item.x, item.z)),
    );
    const contested = rival + 0.8 < d ? 0.35 : 1;
    const points = item.kind === 'gold' ? 3 : 1;
    candidates.push({ item, value: (points * contested) / (eta + 0.4) });
  }
  if (candidates.length === 0) {
    bot.target = null;
    // Zur Mitte schlendern: von dort ist alles nah.
    const d = Math.hypot(bot.x, bot.z);
    if (d > 1) setDirection(bot, Math.atan2(-bot.z, -bot.x), rng);
    else {
      bot.dirX = 0;
      bot.dirZ = 0;
    }
    return;
  }
  candidates.sort((a, b) => b.value - a.value);
  const choice =
    rng.next() < bot.profile.judgement
      ? candidates[0]
      : candidates[Math.floor(rng.next() * Math.min(3, candidates.length))];
  if (!choice) return;
  if (choice.item !== bot.target) bot.actions++;
  bot.target = choice.item;
  const d = distance(bot.x, bot.z, choice.item.x, choice.item.z);
  if (d < 0.15) {
    bot.dirX = 0;
    bot.dirZ = 0;
    return;
  }
  setDirection(bot, Math.atan2(choice.item.z - bot.z, choice.item.x - bot.x), rng);
  // Hechtsprung, wenn es knapp wird.
  if (params.dash && t >= bot.dashReady && d > 2) {
    const hurry = choice.item.state === 'ground' || choice.item.landT - t < d / params.speed;
    if (hurry && rng.next() < bot.profile.judgement) {
      bot.dashUntil = t + DASH_S;
      bot.dashReady = t + DASH_COOLDOWN_S;
      bot.actions++;
    }
  }
}

function setDirection(bot: Bot, angle: number, rng: MinigameRng): void {
  const noisy = angle + gaussian(rng) * bot.profile.aimNoise;
  bot.dirX = Math.cos(noisy);
  bot.dirZ = Math.sin(noisy);
}
