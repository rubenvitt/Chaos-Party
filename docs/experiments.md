# Experiment-Log

Gameplay-, Art- und Technik-Experimente nach dem Protokoll aus `CLAUDE.md` („Experiment protocol“). Ablauf und Zunder-Spiegelung beschreibt der Skill `experiment-protokollieren`.

**Grundsätze**
- Eintrag **vor** dem Experiment anlegen (Hypothese, Varianten, Messgrößen), Ergebnis und Entscheidung **danach** ergänzen.
- Fortlaufende Nummer `EXP-<nnn>`, auslösende Aufgabe `CHAOS-…` im Titel.
- Feste Seeds, wiederholbare Skripte; Commit angeben.
- Automatische Messwerte sind **Näherungen**, kein Beweis für Spaß. Was nur Menschen beurteilen können, steht unter „Offen für Playtest“ und wandert in den Abnahmebericht.
- Experimente ändern nichts, was eine Freigabe braucht (PC-only-Host, 2–4 lokale Spieler, Controller-Modell, Genre, Trophäen-Sieg, Art-Direction-Kern, Meilenstein-Umfang, Kosten).
- Verworfene, später vielleicht interessante Varianten → Unteraufgabe von `CHAOS-44` mit Verweis auf `EXP-<nnn>`.

## Übersicht

| EXP | Thema | Aufgabe | Entscheidung |
|---|---|---|---|
| EXP-001 | Brett-Tempo: Würfel und Pacing | CHAOS-24 | keep: W6, Pacing unverändert; Rundenzahl als Frage an Ruben |
| EXP-002 | Münzen und Trophäen | CHAOS-24 | keep G: 6 Kandidaten, 3 wandernd aktiv, Preis 15 |
| EXP-003 | Item-Häufigkeit und Sabotage | CHAOS-24 | keep F: 6 Item-Felder, 1 Start-Item, Falle beim Überqueren, Klau 5/Falle 4 |
| EXP-004 | Reaktionsfenster | CHAOS-24 | keep 3000 ms; nach Playtest mit echten Reaktionszeiten neu bewerten |

---

## Vorlage

Zum Anlegen kopieren und unterhalb dieser Vorlage einfügen (neueste unten).

```markdown
## EXP-<nnn>: <Thema> (<JJJJ-MM-TT>, CHAOS-…)

**Hypothese / gewünschtes Spielerlebnis:** …

**Varianten:**
- A: … – erwartete Vor-/Nachteile
- B: … – erwartete Vor-/Nachteile

**Objektive Messgrößen:** z. B. Rundendauer, Trophäen-Abstand, Sabotage-Häufigkeit,
Eingabelatenz, Kollisionsstabilität, Disconnect-Rate

**Subjektive Playtest-Fragen (für Ruben):** …

**Testumgebung:** Rechner/Browser, Seeds, Anzahl simulierter Partien, Commit

<!-- nach dem Experiment ergänzen -->

**Ergebnisse:** Tabelle/Zahlen, Screenshot- oder Videopfade

**Entscheidung:** keep | iterate | discard – Begründung

**Offen für Playtest:** …
```

---

<!-- Einträge ab hier -->

## Gemeinsamer Aufbau von EXP-001 … EXP-004 (2026-11-15, CHAOS-24)

Die vier ersten Gameplay-Experimente für M2 sind Bot-Simulationen ganzer Partien mit dem echten Regelwerk (`packages/game-core`). Sie liefern **Näherungen**: Bots würfeln, wählen Wege und setzen Items nach festen Regeln ein. Ob das Brett Spaß macht, Sabotage witzig statt gemein ist und das Tempo stimmt, beurteilt erst Ruben im Playtest bei der M2-Abnahme.

**Wiederholen** (≈ 7 s):

```sh
EXPERIMENTS=1 pnpm exec vitest run packages/game-core/src/rules/experiments.test.ts --silent=false
```

`--silent=false` ist nötig, weil Vitest die Konsolenausgabe bestandener Tests sonst ausblendet. Ohne `EXPERIMENTS=1` läuft nur ein Smoke-Test mit 2 Seeds (Teil von `pnpm test`, < 0,5 s).

- **Code:** Varianten und Kennzahlen in `packages/game-core/src/rules/experiments.ts`, Bot-Partien in `packages/game-core/src/rules/simulate.ts`.
- **Seeds:** 1–200 je Variante und Spielerzahl (2, 3, 4), also 600 Partien je Variante. **5 Runden** (Server-Standard `DEFAULT_ROUNDS`), Brett Wackelwald.
- **Wiederholbarkeit:** Alle Varianten bauen auf `START_RULES`/`START_BOARD` auf (Werte vor CHAOS-24), nicht auf `DEFAULT_RULES`. Die Zeile **Z** zeigt jeweils die neuen Standardwerte. Ein Test prüft, dass die gewählten Werte (`CHOICE_RULES`, `CHOICE_BOARD`) genau `DEFAULT_RULES` und dem Wackelwald entsprechen.
- **Bots (`EXPERIMENT_POLICY`):** Entscheidungszeit gleichverteilt 0,8–2,5 s. Items vor dem Wurf mit 50 % Wahrscheinlichkeit einsetzen. Münzklau auf die reichste Person. Trophäe immer kaufen, wenn das Geld reicht. An Gabeln zu 75 % den kürzeren Weg zur nächsten aktiven Trophäe, sonst zufällig (Menschen sehen die Trophäe am Fernseher). Reaktion zu 70 % mit 600–3600 ms (EXP-004: eigene Profile). Wie stark die Ergebnisse am Bot-Verhalten hängen, zeigt die Robustheitstabelle unter EXP-003.
- **Dauer:** Pacing plus Bot-Entscheidungszeit. „Brett min“ ist die Partiedauer ohne die Minispielphasen. Der Platzhalter braucht 10 s je Runde (Intro, Spiel, Ergebnis, Rundenende). Echte Minispiele (M3) dauern länger.
- **Testumgebung:** Node 22.23, Linux-Container, Branch `worktree-agent-ac81de606622de954`, Basis-Commit `9e8da68`, Ergebnisse vom Commit, der diesen Eintrag einführt.

