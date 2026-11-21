/**
 * Würfeln und Laufen (CHAOS-19). Eine Bewegung besteht aus Abschnitten; ein Abschnitt endet
 * (a) wenn die Schritte aufgebraucht sind, (b) an einer Verzweigung mit Restschritten
 * (Wegwahl), (c) beim Betreten der aktiven Trophäe mit genug Münzen (Kaufangebot) oder
 * (d) bei `trapTrigger: 'pass'` auf einer fremden Falle mit Restschritten (Falle löst aus).
 * Je Abschnitt ein `moved`-Ereignis; der Host animiert es mit `stepMs` je Feld.
 */
import { cableCarAt, isCableEdge, isIce } from '../board/hazards.ts';
import { pickOne } from '../rng.ts';
import type { Slot } from '../types.ts';
import { buyTrophy, canAffordTrophy, changeCoins } from './economy.ts';
import {
  activePlayer,
  nextOf,
  pathOptions,
  playerOf,
  schedule,
  type Ctx,
  type MovePending,
} from './internal.ts';
import { hasForeignTrap, triggerTrap } from './items.ts';
import { openPathPrompt, openTrophyPrompt } from './prompts.ts';

/** Würfeln: je Würfel eine Seite aus `diceFaces` (gleichverteilt), dann Phase `move`. */
export function rollDice(ctx: Ctx, t: number): void {
  const { d, rules } = ctx;
  const player = activePlayer(ctx);
  const count = Math.max(1, d.internal.diceCount);
  const faces: number[] = [];
  for (let i = 0; i < count; i++) faces.push(pickOne(ctx.rng, rules.diceFaces));
  const total = faces.reduce((sum, face) => sum + face, 0);
  ctx.events.push({ type: 'dice-rolled', slot: player.slot, faces, total });
  d.internal.diceCount = 1;
  d.internal.move = { stepsLeft: Math.max(0, total), chosenNext: null, pending: null };
  schedule(ctx, 'move', t, rules.pacing.rollMs);
}

/** Nächsten Abschnitt laufen. Setzt Position sofort aufs Abschnittsende. */
function walkSegment(ctx: Ctx, t: number): void {
  const { d } = ctx;
  const move = d.internal.move;
  if (!move) throw new Error('Keine Bewegung aktiv');
  const player = activePlayer(ctx);
  const path: string[] = [];
  let current = player.spaceId;
  let pending: MovePending = 'land';
  while (move.stepsLeft > 0) {
    // Drehendes Feld (Karussell): nur der Ausgang dieser Runde, keine Wegwahl. Zu teure
    // Seilbahn (CHAOS-198): nicht im Angebot, bleibt ein Weg, läuft die Figur ohne Wahl weiter.
    const next = pathOptions(ctx, current, player.slot);
    const only = next.length === 1 ? next[0] : undefined;
    let to: string;
    if (move.chosenNext !== null) {
      to = move.chosenNext;
      move.chosenNext = null;
    } else if (next.length >= 2) {
      pending = 'path';
      break;
    } else if (only !== undefined) {
      to = only;
    } else {
      // Sackgasse: Restschritte verfallen (validateBoard sollte das verhindern).
      move.stepsLeft = 0;
      break;
    }
    current = to;
    path.push(to);
    move.stepsLeft -= 1;
    // Beim Landen löst die Falle ohnehin in der Feldwirkung aus.
    if (
      ctx.rules.items.trapTrigger === 'pass' &&
      move.stepsLeft > 0 &&
      hasForeignTrap(ctx, to, player.slot)
    ) {
      pending = 'trap';
      break;
    }
    if (d.trophySpaces.includes(to) && canAffordTrophy(ctx, player.slot)) {
      pending = 'trophy';
      break;
    }
  }
  player.spaceId = current;
  move.pending = pending;
  if (path.length > 0) ctx.events.push({ type: 'moved', slot: player.slot, path });
  schedule(ctx, 'move', t, path.length * ctx.rules.pacing.stepMs);
}

/**
 * Zeit in Phase `move` ist abgelaufen: entweder ist die Würfelanimation vorbei (nächsten
 * Abschnitt laufen) oder ein Abschnitt ist zu Ende animiert (dessen Ausgang anwenden).
 * Liefert `true`, wenn die Bewegung beendet ist und das Feldereignis folgt.
 */
