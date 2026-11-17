---
name: aufgabe-umsetzen
description: "Eine Chaos-Party-Aufgabe aus Zunder (Kennung CHAOS-…) umsetzen oder die nächste freie Aufgabe des aktuellen Meilensteins finden und erledigen: laden, reservieren, Plan, Umsetzung mit Quality Gates, PR, Status und Follow-ups. Verwenden bei „setz CHAOS-12 um“, „mach die nächste Aufgabe“, „weiter mit M1“."
---

# Aufgabe umsetzen (Chaos Party)

Projektschicht über dem allgemeinen Skill `zunder-dev`. Ist er verfügbar, gelten seine Regeln (Claim, Felder, Status-Spur, Follow-ups) zusätzlich; dieser Skill ergänzt das, was nur für Chaos Party gilt. Die Regeln in `CLAUDE.md` („Task management with Zunder“, „Quality gates“, „Definition of Done“) gehen immer vor.

Werkzeuge per ToolSearch in **einem** Aufruf laden: `select:mcp__Zunder__list_structure,mcp__Zunder__filter_tasks,mcp__Zunder__get_task,mcp__Zunder__claim_task,mcp__Zunder__release_task,mcp__Zunder__update_task,mcp__Zunder__add_comment,mcp__Zunder__create_task,mcp__Zunder__move_task`.

## 1. Projekt und Aufgabe bestimmen

1. `list_structure` → Projekt mit `key: CHAOS` bzw. `repo: rubenvitt/Chaos-Party`. ID immer frisch holen.
2. **Kennung genannt** → `get_task` damit.
3. **Keine Kennung** („nächste Aufgabe“):
   - `filter_tasks` mit `project_id` und Status `open`/`in_progress`/`blocked`.
   - Aktueller Meilenstein = das niedrigste Epic aus `CHAOS-1` … `CHAOS-4`, das nicht `done` ist.
   - Kandidaten: Unteraufgaben dieses Epics mit Status `open`, ohne aktiven fremden Claim, deren `blocked_by` alle erledigt sind. Abnahme-Aufgaben (Titel beginnt mit „M<n>-Abnahme“) sind **keine** Kandidaten → dafür `meilenstein-abnahme`.
   - Ebenfalls **keine** Kandidaten: Aufgaben, die auf Ruben warten (`plan` beginnt mit „Wartet auf Ruben“), und Aufgaben hinter einer Abnahme oder Zwischenabnahme, die noch nicht `done` ist (z. B. CHAOS-94 … 113 hinter CHAOS-92). Solche Aufgaben stehen bewusst auf `open` statt `blocked`, weil in Zunder nichts von Ruben abhängt (`CLAUDE.md`); die Reihenfolge steht in Beschreibung und Kommentaren.
   - Bei mehreren: die, die am meisten anderes freischaltet (`blocks`), dann die kleinste Kennung. Wahl kurz begründen.
   - Kein Kandidat → Stand melden (was läuft, was blockiert, ob das Gate ansteht) und aufhören.

## 2. Prüfen, bevor es losgeht

- Fremder gültiger Claim → nicht übernehmen, Ruben nennen, wer und bis wann.
- Status `blocked` oder offene `blocked_by` → nicht anfangen, Grund nennen.
- Liegt die Aufgabe in einem Meilenstein, dessen vorheriges Gate (`CHAOS-16/25/35`) nicht `done` ist → **stopp**. Kein Vorgriff auf den nächsten Meilenstein.
- Beschreibung, `## Notizen`, Kommentare (älteste zuerst) und das Eltern-Epic lesen; dazu die relevanten Abschnitte aus `VISION.md`, `ARCHITECTURE.md`, `ROADMAP.md` und `docs/`.
- Verlangt die Aufgabe etwas, das laut `CLAUDE.md` eine Freigabe braucht (Produktsäulen, Umfang, Kosten, Architekturwechsel) → `blocker-eskalieren`.

## 3. Reservieren und planen