**Neue Regel-Stellschrauben (additiv im `RuleSet`, Protokoll und Apps unverändert):**
- `trophy.activeCount`: Bei `wandering` sind so viele Trophäen gleichzeitig aktiv. Nach einem Kauf wandert genau die gekaufte Trophäe auf ein freies Feld, der Trophäen-Wirbel bewegt eine zufällige aktive.
- `items.startItems`: So viele zufällige Items bekommt jeder beim Start (`item-gained` direkt nach `game-started`).
- `items.trapTrigger`: Bei `land` löst eine Falle nur beim Landen aus, bei `pass` auch beim Darüberlaufen. Die Figur hält an, die Falle löst aus (`trap-triggered`, Münzen), nach `spaceEventMs` geht es weiter. Liegt dort auch eine aktive Trophäe, folgt danach das Kaufangebot.

**Neu in der Simulation:** `BotPolicy.trophyPathChance`, log-normale Reaktionszeiten (`DelayModel`), `SimulationResult.reactionWaitsMs` und `sabotageLosses` (Verlust samt Bestand davor).

---

## EXP-001: Brett-Tempo – Würfelverteilung und Pacing (2026-11-15, CHAOS-24)

**Hypothese / gewünschtes Spielerlebnis:** Der Brettteil ist schnell und lesbar. Ein fremder Zug dauert unter ~10 s, die Wartezeit bis zum eigenen Zug liegt bei 4 Spielern unter ~30 s. Kaum ein Wurf wirkt nutzlos. Richtwert des Koordinators: 4 Spieler, 5 Runden, ohne Minispiele grob 8–15 Minuten. Erwartung vorher: Würfel und Feldtakt bestimmen die Partiedauer spürbar.

**Varianten:**
- A: W6, 350 ms je Feld (Startwerte). Vertraut, ein Drittel der Würfe ist 1–2.
- B: Würfel [1,2,3,3,4,4,5,6]. Gleicher Mittelwert, weniger Ausreißer, ungewohnter Würfel.
- C: W4, Doppelwürfel doppelt so häufig. Kurze Züge, Items wichtiger.
- D: Würfel 2–7. Mehr Strecke je Zug, keine 1.
- E: W6, 250 ms je Feld. Schneller, Laufen schwerer zu verfolgen.
- F: W6 mit knappen Pausen (Zugbeginn 900, Wurf 900, Feld 300, Feldereignis 1300, Zugende 400 ms). Schneller, Host-Effekte (700–1300 ms) knapp.

**Objektive Messgrößen:** Brett-Dauer je Partie (Mittel, 90 %-Quantil), Zugdauer (Mittel, p90), Wartezeit zwischen zwei eigenen Zügen (= (Spieler − 1) × Zugdauer), Felder je Zug, Anteil Züge mit höchstens 2 Feldern, Trophäen je Partie als Nebenwirkung.

**Subjektive Playtest-Fragen (für Ruben):** Fühlt sich ein Zug (≈ 8 s) zügig an, und ist die Wartezeit (≈ 25 s bei vier Spielern) okay? Reichen die Pausen, um Münzen, Items und Fallen am Fernseher mitzubekommen? Welche Rundenzahl soll Standard sein (5 = kurz)?

**Testumgebung:** siehe „Gemeinsamer Aufbau“. Zusatztabelle Rundenzahl: neue Standardwerte, 5/8/10/12 Runden, Seeds 1–200.

**Ergebnisse:**

**EXP-001 Brett-Tempo (5 Runden, Seeds 1–200 je Zeile)**

| Variante | Sp. | Brett min | Brett min p90 | Zug s | Zug s p90 | Warten s | Felder/Zug | ≤ 2 Felder | Trophäen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A: W6, 350 ms/Feld (Start) | 2 | 1,3 | 1,4 | 7,3 | 9,5 | 7 | 3,59 | 32 % | 0,63 |
| A: W6, 350 ms/Feld (Start) | 3 | 2,0 | 2,1 | 7,3 | 9,4 | 15 | 3,58 | 33 % | 0,66 |
| A: W6, 350 ms/Feld (Start) | 4 | 2,6 | 2,8 | 7,2 | 9,2 | 22 | 3,52 | 34 % | 0,68 |
| B: Würfel 1,2,3,3,4,4,5,6 | 2 | 1,3 | 1,4 | 7,3 | 9,4 | 7 | 3,60 | 23 % | 0,59 |
| B: Würfel 1,2,3,3,4,4,5,6 | 3 | 2,0 | 2,1 | 7,3 | 9,5 | 15 | 3,60 | 24 % | 0,61 |
| B: Würfel 1,2,3,3,4,4,5,6 | 4 | 2,6 | 2,7 | 7,3 | 9,2 | 22 | 3,56 | 25 % | 0,70 |
| C: W4 + Doppelwürfel ×2 | 2 | 1,3 | 1,4 | 6,9 | 8,9 | 7 | 2,59 | 50 % | 0,30 |
| C: W4 + Doppelwürfel ×2 | 3 | 1,9 | 2,0 | 6,9 | 8,9 | 14 | 2,61 | 48 % | 0,39 |
| C: W4 + Doppelwürfel ×2 | 4 | 2,5 | 2,6 | 6,9 | 8,8 | 21 | 2,59 | 49 % | 0,42 |
| D: Würfel 2–7 | 2 | 1,4 | 1,5 | 7,9 | 10,2 | 8 | 4,55 | 16 % | 0,93 |
| D: Würfel 2–7 | 3 | 2,1 | 2,3 | 7,9 | 10,2 | 16 | 4,58 | 16 % | 1,01 |
| D: Würfel 2–7 | 4 | 2,8 | 2,9 | 7,8 | 9,9 | 23 | 4,54 | 17 % | 1,09 |
| E: W6, 250 ms/Feld | 2 | 1,3 | 1,4 | 7,0 | 9,0 | 7 | 3,59 | 32 % | 0,63 |
| E: W6, 250 ms/Feld | 3 | 1,9 | 2,0 | 7,0 | 8,9 | 14 | 3,58 | 33 % | 0,66 |
| E: W6, 250 ms/Feld | 4 | 2,5 | 2,6 | 6,9 | 8,7 | 21 | 3,52 | 34 % | 0,68 |
| F: W6, knappe Pausen | 2 | 1,2 | 1,2 | 6,5 | 8,6 | 7 | 3,59 | 32 % | 0,63 |
| F: W6, knappe Pausen | 3 | 1,7 | 1,8 | 6,5 | 8,5 | 13 | 3,58 | 33 % | 0,66 |
| F: W6, knappe Pausen | 4 | 2,3 | 2,4 | 6,4 | 8,3 | 19 | 3,52 | 34 % | 0,68 |
| Z: neue Standardwerte | 2 | 1,6 | 1,7 | 8,7 | 13,1 | 9 | 3,79 | 31 % | 2,52 |
| Z: neue Standardwerte | 3 | 2,3 | 2,5 | 8,5 | 12,6 | 17 | 3,75 | 32 % | 2,90 |
| Z: neue Standardwerte | 4 | 3,0 | 3,2 | 8,4 | 12,3 | 25 | 3,75 | 32 % | 3,18 |