export function resumeMovement(ctx: Ctx, t: number): boolean {
  const move = ctx.d.internal.move;
  if (!move) throw new Error('Keine Bewegung aktiv');
  switch (move.pending) {
    case null:
      walkSegment(ctx, t);
      return false;
    case 'path':
      openPathPrompt(ctx, t);
      return false;
    case 'trophy':
      openTrophyPrompt(ctx, t);
      return false;
    case 'trap': {
      // Falle beim Darüberlaufen: auslösen, kurz anzeigen, dann weiter (ggf. Trophäe hier).
      triggerTrap(ctx);
      const player = activePlayer(ctx);
      const atTrophy =
        ctx.d.trophySpaces.includes(player.spaceId) && canAffordTrophy(ctx, player.slot);
      move.pending = atTrophy ? 'trophy' : null;
      schedule(ctx, 'move', t, ctx.rules.pacing.spaceEventMs);
      return false;
    }
    case 'land':
      ctx.d.internal.move = null;
      return true;
  }
}

/** Weg an der Verzweigung gewählt: Bewegung läuft sofort weiter. */
export function choosePath(ctx: Ctx, spaceId: string, t: number): void {
  const move = ctx.d.internal.move;
  if (!move) throw new Error('Keine Bewegung aktiv');
  const player = activePlayer(ctx);
  ctx.events.push({ type: 'path-chosen', slot: player.slot, spaceId });
  // Seilbahn (CHAOS-198): Fahrpreis beim Einsteigen (nur angeboten, wenn bezahlbar).
  const car = cableCarAt(ctx.d.internal.board, player.spaceId, spaceId);
  if (car) changeCoins(ctx, player.slot, -car.price, 'event');
  move.chosenNext = spaceId;
  move.pending = null;
  schedule(ctx, 'move', t, 0);
}

/** Kauf oder Weiterlaufen am Trophäenfeld; nach einem Kauf kurze Anzeige-Pause. */
export function decideTrophy(ctx: Ctx, buy: boolean, t: number): void {
  const move = ctx.d.internal.move;
  if (!move) throw new Error('Keine Bewegung aktiv');
  const player = activePlayer(ctx);
  if (buy) buyTrophy(ctx, player.slot);
  move.pending = move.stepsLeft > 0 ? null : 'land';
  schedule(ctx, 'move', t, buy ? ctx.rules.pacing.spaceEventMs : 0);
}

/**
 * Windstoß: 1–2 Felder vorwärts (an Verzweigungen zufällig, am Karussell der Ausgang der Runde,
 * nie gratis mit der Seilbahn), ohne erneute Feldwirkung.
 */
export function gustForward(ctx: Ctx, slot: Slot, steps: number): void {
  const player = playerOf(ctx, slot);
  const board = ctx.d.internal.board;
  const path: string[] = [];
  let current = player.spaceId;
  for (let i = 0; i < steps; i++) {
    const from = current;
    const next = nextOf(ctx, from).filter((to) => !isCableEdge(board, from, to));
    if (next.length === 0) break;
    // Ein Nachfolger: ohne Zufall; Verzweigung: seeded.
    current = (next.length === 1 ? next[0] : undefined) ?? pickOne(ctx.rng, next);
    path.push(current);
  }
  player.spaceId = current;
  if (path.length > 0) ctx.events.push({ type: 'moved', slot, path });
}

/** Plätze zweier Spieler tauschen (je ein `moved` mit genau einem Feld). */
export function swapPlaces(ctx: Ctx, a: Slot, b: Slot): void {
  const pa = playerOf(ctx, a);
  const pb = playerOf(ctx, b);
  if (pa.spaceId === pb.spaceId) return;
  const spaceA = pa.spaceId;
  pa.spaceId = pb.spaceId;
  pb.spaceId = spaceA;
  ctx.events.push({ type: 'moved', slot: a, path: [pa.spaceId] });
  ctx.events.push({ type: 'moved', slot: b, path: [pb.spaceId] });
}

/** Höchstens so viele Felder rutscht eine Figur am Stück (Schutz, `validateBoard` prüft Eis). */
const MAX_SLIDE = 16;

/**
 * Eisfelder (CHAOS-198): Steht die Figur am Ende ihres Wurfs auf Eis, rutscht sie ein Feld
 * weiter, auf Eis wieder eins, bis sie auf festem Feld steht (ein `moved`, ohne Fallen
 * unterwegs). Die Feldwirkung gilt danach dort. Liefert die gerutschten Felder.
 */
export function slideOnIce(ctx: Ctx, slot: Slot): number {
  const board = ctx.d.internal.board;
  if (!board.ice) return 0;
  const player = playerOf(ctx, slot);
  const path: string[] = [];
  let current = player.spaceId;
  while (isIce(board, current) && path.length < MAX_SLIDE) {
    const to = nextOf(ctx, current)[0];
    if (to === undefined) break;
    current = to;
    path.push(to);
  }
  if (path.length === 0) return 0;
  player.spaceId = current;
  ctx.events.push({ type: 'moved', slot, path });
  return path.length;
}
