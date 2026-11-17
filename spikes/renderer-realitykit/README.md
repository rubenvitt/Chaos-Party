# Renderer-Spike mit RealityKit (CHAOS-78, CHAOS-114)

Wegwerf-Prototyp, nicht Teil des Spiels: dieselbe Testszene wie [`spikes/renderer-bevy`](../renderer-bevy/README.md), nativ mit SwiftUI und RealityKit.

## App

Eine SwiftUI-App mit RealityKit (`ARView`) für **macOS, iOS/iPadOS und tvOS** (ein Ziel mit drei Plattformen, Deployment-Target 26.0, Xcode 27). Das Projekt erzeugt `xcodegen` aus `project.yml`. `ChaosRenderSpike.xcodeproj` und `build/` sind nicht eingecheckt. Bundle-ID `dev.rubeen.chaosparty.renderspike`, nur lokal signiert (macOS ad hoc, Simulatoren ohne Team).

**Produktregel:** Das Spiel läuft auf dem PC/Mac, iPhones und iPads sind nur Controller. iOS/iPadOS dient hier **nur als Renderer-Benchmark und ist kein Spiel-Host**. tvOS ist der Kandidat für die Host-Anzeige; der Server bleibt auf PC/Mac.

### Bauen und starten

Voraussetzung sind die Assets in `assets/export/` (Abschnitt „Assets“). Sie liegen als Ordner im Bundle, nicht als `.reality`.

```bash
cd spikes/renderer-realitykit
xcodegen generate

# macOS: direkt starten, nicht per `open`, sonst fehlt stdout
xcodebuild -project ChaosRenderSpike.xcodeproj -scheme ChaosRenderSpike -destination 'platform=macOS' -configuration Release -derivedDataPath build build
build/Build/Products/Release/ChaosRenderSpike.app/Contents/MacOS/ChaosRenderSpike --sekunden=30
# Falls direkt gestartet kein Fenster erscheint (17.11. beobachtet): über LaunchServices, mit GPU-Zeit
open -W -n --stdout /tmp/rk.log --stderr /tmp/rk.log --env MTL_HUD_ENABLED=1 --env MTL_HUD_LOG_ENABLED=1 build/Build/Products/Release/ChaosRenderSpike.app --args --sekunden=30
build/Build/Products/Release/ChaosRenderSpike.app/Contents/MacOS/ChaosRenderSpike --durchsatz=1 --sekunden=30 --bild=/tmp/offscreen.png

# iPad-Simulator (nur Funktionsprobe)
xcodebuild -project ChaosRenderSpike.xcodeproj -scheme ChaosRenderSpike -destination 'generic/platform=iOS Simulator' -configuration Release -derivedDataPath build build
xcrun simctl boot "iPad (A16)"
xcrun simctl install "iPad (A16)" build/Build/Products/Release-iphonesimulator/ChaosRenderSpike.app
xcrun simctl launch --console-pty "iPad (A16)" dev.rubeen.chaosparty.renderspike --sekunden=10 --bleiben=1

# tvOS-Simulator (nur Funktionsprobe), Laufzeit tvOS 27
xcodebuild -project ChaosRenderSpike.xcodeproj -scheme ChaosRenderSpike -destination 'generic/platform=tvOS Simulator' -configuration Release -derivedDataPath build build
xcrun simctl create "Apple TV 4K (3rd generation)" com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-3rd-generation-4K com.apple.CoreSimulator.SimRuntime.tvOS-27-0
xcrun simctl boot "Apple TV 4K (3rd generation)"
xcrun simctl install "Apple TV 4K (3rd generation)" build/Build/Products/Release-appletvsimulator/ChaosRenderSpike.app
xcrun simctl launch --console-pty "Apple TV 4K (3rd generation)" dev.rubeen.chaosparty.renderspike --sekunden=10 --bleiben=1
```

Für echte Geräte das eigene Team nur auf der Kommandozeile mitgeben (nicht ins Repo), dann per `devicectl` installieren und starten:

```bash
xcodebuild -project ChaosRenderSpike.xcodeproj -scheme ChaosRenderSpike -destination 'generic/platform=iOS' -configuration Release -derivedDataPath build -allowProvisioningUpdates DEVELOPMENT_TEAM=<TEAM-ID> CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" build
xcrun devicectl list devices
xcrun devicectl device install app --device <ID> build/Build/Products/Release-iphoneos/ChaosRenderSpike.app
xcrun devicectl device process launch --device <ID> --console --terminate-existing dev.rubeen.chaosparty.renderspike --sekunden=30
```

