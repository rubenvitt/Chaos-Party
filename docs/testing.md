# Tests in Chaos Party

Stand: M2 (CHAOS-2, 2026-11-15); M1-Teile aus CHAOS-45. Dieses Dokument beschreibt, welche automatischen Tests es gibt, was sie beweisen, wie man sie startet und Screenshot-Baselines pflegt – und was **nicht** automatisch geprüft werden kann und deshalb in die Gerätecheckliste (`docs/device-test-checklist.md`) gehört.

## Überblick

| Suite | Werkzeug | Umfang (Stand M2) | Start |
|---|---|---|---|
| Unit- und Integrationstests | Vitest | 791 Tests in 62 Dateien (+1 nur mit `EXPERIMENTS=1`) | `pnpm test` |
| E2E (Browser) | Playwright 1.63, nur Chromium | 89 Tests in 11 Specs, 5 Projekte | `pnpm test:e2e` |
| Experimente (Simulation) | Vitest + `simulateGame` | 600 Partien je Variante, Seeds 1–200 | `EXPERIMENTS=1 pnpm exec vitest run packages/game-core/src/rules/experiments.test.ts --silent=false` |
| Statische Prüfungen | `tsc` strict, ESLint, Prettier, Lizenzprüfung | – | `pnpm check` (inkl. `pnpm test` und `pnpm build`) |

Vitest-Tests nach Paket:

- `packages/protocol` (176): Schemas, Parser für jede Nachricht (v2: `choose`, `board`, `prompt` im Kontext), ungültige/übergroße Eingaben, Phasen-/Aktionsregeln, Slot-Farben, `seq`-Wächter.
- `packages/game-core` (162, M2): jeder Übergang des Zustandsautomaten, ungültige Übergänge mit allen Fehlercodes, Würfel, Pfadwahl, Trophäe (passieren/landen/kaufen/wandern, mehrere aktiv), Münzen nie negativ, jedes Item, jedes Brett-Ereignis, Fallen (landen/darüberlaufen, eigen/fremd), Reaktionsfenster (Schild, Festhalten, Timeout, verspätete Wahl), Disconnect mitten im Zug, komplette Partien mit 2–4 Spielern, Determinismus je Seed, JSON-Festigkeit, Brett-Validierung (Wackelwald + je Regel ein kaputtes Brett), Simulation.
- `apps/server` (143): **Brettspiel über die Session** (`boardGame.integration.test.ts`, CHAOS-23: komplette Partien mit 2/3/4 Spielern und gemischt iPhone + iPad, gleicher Seed → gleicher Ablauf, Disconnect mitten im Zug mit Auto-Wahl und Rückkehr, Reaktionsfenster mit Festhalten/Timeout/verspäteter Wahl, Eingaben außer der Reihe, Host-Reload, Arena-Modus), Selbstprüfung von `localhost` (CHAOS-48), dazu wie in M1: Session als reine Zustandsmaschine (Beitritt, Slots, Start, Bereit, Reconnect-Politik, Herzschlag/Timeouts mit künstlicher Uhr, Rate-Limit), LAN-Adresswahl, Startausgabe, **Integration mit echten `ws`-Clients** gegen den HTTP/WebSocket-Server (`server.test.ts`, `socket.test.ts`): Auslieferung, Handshake, mehrere gleichzeitige Controller, kaputte Nachrichten, Abbruch und Wiederverbinden.
- `apps/controller` (184): Brettphase (Prompt → Knöpfe, Sperre nach dem Senden, Countdown, `choose` mit `seq`, Wahlknöpfe in iPad-Zonen), Joystick-Mathematik, Drosselung der `move`-Nachrichten, Touch-Zonen (Geometrie, Finger-Zuordnung, Zonen-Tracker), Client/Session mit Fake-Socket und Fake-Timern (Backoff, Wachhund, Token), Reducer, Fehlertexte.
- `apps/host` (100): Brett-Regie (Ereignisse abspielen, Lücken in `eventSeq`, Aufholen), Meldungstexte, Figur-Versatz, Demo-Stand, Start-Modus, Bewegung/Dash-Mathematik, Spawn-Punkte aus dem Seed, Tastatur- und Netzwerk-Eingabequelle, Host-Verbindung, Verbindungsmeldungen, Join-Link je Gerät (`joinLink.test.ts`).
- `packages/metrics` (CHAOS-45): Ringpuffer, Median/p95 (Nearest-Rank), Formatierung, User-Agent-Kurzform; dazu Messer in Controller (RTT) und Host (Bildabstand, Eingabe→Frame).

