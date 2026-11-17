# ADR-016: Renderer – bei Babylon.js bleiben, WebGPU als Option messen, tvOS getrennt entscheiden

**Status:** Angenommen (Ruben, 2026-11-17: „Annehmen, PC folgt“). Die PC-Zeilen R1–R6 entfallen: Ruben hat keinen PC zum Messen (2026-11-17, CHAOS-131: „es wird nur mac geben“). Die Entscheidung stützt sich auf die Mac-Messung.
**Datum:** 2026-11-16 (Entwurf), 2026-11-17 (angenommen)
**Aufgabe:** CHAOS-75 (Spike), Folge für CHAOS-74 (Apple TV)
**Betroffene Annahmen:** ADR-001 (Stack), ADR-004 (Host-Szene), ADR-012 (Minispiel-Logik im Host), ADR-014 (Natur-Look)

## Kontext

Nach dem M4-Test fand Ruben die Grafik zu langsam und nannte als Alternativen „WebAssembly und native App mit GPU-Use“; außerdem will er „demnächst auf tvOS spielen“. CHAOS-73 hat den Engpass inzwischen gefunden und behoben: Die weichen Kontaktschatten (PCSS, Filter `HIGH`) kosteten ≈ 23 ms je Bild, sogar auf einer M3 Max. Seitdem rendert das Brett dort in 5,5 ms (1080p) bzw. 8,7 ms (4K) ([EXP-014](../experiments.md), [`performance.md` §3b](../performance.md)). **Gemessen war: Der Flaschenhals war ein GPU-Effekt, nicht WebGL oder JavaScript.** Rubens eigener PC ist noch ungemessen.

Ein Rendererwechsel wäre laut `CLAUDE.md` ein großer Architekturwechsel (Spike, Vergleichsdaten, Rubens Freigabe). Dieser Spike liefert Prototypen mit derselben Testszene und den Messbogen. Die Zahlen auf echter Hardware fehlen noch; die Cloud-Umgebung hat keine Grafikkarte.

### Was der Host heute rendert

Brett (Natur-Look, Figuren, Popups, Regie), drei Minispiele mit Havok-Physik (ADR-012: Spiellogik läuft **im Host**), Minispiel-Vorschau, Arena (M1), Finale mit 3D-Podest; dazu React-Overlays (HUD, Lobby, Finale). Server (Node), Protokoll und Controller (React im iPhone-Browser) sind vom Renderer unabhängig; game-core läuft im Server.

### Prototypen (dieselbe Testszene)

| Kandidat | Prototyp | Stand in der Cloud |
|---|---|---|
| 1 Babylon + WebGPU | `?gpu=webgpu` am echten Brett (`scene/engineFactory.ts`), WebGL2-Rückfall | gebaut, Unit-Tests grün; WebGPU-Engine startet, Rendern scheitert nur an der Software-GPU (Gerät geht verloren – auch im Rohtest ohne Spielcode) |
| 2 Bevy (Rust) → WebAssembly | `spikes/renderer-bevy`, Kulisse aus dem echten Brett exportiert (GLB), Instanzen, Figuren mit Idle | gebaut (WebGPU und WebGL2); WebGL2 rendert dieselbe Szene im Headless-Chromium ([Bild](../screenshots/chaos75-bevy-webgl2-swiftshader.jpg)); 35 MB Programm (≈ 8 MB gzip) |
| 3 Bevy nativ | dasselbe Programm nativ (Metal/DX12/Vulkan) | gebaut; in der Cloud kein Fenster/Bild möglich |
| 3 Swift/RealityKit | `spikes/renderer-realitykit` (CHAOS-78, 16.11.): macOS, tvOS, iPhone/iPad nur als Benchmark; USDZ aus dem Brett-Export, GPU-Instancing | läuft nativ am Mac und im tvOS-/iPad-Simulator; vorläufige Mac-Werte in EXP-017, echte Apple TV offen |
| 3 Unity, Godot | kein Prototyp | Recherche (unten) |

