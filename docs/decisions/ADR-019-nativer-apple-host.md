# ADR-019: Nativer Apple-Host mit RealityKit, Apple TV hostet allein, Babylon bleibt am PC

**Status:** Angenommen (Ruben, 2026-11-17: „ja dann go“ auf W2, Browser-Controller ausliefern; Meilenstein offen). Überprüfung nach dem Spike „Apple TV hostet allein“.
**Datum:** 2026-11-17
**Aufgabe:** CHAOS-135; Folge für CHAOS-74 (Apple TV), CHAOS-118 (Mac-App), CHAOS-114 (4K-Leistung)
**Betroffene Annahmen:** ADR-001 (Stack), ADR-004 (Host-Szene), ADR-005 (Session-Server), ADR-012 (Minispiel-Logik im Host), ADR-016 (Renderer)

## Kontext

Bisher läuft das Spiel nur auf einem PC. Session-Server (Node) und Host (Babylon.js im Browser) laufen dort zusammen, iPhones und iPads sind Controller. ADR-016 lässt Babylon am PC und hat die Apple TV als eigene Produktfrage abgetrennt.

Rubens Entscheidungen am 2026-11-17 (Chat):

- **„Ja, Apple TV als Host“**: Die Apple TV darf Spiel-Host sein. Damit wird die Säule „PC-only game hosting“ erweitert.
- **„Nativer Host (RealityKit)“**: Die Mac-App wird ein eigener nativer Host, keine Hülle um den Web-Host. Den nativen Host gibt es für tvOS ohnehin, der Mac bekommt ihn fast umsonst dazu.
- **„ja passt“**: Am Mac bleibt der Browser-Host Rückfall, bis der native Host alles kann; Spielregeln und Server bleiben TypeScript.
- **„AppleTV muss HOST sein können“**: Die Apple TV muss allein hosten können, **ohne Rechner im LAN**. Das verwirft die Server-Variante 1 aus ADR-016 als einzigen Weg.

iPhones und iPads bleiben ausschließlich Controller.

### Gemessen

**Rendern:**

| Gerät | Renderer | Ergebnis | Quelle |
|---|---|---|---|
| Mac (M3 Max), 1080p | Babylon WebGL2 (Spiel) | 8,4 / 11,2 ms (Median / p95) | EXP-015, R7 |
| Mac (M3 Max), 1080p | RealityKit, Testszene | 60 fps am VSync-Deckel, GPU 6,3 ms | EXP-017, R13 |
| iPhone 16 Pro, 2622×1206 | RealityKit, Testszene | 60 fps stabil | EXP-017, R15 |
| Apple TV 4K (A15), 4K-Ausgabe | RealityKit, Testszene | **20 fps**, GPU 34,7 ms, pixelgebunden | EXP-017, R12 |