## E2E-Aufbau

- **Ein Build, viele Server.** `tests/e2e/global-setup.ts` führt einmal `pnpm build` aus. Danach startet die Fixture `chaosServer` (`tests/e2e/fixtures/test.ts`) **für jeden Test** einen eigenen echten Server im Playwright-Prozess (`createChaosServer` aus `apps/server/src/server.ts`): Production-Builds wie bei `pnpm start` (Controller unter `/`, Host unter `/host/`, WebSocket unter `/ws`, ein Port), nur auf `127.0.0.1`, freier Port, fester Join-Code `E2ETEST`, Join-Link `http://127.0.0.1:<port>/?code=E2ETEST`. `baseURL` zeigt auf diesen Server. Kein Test sieht den Zustand eines anderen; die Reihenfolge ist egal, Tests laufen parallel (2 Worker).
- **Weitere Geräte.** Die Fixture `openDevice('PC' | 'iPhone 13' | 'iPhone 13 landscape' | 'iPad Pro 11 landscape')` öffnet eine Seite in einem eigenen Browser-Kontext (eigener Speicher, also eigenes Token – wie ein eigenes Gerät) mit Geräte-Emulation in Chromium und schließt ihn am Testende.
- **Zwei Arten von Controller-Tests.** `controller-ui.spec.ts` und `ipad-zonen.spec.ts` laden den echten Controller-Build, fangen `/ws` aber per `routeWebSocket` ab und sprechen mit einem nachgebauten Session-Server (`fixtures/fakeSession.ts`, prüft jede Nachricht mit dem echten Protokoll-Parser) – so lassen sich Fehlerfälle und Layout-Wechsel gezielt erzeugen. `m1-durchstich.spec.ts` und `reconnect-slot.spec.ts` laufen **ohne** Nachbau gegen den echten Server.
- **Touch.** `fixtures/touch.ts` schickt echte Touch-Ereignisse per CDP (`Input.dispatchTouchEvent`), auch mehrere Finger gleichzeitig (`down`, `move`, `moveAll`, `lift`, `cancelAll`). Chromium erzeugt daraus Touch- und Pointer-Ereignisse wie auf dem Gerät.
- **Host-Testhaken.** `/host/?test=1` schaltet die Render-Schleife ab; die Physik läuft nur mit `window.__chaos.stepFrames(n)` (je 1/60 s). Dazu `getPlayerPositions()`, `networkInputs` (Zahl angewandter Controller-Eingaben) und `lastMoves` (letzter Stick je Slot, CHAOS-14). Damit sind Bewegungsprüfungen deterministisch, unabhängig von Rechnerlast.
- **Warten.** Nur ereignisgesteuert: DOM-Attribute (`data-layout`, `data-connected`, `data-active` …), `waitForHostStick` (`lastMoves`) und `networkInputs`. Feste Zeit vergeht nur in `stepFrames`. Bewegungen werden mit Toleranzen geprüft (Richtung, Mindestweg 1 m, Querversatz < 0,5 m, Stillstand < 5 cm; Annahme C4), nie mit exakten Positionen.
- **Fehler.** Jede Seite sammelt Konsolenfehler und unbehandelte Ausnahmen; die Tests erwarten beide leer (beim absichtlichen Offline-Schalten nur die erwarteten WebSocket-Meldungen ausgenommen).

### Playwright-Projekte

| Projekt | Specs | Emulation |
|---|---|---|
| `chromium` | `host-szene`, `host-lobby`, `reconnect-slot`, `m1-durchstich`, `debug-anzeige`, `host-brett`, `m2-brett-durchstich` | Desktop 1280×720, WebGL über SwiftShader (Software) |
| `iphone-hoch`, `iphone-quer` | `controller-ui`, `controller-brett` | iPhone 13 hoch/quer |
| `ipad-quer`, `ipad-hoch` | `ipad-zonen`, `ipad-brett` | iPad Pro 11 quer/hoch |

Seit M2 öffnen die M1-Specs den Host mit `&arena=1` (Start der M1-Arena statt des Brettspiels). Alle E2E-Server nutzen den festen Brettspiel-Seed `E2E_GAME_SEED = 2026` (`fixtures/server.ts`).

### Specs und was sie beweisen