**EXP-001 Rundenzahl mit neuen Standardwerten (Seeds 1–200 je Zeile)**

| Runden | Sp. | Brett min | Felder/Sp. | Trophäen | Sieger | ohne Trophäe | Münzen entscheiden |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5 Runden | 2 | 1,6 | 19 | 2,52 | 1,75 | 18 % | 30 % |
| 5 Runden | 3 | 2,3 | 19 | 2,90 | 1,66 | 28 % | 38 % |
| 5 Runden | 4 | 3,0 | 19 | 3,18 | 1,50 | 35 % | 51 % |
| 8 Runden | 2 | 2,4 | 30 | 4,09 | 2,77 | 6 % | 16 % |
| 8 Runden | 3 | 3,6 | 30 | 5,04 | 2,64 | 13 % | 30 % |
| 8 Runden | 4 | 4,7 | 30 | 5,39 | 2,26 | 17 % | 45 % |
| 10 Runden | 2 | 3,0 | 37 | 5,03 | 3,32 | 4 % | 22 % |
| 10 Runden | 3 | 4,5 | 37 | 6,08 | 3,13 | 9 % | 25 % |
| 10 Runden | 4 | 5,9 | 37 | 6,59 | 2,75 | 13 % | 41 % |
| 12 Runden | 2 | 3,6 | 45 | 6,43 | 4,18 | 2 % | 15 % |
| 12 Runden | 3 | 5,4 | 44 | 7,92 | 4,01 | 5 % | 20 % |
| 12 Runden | 4 | 7,1 | 44 | 8,76 | 3,64 | 8 % | 27 % |

- Die Zugdauer ist fast nur Pacing plus Entscheidung: A–F liegen bei 6,4–7,9 s. 250 ms je Feld spart 0,3 s je Zug, knappe Pausen sparen 0,8 s. Der Würfel ändert die Dauer kaum (2–7: +0,6 s).
- Mit den neuen Regeln (Z) dauert ein Zug im Mittel 8,4–8,7 s (p90 12–13 s): mehr Items, Reaktionsfenster, Fallen und Trophäenkäufe. Bei 4 Spielern wartet man ≈ 25 s auf den eigenen Zug.
- **Der Richtwert 8–15 min wird mit 5 Runden deutlich unterschritten:** 4 Spieler brauchen ≈ 3 min Brettzeit. Langsameres Pacing wäre der falsche Hebel, denn das widerspricht „schnell und lesbar“. Mit echten Minispielen (angenommen 60–90 s plus ≈ 8,5 s Intro und Ergebnis je Runde) kommen 5 Runden auf ≈ 9–11 min, 8 Runden auf ≈ 14–18 min.
- B senkt die Kurzzüge von ≈ 33 % auf ≈ 24 % bei gleicher Länge. Ob man das am Tisch merkt, ist fraglich, und ein W6 versteht jeder sofort. C halbiert die Trophäen und macht jeden zweiten Zug kurz. D bringt +27 % Strecke und mehr Trophäen, wirkt aber erst zusammen mit der Ökonomie (EXP-002, Variante H).

**Entscheidung:** **keep** – W6 und das bisherige Pacing bleiben (`stepMs` 350, `spaceEventMs` 1500 ≥ 700–1300 ms Host-Effekt). **discard** B (kein messbarer Vorteil, ungewohnter Würfel), C (zu zäh), E und F (weniger als 1 s Gewinn je Zug, Risiko, dass Host-Animationen nicht mehr in die Pausen passen). D zurückgestellt (siehe unten). Die Rundenzahl ist der eigentliche Hebel für die Partiedauer, das ist eine Frage an Ruben (siehe „Offen für Playtest“).

**Offen für Playtest:** Zugtempo und Wartezeit am echten Fernseher. Standard-Rundenzahl: Vorschlag 5 als „kurz“, 8 als „normal“ für die Lobby-Einstellung in M4.

**Für später (CHAOS-44):** Würfel 2–7 als Option für kurze Partien (EXP-001 D, EXP-002 H). Runden-Voreinstellungen kurz/normal/lang (5/8/12) in der Lobby.

---

## EXP-002: Münzbelohnungen und Trophäen-Ökonomie (2026-11-15, CHAOS-24)

**Hypothese / gewünschtes Spielerlebnis:** Trophäen entscheiden das Spiel. Auch in einer kurzen Partie hat fast jeder eine realistische Chance auf eine Trophäe, der Sieger hat meist mehr als eine, und Münzen entscheiden nur bei Gleichstand. Eigene Zielwerte für 5 Runden: kaum Partien ohne Trophäe (≤ 2 %), höchstens 40 % der Spieler ohne Trophäe, Sieger im Mittel mindestens 1,5 Trophäen, Münzen entscheiden in höchstens etwa der Hälfte der Partien.

