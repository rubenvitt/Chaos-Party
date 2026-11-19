/**
 * Anzeigedaten der Minispiel-Bildschirme für Swift (CHAOS-144): Anleitung, HUD und Ergebnis wie
 * `MinigameScreen` im Browser-Host. Dieselben reinen Funktionen (`plan.ts`, `results.ts`,
 * `texts.ts`) aus `apps/host`; Swift zeichnet nur noch.
 */
import type { MinigameInfo } from '@chaos-party/minigame-sdk';
import type { MinigameHud } from '@chaos-party/minigame-sdk/babylon';
import { PLAYER_SLOTS, type BoardView } from '@chaos-party/protocol';
import { ITEM_NAMES } from '../../host/src/board/texts.ts';
import { characterName, phaseSecondsLeft } from '../../host/src/minigame/plan.ts';
import { resultsDisplay } from '../../host/src/minigame/results.ts';
import type { MinigameInfoView, MinigameResults, MinigameScoreboard } from './contract.ts';

export function infoView(info: MinigameInfo): MinigameInfoView {
  return {
    title: info.title,
    tagline: info.tagline,
    instructions: [...info.instructions],
    controls: { joystick: info.controls.joystick, a: info.controls.a, b: info.controls.b },
    scoreUnit: info.scoreUnit,
  };
}

/** Ganze Sekunden bis zum Spielstart (Intro), wie die Anleitungskarte im Browser-Host. */
export function introCountdown(view: BoardView, receivedAt: number, now: number): number | null {
  if (view.gamePhase !== 'minigame-intro') return null;
  // In der Pause steht die Uhr (Restzeit gilt ab Empfang).
  return phaseSecondsLeft(view.remainingMs, receivedAt, view.paused ? receivedAt : now);
}

/** HUD im Spiel: Restzeit, Banner, je Spieler Punkte, Status und Verbindung (`PlayHud`). */
export function scoreboardView(
  view: BoardView,
  hud: MinigameHud | null,
  remainingMs: number,
  waiting: boolean,
): MinigameScoreboard {
  const scores = new Map((hud?.scores ?? []).map((entry) => [entry.slot, entry]));
  return {
    seconds: Math.max(0, Math.ceil(remainingMs / 1000)),
    banner: hud?.banner ?? null,
    waiting,
    scores: [...view.players]
      .sort((a, b) => a.slot - b.slot)
      .map((player) => {
        const entry = scores.get(player.slot);
        return {
          slot: player.slot,
          name: player.name,
          character: characterName(view, player.slot),
          color: PLAYER_SLOTS[player.slot].color,
          symbol: PLAYER_SLOTS[player.slot].symbol,
          score: entry?.score ?? 0,
          status: player.connected ? (entry?.status ?? null) : '⚠ getrennt',
          connected: player.connected,
        };
      }),
  };
}

/** Ergebnis aus dem autoritativen Server-Stand (`resultsDisplay`), Münzen und Trostpreis. */
export function resultsView(
  view: BoardView,
  info: Pick<MinigameInfo, 'scoreUnit'>,
): MinigameResults {
  const display = resultsDisplay(view, info, null);
  return {
    aborted: display.aborted,
    headline: display.headline,
    highlights: [...display.highlights],
    rows: display.rows.map((row) => ({
      slot: row.slot,
      name: row.name,
      character: row.character,
      color: row.color,
      symbol: row.symbol,
      place: row.place,
      tied: row.tied,
      scoreText: row.scoreText,
      coins: row.coins,
      prizes: row.items.map((item) => ITEM_NAMES[item]),
    })),
  };
}