| Spec | Gegen | Beweist |
|---|---|---|
| `host-szene.spec.ts` (5) | lokaler Tastatur-Modus | Havok-WASM lädt vom Node-Server mit `application/wasm` (C1), Arena mit Figuren, Tastatur bewegt Spieler 1, Schubser-Impuls, vier Figuren, Screenshot der Startszene. |
| `host-lobby.spec.ts` (5) | echter Server, synthetische WebSocket-Controller | QR-Code/Join-Code/Link, Firewall-Hinweis nach Wartezeit, **Umschalter iPhone/iPad** (Link mit `seats=2`), „Andere Adresse“, zweites Host-Fenster wartet, Beitritt/Bereit/Start, `move` bewegt nur die eigene Figur, Schubser, Trennung sichtbar; Screenshot der Lobby. |
| `m1-durchstich.spec.ts` (3) | echter Server, **echte Host- und Controller-Seiten** | (1) Zwei iPhones öffnen den Link aus der Lobby, bekommen verschiedene Plätze/Farben (Handy und Host), tippen „Bereit!“, Host startet; beide ziehen **gleichzeitig** ihren Joystick (rechts/oben) → jede Figur läuft in ihre Richtung und nicht in die der anderen; Knopf A → Schubser nur bei Figur 2; Handy 1 verliert das Netz → Host „getrennt“, Handy-Overlay; wieder online → automatisch **derselbe Platz**, Joystick steuert wieder die eigene Figur. (2) Geteiltes iPad über den iPad-Link: zwei Zonen, zwei neue Spieler am Host, zwei Finger gleichzeitig (eine `touchMove`-Folge für beide) steuern zwei Figuren unabhängig; Joystick in Zone 1 + Knopf A in Zone 2 zugleich. (3) Gemischt: 1 iPhone + iPad(2) = drei Spieler (Slots 1–3) bewegen sich gleichzeitig unabhängig; Screenshot der Szene mit drei Figuren. |
| `reconnect-slot.spec.ts` (4) | echter Server, iPhone-/iPad-Seiten, Verbindung über `routeWebSocket` steuerbar | Abbruch → Overlay mit Versuchszähler → automatischer Reconnect auf denselben Platz, Host-Meldungen „verloren“/„wieder da“; Neuladen behält den Platz; zweiter Tab übernimmt ohne Hin und Her; iPad: alle Plätze kommen zurück, gehaltener Joystick wird beim Abriss losgelassen. |
| `debug-anzeige.spec.ts` (3, CHAOS-45) | echter Server, echte Host-/Controller-Seiten, Host **ohne** Testmodus | `?debug=1`: Host zeigt Bildrate, Bildabstand-p95, Grafikkarte und nach Joystick-Eingaben Eingabe→Frame als Zahlen; iPhone und geteiltes iPad zeigen RTT-Median/p95 (Herzschlag 1 s); ohne `debug` keine Anzeige. Prüft nur „Zahlen erscheinen“, keine Schwellen. |
| `host-brett.spec.ts` (6, M2) | lokaler Brett-Modus `?local=1&board=1&test=1`, Ereignisse per Testhaken eingespeist | Brett lädt ohne Konsolenfehler, Figur hüpft Feld für Feld, Zugwechsel/Würfel/Münzen/Klau mit Countdown, Lücke in `eventSeq` → Sprung, Minispiel-Platzhalter und Endstand; Screenshot (HUD-Text maskiert). Belegbild ungemaskiert: `HOST_BRETT_BELEG=1`. |
| `m2-brett-durchstich.spec.ts` (1, M2) | echter Server, **echte Host- und zwei iPhone-Seiten**, Host ohne Testmodus | Beitritt, Bereit, Start des Brettspiels mit `?rounds=1`; genau ein Handy bekommt den Würfel, das andere wartet; Würfeln sperrt; alle angebotenen Entscheidungen werden getippt, bis Host und Handys den Endstand zeigen; Server-Stand `game-results`. |
| `m3-minispiel-durchstich.spec.ts` (2, M3) | echter Server (Referenz-Minispiel, Intro 4 s), echte Host- und iPhone-Seiten bzw. synthetische Controller | Brett → Anleitung → Spiel; Tipp auf A kommt im Minispiel an; Host meldet das Ergebnis, Server nimmt es an (Münzen im Stand), nächste Runde, Bühne entsorgt; Host-Neuladen mitten im Spiel startet mit Restzeit; Ergebnis nach Verbindungsabbruch erneut gesendet. |
| `m3-minispiel-anzeige.spec.ts` (M3) | lokaler Ablauf `?local=1&minigame=pump-parade&flow=1&test=1` | Anleitungskarte und Ergebnisanzeige (inkl. Gleichstand) als Screenshot-Baselines, Tastatur; Belegbilder `M3_BELEG=1`. |
| `m3-minispiele-bild.spec.ts` (3, M3) | lokale Vorschau `?local=1&minigame=<id>&test=1&seed=7` | Jedes Minispiel der Rotation nach genau 2 s Spielzeit (feste Schritte, feste Kamera, Animationen mit konstantem Zeitschritt) gegen eine Baseline; HUD mit 4 Spielern und Restzeit. |
| `controller-minispiel.spec.ts` (6 × 2 Lagen, M3) | nachgebauter Session-Server | Intro, beschriftetes Spiel-Layout, Loslassen beim Wechsel ins Ergebnis, nur-A-Minispiel, Platz/Abbruch, vier iPad-Zonen mit gleichzeitigen Fingern; Screenshots. |
| `controller-brett.spec.ts` (9 × 2 Lagen, M2) | nachgebauter Session-Server | Warte-Karte mit Stand, jeder Prompt-Typ (Würfeln mit Items, Weg, Trophäe, Ziel, Reaktion) sendet das richtige `choose`, Sperre nach dem Senden, Countdown, `invalid-choice`-Hinweis, Endplatz, Wiederverbinden mitten in der Wahl; Screenshots (Text maskiert). Belegbilder: `BRETT_BELEG=<ordner>`. |
| `ipad-brett.spec.ts` (5 × 2 Lagen, M2) | nachgebauter Session-Server | Zwei Zonen mit unterschiedlichen Prompts und eigenem Stand, **gleichzeitige** Finger in beiden Zonen wählen je für den richtigen Slot, ein Finger aus Zone 1 löst keine Knöpfe in Zone 2 aus, Reaktion wählt schon beim Aufsetzen, Warten/Endstand je Zone und Lösen der Sperre durch einen neuen Prompt; Screenshot. |
| `controller-ui.spec.ts` (9 × 2 Lagen) | nachgebauter Session-Server | Beitritt per `?code=`, Code-Eingabe und Fehlertexte, Lobby → Spiel-Layout, Joystick-Vektoren und Drosselung, Knöpfe auch gleichzeitig mit dem Joystick, `seq` steigt, Layout folgt dem Kontext, Release beim Verschwinden, freundliche Fehler, Reconnect per Token, kein Scrollen/Zoomen bei Gesten; Screenshots Lobby/Spiel. |
| `ipad-zonen.spec.ts` (8 × 2 Lagen) | nachgebauter Session-Server | Zwei Zonen über eine Verbindung, gedrehte Zone im Hochformat, gleichzeitige Finger in verschiedenen Zonen mit richtigem Slot, `touchcancel`, Finger über die Zonengrenze, Drehen mitten im Spiel, vier Zonen mit vier Fingern, iPad-Modus in der Code-Eingabe; Screenshot mit zwei Zonen. |

