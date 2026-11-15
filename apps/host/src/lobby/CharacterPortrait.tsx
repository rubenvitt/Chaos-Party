import cactusAccent from '@chaos-party/assets/textures/portraits/cactus-akzent.webp?url';
import cactusImage from '@chaos-party/assets/textures/portraits/cactus.webp?url';
import raccoonAccent from '@chaos-party/assets/textures/portraits/raccoon-akzent.webp?url';
import raccoonImage from '@chaos-party/assets/textures/portraits/raccoon.webp?url';
import robotAccent from '@chaos-party/assets/textures/portraits/robot-akzent.webp?url';
import robotImage from '@chaos-party/assets/textures/portraits/robot.webp?url';
import sockAccent from '@chaos-party/assets/textures/portraits/sock-akzent.webp?url';
import sockImage from '@chaos-party/assets/textures/portraits/sock.webp?url';
import { CHARACTER_NAMES, type CharacterId } from '@chaos-party/minigame-sdk';
import type { CSSProperties } from 'react';
import './portrait.css';

/**
 * Porträts der Figuren (CHAOS-61): Blender-Render aus `@chaos-party/assets` (im Manifest).
 * Im Bild ist der Akzent (Halsring, Halstuch, Bündchen) weiß; darüber liegt eine Fläche in
 * Slot-Farbe (`--player-color` am Eltern-Element), die mit der Akzent-Maske ausgeschnitten und
 * multipliziert wird. So bekommt der Akzent die Slot-Farbe samt Licht und Schatten.
 * Der Controller hat dieselbe Darstellung (`apps/controller/src/ui/CharacterPortrait.tsx`).
 */
const PORTRAITS: Readonly<Record<CharacterId, { image: string; accent: string }>> = {
  robot: { image: robotImage, accent: robotAccent },
  cactus: { image: cactusImage, accent: cactusAccent },
  raccoon: { image: raccoonImage, accent: raccoonAccent },
  sock: { image: sockImage, accent: sockAccent },
};

export function CharacterPortrait({ character }: { readonly character: CharacterId }) {
  const { image, accent } = PORTRAITS[character];
  const mask = { '--portrait-accent': `url("${accent}")` } as CSSProperties;
  return (
    <span
      className="character-portrait"
      role="img"
      aria-label={CHARACTER_NAMES[character].name}
      data-character={character}
    >
      <img className="character-portrait-image" src={image} alt="" draggable={false} />
      <span className="character-portrait-accent" style={mask} aria-hidden="true" />
    </span>
  );
}
