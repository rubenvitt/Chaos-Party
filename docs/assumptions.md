# Annahmen, die validiert werden müssen

**Stand:** 2026-11-14 · **Quelle:** `VISION.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `CLAUDE.md` · **Erstellt in:** CHAOS-5

Diese Liste sammelt alles, was die Projektdokumente voraussetzen, aber noch nicht bewiesen ist. Jede Annahme hat einen Validierungsweg und eine zuständige Aufgabe. Ist eine Annahme geprüft, wird der Status hier nachgetragen (mit Datum und Nachweis), nicht gelöscht.

**Status:** `offen` · `teilweise` (automatisch geprüft, echte Hardware fehlt) · `bestätigt` · `widerlegt` (→ Entscheidung/ADR verlinken)

**Validierungsart:**
- **Auto** – Unit-/Integrations-/E2E-Test im Repo, läuft in CI
- **Spike** – kleiner Versuch im Code, Ergebnis in `docs/experiments.md` oder einem ADR
- **Gerät** – nur auf echter Hardware prüfbar → `docs/device-test-checklist.md` (CHAOS-15), Durchführung durch Ruben
- **Playtest** – nur Menschen können es beurteilen → Frage im Abnahmebericht

> Browser-Automatisierung und Emulatoren beweisen **kein** echtes iOS-Multitouch, keine LAN-Erreichbarkeit, keine Sensoren und keine echte Eingabelatenz. Alles mit „Gerät“ gilt erst nach Rubens Test als bestätigt.

## A. Controller auf iPhone und iPad

| ID | Annahme | Risiko | Validierungsweg | Aufgabe | Status |
|---|---|---|---|---|---|
| A1 | iPad-Safari liefert mehrere gleichzeitige Touches mit stabiler `Touch.identifier`, sodass **2 Spieler-Zonen** unabhängig gleichzeitig bedienbar sind. | hoch | Auto: Zonen-Logik (Touch-ID → Zone beim `touchstart`, Besitz bis `touchend`/`touchcancel`) als Unit-Test; Playwright mit synthetischen Multitouch-Events. Gerät: zwei Personen drücken/ziehen gleichzeitig, kein Übersprechen. | CHAOS-13 | offen |
| A2 | Dasselbe skaliert auf **3–4 Zonen** (je 1–2 Finger pro Person, also bis ~8 gleichzeitige Touches). | hoch | Spike: Layoutskizze 3/4 Zonen; Gerät: 4 Personen gleichzeitig, Anzahl gleichzeitig gemeldeter Touches notieren. | CHAOS-13 | offen |
| A3 | iPadOS-Systemgesten (Mehrfinger-Wischen zu Home/App-Switcher, Kontrollzentrum, Wischen vom Rand) stören das Spiel nicht oder lassen sich umgehen. | hoch | Gerät: 4+ Finger gleichzeitig, Ränder testen; Fallback dokumentieren (z. B. „Geführter Zugriff“ aktivieren, Mehrfingergesten in den Einstellungen abschalten, Zonen vom Rand fernhalten). | CHAOS-13, CHAOS-15 | offen |
| A4 | iOS-Safari-Eigenheiten sind per Web-Mitteln abschaltbar: Doppeltipp-/Pinch-Zoom, Scrollen/Bounce, Textauswahl, Long-Press-Menü, Lupe (`touch-action: none`, `user-select`, `-webkit-touch-callout`, `preventDefault` auf `gesturestart`). `user-scalable=no` allein reicht **nicht**. | mittel | Auto: CSS/Handler vorhanden (E2E prüft, dass kein Scroll/Zoom auftritt, soweit emulierbar). Gerät: Hämmern, Doppeltipps, langes Halten. | CHAOS-10 | offen |
| A5 | Wischen vom linken Rand (Safari-Zurück) und Pull-to-Refresh lösen beim iPhone-Controller nicht versehentlich Navigation aus. | mittel | Gerät; Fallback: History-State-Schutz, Reconnect fängt Reload ab, Hinweis „Zum Home-Bildschirm hinzufügen“. | CHAOS-10, CHAOS-12 | offen |
| A6 | Das Layout funktioniert in **Hoch- und Querformat**; eine Orientierungssperre per Web-API ist auf iOS **nicht** verfügbar. | mittel | Auto: Playwright-Screenshots beider Orientierungen; Gerät: Drehen mitten im Spiel, laufende Touches werden sauber beendet. | CHAOS-10, CHAOS-13 | offen |
| A7 | Ein Controller ohne Spielwelt-Rendering ist auf älteren iPhones flüssig (reines DOM/CSS, keine WebGL-Last). | niedrig | Gerät: ältestes verfügbares iPhone mitprüfen. | CHAOS-10 | offen |
| A8 | Touch-only reicht für M1; Bewegungssensoren sind optional. `DeviceMotionEvent.requestPermission()` braucht auf iOS eine Nutzergeste **und einen Secure Context** (HTTPS) – über `http://<LAN-IP>` also voraussichtlich nicht verfügbar. | mittel | Spike erst bei Bedarf (nach M1); bis dahin Touch-only, kein Sensor-Feature einplanen. | CHAOS-44 (zurückgestellt) | offen |
| A9 | Gemischte Aufstellungen (z. B. 2 iPhones + iPad mit 2 Zonen) sind mit demselben Protokoll möglich, wenn eine Verbindung mehrere Slots halten darf. | mittel | Auto: Integrationstest mit gemischten synthetischen Controllern; Protokollentscheidung „eine Verbindung ↔ n Slots“ in CHAOS-7/9 festhalten. Gerät: einmal gemischt spielen. | CHAOS-7, CHAOS-9, CHAOS-13 | offen |