## Ausführen

```bash
pnpm install
pnpm test                         # Vitest (Unit + Server-Integration)
pnpm test:e2e                     # baut einmal, dann alle E2E-Projekte (2 Worker)
pnpm test:e2e m1-durchstich       # nur eine Spec (Dateiname-Filter)
pnpm test:e2e --project chromium  # nur ein Projekt
pnpm test:e2e -g "geteiltes iPad" # nur Tests mit passendem Titel
pnpm check                        # Typen, Lint, Format, Vitest, Build, Lizenzen
```

Umgebungsvariablen:

- `E2E_SKIP_BUILD=1` – Build überspringen (nur lokal, wenn gerade gebaut wurde; fehlt ein Build, bricht das Setup mit Hinweis ab).
- `E2E_WORKERS=<n>` – Zahl der Worker (Standard 2). Die Host-Seiten rendern per Software; mehr als 2 Worker bringen auf 4 Kernen wenig.
- Belege für Abnahmeberichte (ungemaskierte Screenshots nach `docs/screenshots/`): `HOST_SZENE_BELEG=1`, `HOST_LOBBY_BELEG=1`, `HOST_SPIEL_BELEG=1`, `CONTROLLER_BELEG=1`.

Dauer: ein vollständiger Lauf (Build + 54 Tests) braucht auf 4 Kernen gut 1,5 Minuten; die drei Durchstich-Tests sind mit je 10–22 s die längsten (Software-Rendering, ~250 Physik-Frames). Sie haben ein eigenes Zeitlimit von 120 s.

