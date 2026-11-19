/**
 * Brett-Regie im JS-Kern (CHAOS-143): der Regisseur des Browser-Hosts (`apps/host/src/board/director.ts`)
 * läuft unverändert hier, Swift zeichnet nur das fertige Bild. So bleiben Warteschlange,
 * `eventSeq`, Aufholen, Windstoß/Platztausch, Popups, Ticker, HUD-Texte und Klänge eine
 * TypeScript-Wahrheit wie die Regeln.
 *
 * Aus `getFrame()`/`getHud()` werden die Felder von `renderState().board` (siehe `contract.ts`):
 * Figuren samt Hüpf- und Flugbahn (`layout.ts`, gleiche Rechnung wie `createBoardScene.ts`),
 * Popups mit der Reaktion der Figur, Ticker, HUD, Kameraziel, Trophäen, Fallen und Klänge.
 *
 * Wie `BoardStage` im Browser-Host: Während ein Minispiel zu sehen ist, steht die Regie; beim
 * Zeigen des Bretts holt `settle()` auf, ohne Nachgeholtes zu animieren oder zu vertonen.
 */
import { DEFAULT_BOARD, getBoard, type BoardDefinition } from '@chaos-party/game-core';
import { PLAYER_SLOTS, type BoardMessage, type BoardView } from '@chaos-party/protocol';
import {
  createBoardDirector,
  type FramePawn,
  type FramePopup,
  type HudSnapshot,
} from '../../host/src/board/director.ts';
import {
  boardBounds,
  cameraFocus,
  easeFlight,
  flightPoint,
  GUST_FLIGHT,
  hopPoint,
  spreadPawns,
  SWAP_FLIGHT,
  type BoardBounds,
  type Point2,
} from '../../host/src/board/layout.ts';
import {
  bannerText,
  countdownText,
  ITEM_NAMES,
  promptDetail,
  promptStatus,
  roundText,
  TAILWIND_LEAD,
  tailwindAmount,
  tailwindRows,
} from '../../host/src/board/texts.ts';
import { boardEventSound } from '../../host/src/fx/boardSounds.ts';
import { SOUNDS, shapeRecipe } from '../../host/src/fx/sounds.ts';
import type { Hud, Pawn, Popup, SoundCue, TickerEntry } from './contract.ts';

/** Größter Regie-Schritt je `tick` (wie `MAX_STEP_MS` in `createBoardScene.ts`). */
export const MAX_STEP_MS = 100;
/** So lange steht ein Klang in `renderState`; Swift spielt jede ID einmal. */
export const SOUND_WINDOW_MS = 1500;
/** Umdrehungen im Flug (wie `FLIGHT_TURNS` in `createBoardScene.ts`). */
const FLIGHT_TURNS = { gust: 2, swap: 1 } as const;

export interface BoardDirectionFields {
  readonly pawns: Pawn[];
  readonly popups: Popup[];
  readonly ticker: TickerEntry[];
  readonly hud: Hud | null;
  readonly camera: { x: number; z: number };
  readonly trophySpaces: string[];
  readonly traps: { spaceId: string; owner: 1 | 2 | 3 | 4 }[];
  readonly sounds: SoundCue[];
}

export interface BoardDirection {
  receive(message: BoardMessage): void;
  /**
   * Lässt `ms` vergehen (je `tick`, auf `MAX_STEP_MS` begrenzt). `visible: false` (Minispiel) hält
   * die Regie an; beim nächsten sichtbaren Aufruf holt sie ohne Animation auf.
   */
  advance(ms: number, visible: boolean): void;
  fields(): BoardDirectionFields;
}

/** Reaktion der Figur auf ein neues Popup über ihr (wie `reactionFor` in `createBoardScene.ts`). */
export function reactionFor(popup: Pick<FramePopup, 'kind' | 'tone'>): Popup['reaction'] {
  switch (popup.kind) {
    case 'trophy':
      return popup.tone === 'gold' ? 'cheer' : null;
    case 'trap':
    case 'steal':
      return 'hit';
    case 'coins':
      return popup.tone === 'bad' ? 'hit' : popup.tone === 'good' ? 'jump' : null;
    default:
      return null;
  }
}

function boardOf(view: BoardView | null): BoardDefinition {
  return (view ? getBoard(view.boardId) : undefined) ?? DEFAULT_BOARD;
}

/** Lage einer Figur wie `syncPawns` in `createBoardScene.ts` (Babylon-Koordinaten). */
export function pawnPose(
  fp: FramePawn,
  spacePos: (id: string) => Point2,
  offset: Point2,
): Pick<Pawn, 'x' | 'y' | 'z' | 'heading'> {
  const hop = fp.hop;
  if (!hop) {
    const base = spacePos(fp.spaceId);
    return { x: base.x + offset.x, y: 0, z: base.z + offset.z, heading: null };
  }
  const from = spacePos(hop.from);
  const to = spacePos(hop.to);
  const moving = to.x !== from.x || to.z !== from.z;
  const heading = moving ? Math.atan2(to.x - from.x, to.z - from.z) : null;
  if (hop.style === 'walk') {
    const p = hopPoint(from, to, hop.t);
    return { x: p.x, y: p.y, z: p.z, heading };
  }
  const shape = hop.style === 'gust' ? GUST_FLIGHT : SWAP_FLIGHT;
  const p = flightPoint(from, to, hop.t, shape);
  const spin = FLIGHT_TURNS[hop.style] * 2 * Math.PI * easeFlight(hop.t, shape.ease);
  return { x: p.x, y: p.y, z: p.z, heading: ((heading ?? 0) + spin) % (2 * Math.PI) };
}

