# Renderer-Spike: Anleitung und Messbogen (CHAOS-75)

**Stand:** 2026-11-17 · **Aufgabe:** CHAOS-75 (abgeschlossen), PC-Zeilen R1–R6: CHAOS-131 · **Entscheidung:** [ADR-016](decisions/ADR-016-renderer.md), angenommen am 2026-11-17 · **Experiment:** [EXP-015](experiments.md#exp-015-renderer-alternativen--webgpu-webassembly-nativ-2026-11-16-chaos-75)

Drei Kandidaten zeigen **dieselbe Testszene**: das Spielbrett „Wackelwald“ im Natur-Look mit dem Beispiel-Spielstand des lokalen Brett-Modus (4 Figuren, Schatten, Gras, Bäume, Pokale). Gemessen wird der **Bildabstand ohne VSync**, damit die Zahl die Kosten zeigt und nicht die Bildwiederholrate des Bildschirms.

> **Wichtig:** Alle Zahlen müssen von echter Hardware kommen. Die Cloud-Umgebung hat keine Grafikkarte: Dort liefen nur Bau-, Funktions- und Sichtprüfungen (siehe EXP-015). Bitte jede Messung mit Rechner, Browser/Version und Auflösung eintragen.

## 0. Vorbereitung (einmal)

```bash
pnpm install
```

```bash
node scripts/spike-export-board.mjs
```

Der Export baut das echte Brett im Headless-Chromium, schreibt `spikes/renderer-bevy/assets/export/` (Kulisse als GLB ≈ 27 MB, Instanzen ≈ 16 MB, Beschreibung, Figuren-GLBs) und dauert 1–3 Minuten. Für Bevy zusätzlich Rust (`rustup`, stabile Version ≥ 1.95):

```bash
rustup target add wasm32-unknown-unknown
```

```bash
cargo install wasm-bindgen-cli --version 0.2.130 --locked
```

## 1. Kandidat 1: Babylon.js mit WebGPU (gleicher Spielcode)

Der Host hat dafür den Schalter `?gpu=webgpu`. Er wirkt im Spike **nur auf das Brett**; Lobby, Minispiele und Podest bleiben WebGL2. Ohne WebGPU-Adapter fällt das Brett auf WebGL2 zurück; die Messanzeige zeigt in der Host-Zeile, welche Schnittstelle wirklich läuft („WebGPU …“ bzw. „WebGL2 …“).

**Messlauf (empfohlen, ohne VSync):** Brett-Werte aus der ganzen Partie, einmal je Schnittstelle.

```bash
pnpm build
```

```bash
E2E_SKIP_BUILD=1 PERF_GPU=1 PERF_VIEWPORT=1920x1080 PERF_DPR=1 PERF_QUERY='&qualitaet=hoch' PERF_LABEL=webgl pnpm perf -g Partie
```

```bash
E2E_SKIP_BUILD=1 PERF_GPU=1 PERF_VIEWPORT=1920x1080 PERF_DPR=1 PERF_QUERY='&qualitaet=hoch&gpu=webgpu' PERF_LABEL=webgpu pnpm perf -g Partie
```

Ergebnis: Zeile `brett` in der Konsolentabelle bzw. `perf-results/partie-webgl.json` und `partie-webgpu.json`. Dasselbe mit `qualitaet=niedrig` ergibt das Gegenstück zur sparsamen Bevy-Einstellung (§4).

**Von Hand (auch in Safari 26):** `pnpm start`, dann im Browser

- `http://localhost:8787/host/?local=1&board=1&demo=1&debug=1&qualitaet=hoch`
- `http://localhost:8787/host/?local=1&board=1&demo=1&debug=1&qualitaet=hoch&gpu=webgpu`

30 s warten, in der Messanzeige „Alle Szenen kopieren“. Mit VSync zeigt die fps-Zahl höchstens die Bildwiederholrate; aussagekräftig sind dann **Bildabstand p95** und **Render ms**.

## 2. Kandidat 2: Bevy (Rust) als WebAssembly im Browser

```bash
spikes/renderer-bevy/build-web.sh
```

```bash
python3 -m http.server 8090 -d spikes/renderer-bevy/web
```

- WebGPU: `http://localhost:8090/?variante=webgpu&sekunden=30`
- WebGL2 (Gegenprobe): `http://localhost:8090/?variante=webgl2&sekunden=30`

Die Seite lädt ≈ 35 MB Programm und ≈ 43 MB Szene; erst danach beginnt das Aufwärmen. So soll es aussehen (hier per Software gerendert): [`chaos75-bevy-webgl2-swiftshader.jpg`](screenshots/chaos75-bevy-webgl2-swiftshader.jpg). Nach 3 s Aufwärmen und 30 s Messung steht unten links eine JSON-Zeile (`SPIKE-ERGEBNIS`, auch in der Konsole). Der Browser begrenzt auf die Bildwiederholrate; für Kosten ohne VSync Chrome mit `--disable-gpu-vsync --disable-frame-rate-limit` starten. Bevy nennt WebGPU im Browser selbst „experimentell“.

## 3. Kandidat 3: Bevy nativ (Metal auf dem Mac, DX12/Vulkan am PC)

```bash
cd spikes/renderer-bevy && cargo run --release -- --sekunden=30
```

Weitere Parameter: `--breite=3840 --hoehe=2160` (4K), `--vsync=1`, `--schatten=0`, `--schattenkarte=1024`, `--gras=0.25` (Anteil), `--msaa=1`, `--bild=brett.png` (Bildschirmfoto). Der Erst-Build dauert 5–15 Minuten. Das Fenster schließt nach der Messung; die Zeile `SPIKE-ERGEBNIS {…}` steht im Terminal.

**Apple TV:** Bevy läuft auf tvOS noch nicht (Fenster-Bibliothek winit 0.30 ohne tvOS, Bevy-Issue #13058 offen). Dafür gibt es den RealityKit-Prototyp (§3b).

## 3b. Kandidat 4: Swift/RealityKit nativ (macOS, tvOS; iPhone/iPad nur als Benchmark) – CHAOS-78

Eine SwiftUI-App mit RealityKit für macOS, iOS/iPadOS und tvOS 26+, dieselbe Szene als USDZ, Gras als echtes GPU-Instancing (`MeshInstancesComponent`). Bauen, Parameter, Grenzen der Messung: [`spikes/renderer-realitykit/README.md`](../spikes/renderer-realitykit/README.md). iPhone und iPad sind dabei **nur Renderer-Benchmark**, kein Spiel-Host.

```bash
node scripts/spike-export-board.mjs && spikes/renderer-realitykit/convert/convert.sh
```

```bash
cd spikes/renderer-realitykit && xcodegen generate && xcodebuild -project ChaosRenderSpike.xcodeproj -scheme ChaosRenderSpike -destination 'platform=macOS' -configuration Release -derivedDataPath build build
```

```bash
build/Build/Products/Release/ChaosRenderSpike.app/Contents/MacOS/ChaosRenderSpike --sekunden=30
```

RealityKit rendert immer mit VSync: Liegt der Median beim Bildwechselintervall (8,33 ms bei 120 Hz), ist die Reserve unbekannt. `--durchsatz=1` misst offscreen ohne VSync, aber Bild für Bild nacheinander (obere Schranke, nicht mit Bevy `vsync=0` vergleichbar). **Wichtig:** Das Fenster muss sichtbar im Vordergrund bleiben, sonst drosselt macOS auf ≈ 10 Hz (Median ≈ 100 ms = ungültig). Auf der echten Apple TV braucht es ein Signier-Team in Xcode (siehe Gerätecheckliste §17).

## 4. Was die Szenen gleich haben – und was nicht

| | Babylon (Spiel) | Bevy-Prototyp |
|---|---|---|
| Geometrie, Materialien, Texturen | Original (201 Meshes, ≈ 500 000 Vertices) | aus dem Original exportiert (GLB): 121 Meshes, 57 Materialien, 23 Texturen |
| Gras, Blumen (Thin Instances) | 8 Gruppen, bei `hoch` ≈ 64 000 Instanzen | dieselben Matrizen als Entitäten (Bevy bündelt gleiche Mesh+Material); Anteil mit `gras=` |
| Figuren | 4 Blender-GLBs mit Idle-Animation | dieselben GLBs, Idle-Animation, Blick zur Kamera |
| Kamera | Brett-Kamera | Position, Ziel, Sichtfeld exportiert; steht still |
| Sonne + Schatten | `hoch`: PCSS (Filter LOW), Karte 4096; `niedrig`: PCF, 1024 | Kaskadenschatten (2 Kaskaden), Karte mit `schattenkarte=` |
| Umgebungslicht | HDRI-Himmel als Spiegelung und Licht | einfaches Umgebungslicht; Himmelskuppel als Mesh |
| Nachbearbeitung | `hoch`: SSAO, Tiefenunschärfe, Bloom; `niedrig`: keine davon | keine; Tonemapping |
| Kantenglättung | `hoch` MSAA 4×, `niedrig` aus | `msaa=` (Standard 4) |
| Auflösungsgrenze | `hoch` 2560×1440, `niedrig` 1600×900 | Fenstergröße (`breite`/`hoehe`) |
| Bewegung | Bäume wackeln, Regie bewegt Popups/Marker | statisch bis auf die Figuren |
| Texturwiederholung (`KHR_texture_transform`) | alle Texturen | in Bevy nur auf der Grundfarbe |

**Passende Paare:**

- Babylon `qualitaet=hoch` (1920×1080) ↔ Bevy Standard (`--gras=1 --schattenkarte=4096 --msaa=4`, 1920×1080). Bevy fehlen SSAO, Tiefenunschärfe, Bloom und HDRI-Licht: Bevy ist hier eher zu günstig.
- Babylon `qualitaet=niedrig` (rendert höchstens 1600×900) ↔ Bevy `--gras=0.25 --schattenkarte=1024 --msaa=1 --breite=1600 --hoehe=900`. Das ist der fairste Vergleich der reinen Szene.

Im Browser gelten dieselben Namen als Query (`?variante=webgpu&gras=0.25&schattenkarte=1024&msaa=1`); die Größe bestimmt dort das Fenster. Unterschiede im Aussehen bitte mit `--bild=…` bzw. Bildschirmfoto festhalten.

## 5. Messbogen

Bitte je Zeile Median und p95 des Bildabstands in ms (ohne VSync) eintragen. Die PC-Zeilen R1–R6 laufen über CHAOS-131. R2 (WebGPU) erst messen, wenn CHAOS-117 behoben ist.

| # | Rechner | Kandidat | Browser/API | Auflösung | Median | p95 | Bemerkung |
|---|---|---|---|---|---|---|---|
| R1 | PC | Babylon `hoch` | Chrome/Edge, WebGL2 | 1920×1080 | | | |
| R2 | PC | Babylon `hoch` | Chrome/Edge, WebGPU | 1920×1080 | | | |
| R3 | PC | Babylon `niedrig` | WebGL2 / WebGPU | 1920×1080 (rendert 1600×900) | | | |
| R4 | PC | Bevy WebAssembly | Chrome/Edge, WebGPU | 1920×1080 | | | |
| R5 | PC | Bevy WebAssembly | Chrome/Edge, WebGL2 | 1920×1080 | | | |
| R6 | PC | Bevy nativ | DX12/Vulkan | 1920×1080 und `niedrig`-Paar | | | |
| R7 | Mac | Babylon `hoch` | Chromium/Safari 26, WebGL2 | 1920×1080 | 8,4 | 11,2 | 17.11., MacBook Pro M3 Max, zwei 4K-Monitore mit 60 Hz; `pnpm perf -g Partie`, Zeile `brett`, 117 fps, Render 7,8 ms |
| R8 | Mac | Babylon `hoch` | Chromium/Safari 26, WebGPU | 1920×1080 | – | – | 17.11.: **nicht messbar.** Die WebGPU-Engine startet (Messanzeige: „WebGPU metal-3“), aber das Brett zeichnet nie ein Bild: 0 Bilder, keine Render-Schleife, kein Fehler in der Konsole. Fehler im Spike-Pfad, siehe EXP-015 |
| R9 | Mac | Bevy WebAssembly | Safari 26 / Chrome, WebGPU | 1920×1080 | 12,8 | 13,6 | 17.11., Chromium 153 ohne VSync, 78 fps; Gegenprobe WebGL2: 39,9 / 41,1 ms (25 fps) |
| R10 | Mac | Bevy nativ | Metal | 1920×1080 | 3,8 | 4,8 | 17.11., **offscreen** (`--fenster=0`), 258 fps; `niedrig`-Paar 1600×900: 2,7 / 3,3 ms. Im Fenster rastet Bevy auf dem 60-Hz-Monitor trotz `vsync=0` bei 16,7 ms ein |
| R11 | PC/Mac | wie R1/R2/R6 | | 3840×2160 | | | 4K am Fernseher. **Mac 17.11.:** Babylon WebGL2 `hoch` 19,3 / 27,5 ms (49 fps; rendert höchstens 2560×1440); Bevy nativ offscreen 7,1 / 11,1 ms; RealityKit ARView 60 fps, GPU 7,3 / 13,1 ms (Metal-HUD) |
| R12 | Apple TV 4K (3. Gen., A15) | RealityKit (§3b) ARView | Metal | 3840×2160 | 51,1 | 59,4 | 17.11., echtes Gerät: **20 fps**; GPU je Bild 34,7 ms (Metal-HUD), knapp über der 30-fps-Grenze (33,3 ms); unabhängig von Gras und Schatten. 1080p-Ausgabe entfällt: Ruben bleibt bei 4K (17.11.) |
| R13 | Mac | RealityKit (§3b) ARView | Metal | 1920×1080 | 16,7 | 17,8 | 17.11., 60-Hz-Monitor, am VSync-Deckel (60 fps); **GPU je Bild 6,3 ms, p95 9,4 ms** (Metal-HUD). Vorläufiger Wert vom 16.11. (120 Hz, mit GeForce NOW): 8,30 / 17,0 |
| R14 | Mac | RealityKit (§3b) offscreen `--durchsatz=1` | Metal | 1920×1080 | 16,6 | 33,5 | 17.11.; 4K: 49,6 / 50,9 ms. Bilder nacheinander gemessen (CPU + GPU ohne Überlappung), nicht mit R10 vergleichbar |
| R15 | iPhone 16 Pro (nur Benchmark) | RealityKit (§3b) ARView | Metal | 2622×1206 | 16,68 | 17,4 | 16.11., echtes Gerät, volle Szene; ARView bleibt bei 60 Hz (auch mit `--bildrate=120`), max 20,6 ms |
| R16 | Apple TV 4K (3. Gen., A15) | RealityKit hochskaliert, intern 1920×1080 + MetalFX (`hoch-0.5-metalfx`) | Metal | 3840×2160 (intern 1920×1080) | | | CHAOS-114, EXP-020: Anzeige-fps, GPU je Bild (HUD), Skalierer laut `SPIKE-ERGEBNIS` |
| R17 | Apple TV 4K | wie R16, bilinear (`hoch-0.5-bilinear`) | Metal | 3840×2160 (intern 1920×1080) | | | |
| R18 | Apple TV 4K | intern 2560×1440 + MetalFX (`hoch-0.667-metalfx`) | Metal | 3840×2160 (intern 2560×1440) | | | |
| R19 | Apple TV 4K | Diagnose nativ 4K (`diag-4k*`, alle sechs) | Metal | 3840×2160 | | | GPU je Bild je Schalter: MSAA, Tonemapping, IBL, Materialien, alles aus |

Außerdem: Sieht Bevy gleichwertig aus (ja/nein, Bildschirmfotos)? Spürbare Ladezeit (Bevy-WASM lädt ≈ 27 MB Szene plus das Programm)?
