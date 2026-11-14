---
name: meilenstein-abnahme
description: "Abnahme-Gate eines Chaos-Party-Meilensteins (M1–M4) vorbereiten oder Rubens Entscheidung eintragen: Vollständigkeit in Zunder prüfen, Quality Gates laufen lassen, Abnahmebericht nach ROADMAP-Vorlage schreiben, an der Gate-Aufgabe kommentieren, nach APPROVED/CHANGES REQUESTED/BLOCKED die Aufgaben nachziehen. Verwenden bei „M1 abnahmebereit?“, „Abnahmebericht“, „M1 ist freigegeben“, „Änderungen an M2“."
---

# Meilenstein-Abnahme (Chaos Party)

Jeder Meilenstein endet mit einer **menschlichen** Abnahme. Claude bereitet sie vor und trägt die Entscheidung ein, trifft sie aber nie selbst. Grüne CI ist keine Abnahme (`ROADMAP.md`, „Definition of Done vs. milestone approval“).

| Meilenstein | Epic | Gate-Aufgabe | Schaltet frei |
|---|---|---|---|
| M1 Technischer Durchstich | `CHAOS-1` | `CHAOS-16` | `CHAOS-2` |
| M2 Spielbares Brett | `CHAOS-2` | `CHAOS-25` | `CHAOS-3` |
| M3 Minispiele & Optik | `CHAOS-3` | `CHAOS-35` | `CHAOS-4` |
| M4 Vertical Slice | `CHAOS-4` | `CHAOS-43` | Abschluss |

Gate-Kennungen im Zweifel per `get_task` am Epic prüfen (Unteraufgabe mit Titel „M<n>-Abnahme …“).

## A. Abnahme vorbereiten

1. **Vollständigkeit:** `filter_tasks` mit `parent_id: <Epic>` (mit `include_closed`). Alle Arbeitsaufgaben außer dem Gate müssen `done` oder begründet `dropped` sein. Offene → auflisten, nicht weitermachen (außer Ruben will eine Teilabnahme).
2. **Gates laufen lassen** auf dem Stand von `main` (oder dem Release-Branch): `pnpm install --frozen-lockfile`, typecheck, lint, format, unit, integration, Playwright (`--trace off`), build. Ergebnisse wörtlich festhalten, nichts schönen.
3. **Nachweise sammeln:** Screenshots/Videos, reproduzierbare Seeds, Experimente des Meilensteins aus `docs/experiments.md`, ADRs, bekannte Fehler.
4. **Gerätecheckliste:** `docs/device-test-checklist.md` für diesen Meilenstein aktuell; jeder Punkt als „offen“, solange Ruben ihn nicht auf echter Hardware geprüft hat.
5. **Bericht schreiben** in `docs/acceptance/M<n>.md` nach der Vorlage aus `ROADMAP.md`:
   ```text
   Milestone:
   Build / commit:
   Automated gates (pass/fail):
   Real-device checks (performed / not performed):
   What can be played now:
   Experiments and decisions:
   Known defects / limitations:
   Questions for product owner:
   Decision: (offen – Entscheidung durch Ruben)
   ```
   Dazu eine kurze **Testanleitung für Ruben** (Start auf dem PC, QR, was ausprobieren, worauf achten). Bei M1 ausdrücklich: Real-Device-Checks sind **nicht durchgeführt**, bis Ruben sie meldet.
6. Bericht per PR ins Repo, Kennung des Gates in der Beschreibung.
7. **Zunder:** `add_comment` an der Gate-Aufgabe mit Link auf Bericht und PR, den Fragen an Ruben und der Testanleitung in Kurzform. Das Gate bleibt `open`; **nicht** auf `done` setzen.
8. Ruben in der Antwort sagen, dass der Meilenstein zur Abnahme bereit ist und was er tun muss.

## B. Entscheidung eintragen

Nur wenn Ruben sie **ausdrücklich** gibt (im Chat oder als Zunder-Kommentar). Seine Worte zitieren.

### APPROVED
1. `add_comment` am Gate: „**<Datum>, APPROVED durch Ruben:** „<Zitat>““ plus Ergebnis der Gerätechecks, soweit er sie genannt hat.
2. Gate `update_task status: done` → der Server gibt das nächste Epic und seine ersten Aufgaben frei.
3. `docs/acceptance/M<n>.md`: Decision und Gerätecheck-Ergebnisse eintragen; `docs/progress.md` auf den nächsten Meilenstein stellen.
4. Epic des Meilensteins auf `done` setzen.
5. Die jetzt freien Aufgaben des nächsten Meilensteins nennen; erst auf Rubens Zeichen anfangen, außer er hat Weiterarbeiten schon erlaubt.

### CHANGES REQUESTED
1. Kommentar am Gate mit Zitat.
2. Jeden Änderungswunsch als Aufgabe unter dem Meilenstein-Epic anlegen (`## Kontext: Änderungswunsch aus der Abnahme M<n> (<Datum>)`, Akzeptanzkriterien aus Rubens Worten).
3. Gate: `blocked_by` um die neuen Aufgaben **ergänzen** (bestehende Liste mitnehmen). Danach normal mit `aufgabe-umsetzen` weiter; anschließend erneut Teil A.

### BLOCKED
1. Kommentar am Gate mit Zitat und Grund.
2. `waiting_on` auf den, der entscheiden muss (meist „Ruben“), ggf. `blocker-eskalieren` für die kleinste offene Frage.

## Don'ts

- Keine Abnahme behaupten oder vorwegnehmen; keine Hardware-Ergebnisse erfinden.
- Kein Start des nächsten Meilensteins vor `done` am Gate.
- Akzeptanzkriterien nicht aufweichen, um ein Gate zu erreichen.