**Varianten** (A–D auf dem Startbrett mit 4 Trophäen-Kandidaten s12, s24, s36, s42; E–H mit zwei zusätzlichen Kandidaten s16 (Sumpfabkürzung) und s21 (oben), die in 5 Runden erreichbar sind):
- A: Preis 20, eine wandernde Trophäe (Startwerte).
- B: Preis 15. Billiger, aber die Erreichbarkeit bleibt gleich.
- C: alle 4 fest aktiv. Viele Gelegenheiten, aber keine Wanderung und der Trophäen-Wirbel wirkt nicht.
- D: 2 von 4 wandernd.
- E: 6 Kandidaten, 2 wandernd, Preis 15.
- F: 6 Kandidaten, 3 wandernd, Preis 20.
- G: 6 Kandidaten, 3 wandernd, Preis 15.
- H: G mit Würfel 2–7.

**Objektive Messgrößen:** gekaufte Trophäen je Partie, Trophäen des Siegers, Abstand Platz 1–2, Anteil Partien mit gleich vielen Trophäen auf Platz 1 und 2 („Münzen entscheiden“), geteilter Sieg, Anteil Spieler ohne Trophäe, Anteil Partien ganz ohne Trophäe, Münzen am Ende.

**Subjektive Playtest-Fragen (für Ruben):** Sind drei gleichzeitig sichtbare Trophäen am Fernseher lesbar und reizvoll? Wirkt ein Preis von 15 Münzen verdient oder zu billig? Ist es in Ordnung, dass bei vier Spielern in etwa jeder zweiten 5-Runden-Partie die Münzen den Gleichstand entscheiden? (VISION: Münzen als Tiebreaker sollen validiert werden.) Lohnt sich die Wegwahl Richtung Trophäe?

**Testumgebung:** siehe „Gemeinsamer Aufbau“.

**Ergebnisse:**

**EXP-002 Ökonomie (5 Runden, Seeds 1–200 je Zeile)**

| Variante | Sp. | Trophäen/Partie | Sieger | Abstand 1–2 | Münzen entscheiden | geteilter Sieg | ohne Trophäe | Partien ohne | Münzen Ende |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A: Preis 20, 1 wandernd (Start) | 2 | 0,63 | 0,54 | 0,46 | 59 % | 2 % | 71 % | 50 % | 47,4 |
| A: Preis 20, 1 wandernd (Start) | 3 | 0,66 | 0,57 | 0,48 | 53 % | 2 % | 78 % | 44 % | 42,2 |
| A: Preis 20, 1 wandernd (Start) | 4 | 0,68 | 0,56 | 0,45 | 56 % | 0 % | 83 % | 45 % | 35,5 |
| B: Preis 15 | 2 | 0,65 | 0,56 | 0,48 | 57 % | 2 % | 71 % | 50 % | 48,8 |
| B: Preis 15 | 3 | 0,68 | 0,58 | 0,48 | 53 % | 2 % | 78 % | 44 % | 43,2 |
| B: Preis 15 | 4 | 0,71 | 0,59 | 0,49 | 52 % | 0 % | 83 % | 43 % | 36,0 |
| C: alle 4 fest aktiv | 2 | 2,44 | 1,49 | 0,55 | 51 % | 2 % | 7 % | 1 % | 30,7 |
| C: alle 4 fest aktiv | 3 | 3,24 | 1,50 | 0,46 | 56 % | 2 % | 11 % | 0 % | 26,1 |
| C: alle 4 fest aktiv | 4 | 3,61 | 1,27 | 0,26 | 74 % | 5 % | 17 % | 0 % | 22,3 |
| D: 2 von 4 wandernd | 2 | 1,10 | 0,94 | 0,77 | 37 % | 1 % | 52 % | 22 % | 42,6 |
| D: 2 von 4 wandernd | 3 | 1,24 | 0,95 | 0,69 | 40 % | 1 % | 62 % | 15 % | 38,4 |
| D: 2 von 4 wandernd | 4 | 1,28 | 0,93 | 0,64 | 41 % | 1 % | 69 % | 13 % | 33,2 |
| E: 6 Kand., 2 wandernd, Preis 15 | 2 | 1,60 | 1,25 | 0,91 | 32 % | 0 % | 38 % | 11 % | 40,8 |
| E: 6 Kand., 2 wandernd, Preis 15 | 3 | 2,01 | 1,29 | 0,70 | 45 % | 1 % | 47 % | 7 % | 35,1 |
| E: 6 Kand., 2 wandernd, Preis 15 | 4 | 2,10 | 1,22 | 0,59 | 49 % | 1 % | 56 % | 7 % | 30,2 |
| F: 6 Kand., 3 wandernd, Preis 20 | 2 | 1,96 | 1,36 | 0,77 | 39 % | 1 % | 22 % | 2 % | 33,5 |
| F: 6 Kand., 3 wandernd, Preis 20 | 3 | 2,27 | 1,28 | 0,53 | 53 % | 2 % | 35 % | 2 % | 30,3 |
| F: 6 Kand., 3 wandernd, Preis 20 | 4 | 2,50 | 1,18 | 0,37 | 66 % | 2 % | 42 % | 2 % | 25,6 |
| G: 6 Kand., 3 wandernd, Preis 15 | 2 | 2,28 | 1,64 | 1,00 | 28 % | 1 % | 22 % | 1 % | 35,9 |
| G: 6 Kand., 3 wandernd, Preis 15 | 3 | 2,83 | 1,65 | 0,76 | 37 % | 1 % | 30 % | 1 % | 31,4 |
| G: 6 Kand., 3 wandernd, Preis 15 | 4 | 3,02 | 1,46 | 0,51 | 55 % | 2 % | 38 % | 1 % | 26,8 |
| H: G + Würfel 2–7 | 2 | 2,75 | 1,94 | 1,13 | 22 % | 1 % | 15 % | 0 % | 31,4 |
| H: G + Würfel 2–7 | 3 | 3,43 | 1,77 | 0,60 | 49 % | 2 % | 20 % | 1 % | 27,6 |
| H: G + Würfel 2–7 | 4 | 3,63 | 1,64 | 0,57 | 47 % | 1 % | 28 % | 0 % | 23,9 |
| Z: neue Standardwerte | 2 | 2,52 | 1,75 | 0,99 | 30 % | 1 % | 18 % | 2 % | 32,7 |
| Z: neue Standardwerte | 3 | 2,90 | 1,66 | 0,79 | 38 % | 1 % | 28 % | 1 % | 30,2 |
| Z: neue Standardwerte | 4 | 3,18 | 1,50 | 0,54 | 51 % | 1 % | 35 % | 1 % | 25,1 |