Für die Apple TV dasselbe mit `generic/platform=tvOS` und `Release-appletvos`. Vorher die Apple TV mit Xcode koppeln (Apple TV: Einstellungen → Fernbedienungen und Geräte → Remote-App und Geräte; Mac: Xcode → Window → Devices and Simulators).

### TestFlight (Apple TV, CHAOS-119)

Bis der native Host steht ([ADR-019](../../docs/decisions/ADR-019-nativer-apple-host.md)), ist dieser Spike die Apple-TV-App in TestFlight: Name „Chaos Party“, Bundle-ID `dev.rubeen.chaosparty.tv`, Team wie bei der Controller-App. `project.yml` signiert weiterhin nur lokal; [`scripts/testflight.sh`](scripts/testflight.sh) überschreibt Bundle-ID, Anzeigenamen, Team und Signatur auf der Kommandozeile und baut nur für tvOS (Gerät).

- **CI:** [`.github/workflows/testflight-tv.yml`](../../.github/workflows/testflight-tv.yml) läuft bei jedem Push auf `main`, der diesen Ordner ändert (ohne `*.md`), und lässt sich manuell starten (Actions → „TestFlight (Apple TV)“ → Run workflow). Der Job erzeugt die Testszene selbst (Look-Dev-Texturen, `spike-export-board.mjs`, `convert.sh`, zusammen ca. 10 Minuten) und nutzt dieselben Secrets wie die Controller-App (`APPLE_API_KEY`, `APPLE_API_KEY_P8`, `APPLE_API_ISSUER`).
- **Voraussetzung:** Der App-Eintrag für `dev.rubeen.chaosparty.tv` (Plattform tvOS) existiert in App Store Connect. Die App-ID legt Xcode beim ersten Archivieren über den API-Key selbst an (`-allowProvisioningUpdates`).
- **Lokal** mit dem in Xcode angemeldeten Account, Testszene vorher erzeugen:

  ```bash
  XCODE_ACCOUNT=1 spikes/renderer-realitykit/scripts/testflight.sh
  XCODE_ACCOUNT=1 UPLOAD=0 spikes/renderer-realitykit/scripts/testflight.sh   # nur .ipa, kein Upload
  ```

- **Icons:** tvOS verlangt Bildstapel mit Parallaxe-Ebenen und Top-Shelf-Bilder. Sie liegen in `app-tv/Assets.xcassets` (nur für tvOS eingebunden) und entstehen mit `python3 -I scripts/tv-icons.py` aus dem Icon der Controller-App.
- **Grenze:** Aus TestFlight startet die App ohne Startparameter, also mit den Standardwerten (ARView in nativer Auflösung, bei 4K ca. 20 fps, CHAOS-114). Messreihen mit Parametern laufen weiter über Xcode bzw. `devicectl`.

### Parameter

Wie bei Bevy als `--name=wert`; im Simulator hängt man sie an `simctl launch` an.

| Parameter | Standard | Wirkung |
|---|---|---|
| `sekunden` | 20 | Messdauer. Ist der Wert gesetzt, beendet sich die App danach (außer mit `--bleiben=1`). |
| `aufwaermen` | 3 | Sekunden zwischen fertig geladener Szene und Messbeginn. |
| `gras` | 1 | Anteil der Gras- und Blumeninstanzen, gleichmäßig ausgedünnt wie bei Bevy. |
| `schatten` | 1 | Sonnenschatten (automatische Projektion, 80 m, ab Version 27 zwei Kaskaden; nur mit Xcode 27, siehe unten). |
| `breite`/`hoehe` | 1920/1080 | Bildpunkte: auf macOS die Fenstergröße, mit `--durchsatz=1` die Größe der Offscreen-Textur. |
| `durchsatz` | 0 | `1` misst offscreen mit `RealityRenderer` ohne vsync, siehe unten. |
| `msaa` | 4 | Nur offscreen steuerbar (`0` oder `4`). Die ARView entscheidet selbst. |
| `bild` | – | Pfad für ein PNG am Messende (ARView-Schnappschuss oder Offscreen-Textur). |
| `sonne`/`himmel` | 1600/2,5 | Abgleich der Babylon-Lichtwerte: Lux je Babylon-Intensität und Faktor für das Himmelslicht. |
| `bildrate` | – | Undokumentiert (`ARView.__preferredFrameRate`), Wunschbildrate. |
| `assets` | – | Anderer Ordner mit Assets (Entwicklung). |
| `server` | – | `ws://<pc>:8787/ws`: als Host verbinden, siehe unten. |
| `hochskalieren` | 0 | `1`: eigene Render-Schleife mit interner Auflösung und Hochskalierung (CHAOS-114, siehe unten). |
| `skala` | 0,5 | Interne Auflösung je Achse als Anteil der Anzeige: 0,5 = 1920×1080 bei 4K, 0,667 = 2560×1440, 1 = nativ. |
| `skalierer` | metalfx | `metalfx` (MetalFX Spatial, tvOS erst ab 27.2, sonst automatisch bilinear) oder `bilinear`. |
| `imflug` | 2 | Bilder gleichzeitig in Arbeit (1–3). |
| `tonemapping` | 1 | Nur `RealityRenderer` (offscreen, hochskaliert): `0` schaltet Tonemapping ab. |
| `ibl` | 1 | `0` lässt das Himmelslicht (IBL) weg. |
| `material` | voll | Diagnose: `einfach` (ein PBR-Material ohne Texturen für alles) oder `unbeleuchtet` (`UnlitMaterial`). |

