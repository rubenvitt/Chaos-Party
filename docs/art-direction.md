# Art Direction – Chaos Party

**Stand:** M3 (CHAOS-27, CHAOS-28), Figuren neu in CHAOS-58 (Blender, ADR-013, Look
„Stilisierte Natur“ aus EXP-009). Gilt für Figuren, Brett, Minispiele, Effekte und UI. Die
Abschnitte zu Licht, Farbe und Brett beschreiben noch den M3-Stand, bis der Natur-Look
umgesetzt ist (CHAOS-56).
Belege: `docs/screenshots/m3-figuren-*.png`. Quelle der Wahrheit für Produkt und Stil bleibt `VISION.md`.

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
- Brett-Optik aus M2 (`apps/host/src/board/createBoardScene.ts`) ist die Referenz: Gras
  `#8fd16a`, Feldfarben + Formen je Feldtyp, cremige Wegsteine, Wegweiser auf Holz.

## Licht und Material

- Wie auf dem Brett: Halbkugellicht (0,7, warmes Weiß, lila Boden-Ton) + Sonne (0,55) mit
  weichen PCF-Schatten; Himmel als CSS-Verlauf.
- `StandardMaterial`, wenig Glanz, leichtes Eigenleuchten (≈ 0,1–0,2 der Grundfarbe), damit
  Farben auch im Schatten satt bleiben. GLB-Dateien speichern glTF-PBR (linear); der Host wandelt
  beim Laden in `StandardMaterial` (sRGB) um – gleiche Wirkung wie die prozeduralen Teile.
- Keine Texturen nötig; Muster (Ringel, Rippen) sind Geometrie.

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
- Text nur in Nunito (900er Schnitt für Spieltexte), dunkle Tinte auf hellem Grund.

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

## Pipeline (hybrid)

- **Prozedural** (Code, zur Laufzeit): Brett, Felder, Fallen, Wegweiser, Marker, Arena,
  Abzeichen, später Effekte und Klänge.
- **Generiert** (eingecheckte Dateien): Figuren als GLB aus **Blender-Skripten**
  (`packages/assets/blender/`, bpy 5.3 als Python-Modul, ADR-013): weiche Körper aus
  Skin-Modifier + Subdivision, Vertexfarben, Sheen/Klarlack, Skelett und sieben Clips.
  Erzeugen: `packages/assets/blender/build-all.sh` (venv mit `requirements.txt`). Porträts als
  SVG aus `packages/assets/src/generator/` (`pnpm generate:assets`); ein Test prüft, dass dieser
  Generator genau die eingecheckten Porträts erzeugt.
- **Importiert:** nur mit Lizenz auf der Positivliste (Eigenwerk, CC0-1.0, CC-BY-4.0, OFL-1.1,
  MIT, ISC, BSD, Apache-2.0, 0BSD) und Attribution, wo verlangt.
- **Manifest** `packages/assets/manifest.json` (zod-Schema in `packages/assets/src/manifest.ts`):
  jedes Asset mit `id`, `kind`, `source`, `path`, `license`, `attribution`, bei Dateien
  `budgetBytes`, bei Modellen `animations` und `height`.
- **Prüfung** `pnpm check:assets` (auch in `pnpm check` und CI): Dateien vorhanden und
  verzeichnet, Lizenz/Attribution, Größe, GLB-Animationen, Höhe/Füße/Grundfläche aus den
  echten Eckpunkten, Meshes/Primitives/Materialien/Dreiecke, Material `akzent`, Knoten
  `abzeichen`, SVG ohne Skripte.
- **Budgets je Figur:** ≤ 384 KiB (seit CHAOS-58: Skinning-Daten und Vertexfarben), ≤ 12 Meshes,
  ≤ 24 Primitives (Draw-Calls), ≤ 6 Materialien, ≤ 15 000 Dreiecke, keine Texturen.
  Ist (CHAOS-58): 110–324 KiB, 2 800–10 300 Dreiecke.

### Neue Assets eintragen

Sounds und Effekte (andere M3-Aufgaben) sind prozedural und zeigen auf ihre Code-Datei:

```json
{
  "id": "klang-muenze",
  "kind": "sound",
  "source": "procedural",
  "path": "apps/host/src/fx/sounds.ts",
  "description": "Münz-Klingeln (WebAudio-Synthese, zwei Sinus-Töne).",
  "license": "LicenseRef-ChaosParty-Eigenwerk",
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