Browser: Playwright ist auf 1.63.0 gepinnt; Chromium wird mit `pnpm exec playwright install chromium` passend installiert (CI: mit `--with-deps`).

## Messanzeige für den Gerätetest (`?debug=1`, CHAOS-45)

Bildrate und Latenz lassen sich automatisch nicht sinnvoll belegen (Chromium-Emulation, Software-Rendering, localhost). Dafür gibt es eine Messanzeige, die beim Gerätetest abgelesen wird (Entscheidung und Grenzen: [ADR-010](decisions/ADR-010-messanzeige.md)):

- **Host:** `http://localhost:8787/host/?debug=1` – unten rechts fps, Bildabstand (Median/p95), **Eingabe→Frame** (Eingang einer Controller-Eingabe bis Ende des nächsten gerenderten Frames, Median/p95, Anzahl), Pausen der Render-Schleife, WebGL-Version, Grafikkarte, Auflösung, Browser.
- **Controller:** Join-Link um `&debug=1` ergänzen (iPhone und iPad, z. B. `…/?code=ABCD&seats=2&debug=1`) – Rundlaufzeit Controller ↔ Server (Median/p95/letzte, Anzahl der letzten 60), unbeantwortete Proben, gesendete Eingaben/s, Gerät. Herzschlag dann jede Sekunde statt alle 5 s.
- **Kopieren:** Der Knopf legt eine Zeile mit allen Werten, Gerät und vollem User-Agent in die Zwischenablage. Im LAN ohne HTTPS (Handy) erscheint sie markiert in einem Textfeld zum manuellen Kopieren.
- Es gibt **keine Schwellen**: Werte notieren, zusammen mit Bedingungen (Gerät, WLAN, Abstand zum Router, Zahl der Spieler). Schwellen entstehen aus diesen M1-Baselines.
- Unit-Tests: `packages/metrics` (Ringpuffer, Median, p95, Formatierung), `apps/controller/src/debug/latencyMeter.test.ts` und Sitzung mit Messer (`session.test.ts`, künstliche Uhr + Fake-Socket), `apps/host/src/debug/frameMeter.test.ts` (vorgegebene Zeitstempel).

## Screenshot-Baselines

Eingecheckt unter `tests/e2e/__screenshots__/<spec>/<name>-<projekt>-linux.png`, **nur für Linux** (wie CI). Auf macOS/Windows fehlen Baselines; dort schlagen die Screenshot-Vergleiche fehl bzw. legen lokale Dateien an, die nicht eingecheckt werden.

| Baseline | Moment |
|---|---|
| `host-szene-chromium` | lokaler Modus, 2 Figuren, 60 Frames nach dem Start |
| `host-lobby-chromium` | Lobby mit 2 Spielern (einer bereit), Gerätewahl „iPhone“, QR-Code eines **festen** Links (der echte Link enthält einen zufälligen Port; der Test ersetzt nur `lobby.joinUrl` in der Host-Verbindung) |
| `host-spiel-3-spieler-chromium` | Spiel mit 3 Spielern (iPhone + iPad), 60 Frames nach dem Start, vor jeder Eingabe, Seed 2026 |
| `controller-lobby/-play-iphone-hoch/-quer` | Controller-Lobby und Spiel-Layout |
| `ipad-2-zonen-spiel-ipad-quer/-hoch` | iPad mit zwei Zonen im Spiel |

Stabilität: fester Seed, Kamera fest, Physik nur über `stepFrames`, `animations: 'disabled'`. Texte und Glyphen sind maskiert, weil Schriften zwischen Rechnern/Runnern abweichen; geprüft werden Layout, Farben, Formen und die 3D-Szene. Texte prüfen die DOM-Assertions. Toleranz: `maxDiffPixelRatio 0.02`, `threshold 0.2` (SwiftShader kann um einzelne Pixel abweichen).

Baseline bewusst aktualisieren (nur wenn sich die Oberfläche absichtlich geändert hat):