Für die Apple TV gibt es einen Spike, der intern kleiner rendert und auf 4K hochskaliert (PR #27, CHAOS-114). Gemessen ist er noch nicht.

**Allein hosten auf der echten Apple TV 4K** (A15, tvOS 27; Probe-App [`spikes/apple-host-probe`](../../spikes/apple-host-probe/README.md) am 17.11.):

| Prüfung | Ergebnis |
|---|---|
| `WebAssembly` in JavaScriptCore (ohne WebKit) | vorhanden; kleines Modul: 5 Mio. Aufrufe in 0,5 s |
| Havok (`HavokPhysics.wasm`, 2,1 MB) | übersetzt in 16 ms; Start über `instantiateWasm` (synchron) in 21 ms. Ein Schritt mit 40 dynamischen Körpern dauert **0,77 ms** (Budget je Bild: 16,7 ms). Nötig sind ein Polyfill für `performance.now()` und eine synchrone Instanziierung; die asynchrone Emscripten-Instanziierung kehrt in JavaScriptCore nicht zurück. |
| game-core (gebündelt mit esbuild, 63 KB) | 20 komplette Bot-Partien (4 Spieler, 10 Runden, 800 Züge) in **77 ms** |
| `NWListener` mit WebSocket-Protokoll (Network.framework) | lauscht auf einem Port, Status `ready` |

**Minispiele headless auf dem Mac** (M3 Max, `runMinigameHeadless`, 4 Zufalls-Bots): 0,016–0,057 ms je 1/60-Schritt für alle vier Minispiele der Rotation.

## Vergleich der Wege

Gesucht ist ein Weg, auf dem die Apple TV allein hostet, der Mac dasselbe kann und der PC unverändert bleibt.

| | **W1: Alles in Swift** | **W2: TypeScript-Kern eingebettet (JavaScriptCore)** | **W3: Server auf Rechner im LAN** |
|---|---|---|---|
| Apple TV allein | ja | ja | **nein** (verwirft Rubens Vorgabe) |
| Spielregeln (game-core) | **zweimal**: TS am PC, Swift auf Apple-Geräten; jede Regel- und Balanceänderung doppelt | **einmal**: dieselbe TS-Datei läuft am PC (Node) und in der App (JavaScriptCore). Gemessen: 800 Züge in 77 ms. | einmal (Node) |
| Session-Server, Protokoll | in Swift neu | TS-Server in JavaScriptCore; Swift stellt nur Socket und Port bereit (`NWListener`) | unverändert |
| Minispiel-Logik und Physik | **zweimal**, RealityKit-Physik statt Havok: dasselbe Minispiel spielt sich anders; die Balance-Daten (EXP-005 … EXP-020) gelten nicht mehr | **einmal**: dieselben TS-Module mit Havok im festen 1/60-Takt in JavaScriptCore. Gemessen: Havok 0,77 ms je Schritt mit 40 Körpern. Der Host rechnet weiter selbst, wie in ADR-012 §1, nur in der App statt im Browser. | im Server (würde ADR-012 umkehren) oder in Swift |
| Darstellung | RealityKit | RealityKit: Brett, Regie, Minispiel-Darstellung und Podest **neu**, egal welcher Weg | RealityKit |
| Controller | Browser-Seiten bräuchten einen HTTP-Server in Swift | die native Controller-App (ADR-017) verbindet sich per WebSocket. Für Browser-Controller liefert die App die gebauten Seiten über einen kleinen HTTP-Teil im selben `NWListener` aus. | unverändert |
| Aufwand | sehr groß und wächst mit jedem Minispiel und jeder Regel | groß, aber einmalig: Brücke Swift ↔ JavaScriptCore, Darstellung | mittel |
| Größte Risiken | dauerhafte Abweichung zwischen PC und Apple TV | Ob Babylons `NullEngine` als Szene der Minispiele in JavaScriptCore läuft, ist **ungeprüft**. Ebenfalls offen: Speicher, Laufzeit über eine ganze Partie, App-Store-Regeln für einen Server in der App (für TestFlight unkritisch). | Apple TV nie allein |

**Empfehlung: W2.** Er erfüllt Rubens Vorgabe und hält Regeln, Server und Minispiel-Physik als eine einzige TypeScript-Wahrheit für PC, Mac und Apple TV. Neu ist nur, was zu Apple-Geräten gehört: Darstellung in RealityKit und die dünne Brücke für Netz und JavaScript-Laufzeit.

## Entscheidung (Vorschlag)

1. **Ein nativer Host für Mac und Apple TV.** Eine SwiftUI-App mit RealityKit, ein Code für macOS und tvOS (26+). Am PC (Windows) bleibt Babylon. **Am Mac bleibt der Browser-Host die Rückfallebene**, bis der native Host alles kann.
2. **Die App hostet allein (W2).**
   - Session-Server und game-core laufen als gebündeltes TypeScript in JavaScriptCore in der App.
   - Swift stellt Netzwerk (`NWListener`: WebSocket für Controller, HTTP für die Controller-Seiten), Zeitgeber und Speicher bereit.
   - Derselbe Code läuft am PC weiter in Node. Der Server bekommt dafür eine Transportschicht mit zwei Umsetzungen, `ws` in Node und die Brücke in der App.
3. **Minispiele:** Die bestehenden TS-Module laufen headless in JavaScriptCore der App, mit Havok und festem 1/60-Takt. Das ist derselbe Weg wie `runMinigameHeadless`, also ohne Umkehr von ADR-012. RealityKit stellt den Zustand dar; je Minispiel gibt es dafür eine Darstellungsschicht in Swift.
4. **Optional:** Die Apple TV kann sich trotzdem mit einem Server auf PC oder Mac verbinden (Rolle Host, wie heute der Browser-Host). Das ist praktisch zum Entwickeln, aber nicht Pflicht.
5. **Assets:**
   - **Figuren** kommen als USDZ direkt aus den bpy-Skripten (ADR-013). Der Umweg GLB→USDZ verliert Rauheit, Clearcoat und Leuchten (EXP-017).
   - **Kulisse des Bretts:** Der Babylon-Export (`scripts/spike-export-board.mjs`) wird ein Build-Schritt mit USDZ als Artefakt. Feldkoordinaten und Wege kommen aus game-core.
   - *Umgesetzt (CHAOS-140, EXP-026):* `pnpm build:apple-assets` erzeugt beides. Die Vertexfarben der Figuren werden dafür in eine Farbtextur gebacken. Die Kulisse hat Feld-Anker `feld_<id>`. Herkunft und Lizenzen stehen im Manifest unter `builds`. Siehe [`docs/apple-assets.md`](../apple-assets.md).
6. **Protokoll-Vertrag:**
   - Die Swift-Seite der Brücke und die Darstellung bekommen Beispielnachrichten wie die Controller-App (ADR-017, `scripts/export-protocol-fixtures.mjs`), erweitert um die Host-Rolle.
   - Das gebündelte TypeScript wird in der CI gebaut und gegen dieselben Tests geprüft.
7. **CI und Verteilung:**
   - **CI:** Der Job „Native Apps“ baut den Host für macOS und tvOS.
   - **Mac-App:** Developer-ID-Signatur, Notarisierung und GitHub-Release wie in lichtung (CHAOS-118). JavaScriptCore läuft ohne JIT-Berechtigung, ein eingebautes Node ist nicht nötig.
   - **Apple-TV-App:** über TestFlight (CHAOS-119).

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| W1: Alles in Swift | Regeln und Minispiel-Physik zweimal, dazu eine andere Physik-Engine. Das führt zu dauerhafter Abweichung zwischen PC und Apple TV und zu doppelter Arbeit bei jeder Änderung. |
| W3: Server nur auf Rechner im LAN | Erfüllt „AppleTV muss HOST sein können“ nicht. Bleibt als optionaler Modus (Entscheidung 4). |
| Mac-App als Hülle um den Browser-Host | Ruben hat sich für den nativen Host entschieden. Die Hülle bleibt als Rückfall (Entscheidung 1). |
| Node in der Mac-App einbetten | Unnötig, weil JavaScriptCore auf macOS und tvOS denselben Kern trägt. Node bräuchte unter der Hardened Runtime eine JIT-Berechtigung und würde das Bundle vergrößern. |
| Babylon Native, Unity, Godot, Bevy | ADR-016: kein tvOS (Babylon Native, Godot, Bevy) bzw. Editor-zentriert und Lizenzfragen (Unity). |

## Konsequenzen

**Positiv**

- Die Apple TV hostet allein, der Mac ebenso. Der PC ändert sich nicht.
- Eine Wahrheit für Regeln, Server und Minispiel-Physik: Balance-Messungen und Tests gelten überall.
- Der Mac wird die schnelle Entwicklungs- und Testplattform für den tvOS-Host.

**Negativ / Risiken**

- **Zwei Renderer dauerhaft:** Babylon am PC, RealityKit auf Apple-Geräten. Jede Darstellung (Brett-Effekte, Minispiele, Podest) entsteht zweimal.
- **4K auf der Apple TV:** 20 fps ohne hochskalierten Pfad (CHAOS-114). Größtes technisches Risiko.
- **Babylon-`NullEngine` in JavaScriptCore ungeprüft.** Die Minispiel-Module brauchen eine Babylon-Szene. Läuft sie nicht, müssen die Module von Babylon entkoppelt werden; die Logik bleibt TypeScript.
- **JavaScriptCore ohne JIT:** Gemessen reicht die Leistung für game-core und Havok. Ob sie bei einer ganzen Partie mit Minispielen und Rendering gleichzeitig reicht, ist offen.
- **Neuer Code für den Server:** eine Transportschicht (Node-`ws` oder Brücke) und ein kleiner HTTP-Teil in Swift für die Controller-Seiten.
- Regie, Kamerafahrten, Laufanimation, Popups, HUD, Lobby mit QR und Podest werden für den nativen Host neu geschrieben.

## Offene Fragen an Ruben

1. **W2 so freigeben?** Die Apple TV hostet allein mit eingebettetem TypeScript-Kern. Zuerst kommt der Spike unten.
2. **Browser-Controller auf der Apple TV:** Soll die App die Controller-Seiten ausliefern, damit Gäste ohne App per QR beitreten können? Oder reicht die native Controller-App? Vorschlag: ausliefern, damit niemand eine App braucht.
3. **Meilenstein:** Kommt der native Host in einen neuen Meilenstein M5, oder bleibt er im Backlog (CHAOS-44)?

## Folgeaufgaben (Vorschlag, Reihenfolge)

1. **4K auf der Apple TV** (CHAOS-114, PR #27): den hochskalierten Pfad messen. Ziel: mindestens 30 fps stabil, besser 60.
2. **Spike „Apple TV hostet allein“:**
   - Server und game-core gebündelt in JavaScriptCore
   - Brücke über `NWListener`
   - die native Controller-App und ein Browser-Controller treten bei
   - Brett-Zug sichtbar in RealityKit
   - ein Minispiel (`pudding-gerangel`, wegen Havok) headless in JavaScriptCore, dargestellt in RealityKit
   - messen: Eingabe → Bild, Bildrate, Speicher, Laufzeit einer Partie
3. **Transportschicht im Server** (Node-`ws` oder Brücke), mit Tests am PC.
4. **Brett im nativen Host:**
   - USDZ als Build-Schritt
   - Figuren als USDZ direkt aus bpy
   - Regie, Laufanimation, HUD, Lobby mit QR
5. **Darstellung der Minispiele** im nativen Host.
6. **Finale/Podest, Pause, Wiederverbindung.**
7. **Verteilung:** Mac-App mit Notarisierung (CHAOS-118) und tvOS über TestFlight (CHAOS-119).

## Überprüfung

- **Nach dem Spike (Schritt 2):** Läuft die Babylon-`NullEngine` nicht in JavaScriptCore oder reicht die Leistung nicht, die Entkopplung der Minispiele von Babylon prüfen, bevor W1 in Frage kommt.
- **Wenn der hochskalierte Pfad 30 fps bei 4K nicht erreicht:** Grafikstufe oder Szene für die Apple TV anpassen.
- **Wenn Babylon Native, Bevy oder Godot tvOS offiziell unterstützen:** einen gemeinsamen Renderer mit dem PC prüfen.

## Nachtrag 1 (2026-11-17, CHAOS-139): Spike im Produktcode

- **Ort:** Der Spike `spikes/apple-host` ist jetzt das Workspace-Paket [`apps/apple-host`](../../apps/apple-host/README.md) (`@chaos-party/apple-host`): JS-Kern in `src/`, Swift-App in `app/` (ein Ziel für macOS und tvOS, `dev.rubeen.chaosparty.host`), Harness in `harness/`. `pnpm build` erzeugt `dist/chaos-host.js` und `dist/HavokPhysics.wasm` samt Lizenzhinweisen (ADR-018).
- **Schritt 3 (Transportschicht) entfällt:** `Session` war schon transportunabhängig (`ConnectionId`/`Outgoing`, `ws`-Adapter in `apps/server/src/socket.ts`). Einzige Änderung am Server: `DEFAULT_TICK_MS` liegt jetzt in `session.ts`, damit das Bündel `socket.ts` (und damit `ws`) nicht braucht.
- **§6 Beispielnachrichten:** Die Host-Rolle läuft im JS-Kern selbst; Swift reicht das Controller-Protokoll nur durch. Der Vertrag, den Swift versteht, ist deshalb `renderState` (plus `HostEnv`/`ChaosHostInstance`). Er steht als zod-Schema in `apps/apple-host/src/contract.ts`; Beispiele je Phase erzeugt `scripts/export-apple-host-fixtures.mjs`, der Swift-Harness dekodiert sie mit dem `RenderState` der App.
- **§7 CI:** Der Linux-Job prüft das Bündel in einem nackten `node:vm`-Kontext (Unit-Test bis zum ersten Minispiel, `bots --full` mit ganzer Partie) und dessen Größe (`pnpm check:bundle`). Der Job „Native Apps“ spielt die ganze Partie im Swift-Harness in JavaScriptCore (`JSC_useJIT=false`) und baut die App für macOS und tvOS.
- **Noch nicht übernommen:** der hochskalierte 4K-Pfad (CHAOS-114) und die Render-Schleife des RealityKit-Spikes. Die App zeichnet weiter Grundkörper über die `ARView`; beides kommt mit der echten Grafik (CHAOS-142, CHAOS-148).

## Nachtrag 2 (2026-11-17): Eine Variante, alle Minispiele auf jedem Host

Ruben (Chat, CHAOS-137): „ich habe nur DIE EINE Variante, deshalb alle Minispiele in allen Versionen verfügbar“.

- Es gibt **keine abgespeckte Apple-Variante**. Eine Rotation je Host oder eine erste Version mit weniger Minispielen ist verworfen. Am PC, auf dem Mac und auf der Apple TV laufen dieselben Minispiele.
- **Folge für Entscheidung 3:** Eine eigene Swift-Darstellung je Minispiel skaliert nicht auf den geplanten Katalog (CHAOS-80, ~200 Spiele). Die Darstellung im nativen Host läuft deshalb über die **Rollen-Kennzeichnung** (`markVisual`/`visualOf` aus `packages/minigame-sdk`, CHAOS-149). Swift hält eine Bibliothek von Darstellungen je Rolle, die Minispiele derselben Familie teilen. Eigener Swift-Code je Minispiel nur, wo eine Rolle nicht reicht.
- **Folge für die Minispiel-Fabrik:** Ein Minispiel ist erst fertig, wenn es auch im Apple-Host mit echter Grafik läuft (Definition of Done je Minispiel, [`docs/minigames/README.md` §5.3](../minigames/README.md)).
- Der Nachweis bleibt der Gesamtlauf mit allen Minispielen der Rotation (CHAOS-146).
