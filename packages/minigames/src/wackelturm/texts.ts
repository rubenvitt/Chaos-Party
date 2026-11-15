/**
 * Texte des Wackelturms für HUD, Banner und Höhepunkte (rein, testbar). Grenzen aus dem
 * Vertrag: Status ≤ 16, Banner ≤ 32, Höhepunkte 0–4 Zeilen ≤ 64 Zeichen.
 */
import { MINIGAME_TEXT_LIMITS, type MinigamePlacement, type Slot } from '@chaos-party/minigame-sdk';
import type { MinigamePlayer } from '@chaos-party/minigame-sdk/babylon';
import type { Runner, WackelturmParams, WackelturmState } from './logic.ts';

export const STATUS_LIMIT = 16;
export const BANNER_LIMIT = 32;
/** Ab diesem Wackelwert steht „kippelt!“ im HUD (Turm schwankt sichtbar). */
export const SHAKY = 0.6;
/** In den letzten Millisekunden mahnt das Banner zum Abliefern. */
export const FINAL_CALL_MS = 5_000;

export interface BannerState {
  readonly text: string;
  /** Spielzeit (s), bis zu der die Meldung steht. */
  readonly until: number;
}

/** Kurzer Taktik-Zustand eines Spielers im HUD. */
export function hudStatus(runner: Runner, params: WackelturmParams): string | undefined {
  const height = runner.stack.length;
  if (height === 0) return runner.stun > 0 ? 'benommen' : undefined;
  if (runner.wobble >= SHAKY) return `${String(height)}er kippelt!`;
  const bonus = params.bonusFrom !== null && height >= params.bonusFrom;
  return `Turm ${String(height)}${bonus ? ` ×${String(params.bonusFactor)}` : ''}`;
}

/** Banner: frische Meldung, sonst in den letzten Sekunden der Aufruf zum Abliefern. */
export function bannerFor(
  banner: BannerState | null,
  time: number,
  remainingMs: number,
  finished: boolean,
): string | undefined {
  if (finished) return undefined;
  if (banner && time < banner.until) return clip(banner.text, BANNER_LIMIT);
  if (remainingMs > 0 && remainingMs <= FINAL_CALL_MS) return 'Letzte Sekunden – abliefern!';
  return undefined;
}

/** Höhepunkte für die Ergebnisanzeige (0–4 Zeilen, je ≤ 64 Zeichen). */
export function buildHighlights(
  state: WackelturmState,
  players: readonly MinigamePlayer[],
  placements: readonly MinigamePlacement[],
): string[] {
  const name = (slot: Slot) =>
    clip(players.find((player) => player.slot === slot)?.name ?? `Spieler ${String(slot)}`, 16);
  const top = (key: keyof Runner['stats']): Runner | undefined =>
    [...state.runners].sort((a, b) => b.stats[key] - a.stats[key] || a.slot - b.slot)[0];
  const lines: string[] = [];

  const builder = top('bestDelivery');
  if (builder && builder.stats.bestDelivery >= 6) {
    lines.push(
      `${name(builder.slot)} lieferte einen ${String(builder.stats.bestDelivery)}er-Turm ab!`,
    );
  }
  const thief = top('stolen');
  if (thief && thief.stats.stolen >= 3) {
    lines.push(`${name(thief.slot)} klaute ${String(thief.stats.stolen)} Törtchen.`);
  }
  const clumsy = top('topples');
  if (clumsy && clumsy.stats.topples >= 2) {
    lines.push(`${name(clumsy.slot)} verlor ${String(clumsy.stats.topples)} Türme.`);
  }
  const goldie = top('gold');
  if (goldie && goldie.stats.gold >= 1) {
    const count = goldie.stats.gold;
    lines.push(`${name(goldie.slot)} schnappte ${String(count)} Goldtörtchen.`);
  }
  if (lines.length === 0) {
    const winner = placements[0];
    if (winner) {
      lines.push(`${name(winner.slot)} gewinnt mit ${String(winner.score)} Punkten.`);
    }
  }
  return lines
    .slice(0, MINIGAME_TEXT_LIMITS.highlights)
    .map((line) => clip(line, MINIGAME_TEXT_LIMITS.highlight));
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
