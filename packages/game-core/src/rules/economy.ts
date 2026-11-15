/**
 * Münzen, Trophäen und Wertung. Münzen fallen nie unter 0; Ereignisse tragen immer das
 * tatsächliche Delta. Deltas von 0 erzeugen kein `coins-changed`.
 */
import { pickOne, shuffled } from '../rng.ts';
import type { CoinReason, PlayerState, RankingEntry, Slot } from '../types.ts';
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
 * Bei `wandering`: die aktive Trophäe springt zu einem anderen `trophy`-Feld (seeded).
 * Gibt es kein anderes, bleibt sie. Bei `fixed` passiert nichts.
 */
export function wanderTrophy(ctx: Ctx): void {
  const { d } = ctx;
  if (ctx.rules.trophy.mode !== 'wandering') return;
  const from = d.trophySpaces[0];
  if (from === undefined) return;
  const others = trophyCandidates(ctx).filter((id) => id !== from);
  if (others.length === 0) return;
  const to = pickOne(ctx.rng, others);
  d.trophySpaces = [to];
  ctx.events.push({ type: 'trophy-moved', from, to });
}

/** Trophäe auf dem aktuellen Feld des aktiven Spielers kaufen (Prüfung macht der Aufrufer). */
export function buyTrophy(ctx: Ctx, slot: Slot): void {
  const player = playerOf(ctx, slot);
  const spaceId = player.spaceId;
  changeCoins(ctx, slot, -ctx.rules.trophy.price, 'trophy');
  player.trophies += 1;
  ctx.events.push({ type: 'trophy-bought', slot, spaceId });
  wanderTrophy(ctx);
}

export function canAffordTrophy(ctx: Ctx, slot: Slot): boolean {
  return playerOf(ctx, slot).coins >= ctx.rules.trophy.price;
}

/** Platzhalter-Minispiel: Rangfolge per seeded Shuffle, Münzen laut `minigameRewards`. */
export function resolvePlaceholderMinigame(ctx: Ctx): void {
  const ranking = shuffled(
    ctx.rng,
    ctx.d.players.map((p) => p.slot),
  );
  ctx.events.push({ type: 'minigame-results', ranking });
  ranking.forEach((slot, index) => {
    changeCoins(ctx, slot, ctx.rules.economy.minigameRewards[index] ?? 0, 'minigame');
  });
}

/**
 * Endstand: Trophäen absteigend, dann Münzen absteigend. Gleichstand in beidem = gleicher
 * Platz (Platz = 1 + Zahl der echt Besseren). Bei Gleichstand nach Slot sortiert.
 */
export function rankPlayers(
  players: readonly Pick<PlayerState, 'slot' | 'trophies' | 'coins'>[],
): RankingEntry[] {
  const sorted = [...players].sort(
    (a, b) => b.trophies - a.trophies || b.coins - a.coins || a.slot - b.slot,
  );
  return sorted.map((p) => ({
    slot: p.slot,
    place:
      1 +
      players.filter(
        (o) => o.trophies > p.trophies || (o.trophies === p.trophies && o.coins > p.coins),
      ).length,
    trophies: p.trophies,
    coins: p.coins,
  }));
}
