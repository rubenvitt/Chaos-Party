---
name: experiment-protokollieren
description: "Gameplay-, Art- oder Technik-Experiment in Chaos Party nach dem Experiment-Protokoll aus CLAUDE.md festhalten: Hypothese, Varianten, Messgrößen, Seed, Ergebnis, Entscheidung in docs/experiments.md, Zusammenfassung an der Zunder-Aufgabe, verworfene Varianten im zurückgestellten Backlog. Verwenden bei Varianten-Vergleichen (Minispiel-Konzepte, Würfelverteilung, Münz-Ökonomie, Reaktionsdauer, Item-Balance, Optik)."
---

# Experiment protokollieren (Chaos Party)

Claude darf innerhalb der Vision Minispiele, Items, Brett-Ereignisse, Tempo und Optik erfinden und vergleichen (`VISION.md`, „Experimental autonomy policy“). Jedes ernsthafte Experiment wird so festgehalten, dass Ruben die Entscheidung nachvollziehen und bei der Abnahme beurteilen kann.

## Wann

- Zwei oder mehr Varianten werden gebaut oder simuliert, um eine offene Designfrage zu klären (Liste in `VISION.md`, „Open design questions“).
- Ein Parameter wird anhand von Messwerten festgelegt (Rundendauer, Reaktionsfenster, Münzbelohnung …).
- Ein Prototyp wird verworfen oder ersetzt.

Nicht für Routine-Implementierungsentscheidungen; die gehören, falls architektonisch, in ein ADR.

## Ablauf

1. **Vorher** Eintrag in `docs/experiments.md` anlegen (Datei bei Bedarf erstellen) mit fortlaufender Nummer `EXP-<nnn>`:
   ```markdown
   ## EXP-<nnn>: <Thema> (<Datum>, <CHAOS-…>)

   **Hypothese / gewünschtes Spielerlebnis:** …
   **Varianten:** A …, B …, (C …) – erwartete Vor- und Nachteile
   **Objektive Messgrößen:** z. B. Rundendauer, Trophäen-Abstand, Sabotage-Häufigkeit, Eingabelatenz, Kollisionsstabilität, Disconnect-Rate
   **Subjektive Playtest-Fragen (für Ruben):** …
   **Testumgebung:** Rechner/Browser, Seeds, Anzahl simulierter Partien, Commit
   ```
2. Varianten bauen, Messungen mit festen Seeds durchführen; Skripte und Seeds so ablegen, dass sie wiederholbar sind.
3. **Nachher** im selben Eintrag ergänzen:
   ```markdown
   **Ergebnisse:** Tabelle/Zahlen, Screenshot- oder Videopfade
   **Entscheidung:** keep / iterate / discard – Begründung
   **Offen für Playtest:** was nur Menschen beurteilen können
   ```
   Automatische Messwerte sind **Näherungen**, kein Beweis für Spaß. So formulieren.
4. **Zunder:** `add_comment` an der auslösenden Aufgabe:
   ```
   **<Datum>, Experiment EXP-<nnn>:** <Thema>
   - Varianten: …
   - Ergebnis in Kürze: …
   - Entscheidung: … (Details in docs/experiments.md)
   - Für die Abnahme: <Playtest-Frage>
   ```
   Die Playtest-Frage zusätzlich in den Abnahmebericht des Meilensteins übernehmen (`meilenstein-abnahme`).
5. Verworfene Varianten, die später noch interessant sein könnten → Unteraufgabe von `CHAOS-44` mit Verweis auf `EXP-<nnn>`. Code dafür nicht im Hauptzweig liegen lassen.
6. Folgt aus dem Experiment eine neue Aufgabe im aktuellen Meilenstein (z. B. „Variante B ausbauen“) → `create_task` unter dem Meilenstein-Epic.

## Grenzen

- Experimente dürfen nichts ändern, was eine Freigabe braucht: PC-only-Host, 2–4 lokale Spieler, Controller-Modell, Genre, Trophäen-Sieg, Art-Direction-Kern, Meilenstein-Umfang, Kosten. Sonst → `blocker-eskalieren`.
- Nur eigene Spielideen; keine Nachbauten bestehender Spiele (Namen, Figuren, Levels, Look).
- Keine kostenpflichtigen Assets oder Dienste ohne Freigabe; Lizenzen jedes Assets im Manifest.