## B. Netzwerk, Join und Verbindung

| ID | Annahme | Risiko | Validierungsweg | Aufgabe | Status |
|---|---|---|---|---|---|
| B1 | iPhones/iPad im selben WLAN erreichen den PC direkt über seine LAN-IP. Gäste-WLANs oder **AP-/Client-Isolation** verhindern das; das muss erkennbar und dokumentiert sein. | hoch | Gerät: Join im Heim-WLAN; Doku der Stolperfallen (Gästenetz, Isolation, Mesh, VPN auf dem PC). | CHAOS-11, CHAOS-15 | offen |
| B2 | Die **PC-Firewall** (Windows Defender/macOS) lässt eingehende Verbindungen auf dem Spiel-Port zu, nachdem man einmal freigibt. | hoch | Gerät + Doku: Freigabeschritte je Betriebssystem; Host zeigt einen Hinweis, wenn nach X s kein Controller beitritt. | CHAOS-11, CHAOS-15 | offen |
| B3 | Der Server kann bei mehreren Netzwerkschnittstellen (WLAN, Ethernet, VPN, Docker/WSL, virtuelle Adapter) die richtige LAN-Adresse wählen; sonst manuelle Auswahl. | mittel | Auto: Unit-Test der Adresswahl (Filter für Loopback, Link-Local, virtuelle Adapter, private Bereiche zuerst). Gerät: QR auf PC mit VPN/WSL. | CHAOS-11 | offen |
| B4 | Ein **QR-Code mit `http://<LAN-IP>:<Port>/...`** wird von der iOS-Kamera geöffnet und funktioniert ohne HTTPS. | mittel | Gerät: Scan mit Kamera-App iPhone + iPad. | CHAOS-11, CHAOS-15 | offen |
| B5 | Für M1 sind **keine Secure-Context-Features** nötig (kein HTTPS-Zertifikat). Betroffen wären u. a. Bewegungssensoren (A8), Screen Wake Lock (B7), Service Worker/PWA-Offline. | mittel | Review: Liste der genutzten Browser-APIs pro Feature; wird ein Secure-Context-Feature nötig → Spike „lokales HTTPS“ + ADR. | CHAOS-10, CHAOS-11 | offen |
| B6 | WebSockets über das LAN liefern eine **tolerierbare Eingabelatenz** für Brettspiel und einfache Reflex-Minispiele. Schwellenwerte werden aus M1-Messungen abgeleitet, nicht vorab erfunden. | hoch | Auto: Latenz-Instrumentierung (Sendezeit Controller → Empfang Server → Frame auf Host) mit Rundlauf-Messung. Gerät: gefühlte Latenz + gemessene Werte im Checklisten-Protokoll. | CHAOS-8, CHAOS-9, CHAOS-15 | offen |
| B7 | iOS sperrt den Bildschirm bzw. friert Hintergrund-Tabs ein → WebSocket bricht ab. **Reconnect** mit Session-Token stellt den Slot zuverlässig wieder her. Screen Wake Lock (braucht Secure Context) steht über HTTP voraussichtlich nicht zur Verfügung. | hoch | Auto: Integrationstests Abbruch/Rejoin/abgelaufener/fremder Token. Gerät: Bildschirm sperren, App wechseln, WLAN kurz aus, Reload. | CHAOS-12 | offen |
| B8 | Client-Uhren sind nicht synchron und nicht vertrauenswürdig; veraltete Inputs werden über **Sequenznummern** und Server-Empfangszeit erkannt, nicht über Client-Zeitstempel. | mittel | Auto: Protokolltests mit vertauschten/doppelten/alten Sequenzen. | CHAOS-7 | offen |
| B9 | Ein einziger Node-Prozess auf einem Port kann Controller-App (statisch) **und** WebSocket ausliefern; das vereinfacht QR-URL und Firewall-Freigabe. | niedrig | Spike beim Monorepo-Setup; Entscheidung im Server-Aufbau festhalten. | CHAOS-6, CHAOS-9 | teilweise: statische Auslieferung + `/health` auf einem Port getestet (CHAOS-6, ADR-002); WebSocket auf demselben Port folgt in CHAOS-9 |
| B10 | Kurze Join-Codes und Controller-Tokens reichen als Schutz im lokalen Netz (kein Account-System); Spoofing, Doppel-Join und Flooding werden serverseitig abgewiesen. | mittel | Auto: Missbrauchsfälle als Integrationstests (fremde Spieler-ID, doppelter Join, Rate-Limit, kaputte Nachrichten). | CHAOS-7, CHAOS-9 | offen |

