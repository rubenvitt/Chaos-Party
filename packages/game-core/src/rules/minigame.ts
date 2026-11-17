/**
 * Minispiel-Phasen (M3, CHAOS-26/34, ADR-012).
 *
 * Ablauf: `minigame-intro` (Anleitung, `minigameIntroMs`; lief das Minispiel in der Partie schon,
 * die kurze `minigameRepeatIntroMs`, CHAOS-66) → `minigame-play` (der Host spielt,
 * Frist = Spielzeit + `minigameResultGraceMs`) → `minigame-results` → `round-end`.
 *
 * Die Regeln kennen von einem Minispiel nur Kennung, Spielzeit und Wertungsart. Das Ergebnis
 * kommt als Befehl `minigame-result` vom Host und wird hier vollständig geprüft (Teilnehmer,
 * Wertung mit Gleichstand, Punkte passend zu den Plätzen), bevor Münzen verteilt werden.
 * Ohne konfigurierte Minispiele bleibt der M2-Platzhalter (Rangfolge per Seed).
 */
import { checkResult } from '@chaos-party/minigame-sdk';
import { shuffled } from '../rng.ts';
import type { ItemKind, MinigamePlacement, MinigameSpec, Pacing } from '../types.ts';
import { changeCoins } from './economy.ts';
import { playerOf, schedule, type Ctx } from './internal.ts';
import { gainRandomItem } from './items.ts';

export const PLACEHOLDER_MINIGAME = 'placeholder';
export const DEFAULT_MINIGAME_RESULT_GRACE_MS = 15_000;

function specs(ctx: Ctx): readonly MinigameSpec[] {
  return ctx.d.config.minigames;
}

/** Nächstes Minispiel: aus einer gemischten Liste ohne Wiederholung ziehen. */
function drawMinigame(ctx: Ctx): MinigameSpec | null {
  const all = specs(ctx);
  if (all.length === 0) return null;
  const { internal } = ctx.d;
  if (internal.minigameBag.length === 0) {
    const bag = shuffled(
      ctx.rng,
      all.map((spec) => spec.id),
    );
    // Beim Neumischen nicht direkt dasselbe wie zuletzt.
    const first = bag[0];
    if (bag.length > 1 && first === internal.minigameLast) bag.push(...bag.splice(0, 1));
    internal.minigameBag = bag;
  }
  const id = internal.minigameBag.shift();
  if (id === undefined) return null;
  internal.minigameLast = id;
  return all.find((spec) => spec.id === id) ?? null;
}

/** Nach dem letzten Zug der Runde: Minispiel wählen und Anleitung zeigen. */
export function enterMinigame(ctx: Ctx, t: number): void {
  const { d } = ctx;
  const spec = drawMinigame(ctx);
  const id = spec?.id ?? PLACEHOLDER_MINIGAME;
  // Der Platzhalter (M2) hat keine Anleitung zum Kürzen: dort zählt jede Runde als erste.
  const played = d.internal.minigamePlayed;
  const repeat = spec !== null && played.includes(id);
  if (spec !== null && !repeat) played.push(id);
  d.activeSlot = null;
  d.minigame = {
    id,
    round: d.round,
    seed: ctx.rng.int(0, 0xffff_ffff),
    playMs: spec?.playMs ?? ctx.rules.pacing.minigamePlayMs,
    repeat,
    playStartedAt: null,
    placements: null,
    highlights: [],
    aborted: false,
    rewards: null,
  };
  ctx.events.push({ type: 'minigame-started', minigame: d.minigame.id });
  schedule(ctx, 'minigame-intro', t, minigameIntroMs(ctx.rules.pacing, repeat));
}

/** Dauer der Anleitung: voll beim ersten Mal, kurz bei Wiederholung (CHAOS-66). */
export function minigameIntroMs(pacing: Pacing, repeat: boolean): number {
  return repeat ? (pacing.minigameRepeatIntroMs ?? pacing.minigameIntroMs) : pacing.minigameIntroMs;
}

/** Anleitung vorbei: Spielzeit läuft. */
export function startMinigamePlay(ctx: Ctx, t: number): void {
  const { d } = ctx;
  const minigame = d.minigame;
  if (!minigame) throw new Error('Minispiel fehlt');
  d.minigame = { ...minigame, playStartedAt: t };
  const wait =
    minigame.id === PLACEHOLDER_MINIGAME
      ? minigame.playMs
      : minigame.playMs +
        (ctx.rules.pacing.minigameResultGraceMs ?? DEFAULT_MINIGAME_RESULT_GRACE_MS);
  schedule(ctx, 'minigame-play', t, wait);
}