1. Test laufen lassen; bei Abweichung liegen `*-actual.png`, `*-expected.png` und `*-diff.png` unter `test-results/`. Prüfen, ob die Änderung gewollt ist.
2. `pnpm test:e2e:update` (aktualisiert nur abweichende Baselines) oder gezielt `pnpm test:e2e <spec> --update-snapshots=changed`.
3. Neue PNGs ansehen und mit Begründung im Commit einchecken. Auf einem Nicht-Linux-Rechner keine Baselines erzeugen; im Zweifel unter Linux mit derselben Playwright-Version (z. B. im passenden Playwright-Docker-Image) neu erzeugen.

## CI

`.github/workflows/ci.yml`: Install (`--frozen-lockfile`), Typecheck, Lint, Format, Vitest, Build, Lizenzen, Playwright-Chromium (Cache je Playwright-Version, bei Treffer nur Systempakete), dann `pnpm test:e2e --trace off`. Bei Fehlern werden `test-results/` (Diff-Bilder, Fehler-Screenshots) und `playwright-report/` (HTML-Bericht) als Artefakt `playwright-ergebnisse` hochgeladen (7 Tage). Zeitlimit des Jobs: 20 Minuten.

## Automatische Abdeckung je M1-Lieferumfang (ROADMAP)

| Lieferumfang | Automatisch belegt durch | Nur am Gerät |
|---|---|---|
| pnpm-TypeScript-Workspace (Host, Controller, Server, Protokoll) | `pnpm check` in CI (strict, Lint, Format, Build, Lizenzen) | – |
| Babylon.js-Szene mit steuerbarem Objekt, Havok | `host-szene.spec.ts` (WASM, Figuren, Tastatur, Impuls, Screenshot); Bewegung/Dash-Unit-Tests | Bildrate/Optik auf dem echten PC-Monitor |
| QR-Join über LAN, Spieler-Identität/Slots | `host-lobby.spec.ts`, `m1-durchstich.spec.ts` (Link aus der Lobby → Controller → Slot/Farbe auf Handy und Host); Netzwerkwahl-Unit-Tests | Kamera-Scan, Erreichbarkeit im WLAN, Firewall, Client-Isolation |
| Zwei iPhones gleichzeitig, getrennte Figuren | `m1-durchstich.spec.ts` Test 1 (gleichzeitige Joysticks auf zwei Seiten), Server-Integration mit mehreren `ws`-Clients | echte Gleichzeitigkeit zweier Geräte, Latenz |
| Geteiltes iPad, ≥ 2 unabhängige Touch-Zonen, Weg zu 4 | `m1-durchstich.spec.ts` Test 2/3 (zwei Finger, echte Server-Session), `ipad-zonen.spec.ts` (inkl. 4 Zonen), Zonen-Unit-Tests | echtes iPadOS-Multitouch, Handballen, Systemgesten |
| Reconnect und Trennungs-Feedback; kontextabhängiges Layout | `reconnect-slot.spec.ts`, `m1-durchstich.spec.ts` (offline/online → gleicher Platz), `controller-ui.spec.ts` (Layout folgt Kontext), Session-/Client-Unit-Tests | Bildschirmsperre, Safari im Hintergrund, WLAN-Wechsel |
| Playwright-Smoke-Tests, Protokolltests, Gerätecheckliste | diese Suiten; `packages/protocol` (161 Tests) | Checkliste selbst: `docs/device-test-checklist.md` |

## Automatische Abdeckung je M2-Lieferumfang (ROADMAP)

