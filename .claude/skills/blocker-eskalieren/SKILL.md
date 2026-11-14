---
name: blocker-eskalieren
description: "Blocker in Chaos Party sauber eskalieren statt endlos zu probieren: nach drei ernsthaften, verschiedenen Fehlversuchen oder wenn eine Entscheidung Rubens Freigabe braucht (Produktsäulen, Umfang, Kosten, Architekturwechsel, Lizenzfragen). Beweise und Optionen zusammenfassen, kleinste Frage stellen, Zunder-Aufgabe auf blocked setzen, docs/blockers.md pflegen."
---

# Blocker eskalieren (Chaos Party)

Grundlage: `CLAUDE.md`, „Failure and blocker policy“ und „Escalate or obtain explicit approval for“.

## Auslöser

- **Technisch:** drei ernsthafte, **materiell verschiedene** Lösungsversuche für dieselbe Ursache sind gescheitert.
- **Befugnis:** die Aufgabe verlangt eine Änderung an PC-only-Host, 2–4 lokalen Spielern, Handy/iPad-Steuerung, Trophäen-Sieg, Genre, Art-Direction-Kern, Meilenstein-Umfang; kostenpflichtige Dienste/Assets; Zugangsdaten; Veröffentlichung/Deployment außerhalb der lokalen Umgebung; größere Architekturwechsel (z. B. Babylon.js ersetzen).
- **Recht:** unklare Lizenz eines Assets oder einer Abhängigkeit.
- **Hardware:** etwas lässt sich nur auf echten iPhones/iPads klären (dann ist es meist kein Blocker, sondern ein Punkt für die Gerätecheckliste; Blocker nur, wenn ohne die Antwort nicht sinnvoll weitergearbeitet werden kann).

## Ablauf

1. **Nicht weiter probieren.** Keine Tests abschalten, keine Akzeptanzkriterien aufweichen, keinen Umfang still streichen.
2. **Eintrag in `docs/blockers.md`** (Datei bei Bedarf anlegen):
   ```markdown
   ## <Datum> – <Kurztitel> (<CHAOS-…>)

   **Symptom:** was passiert, mit Fehlermeldung/Logauszug
   **Ursache (Stand):** was gesichert ist, was vermutet
   **Versuche:** 1. … → Ergebnis; 2. … → Ergebnis; 3. … → Ergebnis
   **Optionen:** A … (Aufwand, Risiko), B …, C …; Empfehlung
   **Frage an Ruben:** <eine kleinste, beantwortbare Frage>
   **Status:** offen
   ```
3. **Zunder** an der betroffenen Aufgabe:
   - `add_comment` mit Kurzfassung (Symptom, Versuche in je einem Satz, Optionen, Empfehlung, **die eine Frage**) und Verweis auf `docs/blockers.md`.
   - `update_task`: `status: blocked`, `waiting_on: "Ruben"`, `plan` = „Blockiert: <Frage in Kurzform>“. (`waiting_on` allein blockiert nur offene Aufgaben, nicht solche in Arbeit.)
   - Hängt der Blocker an einer anderen Aufgabe, stattdessen `blocked_by` setzen (bestehende Liste mitnehmen).
   - Claim mit `release_task` freigeben, wenn die Sitzung endet.
4. **Weiterarbeiten, wo möglich:** andere freie Aufgaben des Meilensteins mit `aufgabe-umsetzen` angehen, sofern sie nicht vom Blocker abhängen.
5. **In der Antwort** die Frage klar und für sich verständlich stellen; bei echten Wahlmöglichkeiten Optionen mit Empfehlung anbieten.

## Auflösen

Wenn Ruben antwortet:
1. Seine Entscheidung als `## Notizen` mit Datum an die Beschreibung der Aufgabe anhängen, wenn sie den Auftrag ändert (vorher `get_task`, alte Beschreibung + Nachtrag schreiben); sonst als Kommentar.
2. `update_task`: `waiting_on: null`, `status: in_progress`, neuer `plan`.
3. In `docs/blockers.md` Status „gelöst <Datum>: <Entscheidung>“; bei Architekturentscheidungen zusätzlich ein ADR in `docs/decisions/`.
4. Ändert die Entscheidung Produkt oder Umfang, die betroffenen Dokumente (`VISION.md`, `ROADMAP.md`, `ARCHITECTURE.md`) nur mit Rubens ausdrücklicher Zustimmung anpassen.
