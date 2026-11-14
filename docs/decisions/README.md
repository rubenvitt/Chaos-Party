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