- **Startwerte (A) tragen den Trophäen-Sieg nicht:** 0,6–0,7 Trophäen je Partie, 44–50 % der Partien ganz ohne Trophäe, 71–83 % der Spieler ohne. Ursache: In 5 Runden läuft jeder nur ≈ 18 Felder, also eine halbe Brettrunde. Erreichbar sind nur s12 (nur über den Klippenweg) und s24. Die einzige aktive Trophäe steht oft außer Reichweite und springt nach einem Kauf meist wieder dorthin.
- Der Preis allein (B) ändert fast nichts, weil Münzen reichlich da sind (am Ende Ø 36–49). Engpass ist die Erreichbarkeit, nicht das Geld.
- C bringt viele Trophäen, aber bei 4 Spielern viele Gleichstände (Münzen entscheiden in 74 %) und keine wandernde Trophäe.
- G erfüllt die Zielwerte am besten mit nur einer neuen Stellschraube: 2,3–3,0 Trophäen, Sieger 1,46–1,65, 1 % Partien ohne, 22–38 % Spieler ohne. H ist noch etwas besser, ändert aber zusätzlich den Würfel.
- Mit Items (Z, siehe EXP-003): 2,5–3,2 Trophäen, 18–35 % ohne Trophäe, Münzen entscheiden in 30 % (2 Spieler) bis 51 % (4 Spieler). Bei vier Spielern teilen sich ≈ 3 Trophäen auf vier Leute (oft 1-1-1-0), daher die vielen Gleichstände. Mit 8 oder mehr Runden sinkt der Anteil (Rundenzahl-Tabelle in EXP-001).

**Entscheidung:** **keep Variante G** als neue Standardwerte: `trophy.activeCount` 1 → **3** (neue Stellschraube), `trophy.price` 20 → **15**, Wackelwald mit **6 Trophäen-Kandidaten** (s16 und s21 von Plus zu Trophäe). Startmünzen (10), Plus/Minus (3/3) und Minispiel-Belohnungen (10/5/3/0) bleiben, denn Münzen sind reichlich vorhanden (Ende Ø 25–33). Die Entscheidung hängt nicht an der Annahme, dass Bots die Trophäe ansteuern: Mit zufälliger Wegwahl ergeben sich 2,2–2,9 Trophäen (Robustheitstabelle unter EXP-003).

**Offen für Playtest:** Lesbarkeit von drei aktiven Trophäen, Preisgefühl, Münz-Gleichstand als Entscheidung, Reiz der Wegwahl.

**Für später (CHAOS-44):** Trophäe wandert bevorzugt vor die Spieler statt zufällig (weniger tote Trophäen in kurzen Partien). Ökonomie neu bewerten, wenn echte Minispiele (M3) die Belohnungen ändern. Würfel 2–7 (H).

---

## EXP-003: Item-Häufigkeit und Sabotage (2026-11-15, CHAOS-24)

**Hypothese / gewünschtes Spielerlebnis:** Sabotage kommt in jeder Partie vor und **überrascht, ohne dauerhaft zu bestrafen** (VISION, Produktsäule 1). Eigene Zielwerte für 5 Runden: mindestens 1 Item je Spieler und Partie, bei 4 Spielern ≈ 1,5–2,5 Sabotagen je Partie, Verlust je Treffer im Mittel ≤ 25 % des Bestands, die am meisten getroffene Person im Mittel höchstens etwa ein Treffer je Partie.

**Varianten** (alle mit der Ökonomie aus EXP-002 G):
- A: 4 Item-Felder, Fallen nur beim Landen, Klau 6/Falle 5 (Startwerte).
- B: 6 Item-Felder (s19 oben und s39 unten links von Plus zu Item, dann etwa alle sechs Felder eins).
- C: B, Falle löst auch beim Darüberlaufen aus.
- D: B mit 1 Start-Item je Spieler.
- E: C und D zusammen (Klau 6, Falle 5).
- F: E mit Klau 5, Falle 4.
- G: F mit Münzklau-Gewicht 4 statt 3.

**Objektive Messgrößen:** gezogene und eingesetzte Items je Spieler, Sabotagen je Partie (Münzklau-Versuche plus ausgelöste Fallen), gelegte und ausgelöste Fallen, Verlust je Treffer relativ zum Bestand davor (Mittel, p90), Münzen je Treffer, höchste Trefferzahl auf eine Person je Partie, Trophäen je Partie.

**Subjektive Playtest-Fragen (für Ruben):** Ist ein Start-Item verständlich („Warum habe ich schon was?“)? Versteht man am Fernseher, dass die Figur auf einer fremden Falle anhält und zahlt? Fühlt sich ein Klau von 5 Münzen witzig oder gemein an? Wird die führende Person zu oft beklaut?

**Testumgebung:** siehe „Gemeinsamer Aufbau“.

**Ergebnisse:**

**EXP-003 Items (5 Runden, Seeds 1–200 je Zeile)**