/** Frist von `minigame-play` abgelaufen: Platzhalter auflösen bzw. echtes Minispiel abbrechen. */
export function expireMinigame(ctx: Ctx, t: number): void {
  const minigame = ctx.d.minigame;
  if (!minigame) throw new Error('Minispiel fehlt');
  if (minigame.id === PLACEHOLDER_MINIGAME) {
    const ranking = shuffled(
      ctx.rng,
      ctx.d.players.map((p) => p.slot),
    );
    finishMinigame(
      ctx,
      ranking.map((slot, index) => ({ slot, place: index + 1, score: 0 })),
      [],
      t,
    );
    return;
  }
  ctx.d.minigame = { ...minigame, placements: [], aborted: true, rewards: [] };
  ctx.events.push({ type: 'minigame-results', ranking: [], placements: [], aborted: true });
  schedule(ctx, 'minigame-results', t, ctx.rules.pacing.minigameResultsMs);
}

export type MinigameResultCheck = { ok: true } | { ok: false; message: string };

/** Prüft ein Host-Ergebnis gegen das laufende Minispiel (ohne etwas zu ändern). */
export function checkMinigameResult(
  ctx: Ctx,
  command: {
    readonly minigameId: string;
    readonly round: number;
    readonly placements: readonly MinigamePlacement[];
    readonly highlights?: readonly string[];
  },
): MinigameResultCheck {
  const { d } = ctx;
  const minigame = d.minigame;
  if (d.phase !== 'minigame-play' || !minigame || minigame.id === PLACEHOLDER_MINIGAME) {
    return { ok: false, message: `Kein Minispiel-Ergebnis erwartet (Phase ${d.phase})` };
  }
  if (command.round !== minigame.round) {
    return {
      ok: false,
      message: `Ergebnis für Runde ${String(command.round)}, läuft ${String(minigame.round)}`,
    };
  }
  const spec = specs(ctx).find((candidate) => candidate.id === minigame.id);
  const check = checkResult(
    {
      minigameId: command.minigameId,
      placements: command.placements,
      ...(command.highlights === undefined ? {} : { highlights: command.highlights }),
    },
    {
      minigameId: minigame.id,
      slots: d.players.map((p) => p.slot),
      ...(spec ? { scoring: spec.scoring } : {}),
    },
  );
  return check.ok ? { ok: true } : { ok: false, message: check.reason };
}

/** Geprüftes Ergebnis übernehmen: Münzen je Platz, Ergebnisanzeige. */
export function finishMinigame(
  ctx: Ctx,
  placements: readonly MinigamePlacement[],
  highlights: readonly string[],
  t: number,
): void {
  const { d } = ctx;
  const minigame = d.minigame;
  if (!minigame) throw new Error('Minispiel fehlt');
  const sorted = [...placements]
    .map((entry) => ({ slot: entry.slot, place: entry.place, score: entry.score }))
    .sort((a, b) => a.place - b.place || a.slot - b.slot);
  ctx.events.push({
    type: 'minigame-results',
    ranking: sorted.map((entry) => entry.slot),
    placements: sorted,
    aborted: false,
  });
  const rewards = sorted.map((entry) => {
    const reward = ctx.rules.economy.minigameRewards[entry.place - 1] ?? 0;
    // Siege zählen sofort (drittes Wertungskriterium, CHAOS-37); Gleichstand auf 1 für alle.
    if (entry.place === 1) playerOf(ctx, entry.slot).minigameWins += 1;
    return { slot: entry.slot, coins: changeCoins(ctx, entry.slot, reward, 'minigame') };
  });
  // CHAOS-51 (EXP-019): optional Items für den Sieg bzw. als Trostpreis für den letzten Platz
  // (geteilt: alle; sind alle gleichauf, gibt es keinen letzten Platz).
  const lastPlace = Math.max(...sorted.map((entry) => entry.place));
  const withItems = rewards.map((reward, index) => {
    const entry = sorted[index];
    if (!entry) return reward;
    let count = entry.place === 1 ? (ctx.rules.items.minigameWinItems ?? 0) : 0;
    if (entry.place === lastPlace && lastPlace > 1) count += ctx.rules.items.minigameLastItems ?? 0;
    const items: ItemKind[] = [];
    for (let i = 0; i < count; i++) {
      const item = gainRandomItem(ctx, entry.slot);
      if (item) items.push(item);
    }
    return items.length > 0 ? { ...reward, items } : reward;
  });
  d.minigame = {
    ...minigame,
    placements: sorted,
    highlights: [...highlights],
    aborted: false,
    rewards: withItems,
  };
  schedule(ctx, 'minigame-results', t, ctx.rules.pacing.minigameResultsMs);
}