### Szene

- **Kamera und Licht** kommen aus `brett.szene.json`: `PerspectiveCamera` mit vertikalem Sichtfeld und `DirectionalLight` mit Schatten. Babylons Hemisphärenlicht bildet ein kleines Equirect-Bild mit Himmel- und Bodenfarbe als Image-Based Light nach; die Klarfarbe ist der Hintergrund. Die Koordinaten gelten unverändert, die Ausrichtung entspricht dem Bevy-Bild.
- **Gras und Blumen:** echtes GPU-Instancing mit `MeshInstancesComponent` und `LowLevelInstanceData` (ab 26.0 auf allen drei Plattformen). Pro Gruppe gibt es eine Entität mit dem `ModelComponent` des Grundmeshs; die Matrix jeder Instanz ist die JSON-Weltmatrix mal der Lage des Meshs im Brett (Z-up → Y-up). Bei `gras=1` sind es 64 246 Instanzen. Die Materialien sind doppelseitig gestellt. Instanzen werfen keine Schatten, denn Babylon meldet nur Bäume, Requisiten und Figuren als Schattenwerfer an.
- **Himmelskuppeln und Dunst** (`himmel_*`, `dunst`) sind ausgeblendet. Sonst verschatten die 500-m-Kugeln das ganze Brett, und die Dunstfläche färbt den Hintergrund grau.
- **Figuren:** vier USDZ-Figuren an ihren Orten, zur Kamera gedreht. Die Idle-Animation wird in Schleife gestartet. Optisch ist nicht bestätigt, dass sie sich bewegen: Zwei Offscreen-Bilder nach 1 s und 2 s zeigen am Roboter keinen sichtbaren Unterschied.

### Messung und ihre Grenzen

- **ARView (Standard):** gemessen werden die Abstände von `SceneEvents.Update`. RealityKit rendert immer vsync-gebunden. Liegt der Median beim Bildwechselintervall (8,33 ms bei 120 Hz, 16,67 ms bei 60 Hz), ist die Reserve **unbekannt**.
- **macOS drosselt verdeckte Fenster auf etwa 10 Hz** (andere Space, Vollbild-App im Vordergrund). Ein Median um 100 ms bedeutet also „Fenster nicht sichtbar“ und ist kein Messwert. Die App holt sich zwar nach vorn, schützt sich aber nicht gegen einen späteren Wechsel. `NSWindow.occlusionState` war als Anzeige dafür unzuverlässig.
- **`--durchsatz=1`:** Dieselbe Szene läuft mit `RealityRenderer` in eine Textur, Bild für Bild nacheinander (warten auf `onComplete`), ohne vsync und unabhängig vom Fenster. Die Bildzeit ist CPU plus GPU ohne Überlappung, also eine obere Schranke. `ARView.__frameTime()` und `__getStatisticsStringForSingleOption(.frameTimeStatistics)` liefern unter macOS nur Nullen. **GPU-Zeit je Bild** liefert der Metal-Performance-HUD: auf Geräten mit `xcrun devicectl device process launch … --environment-variables '{"MTL_HUD_ENABLED":"1","MTL_HUD_LOG_ENABLED":"1"}' --console …` schreibt er je Sekunde eine Zeile `metal-HUD: n, Speicher, Speicher, Bildabstand, GPU-Zeit, Bildabstand, GPU-Zeit, …` (Paare in ms). Für mehr Tiefe bleibt Instruments (Metal System Trace).
- **Mehrere Argumente in zsh:** Eine Variable mit `--a=1 --b=2` kommt ohne `${=var}` als **ein** Argument an (`Parameter:`-Zeile prüfen).
- **Nicht steuerbar:** Größe der Schattenkarte, MSAA in der ARView, und die Zahl der Kaskaden vor Version 27.
- **Kaskaden nur mit Xcode 27:** `shadow.cascades` gibt es erst in den SDKs 27. Der Code steht deshalb hinter `#if compiler(>=6.4)` (Swift 6.4 kommt mit Xcode 27). Mit Xcode 26.x, etwa auf dem CI-Runner `macos-26`, entsteht ein Build ohne Kaskaden. Messungen deshalb mit Xcode 27 bauen (CHAOS-130).
- **Simulatorwerte sind keine Messungen,** nur Funktionsproben. Der Simulator rendert über die Mac-GPU und taktet mit 60 Hz.

