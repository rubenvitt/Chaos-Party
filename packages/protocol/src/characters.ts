/**
 * Die vier kosmetischen Figuren (CHAOS-27, Charakterwahl CHAOS-36, ADR-015).
 *
 * Einzige Quelle der Figuren-IDs: Das Protokoll braucht sie für `pick-character` und die
 * Lobby, der Controller für die Auswahl, das minigame-sdk (und darüber Host und Minispiele)
 * re-exportiert sie von hier. Bewusst ohne zod, damit `@chaos-party/protocol/characters`
 * auch in reinen Paketen (game-core über das minigame-sdk) nichts weiter nachlädt.
 * `packages/assets/src/contract.ts` hält eine geprüfte Kopie (Generator ohne Workspace-Importe).
 */

/** Figuren-IDs in fester Reihenfolge (Slot n bekommt standardmäßig die n-te). */
export const CHARACTER_IDS = ['robot', 'cactus', 'raccoon', 'sock'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

/** Anzeigename und Kurzbeschreibung je Figur (Lobby, Ergebnis, Controller). */
export const CHARACTER_NAMES: Readonly<
  Record<CharacterId, { readonly name: string; readonly blurb: string }>
> = {
  robot: { name: 'Schraubi', blurb: 'Aufzieh-Roboter mit Wackelantenne' },
  cactus: { name: 'Kalle Kaktus', blurb: 'Stacheliger Coolmann mit Sonnenbrille' },
  raccoon: { name: 'Wusel', blurb: 'Waschbär mit Diebesmaske und Ringelschwanz' },
  sock: { name: 'Socke Sigi', blurb: 'Einzelsocke auf der Suche nach Ruhm' },
};

/**
 * Standardfigur eines Slots (Slot n → n-te Figur). Gilt nur noch als Vorschlag: Die echte
 * Wahl steht seit Protokoll v4 in `LobbyPlayer.character` und `BoardPlayer.character`.
 */
export function defaultCharacterFor(slot: 1 | 2 | 3 | 4): CharacterId {
  return CHARACTER_IDS[slot - 1] ?? 'robot';
}

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTER_IDS as readonly string[]).includes(value);
}

/**
 * Freie Figur für einen Slot ohne Wahl (Auto-Zuweisung beim Spielstart, ADR-015):
 * die Standardfigur des Slots, falls frei, sonst die erste freie in `CHARACTER_IDS`-Reihenfolge.
 * `null`, wenn alle vergeben sind (kann bei höchstens vier Spielern nicht passieren).
 */
export function pickFreeCharacter(
  slot: 1 | 2 | 3 | 4,
  taken: Iterable<CharacterId>,
): CharacterId | null {
  const used = new Set(taken);
  const preferred = defaultCharacterFor(slot);
  if (!used.has(preferred)) return preferred;
  return CHARACTER_IDS.find((id) => !used.has(id)) ?? null;
}