1. `claim_task` mit `claude-code@<ort>` (Cloud: `claude-code@cloud-<wort>-<wort>` aus dem Harness-Branch), `ttl_minutes` ≈ 240.
2. `update_task`: `status: in_progress`, `branch`, `plan` (Route, Kern der Lösung, Offenes in 1–3 Sätzen).
3. Bei mehreren Teilschritten eine kurze Aufgabenliste für die Sitzung führen; echte Teilaufgaben, die eigenständig prüfbar sind, mit `decompose_task` in Zunder anlegen.

## 4. Umsetzen und prüfen

- Kleinste vollständige vertikale Änderung, klare Modulgrenzen (`apps/*`, `packages/*`).
- Die relevanten **Quality Gates** aus `CLAUDE.md` laufen lassen (typecheck, lint, format, unit, integration, Playwright mit `--trace off`, build). Keine Tests abschalten, um grün zu werden.
- UI/3D-Änderungen: Screenshot ansehen (deviceScaleFactor 1 für eigene Prüfung).
- **Hardware nie behaupten:** Was nur auf echten iPhones/iPads prüfbar ist, kommt in `docs/device-test-checklist.md`, nicht als „getestet“ in Kommentare.
- Gameplay-Variante ausprobiert → `experiment-protokollieren`.
- Drei ernsthafte, verschiedene Versuche an derselben Ursache gescheitert → `blocker-eskalieren`.

## 5. Festhalten

- Repo-Doku nachziehen: `docs/progress.md` (Stand, validierte Befehle, nächste Schritte), ADR in `docs/decisions/` bei Architekturentscheidungen, bekannte Grenzen.
- Commit-Body und PR-Beschreibung nennen die Kennung (`CHAOS-12`). PR-Basis `main`.
- Abweichung von einem Akzeptanzkriterium → Kommentar mit Grund, nicht still weglassen.

## 6. Abschließen

1. PR offen → `update_task`: `status: review`, `pr_url`, `plan` aktualisieren.
2. `add_comment` „PR offen“:
   ```
   **<Datum>, PR offen:** <pr_url>

   - Was sich geändert hat (Spielersicht, dann Technik in einem Satz)
   - Geprüft: welche Gates grün; was rot ist und warum
   - Nicht geprüft / nur auf echter Hardware prüfbar: …
   - Bezüge: andere Kennungen, Doku-Dateien
   ```
3. `release_task`.
4. Nach dem Merge: `status: done`, Kommentar „Gemergt“ mit Änderungen beim Merge.
5. Ist damit die letzte Arbeitsaufgabe vor einem Gate erledigt → auf `meilenstein-abnahme` hinweisen.

## Follow-ups und Scope

- Gefunden, aber nicht Teil dieser Aufgabe und **für den Meilenstein nötig** → `create_task` unter dem Meilenstein-Epic (`parent_id: CHAOS-<n>`), Typ `bug`/`feature`/`aufgabe`, Beschreibung mit `## Kontext`, `## Zu tun`, `## Akzeptanzkriterien`, `## Referenzen`. Hängt das Gate davon ab, die Gate-Aufgabe per `blocked_by` ergänzen (bestehende Liste mitnehmen).
- **Nicht** für den aktuellen Meilenstein nötig → Unteraufgabe von `CHAOS-44` (zurückgestellt). Nicht umsetzen.
- Am Ende der Antwort:
  ```
  📋 Angelegt in Zunder
  - [CHAOS-45 Titel](https://zunder.rubeen.dev/#/aufgabe/<id>)
  ```

## Don'ts

- Kein Start in einem Meilenstein vor der Freigabe des vorherigen.
- Keine Gate-Aufgabe auf `done` setzen (siehe `meilenstein-abnahme`).
- Beschreibung nicht mit Zwischenständen überschreiben; kein `delete_task`.
- Kein `due`, `remind_at`, `phoenix`, `weight` setzen, wenn Ruben es nicht will.
- Subagents schreiben nicht in Zunder.
