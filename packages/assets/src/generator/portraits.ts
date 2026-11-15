/**
 * Porträts der Figuren als SVG (Lobby, später Ergebnis/Charakterwahl). Gleiche Grundfarben
 * wie die 3D-Figuren (`PALETTES`), dunkler Umriss wie auf dem Brett. Der Akzent (Halsring,
 * Halstuch, Bündchen) ist `currentColor`: Inline eingebettet übernimmt er die Slot-Farbe.
 * Auch ohne Farbe erkennbar: Jede Figur hat eine eigene Silhouette.
 */
import { PALETTES, type CharacterId } from './characters.ts';
import { INK } from './kit.ts';

const STROKE = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

function eye(x: number, y: number, r: number): string {
  return [
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" ${STROKE}/>`,
    `<circle cx="${x + r * 0.1}" cy="${y + r * 0.1}" r="${r * 0.5}" fill="${INK}"/>`,
    `<circle cx="${x + r * 0.28}" cy="${y - r * 0.12}" r="${r * 0.18}" fill="#fff"/>`,
  ].join('');
}

function robot(): string {
  const c = PALETTES.robot;
  return [
    `<line x1="50" y1="22" x2="50" y2="9" ${STROKE}/>`,
    `<circle cx="50" cy="8" r="6" fill="${c.messing}" ${STROKE}/>`,
    `<rect x="24" y="80" width="52" height="26" rx="4" fill="${c.blech}" ${STROKE}/>`,
    `<rect x="31" y="70" width="38" height="11" rx="5" fill="currentColor" ${STROKE}/>`,
    `<circle cx="12" cy="46" r="6" fill="${c.messing}" ${STROKE}/>`,
    `<circle cx="88" cy="46" r="6" fill="${c.messing}" ${STROKE}/>`,
    `<rect x="14" y="21" width="72" height="50" rx="6" fill="${c.blech}" ${STROKE}/>`,
    `<rect x="21" y="28" width="58" height="34" rx="5" fill="${c.dunkel}"/>`,
    eye(36, 44, 9),
    eye(64, 44, 9),
    `<rect x="40" y="55" width="5" height="4" fill="${c.messing}"/>`,
    `<rect x="48" y="55" width="5" height="4" fill="${c.messing}"/>`,
    `<rect x="56" y="55" width="5" height="4" fill="${c.messing}"/>`,
  ].join('');
}

function cactus(): string {
  const c = PALETTES.cactus;
  return [
    `<path d="M30 88 H16 Q12 88 12 84 V58" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>`,
    `<path d="M30 88 H16 Q12 88 12 84 V58" fill="none" stroke="${c.kaktus}" stroke-width="9" stroke-linecap="round"/>`,
    `<path d="M70 72 H84 Q88 72 88 68 V50" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>`,
    `<path d="M70 72 H84 Q88 72 88 68 V50" fill="none" stroke="${c.kaktus}" stroke-width="9" stroke-linecap="round"/>`,
    `<rect x="28" y="14" width="44" height="98" rx="22" fill="${c.kaktus}" ${STROKE}/>`,
    `<path d="M40 22 V100 M50 16 V100 M60 22 V100" stroke="#4d9a36" stroke-width="2"/>`,
    `<circle cx="44" cy="12" r="4" fill="${c.bluete}" ${STROKE}/>`,
    `<circle cx="56" cy="12" r="4" fill="${c.bluete}" ${STROKE}/>`,
    `<circle cx="50" cy="8" r="4" fill="${c.bluete}" ${STROKE}/>`,
    `<circle cx="50" cy="13" r="3" fill="${c.topf}"/>`,
    `<rect x="29" y="33" width="19" height="13" rx="5" fill="${INK}"/>`,
    `<rect x="52" y="33" width="19" height="13" rx="5" fill="${INK}"/>`,
    `<path d="M46 37 H54" stroke="${INK}" stroke-width="3"/>`,
    `<path d="M33 41 L38 35 M56 41 L61 35" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`,
    `<path d="M42 57 Q50 60 59 54" fill="none" ${STROKE}/>`,
    `<path d="M28 70 Q50 78 72 70 V80 Q50 88 28 80 Z" fill="currentColor" ${STROKE}/>`,
    `<path d="M43 82 L50 96 L57 82 Z" fill="currentColor" ${STROKE}/>`,
  ].join('');
}