## C. PC-Host, 3D und Physik

| ID | Annahme | Risiko | Validierungsweg | Aufgabe | Status |
|---|---|---|---|---|---|
| C1 | **Havok-WASM** (`@babylonjs/havok`) lädt im Dev-Server **und** im Production-Build (richtiger Pfad, MIME-Typ `application/wasm`, Bundler kopiert die Datei). | mittel | Auto: E2E prüft, dass die Physik-Engine im Production-Build initialisiert ist; Screenshot. | CHAOS-8 | offen |
| C2 | Babylon.js (WebGL2, optional WebGPU) läuft in einem aktuellen Desktop-Browser auf Rubens PC mit flüssiger Bildrate für eine einfache Szene mit 4 Spielerobjekten. | mittel | Auto: FPS-Messung im Headless-Browser nur als grober Rauchtest. Gerät: echte Bildrate auf Rubens PC (Hardware im Protokoll). | CHAOS-8, CHAOS-15 | offen |
| C3 | Headless-Chromium in CI kann die Szene rendern (Software-GL), sodass **Screenshot-Tests** stabil sind – mit fester Kamera, festem Seed, festen Zeitschritten und Toleranz. | mittel | Spike: zweimal hintereinander gleiche Screenshots in CI; bei Flakiness Toleranz/Maskierung, dokumentiert. | CHAOS-8, CHAOS-14 | offen |
| C4 | Havok ist **nicht** bitgenau deterministisch über Plattformen hinweg; Tests prüfen Invarianten und Ergebnisse, nicht exakte Positionen. | niedrig | Design-Regel; in Tests umgesetzt (keine Positions-Snapshots von Physikobjekten). | CHAOS-8 | offen |
| C5 | React-UI-Overlay und Babylon-Canvas lassen sich ohne Render-Konflikte kombinieren (React rendert DOM, Babylon den Canvas; Zustand fließt einseitig). | niedrig | Umsetzung + E2E. | CHAOS-8 | offen |
| C6 | Ein **Browser als Host** reicht (Vollbild, kein Tauri/Electron nötig). | niedrig | Beobachtung bei M1-Abnahme; Wechsel nur mit ADR und Freigabe. | CHAOS-16 | offen |

