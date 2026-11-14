# ADR-001: Technischer Stack

**Status:** Angenommen (übernimmt den Vorschlag aus `ARCHITECTURE.md`; Hochrisiko-Teile werden in M1 per Spike verifiziert)
**Datum:** 2026-11-14
**Aufgabe:** CHAOS-5
**Betroffene Annahmen:** `docs/assumptions.md` C1–C6, B6, B9, D1–D4

## Kontext

Chaos Party ist ein lokales 3D-Party-Brettspiel. Das Spiel läuft **nur auf dem PC**; iPhones und ein geteiltes iPad sind reine Browser-Controller ohne Spielwelt-Rendering (`VISION.md`). Der PC hält den autoritativen Zustand. Die Entwicklung ist code-first und stark automatisiert getestet (`CLAUDE.md`, „Quality gates“). Gebraucht wird also:

- eine 3D-Engine mit Physik, die im Desktop-Browser läuft und sich rein im Code steuern lässt,
- eine UI-Schicht für Host (Lobby, HUD, Ergebnisse) und Controller (Touch-Layouts),
- ein einfacher, schneller Kanal Controller → PC im lokalen Netz,
- ein Workspace mit geteilten Typen (Protokoll, Regeln) und Testwerkzeugen für Logik und Browser.

## Entscheidung

| Bereich | Wahl | Begründung |
|---|---|---|
| 3D-Host | **Babylon.js** + TypeScript | Vollständige Engine (Szene, Kamera, Animation, Partikel, glTF) mit eigenem TypeScript-Code, gute Doku, Inspector zum Debuggen, offizielle Havok-Integration |
| Physik | **Havok** über `@babylonjs/havok` (Physics V2) | Offiziell unterstützt, performant, kostenlos als WASM-Paket; kein Fremd-Plugin nötig |
| Host-UI | **React** | DOM-Overlay über dem Canvas für Lobby/HUD/Ergebnisse; dieselbe Technik wie im Controller |
| Controller-UI | **React**-Web-App | Kein App-Store, Join per QR; nur DOM/CSS, kein WebGL auf den Mobilgeräten |
| Kommunikation | **WebSockets** (Node-Server auf dem PC) | Bidirektional, im LAN latenzarm, in jedem Browser ohne Zusatz verfügbar, einfach zu testen |
| Spielregeln | **Reines TypeScript-Paket** mit Seeded RNG | Deterministisch und ohne Rendering testbar |
| Workspace | **pnpm**-Monorepo | Geteilte Pakete (`protocol`, `game-core`), strikte Abhängigkeitsauflösung, schnelles Install, Lockfile für CI |
| Unit/Integration | **Vitest** | Schnell, TypeScript ohne extra Build, gleiche Konfiguration wie das Bundling |
| E2E/Visuell | **Playwright** | Mehrere Browser-Kontexte parallel (Host + n Controller), Geräteemulation, Screenshot-Vergleiche, CDP für synthetisches Multitouch |
| Auslieferung | **Browser zuerst**; Tauri nur bei nachgewiesenem Bedarf | Kein Packaging-Aufwand in M1 |

Folgeentscheidungen, die **nicht** hier, sondern in den jeweiligen Aufgaben getroffen und festgehalten werden:

- Bundler/Dev-Server (voraussichtlich Vite), Node-LTS-Version, Lint/Format-Werkzeuge → CHAOS-6
- Schema-Bibliothek für die Laufzeitvalidierung (z. B. zod oder valibot), Nachrichtenformat und -versionierung → CHAOS-7
- WebSocket-Implementierung auf dem Server (z. B. `ws`), Port und Auslieferung der Controller-App → CHAOS-9
- Ob Pakete wie `minigame-sdk`, `ui`, `assets` sofort angelegt oder später ausgegliedert werden → CHAOS-6 (Grundsatz: Pakete erst, wenn sie mehr bringen als kosten)

## Betrachtete Alternativen

| Alternative | Warum nicht (jetzt) |
|---|---|
| Three.js + Rapier/cannon-es | Schlanker, aber Szenenverwaltung, Animation, Inspector und Physik-Integration müssten zusammengesetzt werden; mehr Eigenbau für dasselbe Ergebnis |
| PlayCanvas | Stark editorzentriert; Code-first-Arbeit und Tests ohne Editor weniger natürlich |
| Godot / Unity mit Web-Export | Editor- und Asset-zentrierter Workflow, große Web-Builds, schlechter automatisierbar durch einen Agenten; Controller bräuchte ohnehin einen separaten Web-Stack |
| WebRTC-Datenkanäle | Etwas geringere Latenz (unzuverlässiger Modus), aber Signalisierung und ICE auch im LAN aufwendiger; erst prüfen, wenn WebSocket-Latenz gemessen zu hoch ist (Annahme B6) |
| Socket.IO | Zusatzprotokoll und Fallbacks, die im LAN nicht gebraucht werden; eigene typisierte Nachrichten über rohe WebSockets sind transparenter und leichter zu validieren |
| npm/yarn Workspaces, Turborepo, Nx | pnpm deckt Workspaces ab; Build-Orchestrierung erst bei nachgewiesenem Bedarf |
| Jest | Langsamer mit TypeScript/ESM, zusätzliche Transform-Konfiguration |
| Cypress | Mehrere gleichzeitige Browser-Kontexte (Host + Controller) deutlich umständlicher |

## Konsequenzen

**Positiv**
- Ein Sprachraum (TypeScript) für Host, Controller, Server, Protokoll und Regeln; Typen werden geteilt statt dupliziert.
- Regeln und Protokoll sind ohne Browser testbar; Browserflüsse mit mehreren Clients über Playwright.
- Kein Install auf den Mobilgeräten; Join per QR.

**Negativ / Risiken**
- Havok-WASM muss im Bundling korrekt ausgeliefert werden (Annahme C1).
- Havok ist nicht bitgenau deterministisch; Physik-Tests prüfen Invarianten (C4).
- Screenshot-Tests mit Software-Rendering in CI können flackern (C3).
- WebSocket-Latenz im echten WLAN ist unbekannt (B6); Messung in M1.
- Babylon.js-Bundle ist groß; für den PC-Host unkritisch, für Controller irrelevant (Controller laden Babylon nicht).

## Überprüfung

Dieses ADR wird überarbeitet, wenn ein M1-Spike eine der Kernannahmen widerlegt. Ein Wechsel von Engine, Server-Topologie oder Packaging braucht laut `ARCHITECTURE.md` einen kleinen Nachweis, Vergleichsdaten, ein neues ADR und – bei spürbarer Änderung von Umfang oder Wartungsaufwand – Rubens Freigabe.