| Variante | Sp. | Items/Sp. | eingesetzt/Sp. | Sabotagen/Partie | Klau | Fallen gelegt | Fallen ausgelöst | Verlust/Bestand | p90 | Münzen/Treffer | max. Treffer auf einen | Trophäen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A: 4 Item-Felder (Stand EXP-002) | 2 | 0,45 | 0,25 | 0,18 | 0,18 | 0,15 | 0,01 | 18 % | 30 % | 3,9 | 0,17 | 2,28 |
| A: 4 Item-Felder (Stand EXP-002) | 3 | 0,44 | 0,24 | 0,27 | 0,25 | 0,21 | 0,02 | 18 % | 30 % | 4,4 | 0,23 | 2,83 |
| A: 4 Item-Felder (Stand EXP-002) | 4 | 0,47 | 0,24 | 0,36 | 0,34 | 0,27 | 0,03 | 18 % | 31 % | 4,4 | 0,32 | 3,02 |
| B: 6 Item-Felder | 2 | 0,74 | 0,37 | 0,27 | 0,27 | 0,23 | 0,01 | 21 % | 30 % | 4,1 | 0,23 | 2,31 |
| B: 6 Item-Felder | 3 | 0,72 | 0,38 | 0,40 | 0,38 | 0,35 | 0,03 | 18 % | 29 % | 4,3 | 0,33 | 2,83 |
| B: 6 Item-Felder | 4 | 0,75 | 0,35 | 0,48 | 0,43 | 0,41 | 0,05 | 19 % | 35 % | 4,6 | 0,41 | 3,02 |
| C: B + Falle beim Überqueren | 2 | 0,74 | 0,37 | 0,28 | 0,27 | 0,23 | 0,01 | 21 % | 30 % | 4,1 | 0,24 | 2,31 |
| C: B + Falle beim Überqueren | 3 | 0,72 | 0,38 | 0,48 | 0,38 | 0,35 | 0,10 | 18 % | 30 % | 4,4 | 0,40 | 2,82 |
| C: B + Falle beim Überqueren | 4 | 0,75 | 0,35 | 0,61 | 0,43 | 0,41 | 0,17 | 20 % | 36 % | 4,6 | 0,51 | 3,02 |
| D: B + 1 Start-Item | 2 | 1,76 | 1,19 | 0,85 | 0,83 | 0,68 | 0,01 | 30 % | 60 % | 4,2 | 0,60 | 2,50 |
| D: B + 1 Start-Item | 3 | 1,71 | 1,15 | 1,21 | 1,13 | 1,03 | 0,08 | 27 % | 46 % | 4,6 | 0,81 | 2,92 |
| D: B + 1 Start-Item | 4 | 1,76 | 1,16 | 1,56 | 1,47 | 1,51 | 0,10 | 26 % | 46 % | 4,5 | 0,93 | 3,19 |
| E: C + 1 Start-Item (Klau 6/Falle 5) | 2 | 1,76 | 1,19 | 0,92 | 0,83 | 0,68 | 0,09 | 29 % | 60 % | 4,2 | 0,65 | 2,51 |
| E: C + 1 Start-Item (Klau 6/Falle 5) | 3 | 1,71 | 1,15 | 1,38 | 1,14 | 1,03 | 0,24 | 27 % | 46 % | 4,6 | 0,90 | 2,90 |
| E: C + 1 Start-Item (Klau 6/Falle 5) | 4 | 1,75 | 1,16 | 1,93 | 1,47 | 1,51 | 0,46 | 26 % | 46 % | 4,6 | 1,13 | 3,19 |
| F: E mit Klau 5/Falle 4 | 2 | 1,76 | 1,19 | 0,92 | 0,83 | 0,68 | 0,09 | 23 % | 50 % | 3,3 | 0,65 | 2,52 |
| F: E mit Klau 5/Falle 4 | 3 | 1,71 | 1,15 | 1,37 | 1,13 | 1,03 | 0,24 | 21 % | 38 % | 3,6 | 0,91 | 2,90 |
| F: E mit Klau 5/Falle 4 | 4 | 1,75 | 1,16 | 1,92 | 1,47 | 1,50 | 0,46 | 20 % | 38 % | 3,6 | 1,15 | 3,18 |
| G: F + Münzklau-Gewicht 4 | 2 | 1,78 | 1,23 | 1,10 | 1,02 | 0,59 | 0,08 | 22 % | 50 % | 3,2 | 0,73 | 2,48 |
| G: F + Münzklau-Gewicht 4 | 3 | 1,69 | 1,17 | 1,55 | 1,34 | 0,98 | 0,21 | 21 % | 42 % | 3,6 | 1,02 | 2,92 |
| G: F + Münzklau-Gewicht 4 | 4 | 1,74 | 1,18 | 2,21 | 1,78 | 1,44 | 0,42 | 20 % | 38 % | 3,6 | 1,30 | 3,23 |
| Z: neue Standardwerte | 2 | 1,76 | 1,19 | 0,92 | 0,83 | 0,68 | 0,09 | 23 % | 50 % | 3,3 | 0,65 | 2,52 |
| Z: neue Standardwerte | 3 | 1,71 | 1,15 | 1,37 | 1,13 | 1,03 | 0,24 | 21 % | 38 % | 3,6 | 0,91 | 2,90 |
| Z: neue Standardwerte | 4 | 1,75 | 1,16 | 1,92 | 1,47 | 1,50 | 0,46 | 20 % | 38 % | 3,6 | 1,15 | 3,18 |

**Robustheit gegen Bot-Verhalten (5 Runden, Seeds 1–200 je Zeile)**

