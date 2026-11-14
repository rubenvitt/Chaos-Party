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
