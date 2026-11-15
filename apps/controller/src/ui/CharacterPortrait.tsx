import cactusAccent from '@chaos-party/assets/textures/portraits/cactus-akzent.webp?url';
import cactusImage from '@chaos-party/assets/textures/portraits/cactus.webp?url';
import raccoonAccent from '@chaos-party/assets/textures/portraits/raccoon-akzent.webp?url';
import raccoonImage from '@chaos-party/assets/textures/portraits/raccoon.webp?url';
import robotAccent from '@chaos-party/assets/textures/portraits/robot-akzent.webp?url';
import robotImage from '@chaos-party/assets/textures/portraits/robot.webp?url';
import sockAccent from '@chaos-party/assets/textures/portraits/sock-akzent.webp?url';
import sockImage from '@chaos-party/assets/textures/portraits/sock.webp?url';
import { CHARACTER_NAMES, defaultCharacterFor, type CharacterId } from '@chaos-party/minigame-sdk';
import type { SlotNumber } from '@chaos-party/protocol';
import type { CSSProperties } from 'react';

/**
 * Porträt der eigenen Figur (CHAOS-61), dieselben Dateien und dieselbe Darstellung wie in der
 * Lobby am PC (`apps/host/src/lobby/CharacterPortrait.tsx`): Render mit weißem Akzent, darüber
 * die Slot-Farbe (`--player`) per Akzent-Maske und `multiply`. Die Figur folgt dem Slot
 * (`defaultCharacterFor`) wie am PC, bis es eine Figurenwahl gibt.
 */
const PORTRAITS: Readonly<Record<CharacterId, { image: string; accent: string }>> = {
  robot: { image: robotImage, accent: robotAccent },
  cactus: { image: cactusImage, accent: cactusAccent },
  raccoon: { image: raccoonImage, accent: raccoonAccent },
  sock: { image: sockImage, accent: sockAccent },
};

interface CharacterPortraitProps {
  readonly slot: SlotNumber;
  readonly className?: string;
  /** Nur Schmuck (Name steht daneben): ohne eigene Beschriftung für Screenreader. */
  readonly decorative?: boolean;
}

export function CharacterPortrait({ slot, className, decorative = false }: CharacterPortraitProps) {
  const character = defaultCharacterFor(slot);
  const { image, accent } = PORTRAITS[character];
  const mask = { '--portrait-accent': `url("${accent}")` } as CSSProperties;
  return (
    <span
      className={`character-portrait${className ? ` ${className}` : ''}`}
      data-testid="character-portrait"
      data-character={character}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': CHARACTER_NAMES[character].name })}
    >
      <img className="character-portrait-image" src={image} alt="" draggable={false} />
      <span className="character-portrait-accent" style={mask} aria-hidden="true" />
    </span>
  );
}
