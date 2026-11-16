# ADR-014: Natur-Look im Spiel: PBR mit HDRI, Grafikstufen und Sparstufe für Software-Rendering

**Status:** Angenommen
**Datum:** 2026-11-15
**Aufgabe:** CHAOS-62 (Epic CHAOS-56; Richtung EXP-009, Lichtstimmungen EXP-010)
**Betroffene Annahmen:** `docs/assumptions.md` C2 (Bildrate am Ziel-PC)

## Kontext

Ruben hat die Richtung „Stilisierte Natur“ bestätigt (EXP-009). Sie lebte nur in der Look-Dev-Vitrine (`apps/host/src/lookdev/nature.ts`, Dev-Server). Brett und Minispiele renderten noch mit `StandardMaterial`, flachem Halbkugellicht und Grundkörpern (M2/M3, ADR-004). Der neue Look braucht physikalisch basiertes Licht (PBR), ein HDRI als Umgebungslicht und Himmel, CC0-Texturen, tausende Grashalme, Schatten und Nachbearbeitung (ACES, Bloom, SSAO, Tiefenunschärfe).

Zwei Randbedingungen:

1. **Bildrate am Ziel-PC** muss flüssig bleiben; gemessen ist sie noch nicht (Gerätecheckliste). Teure Teile müssen sich abstufen lassen.
2. **CI und Playwright rendern per Software** (SwiftShader). Messung im Container (1280 × 720, ein Bild, ohne PNG-Auslesen): altes Brett ≈ 0,17 s, Natur-Brett in voller Pracht ≈ 1,0 s, davon allein das bildbasierte Umgebungslicht ≈ 0,17 s, Wiese ≈ 0,2 s, Gras ≈ 0,16 s, Schatten ≈ 0,12 s, Bäume ≈ 0,09 s. Mit 0,25 s je Bild läuft die Minispiel-Uhr (höchstens 15 feste Schritte je Bild) langsamer als die echte Zeit, das Ergebnis kommt zu spät beim Server an, und das Minispiel gilt als abgebrochen.

## Entscheidung

- **Modul `apps/host/src/nature/`** statt Look-Dev-Code: Rauschen (`noise.ts`), Gelände (`terrain.ts`, Superellipse mit Wellenrand, Stellflächen, Mulden), Bausteine (`geometry.ts`: Insel, Gras als Thin Instances, Bäume, Felsen, Pilze, Blumen, Laternen, Pokal, Glühwürmchen, `StaticBatch` zum Verschmelzen), Materialien (`materials.ts`, PBR), Licht (`lighting.ts`: setzt eine `LightMood` aus `lighting/moods.ts` um), Grafikstufen (`quality.ts`), Einstellungen (`settings.ts`). Die Vitrine bleibt unverändert als Werkbank.
- **Brett:** `board/natureBoard.ts` baut die Welt aus der `BoardDefinition` (Insel aus den Brettgrenzen, Baumscheiben mit lackierter Einlage in Farbe **und** Form je Feldtyp, Symbol obenauf, Wegpfeile, Trittsteine, Teich, Pilze am Pilzpfad, Felsen am Klippenweg, Bretter der Wackelbrücke). Figuren behalten ihre glTF-PBR-Materialien (`keepPbr`).
- **Minispiele:** Der Vertrag (ADR-012) bekommt **optional** `ctx.look` (`MinigameLook`): `backdrop(area)` bestellt beim Host Wiese oder Picknickdecke, Gras, Bäume, Himmel und Licht um die Spielfläche; `material(hex, options)` liefert PBR-Materialien, die dem Minispiel gehören. Ohne `ctx.look` (Headless-Tests, Prototypen) bauen Minispiele alles wie bisher selbst. Der Host setzt Licht und Nachbearbeitung erst nach `prepare` (Kamera steht).
- **Assets:** CC0 von Poly Haven, verkleinert eingecheckt: 6 Texturen × 3 Karten als 512²-WebP (`textures/nature/`), 6 Himmel als 512 × 256-Radiance-HDR (`textures/sky/`), zusammen ≈ 2,9 MB. Import-Skript `packages/assets/src/import/polyhaven.ts` (eigener RGBE-Code, damit Sonnenwerte über 1 erhalten bleiben). Manifest-Art `hdri`, Feld `origin` (Lizenznachweis), `check:assets` prüft HDR-Dateien, Herkunft und Kachelmaße.
- **Grafikstufen:** `hoch` (alles), `mittel` (55 % Gras, ohne SSAO), `niedrig` (25 % Gras, ohne SSAO/Unschärfe/MSAA/Bloom, kleine Schattenkarte), `minimal` (8 % Gras, ohne HDRI-Umgebungslicht, ohne Nachbearbeitungs-Durchgänge, ohne Detailkarten; Farbabstimmung im Material-Shader). Ohne Angabe startet der Host mit `hoch` und stuft automatisch ab, wenn die mittlere Bildrate eines 3-s-Fensters unter 45 fps liegt (nur nach unten, kein Pendeln). `?qualitaet=` legt die Stufe fest.
- **Sparstufe automatisch** im Testmodus und wenn der Browser per Software rendert (`isSoftwareRenderer`: SwiftShader, llvmpipe …). Bei Software-Rendering macht die Brett-Regie bis zu 4 s je Bild und die Minispiel-Uhr bis zu 240 feste Schritte (4 s) je Bild (`maxStepsPerAdvance`): weniger Bilder, gleiche Spielzeit.
- **Testmodus des Bretts:** `stepFrames(n)` rechnet n Schritte (Regie, Animationen über `scene.animate()`) und zeichnet nur das letzte Bild – wie `MinigameStage.step` seit M3.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Vitrinen-Code direkt im Spiel aufrufen | Look-Dev-Code mit URL-Feinabstimmung, festen Positionen und Vitrinen-Kamera; keine Modulgrenzen, keine Grafikstufen |
| Natur-Look nur ab einer GPU, im Test der alte Look | Screenshot-Regression würde einen Look prüfen, den niemand sieht |
| Volle Pracht auch im Test, längere Zeitlimits | ≈ 1 s je Bild; Minispiele würden im Durchstich-Test abgebrochen, die E2E-Suite würde ein Vielfaches dauern |
| Host übernimmt Minispiel-Materialien heimlich (Austausch nach `prepare`) | Bricht die Eigentumsregel des Vertrags (Minispiel entsorgt, was es anlegt) und Minispiele mit `StandardMaterial`-Eigenschaften |
| Originale 1k/2k-Texturen und -HDRIs einchecken | ≈ 33 MB statt 2,9 MB; am Fernseher aus 3 m kein sichtbarer Gewinn |

