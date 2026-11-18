# Art Direction – Chaos Party

**Stand:** M3 (CHAOS-27, CHAOS-28), Figuren neu in CHAOS-58 (Blender, ADR-013, Look
„Stilisierte Natur“ aus EXP-009), Natur-Look im Spiel seit CHAOS-62 (ADR-014, Abschnitt
[Natur-Look im Spiel](#natur-look-im-spiel-chaos-62)). Gilt für Figuren, Brett, Minispiele,
Effekte und UI. Lichtstimmungen stehen als Daten in `apps/host/src/lighting/moods.ts`
(CHAOS-60, EXP-010): Nachtstimmungen lassen Feld-Einlagen und Slot-Ringe von innen leuchten,
damit Slot-Farbe und Symbol lesbar bleiben.
Belege: `docs/screenshots/chaos62-*.jpg`, `docs/screenshots/m3-figuren-*.png`. Quelle der
Wahrheit für Produkt und Stil bleibt `VISION.md`.

## Leitbild

**Frech und absurd, nicht realistisch.** Spielzeug-Cartoon: glatte, runde Formen, kräftige
Farben, dunkle Tinte (`#1b1530`) für Umrisse, Pupillen und Schrift, weiche Schatten. Witz kommt
aus Übertreibung und Kontrast (cooler Kaktus mit Sonnenbrille, Socke mit ungleichen Knöpfen),
nie aus Ekel oder Gewalt.

## Silhouetten und Proportionen

- **Jede Figur an der Silhouette erkennbar**, auch einfarbig: Schraubi = Kasten mit Antenne und
  Aufziehschlüssel, Kalle Kaktus = gerippte Säule mit Saguaro-Armen im Topf, Wusel = runder Kopf
  mit spitzen Ohren und Ringelschwanz, Socke Sigi = „L“ aus Schaft und Fuß.
- **Großer Kopf, kurze Beine:** Kopf ein Drittel bis die Hälfte der Höhe, Beine ≤ 20 %. Große Augen (Weiß,
  Pupille, Glanzpunkt) oder ein auffälliges Gesichtsmerkmal (Sonnenbrille, Knopfaugen).
- **Maßstab (Vertrag `CharacterHandle`):** Füße bei y = 0, Blick +Z, Höhe 1,4–1,8, Grundfläche
  im Kreis mit Radius 0,5. Auf dem Brett zeigt der Host die Figuren 1,3-fach, leicht zur hohen
  Kamera zurückgelehnt.
- Details nur, wenn sie aus 3 m Sofa-Abstand lesbar sind; feine Teile (Stacheln, Nieten,
  Knopflöcher) sind Bonus für Nahaufnahmen, tragen aber keine Information.

## Farbe

| Figur | Grundfarben (eigene) | Akzent (Slot-Farbe) |
|---|---|---|
| Schraubi (`robot`) | Blech `#b9cad8`, Dunkel `#3b3f58`, Messing `#f0b73e` | Halsring |
| Kalle Kaktus (`cactus`) | Kaktus `#6cbf4b`, Tontopf `#d9774a`, Blüte `#ffd23f` | Halstuch |
| Wusel (`raccoon`) | Fell `#9b9bb0`, Maske `#3a3446`, Hell `#f3e7d3` | Halstuch |
| Socke Sigi (`sock`) | Socke `#f6f0e4`, Ringel `#ea5a4c`, Knöpfe `#7a3f2c` | Bündchen |

- **Slot-Farben bleiben die Spieler-Kennung** (Okabe-Ito aus `packages/protocol/src/players.ts`:
  Blau `#0072B2`, Orange `#E69F00`, Grün `#009E73`, Rosa `#CC79A7`). Figuren haben eigene
  Grundfarben; die Slot-Farbe kommt nur als **Akzent** (Material `akzent`) dazu – und **immer
  mit dem Slot-Symbol** (● ▲ ■ ★): als Abzeichen auf der Brust, auf dem Brett zusätzlich als
  schwebendes Symbol und als farbiger Sockel. Farbe allein trägt nie Information.
- Grundfarben meiden die vier Slot-Farbtöne als Flächenfarbe (sonst Verwechslung).
- Natur-Palette (CHAOS-62): Wiese aus der CC0-Textur „leafy_grass“ mit Tönung `#b8d48a`,
  Grashalme von `#355d22` bis zur Spitzenfarbe der Stimmung, Laub `#557f36`–`#7aa64a`, Rinde und
  Holz aus Texturen, Creme `#f6efe2` für Ränder und Symbole. Feldfarben sind gedeckte Lacke im
  Farbton der M2-Felder (Plus `#3c7bd6`, Minus `#d4534b`, Item `#3f9e5a`, Ereignis `#e3ae38`,
  Trophäe `#8a68cc`, Start Creme) und bleiben an die **Form** der Einlage gekoppelt.

## Licht und Material

- **Natur-Look (CHAOS-62, ADR-014):** PBR-Materialien, HDRI-Himmel als Umgebungslicht, Sonne
  aus dem HDRI abgeleitet und schräg von vorn links gedreht (kein Gegenlicht), Halbkugellicht
  als Bodenlicht, PCSS-Schatten, Dunst, ACES-Farbabstimmung, Bloom, SSAO, leichte
  Tiefenunschärfe. Alles aus einer `LightMood` (`lighting/moods.ts`).
- Figuren behalten ihre glTF-PBR-Materialien (`loadCharacters(scene, { keepPbr: true })`);
  die Umwandlung in `StandardMaterial` gibt es nur noch für die M1-Arena und die Lobby-Vitrine.
- Signale (Popups, Wegweiser-Schilder, Pfeil „am Zug“) bleiben unbeleuchtete Billboards.

## Bewegung

- **Übertrieben und gut lesbar:** Squash & Stretch am Gelenk `huepfer` (Fußpunkt), Vorfreude
  vor dem Sprung, Nachwackeln (Antenne, Schwanz, Sockenschaft), Pirouette beim Jubel.
- Animationsnamen fest (`CHARACTER_ANIMATIONS`): `idle`, `run` (Schleifen), `jump`, `hit`,
  `cheer`, `sad`, `fall` (einmal, danach `idle`). Wechsel werden kurz überblendet.
- Dauer: Reaktionen ≤ 0,8 s, Jubel/Traurig ≤ 1,6 s – Spiel-Tempo geht vor.
- Brett: Laufen = `run` + Hüpfbogen, Trophäe = `cheer`, Münzverlust/Falle/Klau = `hit`,
  Münzgewinn = `jump`; im Stand Blick zur Kamera, beim Laufen in Laufrichtung.

## Lesbarkeit am Fernseher

- Prüfen bei 1280×720 und aus der Brett-Kamera: Figur, Slot-Farbe **und** Symbol erkennbar.
- Kontrast: helle Figur auf Gras/Feld braucht dunkle Details (Tinte) und einen Sockel.
- Host-Texte in Nunito (900er Schnitt für Spieltexte), dunkle Tinte auf hellem Grund (M3-Stand).
- **Controller „Glas & Licht“** (CHAOS-59, Rubens Wahl aus drei Entwürfen,
  https://claude.ai/artifact/PChNX2Hy7g4XBxE4aCWQjU): Mattglas (`--glass`, `--blur`) über einer
  unscharfen Naturwelt mit dunklem Schleier, feine helle Kanten statt Tinte, weiche Schatten,
  Hauptknöpfe als Verlauf in der Spielerfarbe mit Leuchten (`--primary-bg`, `--glow`), Druck =
  sanftes Verkleinern. Schrift Inter (lokal, `@fontsource-variable/inter`, OFL). Spielerfarbe
  und Symbol bleiben Pflicht; iPad-Zonen gleich, mit dünnem Rahmen in Spielerfarbe.

## Verboten

- Nachbauten oder Anspielungen auf bestehende Spiele, Figuren, Marken und Logos (keine
  „Mario-Party-Kopie“, keine bekannten Maskottchen).
- Realistische Gewalt, Blut, Waffen; Schaden ist Slapstick (Sterne, Staub, Plattdrücken).
- Heruntergeladene Fremd-Assets ohne geprüfte Lizenz, KI-Ausgaben mit unklarer Herkunft,
  bezahlte Assets ohne Freigabe (CLAUDE.md „Escalate“).
- Figuren mit Spielvorteilen – Figuren sind rein kosmetisch.

## Hitboxen

**Hitboxen sind unabhängig vom Render-Mesh:** Minispiele bauen Kollisionsformen selbst
(Kapsel/Kasten nach dem Maßstab oben). Figuren dürfen sich optisch ändern, ohne Regeln oder
Physik zu berühren. Für Schatten liefert der Host je Figur einen groben Schattenkörper
(`HostCharacterHandle.shadowCaster`), der mithüpft.

## Natur-Look im Spiel (CHAOS-62)

**Module** (`apps/host/src/nature/`): `terrain.ts` (Insel als Superellipse mit Wellenrand,
Stellflächen exakt eben, Mulden für Teiche), `geometry.ts` (Insel mit Erdkante, Gras als Thin
Instances in drei Farbsorten, Laubbaum, Tanne, Moosfels, Fliegenpilz, Blumen, Laterne, Pokal,
Glühwürmchen, `StaticBatch`), `materials.ts`, `lighting.ts`, `quality.ts`, `settings.ts`.

**Brett** (`apps/host/src/board/natureBoard.ts`): Insel aus den Brettgrenzen (+3,8 / +3,6),
Felder als **Baumscheiben** (Rinde, Holz, cremefarbener Rand, lackierte Einlage mit der Form
des Feldtyps, Symbol obenauf: Plus, Minus, Geschenk, Ausrufezeichen, Sockel, Startfahne),
Wegpfeile in Creme, Trittsteine auf langen Wegen, Wackelwald in der Mitte, Wald nur hinten und
an den Seiten (vorn verdeckt er die untere Reihe), Teich an der Sumpfabkürzung, Pilze am
Pilzpfad, Felsen am Klippenweg, Bretter der Wackelbrücke, sechs Laternen (nachts Lichter).

**Minispiele** (`apps/host/src/minigame/natureLook.ts` über die gemeinsame Bühnen-Kulisse
`apps/host/src/nature/stageLook.ts`, Vertrag `MinigameLook`): Das Minispiel nennt seine Spielfläche (`backdrop({ halfX, halfZ, groundY, surface })`), der Host baut eine
kleine Insel mit Wiese oder Picknickdecke, Bäumen hinten und seitlich, Felsen, Blumen und vier
Laternen. Sockenregen: Badvorleger auf der Wiese (statt Waschküche). Pudding-Gerangel: Pudding
auf einem Baumstumpf über einer Picknickdecke (statt Sahnesee). Wackelturm: Karodecke auf der
Wiese. Pump-Parade (Rückfall): Wiese.

**Lobby-Arena und Siegerpodest (CHAOS-77)** nutzen dieselbe Kulisse (`createStageLook`):

- *Lobby* (`apps/host/src/scene/createGameScene.ts`): Lichtung auf einer Insel, fest in der
  **Goldenen Stunde** (`SCENE_MOODS.lobby`). Banden als liegende Baumstämme (Rinde), Eckpfosten als
  Baumstümpfe mit Jahresringen obenauf (wie die Baumscheiben am Brett). Die Physik (Boden,
  Banden) ist unverändert und unsichtbar. Die Kapsel-Figuren bleiben (M1-Arena), jetzt lackiert
  (PBR) mit leichtem Eigenleuchten der Slot-Farbe. HUD-Unterzeile hell mit dunklem Schein.
- *Siegerpodest* (`apps/host/src/finale/podiumStage.ts`): fest **nachts** (`SCENE_MOODS.finale`, die
  Partie endet nachts). Blöcke aus Holz im Farbton des Platzes (Gold, Silber, Bronze, Lila) auf
  moosigem Steinsockel, Deckel in Slot-Farbe mit Eigenleuchten wie die Feld-Einlagen nachts,
  weiße Platzziffer mit Tinte-Kontur, vier Laternen, Glühwürmchen und ein warmer Spot von vorn
  oben aufs Podest (Mondlicht allein ist am Fernseher zu dunkel). Die Figuren behalten ihre
  PBR-Materialien wie am Brett.
- CSS-Hintergründe: `.host` in den Farben der Goldenen Stunde (sichtbar nur während des Ladens),
  Trophäenzählung und Siegerbildschirm als Nachthimmel. `?stimmung=<id>` gilt auch hier.
- Bilder (Stufe `mittel`, Software-Rendering): `docs/screenshots/chaos77-lobby.jpg`,
  `chaos77-arena.jpg`, `chaos77-podest.jpg`.

**Grafikstufen** (`?qualitaet=hoch|mittel|niedrig|minimal`, sonst `hoch` mit Automatik):

| Stufe | Gras | SSAO | Unschärfe | MSAA | Bloom | Schatten | HDRI-Licht | Detailkarten |
|---|---|---|---|---|---|---|---|---|
| hoch | 100 % (Brett 64 000, Minispiel 30 000, Lobby 34 000, Podest 22 000) | ja | ja | 4 | ja | PCSS 4096² | ja | ja |
| mittel | 55 % | – | ja | 4 | ja | PCSS 2048² | ja | ja |
| niedrig | 25 % | – | – | – | – | PCF 1024² | ja (128²) | ja |
| minimal | 8 % | – | – | – | – | PCF 1024² | – | – |

`minimal` gilt im Testmodus und bei Software-Rendering.

**Lichtverlauf je Runde (CHAOS-63, Rubens Wahl „C“, EXP-010):** Jede Partie ist ein Tag. Bei
5 Runden: Morgen, Mittag, Goldene Stunde, Dämmerung, Nacht; bei mehr Runden teilen sich Runden
eine Stimmung, nie rückwärts (`moodForRound`). Beim Rundenwechsel blendet das Brett in 4 s weich
über (Himmel als zweiter Würfel, Licht, Dunst und Farbabstimmung gemischt, Umgebungslicht wechselt
zur Hälfte); Laternen, Schein, Glühwürmchen und leuchtende Felder gibt es nur in Dämmerung und
Nacht. Minispiele erben die Stimmung der Runde. In Dämmerung und Nacht wird die Unterzeile des
HUD hell. Lobby und Siegerehrung haben feste Stimmungen (`SCENE_MOODS`: Goldene Stunde bzw.
Nacht, CHAOS-77). Ohne bekannte Runde (Vorschau, lokaler Minispiel-Ablauf)
gilt die Brett-Stimmung (Goldene Stunde). Fest zum Ansehen: `?stimmung=<id>` (Morgen, Mittag,
Wolken, Abend, Dämmerung, Nacht). Bilder: `docs/screenshots/chaos63-lichtverlauf.jpg`.

## Pipeline (hybrid)

- **Prozedural** (Code, zur Laufzeit): Brett, Felder, Fallen, Wegweiser, Marker, Arena,
  Abzeichen, später Effekte und Klänge.
- **Generiert** (eingecheckte Dateien): Figuren als GLB aus **Blender-Skripten**
  (`packages/assets/blender/`, bpy 5.3 als Python-Modul, ADR-013): weiche Körper aus
  Skin-Modifier + Subdivision, Vertexfarben, Sheen/Klarlack, Skelett und sieben Clips.
  Erzeugen: `packages/assets/blender/build-all.sh` (venv mit `requirements.txt`).
- **Porträts** (CHAOS-61): Cycles-Render derselben Blender-Figuren (`portrait.py`,
  `portraits-all.sh`): Kopf und Schultern im Dreiviertelprofil, erste Idle-Pose, warme Sonne,
  Himmelslicht und kühles Gegenlicht, transparenter Hintergrund, 384 × 384 WebP. Das Material
  `akzent` ist im Bild **weiß**; eine zweite Datei `<id>-akzent.webp` ist die Maske des
  sichtbaren Akzents. Lobby und Controller legen die Slot-Farbe per CSS-Maske mit
  `mix-blend-mode: multiply` darüber (Licht und Schatten bleiben). Das Slot-Symbol steht immer
  daneben (Lobby: Marke am Porträt, Controller: Marke am Avatar in der Plakette).
  In den Figurenkarten der Controller-Lobby (M4, CHAOS-36) nimmt der Akzent die Farbe des
  Besitzers an (`--portrait-color`), vergebene Figuren ohne bekannten Besitzer grau; Plakette
  und Endstand zeigen die gewählte Figur.
  Renders sind nicht byte-gleich reproduzierbar (Entrauschen), darum prüft `check:assets` Format,
  Maße, Alpha und das Paar Bild/Maske statt eines Byte-Vergleichs.
- **Importiert:** nur mit Lizenz auf der Positivliste (Eigenwerk, CC0-1.0, CC-BY-4.0, OFL-1.1,
  MIT, ISC, BSD, Apache-2.0, 0BSD) und Attribution, wo verlangt. Dateien nennen ihre Herkunft
  (`origin`). Natur-Assets (CHAOS-62): CC0 von Poly Haven, Auswahl in
  `packages/assets/polyhaven.json`, Import mit `pnpm --filter @chaos-party/assets
  import:polyhaven` (lädt 1k-Originale in `packages/assets/.cache/`, verkleinert Texturen per
  ImageMagick auf 512²-WebP und Himmel per eigenem RGBE-Code auf 512 × 256-HDR, schreibt die
  Manifest-Einträge `natur-…` und `himmel-…`).
- **Manifest** `packages/assets/manifest.json` (zod-Schema in `packages/assets/src/manifest.ts`):
  jedes Asset mit `id`, `kind`, `source`, `path`, `license`, `attribution`, bei Dateien
  `budgetBytes`, bei Modellen `animations` und `height`.
- **Prüfung** `pnpm check:assets` (auch in `pnpm check` und CI): Dateien vorhanden und
  verzeichnet, Lizenz/Attribution, Größe, GLB-Animationen, Höhe/Füße/Grundfläche aus den
  echten Eckpunkten, Meshes/Primitives/Materialien/Dreiecke, Material `akzent`, Knoten
  `abzeichen`, SVG ohne Skripte, WebP lesbar; je Figur Porträt und Akzent-Maske (quadratisch,
  gleich groß, ≥ 256 px, mit Alpha); HDR vollständig lesbar, 2:1 und mit Sonne (Werte > 1);
  Natur-Texturen quadratisch mit Zweierpotenz; importierte Dateien mit Herkunft.
- **Budgets Natur:** Textur ≤ 128 KiB (Ist 1–107 KiB), Himmel ≤ 512 KiB (Ist 291–367 KiB).
- **Budgets je Figur:** ≤ 512 KiB (CHAOS-162; vorher 384 KiB, seit CHAOS-58: Skinning-Daten und
  Vertexfarben), ≤ 12 Meshes, ≤ 24 Primitives (Draw-Calls), ≤ 6 Materialien, ≤ 15 000 Dreiecke,
  keine Texturen. Je Figur steht das eigene Budget im Manifest: Kaktus und Socke 512 KiB (Nahansicht,
  EXP-027), Wusel und Schraubi 384 KiB. Ist (CHAOS-162): 212–486 KiB, 6 300–14 400 Dreiecke.

### Neue Assets eintragen

Sounds und Effekte (andere M3-Aufgaben) sind prozedural und zeigen auf ihre Code-Datei:

```json
{
  "id": "klang-muenze",
  "kind": "sound",
  "source": "procedural",
  "path": "apps/host/src/fx/sounds.ts",
  "description": "Münz-Klingeln (WebAudio-Synthese, zwei Sinus-Töne).",
  "license": "GPL-3.0-only",
  "attribution": "Chaos Party – prozedural im Code"
}
```

Eine Klangdatei läge unter `packages/assets/sounds/` mit `source: "generated"` oder
`"imported"`, `generator` bzw. Lizenz-Nachweis und `budgetBytes` (≤ 256 KiB).

## Werkzeuge

- **Look-Dev-Vitrine** (CHAOS-56, nur Dev-Server): `http://localhost:5173/host/src/lookdev/lookdev.html?look=weich&shot=brett`
  (`look` = `weich` | `toon` | `diorama`, `shot` = `brett` | `figur` | `minispiel`, `hud=0`, `test=1`).
  Drei Kandidaten für den neuen Look, siehe EXP-008 in `docs/experiments.md`. Diese Datei wird nach
  Rubens Wahl neu geschrieben; bis dahin gilt der M3-Stand unten weiter.

- **Figuren-Vitrine** (nur Dev-Server): `pnpm --filter @chaos-party/host dev`, dann
  `http://localhost:5173/host/src/characters/preview.html?anim=cheer` (Parameter `anim`,
  `yaw`, `names=0`, `view=top`, `test=1` mit `window.__vitrine.step(n)`).
- Brett lokal: `http://localhost:5173/host/?local=1&board=1` (siehe `docs/m2-demo.md`).