/** HUD-Daten aus dem Schnappschuss der Regie (Texte aus `texts.ts` wie `BoardHud.tsx`). */
export function hudOf(snapshot: HudSnapshot): Hud | null {
  const view = snapshot.view;
  if (!view) return null;
  const banner = bannerText(view);
  const status = promptStatus(view);
  const prompt = view.prompt;
  const rows = tailwindRows(view);
  return {
    boardName: boardOf(view).name,
    roundText: roundText(view),
    banner,
    bannerSlot: banner ? view.activeSlot : null,
    status:
      status && prompt
        ? {
            slot: prompt.slot,
            kind: prompt.kind,
            text: status,
            detail: promptDetail(view),
            countdown:
              prompt.kind === 'reaction' && snapshot.promptSeconds !== null
                ? countdownText(snapshot.promptSeconds)
                : null,
          }
        : null,
    players: [...view.players]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({
        slot: p.slot,
        name: p.name,
        color: PLAYER_SLOTS[p.slot].color,
        coins: p.coins,
        trophies: p.trophies,
        items: p.items.map((id) => ({ id, name: ITEM_NAMES[id] })),
        connected: p.connected,
        active: view.activeSlot === p.slot,
      })),
    tailwind: rows
      ? {
          lead: TAILWIND_LEAD,
          rows: rows.map((row) => ({
            slot: row.slot,
            name: row.name,
            amount: tailwindAmount(row.coins),
          })),
        }
      : null,
  };
}

export function createBoardDirection(): BoardDirection {
  const director = createBoardDirector();
  let now = 0;
  let hidden = false;
  let nextSoundId = 1;
  let sounds: (SoundCue & { readonly at: number })[] = [];
  /** `getHud()` liefert dasselbe Objekt, bis sich Sichtbares ändert: HUD und Ticker nur dann neu. */
  let hudCache: { snapshot: HudSnapshot; hud: Hud | null; ticker: TickerEntry[] } | null = null;
  let boundsCache: { board: BoardDefinition; bounds: BoardBounds } | null = null;

  director.onEvent((event) => {
    const cue = boardEventSound(event);
    if (!cue) return;
    // JSON-Kopie: `shapeRecipe` lässt fehlende Felder als `undefined` stehen.
    const voices = JSON.parse(
      JSON.stringify(shapeRecipe(SOUNDS[cue.name].recipe, cue.options)),
    ) as SoundCue['voices'];
    sounds.push({ id: nextSoundId++, name: cue.name, voices, at: now });
  });

  const hudParts = () => {
    const snapshot = director.getHud();
    if (hudCache?.snapshot !== snapshot) {
      hudCache = {
        snapshot,
        hud: hudOf(snapshot),
        ticker: snapshot.messages.map((m) => ({
          id: m.id,
          text: m.text,
          slot: m.slot,
          tone: m.tone,
        })),
      };
    }
    return hudCache;
  };

  return {
    receive(message) {
      director.receive(message);
    },
    advance(ms, visible) {
      const step = Math.min(MAX_STEP_MS, Math.max(0, ms));
      now += Math.max(0, ms);
      if (!visible) {
        hidden = true;
      } else {
        if (hidden) {
          hidden = false;
          director.settle();
        }
        director.advance(step);
      }
      if (sounds.length > 0 && now - (sounds[0]?.at ?? now) >= SOUND_WINDOW_MS) {
        sounds = sounds.filter((cue) => now - cue.at < SOUND_WINDOW_MS);
      }
    },
    fields() {
      const frame = director.getFrame();
      const view = frame.view;
      const board = boardOf(view);
      if (boundsCache?.board !== board) boundsCache = { board, bounds: boardBounds(board) };
      const bounds = boundsCache.bounds;
      const spacePos = (id: string): Point2 =>
        board.spaces.find((space) => space.id === id)?.position ?? bounds.center;
      const offsets = spreadPawns(frame.pawns.filter((p) => p.hop === null));
      const pawns: Pawn[] = frame.pawns.map((fp) => ({
        slot: fp.slot,
        spaceId: fp.spaceId,
        character: fp.character,
        ...pawnPose(fp, spacePos, offsets.get(fp.slot) ?? { x: 0, z: 0 }),
        hop: fp.hop ? { from: fp.hop.from, to: fp.hop.to, t: fp.hop.t, style: fp.hop.style } : null,
        connected: fp.connected,
      }));
      const active =
        view?.activeSlot == null ? null : pawns.find((p) => p.slot === view.activeSlot);
      const { hud, ticker } = hudParts();
      return {
        pawns,
        popups: frame.popups.map((p) => ({
          id: p.id,
          kind: p.kind,
          slot: p.slot,
          spaceId: p.spaceId,
          text: p.text,
          tone: p.tone,
          progress: p.progress,
          reaction: p.slot === null ? null : reactionFor(p),
        })),
        ticker,
        hud,
        camera: cameraFocus(bounds, active ? { x: active.x, z: active.z } : null),
        trophySpaces: [...(view?.trophySpaces ?? [])],
        traps: (view?.traps ?? []).map((t) => ({ spaceId: t.spaceId, owner: t.owner })),
        sounds: sounds.map(({ id, name, voices }) => ({ id, name, voices })),
      };
    },
  };
}
