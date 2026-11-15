import cactusSvg from '@chaos-party/assets/textures/portraits/cactus.svg?raw';
import raccoonSvg from '@chaos-party/assets/textures/portraits/raccoon.svg?raw';
import robotSvg from '@chaos-party/assets/textures/portraits/robot.svg?raw';
import sockSvg from '@chaos-party/assets/textures/portraits/sock.svg?raw';
import { CHARACTER_NAMES, type CharacterId } from '@chaos-party/minigame-sdk';
import './portrait.css';

/**
 * SVG-Porträts der Figuren (CHAOS-28) aus `@chaos-party/assets` (generiert, im Manifest).
 * Inline eingebettet, damit der Akzent (`currentColor`) die Slot-Farbe übernimmt
 * (`--player-color` am Eltern-Element). Die Dateien sind eigene, geprüfte Assets.
 */
const PORTRAITS: Readonly<Record<CharacterId, string>> = {
  robot: robotSvg,
  cactus: cactusSvg,
  raccoon: raccoonSvg,
  sock: sockSvg,
};

export function CharacterPortrait({ character }: { readonly character: CharacterId }) {
  return (
    <span
      className="character-portrait"
      role="img"
      aria-label={CHARACTER_NAMES[character].name}
      data-character={character}
      dangerouslySetInnerHTML={{ __html: PORTRAITS[character] }}
    />
  );
}
