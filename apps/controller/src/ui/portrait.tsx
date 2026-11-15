import cactusSvg from '@chaos-party/assets/textures/portraits/cactus.svg?raw';
import raccoonSvg from '@chaos-party/assets/textures/portraits/raccoon.svg?raw';
import robotSvg from '@chaos-party/assets/textures/portraits/robot.svg?raw';
import sockSvg from '@chaos-party/assets/textures/portraits/sock.svg?raw';
import type { CharacterId } from '@chaos-party/protocol';

/**
 * Figuren-Porträts (CHAOS-28) aus `@chaos-party/assets` – dieselben geprüften Dateien wie in
 * der Host-Lobby (Manifest, eigene Lizenz). Inline eingebettet, damit der Akzent
 * (`currentColor`) die Farbe des Besitzers übernimmt; die Karte nennt den Namen, das Bild
 * selbst ist für Bildschirmleser ausgeblendet.
 */
const PORTRAITS: Readonly<Record<CharacterId, string>> = {
  robot: robotSvg,
  cactus: cactusSvg,
  raccoon: raccoonSvg,
  sock: sockSvg,
};

export function Portrait({
  character,
  className,
}: {
  readonly character: CharacterId;
  readonly className?: string;
}) {
  return (
    <span
      className={`portrait ${className ?? ''}`}
      aria-hidden="true"
      data-character={character}
      dangerouslySetInnerHTML={{ __html: PORTRAITS[character] }}
    />
  );
}