function raccoon(): string {
  const c = PALETTES.raccoon;
  return [
    `<path d="M18 40 L22 8 L42 24 Z" fill="${c.fell}" ${STROKE}/>`,
    `<path d="M82 40 L78 8 L58 24 Z" fill="${c.fell}" ${STROKE}/>`,
    `<path d="M24 30 L25 16 L35 25 Z" fill="${c.dunkel}"/>`,
    `<path d="M76 30 L75 16 L65 25 Z" fill="${c.dunkel}"/>`,
    `<path d="M26 112 Q26 82 50 82 Q74 82 74 112 Z" fill="${c.fell}" ${STROKE}/>`,
    `<path d="M28 84 Q50 94 72 84 L70 93 Q50 102 30 93 Z" fill="currentColor" ${STROKE}/>`,
    `<ellipse cx="50" cy="52" rx="38" ry="32" fill="${c.fell}" ${STROKE}/>`,
    `<path d="M14 50 Q22 36 38 42 Q50 48 62 42 Q78 36 86 50 Q76 60 62 56 Q50 52 38 56 Q24 60 14 50 Z" fill="${c.dunkel}"/>`,
    `<ellipse cx="36" cy="36" rx="7" ry="3" fill="${c.hell}"/>`,
    `<ellipse cx="64" cy="36" rx="7" ry="3" fill="${c.hell}"/>`,
    eye(36, 49, 7),
    eye(64, 49, 7),
    `<ellipse cx="50" cy="68" rx="15" ry="11" fill="${c.hell}" ${STROKE}/>`,
    `<ellipse cx="50" cy="63" rx="6" ry="4" fill="${c.dunkel}"/>`,
    `<path d="M44 72 Q50 76 56 72" fill="none" ${STROKE}/>`,
  ].join('');
}

function sock(): string {
  const c = PALETTES.sock;
  return [
    `<path d="M28 18 V104 H72 V18 Z" fill="${c.socke}" ${STROKE}/>`,
    `<rect x="27" y="42" width="46" height="6" fill="${c.streifen}"/>`,
    `<rect x="27" y="30" width="46" height="6" fill="${c.streifen}"/>`,
    `<path d="M28 18 V104 H72 V18" fill="none" ${STROKE}/>`,
    `<rect x="25" y="6" width="50" height="16" rx="5" fill="currentColor" ${STROKE}/>`,
    `<ellipse cx="50" cy="8" rx="20" ry="3" fill="${INK}"/>`,
    `<circle cx="39" cy="62" r="9" fill="${c.knopf}" ${STROKE}/>`,
    `<circle cx="61" cy="61" r="7" fill="${c.knopf}" ${STROKE}/>`,
    ...[
      [39, 62, 3],
      [61, 61, 2.4],
    ].flatMap(([x = 0, y = 0, d = 0]) =>
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(
        ([dx = 0, dy = 0]) =>
          `<circle cx="${x + dx * d}" cy="${y + dy * d}" r="1.4" fill="${INK}"/>`,
      ),
    ),
    `<path d="M40 80 Q50 87 60 80" fill="none" ${STROKE}/>`,
    `<path d="M38 77 L42 83 M62 77 L58 83" ${STROKE} stroke-width="2"/>`,
  ].join('');
}

const DRAW: Record<CharacterId, () => string> = { robot, cactus, raccoon, sock };

export function portraitSvg(id: CharacterId): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img">` +
    `<defs><clipPath id="r"><rect width="100" height="100"/></clipPath></defs>` +
    `<g clip-path="url(#r)">${DRAW[id]()}</g></svg>\n`
  );
}