## Konsequenzen

**Positiv**
- Brett und Minispiele zeigen den von Ruben gewählten Look, mit derselben Lichtstimmung (Daten in `moods.ts`); CHAOS-63 (Lichtverlauf je Runde) setzt direkt auf `applyNatureLook` auf.
- Grafikstufen machen die Bildrate steuerbar; die Debug-Anzeige (`?debug=1`) nennt die aktive Stufe.
- Tests prüfen weiterhin den echten Code-Pfad, nur in der Sparstufe.

**Negativ / Risiken**
- Bildrate am Ziel-PC ungemessen (Gerätecheckliste N1–N4). `hoch` mit 64 000 Halmen, SSAO, PCSS-Schatten 4096² und MSAA kann auf schwachen GPUs ruckeln; die Automatik fängt das nur nach unten ab.
- Screenshots der Tests zeigen die Sparstufe (ohne HDRI-Licht, Bloom, SSAO); die volle Optik zeigen die Doku-Bilder `docs/screenshots/chaos62-*.jpg`.
- Software-Rendering spielt sich mit 1–2 Bildern pro Sekunde; spielbar ist das nicht, nur korrekt.
- Repo wächst um ≈ 2,9 MB Binärdateien.

## Überprüfung

Nach Rubens Messung am Ziel-PC (Gerätecheckliste N1–N4): Liegt `hoch` dort unter 50 fps, Stufenwerte anpassen oder mit `mittel` starten. Neu bewerten, wenn CHAOS-63 mehrere HDRIs gleichzeitig vorlädt (Speicher) oder wenn weitere Bretter dazukommen.

**Nachtrag CHAOS-63 (2026-11-16):** Das Brett lädt je Aufbau höchstens zwei Himmel (Stimmung der Runde und der nächsten, `moodsForBoardRound`), je Himmel eine Umgebungs-Cubemap in Stufengröße und einen 256²-Hintergrund; das Brett wird nach jedem Minispiel neu gebaut, der alte Himmel mit der Szene entsorgt. Überblendet wird ohne Nachladen und ohne Shaderwechsel (beide Himmelsmaterialien und das Laternenglas werden beim Aufbau übersetzt).