### Ergebnisse (16.11.2026, MacBook Pro M3 Max, Mac15,9, 120-Hz-Display)

Während der Messungen lief GeForce NOW im Hintergrund. Die Werte sind deshalb nur Anhaltspunkte, eine saubere Wiederholung steht aus.

| Pfad | Auflösung | gras | Schatten | MSAA | Median | p95 | fps (Mittel) |
|---|---|---|---|---|---|---|---|
| ARView (vsync) | 1920×1080 | 1 | an | auto | 8,30 ms | 17,0 ms | 115,8 |
| Offscreen | 1920×1080 | 1 | an | 4× | 16,8–21,3 ms | 23,0–39,9 ms | 41–54 |
| Offscreen | 1920×1080 | 0,25 | an | 4× | 15,6 ms | 31,7 ms | 56,2 |
| Offscreen | 1920×1080 | 1 | aus | 4× | 13,6 ms | 20,1 ms | 70,3 |
| Offscreen | 1920×1080 | 1 | an | aus | 15,4 ms | 24,4 ms | 59,8 |

Die ARView hält bei voller Szene 120 Hz im Median, das p95 zeigt aber einzelne verpasste Bilder. Die Reserve über 120 Hz bleibt unbekannt; das Ergebnis ist also nur eine Untergrenze. Dieser Lauf war der einzige mit sichtbarem Fenster und entstand, bevor Himmelskuppeln und Dunst ausgeblendet wurden. Beide liegen hinter `far`, der Unterschied sollte also klein sein. Weitere ARView-Läufe am Mac waren durch die Fensterdrosselung unbrauchbar (Median ≈ 103 ms) und fehlen in der Tabelle.

Offscreen kostet ein Bild nacheinander gemessen 14–21 ms. Der Grundwert streut zwischen den Läufen schon um 16,8–21,3 ms, jede Variante wurde nur einmal gemessen. Über dieses Rauschen hinaus zeigt nur „Schatten aus“ einen Unterschied; Grasanteil und MSAA lassen sich davon nicht trennen. Die Offscreen-Werte sind **nicht mit Bevys Bildabstand bei `vsync=0` vergleichbar**: Bevy überlappt die Bilder (Pipelining), diese Schleife wartet jedes Bild ab. Mit Bevy vergleichbar ist nur der ARView-Wert.

**Mac ohne Störung (17.11.2026, M3 Max, 4K-Monitor mit 60 Hz):** ARView 1080p 60 fps (Deckel), GPU je Bild 6,3 ms (p95 9,4); ARView 4K 60 fps, GPU 7,3 ms (p95 13,1); offscreen 1080p 16,6 ms, 4K 49,6 ms. Der Metal-HUD liefert die GPU-Zeit auch unter macOS (`open --env …`).

**Echte Apple TV 4K (3. Generation, A15), 17.11.2026, Ausgabe 3840×2160 bei 60 Hz, volle Szene:**

| Pfad | Auflösung | Median | p95 | fps | GPU je Bild (Metal-HUD) |
|---|---|---|---|---|---|
| ARView | 3840×2160 | 51,1 ms | 59,4 ms | 20,0 | 34,7 ms |
| ARView `--gras=0` | 3840×2160 | – | – | 20,0 | 34,8 ms |
| ARView `--schatten=0` | 3840×2160 | – | – | 20,0 | 34,7 ms |
| offscreen, MSAA 4× | 3840×2160 | 117,3 ms | 137,2 ms | 8,4 | – |
| offscreen, MSAA 4× | 1920×1080 | 41,9 ms | 50,2 ms | 23,9 | – |
| offscreen, MSAA aus | 1920×1080 | 34,3 ms | 84,0 ms | 22,7 | – |
| offscreen, MSAA 4× | 1280×720 | 33,2 ms | 33,8 ms | 30,3 | – |