| Lieferumfang | Automatisch belegt durch | Nur am Gerät / im Playtest |
|---|---|---|
| 3D-Brett mit Verzweigungen und unterschiedlichen Ereignisfeldern | `validateBoard` + `board.test.ts` (Wackelwald gültig, je Regel ein kaputtes Brett), `host-brett.spec.ts` (Screenshot, `docs/screenshots/m2-host-brett.png`) | Lesbarkeit am Fernseher (Checkliste B10) |
| Würfeln, Zugreihenfolge, Pfadwahl, Bewegung | `machine`/`movement`-Tests mit Seeds, `boardGame.integration.test.ts`, `host-brett.spec.ts` (Figur hüpft Feld für Feld), `m2-brett-durchstich.spec.ts` | Verständlichkeit (B1, B2) |
| Münzen, Trophäen-Erwerb, Basis-Ökonomie | `economy`-Tests (Untergrenze 0, Kauf, zu wenig Geld, Wandern, Rangfolge mit Gleichstand), EXP-002 | Gefühl für Preise und Tempo (B11) |
| ≥ 3 Items inkl. Sabotage, begrenztes Reaktionsfenster | `items`/`reaction`-Tests (je Item, Schild/Festhalten/Timeout/verspätet), Integration mit Timeout und später Wahl, `controller-brett`/`ipad-brett` (Countdown, Reaktion beim Aufsetzen), EXP-003/004 | Reaktion in der Zeit schaffbar, Sabotage lustig statt gemein (B3, B12) |
| Brettzustand und Wertung autoritativ auf dem PC; Integrationstests Zugzyklus | Server-Integration mit synthetischen Controllern (2/3/4 Spieler, gemischt, Disconnect, Host-Reload), feste Seeds (`docs/progress.md`) | Host-Reload und Sperrbildschirm auf echten Geräten (B8, B9) |
| Erste Experimente | `docs/experiments.md` EXP-001 … EXP-004, Befehl oben | Spaß: nur Playtest |

## Automatische Abdeckung je M3-Lieferumfang (ROADMAP)

| Lieferumfang | Automatisch belegt durch | Nur am Gerät / im Playtest |
|---|---|---|
| Drei Minispiele (Arcade, Physik, Hybrid) | je Minispiel Logik- und Headless-Tests (`packages/minigames/src/<id>/`), Vertragsprüfung je Modul mit 2/3/4 Zufalls-Bots (`catalog.test.ts`), Physik-Invarianten (Pudding-Gerangel), `m3-minispiele-bild.spec.ts` | Spaß, Fairness, Verständlichkeit (Checkliste 10, P3–P7) |
| Vier kosmetische Figuren | `packages/assets` (Generator byte-genau, Manifest-Prüfung: Höhe, Animationen, Budgets), `apps/host/src/characters` (NullEngine-Tests), Baselines `host-brett`/`host-lobby` | Unterscheidbarkeit am Fernseher (P1, P2, P7) |
| Hybride Asset-Pipeline, Lizenz-/Attributions-Manifest | `pnpm check:assets` (CI-Schritt „Assets“), 14 Fälle mit kaputten Manifesten | Lizenzfrage „Eigenwerk“ (Ruben) |
| Animation, Sound, VFX, Anleitungen, Ergebnisse | Fx-Unit-Tests (Klang-Rezepte, nachgebautes WebAudio, Partikel mit NullEngine), `m3-minispiel-anzeige` (Karten), `controller-minispiel` | Klang und Lesbarkeit (P8, P9, G1–G8) |
| Experimente zu Minispiel-Konzepten | EXP-005 … EXP-007 mit Prototyp-Simulationen (`packages/minigames/src/prototypes/`, `EXPERIMENTS=1`) | Spaß: nur Playtest |
| Tests für Lebenszyklus, Wertung, Scene-Cleanup | `minigame-sdk` (Laufzeit, Wertung, Ergebnisprüfung), game-core `minigame.test.ts`, Server-Integration Brett ↔ Minispiel je Minispiel mit 2/3/4 Spielern, `sceneResidue` = leer nach `dispose` | – |

## Was die Automatik **nicht** beweist (Gerätecheckliste)

Browser-Automatisierung in Chromium mit Geräte-Emulation ist kein iPhone und kein iPad. Folgendes bleibt Handarbeit auf echten Geräten (`docs/device-test-checklist.md`):

- Echtes Multitouch in iOS-/iPadOS-Safari: mehrere Finger, Handballen, Systemgesten (Kontrollzentrum, Home-Wisch), Zoom-/Scroll-Sperren, Doppeltipp, Haptik.
- Safari-/WebKit-Eigenheiten generell (Tests laufen nur in Chromium mit iOS-User-Agent).
- QR-Scan mit der Kamera-App, Öffnen des Links, Erreichbarkeit im echten WLAN, Firewall-Dialog am PC, Gäste-WLAN/Client-Isolation.
- Eingabelatenz und „fühlt sich direkt an“; Bildrate des Hosts mit echter GPU.
- Bildschirmsperre, App-Wechsel, eingefrorene Tabs, WLAN-Wechsel und echte Funklöcher (der E2E-Netzabbruch schaltet den Browser-Kontext offline und schließt die laufende Verbindung – das ist eine Nachbildung).
- Lesbarkeit vom Sofa, Größe der Bedienelemente in der Hand, Spaß.
