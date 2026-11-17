# ADR-019: Nativer Apple-Host mit RealityKit für Mac und Apple TV, Babylon bleibt am PC

**Status:** Vorgeschlagen (Entwurf; Rubens Richtungsentscheidungen vom 17.11. eingearbeitet, offene Fragen unten)
**Datum:** 2026-11-17
**Aufgabe:** CHAOS-135, Folge für CHAOS-74 (Apple TV), CHAOS-118 (Mac-App), CHAOS-114 (4K-Leistung)
**Betroffene Annahmen:** ADR-001 (Stack), ADR-004 (Host-Szene), ADR-005 (Session-Server), ADR-012 (Minispiel-Logik im Host), ADR-016 (Renderer)

## Kontext

Bisher läuft das Spiel nur auf einem PC: Session-Server (Node) und Host (Babylon.js im Browser) auf demselben Rechner, iPhones und iPads sind Controller. ADR-016 hat entschieden, dass am PC Babylon bleibt, und die Apple TV als eigene Produktfrage abgetrennt.

Ruben hat am 2026-11-17 entschieden (Chat):

- **„Ja, Apple TV als Host“.** Auf die Frage, ob die Apple TV Spiel-Host sein darf. Damit wird die Säule „PC-only game hosting“ erweitert.
- **„Nativer Host (RealityKit)“.** Auf die Frage, ob die Mac-App eine Hülle um den Web-Host oder ein eigener nativer Host sein soll. Begründung im Gespräch: Den nativen Host baut man für tvOS ohnehin, der Mac bekommt ihn fast umsonst dazu.
- **„ja passt“.** Zur Ausrichtung: Am Mac bleibt der Browser-Host Rückfall, bis der native Host alles kann; Spielregeln und Server bleiben in TypeScript, der native Host spricht dasselbe Protokoll.

iPhones und iPads bleiben ausschließlich Controller.

### Was gemessen ist

| Gerät | Renderer | Ergebnis | Quelle |
|---|---|---|---|
| Mac (M3 Max), 1080p | Babylon WebGL2 (Spiel) | 8,4 / 11,2 ms (Median / p95) | EXP-015, R7 |
| Mac (M3 Max), 1080p | RealityKit, Testszene | 60 fps am VSync-Deckel, GPU 6,3 ms | EXP-017, R13 |
| iPhone 16 Pro, 2622×1206 | RealityKit, Testszene | 60 fps stabil | EXP-017, R15 |
| Apple TV 4K (A15), 4K-Ausgabe | RealityKit, Testszene | **20 fps**, GPU 34,7 ms, pixelgebunden | EXP-017, R12 |

Die Apple TV bleibt auf 4K-Ausgabe (Ruben, 17.11.). Ein hochskalierter Pfad (intern 1080p, MetalFX) liegt als Spike in PR #27 (CHAOS-114), gemessen ist er noch nicht. **Ohne ihn erreicht ein tvOS-Host das Ziel nicht.**

### Was der Host heute tut