## D. Tooling und Qualität

| ID | Annahme | Risiko | Validierungsweg | Aufgabe | Status |
|---|---|---|---|---|---|
| D1 | pnpm-Workspace mit TypeScript strict, Lint, Format, Vitest und Production-Build läuft lokal und in GitHub Actions mit `pnpm install --frozen-lockfile`. | niedrig | Auto: CI-Workflow grün. | CHAOS-6 | teilweise: alle Gates lokal grün (2026-11-14); CI-Nachweis im PR zu CHAOS-6 |
| D2 | Playwright kann **mehrere Controller-Clients** und einen Host parallel steuern; Multitouch lässt sich in Chromium über CDP (`Input.dispatchTouchEvent`) synthetisch erzeugen. Das ersetzt **nicht** den Gerätetest. | mittel | Auto: E2E mit 2 Controllern + iPad-Zonen. | CHAOS-14 | offen |
| D3 | Die WebKit-Engine von Playwright (Linux) bildet iOS-Safari nur grob ab; Ergebnisse sind Hinweise, keine Bestätigung. | mittel | Design-Regel; Abweichungen in der Gerätecheckliste notieren. | CHAOS-14, CHAOS-15 | offen |
| D4 | Spielregeln lassen sich als reine TypeScript-Zustandsmaschine mit **Seeded RNG** formulieren und vollständig ohne Rendering testen. | niedrig | Auto: Unit-/Integrationstests ab M2; in M1 mindestens das Paketgerüst. | CHAOS-6 (Gerüst), CHAOS-17 | offen |

## E. Produktannahmen (für Playtests, nicht in M1 zu entscheiden)

| ID | Annahme | Validierungsweg | Meilenstein | Status |
|---|---|---|---|---|
| E1 | Trophäen als Siegressource, **Münzen als Tiebreaker** ist fair und verständlich (laut VISION ein Vorschlag, keine feste Regel). | Playtest + Experiment zur Ökonomie | M2 | offen |
| E2 | Kurze, begrenzte Reaktionsfenster halten das Tempo und fühlen sich fair an. | Experiment Reaktionsdauer + Playtest | M2 | offen |
| E3 | Sabotage wirkt überraschend und lustig statt frustrierend. | Playtest | M2 | offen |
| E4 | Ein gemeinsames iPad mit 2–4 Zonen ist bequem genug (Platz pro Hand, Blickrichtung zum PC-Bildschirm, Gedränge). | Playtest + Gerätetest | M1 (2 Zonen), M4 (4 Zonen) | offen |
| E5 | Spieler verstehen Controls ohne Erklärung allein über das kontextabhängige Layout. | Playtest | M1 (Grundlayout), M4 | offen |

## Offene Fragen an Ruben (nicht blockierend)

Diese Angaben machen Gerätetests und Leistungsziele konkret. Sie blockieren die nächsten Aufgaben nicht; bis zur Antwort wird mit „aktueller Desktop-Chromium/Firefox, aktuelles iOS“ gearbeitet.

1. Welche Geräte stehen für die M1-Abnahme bereit (iPhone-Modelle, iPad-Modell, jeweils iOS-/iPadOS-Version)?
2. Welcher PC hostet (Betriebssystem, GPU, bevorzugter Browser)?
3. Welches Netz wird genutzt (normales Heim-WLAN, Mesh, getrenntes Gästenetz)? Hängt der PC per LAN-Kabel oder WLAN?

## Änderungsprotokoll

| Datum | Änderung | Aufgabe |
|---|---|---|
| 2026-11-14 | Erstfassung aus den vier Projektdokumenten | CHAOS-5 |
| 2026-11-14 | B9, D1 auf „teilweise“ (Monorepo-Gerüst) | CHAOS-6 |