Die ARView zeigt 20 fps, weil 34,7 ms GPU-Zeit knapp über 33,3 ms liegen (vsync rastet auf 60/3 ein). Gras und Schatten ändern nichts, die Auflösung sehr viel (offscreen 4K ≈ 2,8× 1080p): Die Apple TV ist bei 4K **pixelgebunden**. Ruben bleibt bei 4K-Ausgabe (17.11.); ein Host muss also bei 4K-Ausgabe flüssig sein, etwa durch geringere interne Auflösung mit Hochskalierung. `contentScaleFactor` an der ARView zu senken hatte keine messbare Wirkung und ist wieder entfernt.

**Echtes iPhone 16 Pro** (nur Benchmark, kein Host), 2622×1206, volle Szene: Median 16,68 ms, p95 17,4 ms, max 20,6 ms, 60,0 fps. Die ARView bleibt bei 60 Hz, auch mit `--bildrate=120` und `CADisableMinimumFrameDurationOnPhone` (getestet, wieder entfernt).

Funktionsproben im Simulator (keine Messungen): iPhone 17 Pro (Querformat), iPad (A16) mit 2360×1640 und tvOS (Apple TV 4K, 3. Generation) mit 3840×2160 laufen beide mit voller Szene und 64 246 Instanzen bei 60 Hz.

Bilder: [`docs/screenshots/chaos78-realitykit-macos.jpg`](../../docs/screenshots/chaos78-realitykit-macos.jpg) (ARView-Schnappschuss ohne HUD), [`…-ipad-sim.jpg`](../../docs/screenshots/chaos78-realitykit-ipad-sim.jpg), [`…-iphone-sim.jpg`](../../docs/screenshots/chaos78-realitykit-iphone-sim.jpg), [`…-tvos-sim.jpg`](../../docs/screenshots/chaos78-realitykit-tvos-sim.jpg).

### Hochskalierter Pfad und Profilierung (CHAOS-114)

**Warum:** Die Apple TV 4K ist bei 4K-Ausgabe pixelgebunden (ARView: 34,7 ms GPU je Bild, 20 fps). Ruben bleibt bei 4K-Ausgabe, also muss die Szene intern kleiner rendern und auf 4K hochskaliert werden. Die ARView bietet dafür keinen Schalter (`contentScaleFactor` wirkte nicht).

**Wie (`--hochskalieren=1`, `Upscaled.swift`):**

- Eine `MetalLayerView` mit `CAMetalLayer` in voller Bildpunktgröße (Apple TV: 3840×2160, `nativeScale` 2).
- Ein `CADisplayLink` taktet die Schleife. Je Takt übergibt sie ein Bild an `RealityRenderer.updateAndRender` (interne Auflösung, `bgra8Unorm_srgb`, eigene Textur je Platz), sofern einer von `--imflug` Plätzen frei ist. Sonst zählt sie einen ausgelassenen Takt.
- In `onComplete` (beliebiger Thread) skaliert der `Presenter` hoch: per **MetalFX Spatial** direkt in den Drawable, oder über eine Zwischentextur, wenn der Drawable die nötige Nutzung nicht hat. Alternativ zeichnet ein **bilinearer** Vollbild-Shader. Danach präsentiert er den Drawable.
- MetalFX **Temporal** ist nicht eingebaut: Es braucht Tiefe und Bewegungsvektoren, `RealityRenderer.CameraOutput` liefert nur Farbe.
- Gemessen werden die Abstände der wirklich angezeigten Bilder (`MTLDrawable.presentedTime`), nicht die Takte. `SPIKE-ERGEBNIS` (`"spike":"CHAOS-114"`) enthält zusätzlich `intern`, `skalierer`, `imflug`, die GPU-Zeit des Hochskalierens (`hochskalieren_gpu_ms_*`), die Zeit von der Übergabe bis zum fertigen Bild (`uebergabe_bis_fertig_ms_*`), `ausgelassene_takte`, `nicht_angezeigt` und die OS-Version (`os`). Die GPU-Zeit **je Bild insgesamt** (RealityKit + Hochskalieren) zeigt der Metal-HUD.
- `--bild=…` speichert das hochskalierte Bild in voller Auflösung, zum Vergleich der Schärfe gegen die ARView.

**Messreihe auf der Apple TV** (nach Bauen und Installieren wie oben, Release):

```bash
cd spikes/renderer-realitykit
./messreihe-atv.sh <GERÄTE-ID> 20
```