### Recherche-Stand (16.11.2026, Quellen in EXP-015)

- **tvOS hat keinen Browser und kein öffentliches WKWebView.** Der Babylon-Host läuft dort nicht, auch nicht mit WebGPU. **JavaScriptCore** gibt es auf tvOS (seit tvOS 9).
- **RealityKit** gibt es seit **tvOS 26** (PBR, Schatten der Richtungslichter, Skelett-Posen, Partikel, Physik, eigene Shader). Assets müssen USD/USDZ sein; SceneKit ist nur noch in Wartung. Läuft nicht auf Windows.
- **Bevy 0.20.1** (28.10.2026): tvOS noch nicht unterstützt (Issue #13058 offen, winit 0.30 ohne tvOS; winit 0.31 noch Beta). Rust-Ziele `aarch64-apple-tvos(-sim)` sind seit Rust 1.95 Tier 2. WebGPU im Browser nennt Bevy „experimentell“. Die API ändert sich mit jeder Version deutlich (im Spike z. B. `SceneRoot` → `WorldAssetRoot`, `shadows_enabled` → `shadow_maps_enabled`, `FontSize`).
- **Unity 6:** tvOS-Export offiziell; Personal kostenlos bis 200 000 $ Umsatz, Splash optional (Stand 2024, für 2026 nicht verifiziert). Editor-zentriert, C#.
- **Godot 4.x:** kein offizieller tvOS-Export (Entwurfs-PR #118332 offen); Web nur WebGL2.
- **Babylon Native:** kein tvOS, „public preview“.
- **Babylon.js 9 mit WebGPU:** Umsetzung laut Doku vollständig; alle Kern-Shader liegen als WGSL vor, glslang/twgsl lädt die Engine nur für GLSL-Shader nach (im Spiel-Pfad keine; im Spike kein CDN-Aufruf beobachtet). WebGPU ist seit Safari 26 (macOS/iOS 26) und in Chrome/Edge an.

## Entscheidung

1. **Am PC bleibt Babylon.js der Renderer.** Kein Wechsel zu Bevy, Unity oder Godot für den PC-Host, solange Rubens Messung (R1/R7) nicht zeigt, dass Babylon nach CHAOS-73 auf seiner Hardware das Ziel (Brett p95 ≤ 20 ms bei 1080p) verfehlt **und** ein Kandidat es bei gleichem Bild erreicht.
2. **WebGPU wird eine Option, keine Pflicht.** Zeigen R1/R2 bzw. R7/R8 einen Vorteil ≥ 20 % im Bildabstand, wird der asynchrone Engine-Start auf die übrigen vier Szenen (Minispiel-Bühne, Vorschau, Arena, Podest) ausgeweitet und WebGPU mit WebGL2-Rückfall Standard. Ohne Vorteil bleibt `?gpu=webgpu` ein Mess-Schalter.
3. **tvOS (CHAOS-74) wird getrennt als Produktfrage entschieden.** Eine Apple TV als Host ändert die Säule „PC-only game hosting“ und braucht in jedem Fall einen **zweiten, nativen Host**. Empfohlener Weg, falls Ruben tvOS freigibt: eigener Spike „RealityKit-Host auf tvOS 26“ mit derselben Testszene (USDZ) und der Frage, wo der Server läuft (Abschnitt „tvOS“). Bevy erst wieder prüfen, wenn Bevy/winit tvOS offiziell unterstützen.

## Betrachtete Alternativen

| Alternative | Aufwand (grob) | Nutzen | Warum (noch) nicht |
|---|---|---|---|
| **A Babylon + WebGPU** | klein: asynchroner Start an 5 Stellen; Tests laufen weiter mit WebGL2 | weniger CPU-Last je Draw Call (330–440 je Bild), später Render-Bundles/Snapshot-Rendering | Nutzen auf Rubens PC unbelegt (R1/R2); GPU-Effekte (Schatten, Tiefenunschärfe) kosten in beiden APIs gleich viel; in CI nicht renderbar (Software-GPU verliert das Gerät) |
| **B Bevy → WebAssembly** | sehr groß: Host-Rendering komplett in Rust neu (Brett, Regie, 3 Minispiele, Podest, Effekte); Minispiel-Logik und Havok-Physik müssten nach Rust (Rapier/Avian) oder per JS-Brücke angebunden werden | gemeinsamer Code mit einer späteren nativen Fassung | WebGPU im Browser experimentell; Ladegröße; API-Brüche je Version; Physik-Verhalten der Minispiele ändert sich; kein tvOS |
| **C1 Bevy nativ** | wie B, plus Packaging/Signieren je Plattform, Server-Start aus der App | nativer GPU-Zugriff am PC/Mac | tvOS fehlt (winit/Bevy); Wechsel bricht den „Browser zuerst“-Ansatz (ADR-001) |
| **C2 Swift/RealityKit** | groß: zweiter Host nur für Apple-Geräte; Figuren/Kulisse nach USDZ; Minispiel-Logik in Swift oder TypeScript in JavaScriptCore | einziger Kandidat mit offiziellem tvOS-Renderer und Apple-Werkzeugen | läuft nicht am Windows-PC → zwei Renderer dauerhaft; Ruben braucht Xcode/Apple-Developer-Konto für das Gerät |
| **C3 Unity 6** | sehr groß: alles in C# neu, Editor-Workflow | PC, Mac **und** tvOS aus einem Projekt | Editor- statt Code-first (schlecht automatisierbar, ADR-001), Lizenzbedingungen für 2026 unverifiziert, Havok/Babylon-Code wertlos |
| **C4 Godot** | sehr groß | Open Source | kein offizieller tvOS-Export; Web ohne WebGPU |
| **C5 Babylon Native** | mittel | gleicher JS-Code | kein tvOS, Vorschau-Status |

## Was in jedem Fall bleibt – und was bricht

| Teil | A (WebGPU) | B/C1 (Bevy) | C2/C3 (tvOS nativ) |
|---|---|---|---|
| `game-core` (Regeln im Server) | bleibt | bleibt (Server bleibt Node) | bleibt, **solange der Server auf PC/Mac/Raspberry Pi läuft**; ein Server *auf* der Apple TV bräuchte TypeScript in JavaScriptCore plus nativen WebSocket-/HTTP-Server (Network.framework) oder eine Portierung – **Bruch, ausdrücklich benannt** |
| Protokoll (`packages/protocol`) | bleibt | bleibt; Host-Seite der Nachrichten in Rust neu (Validierung doppelt) | bleibt; Host-Seite in Swift/C# neu |
| Controller (iPhone/iPad-Browser) | bleibt | bleibt | bleibt; ausgeliefert vom Server (PC/Pi) bzw. von der App |
| Minispiel-Logik (`packages/minigames`, ADR-012) | bleibt | **bricht**: Logik + Havok in Rust neu oder JS-Brücke | **bricht**: in Swift/C# neu oder in JavaScriptCore ohne Havok |
| Host-Rendering (`apps/host`) | bleibt, kleine Änderung | **neu** | **neu, zusätzlich** zum PC-Host |

## tvOS: Wo läuft der Server?

1. **PC/Mac bleibt Server, Apple TV ist nur Anzeige** (kleinster Bruch): Die tvOS-App verbindet sich wie der Browser-Host per WebSocket (`/ws`, Rolle Host). Controller und `game-core` bleiben unverändert. Nachteil: Es braucht weiter einen laufenden Rechner.
2. **Kleiner Server im LAN** (z. B. Raspberry Pi mit Node): wie 1, ohne PC.
3. **Alles auf der Apple TV:** Server-Logik in JavaScriptCore oder in Swift portiert, HTTP-/WebSocket-Server in der App für die Controller-Seiten. Größter Aufwand; App-Store-Regeln für lokale Server prüfen.

Vorschlag für einen tvOS-Spike: Variante 1, weil sie Protokoll, Server und Controller unverändert lässt.

## Konsequenzen

**Positiv**
- Kein Umbau ohne belegten Nutzen; die Arbeit aus M1–M4 (Regie, Minispiele, Havok, Tests) bleibt.
- WebGPU lässt sich mit einem URL-Schalter auf echter Hardware vergleichen; der Rückfall auf WebGL2 hält den Host lauffähig.
- Der Bevy-Prototyp bleibt als Messlatte: Er zeigt, was ein nativer Renderer mit derselben Szene auf Rubens Hardware schafft.

**Negativ / Risiken**
- Es gibt keine PC-Messung (R1–R6 entfallen, CHAOS-131). Die Empfehlung stützt sich auf die Mac-Messung vom 17.11. (EXP-015). Wie Babylon auf einem Windows-PC mit anderer Grafikkarte läuft, bleibt ungemessen:
  - Babylon WebGL2 kommt auf 8,4 / 11,2 ms bei 1080p.
  - Bevy nativ kommt offscreen auf 3,8 / 4,8 ms, ohne Nachbearbeitung.
  - Bevy WebAssembly mit WebGPU kommt auf 12,8 / 13,6 ms.
  - RealityKit kommt auf 6,3 ms GPU-Zeit.
- Babylon mit WebGPU (R8) ist nicht messbar, weil das Brett mit WebGPU kein Bild zeichnet. Der Fehler steht in EXP-015.
- WebGPU ist in CI nicht renderbar (Software-GPU); E2E-Tests bleiben auf WebGL2. Ein WebGPU-Standard bräuchte Gerätetests auf echter Hardware.
- tvOS bleibt ohne zweiten Host unerreichbar; jeder tvOS-Weg kostet einen eigenen Renderer.
- Der Bevy-Prototyp ist nicht bildgleich (kein HDRI-Licht, keine Nachbearbeitung, statische Bäume); Bevy-Zahlen sind eher zu günstig.

## Freigabe

Ruben hat am 2026-11-17 im Chat entschieden: **„Annehmen, PC folgt“.** Die Entscheidungen 1–3 gelten damit. Grundlage sind die Mac-Messungen R7–R11 vom 17.11. (EXP-015) und die Apple-TV-Messung R12 aus CHAOS-78 (EXP-017). Die Frage nach dem tvOS-Spike hatte Ruben schon am 16.11. mit „ja“ beantwortet, dafür gibt es CHAOS-78.

Was damit feststeht:
- Kein Rendererwechsel am PC. `apps/host` bleibt bei Babylon.js mit WebGL2.
- `?gpu=webgpu` bleibt ein Mess-Schalter und wird nicht auf die übrigen vier Szenen ausgeweitet. Mit WebGPU zeichnet das Brett noch kein Bild (CHAOS-117).
- Die Bevy-Prototypen (`spikes/renderer-bevy`) bleiben als Messlatte im Repo und werden nicht weiterentwickelt.
- tvOS läuft getrennt über CHAOS-78 (RealityKit, Server auf PC/Mac). CHAOS-74 wartet darauf.

## Überprüfung

- **CHAOS-131 (verworfen, 2026-11-17):** Die PC-Messung R1–R6 entfällt, weil Ruben keinen PC zum Messen hat („es wird nur mac geben“). Damit bleibt als Auslöser für eine neue Entscheidung:
  - Babylon mit WebGL2 verfehlt auf einem Host-Rechner, auf dem gespielt wird, das Ziel (Brett p95 > 20 ms bei 1080p) und ein Kandidat erreicht es bei gleichem Bild.
  - WebGPU zeigt nach CHAOS-117 am Mac einen Vorteil von mindestens 20 % (R7/R8).
- Für den tvOS-Host (CHAOS-74 nach CHAOS-78) gibt es ein eigenes ADR.
- Wenn Bevy/winit tvOS offiziell unterstützen oder Babylon Native tvOS bekommt: Kandidaten neu bewerten.