- **Brett:** Szene wird zur Laufzeit im Code gebaut (`createBoardScene`), dazu Regie (Kamerafahrten, Laufanimation, Popups, Lichtstimmung) und HUD.
- **Minispiele:** Logik **und** Darstellung im Host (ADR-012 §1). Je Minispiel ein Modul gegen `minigame-sdk` mit Babylon-Szene; Havok-Physik im festen 1/60-Takt. Vier Minispiele in der Rotation, ein fünftes im PR (#39).
- **Finale:** 3D-Podest.
- Lobby, QR-Code, Pause, Wiederverbindung.

## Entscheidung (Vorschlag)

1. **Ein nativer Host für Mac und Apple TV.** Eine SwiftUI-App mit RealityKit und einem gemeinsamen Code für macOS und tvOS (26+), wie der Spike `spikes/renderer-realitykit`. Am PC (Windows) bleibt der Babylon-Host. **Am Mac bleibt der Browser-Host die Rückfallebene**, bis der native Host alles kann. Niemand verliert Funktionen.
2. **Server und Spielregeln bleiben TypeScript.** Der native Host verbindet sich wie der Browser-Host per WebSocket an `/ws` in der Rolle Host (Protokoll v4, ADR-003). game-core, Controller-Seiten und die native Controller-App (ADR-017) bleiben unverändert.
3. **Der Server läuft auf einem Rechner im LAN** (ADR-016, Server-Variante 1):
   - Am Mac kann die native App den Server mitbringen und selbst starten.
   - Die Apple TV verbindet sich mit einem Server auf Mac oder PC.
   - **Eine Apple TV ganz ohne Rechner ist ausdrücklich nicht Teil dieser Entscheidung.** Dafür müssten game-core und Server auf die Apple TV.
4. **Minispiel-Logik: Variante C als Ziel, abhängig von einem Spike.** Für Render-only-Hosts rechnet der Server die Minispiele headless. Das ist eine **Umkehr von ADR-012 §1**, die Ruben ausdrücklich bestätigen muss (siehe Alternativen und offene Fragen). Bis der Spike zeigt, dass Schnappschüsse flüssig genug sind, gilt Variante C nicht als beschlossen.
5. **Assets:**
   - **Figuren** kommen direkt aus den bpy-Skripten (ADR-013) als USDZ, nicht über GLB→USDZ. Der Umweg verliert Rauheit, Clearcoat und Leuchten (EXP-017).
   - **Brett** und **Kulisse:** Der Babylon-Export (`scripts/spike-export-board.mjs`) wird zum Build-Schritt mit USDZ als Artefakt. Brettlogik (Feldkoordinaten, Wege) kommt weiter aus game-core.
6. **Protokoll-Vertrag für die Host-Rolle wie beim Controller:** `scripts/export-protocol-fixtures.mjs` bekommt die Nachrichten der Host-Rolle. Swift-Tests dekodieren jede Beispielnachricht, die CI prüft, ob der Korpus aktuell ist (wie ADR-017).
7. **CI und Verteilung:**
   - Der Job „Native Apps“ baut den Host für macOS und tvOS.
   - **Mac-App:** Developer-ID-Signatur, Notarisierung und GitHub-Release wie in lichtung (CHAOS-118).
   - **Apple-TV-App:** TestFlight (CHAOS-119).

## Betrachtete Alternativen

### Minispiel-Logik im nativen Host

| Variante | Aufwand | Vorteil | Problem |
|---|---|---|---|
| **A: Logik und Physik je Minispiel nach Swift portieren** (RealityKit-Physik statt Havok) | wächst mit jedem Minispiel: 4 in der Rotation, das 5. im PR | kein Protokollumbau, niedrigste Latenz | **zwei Physik-Wahrheiten**: RealityKit-Physik ist nicht Havok, dasselbe Minispiel spielt sich am PC anders als auf der Apple TV. Die Balance-Daten (EXP-005 … EXP-020) gelten nur für Havok. Jede Regeländerung muss zweimal gebaut werden. |
| **B: TypeScript-Module in JavaScriptCore in der App** | mittel | ein Code für die Logik | Die Module hängen an einer Babylon-Szene und an Havok als WebAssembly. **Ungeprüft:** ob JavaScriptCore auf einer echten Apple TV `WebAssembly` anbietet. Ohne JIT ist die Leistung offen. Die Module müssten von Babylon entkoppelt werden. |
| **C: Server rechnet Minispiele headless, nativer Host zeigt nur an** | einmalig: Protokoll für Schnappschüsse, im Server die Headless-Laufzeit; je Minispiel eine Darstellungsschicht in Swift | **eine Physik-Wahrheit**: dieselben TS-Module mit Havok und festem 1/60-Takt, die es als `runMinigameHeadless` schon gibt (Testharness). Hält das Prinzip „der Rechner besitzt die Physik-Ergebnisse“. Der Browser-Host rechnet weiter lokal, am PC ändert sich nichts. | **Umkehr von ADR-012 §1** für Render-only-Hosts. ADR-012 lehnte das wegen ruckeliger Schnappschüsse ab; dagegen helfen Interpolation und ein Puffer von 1–2 Bildern. Eingabe → Bild bekommt einen Netzwerk-Umweg (Controller → Server → Host); das ist nur per Spike messbar. Zwei Wege für Minispiele: lokal im Browser-Host, im Server für Render-only. |

**Belege für Variante C** (17.11., M3 Max; das zeigt nur die CPU-Last, nicht die Latenz):

| Minispiel | Physik | ms je 1/60-Schritt, headless |
|---|---|---|
| sockenregen | nein | 0,042 |
| pudding-gerangel | Havok | 0,057 |
| wackelturm | nein | 0,016 |
| kuckucks-klatsche | nein | 0,017 |

Gemessen mit `runMinigameHeadless` und Zufallseingaben für 4 Spieler über die ganze Spielzeit. Der Server hat damit für die Minispiele reichlich Reserve. Offen bleiben die Größe der Schnappschüsse (Zahl der bewegten Objekte je Minispiel), die Latenz von der Eingabe bis zum Bild und die Flüssigkeit.

### Mac-App

| Alternative | Warum nicht |
|---|---|
| Hülle um den Browser-Host (Server mitstarten, `WKWebView`) | Kleiner, aber die Arbeit für tvOS bliebe vollständig. Ruben hat sich für den nativen Host entschieden. Die Hülle ist trotzdem der Rückfall, bis der native Host alles kann (Entscheidung 1). |
| Babylon Native, Unity, Godot, Bevy | ADR-016: kein tvOS (Babylon Native, Godot, Bevy) bzw. Editor-zentriert und Lizenzfragen (Unity). |

## Konsequenzen

**Positiv**

- Ein Code für Mac und Apple TV. Der Mac wird zur schnellen Entwicklungs- und Testplattform für den tvOS-Host.
- Server, Spielregeln, Controller (Browser und native App) und Protokoll bleiben gemeinsam. Neu ist nur, was der Host zeigt.
- Mit Variante C bleibt die Minispiel-Physik eine einzige Wahrheit, auch die Balance-Messungen bleiben gültig.

**Negativ / Risiken**

- **Zwei Renderer dauerhaft:** Babylon am PC und RealityKit auf Apple-Geräten. Jeder Brett-Effekt und jede Minispiel-Darstellung entsteht zweimal. Der native Host läuft anfangs hinterher.
- **Apple TV bei 4K:** nur 20 fps ohne hochskalierten Pfad (CHAOS-114). Das ist das größte technische Risiko.
- **Variante C:** Die Latenz von der Eingabe bis zum Bild und die Flüssigkeit sind unbelegt, dafür braucht es einen Spike. Ohne Variante C bleibt nur A: zwei Physik-Implementierungen und dauerhaft doppelte Minispiel-Logik.
- **Mac-App mit eingebautem Node:**
  - Ungeprüft ist, ob V8 unter der für die Notarisierung nötigen Hardened Runtime JIT-Berechtigungen braucht (`com.apple.security.cs.allow-jit`).
  - Die Größe des Bundles und die Lizenzhinweise kommen hinzu (ADR-018).
- Regie, Kamerafahrten, Laufanimation, Popups, HUD, Lobby mit QR und Podest werden für den nativen Host **neu geschrieben**, egal welche Variante.
- Die Apple TV braucht immer einen laufenden Rechner im LAN (Entscheidung 3).

## Offene Fragen an Ruben

1. **Variante C freigeben?** Der Server rechnet Minispiele für Render-only-Hosts headless. Das kehrt ADR-012 §1 für diese Hosts um. Vorschlag: zuerst der Spike (Folgeaufgaben, Schritt 2), dann entscheiden.
2. **Apple TV nur mit Rechner im LAN** (Mac oder PC), oder soll sie später ohne Rechner laufen? Vorschlag: mit Rechner; ohne Rechner wäre ein eigenes Projekt.
3. **Meilenstein:** Gehört der native Host in einen neuen Meilenstein M5, oder bleibt er im Backlog (CHAOS-44)?

## Folgeaufgaben (Vorschlag, Reihenfolge)

1. **4K auf der Apple TV** (CHAOS-114, PR #27): den hochskalierten Pfad messen. Ziel: mindestens 30 fps stabil, besser 60.
2. **Spike Variante C:**
   - ein Minispiel aus der Rotation (`pudding-gerangel`, wegen Havok) headless im Server
   - Schnappschüsse über das Protokoll
   - in RealityKit am Mac und auf der Apple TV darstellen
   - messen: Eingabe → Bild, Flüssigkeit, Größe der Schnappschüsse
3. **Host-Rolle im Fixture-Vertrag** (Swift-Typen, Tests, CI).
4. **Brett im nativen Host:**
   - USDZ-Export als Build-Schritt
   - Figuren als USDZ direkt aus bpy
   - Regie, Laufanimation, HUD, Lobby mit QR
5. **Minispiele im nativen Host:** Darstellung je Minispiel (nach Variante C) oder Port (nach Variante A).
6. **Finale/Podest, Pause, Wiederverbindung.**
7. **Verteilung:** Mac-App mit Notarisierung (CHAOS-118) und tvOS über TestFlight (CHAOS-119).

## Überprüfung

- **Nach dem Spike Variante C:** diese ADR auf „Angenommen“ setzen, mit der gewählten Variante, oder zu A wechseln.
- **Wenn der hochskalierte Pfad 30 fps bei 4K nicht erreicht:** die Apple TV als Host neu bewerten (Grafikstufe, Szene vereinfachen oder 1080p-Ausgabe).
- **Wenn Babylon Native, Bevy oder Godot tvOS offiziell unterstützen:** einen gemeinsamen Renderer mit dem PC prüfen.