Das Skript startet alle Varianten nacheinander mit Metal-HUD (ARView als Bezug, interne Auflösungen 0,5/0,667, MetalFX gegen bilinear, MSAA, Bilder im Flug, dazu Diagnose bei nativer 4K-Auflösung: MSAA, Tonemapping, IBL, einfache bzw. unbeleuchtete Materialien und alles aus). Es schreibt je Variante ein Log und `zusammenfassung.tsv` mit Anzeige-fps, Median/p95 und GPU je Bild aus dem HUD. Einzelne Varianten: Namen anhängen, z. B. `./messreihe-atv.sh <ID> 20 arview hoch-0.5-metalfx`. Logs nachträglich auswerten: `./messreihe-atv.sh --auswerten <ordner>`. Eine Runde mit allen 15 Varianten dauert bei 20 s etwa 10 Minuten.

**Instruments (Metal System Trace),** um zu sehen, welche RealityKit-Durchgänge die Zeit kosten:

```bash
xcrun xctrace record --template 'Metal System Trace' --device <GERÄTE-ID> --time-limit 15s --output atv-4k.trace --launch -- build/Build/Products/Release-appletvos/ChaosRenderSpike.app --sekunden=12
open atv-4k.trace
```

Startet `xctrace` die App so nicht, geht es auch in der Instruments-App: Apple TV als Ziel, Vorlage „Metal System Trace“, App wählen, Argumente eintragen, aufnehmen. Zu prüfen sind die GPU-Spur und die Encoder-Namen von RealityKit: Schatten, Hauptdurchgang, MSAA-Auflösung, Tonemapping und Nachbearbeitung, jeweils mit Dauer. Dazu Vertex- gegen Fragmentzeit und, wenn angeboten, die GPU-Zähler (Begrenzer: ALU, Texturabtastung, Bandbreite). Je eine Aufnahme mit ARView und mit `--hochskalieren=1 --skala=1` genügt.

**Erwartung (Hypothese, nicht gemessen):** Bei 0,5 fallen die Pixelkosten auf etwa ein Viertel. Ist die ARView wirklich pixelgebunden, liegt die Szene dann deutlich unter 16,7 ms, plus etwa 1–2 ms für MetalFX bei 4K. Die Offscreen-Werte von CHAOS-78 sprechen nicht dagegen: 720p seriell 33 ms entspricht genau zwei Bildwechseln. Vermutlich wartete jede serielle Runde auf den Takt der Anzeige; erst die überlappende Schleife zeigt die echte Reserve.

**Bekannte Risiken (ungeprüft, kein Mac im Container beim Schreiben):**

- Der Code ist **gebaut, aber nie gelaufen:** Die CI (Xcode 26.6) übersetzt ihn für macOS, iOS und tvOS. Ob die Schleife ein Bild zeigt, ist ungeprüft; zuerst `--hochskalieren=1` am Mac starten (RK8).
- MetalFX gibt es auf tvOS erst ab **27.2**, und nur, wenn das tvOS-SDK von Xcode es enthält (`#if canImport(MetalFX)`). Sonst fällt der Pfad still auf bilinear zurück; `SPIKE-ERGEBNIS` nennt den tatsächlichen `skalierer`. Weil `RealityRenderer` auf tvOS ab 26.0 läuft, MetalFX aber erst ab 27.2, sollte der Linker MetalFX schwach einbinden. Startet die App auf tvOS < 27.2 nicht, fehlt `-weak_framework MetalFX`.
- Ob `RealityRenderer` mehrere Bilder gleichzeitig verträgt (`--imflug=2/3`), ist unbekannt. Bei Fehlern oder Bildfehlern `--imflug=1` vergleichen.
- MetalFX bekommt `bgra8Unorm_srgb` mit `colorProcessingMode = .linear`. Wirkt das Bild zu hell oder zu dunkel, `.perceptual` probieren.
- `--ibl=0` setzt nur keine Lichtressource. Ob RealityKit dann wirklich ohne IBL rendert oder ein Standardlicht nimmt, ist offen.

### Unterschiede zu Babylon/Bevy

- Kein HDRI-Himmel, kein SSAO, keine Tiefenschärfe, keine Postprocessing-Kette. RealityKit bietet hier nur sein eigenes Tonemapping.
- Licht nach Augenmaß abgeglichen (`sonne`, `himmel`). Das Bild ist etwas heller und kräftiger als bei Bevy.
- Figuren und Gras verlieren beim USDZ-Export Rauheit, Clearcoat und Leuchten (Vertexfarben ohne Material, siehe „Assets“).
- Wasser, Laternen und die Lichtstimmungen aus `apps/host` fehlen, wie bei Bevy.
- Auf dem iPad läuft die App nur im Querformat. Hochkant zeigt iPadOS 26 sie als verkleinertes Querformat mit schwarzen Rändern; das iPad-Bild ist auf den App-Inhalt zugeschnitten.

