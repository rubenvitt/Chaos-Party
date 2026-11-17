# Architekturentscheidungen (ADRs)

Hier stehen Architekturentscheidungen, die über eine einzelne Aufgabe hinaus gelten. Gameplay- und Art-Varianten gehören nicht hierher, sondern nach `docs/experiments.md`.

## Regeln

- Dateiname: `ADR-<nnn>-<kurzname>.md`, fortlaufend nummeriert, Vorlage: [`ADR-000-vorlage.md`](ADR-000-vorlage.md).
- Jedes ADR nennt die auslösende Zunder-Aufgabe (`CHAOS-…`); die Aufgabe verlinkt umgekehrt auf die Datei.
- Angenommene ADRs werden nicht umgeschrieben. Ändert sich die Entscheidung, entsteht ein neues ADR, das das alte **ersetzt**; im alten wird nur der Status auf „Ersetzt durch ADR-…“ gesetzt.
- Wechsel von Engine, Server-Topologie oder Packaging sowie alles, was Produktsäulen berührt, brauchen Rubens Freigabe (`CLAUDE.md`, „Escalate or obtain explicit approval“).

## Verzeichnis

| ADR | Titel | Status | Aufgabe |
|---|---|---|---|
| [ADR-001](ADR-001-stack.md) | Technischer Stack | Angenommen | CHAOS-5 |
| [ADR-002](ADR-002-workspace-tooling.md) | Workspace-Aufbau und Werkzeuge | Angenommen | CHAOS-6 |
| [ADR-003](ADR-003-protokoll.md) | Controller-Protokoll (typisiert, versioniert, laufzeitvalidiert) | Angenommen | CHAOS-7 |
| [ADR-004](ADR-004-host-szene.md) | Host-Szene mit Babylon.js und Havok – WASM-Laden, Eingabe-Naht, Testmodus | Angenommen | CHAOS-8 |
| [ADR-005](ADR-005-session-server.md) | Lokaler autoritativer Session-Server | Angenommen | CHAOS-9 |
| [ADR-006](ADR-006-controller-ui.md) | iPhone-Controller: Client/Reducer/UI-Schnitt, Joystick per Pointer Events, iOS-Härtung, Test mit nachgebautem Server | Angenommen | CHAOS-10 |
| [ADR-007](ADR-007-lan-join.md) | QR-Join über eine LAN-Adresse, ein Prozess für Host und Controller | Angenommen | CHAOS-11 |
| [ADR-008](ADR-008-ipad-zonen.md) | Geteiltes iPad: Spielerzonen, Touch Events mit Zonen-Tracker, Drehen | Angenommen | CHAOS-13 |
| [ADR-009](ADR-009-reconnect.md) | Reconnect und Verbindungsanzeige: Herzschlag, Timeouts, Token-/Slot-Politik, Client-Backoff | Angenommen | CHAOS-12 |
| [ADR-010](ADR-010-messanzeige.md) | Messanzeige mit `?debug=1`: Rundlaufzeit, Bildrate, Eingabe→Frame als M1-Baseline | Angenommen | CHAOS-45 |
| [ADR-011](ADR-011-brettspiel.md) | Brettspiel in M2: Regeln als reiner Reducer im Server, Protokoll v2, Host zeigt nur an | Angenommen | CHAOS-2 |
| [ADR-012](ADR-012-minispiele.md) | Minispiele in M3: Logik im PC-Host, Server als Schiedsrichter, fester 1/60-Takt, Protokoll v3 | Angenommen | CHAOS-3 |
| [ADR-013](ADR-013-figuren-blender.md) | Figuren aus Blender-Skripten (bpy) statt aus dem Babylon-Generator | Angenommen | CHAOS-58 |
| [ADR-014](ADR-014-natur-look.md) | Natur-Look im Spiel: PBR mit HDRI, Grafikstufen und Sparstufe für Software-Rendering | Angenommen | CHAOS-62 |
| [ADR-015](ADR-015-vertical-slice.md) | Vertical Slice in M4: Charakterwahl, Rundenzahl, Pause/Ende, Gleichstandsregel, Revanche, Protokoll v4 | Angenommen | CHAOS-4 |
| [ADR-016](ADR-016-renderer.md) | Renderer: bei Babylon.js bleiben, WebGPU als Option messen, tvOS getrennt entscheiden | Vorgeschlagen (Entwurf, wartet auf Messwerte) | CHAOS-75 |
| [ADR-017](ADR-017-native-controller.md) | Native Controller-App in SwiftUI für iPhone/iPad, Browser-Controller bleibt Rückfall | Vorgeschlagen (Entwurf, Vertrag steht) | CHAOS-115 |
| [ADR-018](ADR-018-lizenz.md) | Projektlizenz GPL-3.0-only für Code und eigene Assets, Lizenzhinweise im Build | Angenommen | CHAOS-69 |
