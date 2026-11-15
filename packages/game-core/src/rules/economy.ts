/**
 * Münzen, Trophäen und Wertung. Münzen fallen nie unter 0; Ereignisse tragen immer das
 * tatsächliche Delta. Deltas von 0 erzeugen kein `coins-changed`.
 */
import { pickOne } from '../rng.ts';
import type { CoinReason, PlayerState, RankingCriterion, RankingEntry, Slot } from '../types.ts';
import { playerOf, type Ctx } from './internal.ts';

/** Münzen ändern (nie unter 0). Liefert das tatsächliche Delta. */
export function changeCoins(ctx: Ctx, slot: Slot, delta: number, reason: CoinReason): number {
  const player = playerOf(ctx, slot);
  const balance = Math.max(0, player.coins + delta);
  const actual = balance - player.coins;
  if (actual === 0) return 0;
  player.coins = balance;
  ctx.events.push({ type: 'coins-changed', slot, delta: actual, balance, reason });
  return actual;
}

/** Bis zu `amount` Münzen von `from` an `to` (höchstens Bestand). Liefert die Menge. */
export function transferCoins(
  ctx: Ctx,
  from: Slot,
  to: Slot,
  amount: number,
  reason: CoinReason,
): number {
  const moved = Math.min(Math.max(0, amount), playerOf(ctx, from).coins);
  if (moved > 0) {
    changeCoins(ctx, from, -moved, reason);
    changeCoins(ctx, to, moved, reason);
  }
  return moved;
}

/** Alle `trophy`-Felder des Bretts in Brett-Reihenfolge. */
export function trophyCandidates(ctx: Ctx): string[] {
  const ids: string[] = [];
  for (const space of ctx.spaces.values()) {
    if (space.kind === 'trophy') ids.push(space.id);
  }
  return ids;
}

/**
 * Bei `wandering`: eine aktive Trophäe springt zu einem freien `trophy`-Feld (seeded).
 * `from` = die gekaufte Trophäe; ohne `from` (Brett-Ereignis) die einzige bzw. eine
 * zufällige aktive. Gibt es kein freies Feld, bleibt sie. Bei `fixed` passiert nichts.
 */
export function wanderTrophy(ctx: Ctx, from?: string): void {
  const { d } = ctx;
  if (ctx.rules.trophy.mode !== 'wandering') return;
  const moving =
    from ?? (d.trophySpaces.length > 1 ? pickOne(ctx.rng, d.trophySpaces) : d.trophySpaces[0]);
  if (moving === undefined) return;
  const index = d.trophySpaces.indexOf(moving);
  if (index < 0) return;
  const others = trophyCandidates(ctx).filter((id) => !d.trophySpaces.includes(id));
  if (others.length === 0) return;
  const to = pickOne(ctx.rng, others);
  d.trophySpaces = d.trophySpaces.map((id, i) => (i === index ? to : id));
  ctx.events.push({ type: 'trophy-moved', from: moving, to });
}

/** Trophäe auf dem aktuellen Feld des aktiven Spielers kaufen (Prüfung macht der Aufrufer). */
export function buyTrophy(ctx: Ctx, slot: Slot): void {
  const player = playerOf(ctx, slot);
  const spaceId = player.spaceId;
  changeCoins(ctx, slot, -ctx.rules.trophy.price, 'trophy');
  player.trophies += 1;
  ctx.events.push({ type: 'trophy-bought', slot, spaceId });
  wanderTrophy(ctx, spaceId);
}

export function canAffordTrophy(ctx: Ctx, slot: Slot): boolean {
  return playerOf(ctx, slot).coins >= ctx.rules.trophy.price;
}

type Rankable = Pick<PlayerState, 'slot' | 'trophies' | 'coins'> & {
  /** Fehlt = 0 (ältere Aufrufer ohne Minispiel-Zähler). */
  readonly minigameWins?: number;
};

const CRITERIA: readonly RankingCriterion[] = ['trophies', 'coins', 'minigame-wins', 'shared'];

/** Schlüssel der Wertung in Reihenfolge (höher = besser). */
function keys(p: Rankable): readonly [number, number, number] {
  return [p.trophies, p.coins, p.minigameWins ?? 0];
}

/** Vergleich nach Wertung: < 0 = `a` besser. */
function compare(a: Rankable, b: Rankable): number {
  const ka = keys(a);
  const kb = keys(b);
  for (let i = 0; i < ka.length; i++) {
    const diff = (kb[i] ?? 0) - (ka[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Erstes Kriterium, in dem sich `a` und `b` unterscheiden (Index in `CRITERIA`). */
function separatingLevel(a: Rankable, b: Rankable): number {
  const ka = keys(a);
  const kb = keys(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return i;
  return ka.length;
}

/**
 * Endstand (M4, ADR-014): Trophäen absteigend, dann Münzen, dann Minispiel-Siege (Anzahl
 * 1. Plätze). Gleichstand in allen drei = gleicher, geteilter Platz (Platz = 1 + Zahl der echt
 * Besseren); innerhalb eines Gleichstands nach Slot sortiert. `decidedBy` nennt das tiefste
 * Kriterium, das diesen Spieler von allen anderen trennt (für die Inszenierung am PC).
 */
export function rankPlayers(players: readonly Rankable[]): RankingEntry[] {
  const sorted = [...players].sort((a, b) => compare(a, b) || a.slot - b.slot);
  return sorted.map((p) => {
    let level = 0;
    for (const other of players) {
      if (other.slot !== p.slot) level = Math.max(level, separatingLevel(p, other));
    }
    return {
      slot: p.slot,
      place: 1 + players.filter((o) => compare(o, p) < 0).length,
      trophies: p.trophies,
      coins: p.coins,
      minigameWins: p.minigameWins ?? 0,
      decidedBy: CRITERIA[level] ?? 'shared',
    };
  });
}