### Bekannte Probleme

- **tvOS-27-Simulator:** Mit einer expliziten `bounds`-Hülle an `MeshInstancesComponent` stürzt RealityKit ab (`bad_variant_access` in `re::OcclusionCullingQueryNode::addOcclusionQueryDrawCalls`). Ohne Hülle läuft es, RealityKit berechnet sie dann selbst. Ob das auf echter Hardware auch passiert, ist ungeprüft.
- Die App nutzt undokumentierte `ARView.__…`-APIs (nur `--bildrate`).

### Host-Verbindung (optional, `--server=…`)

`HostClient.swift` (`URLSessionWebSocketTask`) meldet sich wie der Babylon-Host mit `host-hello` (Protokoll v4), schickt alle 2 s einen Herzschlag, liest `board`-Nachrichten und setzt die Figuren je Slot auf die Koordinaten ihres `spaceId`. Steht die Szene und hat der Server mit `lobby` oder `board` geantwortet, schickt die App einmal je Verbindung `host-ready` (CHAOS-121): Nach einem Neustart mitten in der Partie setzt der Server die Auto-Pause dann sofort fort statt erst nach 30 s (CHAOS-68, ADR-015 Nachtrag 3). Kommt `board` vor den Figuren an, setzt die App sie nach, bevor sie `host-ready` meldet. Gegen einen lokalen Server (`PORT=8799 HOST=127.0.0.1 npx tsx src/main.ts` in `apps/server`) ist das Handshake geprüft: die App bekommt `lobby`. Nicht geprüft ist das Bewegen der Figuren: Dafür bräuchte es eine laufende Partie mit beigetretenen Controllern und `start`. Was für einen echten Host fehlt:

- **Feldkoordinaten:** Sie sind aus `packages/game-core/src/board/wackelwald.ts` kopiert (nur dieses Brett). Für mehr Bretter müssten sie aus dem Export kommen.
- **Lauf-Animation, Kamera, HUD und Ereignisse:** keine Animation zwischen Feldern, keine Kamerafahrten, kein HUD, keine Auswertung von `events`.
- Kein `start`, kein `minigame-result`, keine Minispiele, kein QR-Code und keine Wiederverbindung. Figuren werden nach Slot bewegt, ohne dass ihr Charakter zur Figur passen muss.

## Assets

Die Testszene des Bevy-Spikes (glTF) wird mit Blender als Python-Modul (`bpy==5.3.0`, wie `packages/assets/blender`) nach USDZ umgewandelt. Ein Befehl im Repo-Wurzelverzeichnis:

```bash
node scripts/spike-export-board.mjs              # falls spikes/renderer-bevy/assets/export/ fehlt
spikes/renderer-realitykit/convert/convert.sh    # legt .venv-blender (Python 3.13 per uv) an, wandelt um, prüft
```

`convert.sh` ruft je Datei `convert/glb_to_usdz.py` auf, kopiert die beiden JSON-Dateien unverändert, lässt `xcrun usdchecker` laufen und lädt am Ende alles mit RealityKit (`swift convert/check.swift <ausgabeordner>`; Exit-Code 1 bei Fehlern). bpy braucht Python 3.13, das System-`python3` ist neuer, daher `uv venv --python 3.13`. Dauer etwa 40 s.

Ausgabe in `assets/export/` (erzeugt, nicht eingecheckt):

| Datei | Größe | Inhalt |
|---|---|---|
| `brett.usdz` | 25,6 MB | Kulisse, 273 Entitäten, 23 Texturen (PNG) eingebettet |
| `figuren/robot.usdz` | 0,48 MB | Figur mit Idle-Animation (starre Teile an Knochen, ohne Skelett) |
| `figuren/cactus.usdz` | 0,51 MB | Figur mit Skelett und Idle-Animation |
| `figuren/raccoon.usdz` | 0,84 MB | Figur mit Skelett und Idle-Animation |
| `figuren/sock.usdz` | 0,23 MB | Figur mit Skelett und Idle-Animation |
| `brett.szene.json` | 2 KB | unverändert: Kamera, Sonne, Himmel, Figurenorte |
| `brett.instanzen.json` | 15,9 MB | unverändert: Instanzmatrizen (spaltenweise, Welt, rechtshändig Y-up) |