| Variante | Sp. | Trophäen/Partie | ohne Trophäe | Münzen entscheiden | Sabotagen/Partie | Verlust/Bestand | max. Treffer auf einen | Brett min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A: Start, Bots wie immer | 2 | 0,63 | 71 % | 59 % | 0,14 | 16 % | 0,12 | 1,3 |
| A: Start, Bots wie immer | 3 | 0,66 | 78 % | 53 % | 0,28 | 17 % | 0,26 | 2,0 |
| A: Start, Bots wie immer | 4 | 0,68 | 83 % | 56 % | 0,34 | 16 % | 0,30 | 2,6 |
| A0: Start, Wege zufällig | 2 | 0,53 | 75 % | 64 % | 0,19 | 15 % | 0,18 | 1,3 |
| A0: Start, Wege zufällig | 3 | 0,58 | 81 % | 62 % | 0,27 | 16 % | 0,23 | 2,0 |
| A0: Start, Wege zufällig | 4 | 0,56 | 86 % | 64 % | 0,40 | 14 % | 0,34 | 2,6 |
| Z: neu, Bots wie immer | 2 | 2,52 | 18 % | 30 % | 0,92 | 23 % | 0,65 | 1,6 |
| Z: neu, Bots wie immer | 3 | 2,90 | 28 % | 38 % | 1,37 | 21 % | 0,91 | 2,3 |
| Z: neu, Bots wie immer | 4 | 3,18 | 35 % | 51 % | 1,92 | 20 % | 1,15 | 3,0 |
| Z0: neu, Wege zufällig | 2 | 2,20 | 23 % | 28 % | 0,94 | 23 % | 0,67 | 1,5 |
| Z0: neu, Wege zufällig | 3 | 2,54 | 35 % | 42 % | 1,44 | 20 % | 0,93 | 2,3 |
| Z0: neu, Wege zufällig | 4 | 2,94 | 39 % | 54 % | 1,85 | 20 % | 1,09 | 3,0 |
| Z8: neu, Items zu 80 % einsetzen | 2 | 2,56 | 18 % | 30 % | 1,01 | 25 % | 0,73 | 1,6 |
| Z8: neu, Items zu 80 % einsetzen | 3 | 2,94 | 28 % | 40 % | 1,53 | 22 % | 0,95 | 2,3 |
| Z8: neu, Items zu 80 % einsetzen | 4 | 3,27 | 33 % | 53 % | 2,09 | 22 % | 1,19 | 3,0 |
| ZR: neu, Klau-Ziel zufällig | 2 | 2,48 | 18 % | 26 % | 0,94 | 24 % | 0,68 | 1,6 |
| ZR: neu, Klau-Ziel zufällig | 3 | 2,81 | 29 % | 44 % | 1,35 | 24 % | 0,89 | 2,3 |
| ZR: neu, Klau-Ziel zufällig | 4 | 3,31 | 33 % | 51 % | 1,88 | 28 % | 1,19 | 3,0 |

- **Mit den Startwerten (A) gibt es kaum Sabotage:** weniger als 0,5 Items je Spieler, 0,2–0,4 Sabotagen je Partie. Fallen lösen praktisch nie aus (0,01–0,03 je Partie), weil man exakt auf dem Feld landen muss und gelegte Fallen meist hinter allen anderen liegen.
- Mehr Item-Felder (B) bringen +60 % Items, aber immer noch weniger als 1 je Spieler. Das Start-Item (D) ist der wirksame Hebel: 1,7 Items je Spieler, dreimal so viele Sabotagen.
- Fallen beim Darüberlaufen (C/E) lösen drei- bis fünfmal so oft aus (4 Spieler mit Start-Item: 0,10 → 0,46 je Partie).
- Mit Klau 6/Falle 5 (E) kostet ein Treffer im Mittel 26–29 % des Bestands, p90 46–60 % (früh in der Partie mit wenigen Münzen). Mit Klau 5/Falle 4 (F) sind es 20–23 %, p90 38–50 %, im Mittel 3,3–3,6 Münzen, also knapp ein Viertel einer Trophäe. Die am meisten getroffene Person kassiert im Mittel 0,65 (2 Spieler) bis 1,15 (4 Spieler) Treffer je Partie.
- Ein höheres Münzklau-Gewicht (G) bringt mehr Klau, aber auch mehr Treffer auf dieselbe Person (1,3).
- Robust gegen Bot-Annahmen: Mit zufälliger Wegwahl, häufigerem Item-Einsatz (80 %) oder zufälligem Klau-Ziel bleiben Trophäen, Sabotagen und Verluste im selben Bereich. Das Ziel „reichste Person“ wirkt als Aufholhilfe: Bei zufälligem Ziel steigt der Verlust je Treffer auf 24–28 %.

**Entscheidung:** **keep Variante F** als neue Standardwerte: `items.startItems` 0 → **1** und `items.trapTrigger` `land` → **`pass`** (beides neue Stellschrauben), `stealAmount` 6 → **5**, `trapAmount` 5 → **4** (passend zum Trophäenpreis 15: ein Klau kostet etwa ein Drittel einer Trophäe statt 30 % wie vorher bei Preis 20). Wackelwald mit **6 Item-Felder** (s19, s39). Gewichte (3/3/3/2) und Kapazität (3) bleiben. Auswirkung auf den Host: Beim Darüberlaufen kommen die Ereignisse als `moved` (bis zur Falle), `trap-triggered`, `coins-changed` und nach `spaceEventMs` wieder `moved` (Rest). Start-Items kommen als `item-gained` direkt nach `game-started`. Protokoll und Host-Code sind unverändert, der Host spielt Ereignisse der Reihe nach ab. Die Darstellung sollte trotzdem einmal im Browser angeschaut werden.

**Offen für Playtest:** Start-Item und Falle beim Überqueren verständlich? Sabotage witzig statt frustrierend? Trifft es die führende Person zu oft?

**Für später (CHAOS-44):** Item als Bonus für den Minispiel-Sieg (M3). Schild auch gegen Fallen. Sichtbare oder versteckte Fallen als Variante.

---

## EXP-004: Reaktionsdauer des Münzklau-Fensters (2026-11-15, CHAOS-24)

**Hypothese / gewünschtes Spielerlebnis:** Das Reaktionsfenster ist ein kurzer, spannender Moment („Festhalten!“). Wer aufpasst, schafft es fast immer, wer abgelenkt ist, manchmal nicht. Die Partie wird nicht ausgebremst. Ziel: bei typischen Reaktionszeiten ≥ 90 % gelungene Reaktionen, Zeitkosten je Partie im Bereich weniger Sekunden.

**Annahme Reaktionszeiten (nicht gemessen, begründet):** Die angegriffene Person ist nicht am Zug und schaut meist auf den Fernseher. Bis zum Tippen braucht es diese Schritte: Angriff bemerken (Ansage am PC oder Wechsel am Handy, ≈ 300–600 ms), Blick zum Handy und scharf stellen (≈ 300–500 ms), Titel und zwei große Knöpfe erfassen (≈ 300–500 ms), tippen (≈ 200–300 ms). Eine reine Wahlreaktion dauert allein schon ≈ 400–600 ms. Safari auf iOS unterstützt `navigator.vibrate` nicht, ein haptischer Hinweis fällt also weg. Menschliche Reaktionszeiten sind rechtsschief, deshalb log-normal:
- fokussiert (Handy in der Hand): Median 1,1 s, σ 0,3, mindestens 0,5 s, p90 ≈ 1,6 s
- typisch: Median 1,5 s, σ 0,4, mindestens 0,6 s, p90 ≈ 2,5 s
- abgelenkt (redet, Handy im Schoß): Median 2,3 s, σ 0,45, mindestens 0,8 s, p90 ≈ 4,1 s
- zum Vergleich gleichverteilt 600–2500 ms (Vorgabe des Koordinators). Diese Verteilung hat eine harte Obergrenze, deshalb springt das Ergebnis zwischen 2000 und 2500 ms von 74 % auf 100 %.

