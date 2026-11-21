/**
 * Figuren-Animation nach Spielzustand (aus Sockenregen herausgelöst): wählt idle/run/jump/fall
 * aus dem Zustand und spielt nur bei Wechsel; am Ende jubeln Sieger, die anderen sind traurig.
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { MinigamePlacement, Slot } from '@chaos-party/minigame-sdk';
import type {
  CharacterAnimation,
  CharacterHandle,
  MinigamePlayer,
} from '@chaos-party/minigame-sdk/babylon';
import { createSlotBadge, createSlotRing, createStunStars } from './badges.ts';
import type { MinigameStage } from './stage.ts';

export interface FigureState {
  readonly stunned: boolean;
  readonly dashing?: boolean;
  readonly moving: boolean;
}

/** Benommen → fall, hechtend → jump, laufend → run, sonst idle. */
export function pickAnimation(state: FigureState): CharacterAnimation {
  if (state.stunned) return 'fall';
  if (state.dashing) return 'jump';
  return state.moving ? 'run' : 'idle';
}

/** Merkt sich die laufende Animation einer Figur und spielt nur Wechsel. */
export class AnimationSync {
  current: CharacterAnimation | null = null;

  constructor(readonly character: CharacterHandle) {}

  play(animation: CharacterAnimation): void {
    if (animation === this.current) return;
    this.character.play(animation);
    this.current = animation;
  }

  /** Wie `play`, aber auch dann, wenn dieselbe Animation schon läuft (einmalige Animationen). */
  replay(animation: CharacterAnimation): void {
    this.character.play(animation);
    this.current = animation;
  }
}

/** Sieger (Platz 1) jubeln, alle anderen sind traurig. Liefert die Sieger-Slots. */
export function celebrate(
  placements: readonly MinigamePlacement[],
  figures: ReadonlyMap<Slot, AnimationSync>,
): Slot[] {
  const winners: Slot[] = [];
  for (const placement of placements) {
    const figure = figures.get(placement.slot);
    if (!figure) continue;
    const winner = placement.place === 1;
    figure.replay(winner ? 'cheer' : 'sad');
    if (winner) winners.push(placement.slot);
  }
  return winners;
}

export interface SlotFigureOptions {
  /** Ring in Slot-Farbe am Boden mit diesem Radius (fehlt = kein Ring). */
  readonly ringRadius?: number;
  readonly ringRole?: string;
  /** Höhe des Abzeichens über den Füßen (Standard 2,25). */
  readonly badgeHeight?: number;
}

/**
 * Spielerfigur mit Slot-Kennzeichen: Figur der Laufzeit, Abzeichen, optional Ring, Sterne bei
 * Benommenheit und Animationswahl. Das Spiel ruft je Schritt `place` und `show`.
 */
export class SlotFigure {
  readonly anim: AnimationSync;

  private constructor(
    readonly player: MinigamePlayer,
    readonly character: CharacterHandle,
    readonly badge: TransformNode,
    readonly stars: TransformNode,
    readonly ring: Mesh | null,
    private readonly badgeHeight: number,
  ) {
    this.anim = new AnimationSync(character);
  }

  static async create(
    stage: MinigameStage,
    player: MinigamePlayer,
    options: SlotFigureOptions = {},
  ): Promise<SlotFigure> {
    const character = stage.ctx.characters.create(stage.scene, player);
    const ring =
      options.ringRadius === undefined
        ? null
        : await createSlotRing(stage, player, options.ringRadius, options.ringRole);
    const badge = createSlotBadge(stage, player);
    await stage.pace();
    const stars = createStunStars(stage, player);
    return new SlotFigure(player, character, badge, stars, ring, options.badgeHeight ?? 2.25);
  }

  get root(): TransformNode {
    return this.character.root;
  }

  /** Figur, Ring, Abzeichen und Sterne an die Stelle setzen. */
  place(x: number, z: number, heading: number, y = 0): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = heading;
    this.ring?.position.set(x, y + 0.05, z);
    this.badge.position.set(x, y + this.badgeHeight, z);
    this.stars.position.set(x, y + 1.25, z);
  }

  /** Sterne bei Benommenheit, Animation nach Zustand (nach dem Ende nicht mehr). */
  show(state: FigureState, dt: number, over = false): void {
    const stunned = state.stunned && !over;
    this.stars.setEnabled(stunned);
    if (stunned) this.stars.rotation.y += dt * 7;
    if (!over) this.anim.play(pickAnimation({ ...state, stunned }));
  }

  /** Nur die Figur der Laufzeit; Meshes der Kennzeichen entsorgt die Bühne. */
  dispose(): void {
    this.character.dispose();
  }
}

/** `celebrate` für `SlotFigure`s. */
export function celebrateFigures(
  placements: readonly MinigamePlacement[],
  figures: Iterable<SlotFigure>,
): Slot[] {
  return celebrate(placements, new Map([...figures].map((f) => [f.player.slot, f.anim])));
}
