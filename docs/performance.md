# Performance: Bildrate und Latenz (M4)

**Stand:** 2026-11-16 (erste Messung auf echter GPU, CHAOS-73) · **Aufgabe:** CHAOS-39, CHAOS-73 · **Grundlage:** ARCHITECTURE „Testing strategy“ Punkt 4, [ADR-010](decisions/ADR-010-messanzeige.md) (Messanzeige aus M1)

Kurz: Gemessen wird an zwei Stellen – **auf echter Hardware** mit der Messanzeige (`?debug=1`, Ruben, Abschnitt 11 der [Gerätecheckliste](device-test-checklist.md#11-m4--performance-für-chaos-43)) und **automatisch** im Headless-Chromium mit Software-Rendering (`pnpm perf`). Die automatischen Werte erlauben **nur relative Vergleiche** auf demselben Rechner (vorher/nachher). Sie sagen nichts darüber, wie flüssig das Spiel auf Rubens PC oder Fernseher läuft.

## 1. Was gemessen wird

### Host (`/host/?debug=1`)

Die Messanzeige aus M1 misst jetzt **je Szene**. Jede Szene meldet sich beim Aufbau an (`attachPerf`, `apps/host/src/debug/perf.ts`) und beim Entsorgen ab. Ohne `?debug=1` gibt es keine Beobachter und keine Kosten.

| Szene | Wann |
|---|---|
| `lobby` | Arena hinter dem Lobby-Panel |
| `arena` | Schubs-Arena (`?arena=1`, M1) |
| `brett` | Brettphase |
| `minispiel:<id>` | Spielphase eines Minispiels; Anleitung und Ergebnis getrennt als `minispiel:<id>:intro` bzw. `:results` |
| `finale` | Brett hinter der Trophäenzählung bzw. dem Siegerbildschirm |
| `podest` | 3D-Siegerpodest |

| Kennzahl | Messung |
|---|---|
| Bildabstand Median/p95/max, fps | Abstand zwischen zwei fertigen Bildern derselben Szene; Lücken > 1 s zählen als Pause (wie ADR-010) |
| Render-Zeit (ms) | JS-Zeit von `scene.render()` (ab `onBeforeAnimations` bis `onAfterRender`); ohne GPU-Arbeit – mit SwiftShader ist sie trotzdem nur der JS-Anteil |
| Draw Calls | WebGL-Zeichenaufrufe je Bild (Babylon-Zähler der Engine, inkl. Schattenkarte) |
| aktive Meshes | Meshes, die Babylon je Bild als sichtbar auswählt |
| Eingabe→Frame | Eintreffen einer Controller-Eingabe (`input`) im Host-JS bis Ende des nächsten Bildes (ADR-010) |
| Brett→Frame | Eintreffen eines neuen Brett-Stands (`board`, z. B. nach „Würfeln“ am Handy) bis Ende des nächsten Bildes |
| Kontexte / Schleifen | lebende Babylon-Engines (= WebGL-Kontexte) und laufende Render-Schleifen der ganzen Seite, Höchstwert je Szene |
| Heap | `performance.memory.usedJSHeapSize` (nur Chromium/Edge; Safari/Firefox: „–“) |
| Bestand | Meshes, Materialien, Texturen und geschätzter Texturspeicher (B·H·4, Würfel ·6, Mipmaps ·4/3) |

- „Kopieren“ legt wie bisher eine Zeile mit den Gesamtwerten ab; **„Alle Szenen kopieren“** eine Zeile je Szene plus Grafikkarte, Auflösung und User-Agent. Auf der Konsole liefert `__chaosPerf.summary()` denselben Text, `__chaosPerf.report()` die Zahlen.
- Beim Szenenwechsel werden wartende Eingänge verworfen: Die Ladezeit der nächsten Szene ist keine Eingabelatenz.
- Grenzen wie in ADR-010: Eingabe→Frame endet am Ende des JS-Renderings (ohne GPU, Compositor, Bildschirm). Der Weg Finger → Bild als Ganzes lässt sich nur per Zeitlupenvideo messen (Checkliste PF7).

### Controller (`…&debug=1`)

Die Rundlaufzeit Controller ↔ Server (Herzschlag jede Sekunde, ADR-010) wird zusätzlich **je Szene** gesammelt (`lobby`, `arena`, `brett`, `minispiel`, `minispiel:intro`/`:results`, `endstand`; maßgeblich ist die Szene beim Eintreffen der Antwort). Die kopierte Zeile enthält „RTT je Szene ms (Median/p95)“.

### Server

Die Weiterleitung einer Controller-Eingabe an den Host ist im Server synchron (Empfang → `send` im selben Ereignis, `session.ts`). Ihre Latenz ist die Wartezeit in der Node-Ereignisschleife. Der Messlauf misst deshalb die **Verzögerung der Ereignisschleife** (`monitorEventLoopDelay`, Server und Bots im selben Prozess), die **Bot-Rundlaufzeit** über den Server und Anzahl/Größe aller Nachrichten an den Host.

## 2. Automatische Messläufe (`pnpm perf`)

```bash
pnpm perf                              # baut, misst, vergleicht mit tests/perf/baseline.json
E2E_SKIP_BUILD=1 pnpm perf             # ohne Neubau (direkt nach pnpm build)
PERF_LABEL=vorher pnpm perf            # Ergebnisdatei perf-results/partie-vorher.json usw.
PERF_STRICT=1 pnpm perf                # zusätzlich zeitliche Schwellen prüfen (gleicher Rechner!)
PERF_UPDATE_BASELINE=1 pnpm perf       # Baseline neu schreiben (nach bewusster Änderung)
pnpm perf -g Revanche                  # nur ein Szenario

# Echte Grafikkarte (CHAOS-73): sichtbares Fenster, ohne VSync, ohne Baseline-Vergleich
E2E_SKIP_BUILD=1 PERF_GPU=1 PERF_VIEWPORT=1920x1080 PERF_DPR=2 PERF_LABEL=gpu-4k pnpm perf -g Partie
PERF_QUERY='&qualitaet=mittel' …        # feste Grafikstufe statt Automatik
```

Headless nimmt Chromium auch auf einem Rechner mit GPU SwiftShader; `PERF_GPU=1` öffnet deshalb ein Fenster. Ohne VSync zeigt der Bildabstand die Kosten (hunderte fps möglich), nicht die Bildwiederholrate.

Aufbau: `playwright.perf.config.ts`, `tests/perf/` (eigenes Playwright-Projekt, nicht Teil von `pnpm test:e2e`). Production-Build, echter Server im Testprozess, Host-Seite **ohne** Testmodus (echte Render-Schleife) mit `?debug=1`, 1280×720, DPR 1, ein Worker. Vier synthetische Controller (`tests/perf/perfBot.ts`) wählen Figuren, sind bereit, beantworten jede Brett-Entscheidung und spielen Minispiele mit `move` 30/s (Zufallsweg, fester Seed) sowie A alle ~0,7 s und B alle ~1,5 s, soweit angeboten. Brett-Seed `2026`.

| Szenario | Ablauf | Prüft immer |
|---|---|---|
| **Partie** | Lobby 10 s → 3 Runden (jedes Minispiel der Rotation einmal, Spielzeit 15 s, Anleitung/Ergebnis 5 s) → Finale (Trophäenzählung normal) → Podest 10 s | alle Szenen gemessen; strukturelle Schwellen gegen die Baseline; keine Seitenfehler |
| **Revanche ×3** | drei Partien à 1 Runde mit „Nochmal spielen“; nach jeder in der Lobby: GC, Heap, DOM-Knoten, Canvas, Kontexte | Heap nach Partie 3 ≤ max(+10 %, +5 MB) gegenüber Partie 1; DOM ≤ +20 Knoten; in der Lobby genau 1 Canvas und 1 Kontext; neue Partie zeigt nicht den alten Endstand |

Ergebnisse: `perf-results/partie[-LABEL].json`, `perf-results/revanche[-LABEL].json` (nicht eingecheckt) und Tabellen auf der Konsole. Die JSON-Datei enthält zusätzlich `environment` (CPU, Speicher, Node, Browser, Systemlast).

### SwiftShader – was die Zahlen bedeuten

SwiftShader rendert WebGL **auf der CPU**. Bildabstände von 100–250 ms (4–10 fps) sind hier normal und sagen nichts über eine echte Grafikkarte. Sinnvoll sind:

- **Strukturelle Kennzahlen** (rechnerunabhängig, deterministisch genug): Draw Calls, aktive Meshes, Kontexte, Render-Schleifen, Bestand, Heap-Verlauf über mehrere Partien, Nachrichten an den Host.
- **Zeitliche Kennzahlen nur relativ**, auf demselben Rechner, ohne andere Last, möglichst mehrere Läufe. Auf dem Messrechner (4 Kerne, parallel liefen E2E-Tests anderer Arbeitsstränge, Systemlast 6–8) schwankte der Bildabstand des Bretts zwischen zwei Läufen desselben Stands um ±30 %.

## 3. Messung vorher/nachher (CHAOS-39)

> **Historie:** Die Tabellen dieses Abschnitts messen das alte Brett aus Grundkörpern (vor dem Natur-Look CHAOS-62). Aktuelle Werte und Baseline: [Abschnitt 3a](#3a-nach-chaos-62-natur-look-aktuelle-baseline).

**Testbedingungen:** Linux x64, Intel Xeon @ 2,30 GHz ×4, 16 GB, Node 22.23, Chromium 153 headless, ANGLE/SwiftShader, 1280×720, DPR 1; Szenario „Partie“ (4 Bots, Seed 2026); Systemlast 6–8 durch parallele Tests anderer Arbeitsstränge. „vorher“ = Stand mit Messung, ohne Optimierungen; „nachher“ = mit den Optimierungen aus Abschnitt 4. Je ein Lauf (der erste Vorher-Lauf hatte noch einen Fehler im Draw-Call-Zähler; seine Bildabstände stehen in Klammern).

| Szene | Bildabstand p50 / p95 ms vorher → nachher | Draw Calls p50 | aktive Meshes | Render-Schleifen max | Kontexte max | Heap max MB |
|---|---|---|---|---|---|---|
| lobby | 62 / 164 → 61 / 138 | 70 → 70 | 42 | 1 → 1 | 1 → 1 | 28 → 24 |
| brett | 217 / 576 (157 / 390) → 162 / 453 | **187 → 150** | 149 | 1 → 1 | 1 → 1 | 66 → 63 |
| minispiel:sockenregen | 242 / 557 (171 / 399) → 252 / 558 | 160 → 156 | 160 | 1 → 1 | 1 → 1 | 66 → 70 |
| minispiel:pudding-gerangel | 123 / 426 (94 / 209) → 129 / 284 | 82 → 82 | 85 | 1 → 1 | 1 → 1 | 46 → 45 |
| minispiel:wackelturm | 165 / 390 (127 / 394) → 93 / 258 | 77 → 77 | 199 | 1 → 1 | 1 → 1 | 45 → 56 |
| finale (Brett hinter der Zählung) | 244 / 922 (161 / 431) → **kein Bild** | 184 → – | 146 → – | **2 → 1** | 2 → 2 | 79 → 76 |
| podest | 351 / 902 (248 / 441) → **100 / 226** | 71 → 71 | 59 | **2 → 1** | 2 → 2 | 75 → 70 |

| Weitere Werte (nachher) | |
|---|---|
| Eingabe→Frame p50 / p95 (Minispiele) | 68–164 / 228–540 ms – folgt dem Bildabstand von SwiftShader (eine Eingabe wartet im Mittel ein halbes Bild) |
| Nachrichten an den Host (≈ 186 s) | `input` 6927 (≈ 105 B, ≈ 37/s), `board` **96** (≈ 1,4 kB, max 2,4 kB, ≈ 0,5/s), `lobby` 14, `heartbeat-ack` 37 |
| Bot-Rundlaufzeit über den Server | p50 0,45 ms, p95 0,96 ms, max 17 ms (n = 756) |
| Node-Ereignisschleife (Server + Bots + Playwright) | Verzögerung p50 10 ms (Auflösung 10 ms), p99 16 ms, max 70 ms |
| Revanche ×3, Heap nach GC in der Lobby | vorher 14,1 → 20,9 → 20,2 → 20,8 MB; nachher 14,2 → 20,0 → 20,6 → 21,3 MB; DOM 255 → 263 → 263 → 263; je 1 Canvas, 1 Kontext |

**Lesart:** Belegt sind die strukturellen Änderungen – Brett −20 % Draw Calls, hinter dem Finale keine Brett-Bilder mehr und eine statt zwei Render-Schleifen. Am Podest halbiert das den Bildabstand bis auf ein Drittel (SwiftShader rechnet nur noch eine Szene); auf einer echten GPU ist der Gewinn kleiner, aber die doppelte Arbeit entfällt dort genauso. Die übrigen Unterschiede im Bildabstand liegen im Rauschen der Systemlast. Kein Speicherleck über drei Partien (Heap nach GC schwankt um ±0,7 MB, nach der ersten Partie sind Figuren, Shader und Schriften einmal geladen).

## 3a. Nach CHAOS-62 (Natur-Look, aktuelle Baseline)

Mit dem Merge von `main` (CHAOS-62, [ADR-014](decisions/ADR-014-natur-look.md)) zeigen Brett und Minispiele den Natur-Look: Insel mit Baumscheiben, Gras als Thin Instances, PBR-Materialien mit HDRI, Schatten, eigene Bäume. Bei Software-Rendering (also auch in `pnpm perf`) wählt die Szene ohne `?qualitaet=` die Sparstufe `minimal`, rendert in halber Auflösung (`setHardwareScalingLevel(2)`, 640 × 360 statt 1280 × 720) und macht größere Zeitschritte in Brett-Regie und Minispiel-Uhr. Die Zahlen sind deshalb **nicht** mit Abschnitt 3 vergleichbar; die Baseline `tests/perf/baseline.json` ist neu geschrieben (`PERF_UPDATE_BASELINE=1 pnpm perf`, 2026-11-15, gleicher Rechner, Systemlast ≈ 4).

| Szene | Bildabstand p50 / p95 ms | Draw Calls p50 (vorher, altes Brett) | aktive Meshes | Render-Schleifen max | Kontexte max | Heap max MB | Texturen ~MB |
|---|---|---|---|---|---|---|---|
| lobby | 57 / 114 | 70 (70) | 42 | 1 | 1 | 25 | 4 |
| brett | 204 / 899 | **256** (150) | 166 | 1 | 1 | 194 | 20 |
| minispiel:sockenregen | 322 / 892 | 260 (156) | 162 | 1 | 1 | 104 | 12 |
| minispiel:pudding-gerangel | 306 / 794 | 211 (82) | 113 | 1 | 1 | 120 | 14 |
| minispiel:wackelturm | 223 / 507 | 205 (77) | 236 | 1 | 1 | 90 | 12 |
| finale (Brett hinter der Zählung) | **kein Bild** | – | – | **1** | 2 | 175 | 19 |
| podest | 63 / 106 | 71 (71) | 59 | **1** | 2 | 130 | 6 |

| Weitere Werte | |
|---|---|
| Revanche ×3, Heap nach GC in der Lobby | 14,5 → 21,9 → 22,0 → 23,1 MB; DOM 177 → 193 → 193 → 193; je 1 Canvas, 1 Kontext |
| Nachrichten an den Host (≈ 184 s) | `board` 96 (max 2,4 kB), `input` 6531, `lobby` 14 – wie vorher |
| Bot-Rundlaufzeit über den Server | p50 0,51 ms, p95 0,82 ms, max 3,8 ms (n = 743) |

**Lesart:**
- **Die M4-Optimierungen tragen weiter:** Hinter der Trophäenzählung zeichnet das Natur-Brett kein Bild (`finale`: 0 Bilder, 1 Schleife), am Podest läuft nur dessen Szene (1 Schleife). Kein Speicherleck über drei Partien.
- **Mehr Draw Calls durch den Look, nicht durch den Merge:** Brett 150 → 256, Minispiele +100 bis +130 (Kulisse aus `ctx.look`, Gras, Schattenpass). Die Baum-Instanzierung aus CHAOS-39 entfällt: Die Natur-Bäume sind je Baum verformt und je Material verschmolzen (`StaticBatch`, zwei Meshes je Baum, ≈ 30 Bäume, dazu der Schattenpass). Gleiche Geometrie für Instanzen gibt es nicht mehr.
- **Heap und Texturspeicher steigen** durch PBR-Texturen, HDRI-Himmel und Umgebungslicht (Brett 63 → 194 MB Heap-Höchstwert, ≈ 20 MB Texturen). Der Heap nach GC in der Lobby bleibt bei ≈ 22 MB.
- Bildabstände sind wegen halber Auflösung und Sparstufe nicht mit Abschnitt 3 vergleichbar. Wie flüssig `hoch`/`mittel`/`niedrig` auf einer echten GPU laufen, zeigen nur PF1/PF2 und N1–N3 der [Gerätecheckliste](device-test-checklist.md).

## 3b. Erste Messung auf echter GPU (CHAOS-73)

Apple M3 Max, Chromium 153 mit ANGLE/Metal, ohne VSync, ganze Partie (`PERF_GPU=1`), Automatik an. Herleitung, Varianten und Profil: [EXP-014](experiments.md#exp-014-host-grafik-auf-echter-gpu--engpass-der-grafikstufen-2026-11-16-chaos-73).

| Szene | Bildabstand p50 / p95 ms vorher, 1080p | nachher, 1080p | nachher, 4K (DPR 2) | Draw Calls p50 |
|---|---|---|---|---|
| lobby | 0,8 / 2,5 | 1,8 / 2,6 | 2,3 / 2,8 | 70 |
| brett | **26 / 29** | **5,5 / 8,0** | 8,7 / 13,6 | 422 |
| minispiel:sockenregen | 15 / 19 | 4,2 / 6,1 | 7,4 / 12,0 | 415 |
| minispiel:pudding-gerangel | 20 / 25 | 4,8 / 7,2 | 8,2 / 12,8 | 327 |
| minispiel:wackelturm | 15 / 18 | 4,4 / 6,0 | 7,6 / 13,2 | 328 |
| podest | 1,7 / 2,6 | 0,9 / 2,5 | 1,6 / 2,8 | 71 |

**Lesart:**
- **Engpass waren die weichen Kontaktschatten (PCSS)** in Babylons Filterstufe `HIGH`: ≈ 23 ms je Bild am Brett, selbst auf einer M3 Max. Die GPU war voll, JS wartete in `uniformMatrix4fv`/`drawElements` (Render-Zeit ≈ Bildabstand). Mit Filterstufe `LOW` sehen sie praktisch gleich aus und kosten ≈ 1 ms.
- **Auflösung** ist der zweite Hebel: Bei 4K kostet dieselbe Szene etwa das Dreifache. Jede Stufe begrenzt jetzt die Renderpixel (`hoch` 2560×1440, `mittel` 1920×1080, `niedrig` 1600×900); die Host-Zeile der Messanzeige zeigt die tatsächliche Renderauflösung.
- **Draw Calls** (≈ 330–420 bei `hoch`; Tiefenunschärfe und Schattenpass zeichnen die Szene erneut) sind auf diesem Rechner kein Engpass (`niedrig`: 269 Draw Calls in 1,6 ms). Auf schwachen CPUs bleibt Bündeln ein Kandidat.
- Wie viel Luft eine schwächere Grafikkarte hat, zeigt nur Rubens Messung (PF1/PF2, N1–N3). Reicht `hoch` dort nicht, stuft die Automatik ab und merkt sich die Stufe für die Sitzung (jede neue Szene startet mit ihr statt wieder bei `hoch`).

## 4. Umgesetzte Optimierungen

| Engpass (belegt durch) | Änderung | Ergebnis |
|---|---|---|
| Brett rendert hinter Trophäenzählung und Podest weiter: 2 Render-Schleifen, 2 Szenen je Bild (`finale`/`podest`: Schleifen 2) | `BoardScene.setRenderPaused`: Sobald das Finale das Brett überdeckt, stoppt `BoardStage` die Render-Schleife des Bretts; nur die Regie läuft per `requestAnimationFrame` weiter (Stand, HUD). Die Leinwand behält das letzte Bild (die Zählung ist zu 92–95 % deckend, das Podest ganz). Der Kontext bleibt: „Nochmal spielen“ führt in die Lobby, die das Brett ohnehin entsorgt. | Schleifen 2 → 1, Podest-Bildabstand p50 351 → 100 ms (SwiftShader) |
| Brett: 15 Bäume aus je 3 Meshes = 45 Draw Calls | Bäume als Instanzen (`createInstance`) von 5 Vorlagen (Stamm, je Kronenform und Material); Wackeln weiter je Baum-Knoten | Draw Calls 187 → 150; Screenshot `host-brett` unverändert. **Entfallen mit CHAOS-62** (neue, je Baum verformte Bäume, siehe Abschnitt 3a) |
| Alter Endstand nach „Nochmal spielen“: Der Server zählt `eventSeq` je Partie ab 0, die Regie hielt die neue Partie für „veraltet“ und zeigte weiter den Siegerbildschirm samt Podest (zwei Szenen) | Regie (`director.ts`) erkennt eine neue Partie (eventSeq 0 nach `game-results`) und springt auf den Stand; Unit-Test und Prüfung im Revanche-Messlauf | gefunden durch den Revanche-Messlauf; funktionaler Fehler, nicht nur Performance |

| Siegerpodest baut erst beim Erscheinen und übersetzt alle Shader am Stück (`whenReadyAsync`): 3 Blöcke bis 0,84–1,04 s am Übergang (SwiftShader, `minimal`), KI-25 (CHAOS-71) | Das Finale baut das Podest zu Beginn der Trophäenzählung auf einer unsichtbaren Leinwand (ohne Render-Schleife); Pausen zwischen den Aufbauschritten, Shader je Mesh in ≈ 12-ms-Abschnitten mit Bildpause (`scene/prepareGradually.ts`), erstes Bild vorab. Der Siegerbildschirm hängt die Leinwand nur ein und startet die Schleife. Während der Zählung zwei WebGL-Kontexte (Brett pausiert + Podest), wie bisher am Podest | Übergang 35–47 ms (`minimal`) bzw. 46–110 ms (`hoch`), kein Long Task; während der Zählung ein Block bis ≈ 1 s ([EXP-021](experiments.md)) |

Geprüft und **nicht** geändert:

| Kandidat | Befund |
|---|---|
| Brett-Szene während der Minispiele | Wird bereits entsorgt (App zeigt Brett **oder** Minispiel-Bühne); je 1 Kontext, 1 Schleife |
| Render-Schleife bei verdecktem Tab | Babylon nutzt `requestAnimationFrame`; Browser pausieren es in Hintergrund-Tabs. Die Messanzeige zählt solche Lücken als „Pausen“; Prüfung am Gerät: PF9 |
| Speicher über mehrere Partien | Kein Wachstum (Revanche ×3); Dispose beim Szenenwechsel greift |
| Server-Broadcast der `board`-Views | ≈ 0,5 Nachrichten/s mit ≈ 1,4 kB; nur bei Ereignis oder geänderter Sicht (`lastViewKey`). Nicht relevant, nicht geändert |
| `freezeActiveMeshes`, eingefrorene Materialien | JS-Render-Zeit je Bild 2–6 ms (Median) bei 60–250 ms Bildabstand: kein Engpass in SwiftShader; auf echter Hardware erst nach Rubens Messung bewerten (Figuren, Popups und Marker ändern die aktive Liste ständig) |
| Schatten (1024er Karte, PCF) | Zeichnet nur Figuren, Wegweiser und Pokale; Änderung wäre sichtbar → nur bei Bedarf nach Hardware-Messung. **Nachtrag CHAOS-73:** Der Natur-Look nutzt bei `hoch`/`mittel` PCSS; dessen Filterstufe `HIGH` war der Engpass (Abschnitt 3b), jetzt `LOW` |
| Minispiel Sockenregen (≈ 160 Draw Calls, mit Natur-Kulisse ≈ 260) | Größter Minispiel-Wert; liegt im Minispiel-Paket. Kandidat für Instanzen, falls Rubens Messung dort Ruckler zeigt |
| Natur-Bäume auf dem Brett (CHAOS-62, ≈ 30 Bäume à 2 Meshes plus Schattenpass) | Nicht instanzierbar (jeder Baum eigene Geometrie), wackeln je Baum. Zusammenfassen ginge nur mit Wind im Vertex-Shader statt Knoten-Drehung; erst nach Rubens Messung (PF2, N1–N3) und nur, wenn das Brett auf seiner GPU ruckelt |

## 5. Schwellen

**Keine erfundenen Universalwerte.** M1 hat keine Hardware-Messwerte geliefert (Abnahme M1: „Einzelergebnisse nicht gemeldet“, P3/P9 leer). Deshalb:

| Schwelle | Wert | Herkunft | Geprüft |
|---|---|---|---|
| WebGL-Kontexte je Szene | ≤ Baseline (heute: 1, am Podest/Finale 2) | eigene Baseline `tests/perf/baseline.json` | immer (`pnpm perf`) |
| Render-Schleifen je Szene | ≤ Baseline (heute überall 1) | eigene Baseline | immer |
| Draw Calls je Szene (Median) | ≤ Baseline · 1,1 + 5 | eigene Baseline; Rest-Schwankung durch Spielverlauf | immer |
| Bildabstand p95 je Szene | ≤ Baseline · 1,25 + 4 ms | eigene Baseline (SwiftShader) | nur `PERF_STRICT=1` auf dem Baseline-Rechner |
| Render-Zeit p95 je Szene | ≤ Baseline · 1,25 + 2 ms | eigene Baseline | nur `PERF_STRICT=1` |
| Heap max je Szene | ≤ Baseline · 1,2 + 10 MB | eigene Baseline | nur `PERF_STRICT=1` |
| Heap über drei Partien | Partie 3 ≤ max(Partie 1 · 1,1; Partie 1 + 5 MB) | im selben Lauf | immer |
| Bildrate/Bildabstand auf Rubens PC | **offen, Messung durch Ruben** (PF1/PF2); Ziel CHAOS-73: Brett und Minispiele p95 ≤ 20 ms in 1080p | Gerätecheckliste | – |
| Bildabstand auf dem Mac (M3 Max, ohne VSync) | Richtwert aus Abschnitt 3b; nur Vergleich vorher/nachher mit `PERF_GPU=1` auf demselben Rechner | EXP-014 | – (kein Grenzwert in `pnpm perf`) |
| Eingabe→Frame und RTT auf echten Geräten | **offen, Messung durch Ruben** (PF3, PF5, PF6) | Gerätecheckliste | – |

Vorschlag für die Zeit nach Rubens Messung: dieselbe Regel wie oben (+25 % auf den gemessenen p95 je Szene) als Regressionsgrenze für spätere Messungen auf **seinem** Rechner; eine harte Untergrenze („mindestens X fps“) erst, wenn PF2 zeigt, ab welchem Wert es sich unflüssig anfühlt.

Die Baseline gilt für den Rechner, auf dem sie entstand (`environment` in der Datei). Auf einem anderen Rechner erst `PERF_UPDATE_BASELINE=1 pnpm perf` auf dem alten Stand, dann vergleichen.

## 6. Nur auf echter Hardware messbar

- Bildrate und Bildabstand mit **Rubens** GPU, HiDPI/4K-Auflösung und Fernseher (Bildwiederholrate, Eingabeverzögerung des Fernsehers). Gemessen ist bisher nur ein Mac mit M3 Max (Abschnitt 3b).
- Gesamtlatenz Finger → Bild (Touch-Verarbeitung in iOS-Safari, WLAN, Compositor, Monitor): nur Zeitlupenvideo.
- RTT über echtes WLAN (2,4/5 GHz, Mesh, Störungen), iOS-Timer-Drosselung, Energiesparmodus.
- Verhalten schwacher PCs (integrierte Grafik), Thermik über eine lange Partie.
- `performance.memory` gibt es in Safari/Firefox nicht; Heap am PC nur mit Chrome/Edge.

Messpunkte dafür: [Gerätecheckliste, Abschnitt 11](device-test-checklist.md#11-m4--performance-für-chaos-43).