**Varianten:** `reactionWindowMs` 2000, 2500, 3000 (Start), 3500 und 4000 ms. Jede Variante mit allen vier Profilen. Alle Angegriffenen versuchen zu reagieren (`reactionChance` 1), Regeln und Brett aus EXP-002/003.

**Objektive Messgrößen:** Reaktionsfenster je Partie, Anteil gelungener Reaktionen (Schild oder Festhalten), Anteil verspäteter Reaktionen, mittlere Zeit bis zur Auflösung, Zeit je Partie in Reaktionsfenstern samt Ergebnisanzeige.

**Subjektive Playtest-Fragen (für Ruben):** Bemerkt die angegriffene Person das Fenster rechtzeitig, obwohl sie auf den Fernseher schaut? Fühlen sich 3 s hektisch-witzig oder unfair an? Versteht man „Festhalten!“ ohne Erklärung?

**Testumgebung:** siehe „Gemeinsamer Aufbau“. Je Zeile Seeds 1–200 für jede Spielerzahl 2/3/4, also 600 Partien.

**Ergebnisse:**

**EXP-004 Reaktionsdauer (5 Runden, Seeds 1–200 je Zeile und Spielerzahl 2/3/4, Regeln aus EXP-002/003)**

| Fenster | Reaktionszeit | Fenster/Partie | gelungen | zu spät | Ø bis Auflösung s | s/Partie |
| --- | --- | --- | --- | --- | --- | --- |
| 2000 ms | gleichverteilt 600–2500 | 1,16 | 74 % | 26 % | 1,5 | 3,5 |
| 2000 ms | fokussiert (Median 1,1 s) | 1,11 | 99 % | 1 % | 1,2 | 3,0 |
| 2000 ms | typisch (Median 1,5 s) | 1,11 | 74 % | 26 % | 1,5 | 3,3 |
| 2000 ms | abgelenkt (Median 2,3 s) | 1,11 | 34 % | 66 % | 1,8 | 3,7 |
| 2500 ms | gleichverteilt 600–2500 | 1,16 | 100 % | 0 % | 1,6 | 3,5 |
| 2500 ms | fokussiert (Median 1,1 s) | 1,11 | 100 % | 0 % | 1,2 | 3,0 |
| 2500 ms | typisch (Median 1,5 s) | 1,11 | 88 % | 12 % | 1,6 | 3,5 |
| 2500 ms | abgelenkt (Median 2,3 s) | 1,11 | 54 % | 46 % | 2,1 | 4,0 |
| 3000 ms | gleichverteilt 600–2500 | 1,16 | 100 % | 0 % | 1,6 | 3,5 |
| 3000 ms | fokussiert (Median 1,1 s) | 1,11 | 100 % | 0 % | 1,2 | 3,0 |
| 3000 ms | typisch (Median 1,5 s) | 1,11 | 97 % | 3 % | 1,6 | 3,5 |
| 3000 ms | abgelenkt (Median 2,3 s) | 1,10 | 69 % | 31 % | 2,3 | 4,2 |
| 3500 ms | gleichverteilt 600–2500 | 1,16 | 100 % | 0 % | 1,6 | 3,5 |
| 3500 ms | fokussiert (Median 1,1 s) | 1,11 | 100 % | 0 % | 1,2 | 3,0 |
| 3500 ms | typisch (Median 1,5 s) | 1,11 | 99 % | 1 % | 1,7 | 3,5 |
| 3500 ms | abgelenkt (Median 2,3 s) | 1,11 | 79 % | 21 % | 2,4 | 4,4 |
| 4000 ms | gleichverteilt 600–2500 | 1,16 | 100 % | 0 % | 1,6 | 3,5 |
| 4000 ms | fokussiert (Median 1,1 s) | 1,11 | 100 % | 0 % | 1,2 | 3,0 |
| 4000 ms | typisch (Median 1,5 s) | 1,11 | 100 % | 0 % | 1,7 | 3,5 |
| 4000 ms | abgelenkt (Median 2,3 s) | 1,11 | 87 % | 13 % | 2,5 | 4,4 |

- Bei 3000 ms gelingen fokussiert 100 %, typisch 97 % und abgelenkt 69 % der Reaktionen. Mit 2000 ms schafft es auch typisch nur noch 74 %. Mit 4000 ms kommen abgelenkte Spieler auf 87 %.
- Die Zeitkosten sind in allen Varianten klein: ≈ 1,1 Fenster je Partie, zusammen 3–4,4 s je Partie (≈ 2 % der Brettzeit). Ein längeres Fenster kostet nur dann Zeit, wenn niemand reagiert (+0,5 s je 500 ms).
- Die Unsicherheit liegt in der Annahme über die Reaktionszeit, nicht im Fenster. Zwischen den Profilen liegen bei 3000 ms 31 Prozentpunkte, zwischen 3000 und 3500 ms bei „typisch“ nur 2.

**Entscheidung:** **keep 3000 ms.** Bei typischen Reaktionszeiten gelingen ≥ 95 %, die Zeitkosten sind vernachlässigbar, und der Druckmoment bleibt kurz. **iterate** nach dem Playtest: Liegt die gemessene Reaktionszeit im Median über ≈ 2 s, auf 3500 ms erhöhen.

**Offen für Playtest:** Ob Menschen das Fenster bemerken, lässt sich nur am echten Gerät beurteilen. Dafür am besten die echten Reaktionszeiten mitschreiben (Vorschlag als Folgeaufgabe).

**Für später (CHAOS-44):** Kurzer Hinweiston am Controller beim Angriff (iOS kann nicht vibrieren). Längeres Fenster als Barrierefreiheits-Option.