### Koordinaten

glTF und RealityKit sind beide rechtshändig mit Y oben, in Metern. Die x-Spiegelung von Babylon (linkshändig) hat schon der Export erledigt; GLB und JSON passen zueinander. **Weltkoordinaten aus beiden JSON-Dateien gelten unverändert**, wenn `brett.usdz` mit Identitäts-Transform in die Szene kommt. Geprüft: Die `wiese` hat in RealityKit dieselben Welt-Bounds wie im glTF, und ein Testbild aus der Szenenkamera zeigt Schilder lesbar (nicht gespiegelt).

Blender legt die Rückdrehung als `rotateX(-90°)` auf die Wurzel `/root`; die Meshdaten darunter bleiben lokal Z-up. Für die Figuren spielt das keine Rolle (ganze Entität laden, an `position` setzen, zur Kamera drehen).

### Instanzen (Gras, Blumen)

Die Grundmeshes liegen als benannte Prims in `brett.usdz`. USD erlaubt kein `-` in Namen, also gilt: **JSON-Name mit `-` → `_`**, also `gras-0` → `gras_0`, `blume-stiel` → `blume_stiel` usw. für alle 8 Gruppen. `findEntity(named: "gras_0")` liefert die Xform-Entität; das `ModelComponent` hängt am ersten Kind (`Mesh_95` usw.).

Weil die Meshdaten lokal Z-up sind, gilt für jede Instanz (Kind von `brett`, egal wo das Brett steht):

```swift
let base = brett.findEntity(named: "gras_0")!.children.first!   // trägt ModelComponent
let w = base.transformMatrix(relativeTo: brett)                   // ≈ rotateX(-90°)
instanz.setTransformMatrix(M_json * w, relativeTo: brett)         // M_json: 16 Floats spaltenweise
```

Das Grundmesh selbst bleibt sichtbar am Ursprung und muss versteckt werden (wie in Bevy). Es sind 64 246 Instanzen bei voller Grasdichte (`gras` 25 761 + 15 648 + 22 591, Blumen 246).

### Was gegenüber dem GLB verloren geht oder anders ist

- **Vertexfarben:** RealityKit ignoriert `UsdPrimvarReader` im Material (die Basisfarbe wird grau 0,18) und auch `primvars:displayColor`, sobald ein Material gebunden ist. Darum wird bei Meshes mit Vertexfarbe (alle Figuren-Teile außer Akzent-Teilen, `gras_0…2`) der Materialfaktor in die Vertexfarbe multipliziert und das Material entfernt. RealityKit zeigt sie dann mit seinem Standardmaterial. Farben stimmen (Testbilder aller vier Figuren mit RealityRenderer geprüft), aber Rauheit, Clearcoat, Sheen und Leuchten dieser Teile fallen weg. Die Gesichter der Figuren leuchten also nicht.
- **Doppelseitig:** Ohne Material fehlt `doubleSided`. Die App sollte für `gras_*` `faceCulling = .none` setzen (im glTF doppelseitig).
- **Material-Erweiterungen:** `KHR_materials_sheen` hat kein UsdPreviewSurface-Gegenstück. Clearcoat wird übertragen, `emissive_strength` vermutlich begrenzt. 7 Materialien mit Alpha-Blending (Wegweiser, „Am Zug“-Pfeil, zwei Natur-Materialien) sollte man in der App ansehen.
- **Texturwiederholung:** Das GLB nutzt kein `KHR_texture_transform`, es geht also nichts verloren. Kacheln, die Babylon nicht exportiert hat, fehlen schon in Bevy.
- **Himmel:** `himmel_*` (2 Kuppeln) und `dunst` sind im Babylon-Export spiegelnde Kugeln (metallisch, glatt) ohne Himmelstextur und erscheinen schwarz. Am besten versteckt die App sie und nutzt `clearColor` aus `brett.szene.json`. Deshalb sind die Gesamt-Bounds des Bretts ±250.
- **Animation:** Pro Figur wird nur der Clip `idle` exportiert (2,38 s, 24 fps). An der Wurzel liegt `availableAnimations[0]` („global scene animation“), abspielbar mit `.repeat()`. Andere Clips (`run`, `jump` …) fehlen.
- **Kamera und Licht** sind nicht in den USDZ; sie stehen in `brett.szene.json`.

### Lizenzen

Szene, Figuren und Texturen stammen aus dem Repo (eigene Modelle, CC0-Texturen von Poly Haven). Blender/bpy (GPL) ist nur Werkzeug für die Umwandlung und wird nicht ausgeliefert.
