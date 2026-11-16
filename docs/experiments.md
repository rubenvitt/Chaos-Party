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
| EXP-005 | Arcade-Minispiel: drei Konzepte | CHAOS-29, CHAOS-30 | keep A4 „Sockenregen“; B „Kuckucks-Klatsche“, C „Aufzieh-Takt“ discard |
| EXP-006 | Physik-Minispiel (Havok): Konzepte | CHAOS-29, CHAOS-31 | keep A5 „Pudding-Gerangel“ (Kirschfleck + Wackelkrone); „Letzter oben“, Saldo, „Krümel-Kehraus“ discard |
| EXP-007 | Hybrid-Minispiel: Konzepte | CHAOS-29, CHAOS-32 | keep A6 „Wackelturm“; B „Geysir-Gier“ discard (gierig dominant) |
| EXP-008 | Look-Dev: drei moderne Stilrichtungen | CHAOS-56 | Mix aus A und C, etwas realistischer → EXP-009 |
| EXP-009 | Look-Dev Runde 2: „Stilisierte Natur“ | CHAOS-57 | keep: Richtung bestätigt (Ruben, 2026-11-15); Lichtstimmung offen → EXP-010 |
| EXP-010 | Lichtstimmung: je Brett, Uhrzeit oder Spielverlauf, inkl. Nacht | CHAOS-60 | keep C „Spielverlauf“ (Ruben, 2026-11-15); A und B discard |
| EXP-011 | Partiedauer und Runden-Vorschläge mit echten Minispielen | CHAOS-40 | Vorschläge 3/5/8 → **10/16/20**, Standard 5 → **10**; 40 min nicht unter `MAX_ROUNDS` 20 |
| EXP-012 | Wertung, Gleichstandsregel, Aufholeffekt, Trophäen-Ökonomie | CHAOS-40 | keep: Preis 15, Minispiel 10/5/3/0; dritte Stufe (Minispiel-Siege) fast nie nötig |
| EXP-013 | Sabotage-Häufigkeit und Item-Stärke über lange Partien | CHAOS-40 | keep Klau 5/Falle 4; iterate nach Playtest (erster Hebel Klau 6/Falle 5) |
| EXP-014 | Host-Grafik auf echter GPU: Engpass der Grafikstufen | CHAOS-73 | keep: PCSS mit Filterstufe LOW, Auflösungsgrenze je Stufe, Automatik merkt sich die Stufe; WebGPU → CHAOS-75 |
| EXP-016 | Kuckucks-Klatsche überarbeitet: Arcade nur mit A | CHAOS-54 | keep K2: eigene Türen, Gong-Klau, Finten, 1 s benommen, Mitternacht; Finten-Beutel (K8) discard |

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
- **Seeds:** 1–200 je Variante und Spielerzahl (2, 3, 4), also 600 Partien je Variante. **5 Runden** (damaliger Server-Standard `DEFAULT_ROUNDS`, seit EXP-011 10), Brett Wackelwald.
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

---

## EXP-005: Arcade-Minispiel – Konzeptvergleich (2026-11-15, CHAOS-29, CHAOS-30)


**Hypothese / gewünschtes Spielerlebnis:** Das Arcade-Minispiel ist in Sekunden verstanden, verlangt Reflex, Timing oder Positionierung (kein Physik-Schubsen, das macht das Physik-Minispiel) und bleibt bis zum Schluss offen: Die Führung wechselt, Fehler sind witzig statt bitter, und auch schwächere Spieler gewinnen gelegentlich. Am Fernseher passiert ständig etwas, alle spielen gleichzeitig. Erwartung vorher: Ein Positionierungsspiel in einer gemeinsamen Arena erzeugt mehr Wechsel und mehr Chancen für Schwächere als reine Reaktions- oder Taktspiele, die nur die schnellsten Finger belohnen.

**Varianten** (drei eigene Konzepte, Figuren und Namen frei erfunden):
- **A „Sockenregen“ (Positionierung + Reflex):** Waschmaschine Wumms schleudert Socken und Bügeleisen in eine runde Arena, ein Schatten zeigt den Landepunkt. Socke fangen oder vom Boden aufsammeln = 1 Punkt, Goldsocke = 3. Bügeleisen plätten alle im roten Kreis (1,4 s bewegungsunfähig). Letzte 8 s „Schleudergang“: doppelt so viele Würfe. Erwartet: viel Gedränge und Wechsel; Stick braucht in kleinen iPad-Zonen Platz.
  - A1: nur Stick.
  - A2: + A = Hechtsprung (kurz 2,6× schneller, 1,6 s Abklingzeit). Mehr Ausdruck, ein Knopf mehr.
  - A3: A2 + Treffer kostet eine Socke, die daneben liegen bleibt und die jeder schnappen darf.
  - A4: A3 + gezielte Bügeleisen (50 % der Bügeleisen) fliegen bevorzugt auf die alleinige Führung („Wumms mag keine Angeber“). Sichtbarer Aufholmechanismus.
  - A5: A4 + die Hälfte der Goldsocken landet neben der/dem Letzten (unsichtbarer Gummiband-Effekt).
- **B „Kuckucks-Klatsche“ (Reflex):** Eine schiefe Kuckucksuhr öffnet ihr Türchen. Kuckuck → sofort A; Finte (Gummiente, Socke, Blume) oder zu früh → −1. B1: nur der Schnellste +1. B2: Schnellster +2, alle anderen im Zeitfenster +1. Erwartet: perfekt für iPad-Zonen, aber viel Warten und Sieg für die schnellsten Finger.
- **C „Aufzieh-Takt“ (Timing):** Ein Ring schrumpft auf Schraubis Aufziehschlüssel; A im richtigen Moment = 2 (genau) / 1 (knapp), 5 Treffer am Stück +1, Takt wird schneller. Erwartet: sehr leicht verständlich, aber jeder spielt für sich.

**Objektive Messgrößen:** Rundendauer, Punkte des Siegers, relativer Abstand Platz 1–2, Gleichstand auf Platz 1, Führungswechsel je Runde, „Comeback“ (Sieger führte nach 2/3 der Zeit nicht allein), Siegquote des stärksten und des schwächsten Bots (Gleichstand anteilig) gegen den fairen Anteil 1/n, Aktionen je Spieler und 10 s (Ziele wählen, Knöpfe), Eingabe-Komplexität, Eignung für kleine iPad-Zonen, Länge der Anleitung (≤ 3 Zeilen à 64 Zeichen).

**Subjektive Playtest-Fragen (für Ruben):** siehe „Offen für Playtest“.

**Testumgebung:** Node 22.23, Linux-Container, Basis-Commit `290a4d1`, Branch `worktree-agent-a376da6934423c3cc`; Ergebnisse vom Commit, der diesen Eintrag einführt. Seeds 1–300 je Zeile und Spielerzahl (2, 3, 4). Prototypen grob mit 1/30-s-Schritten, die Kontrollzeile A4* mit 1/60-s-Schritten auf der echten Spiellogik.

- **Wiederholen** (≈ 6 s): `EXPERIMENTS=1 pnpm exec vitest run packages/minigames/src/prototypes/arcade --silent=false`. Ohne `EXPERIMENTS=1` läuft nur ein Smoke-Test (Teil von `pnpm test`).
- **Code:** `packages/minigames/src/prototypes/arcade/` – `common.ts` (Bot-Profile, Kennzahlen), `sockenregen.ts`, `kuckuck.ts`, `aufziehtakt.ts` (Prototypen), `sockenregenBot.ts` (Bots für die echte Logik `packages/minigames/src/sockenregen/logic.ts`), `experiment.ts` (Tabellen).
- **Bots:** vier Profile mit angenommenen Couch-Werten (nicht gemessen): Profi (Reaktion 230 ms, Takt-Fehler σ 35 ms, Finte 6 %), Gut (310 ms, 55 ms, 12 %), Normal (400 ms, 80 ms, 20 %), Neuling (560 ms, 120 ms, 32 %); dazu Lenkrauschen, Gefahr-Bemerken (95–50 %), Zielwahl-Urteil (90–40 %), Aussetzer (2–12 %). Reaktionszeiten log-normal. Besetzung: 2 Sp. = Profi + Neuling, 3 Sp. = Profi + Normal + Neuling, 4 Sp. = alle. Zusätzlich „knappe Besetzungen“: Duell Gut gegen Normal und 4× Normal.
- **Rauschen:** Bei 300 Seeds liegt der Standardfehler einer Quote um 50 % bei ≈ 3 Prozentpunkten. Unterschiede von 1–4 Punkten zwischen A-Varianten sind Rauschen (A1 und A2 verschieben sich schon, wenn eine Variante eine Zufallszahl mehr zieht).

**Ergebnisse:**

**EXP-005 Arcade-Konzepte (Seeds 1–300 je Zeile)**

| Variante | Sp. | Dauer s | Punkte P1 | Abstand 1–2 | Gleichstand P1 | Führungswechsel | Comeback | Siege Profi | Siege Neuling | fair | Aktionen/10 s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1: Sockenregen, nur Stick | 2 | 30 | 30,8 | 32 % | 3 % | 1,6 | 13 % | 90 % | 10 % | 50 % | 19,4 |
| A1: Sockenregen, nur Stick | 3 | 30 | 24,1 | 26 % | 5 % | 2,1 | 23 % | 82 % | 3 % | 33 % | 18,7 |
| A1: Sockenregen, nur Stick | 4 | 30 | 19,8 | 22 % | 9 % | 2,6 | 31 % | 63 % | 2 % | 25 % | 18,3 |
| A2: Sockenregen + Hechtsprung (A) | 2 | 30 | 32,0 | 33 % | 2 % | 1,3 | 9 % | 94 % | 6 % | 50 % | 22,4 |
| A2: Sockenregen + Hechtsprung (A) | 3 | 30 | 24,8 | 26 % | 5 % | 2,2 | 19 % | 79 % | 2 % | 33 % | 21,9 |
| A2: Sockenregen + Hechtsprung (A) | 4 | 30 | 20,2 | 22 % | 6 % | 2,5 | 33 % | 70 % | 2 % | 25 % | 21,4 |
| A3: A2 + Bügeleisen kostet 1 Socke | 2 | 30 | 32,2 | 34 % | 1 % | 1,3 | 8 % | 94 % | 6 % | 50 % | 22,5 |
| A3: A2 + Bügeleisen kostet 1 Socke | 3 | 30 | 24,8 | 26 % | 5 % | 2,2 | 21 % | 84 % | 2 % | 33 % | 22,1 |
| A3: A2 + Bügeleisen kostet 1 Socke | 4 | 30 | 20,5 | 23 % | 8 % | 2,6 | 33 % | 70 % | 1 % | 25 % | 21,7 |
| A4: A3 + Bügeleisen zielen auf Führung | 2 | 30 | 31,8 | 32 % | 3 % | 1,4 | 10 % | 95 % | 5 % | 50 % | 22,6 |
| A4: A3 + Bügeleisen zielen auf Führung | 3 | 30 | 25,0 | 28 % | 2 % | 2,0 | 19 % | 85 % | 2 % | 33 % | 22,1 |
| A4: A3 + Bügeleisen zielen auf Führung | 4 | 30 | 20,7 | 24 % | 4 % | 2,6 | 32 % | 65 % | 2 % | 25 % | 21,8 |
| A5: A4 + halbe Goldsocken beim Letzten | 2 | 30 | 31,8 | 33 % | 1 % | 1,3 | 10 % | 94 % | 6 % | 50 % | 22,5 |
| A5: A4 + halbe Goldsocken beim Letzten | 3 | 30 | 24,6 | 26 % | 5 % | 2,2 | 23 % | 79 % | 3 % | 33 % | 22,1 |
| A5: A4 + halbe Goldsocken beim Letzten | 4 | 30 | 20,5 | 23 % | 7 % | 2,6 | 30 % | 68 % | 2 % | 25 % | 21,5 |
| A4*: A4 auf der echten Spiellogik | 2 | 30 | 32,2 | 36 % | 1 % | 1,3 | 8 % | 95 % | 5 % | 50 % | 22,6 |
| A4*: A4 auf der echten Spiellogik | 3 | 30 | 24,9 | 28 % | 5 % | 2,0 | 20 % | 85 % | 2 % | 33 % | 22,0 |
| A4*: A4 auf der echten Spiellogik | 4 | 30 | 20,5 | 24 % | 7 % | 2,6 | 32 % | 70 % | 3 % | 25 % | 21,3 |
| B1: Kuckucks-Klatsche, Schnellster +1 | 2 | 30 | 4,8 | 98 % | 0 % | 0,0 | 0 % | 100 % | 0 % | 50 % | 1,7 |
| B1: Kuckucks-Klatsche, Schnellster +1 | 3 | 30 | 4,5 | 91 % | 1 % | 0,1 | 5 % | 99 % | 0 % | 33 % | 1,7 |
| B1: Kuckucks-Klatsche, Schnellster +1 | 4 | 30 | 3,7 | 67 % | 9 % | 0,3 | 13 % | 89 % | 0 % | 25 % | 1,7 |
| B2: Kuckucks-Klatsche, 2 / Rest 1 | 2 | 30 | 9,7 | 62 % | 0 % | 0,1 | 1 % | 100 % | 0 % | 50 % | 1,7 |
| B2: Kuckucks-Klatsche, 2 / Rest 1 | 3 | 30 | 9,4 | 48 % | 1 % | 0,2 | 6 % | 99 % | 0 % | 33 % | 1,7 |
| B2: Kuckucks-Klatsche, 2 / Rest 1 | 4 | 30 | 8,7 | 32 % | 10 % | 0,3 | 13 % | 88 % | 0 % | 25 % | 1,7 |
| C1: Aufzieh-Takt | 2 | 30 | 79,5 | 57 % | 0 % | 0,1 | 0 % | 100 % | 0 % | 50 % | 12,7 |
| C1: Aufzieh-Takt | 3 | 30 | 79,4 | 35 % | 0 % | 0,3 | 0 % | 100 % | 0 % | 33 % | 12,7 |
| C1: Aufzieh-Takt | 4 | 30 | 79,8 | 16 % | 1 % | 0,9 | 5 % | 99 % | 0 % | 25 % | 12,8 |

**EXP-005 Knappe Besetzungen (Seeds 1–300)**

| Variante | Duell: Siege Normal | Duell: Gleichstand | Duell: Führungswechsel | 4× Normal: Abstand 1–2 | 4× Normal: Gleichstand P1 | 4× Normal: Führungswechsel | 4× Normal: Comeback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1: Sockenregen, nur Stick | 33 % | 5 % | 2,2 | 17 % | 12 % | 3,2 | 40 % |
| A2: Sockenregen + Hechtsprung (A) | 32 % | 5 % | 2,2 | 17 % | 13 % | 3,0 | 42 % |
| A3: A2 + Bügeleisen kostet 1 Socke | 33 % | 3 % | 2,3 | 17 % | 16 % | 3,2 | 42 % |
| A4: A3 + Bügeleisen zielen auf Führung | 33 % | 4 % | 2,2 | 19 % | 8 % | 3,0 | 42 % |
| A5: A4 + halbe Goldsocken beim Letzten | 31 % | 6 % | 2,5 | 18 % | 10 % | 3,1 | 41 % |
| A4*: A4 auf der echten Spiellogik | 34 % | 4 % | 2,5 | 17 % | 10 % | 3,0 | 49 % |
| B1: Kuckucks-Klatsche, Schnellster +1 | 15 % | 7 % | 0,3 | 40 % | 32 % | 0,6 | 35 % |
| B2: Kuckucks-Klatsche, 2 / Rest 1 | 15 % | 8 % | 0,3 | 17 % | 27 % | 0,6 | 34 % |
| C1: Aufzieh-Takt | 2 % | 1 % | 1,0 | 8 % | 9 % | 2,9 | 38 % |

**EXP-005 Bedienung und Verständlichkeit**

| Konzept | Eingabe | Interaktion | iPad-Zone | Anleitung | längste Zeile |
| --- | --- | --- | --- | --- | --- |
| A: Sockenregen | Stick (+ A) | hoch: gleiche Socken, Gedränge | mittel: Stick braucht Platz | 3 Zeilen | 62 Zeichen |
| B: Kuckucks-Klatsche | nur A | mittel: Wettlauf um den Ersten | sehr gut: ein großer Knopf | 2 Zeilen | 53 Zeichen |
| C: Aufzieh-Takt | nur A | kaum: jeder spielt für sich | sehr gut: ein großer Knopf | 2 Zeilen | 58 Zeichen |

- **Chancen für Schwächere:** Nur Sockenregen lässt den Schwächeren gewinnen. Im knappen Duell (Gut gegen Normal) gewinnt Normal in A 31–34 %, in B 15 %, in C 2 %. Gegen den Profi gewinnt der Neuling in A noch 5–10 % (2 Sp.), in B und C nie. B und C sind reine Fingerrennen: Wer schneller reagiert oder genauer drückt, gewinnt fast immer.
- **Spannung:** A hat 1,3–2,6 Führungswechsel je Runde (4× Normal: 3,0), B 0–0,6, C 0,1–0,9 (bei gleich starken 2,9, weil alle eng beieinander liegen). Comeback-Quote A 8–33 % je nach Besetzung, bei gleich Starken 40–49 %.
- **Beschäftigung:** A ≈ 22 Aktionen je Spieler und 10 s, C ≈ 13 (alle 0,8 s ein Druck), B nur 1,7: Bei der Kuckucks-Klatsche wartet man 90 % der Zeit.
- **Gleichstand:** A 1–9 %, B bis 32 % (4× Normal, B1) – zu viele geteilte Plätze bei wenigen Punkten.
- **Hechtsprung (A2):** misst sich kaum in Siegquoten, bringt aber +15 % Aktionen und eine Ausweich-/Rettungsmöglichkeit; macht aus „nur laufen“ eine Entscheidung (wann?).
- **Aufholhelfer (A3–A5):** keine messbare Wirkung auf die Siegquoten (innerhalb des Rauschens). A4 senkt den Gleichstand bei 4 Spielern leicht (4 % statt 6–8 %), ebenfalls nahe am Rauschen. Der Abstand zwischen Profi und Neuling ist größer, als ein Spielelement ausgleichen kann, ohne unfair zu werden.
- **A4\* (echte Spiellogik)** liegt in allen Kennzahlen innerhalb des Rauschens von A4: Die umgesetzte Logik entspricht dem Prototyp.
- **Verständlichkeit:** Alle Anleitungen passen in 2–3 Zeilen (≤ 62 Zeichen). B und C brauchen nur A und eignen sich am besten für kleine iPad-Zonen; A braucht Stick + A (gleiches Layout wie überall, aber der Stick braucht in der 4er-Zone Platz).

**Entscheidung:** **keep A4 „Sockenregen“** (ID `sockenregen`, 30 s, Stick = Laufen, A = Hechtsprung): klar die meisten Führungswechsel und als einziges Konzept echte Chancen für Schwächere, dazu ständig Bewegung am Fernseher und Interaktion um dieselben Socken, ohne Physik-Schubsen. Hechtsprung (A2) bleibt wegen des Ausdrucks und der Rettungsmomente. „Treffer kostet eine Socke“ (A3) bleibt als sichtbares Chaos (die Socke fliegt heraus, alle rennen hin) ohne harte Strafe (nie unter 0). „Bügeleisen zielen auf die Führung“ (A4) bleibt als sichtbarer, erklärbarer Aufholmechanismus, obwohl er sich in Siegquoten nicht messen lässt; ob er sich gut oder gemein anfühlt, klärt der Playtest. **discard A5** (unsichtbares Gummiband ohne messbare Wirkung). **discard B** (Wartezeit, Gleichstände, Sieg der schnellsten Finger) und **C** (keine Interaktion, Schwächere chancenlos) als M3-Arcade-Spiel; B bleibt ein Kandidat für ein kurzes Zwischenspiel (siehe unten).

**Umsetzung:** `packages/minigames/src/sockenregen/` (`logic.ts` rein, `index.ts` Babylon-Ansicht, `highlights.ts`, Tests). Belegbilder: `docs/screenshots/m3-minispiel-sockenregen.png` (mitten im Spiel, 4 Spieler, Blau gerade geplättet, Bügeleisen im Anflug) und `docs/screenshots/m3-minispiel-sockenregen-ende.png` (Ende, Sieger hüpft).

**Offen für Playtest:**
- Erkennt man auf dem Fernseher sofort Socke (weißer Ring) gegen Bügeleisen (roter Kreis), auch bei vier Spielern und im Schleudergang?
- Fühlt sich „Bügeleisen zielen auf die Führung“ witzig („Wumms mag keine Angeber“) oder gemein an? Merkt man es überhaupt?
- Ist „geplättet“ (1,4 s still, eine Socke weg) die richtige Härte?
- Wird der Hechtsprung genutzt und verstanden, oder reicht der Stick?
- Ist der Stick in der 4er-iPad-Zone präzise genug für 0,8 m Fangradius? (Simulation kann Touch-Präzision nicht beurteilen.)
- 30 s: zu kurz, genau richtig, zu lang? Ist der Schleudergang als Finale spürbar?
- Die Bot-Profile sind Annahmen; echte Reaktionszeiten am Gerät könnten die Abstände verschieben.

**Für später (CHAOS-44):** B „Kuckucks-Klatsche“ als kurzes Reaktions-Zwischenspiel (nur A, ideal für iPad-Zonen; mit 2/1-Wertung und weniger Finten). C „Aufzieh-Takt“ als Solo-Übung im Controller-Wartebildschirm.

---

## EXP-006: Physik-Minispiel – Konzeptvergleich mit Havok (2026-11-15, CHAOS-29, CHAOS-31)


**Hypothese / gewünschtes Spielerlebnis:** Ein Physik-Minispiel macht Spaß, wenn die Umgebung selbst Chaos stiftet und die Spieler sich gegenseitig schubsen. Es soll trotzdem lesbar und fair bleiben: ein klares Ziel am Fernseher, niemand sitzt lange daneben, ein Comeback ist möglich. Bedienung nur mit Joystick und einem Knopf, damit es auch in einer iPad-Zone geht. Die Erwartung vorher war, dass ein reines Runterschubsen („Letzter oben“) am witzigsten, aber am unfairsten ist und Ausgeschiedene langweilt.

**Varianten:** Alle Varianten sind eigene Ideen. Figuren sind Havok-Kapseln (1,5 × 0,45 m, gesperrte Drehung) mit Lenkung, Rempler auf A (Stoß 9 m/s, Abklingzeit 1 s) und einem Extra-Schubs beim Treffer.
- **A „Wackelpudding – Letzter oben“:** Ein runder Wackelpudding (r = 6 m, ANIMATED-Körper) kippt zum Gewicht der Figuren und schwabbelt von selbst. Ein Rührlöffel kreist. Wer fällt, ist raus. Punkte = überlebte Sekunden. Erwartet: viel Spannung, aber Zuschauerzeit und viele Gleichstände.
- **A2 „Plumps-Comeback“:** wie A, aber Gefallene plumpsen nach 1,5 s von oben zurück. Wertung entweder *Saldo* (Schubser − Stürze) oder *Stürze* (wer am seltensten fällt). Erwartet: keine Zuschauer, aber kleine Punktzahlen und damit Gleichstände.
- **A2 ohne Besen:** wie A2 Saldo, ohne Rührlöffel. Prüft, wie viel der Löffel beiträgt.
- **A3 „Wackel-Wahnsinn“:** A/A2 nach Runde 1 mit mehr Chaos: rutschiger (Reibung 0,12 statt 0,35), stärkere Neigung (max. 0,3 rad), mehr Schwabbeln, schnellerer und höherer Löffel, kräftigere Rempler (×1,3).
- **A4 „Kirschfleck“:** A3 plus ein Kirschfleck (r = 1,4 m), der alle 6 s weiterhüpft. Punkte gibt es pro Sekunde auf dem Fleck (4 je s). Weil sich alle am Fleck drängen, kippt der Pudding genau dorthin. *A4b:* Fleck größer (1,7 m) und schneller (alle 4 s). *A4c:* wie A4b, aber die Punkte werden unter allen auf dem Fleck geteilt.
- **A5 „Kirschfleck + Wackelkrone“:** A4b plus Wackelkrone: Rempler gegen die alleinige Führung wirken 1,5-mal so stark, und die Bots jagen bevorzugt die Führung.
- **B „Krümel-Kehraus“:** Runder Tisch mit Rand und einer Lücke je Spieler (Tor in Slot-Farbe). Zehn Kekskrümel (Havok-Kugeln) schiebt man durch die eigene Lücke. Ein schweres Wollknäuel wird alle 5 s quer über den Tisch gekickt. Wer selbst durch eine Lücke fällt, ist 1 s weg. Erwartet: viele Körper, viel Physik, aber unübersichtlich.
- **Z „Pudding-Gerangel“:** die Umsetzung von A5 als echtes Minispiel. Gleiche Bots, eigene Logik, Optik und Löffel-Zuordnung. Die Zeile prüft, ob die Umsetzung den Prototyp trifft.

**Objektive Messgrößen:**
- Rundendauer.
- Punktabstand (Erster − Letzter).
- Gleichstand auf Platz 1.
- Chancen der schwächsten Person: Siegquote und Ø-Platz des schwachen Bots im Vergleich zum fairen Anteil 1/n.
- Stürze, Schubser (Sturz ≤ 4 s nach einem Rempler) und Löffel-Stürze je Runde.
- Zuschauer-Anteil (Zeit als Ausgeschiedener).
- Physik-Stabilität, gezählt bei jedem Schritt:
  - NaN in Position oder Geschwindigkeit,
  - eine Figur unter der Untergrenze, die nicht als „raus“ gilt,
  - eine Kapselmitte unter der Spielfläche, obwohl die Figur über der Fläche steht (Tunneln),
  - aktive Körper nach `dispose()`.
- Höchste Geschwindigkeit.
- Rechenzeit je fester Schritt (Logik + Havok + Bot, Mittel und p99).
- Bedienung (Knöpfe) und Anleitungslänge.

**Subjektive Playtest-Fragen (für Ruben):** siehe „Offen für Playtest“.

**Testumgebung:**
- Node 22.23, Linux-Container, Havok 1.3 (WASM) über `runMinigameHeadless`, NullEngine, fester Schritt 1/60 s.
- Branch `worktree-agent-a84e8eeaaeff11961`, Basis-Commit `290a4d1`; Ergebnisse vom Commit, der diesen Eintrag einführt.
- Seeds 1–40 je Variante und Spielerzahl (2, 3, 4), also 120 Runden je Variante. Runden von 30 s.
- **Bots:** Je Runde ist ein Bot schwach, und welcher, wechselt reihum mit dem Seed (keine Slot-Verzerrung). Die anderen sind normal.
  - *normal:* entscheidet alle 10 Schritte, Zielstreuung 0,25 rad, nutzt 60 % der Rempler-Gelegenheiten, weicht dem Löffel aus.
  - *schwach:* alle 24 Schritte, Streuung 0,6 rad, 30 % der Rempler, sieht den Löffel nicht.
  - *etwas schwächer* (Empfindlichkeit): alle 14 Schritte, Streuung 0,35 rad, 45 % der Rempler.
- Die Bots in A/A2/A3 bleiben in der Mitte, wenn Rand, Gefälle oder Löffel drohen, und jagen sonst die nächste Figur. In A4/A5/Z laufen sie zum Fleck und rempeln dort Rivalen, die Führung zuerst. In B wählen sie den Krümel mit dem besten Weg-und-Tor-Abstand, stellen sich dahinter und schieben.
- **Wiederholen** (≈ 6 min):

  ```sh
  EXPERIMENTS=1 pnpm exec vitest run packages/minigames/src/prototypes/physics --silent=false
  ```

  `EXP_FILTER=<Teil des Namens>` beschränkt auf einzelne Varianten. Ohne `EXPERIMENTS=1` läuft nur ein Smoke-Test: je Variante ein 6-s-Lauf mit 4 Bots, Stabilität und Aufräumen, Teil von `pnpm test`.
- **Code:** Prototypen in `packages/minigames/src/prototypes/physics/` (`wackel.ts`, `kruemel.ts`, `shared.ts`, `experiments.test.ts`), Umsetzung in `packages/minigames/src/pudding-gerangel/`.
- **Rechenzeit:** Zeit zwischen zwei Skriptaufrufen, also Logik + Havok-Schritt + Bot + Messung, in Node ohne Rendern. Die p99-Werte sind verrauscht, weil parallel Browser-Screenshots und andere Tests liefen. Einzelne Ausreißer (bis 41 ms) sind GC und JIT beim Aufwärmen. Die Mittelwerte sind belastbar.

**Ergebnisse:**

**EXP-006 Physik-Prototypen (30 s, Seeds 1–40 je Zeile)**

| Variante | Sp. | Dauer s | Abstand | Gleichst. Pl. 1 | Schwach Pl. 1 | Schwach Ø Platz | fair | Stürze | Schubser | Krümel | Zuschauer-Anteil | Löffel-Stürze | instabil | max m/s | ms/Schritt | ms p99 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A: Letzter oben | 2 | 19,3 | 0,7 | 30 % | 57 % | 1,4 | 50 % | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0 | 14,0 | 0,047 | 2,85 |
| A: Letzter oben | 3 | 20,4 | 9,1 | 38 % | 35 % | 2,0 | 33 % | 0,9 | 0,8 | 0,0 | 0,1 | 0,0 | 0 | 16,2 | 0,103 | 6,50 |
| A: Letzter oben | 4 | 24,9 | 10,2 | 63 % | 43 % | 2,2 | 25 % | 1,5 | 1,4 | 0,0 | 0,1 | 0,0 | 0 | 14,2 | 0,046 | 1,14 |
| A2: Comeback, Saldo | 2 | 30,0 | 1,2 | 45 % | 70 % | 1,3 | 50 % | 1,4 | 1,2 | 0,0 | 0,0 | 0,0 | 0 | 14,0 | 0,027 | 0,15 |
| A2: Comeback, Saldo | 3 | 30,0 | 2,0 | 28 % | 45 % | 1,9 | 33 % | 2,9 | 2,7 | 0,0 | 0,0 | 0,0 | 0 | 16,4 | 0,047 | 1,18 |
| A2: Comeback, Saldo | 4 | 30,0 | 2,0 | 35 % | 30 % | 2,2 | 25 % | 2,6 | 2,4 | 0,0 | 0,0 | 0,0 | 0 | 16,6 | 0,062 | 0,76 |
| A2: Comeback, Stürze | 2 | 30,0 | 0,6 | 53 % | 70 % | 1,3 | 50 % | 1,4 | 1,2 | 0,0 | 0,0 | 0,0 | 0 | 14,0 | 0,042 | 0,23 |
| A2: Comeback, Stürze | 3 | 30,0 | 1,0 | 53 % | 45 % | 1,9 | 33 % | 2,9 | 2,7 | 0,0 | 0,0 | 0,0 | 0 | 16,4 | 0,069 | 4,19 |
| A2: Comeback, Stürze | 4 | 30,0 | 1,1 | 78 % | 48 % | 2,2 | 25 % | 2,6 | 2,4 | 0,0 | 0,0 | 0,0 | 0 | 16,6 | 0,055 | 1,58 |
| A2 ohne Besen, Saldo | 2 | 30,0 | 1,9 | 33 % | 40 % | 1,6 | 50 % | 1,4 | 1,2 | 0,0 | 0,0 | 0,0 | 0 | 14,1 | 0,038 | 0,17 |
| A2 ohne Besen, Saldo | 3 | 30,0 | 2,4 | 25 % | 30 % | 2,0 | 33 % | 2,9 | 2,6 | 0,0 | 0,0 | 0,0 | 0 | 16,1 | 0,041 | 0,27 |
| A2 ohne Besen, Saldo | 4 | 30,0 | 2,2 | 48 % | 33 % | 2,4 | 25 % | 2,6 | 2,5 | 0,0 | 0,0 | 0,0 | 0 | 15,8 | 0,039 | 1,39 |
| A3: Wackel-Wahnsinn, Saldo | 2 | 30,0 | 1,6 | 18 % | 55 % | 1,5 | 50 % | 4,0 | 2,4 | 0,0 | 0,0 | 0,0 | 0 | 17,3 | 0,038 | 0,21 |
| A3: Wackel-Wahnsinn, Saldo | 3 | 30,0 | 2,7 | 18 % | 25 % | 2,0 | 33 % | 5,3 | 3,8 | 0,0 | 0,0 | 0,0 | 0 | 21,3 | 0,042 | 0,26 |
| A3: Wackel-Wahnsinn, Saldo | 4 | 30,0 | 2,9 | 35 % | 23 % | 2,7 | 25 % | 6,6 | 4,6 | 0,0 | 0,0 | 0,0 | 0 | 17,7 | 0,059 | 0,52 |
| A3: Wackel-Wahnsinn, Stürze | 2 | 30,0 | 0,8 | 40 % | 63 % | 1,4 | 50 % | 4,0 | 2,4 | 0,0 | 0,0 | 0,0 | 0 | 17,3 | 0,042 | 1,84 |
| A3: Wackel-Wahnsinn, Stürze | 3 | 30,0 | 1,6 | 45 % | 33 % | 2,0 | 33 % | 5,3 | 3,8 | 0,0 | 0,0 | 0,0 | 0 | 21,3 | 0,046 | 0,61 |
| A3: Wackel-Wahnsinn, Stürze | 4 | 30,0 | 2,0 | 43 % | 23 % | 2,7 | 25 % | 6,6 | 4,6 | 0,0 | 0,0 | 0,0 | 0 | 17,7 | 0,048 | 0,37 |
| A4: Kirschfleck | 2 | 30,0 | 34,1 | 0 % | 3 % | 2,0 | 50 % | 2,4 | 1,5 | 0,0 | 0,0 | 0,0 | 0 | 16,5 | 0,038 | 0,88 |
| A4: Kirschfleck | 3 | 30,0 | 23,0 | 13 % | 3 % | 2,9 | 33 % | 3,3 | 2,5 | 0,0 | 0,0 | 0,0 | 0 | 18,0 | 0,040 | 0,48 |
| A4: Kirschfleck | 4 | 30,0 | 18,9 | 3 % | 5 % | 3,6 | 25 % | 5,8 | 4,8 | 0,0 | 0,0 | 0,0 | 0 | 20,5 | 0,047 | 0,49 |
| A4b: Kirschfleck flink+groß | 2 | 30,0 | 29,6 | 0 % | 3 % | 2,0 | 50 % | 1,8 | 1,2 | 0,0 | 0,0 | 0,0 | 0 | 17,2 | 0,031 | 0,13 |
| A4b: Kirschfleck flink+groß | 3 | 30,0 | 23,1 | 10 % | 0 % | 2,9 | 33 % | 3,6 | 2,8 | 0,0 | 0,0 | 0,0 | 0 | 21,1 | 0,030 | 0,11 |
| A4b: Kirschfleck flink+groß | 4 | 30,0 | 22,3 | 3 % | 0 % | 3,7 | 25 % | 5,9 | 4,6 | 0,0 | 0,0 | 0,0 | 0 | 22,0 | 0,042 | 0,33 |
| A4c: Kirschfleck geteilt | 2 | 30,0 | 29,5 | 0 % | 3 % | 2,0 | 50 % | 1,8 | 1,2 | 0,0 | 0,0 | 0,0 | 0 | 17,2 | 0,045 | 1,02 |
| A4c: Kirschfleck geteilt | 3 | 30,0 | 17,8 | 13 % | 0 % | 2,8 | 33 % | 3,5 | 2,7 | 0,0 | 0,0 | 0,0 | 0 | 21,1 | 0,057 | 2,39 |
| A4c: Kirschfleck geteilt | 4 | 30,0 | 14,1 | 13 % | 3 % | 3,6 | 25 % | 5,8 | 4,9 | 0,0 | 0,0 | 0,0 | 0 | 22,0 | 0,072 | 0,64 |
| A5: Kirschfleck + Wackelkrone | 2 | 30,0 | 22,2 | 0 % | 5 % | 2,0 | 50 % | 2,7 | 1,9 | 0,0 | 0,0 | 0,0 | 0 | 17,2 | 0,041 | 0,15 |
| A5: Kirschfleck + Wackelkrone | 3 | 30,0 | 18,5 | 0 % | 0 % | 2,7 | 33 % | 4,8 | 3,7 | 0,0 | 0,0 | 0,0 | 0 | 23,6 | 0,042 | 0,21 |
| A5: Kirschfleck + Wackelkrone | 4 | 30,0 | 17,7 | 10 % | 3 % | 3,6 | 25 % | 7,9 | 6,7 | 0,0 | 0,0 | 0,0 | 0 | 27,7 | 0,046 | 0,47 |
| A4: Kirschfleck ohne Besen | 2 | 30,0 | 30,0 | 0 % | 3 % | 2,0 | 50 % | 1,6 | 1,3 | 0,0 | 0,0 | 0,0 | 0 | 16,2 | 0,028 | 0,13 |
| A4: Kirschfleck ohne Besen | 3 | 30,0 | 20,9 | 10 % | 0 % | 2,9 | 33 % | 3,5 | 3,3 | 0,0 | 0,0 | 0,0 | 0 | 18,1 | 0,033 | 0,22 |
| A4: Kirschfleck ohne Besen | 4 | 30,0 | 18,8 | 5 % | 8 % | 3,4 | 25 % | 5,9 | 5,6 | 0,0 | 0,0 | 0,0 | 0 | 19,8 | 0,040 | 0,23 |
| A3: Wackel-Wahnsinn, Letzter | 2 | 10,0 | 1,0 | 0 % | 65 % | 1,4 | 50 % | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0 | 15,7 | 0,053 | 4,89 |
| A3: Wackel-Wahnsinn, Letzter | 3 | 16,8 | 8,7 | 18 % | 33 % | 1,9 | 33 % | 1,0 | 0,7 | 0,0 | 0,1 | 0,0 | 0 | 17,9 | 0,096 | 40,85 |
| A3: Wackel-Wahnsinn, Letzter | 4 | 20,8 | 14,1 | 35 % | 15 % | 2,8 | 25 % | 2,0 | 1,8 | 0,0 | 0,2 | 0,0 | 0 | 16,5 | 0,081 | 4,16 |
| Z: Pudding-Gerangel (Umsetzung) | 2 | 30,0 | 24,4 | 0 % | 5 % | 2,0 | 50 % | 2,3 | 1,6 | 0,0 | 0,0 | 0,6 | 0 | 20,1 | 0,066 | 4,26 |
| Z: Pudding-Gerangel (Umsetzung) | 3 | 30,0 | 16,1 | 5 % | 3 % | 2,8 | 33 % | 4,8 | 3,9 | 0,0 | 0,0 | 0,8 | 0 | 21,9 | 0,103 | 12,81 |
| Z: Pudding-Gerangel (Umsetzung) | 4 | 30,0 | 14,2 | 10 % | 8 % | 3,4 | 25 % | 7,6 | 6,3 | 0,0 | 0,0 | 0,9 | 0 | 20,0 | 0,073 | 2,55 |
| B: Krümel-Kehraus | 2 | 30,0 | 1,2 | 28 % | 53 % | 1,5 | 50 % | 6,8 | 0,0 | 9,1 | 0,0 | 0,0 | 0 | 14,2 | 0,091 | 3,54 |
| B: Krümel-Kehraus | 3 | 30,0 | 2,7 | 30 % | 23 % | 2,3 | 33 % | 9,1 | 0,0 | 12,7 | 0,0 | 0,0 | 0 | 14,3 | 0,089 | 4,24 |
| B: Krümel-Kehraus | 4 | 30,0 | 2,8 | 33 % | 18 % | 2,9 | 25 % | 16,2 | 0,0 | 20,0 | 0,0 | 0,0 | 0 | 14,4 | 0,076 | 3,79 |

**EXP-006 Empfindlichkeit: etwas schwächerer Bot (Seeds 1–40 je Zeile)**

| Variante | Sp. | Dauer s | Abstand | Gleichst. Pl. 1 | Schwach Pl. 1 | Schwach Ø Platz | fair | instabil | max m/s | ms/Schritt | ms p99 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A3: Wackel-Wahnsinn, Saldo | 2 | 30,0 | 1,4 | 18 % | 70 % | 1,3 | 50 % | 0 | 17,1 | 0,027 | 0,13 |
| A3: Wackel-Wahnsinn, Saldo | 3 | 30,0 | 2,8 | 23 % | 40 % | 1,8 | 33 % | 0 | 16,7 | 0,039 | 0,17 |
| A3: Wackel-Wahnsinn, Saldo | 4 | 30,0 | 3,1 | 30 % | 45 % | 2,3 | 25 % | 0 | 18,2 | 0,054 | 0,33 |
| A5: Kirschfleck + Wackelkrone | 2 | 30,0 | 16,7 | 5 % | 20 % | 1,8 | 50 % | 0 | 18,8 | 0,036 | 0,14 |
| A5: Kirschfleck + Wackelkrone | 3 | 30,0 | 14,3 | 13 % | 15 % | 2,4 | 33 % | 0 | 22,2 | 0,038 | 0,29 |
| A5: Kirschfleck + Wackelkrone | 4 | 30,0 | 13,7 | 15 % | 8 % | 3,2 | 25 % | 0 | 21,5 | 0,049 | 0,25 |
| Z: Pudding-Gerangel (Umsetzung) | 2 | 30,0 | 16,8 | 0 % | 8 % | 1,9 | 50 % | 0 | 17,0 | 0,037 | 0,20 |
| Z: Pudding-Gerangel (Umsetzung) | 3 | 30,0 | 14,2 | 8 % | 18 % | 2,3 | 33 % | 0 | 21,9 | 0,078 | 16,62 |
| Z: Pudding-Gerangel (Umsetzung) | 4 | 30,0 | 13,6 | 10 % | 8 % | 3,2 | 25 % | 0 | 21,9 | 0,067 | 2,78 |
| B: Krümel-Kehraus | 2 | 30,0 | 1,5 | 15 % | 45 % | 1,6 | 50 % | 0 | 14,1 | 0,052 | 0,72 |
| B: Krümel-Kehraus | 3 | 30,0 | 2,5 | 33 % | 40 % | 1,9 | 33 % | 0 | 14,0 | 0,076 | 2,61 |
| B: Krümel-Kehraus | 4 | 30,0 | 2,5 | 38 % | 40 % | 2,1 | 25 % | 0 | 16,0 | 0,076 | 3,61 |

Spalten: *Abstand* = Ø Punkte Erster − Letzter (in der Einheit der Variante). *Gleichst. Pl. 1* = Anteil der Runden mit geteiltem ersten Platz. *Schwach Pl. 1* = Siegquote des schwachen Bots (geteilte Siege zählen). *fair* = 1/n. *Stürze*, *Schubser* und *Löffel-Stürze* sind Summen je Runde über alle Spieler. *instabil* = Summe aus NaN, verlorenen Körpern, Tunnel-Schritten und Resten nach `dispose()` über alle 120 Runden.

**Beobachtungen:**
- **Stabilität:** in allen 2 160 simulierten Runden (14 Varianten + 4 Empfindlichkeitsläufe à 120) ohne Befund. Keine NaN, kein unbemerktes Durchfallen, kein Tunneln, alle Körper nach `dispose()` weg. Die Höchstgeschwindigkeit liegt bei 14–28 m/s (harte Grenze 22 m/s vor dem Schritt; ein Rempler im selben Schritt kann kurz darüber liegen). Rechenzeit im Mittel 0,03–0,1 ms je Schritt mit bis zu 4 Figuren und 13 Körpern. Das sind < 1 % des 60-fps-Budgets (16,7 ms), viel Luft fürs Rendern.
- **A „Letzter oben“:** zu kurz und zu zufällig. Mit 2 Spielern ist die Runde nach Ø 19 s vorbei, in A3 sogar nach 10 s. Bei 4 Spielern sind 63 % der Siege geteilt. Ausgeschiedene schauen 10–20 % der Zeit zu. → discard.
- **A2/A3 mit Saldo- oder Stürze-Wertung:** keine Zuschauer, aber kleine Zahlen (Abstand 1–3 Punkte), daher 18–78 % geteilte Siege. Der schwache Bot gewinnt so oft wie oder öfter als die normalen (bis 70 % bei 2 Spielern). Können zählt kaum, die Runde ist eine Lotterie. Das Chaos-Tuning (A3) hat die Stürze verdoppelt (4–6,6 je Runde) und den Pudding sichtbar lebendiger gemacht. Der Löffel trägt in A2 nur wenig bei (A2 mit und ohne Löffel fast gleich), mit A3-Werten deutlich mehr.
- **A4/A5/Z „Kirschfleck“:** fast nie Gleichstand (0–15 %). Laufende Punkte, alle immer im Spiel, ein klares Ziel am Bildschirm. Das Gedränge kippt den Pudding zum Fleck, so treibt die Physik das Spiel an. Der Preis: Können zählt stark. Der *schwache* Bot gewinnt nur 0–8 %. Der *etwas schwächere* gewinnt 8–20 % (fair wären 25–50 %), bei Ø-Platz 1,8–3,2. Größerer, schnellerer Fleck (A4b) und Teilen (A4c) helfen dem Schwachen nicht. Die Wackelkrone (A5) verkleinert den Abstand von ≈ 22 auf ≈ 14–18 Punkte.
- **B „Krümel-Kehraus“:** physikalisch am reichsten (13 Körper) und ebenfalls stabil. Mit 28–38 % geteilten Siegen und einem schwachen Bot, der bei 2 Spielern gleichauf liegt, ist B aber ähnlich zufällig wie A2. Bots fallen sehr oft durch die eigene Lücke (7–16 Stürze je Runde). Auf dem Fernseher wird es mit 10 Krümeln, 4 Toren und Knäuel unübersichtlich.
- **Z (Umsetzung) = A5:** Die Kennzahlen liegen innerhalb des Rauschens. Stürze 2,3/4,8/7,6 je Runde, Schubser 1,6/3,9/6,3, Löffel-Stürze 0,6–0,9.

**Entscheidung:** **keep A5 → umgesetzt als „Pudding-Gerangel“ (`pudding-gerangel`, 30 s).** Begründung:
1. Lesbarkeit: ein Ziel (Kirschfleck mit Kirsche an der Stange), eine Gefahr (runterfallen), sichtbare Führung (Krone).
2. Physik ist der Kern: Kippen zum Gewicht, Rutschen, Rempler, Löffel und Plumpsen erzeugen das Chaos. Es sind keine Effekte obendrauf.
3. Niemand schaut zu (Comeback nach 1,5 s).
4. Kaum geteilte Siege.
5. Bedienung: Joystick + A, Anleitung 3 Zeilen ≤ 64 Zeichen, iPad-Zonen-tauglich.
6. Stabil und billig.

Dass Können hier mehr zählt als bei A2/B, ist gewollt. Die Kategorie heißt „Physik“, nicht „Lotterie“, und die Wackelkrone ist das Comeback-Werkzeug. Ob das für schwächere Mitspieler fair genug ist, kann nur der Playtest zeigen (siehe unten). Stellschrauben: `TUNING.leaderBonk`, `zoneMoveMs`, `zoneRadius` und `zoneRate` in `packages/minigames/src/pudding-gerangel/logic.ts`.

**Verworfen:**
- A „Letzter oben“: zu kurz, Zuschauerzeit, geteilte Siege.
- A2/A3 mit Saldo- oder Stürze-Wertung: Lotterie, Gleichstände.
- B „Krümel-Kehraus“: unübersichtlich, zufällig, Bots fallen ständig in Tore.

B könnte als späteres Physik-Minispiel mit weniger Krümeln und Toren an festen Ecken wiederkommen (Kandidat für `CHAOS-44`, der Koordinator legt die Aufgabe an).

**Simulation ist kein Spaßbeweis.** Bots sind keine Menschen. Sie überschießen den Fleck, lachen nicht, verbünden sich nicht spontan gegen die Führung und unterschätzen, wie lustig ein Sturz in die Sahne aussieht. Die Zahlen zeigen nur, dass die Regeln funktionieren und die Physik stabil bleibt.

**Belegbilder:** `docs/screenshots/m3-minispiel-pudding-gerangel.png` (Gerangel am Kirschfleck, 4 Spieler, 2×), `docs/screenshots/m3-minispiel-pudding-gerangel-ende.png` (Rundenende mit Wackelkrone, 2×).

**Offen für Playtest (Ruben):**
- Versteht man ohne Erklärung, dass der Sahnefleck mit der Kirsche Punkte gibt und dass der Pudding dorthin kippt, wo alle stehen?
- Ist der Pudding zu rutschig? (Reibung 0,12; man kann gegensteuern.) Fühlen sich Stürze witzig oder unfair an, besonders die durch den Rührlöffel?
- Gewinnt die schwächste Person oft genug? Sim: schwach 0–8 %, etwas schwächer 8–20 %. Falls nicht: Krone stärker (`leaderBonk` 1,5 → 2) oder Fleck öfter wechseln.
- Ist der Rempler (A) mit Abklingzeit 1 s befriedigend, und reicht die Wackelkrone als Ziel?
- Sind 30 s die richtige Länge? Sind 4 Punkte je Sekunde auf dem Fleck gut lesbar oder zu hektisch?
- Erkennt man die eigene Figur im Gedränge (Ring + Wimpel in Slot-Farbe), auch mit den echten Figuren statt der Platzhalter-Kapseln?

---

## EXP-007: Hybrid-Minispiel – Konzeptvergleich „Wackelturm“ gegen „Geysir-Gier“ (2026-11-15, CHAOS-29, CHAOS-32)


**Hypothese / gewünschtes Spielerlebnis:** Das Hybrid-Minispiel verbindet schnelle Ausführung (lenken, greifen, ausweichen, zielen) mit einer taktischen Entscheidung, die man **am Fernseher sieht** und die für Zuschauer lustig ist: Wer geht wie viel Risiko ein, wer räumt ab, wer klaut? Regeln in höchstens 3 Zeilen à 64 Zeichen, Bedienung Joystick + A + B (iPad-Zonen sind klein), 20–45 s. Keine Strategie soll immer gewinnen; ein ungeschickter Spieler soll eine echte, wenn auch kleinere Chance haben.

**Varianten (zwei eigene Konzepte, keine Nachbauten):**

- **A „Wackelturm“** (Picknickdecke, Törtchenberg in der Mitte, je Spieler ein Nest in einer Ecke): Mit A Törtchen am Berg greifen, als Turm auf dem Kopf ins eigene Nest tragen, dort zählen sie. Ab 6 Stück zählt der Turm doppelt (Krone auf dem Turm). Hohe Türme sind langsam, träge und wackeln bei scharfem Lenken und schnellem Laufen – zu viel Wackeln, und er kippt. Mit leeren Händen rempelt B (kurzer Sprint): Ein getroffener Turm wechselt den Besitzer, ein Fehlversuch endet im Bauchklatscher. Ab und zu liegt ein Goldtörtchen (zählt 3) abseits.
  Taktik sichtbar: Turmhöhe, Krone, Umweg zum Gold, Jäger ohne Turm. Erwartet: viel Ausführung (sanft lenken), klare Bilder; Risiko: „gierig“ oder „Rempeln“ dominiert.
  - A1 linear, ohne Rempeln/Gold, nur Lenkwackeln · A2 + Turmbonus · A3 + Rempeln immer, ohne Klau · A4 Rempeln nur mit leeren Händen, Klau ½, Gold (erste Fassung) · A5 + Laufwackeln, Trägheit hoher Türme, Klau ganz, Bauchklatscher · **A6 + hoch stapeln dauert länger (gewählt)**
- **B „Geysir-Gier“**: Vier Blubberbecken (Ertrag 1/2/3/5 je s, geteilt unter allen im Becken, Multiplikator ×1→×3 fürs Bleiben). Becken verlassen sichert den Topf; ertragreiche Becken brechen öfter und mit kürzerer Vorwarnung aus, wer drinsteht, verliert den Topf. A = Hüpfer (wer den Ausbruch in der Luft „reitet“, verdoppelt), B = Schubsen.
  Erwartet: starke Push-your-luck-Spannung, Gedränge im roten Becken; Risiko: wenig Ausführung, viele Begriffe.
  - B1 ohne Ritt/Schubsen · B2 mit Ritt ×2 und Schubsen · B3 B2 ohne Überraschungs-Ausbrüche · B4 B2, rotes Becken öfter, Ritt ×1,5

**Objektive Messgrößen:** Rundendauer; Siegerpunkte; relativer Abstand Platz 1–2; Gleichstand auf Platz 1; Führungswechsel (nach gesicherten Punkten); Zuschauer-Momente je Partie (A: umgekippte/geklaute Türme, B: Treffer und Ritte); Eingaben je Sitz und Sekunde und B-Anteil (Ausführungs-/Bedienlast); Strategie-Turnier (Siegfaktor je Strategie bei gleicher Geschicklichkeit, 1,00 = fair); **Eindringling gegen Monokultur** (lohnt es sich, von einer Strategie abzuweichen? Eine Strategie mit Faktor > 1 gegen alle wäre dominant); Außenseiter-Chance (Geschick 0,2 gegen 0,9); Anleitungslänge und Zahl der Regelbegriffe.

**Bots:** vier Strategien – *vorsichtig* (A: 2–4 Törtchen; B: grüne/gelbe Becken, früh sichern, bei Warnung raus), *gierig* (A: 7–10; B: orange/rot, lange bleiben, Geysir reiten), *zufällig* (A: 1–10 je Gang; B: zufällige Becken und Zeiten), *Raufbold* (A: 3–5 und jagt hohe Türme mit B; B: gierig und schubst Mitbewohner raus). Geschicklichkeit 0–1 steuert Reaktionszeit (0,45–0,15 s), Lenkfehler, Drehrate des Sticks, Gefühl für die Kippgrenze, Ausweichen vor Remplern, Timing des Hüpfers. Bots sehen nur, was ein Mensch am Fernseher sieht (Positionen, Türme, Wackeln, Warnungen), nicht den Zufall.

**Subjektive Playtest-Fragen (für Ruben):** siehe „Offen für Playtest“.

**Testumgebung:** Node 22, Vitest, reines TypeScript ohne Babylon; fester Schritt 1/60 s; Spielzufall `createMinigameRng(seed)`, Bot-Zufall getrennt je Sitz. Seeds 1–200 je Zeile (Eindringling: 1–200, 3 Spieler), 35 s je Partie. Konzept A spielt die **echten Regeln** aus `packages/minigames/src/wackelturm/logic.ts` (Varianten = Parameter-Sätze), Konzept B den Prototyp `packages/minigames/src/prototypes/hybrid/geysir.ts`. Wiederholen:

```sh
EXPERIMENTS=1 pnpm exec vitest run packages/minigames/src/prototypes/hybrid --silent=false
```

Laufzeit ≈ 4,5 min. Ohne `EXPERIMENTS=1` läuft nur ein Smoke-Test mit 3 Seeds.

**Ergebnisse:**

**EXP-007 Verlauf (gemischte Tische, Seeds 1–200)**

| Variante | Sp. | Dauer s | Sieger-Punkte | Abstand 1–2 | Gleichstand | Führungswechsel | Momente | Eingaben/s | B-Anteil |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1: linear, ohne Rempeln, ohne Gold | 2 | 35 | 25,2 | 43 % | 5 % | 2,3 | 4,7 | 2,9 | 0 % |
| A1: linear, ohne Rempeln, ohne Gold | 3 | 35 | 27,3 | 24 % | 5 % | 4,7 | 7,0 | 3,0 | 0 % |
| A1: linear, ohne Rempeln, ohne Gold | 4 | 35 | 27,6 | 16 % | 11 % | 6,1 | 9,5 | 3,0 | 0 % |
| A2: + Turmbonus ×2 ab 6 | 2 | 35 | 32,7 | 42 % | 6 % | 2,0 | 4,7 | 2,9 | 0 % |
| A2: + Turmbonus ×2 ab 6 | 3 | 35 | 37,4 | 29 % | 3 % | 3,9 | 7,0 | 3,0 | 0 % |
| A2: + Turmbonus ×2 ab 6 | 4 | 35 | 37,4 | 23 % | 9 % | 4,8 | 9,5 | 3,0 | 0 % |
| A3: + Rempeln immer, ohne Klau | 2 | 35 | 9,0 | 54 % | 25 % | 0,5 | 17,9 | 4,9 | 11 % |
| A3: + Rempeln immer, ohne Klau | 3 | 35 | 9,3 | 56 % | 13 % | 0,5 | 27,0 | 4,8 | 14 % |
| A3: + Rempeln immer, ohne Klau | 4 | 35 | 8,4 | 52 % | 14 % | 0,6 | 37,2 | 4,8 | 14 % |
| A4: Rempeln nur mit leeren Händen, Klau ½, Gold | 2 | 35 | 33,1 | 42 % | 4 % | 2,0 | 5,4 | 3,1 | 1 % |
| A4: Rempeln nur mit leeren Händen, Klau ½, Gold | 3 | 35 | 34,1 | 27 % | 7 % | 3,3 | 8,9 | 3,3 | 2 % |
| A4: Rempeln nur mit leeren Händen, Klau ½, Gold | 4 | 35 | 34,5 | 22 % | 7 % | 4,5 | 12,7 | 3,4 | 2 % |
| A5: + Laufwackeln, Trägheit, Klau ganz, Bauchklatscher | 2 | 35 | 46,3 | 30 % | 5 % | 2,8 | 1,1 | 2,3 | 2 % |
| A5: + Laufwackeln, Trägheit, Klau ganz, Bauchklatscher | 3 | 35 | 48,1 | 25 % | 6 % | 4,1 | 2,9 | 2,4 | 4 % |
| A5: + Laufwackeln, Trägheit, Klau ganz, Bauchklatscher | 4 | 35 | 49,8 | 24 % | 4 % | 4,8 | 5,2 | 2,4 | 5 % |
| A6: + hoch stapeln dauert länger (gewählt) | 2 | 35 | 37,9 | 25 % | 5 % | 2,7 | 1,2 | 2,1 | 2 % |
| A6: + hoch stapeln dauert länger (gewählt) | 3 | 35 | 39,6 | 22 % | 4 % | 4,3 | 2,7 | 2,2 | 4 % |
| A6: + hoch stapeln dauert länger (gewählt) | 4 | 35 | 41,0 | 20 % | 4 % | 5,2 | 4,3 | 2,3 | 4 % |
| B1: ohne Hüpfer-Ritt, ohne Schubsen | 2 | 35 | 112,4 | 32 % | 2 % | 3,4 | 2,7 | 0,7 | 0 % |
| B1: ohne Hüpfer-Ritt, ohne Schubsen | 3 | 35 | 102,0 | 23 % | 4 % | 5,5 | 3,7 | 0,7 | 0 % |
| B1: ohne Hüpfer-Ritt, ohne Schubsen | 4 | 35 | 88,2 | 20 % | 2 % | 6,9 | 4,7 | 0,7 | 0 % |
| B2: + Hüpfer-Ritt ×2, Schubsen | 2 | 35 | 150,8 | 45 % | 0 % | 2,3 | 5,1 | 0,7 | 10 % |
| B2: + Hüpfer-Ritt ×2, Schubsen | 3 | 35 | 138,9 | 33 % | 0 % | 4,0 | 7,2 | 0,7 | 19 % |
| B2: + Hüpfer-Ritt ×2, Schubsen | 4 | 35 | 131,2 | 28 % | 2 % | 5,1 | 9,3 | 0,7 | 30 % |
| B3: B2 ohne Überraschungs-Ausbrüche | 2 | 35 | 155,4 | 44 % | 0 % | 2,5 | 4,7 | 0,7 | 11 % |
| B3: B2 ohne Überraschungs-Ausbrüche | 3 | 35 | 145,8 | 34 % | 1 % | 4,1 | 6,4 | 0,7 | 19 % |
| B3: B2 ohne Überraschungs-Ausbrüche | 4 | 35 | 129,7 | 26 % | 3 % | 5,5 | 8,3 | 0,8 | 27 % |
| B4: B2, rotes Becken öfter, Ritt nur ×1,5 | 2 | 35 | 106,5 | 43 % | 1 % | 2,2 | 6,9 | 0,8 | 8 % |
| B4: B2, rotes Becken öfter, Ritt nur ×1,5 | 3 | 35 | 102,9 | 29 % | 1 % | 4,2 | 9,4 | 0,8 | 17 % |
| B4: B2, rotes Becken öfter, Ritt nur ×1,5 | 4 | 35 | 101,4 | 27 % | 0 % | 5,1 | 11,9 | 0,8 | 25 % |

**EXP-007 Strategien (Siegfaktor bei gleicher Geschicklichkeit 0,7; 1,00 = fair)**

| Variante | Sp. | vorsichtig | gierig | zufällig | Raufbold | Außenseiter (0,2 vs 0,9) gewinnt |
| --- | --- | --- | --- | --- | --- | --- |
| A1: linear, ohne Rempeln, ohne Gold | 2 | 1,14 | 0,42 | 0,82 | 1,67 | 66 % (fair 50 %) |
| A1: linear, ohne Rempeln, ohne Gold | 3 | 1,10 | 0,19 | 0,64 | 2,24 | 54 % (fair 33 %) |
| A1: linear, ohne Rempeln, ohne Gold | 4 | 0,93 | 0,11 | 0,57 | 2,48 | 48 % (fair 25 %) |
| A2: + Turmbonus ×2 ab 6 | 2 | 1,00 | 0,53 | 0,99 | 1,51 | 72 % (fair 50 %) |
| A2: + Turmbonus ×2 ab 6 | 3 | 0,90 | 0,56 | 0,95 | 1,70 | 62 % (fair 33 %) |
| A2: + Turmbonus ×2 ab 6 | 4 | 0,72 | 0,36 | 1,10 | 1,88 | 59 % (fair 25 %) |
| A3: + Rempeln immer, ohne Klau | 2 | 1,40 | 0,95 | 0,90 | 0,74 | 55 % (fair 50 %) |
| A3: + Rempeln immer, ohne Klau | 3 | 1,82 | 0,76 | 0,57 | 0,75 | 38 % (fair 33 %) |
| A3: + Rempeln immer, ohne Klau | 4 | 2,23 | 0,73 | 0,55 | 0,60 | 24 % (fair 25 %) |
| A4: Rempeln nur mit leeren Händen, Klau ½, Gold | 2 | 1,11 | 0,49 | 0,94 | 1,49 | 76 % (fair 50 %) |
| A4: Rempeln nur mit leeren Händen, Klau ½, Gold | 3 | 1,07 | 0,42 | 0,80 | 1,82 | 52 % (fair 33 %) |
| A4: Rempeln nur mit leeren Händen, Klau ½, Gold | 4 | 0,85 | 0,37 | 0,84 | 2,01 | 45 % (fair 25 %) |
| A5: + Laufwackeln, Trägheit, Klau ganz, Bauchklatscher | 2 | 0,34 | 1,64 | 1,12 | 0,88 | 58 % (fair 50 %) |
| A5: + Laufwackeln, Trägheit, Klau ganz, Bauchklatscher | 3 | 0,18 | 1,76 | 1,24 | 0,86 | 26 % (fair 33 %) |
| A5: + Laufwackeln, Trägheit, Klau ganz, Bauchklatscher | 4 | 0,14 | 1,63 | 1,11 | 0,98 | 25 % (fair 25 %) |
| A6: + hoch stapeln dauert länger (gewählt) | 2 | 0,49 | 1,33 | 1,26 | 0,89 | 48 % (fair 50 %) |
| A6: + hoch stapeln dauert länger (gewählt) | 3 | 0,37 | 1,27 | 1,36 | 1,07 | 24 % (fair 33 %) |
| A6: + hoch stapeln dauert länger (gewählt) | 4 | 0,36 | 1,32 | 0,88 | 1,35 | 31 % (fair 25 %) |
| B1: ohne Hüpfer-Ritt, ohne Schubsen | 2 | 0,24 | 1,50 | 0,93 | 1,32 | 51 % (fair 50 %) |
| B1: ohne Hüpfer-Ritt, ohne Schubsen | 3 | 0,11 | 1,33 | 1,23 | 1,47 | 33 % (fair 33 %) |
| B1: ohne Hüpfer-Ritt, ohne Schubsen | 4 | 0,26 | 0,96 | 1,47 | 1,27 | 18 % (fair 25 %) |
| B2: + Hüpfer-Ritt ×2, Schubsen | 2 | 0,30 | 1,45 | 0,93 | 1,31 | 43 % (fair 50 %) |
| B2: + Hüpfer-Ritt ×2, Schubsen | 3 | 0,09 | 1,71 | 0,95 | 1,34 | 18 % (fair 33 %) |
| B2: + Hüpfer-Ritt ×2, Schubsen | 4 | 0,04 | 1,82 | 0,65 | 1,31 | 11 % (fair 25 %) |
| B3: B2 ohne Überraschungs-Ausbrüche | 2 | 0,28 | 1,43 | 1,00 | 1,28 | 47 % (fair 50 %) |
| B3: B2 ohne Überraschungs-Ausbrüche | 3 | 0,09 | 1,69 | 0,95 | 1,36 | 25 % (fair 33 %) |
| B3: B2 ohne Überraschungs-Ausbrüche | 4 | 0,02 | 1,76 | 0,85 | 1,21 | 16 % (fair 25 %) |
| B4: B2, rotes Becken öfter, Ritt nur ×1,5 | 2 | 0,34 | 1,22 | 1,05 | 1,40 | 46 % (fair 50 %) |
| B4: B2, rotes Becken öfter, Ritt nur ×1,5 | 3 | 0,28 | 1,23 | 1,27 | 1,32 | 27 % (fair 33 %) |
| B4: B2, rotes Becken öfter, Ritt nur ×1,5 | 4 | 0,18 | 1,24 | 1,21 | 1,27 | 17 % (fair 25 %) |

**EXP-007 Eindringling gegen Monokultur (3 Spieler, Siegfaktor; 1,00 = fair)**

| Var. | Eindringling | gegen 2× vorsichtig | gegen 2× gierig | gegen 2× zufällig | gegen 2× Raufbold |
| --- | --- | --- | --- | --- | --- |
| A4 | vorsichtig | 1,04 | 2,20 | 1,52 | 0,37 |
| A4 | gierig | 0,38 | 0,86 | 0,48 | 0,04 |
| A4 | zufällig | 1,01 | 1,55 | 1,03 | 0,49 |
| A4 | Raufbold | 2,06 | 2,46 | 1,97 | 1,04 |
| A6 | vorsichtig | 0,97 | 0,13 | 0,14 | 1,03 |
| A6 | gierig | 2,59 | 0,91 | 1,20 | 0,82 |
| A6 | zufällig | 2,61 | 0,92 | 1,13 | 1,17 |
| A6 | Raufbold | 1,60 | 1,21 | 0,55 | 1,06 |
| B2 | vorsichtig | 1,11 | 0,11 | 0,00 | 0,16 |
| B2 | gierig | 2,75 | 0,99 | 1,97 | 1,46 |
| B2 | zufällig | 2,88 | 0,50 | 1,14 | 0,85 |
| B2 | Raufbold | 2,97 | 0,63 | 1,40 | 1,03 |
| B4 | vorsichtig | 1,18 | 0,40 | 0,02 | 0,31 |
| B4 | gierig | 2,19 | 0,92 | 1,26 | 0,90 |
| B4 | zufällig | 2,85 | 1,27 | 0,95 | 1,09 |
| B4 | Raufbold | 2,92 | 1,59 | 1,16 | 0,99 |

**EXP-007 Bedienung und Anleitung**

| Konzept | Bedienung | Anleitung (Zeilen, längste) | Regel-Begriffe |
| --- | --- | --- | --- |
| Wackelturm | Laufen / Greifen / Rempeln | 3, 56/64 Zeichen | Berg, Nest, Turmbonus, Wackeln, Rempeln (5) |
| Geysir-Gier | Laufen / Hüpfen / Schubsen | 3, 60/64 Zeichen | Becken, Topf, Multiplikator, Teilen, Ausbruch, Ritt, Schubsen (7) |

**Auswertung:**

- **Die frühen A-Fassungen sind kippelig balanciert.** Im ersten Lauf (frühere Bot-Fassung: ohne Ausweichen, Geschickte liefen grundlos langsamer) dominierte „gierig“ in A1/A2/A4 mit Faktor 1,7–2,4 – lange Wege lohnen sich mit großen Türmen. Mit den endgültigen Bots (Tabelle) kippt dieselbe Regel ins Gegenteil: Ohne Trägheit fallen hohe Türme schon beim Losgehen, „gierig“ sinkt auf 0,1–0,6, der Raufbold dominiert (A4: Eindringling ≥ 1,04 gegen alle), und der Außenseiter gewinnt sogar öfter als fair (45–76 %), weil Geschick kaum zählt. Beides zeigt: Reines Lenkwackeln trägt die Balance nicht. In B2 ist „gierig“ dominant (Eindringling > 1 gegen alle Monokulturen außer sich selbst, 0,99).
- **Rempeln mit Turm ist Chaos ohne Fortschritt.** A3 (immer rempeln, auch mit Turm): Siegerpunkte ≈ 9, bis 25 % Gleichstand, 37 Momente in 35 s, nur „vorsichtig“ kommt durch (2,2). Darum: Rempeln nur mit leeren Händen.
- **Gewählte Fassung A6:** Laufwackeln + Trägheit hoher Türme (Tempo wird zur Geschicklichkeitsfrage), ganzer Turm wird geklaut (Revanche-Jagd, lustig), Bauchklatscher bei Fehlrempler, und **jedes weitere Törtchen auf dem Kopf dauert länger** (0,25 s + 0,12 s je Stück). Ergebnis: keine Strategie gewinnt gegen alle – es gibt einen Kreis: Raufbold schlägt Gierige (1,21; umgekehrt 0,82), Zufällig/Mittelhoch schlägt Raufbolde (1,17; umgekehrt 0,55), Gierig schlägt Zufällig knapp (1,20; umgekehrt 0,92). Gleichstand 4–5 %, Abstand 1–2 rund 20–25 %, 2,7–5,2 Führungswechsel, Außenseiter 48/24/31 % (fair 50/33/25 %). Rein vorsichtig (nie der Turmbonus) ist schwach (0,36–0,49) – gewollt: „Ab 6 zählt doppelt“ soll zum Risiko locken.
- **B im Vergleich:** spektakulärer in Zahlen (5–12 Momente je Partie), aber kaum Ausführung (0,7–0,8 Eingaben/s gegenüber 2,1–2,3 in A6), die Taktik sitzt in unsichtbaren Größen (Topf, Multiplikator, geteilter Ertrag), 7 Regelbegriffe in fast vollen 3 Zeilen (60/64 Zeichen, erste Fassung passte nicht), dominantes „gierig“ in B2, und der Außenseiter hat bei 4 Spielern nur 11–17 % (fair 25 %). B4 dämpft das, löst es aber nicht.
- Simulation ist **kein Spaß-Beweis**: Bots spielen nach festen Regeln, Menschen passen sich an (z. B. Revanche nach einem Klau, Gedränge am Berg, Schadenfreude). Die Zahlen sagen nur, dass keine offensichtliche Gewinnformel und keine kaputte Wertung existiert.

**Entscheidung:** **keep A6 „Wackelturm“** als Hybrid-Minispiel (`packages/minigames/src/wackelturm/`, in Katalog und Rotation), **discard B „Geysir-Gier“** für den Vertical Slice.
Begründung: A verbindet Ausführung (sanft lenken unter Kippgefahr, greifen, ausweichen, zielen) und Taktik (wie hoch stapeln, Gold-Umweg, sammeln oder jagen) in einem einzigen sichtbaren Bild – dem schwankenden Turm mit Krone. Keine dominante Strategie, fairere Außenseiter-Chance, 5 statt 7 Begriffe, Bedienung Joystick + A + B mit seltenem B (2–5 % der Knopfdrücke). B bleibt als Idee für später (Becken mit geteiltem Ertrag, Geysir reiten) – Kandidat für `CHAOS-44`.

**Gewählte Werte (`WACKELTURM_PARAMS`):** Arena 16 × 9, Berg-Radius 1,5, Nest-Radius 1,15 in den Ecken; Tempo 4,6 / (1 + 0,06 · Höhe); Beschleunigung 14 / (1 + 0,12 · Höhe); sicher bis 2 Stück; Wackeln (0,5 · Lenken² + 0,7 · Tempo²) · (Höhe − 2), Abklingen 1,3/s, kippt bei 1; Greifen 0,25 s + 0,12 s je Stück auf dem Kopf, höchstens 10; Turmbonus ×2 ab 6; Gold alle 7 s (lebt 6 s, zählt 3); Rempeln: Sprint 0,22 s mit 10 Einheiten/s, Reichweite 1,05, Abklingzeit 2 s, nur mit leeren Händen, ganzer Turm wird geklaut, Opfer 0,7 s benommen, Bauchklatscher 0,6 s, im eigenen Nest sicher; Sturz durch Wackeln 0,8 s benommen; Spielzeit 35 s.

**Belegbilder:** `docs/screenshots/m3-minispiel-wackelturm.png` (4 Spieler mitten im Spiel: Grüns 10er-Turm kippelt, Blau liefert 7er-Turm mit Krone ab), `docs/screenshots/m3-minispiel-wackelturm-kippt.png` (eine Sekunde später: Turm eingestürzt, Krümel fliegen, Goldtörtchen liegt aus). Vorschau: `pnpm --filter @chaos-party/host dev`, dann `/host/?local=1&minigame=wackelturm&players=4`.

**Offen für Playtest (Ruben, echte Controller):**

1. Ist sanftes Lenken mit dem virtuellen Joystick am iPhone und in einer kleinen iPad-Zone machbar, oder kippen Türme gefühlt „ohne Grund“? (Stellschrauben: `walkWobble`, `wobbleGain`, `loadInertia`.)
2. Ist das Schwanken früh genug sichtbar, um rechtzeitig vom Gas zu gehen? Reicht „kippelt!“ im HUD?
3. Fühlt sich der Klau des ganzen Turms witzig an oder gemein? Kommt es zu Revanche-Jagden?
4. Lockt „ab 6 doppelt“ zum Risiko, oder stapeln alle stur genau 6?
5. Sind 35 s richtig (genug für 3–5 Gänge), oder zu lang/kurz?
6. Erkennen Zuschauer am Fernseher sofort, wer wie hoch stapelt und wer gerade jagt?

**Für später (CHAOS-44):** Konzept B „Geysir-Gier“ (geteilte Becken, Geysir-Ritt); verstreute Krümel nach einem Sturz zum Aufsammeln; Törtchenberg, der schrumpft und nachwächst.

---

## EXP-008: Look-Dev – drei moderne Stilrichtungen (2026-11-15, CHAOS-56)

**Hypothese / gewünschtes Spielerlebnis:** Ruben findet den M2/M3-Look „70er-Jahre“ (flaches `StandardMaterial`, Halbkugellicht, Bonbonfarben, Grundkörper). Mit moderner Render-Pipeline (Umgebungslicht, weiche Schatten, Nachbearbeitung) und weicher modellierten Formen wirkt dasselbe Spiel „modern und schön“, ohne gekaufte Assets und ohne die Lesbarkeit am Fernseher zu verlieren. Welche Richtung „modern“ trifft, entscheidet Ruben (Art Direction ist Produktentscheidung).

**Varianten** (gleicher Ausschnitt: Brettstück mit 8 Feldern, Bäumen, Teich, Trophäe; Nahansicht zweier Figuren; Pudding-Arena mit vier Figuren; HUD-Karten):
- **A „Weich & glänzend“:** PBR mit Klarlack, Umgebungslicht aus prozeduralem Himmel (RGBE im Speicher → `HDRCubeTexture`, Harmonische + Vorfilterung), Kontaktschatten (PCSS), SSAO2, ACES, Bloom, Vignette; UI als Glas-Karten. Erwartet: am hochwertigsten; Risiko GPU-Last, Farben kippen ins Spielzeughafte.
- **B „Cel-Shading“:** `StandardMaterial` + Material-Plugin `ToonPlugin` (Licht in drei Stufen, harte Glanzpunkte, Randlicht), farbige Konturen (`renderOutline`), FXAA; UI mit dicker Kontur und Versatzschatten. Erwartet: günstig, sehr lesbar, „Animationsfilm“; Risiko: doppelte Zeichenaufrufe, Flimmern dünner Teile.
- **C „Low-Poly-Diorama“:** facettierte Formen (Flat-Shading, 9 Segmente), Pastell, tiefe warme Sonne, Dunst, SSAO, Tilt-Shift-Tiefenunschärfe; UI als Papier-Karten. Erwartet: ruhig, edel; Risiko: zu wenig „Chaos“, kontrastarm am Fernseher.

**Objektive Messgrößen:** Zeichenaufrufe und Eckpunkte je Ansicht; Bildzeit (nur relativ, siehe Testumgebung); Lesbarkeit von Slot-Farbe + Symbol in der Brettansicht (Sichtprüfung).

**Subjektive Fragen (für Ruben):** Wirkt modern? Schön? Passt zu Chaos Party? Was stört? Welche Richtung oder welcher Mix?

**Testumgebung:** Look-Dev-Vitrine `apps/host/src/lookdev/lookdev.html?look=<weich|toon|diorama>&shot=<brett|figur|minispiel>&test=1` (nur Dev-Server), Chromium headless mit SwiftShader (Software-WebGL), 1600×900, Pixeldichte 2, 3 Aufwärm-Frames. Szene deterministisch (Seed 56 Brett, 7 Arena). Figuren = bestehende GLBs aus CHAOS-27, nur umgefärbt/umgeschattet.

**Ergebnisse:**

| Richtung | Zeichenaufrufe Brett / Arena | Eckpunkte Brett | Bildzeit SwiftShader Brett |
| --- | --- | --- | --- |
| A Weich | 421 / 213 | 101 435 | ≈ 12,6 s |
| B Toon | 820 / 399 | 79 942 | ≈ 2,0 s |
| C Diorama | 631 / 320 | 103 918 | ≈ 11,2 s |

Software-Rendering ist kein Maß für den Ziel-PC; die Zeiten zeigen nur das Verhältnis: A und C kosten durch SSAO/MSAA/Unschärfe ein Vielfaches von B. Zeichenaufrufe sind in allen Richtungen unoptimiert (keine Instanzen, keine zusammengeführten Meshes) und würden bei der Umsetzung deutlich sinken. Belege: `docs/screenshots/chaos56-lookdev-<richtung>-<ansicht>.jpg`; Entscheidungsseite mit Bewertung: https://claude.ai/artifact/P6iu4tF9iBFzfnSqgukHfR.

**Entscheidung:** iterate – Ruben (2026-11-15): „Wenn überhaupt ein Mix aus 1 und 3. Vielleicht ganz bisschen realistischer? Mir gefällt aber einiges daran nicht.“ Es stören Figuren, zu simple Modelle, kindliche Farben, Licht/Stimmung. Weiter in EXP-009.

**Offen für Playtest:** Wirkung am Fernseher aus 3 m; Bildrate am Ziel-PC (`?debug=1`-Messanzeige) für die gewählte Richtung.

---

## EXP-009: Look-Dev Runde 2 – „Stilisierte Natur“ (2026-11-15, CHAOS-57)

**Hypothese / gewünschtes Spielerlebnis:** Ein Mix aus A (weiches PBR) und C (Diorama), etwas realistischer, trifft Rubens „modern und schön“: eine lebendige kleine Welt mit echten Materialien statt Grundkörpern in Bonbonfarben, aber stilisierte Formen und Figuren, damit es verspielt bleibt.

**Varianten:** gleiche Welt, drei Lichtstimmungen (HDRI + Sonne + Dunst + Gras-Tönung):
- N1 „Sommermorgen“ (`qwantani_mid_morning_puresky`), N2 „Goldene Stunde“ (`qwantani_late_afternoon_puresky`), N3 „Leicht bewölkt“ (`kloofendal_48d_partly_cloudy_puresky`).

**Aufbau:** `apps/host/src/lookdev/nature.ts`: unregelmäßige Insel mit Hügeln und Erdkante, CC0-Texturen von Poly Haven (Wiese, Erde, Rinde, Moosfels, Eichenholz, Bretter; Liste `polyhaven.json`, Abruf `node scripts/fetch-lookdev-assets.mjs`, nicht eingecheckt), ≈ 42 000 Grashalme als Thin Instances (drei Farbsorten), Bäume mit Rindenstamm und weichen Kronen, Steine mit Moos, Felder als Baumscheiben mit lackierter Farbeinlage + Symbol, Teich, Farne/Blumen (CC0-Modelle). Licht: HDRI als Umgebungslicht und Himmel, Sonne aus den Harmonischen des HDRI abgeleitet und so gedreht, dass sie schräg von vorn links kommt (kein Gegenlicht), Halbkugellicht als Bodenlicht (Puresky-HDRIs sind unten schwarz), PCSS-Schatten, SSAO, ACES, leichte Tiefenunschärfe, Korn.

**Testumgebung:** Vitrine `lookdev.html?look=natur-<morgen|abend|wolken>&shot=<brett|figur|minispiel>`; begehbare 3D-Fassung als Artefakt https://claude.ai/artifact/P4BrCKbYSyfXGHAo726W71 (gepackt mit `node scripts/pack-lookdev-artifact.mjs <ziel>`), Entscheidungsseite https://claude.ai/artifact/P6iu4tF9iBFzfnSqgukHfR. SwiftShader-Bildzeit ≈ 20 s (nur relativ), ≈ 700 Zeichenaufrufe, ≈ 330 000 Eckpunkte im Brett.

**Ergebnisse:** Fehler unterwegs behoben: Instanzfarbe ersetzt den Halm-Verlauf (→ drei Halm-Sorten), IcoSphere standardmäßig flach (→ `flat: false`, mehr Unterteilung), Gegenlicht (→ HDRI gedreht), Himmelsbox größer als Sichtweite (→ 500), schwarzer Unterhimmel (→ Dunst-Ebene), Decke falsch abgetastet (→ Höhe an gedrehter Position).

**Entscheidung:** keep – Ruben nach der 3D-Fassung (2026-11-15): „ja passt so“. Offen: Lichtstimmung (N1/N2/N3 oder je Brett eine), neue Figuren (CHAOS-58), Controller-UI (CHAOS-59), Bildrate am Ziel-PC.

**Offen für Playtest:** Bildrate am Ziel-PC mit 40 000 Halmen, SSAO und Unschärfe; Lesbarkeit der Felder und Slot-Farben aus 3 m am Fernseher.

---

## EXP-010: Lichtstimmung je Brett, nach Uhrzeit oder nach Spielverlauf, inkl. Nacht (2026-11-15, CHAOS-60)

**Hypothese / gewünschtes Spielerlebnis:** Ein Wechsel der Lichtstimmung macht die Welt lebendiger als ein fest eingestelltes Licht. Am stärksten wirkt er als Bogen über die Partie: Die erste Runde spielt morgens, die letzte nachts mit Laternen. So spürt man das Finale, ohne dass Text es ansagt. Dabei bleiben Felder, Figuren und Slot-Farben in jeder Stimmung am Fernseher lesbar.

**Varianten (Zuordnung):**
- A „je Brett“: jedes Brett hat eine feste Stimmung (Wackelwald = goldene Stunde). Am ruhigsten und am besten planbar, aber ohne Abwechslung innerhalb einer Partie.
- B „PC-Uhrzeit“: Stimmung nach der echten Uhrzeit (6–11 Morgen, 11–16 Mittag, 16–19 goldene Stunde, 19–21 Dämmerung, sonst Nacht). Überraschend und „echt“, aber Partyabende liegen fast immer bei Dämmerung oder Nacht: Dann sieht man meist dieselbe Stimmung, und Tagesbilder gibt es abends nie.
- C „Spielverlauf“: Runde 1 → Morgen, … letzte Runde → Nacht (`ROUND_ARC`, bei 5 Runden jede Stimmung einmal, bei mehr Runden länger je Stimmung, nie rückwärts). Minispiele erben die Stimmung der Runde. Liefert Abwechslung und Dramaturgie, kostet einen Lichtwechsel pro Runde (zwischen den Runden, hinter einer Überblendung).

**Stimmungen (Daten in `apps/host/src/lighting/moods.ts`):** Morgen, Mittag, Bewölkt, Goldene Stunde, Dämmerung, Nacht. Alle außer „Bewölkt“ stammen aus derselben Poly-Haven-Serie (Qwantani, CC0), der Himmel passt also zusammen. Dämmerung und Nacht bringen 4 Laternen (Punktlichter, leuchtendes Glas), Glühwürmchen (Thin Instances mit Schein) und leuchtende Feld-Einlagen und Slot-Ringe (`tileGlow` 0,25 bzw. 0,7) mit.

**Objektive Messgrößen:** Lesbarkeit der Feld-Symbole und Slot-Ringe im Screenshot (1280×720, wie aus 3 m), mittlere Bildhelligkeit je Stimmung, Zeichenaufrufe (Nacht: +16 durch Laternen und Glühwürmchen) und Lichter pro Material (Nacht bis 6 statt 2).

**Subjektive Playtest-Fragen (für Ruben):** Welche Zuordnung? Ist die Nacht dunkel genug, um Nacht zu sein, aber hell genug zum Spielen? Stören die Laternen am Tag? Soll „Bewölkt“ als Brett-Stimmung bleiben?

**Testumgebung:** Vitrine `lookdev.html?look=natur-<morgen|mittag|wolken|abend|daemmerung|nacht>&shot=<brett|figur|minispiel>`, Feinabstimmung ohne Neubau mit `&tune={"key":{"intensity":2}}`. SwiftShader (Software-Rendering), Chromium, 1280×720, 1 Bild nach `whenReadyAsync`.

**Ergebnisse:** Alle 18 Bilder (6 Stimmungen × Brett/Figuren/Minispiel) rendern ohne Seitenfehler. Mittlere Bildhelligkeit (0–255) Brett / Figuren / Minispiel: Morgen 159/114/163, Mittag 154/106/157, Bewölkt 170/125/173, Goldene Stunde 158/122/164, Dämmerung 83/100/127, Nacht 38/82/85. Die Nacht ist im Brett-Überblick deutlich dunkel, die Feld-Einlagen, Symbole und Slot-Ringe stechen aber durch ihr Eigenleuchten heraus. In der Figuren-Nahansicht bleiben alle Slot-Farben unterscheidbar. Zeichenaufrufe Brett 688 → 704 nachts (Laternen, Glühwürmchen), Minispiel 409 → 425.

Fehler unterwegs behoben: Gras und Kronen wurden in Dämmerung und Nacht weißlich. Die Ursache war die starke Umgebungsbeleuchtung aus dem HDRI, die bei schwacher Sonne dominiert; Laternen und zusätzliche Lichter pro Material waren es nicht (gegengeprüft per Abschaltung). Lösung: Umgebungsstärke 0,35 bzw. 0,5 statt 1,3 bzw. 2,5, dafür mehr Belichtung und stärkere Laternen. HDRI-Vergleich Nacht: `qwantani_moonrise_puresky` und `qwantani_night_puresky` zeigen über dem Horizont einen hellen Streifen, `qwantani_moon_noon_puresky` bleibt sauber dunkelblau → gewählt. Dämmerung: `dusk_1` und `dusk_2` fast gleich, `dusk_2` behalten. Verworfene HDRIs sind wieder aus `polyhaven.json` entfernt.

Bilder: Entscheidungsseite https://claude.ai/artifact/5WVskYB8BoiVT7wxsYuYCK, begehbare 3D-Fassung mit allen Stimmungen https://claude.ai/artifact/P4BrCKbYSyfXGHAo726W71 (Version 5).

**Entscheidung:** keep C „Spielverlauf“, Ruben im Chat am 2026-11-15: „C“. Jede Partie ist ein Tag (`moodForRound`), Minispiele erben die Stimmung der Runde. A (fest je Brett) und B (Uhrzeit) sind verworfen; `moodForBoard` bleibt als Rückfall für Szenen ohne Runde (Lobby, Siegerehrung). Einbau ins Spiel: CHAOS-62 (Natur-Look im Spiel), CHAOS-63 (Lichtverlauf je Runde mit Überblendung).

**Offen für Playtest:** Wirkung der Nacht am Fernseher (Schwarzwert, Abstand 3 m), Bildrate am Ziel-PC mit 6 Lichtern pro Material, ob der Wechsel zwischen den Runden als Überblendung reicht.

---

## Gemeinsamer Aufbau von EXP-011 … EXP-013 (2026-11-15, CHAOS-40)

M4-Bot-Simulationen mit den **aktuellen** Regeln (`DEFAULT_RULES`, Brett Wackelwald, Stand nach EXP-001 … EXP-004) und – neu – der **echten Minispiel-Rotation** aus M3 statt des Platzhalters. Wie bei EXP-001 … 004 sind das **Näherungen**, kein Spaß-Beweis: Bots entscheiden nach festen Regeln, Minispiel-Ergebnisse sind Zufallspunkte.

**Wiederholen** (≈ 8 s):

```sh
EXPERIMENTS=m4 pnpm exec vitest run packages/game-core/src/rules/experimentsM4.test.ts --silent=false
```

- **Code:** `packages/game-core/src/rules/experimentsM4.ts` (Kennzahlen, Varianten, Tabellen), Bot-Partien in `simulate.ts`. Ohne `EXPERIMENTS=m4` läuft nur ein Smoke-Test (Teil von `pnpm test`).
- **Seeds:** 1–200 je Zeile und Spielerzahl (2, 3, 4).
- **Minispiele:** `ROTATION_SPECS` = Sockenregen (30 s), Pudding-Gerangel (30 s), Wackelturm (35 s); ein Test prüft Gleichheit mit dem Katalog (`@chaos-party/minigames/catalog`, dafür neue devDependency von game-core). game-core zieht je Runde eines ohne Wiederholung (wie im Server). Der Bot-„Host“ meldet das Ergebnis 0,5 s nach Spielende (`minigameResultDelayMs`). Punkte je Spieler gleichverteilt 0–40 (`minigameScoreSpread`), dadurch ist der 1. Platz in 2–5 % der Minispiele geteilt, wie bei den Prototypen in EXP-005 … 007 (1–15 %). Variante „Profi“: Slot 1 bekommt +10 Punkte (`minigameSkill`).
- **Dauer** = Pacing (`stepMs` 350 usw.) + Entscheidungszeit + je Runde Anleitung 7 s + Spielzeit + Ergebnis 6 s + Rundenende 1,5 s, dazu pauschal **20 s Finale** (Trophäenzählung 2,2 s + 2,8 s je Platz + 3,4 s Sieger, ggf. 2,6 s Gleichstand). Die Lobby (QR, Figuren) zählt nicht. Entscheidungstempo **flott** = Bot-Standard 0,8–2,5 s je Prompt, **gemütlich** = 1,5–4,5 s (Menschen reden, lachen, suchen das Handy). Beides sind Annahmen.
- **Neu in der Simulation:** `SimulationOptions.minigames`, `BotPolicy.minigameResultDelayMs`/`minigameScoreSpread`/`minigameSkill`, `SimulationResult.midRanking` (Wertung nach Runde ⌊n/2⌋), `minigamesPlayed`, `minigameSharedWins`, `standings[].coinsEarned`. Ohne `minigames` ändert sich nichts (Platzhalter, gleiche Zufallsfolge), EXP-001 … 004 bleiben reproduzierbar.
- **Testumgebung:** Node 22, Linux-Container, Basis-Commit `c4df936`, Ergebnisse vom Commit, der diese Einträge einführt.

---

## EXP-011: Partiedauer und Runden-Vorschläge mit echten Minispielen (2026-11-15, CHAOS-40)

**Hypothese / gewünschtes Spielerlebnis:** Die Lobby bietet drei Vorschläge, die sich wie „kurz/mittel/lang“ anfühlen: ≈ 15, 25 und 40 Minuten. Die Platzhalter 3/5/8 Runden (CHAOS-36) sind viel zu kurz, seit jede Runde ein echtes Minispiel von 30–35 s plus Anleitung und Ergebnis hat. Die Lobby-Anzeige „≈ 3 Min./Runde“ ist geraten.

**Varianten:** Rundenzahl 5, 8, 10, 12, 15, 16, 18, 20 (`MAX_ROUNDS`) × 2/3/4 Spieler × Tempo flott/gemütlich.

**Objektive Messgrößen:** Partiedauer (Mittel, p90) inkl. Finale, Minuten je Runde, Anteil der Zeit außerhalb der Brettzüge (Minispiel-Phasen, Rundenwechsel).

**Subjektive Playtest-Fragen (für Ruben):** Passen die angezeigten Minuten zur echten Partie (Stoppuhr)? Ist 10 Runden als Standard für die erste Partie richtig? Wie fühlt es sich an, dass mehr als die Hälfte der Zeit Minispiele sind?

**Testumgebung:** siehe „Gemeinsamer Aufbau“.

**Ergebnisse:**

**EXP-011 Partiedauer mit Minispiel-Rotation und Finale (Seeds 1–200 je Zeile)**

| Runden | Sp. | min flott | min gemütlich | p90 gemütlich | min/Runde gemütlich | Anteil ohne Brettzüge |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | 2 | 5,8 | 6,2 | 6,4 | 1,17 | 68 % |
| 5 | 3 | 6,5 | 7,1 | 7,4 | 1,35 | 60 % |
| 5 | 4 | 7,2 | 8,0 | 8,2 | 1,53 | 54 % |
| 8 | 2 | 9,0 | 9,6 | 9,9 | 1,16 | 69 % |
| 8 | 3 | 10,1 | 11,0 | 11,4 | 1,34 | 60 % |
| 8 | 4 | 11,3 | 12,5 | 12,8 | 1,52 | 54 % |
| 10 | 2 | 11,1 | 11,9 | 12,3 | 1,16 | 69 % |
| 10 | 3 | 12,5 | 13,7 | 14,0 | 1,33 | 61 % |
| 10 | 4 | 14,0 | 15,5 | 15,8 | 1,51 | 54 % |
| 12 | 2 | 13,3 | 14,2 | 14,6 | 1,16 | 69 % |
| 12 | 3 | 15,0 | 16,4 | 16,8 | 1,34 | 60 % |
| 12 | 4 | 16,7 | 18,5 | 18,9 | 1,51 | 54 % |
| 15 | 2 | 16,5 | 17,7 | 18,1 | 1,16 | 69 % |
| 15 | 3 | 18,7 | 20,4 | 20,9 | 1,34 | 60 % |
| 15 | 4 | 20,8 | 23,0 | 23,5 | 1,51 | 54 % |
| 16 | 2 | 17,6 | 18,9 | 19,3 | 1,16 | 69 % |
| 16 | 3 | 19,9 | 21,8 | 22,2 | 1,34 | 60 % |
| 16 | 4 | 22,2 | 24,5 | 25,0 | 1,51 | 54 % |
| 18 | 2 | 19,8 | 21,2 | 21,6 | 1,16 | 69 % |
| 18 | 3 | 22,4 | 24,4 | 24,9 | 1,34 | 60 % |
| 18 | 4 | 24,9 | 27,5 | 28,1 | 1,51 | 54 % |
| 20 | 2 | 21,9 | 23,5 | 24,0 | 1,16 | 69 % |
| 20 | 3 | 24,8 | 27,1 | 27,6 | 1,34 | 60 % |
| 20 | 4 | 27,6 | 30,6 | 31,1 | 1,51 | 54 % |

- Eine Runde dauert (gemütlich) **1,16 min mit 2, 1,34 min mit 3 und 1,51 min mit 4 Spielern**, flott etwa 8–10 % weniger. Die Streuung ist klein (p90 nur ≈ 0,3–0,5 min über dem Mittel), denn die Minispiele haben feste Längen.
- **54–69 % der Partie** sind Minispiel-Phasen und Rundenwechsel (bei 2 Spielern mehr, weil es weniger Züge je Runde gibt). Je Runde sind ≈ 45–50 s fest: 7 s Anleitung, 30–35 s Spiel, 6 s Ergebnis, 1,5 s Rundenende.
- **≈ 15 min:** 10 Runden (14,0–15,5 min mit 4, 12,5–13,7 mit 3 Spielern). **≈ 25 min:** 16 Runden (22,2–24,5 mit 4, 19,9–21,8 mit 3). **≈ 40 min** bräuchte 26 (4 Spieler) bis 30 (3 Spieler) Runden, also mehr als `MAX_ROUNDS` = 20. Mit 20 Runden sind es 27,6–30,6 min (4) bzw. 24,8–27,1 min (3).
- Die bisherigen Vorschläge 3/5/8 ergeben 4–12,5 min. 3 Runden sind außerdem wertungsschwach (EXP-012).

**Entscheidung:** **keep** neue Vorschläge **10 / 16 / 20** (`DEFAULT_ROUND_PRESETS`) und Standard **10** (`DEFAULT_ROUNDS`, vorher 5) in `apps/server/src/game.ts`. Begründung für den Standard: ≈ 15 min passt zu einer Couch-Party und einer ersten Partie, jedes der drei Minispiele kommt 3–4-mal dran, und die Trophäen entscheiden in 63–81 % der Partien (EXP-012; mit 5 Runden nur 49–76 %, und ein Drittel der Spieler bleibt ohne Trophäe). „Lang“ ist 20, weil `MAX_ROUNDS` ein Protokollwert ist (v4) und 26–30 Runden mit nur drei Minispielen (je 9–10-mal) eher ermüden als Spaß machen. **Frage an Ruben:** Sind „40 min“ wirklich gewollt? Dann `MAX_ROUNDS` anheben, am besten zusammen mit mehr Minispielen. Die Lobby zeigt die Dauer jetzt nach Spielerzahl (`roundsDuration(rounds, players)` in `apps/host/src/lobby/lobbyState.ts`: 1,15/1,35/1,5 min je Runde + Finale, auf 5 min gerundet; ohne Spieler wird mit 4 gerechnet).

**Offen für Playtest:** Echte Dauer mit Stoppuhr (Menschen sind vermutlich langsamer als „gemütlich“: Erklären, Lachen, Nachfragen). Verdrängt der hohe Minispiel-Anteil das Brettspiel (VISION, Produktsäule 3)?

**Für später (CHAOS-44):** Anleitung eines schon gespielten Minispiels kürzer zeigen (spart ≈ 4 s je Runde). Längere Partien erst mit mehr Minispielen und höherem `MAX_ROUNDS`.

---

## EXP-012: Wertung, Gleichstandsregel, Aufholeffekt und Trophäen-Ökonomie (2026-11-15, CHAOS-40)

**Hypothese / gewünschtes Spielerlebnis:** Meistens entscheiden die Trophäen. Die Gleichstandsregel (Trophäen → Münzen → Minispiel-Siege, ADR-015) ist ein seltener, erklärbarer Sonderfall, und ein geteilter Sieg bleibt die Ausnahme. Wer zur Halbzeit führt, hat einen Vorteil, aber kein sicheres Ende („Comeback möglich“). Die Ökonomie aus EXP-002 (Preis 15, Minispiel 10/5/3/0) wurde nur mit dem Platzhalter-Minispiel und 5 Runden gemessen. Trägt sie auch längere Partien mit echter Rotation?

**Varianten:**
- Rundenzahl 3, 5, 8, 10, 16, 20 mit den Standardwerten.
- Ökonomie bei 10 und 20 Runden: A Stand, B Preis 20, C Minispiel 8/4/2/0, D Minispiel 10/6/3/1 (Trostmünze), E Preis 20 + Minispiel 12/6/3/0, S Stand mit einem Minispiel-Profi (Slot 1, +10 Punkte).

**Objektive Messgrößen:** Trophäen je Partie und des Siegers, Sieger ohne Trophäe, Spieler ohne Trophäe, womit Platz 1 entschieden wird (`decidedBy`: Trophäen, Münzen, Minispiel-Siege, geteilt), irgendein geteilter Platz, geteilter 1. Platz im Minispiel, Siegquote des alleinigen Führenden bzw. Letzten nach Runde ⌊n/2⌋ (gegen fair 1/n), Siegquote des Profis, Münzen am Ende.

**Subjektive Playtest-Fragen (für Ruben):** Versteht man am PC „Gleich viele Trophäen – die Münzen haben entschieden“? Fühlt sich ein Münz-Sieg verdient an? Ist es frustrierend, dass der Halbzeit-Führende etwa doppelt so oft gewinnt wie fair? Sind 5–6 Trophäen für den Sieger in langen Partien noch etwas Besonderes?

**Testumgebung:** siehe „Gemeinsamer Aufbau“.

**Ergebnisse:**

**EXP-012 Wertung, Gleichstand, Aufholeffekt (Standardregeln + Rotation, Seeds 1–200 je Zeile)**

| Runden | Sp. | Trophäen/Partie | Sieger-Trophäen | Sieger ohne Trophäe | Spieler ohne Trophäe | Sieg per Trophäen | per Münzen | per Minispiel-Siegen | Sieg geteilt | ein Platz geteilt | Minispiel P1 geteilt | Führender (Hälfte) gewinnt | Letzter (Hälfte) gewinnt | fair 1/n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 2 | 0,96 | 0,80 | 26 % | 55 % | 60 % | 39 % | 1 % | 0 % | 0 % | 2 % | 65 % | 35 % | 50 % |
| 3 | 3 | 1,25 | 0,86 | 19 % | 60 % | 51 % | 48 % | 2 % | 1 % | 1 % | 2 % | 40 % | 23 % | 33 % |
| 3 | 4 | 1,39 | 0,90 | 14 % | 66 % | 48 % | 49 % | 2 % | 1 % | 5 % | 7 % | 42 % | 10 % | 25 % |
| 5 | 2 | 2,44 | 1,75 | 2 % | 20 % | 76 % | 24 % | 1 % | 0 % | 0 % | 2 % | 68 % | 32 % | 50 % |
| 5 | 3 | 3,04 | 1,65 | 1 % | 26 % | 55 % | 44 % | 1 % | 1 % | 1 % | 3 % | 54 % | 18 % | 33 % |
| 5 | 4 | 3,31 | 1,52 | 0 % | 33 % | 49 % | 48 % | 2 % | 2 % | 4 % | 5 % | 45 % | 6 % | 25 % |
| 8 | 2 | 4,11 | 2,77 | 1 % | 10 % | 78 % | 21 % | 1 % | 1 % | 1 % | 2 % | 78 % | 22 % | 50 % |
| 8 | 3 | 5,04 | 2,62 | 0 % | 13 % | 65 % | 34 % | 1 % | 1 % | 2 % | 3 % | 61 % | 15 % | 33 % |
| 8 | 4 | 5,63 | 2,41 | 0 % | 17 % | 65 % | 35 % | 0 % | 1 % | 2 % | 5 % | 60 % | 10 % | 25 % |
| 10 | 2 | 5,01 | 3,35 | 0 % | 7 % | 81 % | 19 % | 1 % | 0 % | 0 % | 2 % | 73 % | 27 % | 50 % |
| 10 | 3 | 6,16 | 3,18 | 0 % | 10 % | 75 % | 25 % | 1 % | 0 % | 0 % | 3 % | 59 % | 10 % | 33 % |
| 10 | 4 | 6,77 | 2,84 | 0 % | 13 % | 63 % | 36 % | 1 % | 1 % | 3 % | 5 % | 60 % | 11 % | 25 % |
| 16 | 2 | 9,14 | 5,82 | 0 % | 1 % | 88 % | 12 % | 0 % | 0 % | 0 % | 2 % | 74 % | 26 % | 50 % |
| 16 | 3 | 11,88 | 5,58 | 0 % | 2 % | 79 % | 22 % | 0 % | 0 % | 0 % | 3 % | 62 % | 12 % | 33 % |
| 16 | 4 | 13,29 | 5,01 | 0 % | 2 % | 72 % | 28 % | 1 % | 1 % | 1 % | 5 % | 56 % | 7 % | 25 % |
| 20 | 2 | 11,46 | 7,12 | 0 % | 0 % | 89 % | 11 % | 0 % | 0 % | 0 % | 2 % | 73 % | 27 % | 50 % |
| 20 | 3 | 14,93 | 6,99 | 0 % | 1 % | 88 % | 12 % | 0 % | 0 % | 0 % | 3 % | 64 % | 11 % | 33 % |
| 20 | 4 | 17,08 | 6,22 | 0 % | 1 % | 77 % | 23 % | 1 % | 0 % | 1 % | 5 % | 62 % | 4 % | 25 % |

**EXP-012 Ökonomie-Varianten mit Rotation (Seeds 1–200 je Zeile)**

| Runden | Variante | Sp. | Trophäen/Partie | Sieger-Trophäen | ohne Trophäe | Sieg per Trophäen | Führender (Hälfte) gewinnt | Siege Slot 1 | Münzen Ende |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | A: Preis 15, Minispiel 10/5/3/0 (Stand) | 2 | 5,01 | 3,35 | 7 % | 81 % | 73 % | 52 % | 56,2 |
| 10 | A: Preis 15, Minispiel 10/5/3/0 (Stand) | 3 | 6,16 | 3,18 | 10 % | 75 % | 59 % | 33 % | 48,9 |
| 10 | A: Preis 15, Minispiel 10/5/3/0 (Stand) | 4 | 6,77 | 2,84 | 13 % | 63 % | 60 % | 24 % | 39,9 |
| 10 | B: Preis 20 | 2 | 4,37 | 2,83 | 5 % | 79 % | 69 % | 54 % | 50,2 |
| 10 | B: Preis 20 | 3 | 5,41 | 2,68 | 8 % | 70 % | 62 % | 31 % | 43,4 |
| 10 | B: Preis 20 | 4 | 5,74 | 2,36 | 14 % | 55 % | 58 % | 23 % | 36,6 |
| 10 | C: Minispiel 8/4/2/0 | 2 | 4,67 | 3,06 | 6 % | 80 % | 70 % | 51 % | 43,4 |
| 10 | C: Minispiel 8/4/2/0 | 3 | 5,87 | 2,88 | 8 % | 66 % | 65 % | 28 % | 36,6 |
| 10 | C: Minispiel 8/4/2/0 | 4 | 6,28 | 2,59 | 11 % | 62 % | 56 % | 24 % | 31,4 |
| 10 | D: Minispiel 10/6/3/1 | 2 | 5,09 | 3,42 | 6 % | 81 % | 75 % | 53 % | 60,5 |
| 10 | D: Minispiel 10/6/3/1 | 3 | 6,21 | 3,21 | 10 % | 77 % | 55 % | 32 % | 51,9 |
| 10 | D: Minispiel 10/6/3/1 | 4 | 6,94 | 2,92 | 14 % | 64 % | 57 % | 25 % | 44,3 |
| 10 | E: Preis 20, Minispiel 12/6/3/0 | 2 | 4,67 | 3,12 | 6 % | 79 % | 69 % | 50 % | 62,0 |
| 10 | E: Preis 20, Minispiel 12/6/3/0 | 3 | 5,71 | 2,83 | 9 % | 68 % | 68 % | 32 % | 51,4 |
| 10 | E: Preis 20, Minispiel 12/6/3/0 | 4 | 6,04 | 2,52 | 13 % | 60 % | 57 % | 22 % | 42,8 |
| 10 | S: Stand, Slot 1 Minispiel-Profi (+10 Punkte) | 2 | 4,97 | 3,29 | 6 % | 80 % | 76 % | 63 % | 56,5 |
| 10 | S: Stand, Slot 1 Minispiel-Profi (+10 Punkte) | 3 | 6,20 | 3,10 | 9 % | 68 % | 62 % | 43 % | 48,4 |
| 10 | S: Stand, Slot 1 Minispiel-Profi (+10 Punkte) | 4 | 6,83 | 2,93 | 13 % | 70 % | 64 % | 46 % | 39,6 |
| 20 | A: Preis 15, Minispiel 10/5/3/0 (Stand) | 2 | 11,46 | 7,12 | 0 % | 89 % | 73 % | 47 % | 91,8 |
| 20 | A: Preis 15, Minispiel 10/5/3/0 (Stand) | 3 | 14,93 | 6,99 | 1 % | 88 % | 64 % | 30 % | 74,1 |
| 20 | A: Preis 15, Minispiel 10/5/3/0 (Stand) | 4 | 17,08 | 6,22 | 1 % | 77 % | 62 % | 26 % | 56,9 |
| 20 | B: Preis 20 | 2 | 10,60 | 6,45 | 0 % | 87 % | 67 % | 56 % | 71,7 |
| 20 | B: Preis 20 | 3 | 13,30 | 5,79 | 0 % | 76 % | 60 % | 30 % | 60,1 |
| 20 | B: Preis 20 | 4 | 14,63 | 5,05 | 1 % | 65 % | 52 % | 25 % | 48,0 |
| 20 | C: Minispiel 8/4/2/0 | 2 | 11,17 | 6,80 | 0 % | 90 % | 69 % | 50 % | 63,5 |
| 20 | C: Minispiel 8/4/2/0 | 3 | 13,94 | 6,26 | 1 % | 82 % | 63 % | 34 % | 52,5 |
| 20 | C: Minispiel 8/4/2/0 | 4 | 15,68 | 5,43 | 1 % | 65 % | 51 % | 31 % | 41,4 |
| 20 | D: Minispiel 10/6/3/1 | 2 | 11,61 | 7,21 | 0 % | 91 % | 77 % | 52 % | 100,4 |
| 20 | D: Minispiel 10/6/3/1 | 3 | 15,11 | 7,05 | 1 % | 87 % | 63 % | 31 % | 79,9 |
| 20 | D: Minispiel 10/6/3/1 | 4 | 17,29 | 6,34 | 1 % | 77 % | 63 % | 23 % | 65,6 |
| 20 | E: Preis 20, Minispiel 12/6/3/0 | 2 | 11,22 | 6,89 | 0 % | 89 % | 71 % | 51 % | 95,5 |
| 20 | E: Preis 20, Minispiel 12/6/3/0 | 3 | 13,84 | 6,30 | 1 % | 81 % | 61 % | 33 % | 76,6 |
| 20 | E: Preis 20, Minispiel 12/6/3/0 | 4 | 15,67 | 5,58 | 1 % | 79 % | 49 % | 28 % | 57,9 |
| 20 | S: Stand, Slot 1 Minispiel-Profi (+10 Punkte) | 2 | 11,33 | 7,04 | 0 % | 91 % | 74 % | 55 % | 92,9 |
| 20 | S: Stand, Slot 1 Minispiel-Profi (+10 Punkte) | 3 | 14,88 | 6,72 | 0 % | 83 % | 67 % | 40 % | 74,3 |
| 20 | S: Stand, Slot 1 Minispiel-Profi (+10 Punkte) | 4 | 16,70 | 6,13 | 1 % | 81 % | 58 % | 47 % | 57,8 |

- **Kurze Partien tragen den Trophäen-Sieg nicht:** Bei 3 Runden hat der Sieger in 14–26 % der Partien **keine** Trophäe, 55–66 % der Spieler bleiben ohne, und die Münzen entscheiden fast jede zweite Partie. Ab 8 Runden hat praktisch jeder Sieger eine Trophäe. Bei 10 Runden bleiben 7–13 % der Spieler ohne, bei 16 nur noch 1–2 %.
- **Gleichstandsregel:** Die Münzen entscheiden Platz 1 bei 10 Runden in 19–36 % der Partien (5 Runden: 24–48 %, 20 Runden: 11–23 %), am häufigsten mit vier Spielern. **Minispiel-Siege** entscheiden nur in 0–2 %, ein **geteilter Sieg** kommt in 0–2 % vor, irgendein geteilter Platz in 0–5 %. Die dritte Stufe ist also ein seltener Notnagel: gut für die Inszenierung, kein Alltag.
- **Aufholeffekt:** Der alleinige Halbzeit-Führende gewinnt bei 10 Runden 59–73 % (fair 33–50 %), mit vier Spielern 56–62 % (fair 25 %). Der Halbzeit-Letzte gewinnt noch 10–27 % (vier Spieler: 4–11 %). Führung zählt deutlich, aber ab 8 Runden dreht sich unabhängig von der Rundenzahl noch jede dritte bis vierte Partie.
- **Ökonomie:** Preis 20 (B, E) senkt die Trophäen und erhöht die Münz-Entscheidungen (4 Spieler, 10 Runden: Sieg per Trophäen 55–60 % statt 63 %). Weniger Minispiel-Münzen (C) wirken ebenso. Die Trostmünze (D) ändert praktisch nichts. Ein Minispiel-Profi (+10 von 40 Punkten) gewinnt mit vier Spielern 46–47 % statt fair 25 %: Können in Minispielen zahlt sich aus, ohne dass das Brett egal wird.

**Entscheidung:** **keep** – Trophäenpreis 15 und Minispiel-Münzen 10/5/3/0 bleiben (`packages/game-core/src/rules/defaults.ts` unverändert). Keine Variante erhöht den Anteil der Trophäen-Siege, und die Münzen reichen auch in langen Partien (Ende Ø 40–92). Die Gleichstandsregel bleibt (ADR-015). Der wirksame Hebel ist die Rundenzahl (EXP-011: Standard 10 statt 5).

**Offen für Playtest:** Verständlichkeit und Gefühl der Münz-Entscheidung, Halbzeit-Vorteil, Wert einer Trophäe in langen Partien.

**Für später (CHAOS-44):** Aufholhilfe für die Letzten (z. B. Trophäe wandert bevorzugt vor die Hintersten), falls der Playtest den Halbzeit-Vorteil als zu stark empfindet.

---

## EXP-013: Sabotage-Häufigkeit und Item-Stärke über lange Partien (2026-11-15, CHAOS-40)

**Hypothese / gewünschtes Spielerlebnis:** Sabotage (Münzklau, Falle) sorgt für Schadenfreude und Überraschung, **ohne zu frustrieren** (VISION, Produktsäule 1). Ziel aus EXP-003: Verlust je Treffer im Mittel ≤ 25 % des Bestands. Neu für M4: Der gesamte Sabotage-Verlust bleibt ein kleiner Teil der Einnahmen, und die am stärksten getroffene Person verliert über die Partie höchstens etwa eine Trophäe (15 Münzen). Erwartung: Mit dem neuen Standard von 10 Runden und den Minispiel-Münzen werden Sabotagen relativ schwächer.

**Varianten** (10 und 20 Runden): A Klau 5/Falle 4 (Stand), B Klau 6/Falle 5 (Werte vor EXP-003), C Klau 7/Falle 5, D Münzklau-Gewicht 4 statt 3, E = B + D.

**Objektive Messgrößen:** Sabotagen je Partie und je Runde, verlorene Münzen / alle eingenommenen Münzen, Verlust je Treffer relativ zum Bestand (Mittel, p90), Münzen je Treffer, Spitzenopfer (höchster Gesamtverlust einer Person je Partie: Münzen, p90, Anteil an ihren Einnahmen), meiste Treffer auf eine Person, Trophäen je Partie.

**Subjektive Playtest-Fragen (für Ruben):** Kommt Sabotage oft genug vor, damit es sich nach Chaos anfühlt (mit vier Spielern ≈ alle 2–3 Runden)? Sind 5 geklaute Münzen witzig oder egal? Fühlt sich das Spitzenopfer gemobbt?

**Testumgebung:** siehe „Gemeinsamer Aufbau“.

**Ergebnisse:**

**EXP-013 Sabotage mit Rotation (Seeds 1–200 je Zeile)**

| Runden | Variante | Sp. | Sabotagen/Partie | je Runde | Verlust/Einnahmen | Verlust/Bestand | p90 | Münzen/Treffer | Spitzenopfer Münzen | p90 | Spitzenopfer/Einnahmen | max. Treffer auf einen | Trophäen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | A: Klau 5, Falle 4 (Stand) | 2 | 1,77 | 0,18 | 3 % | 18 % | 36 % | 3,6 | 4,5 | 9 | 5 % | 1,19 | 5,01 |
| 10 | A: Klau 5, Falle 4 (Stand) | 3 | 2,59 | 0,26 | 4 % | 19 % | 38 % | 3,8 | 6,0 | 10 | 8 % | 1,49 | 6,16 |
| 10 | A: Klau 5, Falle 4 (Stand) | 4 | 3,94 | 0,39 | 5 % | 20 % | 38 % | 3,7 | 7,4 | 12 | 11 % | 1,91 | 6,77 |
| 10 | B: Klau 6, Falle 5 | 2 | 1,76 | 0,18 | 4 % | 22 % | 41 % | 4,6 | 5,6 | 11 | 6 % | 1,19 | 5,02 |
| 10 | B: Klau 6, Falle 5 | 3 | 2,60 | 0,26 | 5 % | 24 % | 46 % | 4,8 | 7,5 | 12 | 10 % | 1,49 | 6,13 |
| 10 | B: Klau 6, Falle 5 | 4 | 3,94 | 0,39 | 6 % | 25 % | 46 % | 4,6 | 9,2 | 15 | 14 % | 1,90 | 6,74 |
| 10 | C: Klau 7, Falle 5 | 2 | 1,76 | 0,18 | 4 % | 24 % | 45 % | 4,9 | 6,1 | 12 | 7 % | 1,19 | 5,02 |
| 10 | C: Klau 7, Falle 5 | 3 | 2,61 | 0,26 | 5 % | 26 % | 54 % | 5,1 | 8,1 | 14 | 10 % | 1,49 | 6,13 |
| 10 | C: Klau 7, Falle 5 | 4 | 3,96 | 0,40 | 7 % | 26 % | 54 % | 4,9 | 9,8 | 15 | 15 % | 1,91 | 6,78 |
| 10 | D: Münzklau-Gewicht 4 | 2 | 1,97 | 0,20 | 3 % | 18 % | 33 % | 3,5 | 4,9 | 9 | 5 % | 1,32 | 4,98 |
| 10 | D: Münzklau-Gewicht 4 | 3 | 2,87 | 0,29 | 4 % | 19 % | 38 % | 3,7 | 6,4 | 10 | 8 % | 1,60 | 6,09 |
| 10 | D: Münzklau-Gewicht 4 | 4 | 4,35 | 0,43 | 6 % | 19 % | 38 % | 3,6 | 8,0 | 13 | 12 % | 2,12 | 6,72 |
| 10 | E: Klau 6, Falle 5, Münzklau-Gewicht 4 | 2 | 1,97 | 0,20 | 4 % | 22 % | 40 % | 4,5 | 6,2 | 11 | 7 % | 1,32 | 4,99 |
| 10 | E: Klau 6, Falle 5, Münzklau-Gewicht 4 | 3 | 2,88 | 0,29 | 5 % | 23 % | 46 % | 4,7 | 7,9 | 12 | 10 % | 1,59 | 6,04 |
| 10 | E: Klau 6, Falle 5, Münzklau-Gewicht 4 | 4 | 4,35 | 0,43 | 7 % | 24 % | 46 % | 4,6 | 9,9 | 16 | 15 % | 2,09 | 6,64 |
| 20 | A: Klau 5, Falle 4 (Stand) | 2 | 3,28 | 0,16 | 3 % | 13 % | 25 % | 3,7 | 7,8 | 14 | 4 % | 2,04 | 11,46 |
| 20 | A: Klau 5, Falle 4 (Stand) | 3 | 5,05 | 0,25 | 4 % | 14 % | 31 % | 3,8 | 10,1 | 15 | 7 % | 2,56 | 14,93 |
| 20 | A: Klau 5, Falle 4 (Stand) | 4 | 7,17 | 0,36 | 5 % | 16 % | 33 % | 3,7 | 11,7 | 18 | 9 % | 3,07 | 17,08 |
| 20 | B: Klau 6, Falle 5 | 2 | 3,28 | 0,16 | 4 % | 16 % | 32 % | 4,7 | 9,8 | 17 | 5 % | 2,04 | 11,48 |
| 20 | B: Klau 6, Falle 5 | 3 | 5,12 | 0,26 | 5 % | 18 % | 38 % | 4,8 | 12,7 | 19 | 8 % | 2,58 | 14,96 |
| 20 | B: Klau 6, Falle 5 | 4 | 7,13 | 0,36 | 6 % | 20 % | 42 % | 4,7 | 14,7 | 22 | 11 % | 3,08 | 17,06 |
| 20 | C: Klau 7, Falle 5 | 2 | 3,28 | 0,16 | 4 % | 18 % | 35 % | 5,0 | 10,5 | 18 | 6 % | 2,04 | 11,48 |
| 20 | C: Klau 7, Falle 5 | 3 | 5,13 | 0,26 | 5 % | 19 % | 40 % | 5,1 | 13,5 | 20 | 9 % | 2,58 | 14,93 |
| 20 | C: Klau 7, Falle 5 | 4 | 7,12 | 0,36 | 6 % | 21 % | 44 % | 4,9 | 15,4 | 23 | 12 % | 3,02 | 17,07 |
| 20 | D: Münzklau-Gewicht 4 | 2 | 3,60 | 0,18 | 3 % | 13 % | 25 % | 3,7 | 8,4 | 14 | 5 % | 2,21 | 11,39 |
| 20 | D: Münzklau-Gewicht 4 | 3 | 5,53 | 0,28 | 4 % | 14 % | 29 % | 3,8 | 10,9 | 15 | 7 % | 2,79 | 15,02 |
| 20 | D: Münzklau-Gewicht 4 | 4 | 7,57 | 0,38 | 5 % | 16 % | 33 % | 3,7 | 12,4 | 18 | 10 % | 3,33 | 17,03 |
| 20 | E: Klau 6, Falle 5, Münzklau-Gewicht 4 | 2 | 3,60 | 0,18 | 4 % | 17 % | 31 % | 4,6 | 10,6 | 17 | 6 % | 2,22 | 11,40 |
| 20 | E: Klau 6, Falle 5, Münzklau-Gewicht 4 | 3 | 5,51 | 0,28 | 5 % | 17 % | 35 % | 4,8 | 13,4 | 19 | 8 % | 2,74 | 15,10 |
| 20 | E: Klau 6, Falle 5, Münzklau-Gewicht 4 | 4 | 7,53 | 0,38 | 6 % | 19 % | 42 % | 4,6 | 15,3 | 22 | 12 % | 3,27 | 16,97 |

- **Häufigkeit:** 0,16–0,18 Sabotagen je Runde mit 2, 0,25–0,26 mit 3 und 0,36–0,39 mit 4 Spielern, bei 10 Runden also 1,8 / 2,6 / 3,9 je Partie. Das Münzklau-Gewicht 4 (D) bringt ≈ +10 %.
- **Stärke:** Sabotage kostet insgesamt nur **3–5 % aller eingenommenen Münzen**. Ein Treffer nimmt im Mittel 18–20 % des Bestands (p90 36–38 %) bei 10 Runden und 13–16 % bei 20 Runden, weil der Bestand mit den Minispiel-Münzen wächst. Klau 6/Falle 5 (B) liegt bei 22–25 % (p90 41–46 %), Klau 7 (C) bei 24–26 % (p90 bis 54 %).
- **Spitzenopfer:** verliert bei 10 Runden im Mittel 4,5–7,4 Münzen (p90 9–12), also weniger als eine halbe Trophäe und 5–11 % der eigenen Einnahmen; bei 20 Runden 7,8–11,7 (p90 14–18). Die meisten Treffer auf eine Person: 1,2–1,9 je 10-Runden-Partie.
- Die Trophäen je Partie ändern sich durch keine Variante messbar (± 0,1).

**Entscheidung:** **keep** Klau 5 / Falle 4 / Gewichte 3-3-3-2 (`defaults.ts` unverändert). Alle Zielwerte sind erfüllt, und nichts in den Daten zeigt Frust (kleiner Anteil am Geld, Spitzenopfer unter einer Trophäe). Ob es sich **zu zahm** anfühlt, kann nur der Playtest sagen: Die Simulation misst keine Schadenfreude. **iterate** nach dem Playtest: Ist Sabotage zu harmlos, zuerst **Klau 6 / Falle 5** (B: bleibt ab 10 Runden unter 25 % je Treffer, Spitzenopfer ≈ 9 Münzen), danach Münzklau-Gewicht 4 (D) für mehr Häufigkeit.

**Offen für Playtest:** Chaos-Gefühl gegen Frust, Häufigkeit mit 2 Spielern (nur etwa alle 6 Runden eine Sabotage).

**Für später (CHAOS-44):** Sabotage-Stärke mit der Partiedauer skalieren (z. B. Klau = 5 + Runde/5), falls lange Partien zahm wirken.

---

## EXP-014: Host-Grafik auf echter GPU – Engpass der Grafikstufen (2026-11-16, CHAOS-73)

**Hypothese / gewünschtes Spielerlebnis:** Ruben fand den Natur-Look am PC „zu langsam“. Gemessen war bisher nur SwiftShader. Annahme: Ein einzelner teurer Teil der Stufe `hoch` (Schatten, SSAO, Nachbearbeitung, Gras oder Auflösung) frisst die GPU. Ziel: Brett und Minispiele flüssig (p95 ≤ 20 ms, Ziel 60 fps) ohne sichtbaren Rückfall auf Notgrafik.

**Testumgebung:** MacBook Pro, Apple M3 Max, Chromium 153 (Playwright, **sichtbares Fenster** – headless nimmt Chromium auf dem Mac SwiftShader), ANGLE/Metal, **ohne VSync** (`--disable-gpu-vsync --disable-frame-rate-limit`), damit der Bildabstand die Kosten zeigt und nicht die 60 Hz. Brett im Demo-Modus (`/host/?local=1&board=1&demo=1&debug=1`), je Variante 9 s Anlauf, dann 4 s Messung mit `__chaosPerf`; ganze Partie mit `PERF_GPU=1 pnpm perf -g Partie` (4 Bots, Seed 2026). Varianten über einen temporären URL-Schalter je Feld der Grafikstufe (nicht eingecheckt).

**Messgrößen:** Bildabstand Median/p95, JS-Render-Zeit, Draw Calls; CPU-Profil (CDP) der Render-Schleife.

**Ergebnisse – Brett, 1920×1080, DPR 1 (Median ms):**

| Variante | Bildabstand | Draw Calls |
|---|---|---|
| `hoch` (Stand vorher) | **28** | 441 |
| `mittel` (vorher) | 21 | 436 |
| `niedrig` | 1,8 | 269 |
| `minimal` | 1,9 | 265 |
| `mittel` ohne Tiefenunschärfe / ohne Bloom / Schatten 1024 / Gras 25 % / MSAA 1 | 20 / 20 / 18 / 17 / 15 | 273 … 436 |
| `mittel` ohne PCSS (PCF) | **3,7** | 436 |
| `hoch` ohne PCSS (PCF HIGH / MEDIUM / LOW) | 5,2 / 5,1 / 5,2 | 441 |
| `hoch` mit PCSS, Filterstufe MEDIUM / **LOW** | 6,4 / **6,1** | 441 |

- **Engpass:** die weichen Kontaktschatten (PCSS, `useContactHardeningShadow`) in Babylons Standard-Filterstufe `HIGH` – ≈ 23 ms je Bild auf einer M3 Max. Das CPU-Profil zeigt 54 % in `uniformMatrix4fv` und 20 % in `drawElementsInstanced` bei Render-Zeit ≈ Bildabstand: Der Befehlspuffer ist voll, JS wartet auf die GPU. Draw Calls sind auf diesem Rechner nicht der Hebel (269 Draw Calls in 1,6 ms bei `niedrig`).
- PCSS mit Filterstufe `LOW` sieht im Vergleich (Ausschnitt Figur und Felder, 1080p) praktisch gleich aus wie `HIGH` und kostet ≈ 1 ms mehr als PCF.
- **Auflösung:** 4K (1920×1080 bei DPR 2) kostet `hoch` ohne PCSS 15 ms, mit Grenze 2560×1440 noch 8,8 ms; `mittel` (Grenze 1080p) 4,0 ms, `niedrig` (1600×900) 1,9 ms.
- **Automatik:** Jede Szene baute eine neue Engine und begann wieder bei `hoch`; die erste Abstufung kam frühestens nach ≈ 7 s, Schattenart und -größe änderten sich zur Laufzeit nie. In der GPU-Partie vorher lief das Brett 74 s mit 26 ms Median.

**Ganze Partie, M3 Max, ohne VSync (Bildabstand p50 / p95 ms):**

| Szene | vorher 1080p | nachher 1080p | nachher 4K (DPR 2) |
|---|---|---|---|
| brett | 26 / 29 | 5,5 / 8,0 | 8,7 / 13,6 |
| minispiel:sockenregen | 15 / 19 | 4,2 / 6,1 | 7,4 / 12,0 |
| minispiel:pudding-gerangel | 20 / 25 | 4,8 / 7,2 | 8,2 / 12,8 |
| minispiel:wackelturm | 15 / 18 | 4,4 / 6,0 | 7,6 / 13,2 |
| lobby / podest | 0,8 / 2,5 · 1,7 / 2,6 | 1,8 / 2,6 · 0,9 / 2,5 | 2,3 / 2,8 · 1,6 / 2,8 |

**Entscheidung:** keep –
1. PCSS bleibt (Look), aber immer mit Filterstufe `LOW` (`nature/lighting.ts`).
2. Jede Stufe begrenzt die Renderpixel (`maxRenderPixels`: `hoch` 2560×1440, `mittel` 1920×1080, `niedrig` 1600×900; `minimal` unverändert). Wirkt sofort, auch bei einer Abstufung mitten in der Szene.
3. Die Automatik merkt sich die erreichte Stufe für die Sitzung; Brett und Minispiele danach starten mit ihr.
4. **WebGPU** (`WebGPUEngine`) nicht gemessen: In Playwrights Chromium gibt es `navigator.gpu` nicht ohne Zusatzschalter, und der Wechsel braucht asynchronen Engine-Start und WGSL-Übersetzung an fünf Stellen. Nach dem Fund ist WebGL nicht der Engpass; WebGPU gehört in den Renderer-Spike CHAOS-75.

**Offen (nur auf echter Hardware):** Rubens PC und Fernseher (Grafikkarte, Browser, Auflösung, Bildwiederholrate), Checkliste PF0–PF10 und N1–N3. Ein Fernseher mit 30 Hz (4K über HDMI 1.4) liegt dauerhaft unter 45 fps und würde bis `niedrig` abstufen; dann `?qualitaet=hoch` setzen.


## EXP-015: Renderer-Alternativen – WebGPU, WebAssembly, nativ (2026-11-16, CHAOS-75)

**Hypothese / gewünschtes Spielerlebnis:** Ruben will ein flüssiges Bild am PC und Fernseher und später eine Apple TV als Host. Frage: Bringt ein anderer Renderer (Babylon mit WebGPU, Bevy als WebAssembly, Bevy nativ) bei **derselben Szene** spürbar mehr Bildrate, und welcher Weg führt zu tvOS? Erwartung nach EXP-014: Der Haupt-Engpass (PCSS) ist behoben; ein API-Wechsel spart vor allem CPU-Zeit je Draw Call, kaum GPU-Zeit.

**Varianten:**

| # | Variante | Prototyp |
|---|---|---|
| V1 | Babylon.js WebGL2 (heute) | Spiel, `/host/?local=1&board=1&demo=1&debug=1` |
| V2 | Babylon.js WebGPU, gleicher Code | `&gpu=webgpu` (nur Brett, WebGL2-Rückfall; `apps/host/src/scene/engineFactory.ts`) |
| V3 | Bevy 0.20.1 als WebAssembly (WebGPU bzw. WebGL2) | `spikes/renderer-bevy`, `build-web.sh` |
| V4 | Bevy 0.20.1 nativ (Metal/DX12/Vulkan) | `spikes/renderer-bevy`, `cargo run --release` |
| V5 | Swift/RealityKit (tvOS 26), Unity 6, Godot, Babylon Native | kein Prototyp, Recherche |

**Testszene:** das echte Brett „Wackelwald“ im Beispiel-Spielstand, Stufe `hoch`, exportiert mit `node scripts/spike-export-board.mjs` (Babylon-Serializer → GLB). Umfang laut Export: 201 Meshes (176 aktiv), ≈ 500 000 Vertices, 94 Materialien, 55 Texturen; im GLB 121 Meshes, 57 Materialien, 23 Texturen (PNG); 8 Thin-Instance-Gruppen mit 64 246 Instanzen (Gras, Blumen); 4 Figuren aus den Original-GLBs mit Idle-Animation. Unterschiede der Bevy-Szene (kein HDRI-Licht, keine Nachbearbeitung, statische Bäume, `KHR_texture_transform` nur auf der Grundfarbe): [`renderer-spike.md` §4](renderer-spike.md#4-was-die-szenen-gleich-haben--und-was-nicht).

**Messgrößen:** Bildabstand Median/p95 ohne VSync (Babylon: Messanzeige bzw. `PERF_GPU=1 pnpm perf`; Bevy: `SPIKE-ERGEBNIS`-Zeile), Auflösung 1080p und 4K; dazu Aufwand, Lizenz/Kosten, Weiterverwendbarkeit von game-core, Protokoll und Controllern, tvOS-Reife. Subjektiv: sieht die Szene gleichwertig aus, Ladezeit.

**Testumgebung bisher:** nur die Cloud-Umgebung (Linux x64, 4 Kerne, 16 GB, **keine GPU**). Dort ließ sich nur bauen und funktional prüfen:

- **V2:** Typecheck, Lint, Unit-Tests grün. Die `WebGPUEngine` startet in Headless-Chromium 153 (Adapter „swiftshader“), lädt nichts vom CDN (glslang/twgsl werden nicht gebraucht), aber das Gerät geht beim ersten Zeichnen verloren („Device was destroyed“). Ein Rohtest ohne Spielcode (Canvas konfigurieren, 30× leeren) verliert das Gerät genauso, mit drei Flag-Kombinationen. → Grenze der Software-GPU, kein Befund über den Spielcode. In CI bleibt WebGPU damit unprüfbar.
- **V3 (WebAssembly):** baut in ≈ 8 min (WebGPU und WebGL2). Programm 35 MB (≈ 8 MB gzip) plus Szene ≈ 43 MB. Die **WebGL2-Fassung rendert im Headless-Chromium** (SwiftShader) dieselbe Szene: Insel, Felder, Bäume, Teich, Pokale, Wegweiser, 4 Figuren, 64 246 Gras-/Blumen-Instanzen ([Bild](screenshots/chaos75-bevy-webgl2-swiftshader.jpg); Vergleich: [`chaos62-brett-hoch.jpg`](screenshots/chaos62-brett-hoch.jpg)). Sie wirkt heller und flacher (kein HDRI, keine Nachbearbeitung). Unter WebGL2 schaltet Bevy SSAO, OIT und Compute ab und erlaubt nur **eine** Schattenkaskade. Bildabstand unter SwiftShader ≈ 6 s – nur Funktionsnachweis. Die WebGPU-Fassung ist hier nicht prüfbar (wie V2).
- **V4 (nativ):** baut in ≈ 10 min (Erst-Build). In der Cloud ließ sich weder ein Fenster (SwiftShader-Vulkan ohne X11-Oberfläche, GL-Backend nicht gebaut) noch ein Offscreen-Bild erzeugen (Bildabstände wurden gemeldet, aber kein Bild – Zahlen verworfen). Nach drei Versuchen eingestellt (Fehlerregel aus `CLAUDE.md`); das Programm ist identisch mit V3 bis auf die Plattformschicht.
- **Fehler im Spike gefunden und behoben:** Der Babylon-Serializer rechnet linkshändig → rechtshändig durch Spiegeln von **x** um, nicht von z. Mit z-Spiegelung stand die Bevy-Kamera auf der Gegenseite (Schrift spiegelverkehrt); jetzt stimmen Kamera, Licht, Figuren und Instanzen mit dem GLB überein.
- Bevy-API: zwischen den bekannten Versionen und 0.20 viele Umbenennungen (`SceneRoot` → `WorldAssetRoot`, `shadows_enabled` → `shadow_maps_enabled`, `FontSize`); glTF-Erweiterung `EXT_mesh_gpu_instancing` nicht unterstützt (Instanzen deshalb als eigene Datei).

**Ergebnisse auf echter Hardware:** **offen** – Messbogen R1–R12 in [`renderer-spike.md`](renderer-spike.md#5-messbogen) (PC, Mac; Apple TV nicht messbar).

**Recherche (Stand 16.11.2026):**

| Thema | Befund | Quelle |
|---|---|---|
| tvOS Web | kein öffentliches WKWebView, kein Browser; JavaScriptCore seit tvOS 9 | developer.apple.com/documentation/webkit/wkwebview, …/javascriptcore |
| RealityKit tvOS | ab tvOS 26: ShaderGraph/Custom Materials, Partikel, Physik, Richtungslicht-Schatten, Skelett-Posen; USD/USDZ, glTF nur über Umwandlung; SceneKit in Wartung | developer.apple.com/documentation/realitykit, WWDC25 Session 288, Forum-Thread 831599 |
| Bevy | 0.20.1 (28.10.2026); tvOS-Issue #13058 offen, winit 0.30 ohne tvOS (0.31 Beta); WebGPU im Browser „experimentell“ | crates.io, github.com/bevyengine/bevy/issues/13058, Bevy examples/README |
| Rust tvOS | `aarch64-apple-tvos(-sim)` Tier 2 seit Rust 1.95 | rust-lang/rust RELEASES.md, platform-support |
| Unity 6 | tvOS offiziell (Metal); Personal frei bis 200 000 $, Splash optional (Stand 2024, 2026 unverifiziert) | docs.unity3d.com, unity.com Blog 12.09.2024 |
| Godot | kein offizieller tvOS-Export (Entwurfs-PR #118332); Web ohne WebGPU | godot-docs, github.com/godotengine/godot/pull/118332 |
| Babylon Native | kein tvOS, „public preview“ | BabylonNative README |
| Babylon WebGPU | Umsetzung vollständig; WGSL-Kern-Shader, glslang/twgsl nur für GLSL; Safari 26 mit WebGPU | Babylon-Doku webGPUStatus, Safari-26-Release-Notes |

**Entscheidung:** **iterate** – Prototypen und Messbogen stehen; die Wahl fällt erst mit Rubens Messwerten. Vorschlag in [ADR-016](decisions/ADR-016-renderer.md): bei Babylon bleiben, WebGPU als Option übernehmen, wenn R1/R2 (bzw. R7/R8) ≥ 20 % Vorteil zeigen, tvOS (CHAOS-74) als eigener Spike mit RealityKit und Server auf PC/Mac.

---

## EXP-016: Kuckucks-Klatsche überarbeitet – Arcade nur mit Knopf A (2026-11-16, CHAOS-54)

**Anlass:** Nach M4 soll es mehr Minispiel-Vielfalt geben (CHAOS-54). Kandidaten waren die in M3 verworfenen Konzepte Kuckucks-Klatsche, Aufzieh-Takt (EXP-005), Krümel-Kehraus (EXP-006) und Geysir-Gier (EXP-007). Gewählt wurde **Kuckucks-Klatsche**, weil es als einziges Konzept nur Knopf A braucht. Das ist eine neue Bedienung in der Rotation und ideal für die kleinen Zonen am geteilten iPad (EXP-005: „sehr gut: ein großer Knopf“). Physik ist mit Pudding-Gerangel besetzt und Push-your-luck mit Wackelturm (Turmhöhe). Ein zweites Spiel derselben Art hätte weniger Vielfalt gebracht als eine neue Bedienung.

**Hypothese / gewünschtes Spielerlebnis:** Ein Reflexspiel nur mit A wird fair und spannend, wenn es kein Wettrennen um den schnellsten Finger ist. Jede Person bekommt ihre eigenen Signale. Geschwindigkeit entscheidet nur noch darüber, wer einen verschlafenen Kuckuck klauen darf. Die Erwartung vorher: Schwächere gewinnen deutlich öfter als in B1/B2 (0 %), es gibt laufend etwas zu tun (B: 1,7 Drücke je 10 s), und Dauerdrücken lohnt sich nicht.

**Was aus EXP-005 … EXP-007 übernommen wurde:**
- *EXP-005, B:* 90 % Wartezeit, Sieg der schnellsten Finger, bis 32 % Gleichstand → eigene Türen statt einer Uhr, Punkte für alle statt nur für den Schnellsten, mehr Ereignisse.
- *EXP-005, A:* sichtbare Endphase (Schleudergang) erzeugt Spannung → „Mitternacht“: in den letzten 8 s öffnen die Türen doppelt so oft. Unsichtbares Gummiband (A5) ohne Wirkung → kein verdeckter Aufholmechanismus.
- *EXP-007:* dominante Strategien mit dem Eindringling-Test suchen (Dauerklatscher, Raffzahn, brav). Höchstens 3 Anleitungszeilen und wenige Begriffe (hier 4: Tür, Gong, Finte, benommen).

**Regeln (gewählte Fassung K2, `KUCKUCK_RULES` in `packages/minigames/src/kuckucks-klatsche/logic.ts`):**
- Jede Person hat eine runde Tür in ihrer Farbe mit ihrem Symbol. Die Tür rappelt 0,35 s, dann springt etwas heraus.
- **Kuckuck:** 0,8 s lang darf nur die Besitzerin klatschen (+2). Danach Gong (weißer Ring): 0,9 s lang darf jeder (Erster bekommt ihn; Besitzerin +1, Klau +1). Sonst entwischt er.
- **Finte** (28 %, Gummiente, Socke, Blume): wer bei der eigenen Finte klatscht, verliert 1 Punkt (nie unter 0) und ist benommen.
- **Leerklatscher:** Ein Druck ohne Ziel (Tür zu, rappelt noch, fremder Kuckuck vor dem Gong) macht 1,0 s benommen. Benommen zählt kein Druck.
- Ein Druck trifft zuerst die eigene Tür, sonst den am längsten freigegebenen fremden Kuckuck.
- Pausen zwischen zwei Öffnungen 0,9–2,3 s, zu Mitternacht (letzte 8 s) halb so lang. Spielzeit 30 s.

**Varianten:** B1/B2 (alter Prototyp aus EXP-005) und A4* (Sockenregen, echte Logik) als Messlatten. K1–K8 laufen auf der **echten Spiellogik**, die Varianten sind Regel-Sätze:
- K1: eigene Türen, Gong-Klau, Leerklatscher, ohne Mitternacht
- **K2: K1 + Mitternacht (gewählt)**
- K3/K4: eigenes Fenster 0,6 s bzw. 1,0 s statt 0,8 s
- K5: ohne Klauen (nach dem Gong nur noch die Besitzerin, +1)
- K6: Benommenheit 0,7 s (erste Fassung), K7: ohne Benommenheit
- K8: Finten-Beutel (je Tür genau 2 Finten in 7 Öffnungen, gleich viele Chancen für alle)

**Objektive Messgrößen:** wie EXP-005 (Punkte des Siegers, Abstand Platz 1–2, Gleichstand, Führungswechsel, Comeback, Siegquote Profi und Neuling, knappe Besetzungen Gut gegen Normal und 4× Normal, Drücke je 10 s). Dazu Klau, Finten und Leerklatscher je Runde sowie der Eindringling-Test aus EXP-007: Eine Strategie spielt gegen zwei normale Bots (3 Spieler, alle mit Profil Normal, Platz reihum). Faktor > 1 heißt, die Strategie schlägt die normale Spielweise.

**Bots:** Profile aus EXP-005 (Profi, Gut, Normal, Neuling; Annahmen, nicht gemessen). Sie sehen nur, was ein Mensch am Fernseher sieht: welche Tür rappelt, was herausspringt, den Gong, ob ein Kuckuck schon weg ist. Ungeduld (`falseStart`) führt zu Vorausdrücken und Finten-Klatschern, Aussetzer (`lapse`) zum Verschlafen. Ob jemand klaut, steuert `judgement` (Strategie „normal“). Ist das Ziel schon weg, bremst ein Bot mit Wahrscheinlichkeit `judgement`. Wer benommen ist, drückt danach meist gleich noch einmal. Strategien: *brav* klaut nie, *Raffzahn* klaut alles, *Dauerklatscher* drückt stur alle 0,22 s.

**Testumgebung:** Node 22, Vitest, Linux-Container, Basis-Commit `5fdd6e8`, Ergebnisse vom Commit, der diesen Eintrag einführt. Fester Schritt 1/60 s, Seeds 1–300 je Zeile. Laufzeit ≈ 20 s:

```sh
EXPERIMENTS=1 pnpm exec vitest run packages/minigames/src/prototypes/arcade/experimentKuckuck --silent=false
```

Code: `packages/minigames/src/prototypes/arcade/kuckucksKlatscheBot.ts` (Bots für die echte Logik), `experimentKuckuck.ts` (Varianten und Tabellen). Ohne `EXPERIMENTS=1` läuft nur ein Smoke-Test (Teil von `pnpm test`). Rauschen: Bei 300 Seeds liegt der Standardfehler einer Quote um 50 % bei ≈ 3 Prozentpunkten, der eines Siegfaktors bei ≈ 0,08.

**Ergebnisse:**

**EXP-016 Kuckucks-Klatsche neu gegen alt (30 s, Seeds 1–300 je Zeile)**

| Variante | Sp. | Punkte P1 | Abstand 1–2 | Gleichstand P1 | Führungswechsel | Comeback | Siege Profi | Siege Neuling | fair | Drücke/10 s | Klau/Runde | Finten/Runde | Leer/Runde |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B1: alt: eine Uhr, Schnellster +1 | 2 | 4,8 | 98 % | 0 % | 0,0 | 0 % | 100 % | 0 % | 50 % | 1,7 | – | – | – |
| B1: alt: eine Uhr, Schnellster +1 | 3 | 4,5 | 91 % | 1 % | 0,1 | 5 % | 99 % | 0 % | 33 % | 1,7 | – | – | – |
| B1: alt: eine Uhr, Schnellster +1 | 4 | 3,7 | 67 % | 9 % | 0,3 | 13 % | 89 % | 0 % | 25 % | 1,7 | – | – | – |
| B2: alt: eine Uhr, 2 / Rest 1 | 2 | 9,7 | 62 % | 0 % | 0,1 | 1 % | 100 % | 0 % | 50 % | 1,7 | – | – | – |
| B2: alt: eine Uhr, 2 / Rest 1 | 3 | 9,4 | 48 % | 1 % | 0,2 | 6 % | 99 % | 0 % | 33 % | 1,7 | – | – | – |
| B2: alt: eine Uhr, 2 / Rest 1 | 4 | 8,7 | 32 % | 10 % | 0,3 | 13 % | 88 % | 0 % | 25 % | 1,7 | – | – | – |
| K1: eigene Türen, Gong-Klau, Leerklatscher | 2 | 18,3 | 32 % | 5 % | 1,6 | 17 % | 80 % | 20 % | 50 % | 3,2 | 0,8 | 1,4 | 1,0 |
| K1: eigene Türen, Gong-Klau, Leerklatscher | 3 | 19,2 | 20 % | 9 % | 2,8 | 26 % | 65 % | 12 % | 33 % | 3,2 | 1,5 | 2,2 | 2,1 |
| K1: eigene Türen, Gong-Klau, Leerklatscher | 4 | 20,2 | 16 % | 10 % | 3,7 | 35 % | 47 % | 10 % | 25 % | 3,2 | 1,9 | 2,6 | 3,3 |
| K2: K1 + Mitternacht (gewählt) | 2 | 20,3 | 34 % | 5 % | 1,7 | 19 % | 84 % | 16 % | 50 % | 3,5 | 0,8 | 1,6 | 1,0 |
| K2: K1 + Mitternacht (gewählt) | 3 | 21,5 | 22 % | 7 % | 2,9 | 32 % | 65 % | 9 % | 33 % | 3,6 | 1,6 | 2,5 | 2,3 |
| K2: K1 + Mitternacht (gewählt) | 4 | 22,1 | 15 % | 11 % | 3,9 | 39 % | 51 % | 8 % | 25 % | 3,6 | 2,0 | 3,1 | 3,6 |
| K3: K2, eigenes Fenster 0,6 s | 2 | 20,5 | 44 % | 1 % | 1,3 | 11 % | 93 % | 7 % | 50 % | 3,7 | 1,1 | 1,6 | 2,0 |
| K3: K2, eigenes Fenster 0,6 s | 3 | 21,2 | 25 % | 6 % | 2,5 | 25 % | 72 % | 5 % | 33 % | 3,8 | 1,9 | 2,7 | 3,9 |
| K3: K2, eigenes Fenster 0,6 s | 4 | 22,3 | 18 % | 7 % | 3,8 | 41 % | 58 % | 1 % | 25 % | 3,9 | 2,8 | 3,4 | 5,8 |
| K4: K2, eigenes Fenster 1,0 s | 2 | 20,6 | 33 % | 6 % | 1,6 | 20 % | 81 % | 20 % | 50 % | 3,4 | 0,8 | 1,4 | 0,8 |
| K4: K2, eigenes Fenster 1,0 s | 3 | 21,0 | 20 % | 8 % | 2,8 | 36 % | 62 % | 15 % | 33 % | 3,5 | 1,4 | 2,3 | 1,9 |
| K4: K2, eigenes Fenster 1,0 s | 4 | 22,2 | 15 % | 12 % | 3,8 | 40 % | 46 % | 5 % | 25 % | 3,5 | 1,9 | 3,0 | 2,8 |
| K5: K2 ohne Klauen | 2 | 19,5 | 31 % | 4 % | 1,7 | 25 % | 81 % | 19 % | 50 % | 3,5 | 0,0 | 1,5 | 1,6 |
| K5: K2 ohne Klauen | 3 | 20,0 | 20 % | 7 % | 3,0 | 38 % | 57 % | 16 % | 33 % | 3,6 | 0,0 | 2,6 | 3,9 |
| K5: K2 ohne Klauen | 4 | 20,8 | 14 % | 14 % | 3,4 | 35 % | 38 % | 10 % | 25 % | 3,7 | 0,0 | 3,3 | 6,1 |
| K6: K2, benommen nur 0,7 s (erste Fassung) | 2 | 20,4 | 33 % | 5 % | 1,7 | 20 % | 83 % | 17 % | 50 % | 3,5 | 0,8 | 1,6 | 1,0 |
| K6: K2, benommen nur 0,7 s (erste Fassung) | 3 | 21,5 | 22 % | 9 % | 2,9 | 33 % | 65 % | 9 % | 33 % | 3,6 | 1,4 | 2,5 | 2,2 |
| K6: K2, benommen nur 0,7 s (erste Fassung) | 4 | 22,1 | 15 % | 13 % | 4,1 | 45 % | 47 % | 8 % | 25 % | 3,6 | 1,9 | 3,0 | 3,3 |
| K7: K2 ohne Benommenheit | 2 | 20,6 | 33 % | 6 % | 1,7 | 20 % | 84 % | 17 % | 50 % | 3,5 | 0,8 | 1,6 | 1,0 |
| K7: K2 ohne Benommenheit | 3 | 21,4 | 21 % | 9 % | 2,9 | 34 % | 63 % | 10 % | 33 % | 3,6 | 1,3 | 2,5 | 2,2 |
| K7: K2 ohne Benommenheit | 4 | 22,3 | 16 % | 11 % | 4,0 | 41 % | 49 % | 7 % | 25 % | 3,6 | 1,7 | 3,1 | 3,4 |
| K8: K2 mit Finten-Beutel (2 je 7 Öffnungen) | 2 | 19,3 | 30 % | 2 % | 1,8 | 14 % | 95 % | 5 % | 50 % | 3,5 | 0,8 | 1,7 | 1,1 |
| K8: K2 mit Finten-Beutel (2 je 7 Öffnungen) | 3 | 20,0 | 18 % | 7 % | 3,4 | 28 % | 83 % | 4 % | 33 % | 3,6 | 1,5 | 2,6 | 2,3 |
| K8: K2 mit Finten-Beutel (2 je 7 Öffnungen) | 4 | 20,2 | 11 % | 13 % | 4,7 | 48 % | 68 % | 2 % | 25 % | 3,6 | 2,0 | 3,1 | 3,6 |
| A4*: Sockenregen (Messlatte) | 2 | 32,2 | 36 % | 1 % | 1,3 | 8 % | 95 % | 5 % | 50 % | 22,6 | – | – | – |
| A4*: Sockenregen (Messlatte) | 3 | 24,9 | 28 % | 5 % | 2,0 | 20 % | 85 % | 2 % | 33 % | 22,0 | – | – | – |
| A4*: Sockenregen (Messlatte) | 4 | 20,5 | 24 % | 7 % | 2,6 | 32 % | 70 % | 3 % | 25 % | 21,3 | – | – | – |

**EXP-016 Knappe Besetzungen (Seeds 1–300)**

| Variante | Duell: Siege Normal | Duell: Gleichstand | Duell: Führungswechsel | 4× Normal: Abstand 1–2 | 4× Normal: Gleichstand P1 | 4× Normal: Führungswechsel | 4× Normal: Comeback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1: alt: eine Uhr, Schnellster +1 | 15 % | 7 % | 0,3 | 40 % | 32 % | 0,6 | 35 % |
| B2: alt: eine Uhr, 2 / Rest 1 | 15 % | 8 % | 0,3 | 17 % | 27 % | 0,6 | 34 % |
| K1: eigene Türen, Gong-Klau, Leerklatscher | 42 % | 7 % | 1,8 | 14 % | 12 % | 3,6 | 38 % |
| K2: K1 + Mitternacht (gewählt) | 40 % | 7 % | 2,1 | 15 % | 9 % | 3,9 | 37 % |
| K3: K2, eigenes Fenster 0,6 s | 36 % | 7 % | 1,9 | 15 % | 9 % | 4,1 | 43 % |
| K4: K2, eigenes Fenster 1,0 s | 39 % | 7 % | 2,0 | 15 % | 9 % | 3,6 | 35 % |
| K5: K2 ohne Klauen | 44 % | 6 % | 2,1 | 15 % | 11 % | 3,7 | 38 % |
| K6: K2, benommen nur 0,7 s (erste Fassung) | 39 % | 8 % | 2,0 | 14 % | 12 % | 3,9 | 40 % |
| K7: K2 ohne Benommenheit | 41 % | 8 % | 2,0 | 14 % | 10 % | 3,8 | 38 % |
| K8: K2 mit Finten-Beutel (2 je 7 Öffnungen) | 33 % | 10 % | 3,0 | 8 % | 21 % | 5,3 | 51 % |
| A4*: Sockenregen (Messlatte) | 34 % | 4 % | 2,5 | 17 % | 10 % | 3,0 | 49 % |

**EXP-016 Eindringling gegen 2× normal (3 Sp., alle Profil Normal, Siegfaktor; 1,00 = fair; Seeds 1–300)**

| Variante | normal | brav (klaut nie) | Raffzahn (klaut alles) | Dauerklatscher |
| --- | --- | --- | --- | --- |
| K1: eigene Türen, Gong-Klau, Leerklatscher | 1,01 | 0,81 | 1,09 | 0,41 |
| K2: K1 + Mitternacht (gewählt) | 0,98 | 0,83 | 1,02 | 0,55 |
| K3: K2, eigenes Fenster 0,6 s | 1,04 | 0,88 | 1,17 | 0,29 |
| K4: K2, eigenes Fenster 1,0 s | 1,02 | 0,92 | 1,13 | 0,85 |
| K5: K2 ohne Klauen | 1,00 | 1,02 | 1,00 | 0,42 |
| K6: K2, benommen nur 0,7 s (erste Fassung) | 1,01 | 0,86 | 1,04 | 1,06 |
| K7: K2 ohne Benommenheit | 1,05 | 0,96 | 1,13 | 1,88 |
| K8: K2 mit Finten-Beutel (2 je 7 Öffnungen) | 0,92 | 0,82 | 0,98 | 0,32 |

**Auswertung:**
- **Gegenüber der alten Fassung:** Der Neuling gewinnt gegen den Profi jetzt 16 % (2 Sp.) bzw. 8–9 % (3/4 Sp.) statt nie. Im knappen Duell gewinnt Normal gegen Gut 40 % statt 15 %, mehr als bei Sockenregen (34 %). Es gibt 1,7–3,9 Führungswechsel statt 0–0,3, und unter vier gleich Starken sinken die Gleichstände von 27–32 % auf 9 %. Je Person und 10 s kommen 3,6 Drücke statt 1,7. Das bleibt ein Reflexspiel und ist ruhiger als Sockenregen (22 Aktionen), aber man wartet nicht mehr 90 % der Zeit.
- **Woher die Chancen kommen:** Vor allem vom **Türglück**. Jede Tür würfelt ihre Finten und Pausen selbst, also bekommt mal die eine, mal die andere Person mehr echte Kuckucke. K8 (Finten-Beutel, gleich viele Chancen für alle) nimmt dieses Glück weg. Der Neuling gewinnt dann nur noch 2–5 %, der Profi 68–95 %, und unter gleich Starken verdoppeln sich die Gleichstände (9 % → 21 %). Mit dem Beutel wird die Wertung strenger, aber nicht fairer.
- **Fenster der Besitzerin:** 0,6 s (K3) bestraft langsame Reaktion zu stark (Neuling 1–7 %). 1,0 s (K4) hilft dem Neuling bei 2–3 Spielern (15–20 %), lässt aber Dauerklatschen fast aufholen (0,85). 0,8 s ist der Kompromiss.
- **Klauen (K5):** Ohne Klauen ist das Spiel etwas fairer für Schwache (10–19 %), aber es gibt keine Interaktion. Man spielt dann nur noch neben-, nicht gegeneinander. Das war in EXP-005 der Hauptgrund gegen C. Mit Klauen gibt es 0,8–2 Klau-Momente je Runde, sichtbar als fliegende Klatsche. „Brav“ (nie klauen) fällt auf 0,83 und „Raffzahn“ steigt nur auf 1,02: Klauen lohnt sich, dominiert aber nicht.
- **Benommenheit gegen Dauerdrücken:** Ohne Benommenheit (K7) gewinnt der Dauerklatscher fast doppelt so oft wie fair (1,88). Mit 0,7 s (K6, erste Fassung) liegt er noch bei 1,06. Erst 1,0 s macht Dauerdrücken klar schlechter (0,55), ohne die übrigen Kennzahlen zu verschieben. Der Grund: Benommen bleibt der Dauerklatscher fast immer und trifft den eigenen Kuckuck dann oft erst nach dem Gong. Fast jede eigene Finte erwischt er.
- **Mitternacht (K2 gegen K1):** Am Ende kommen mehr Ereignisse, die Comebacks steigen leicht (4 Sp.: 35 % → 39 %), und es gibt etwas mehr Führungswechsel. Der Neuling verliert bei 2 Spielern ein paar Punkte (20 % → 16 %, nahe am Rauschen). Behalten als sichtbares Finale, wie der Schleudergang bei Sockenregen.
- **Ein einzelner Lauf ist kein Beleg.** Im headless Test (`kuckucksKlatsche.test.ts`) schlägt der Dauerklatscher einzelne Spieler, wenn eine dritte Person gar nicht drückt. Die verschlafenen Kuckucke klaut dann fast nur er. Das ist am echten Tisch selten und zeigt sich nur über viele Seeds.

**Entscheidung:** **keep K2** als „Kuckucks-Klatsche“ (`kuckucks-klatsche`, Arcade, 30 s, nur A, ohne Physik), in Katalog und Rotation.
- **Gründe:** Neue Bedienung (nur A) für mehr Vielfalt und für die iPad-Zonen. Echte Chancen für Schwächere, mehr als bei jedem anderen Arcade-Konzept. Interaktion durch Klauen ohne Wettrennen-Zwang. Keine dominante Strategie. 3 Anleitungszeilen mit 4 Begriffen.
- **Rotation:** Es sind jetzt vier Minispiele; bei 10 Runden kommt jedes 2–3-mal statt 3–4-mal (EXP-011: Wiederholung war ein Kritikpunkt). Kuckucks-Klatsche dauert 30 s wie Sockenregen; die Partiedauer aus EXP-011 ändert sich dadurch kaum.
- **discard:** K8 (Beutel: weniger Chancen, mehr Gleichstand), K3 (zu streng), K6/K7 (Dauerdrücken lohnt). K4 und K5 bleiben Stellschrauben, falls der Playtest es verlangt (`ownS`, `steal`).

**Umsetzung:** `packages/minigames/src/kuckucks-klatsche/` (`logic.ts` rein, `index.ts` Babylon-Ansicht mit Natur-Look, `highlights.ts`, Tests). Die Logik gibt Ereignisse aus (`drainEvents`), daraus macht die Ansicht Ton, Effekte und Animationen. Belegbild: `docs/screenshots/chaos54-kuckucks-klatsche.jpg` (4 Spieler, Orange klatscht, Blau verpasst das eigene Fenster: weißer Gong-Ring). Vorschau: `/host/?local=1&minigame=kuckucks-klatsche&players=4`.

**Offen für Playtest (Ruben, Gerätecheckliste P6a):**
1. Findet jede Person ihre Tür sofort (Farbe + Symbol über der Tür, Figur daneben)?
2. Unterscheidet man auf Sofa-Abstand den Kuckuck von Ente, Socke und Blume? Ist die Finte witzig oder gemein?
3. Wird der weiße Gong-Ring als „jetzt darf jeder“ verstanden? Fühlt sich Klauen witzig an?
4. Fühlt sich Türglück („bei mir kam kaum was“) unfair an? Falls ja: Beutel (K8) erneut abwägen, obwohl er Schwächeren schadet.
5. Ist 1 s Benommenheit nach einem Leerklatscher die richtige Härte, und merkt man, warum man benommen ist (Sterne, „benommen“ im HUD)?
6. Reicht der große A-Knopf in der 4er-Zone am iPad? Ist das Spiel mit 30 s zu lang für reines Klatschen?
7. Die Bot-Profile sind Annahmen. Echte Reaktionszeiten (CHAOS-49) können die Fenster verschieben.

**Für später:** Die übrigen verworfenen Konzepte (Aufzieh-Takt, Krümel-Kehraus, Geysir-Gier) → CHAOS-79.

---

## EXP-017: Native RealityKit-App für macOS, tvOS (und iPhone/iPad als Benchmark) (2026-11-16, CHAOS-78)

**Hypothese / gewünschtes Spielerlebnis:** Ruben will das Spiel am Fernseher über eine Apple TV und wünscht sich native Apps („native Mac App, iPad App, iOS App und TV App“). Frage: Schafft RealityKit dieselbe Testszene wie EXP-015 flüssig auf Apple-Geräten, und wie groß ist der Bruch zum Babylon-Host? Erwartung: RealityKit hält 60 Hz auf der Apple TV, braucht aber einen zweiten Renderer und verliert Teile des Looks.

**Rahmen:** Die Produktsäule bleibt unverändert: Server und Spiel laufen auf PC/Mac, iPhone/iPad sind Controller. Die iOS/iPadOS-Ziele der App sind **nur Renderer-Benchmark**. tvOS ist Kandidat für eine reine Host-Anzeige (ADR-016, Server-Variante 1); die Entscheidung über CHAOS-74 liegt bei Ruben.

**Varianten:**

| # | Variante | Prototyp |
|---|---|---|
| V6 | RealityKit `ARView` (vsync) auf macOS, iPadOS, tvOS | `spikes/renderer-realitykit`, ein xcodegen-Ziel für drei Plattformen, Deployment 26.0 |
| V7 | RealityKit `RealityRenderer` offscreen (`--durchsatz=1`) | gleiche App, nur macOS gemessen |

**Testszene:** wie EXP-015, aus dem GLB-Export mit Blender (`bpy==5.3.0`) nach USDZ umgewandelt (`convert/convert.sh`, ≈ 40 s, `usdchecker` grün). 64 246 Gras-/Blumen-Instanzen als echtes GPU-Instancing (`MeshInstancesComponent`, `LowLevelInstanceData`, ab 26.0 auf allen drei Plattformen), 4 Figuren mit Idle-Clip, Kamera/Sonne aus `brett.szene.json`, Himmel als Verlaufs-IBL.

**Messgrößen:** Bildabstand Median/p95 (`SPIKE-ERGEBNIS`, gleiche Schlüssel wie Bevy), sichtbare Gleichheit zum Babylon-Bild, Aufwand.

**Ergebnisse (16.11.2026, MacBook Pro M3 Max, 120 Hz; vorläufig, weil GeForce NOW parallel lief):**

| Pfad | Auflösung | gras | Schatten | Median | p95 |
|---|---|---|---|---|---|
| ARView (vsync) | 1920×1080 | 1 | an | 8,30 ms | 17,0 ms |
| offscreen, nacheinander | 1920×1080 | 1 | an | 16,8–21,3 ms | 23–40 ms |
| offscreen | 1920×1080 | 0,25 | an | 15,6 ms | 31,7 ms |
| offscreen | 1920×1080 | 1 | aus | 13,6 ms | 20,1 ms |

- Die ARView hält im Median 120 Hz, das p95 zeigt einzelne verpasste Bilder; Reserve über 120 Hz unbekannt. Weitere ARView-Läufe waren ungültig, weil macOS das verdeckte Fenster auf ≈ 10 Hz drosselte.
- Offscreen-Werte warten jedes Bild ab (kein Pipelining) und sind deshalb **nicht** mit Bevy `vsync=0` vergleichbar. Nur „Schatten aus“ hebt sich vom Rauschen ab.
- Eine GPU-Zeit liefert RealityKit unter macOS nicht (`__frameTime()` = 0); dafür bleibt Instruments.
- **Simulatoren (keine Messungen):** iPad (A16) 2360×1640 und Apple TV 4K (3. Gen., tvOS 27) 3840×2160 zeigen die volle Szene bei 60 Hz ([Mac](screenshots/chaos78-realitykit-macos.jpg), [iPad-Sim](screenshots/chaos78-realitykit-ipad-sim.jpg), [tvOS-Sim](screenshots/chaos78-realitykit-tvos-sim.jpg)).
- **Echte Apple TV:** nicht gemessen (kein Gerät am Rechner, kein Signier-Team eingerichtet) → Gerätecheckliste §17, Messbogen R12.

**Befunde unterwegs:**
- RealityKit ignoriert Vertexfarben, solange ein Material gebunden ist (auch `UsdPrimvarReader`). Der Konverter backt die Materialfarbe in die Vertexfarbe und entfernt das Material: Farben stimmen, aber Rauheit, Clearcoat, Sheen und Leuchten (Gesichter der Figuren) fallen weg.
- Himmelskuppeln und Dunst kommen aus dem Babylon-Export als schwarze Spiegelkugeln; ausgeblendet, Hintergrund aus `clearColor`.
- tvOS-27-Simulator stürzt mit expliziter `bounds`-Hülle an `MeshInstancesComponent` ab (`bad_variant_access` im Occlusion-Culling); ohne Hülle stabil. Auf echter Hardware ungeprüft.
- Host-Weg über das Protokoll: `HostClient.swift` meldet sich mit `host-hello` v4 an und bekommt `lobby` vom echten Server. Figuren nach `board` setzen ist eingebaut, aber ohne Partie mit Controllern ungeprüft.

**Aufwand und Brüche bei einem echten tvOS-Host (Schätzung, nicht gemessen):** Brett-Regie (Kamerafahrten, Laufanimation, Popups, HUD) in Swift neu; Minispiel-Logik (ADR-012, läuft im Host) in Swift portieren oder per JavaScriptCore ohne Havok betreiben, Physik auf RealityKit umstellen; Podest und Effekte neu; Asset-Pfad GLB → USDZ mit den Materialverlusten oben; Signieren/Verteilen braucht ein Apple-Developer-Konto (ob ein kostenloser Account für eigene tvOS-Geräte reicht, ist ungeprüft; TestFlight/App Store kosten Geld → Rubens Freigabe). game-core, Protokoll und Controller bleiben, solange der Server auf PC/Mac läuft.

**Entscheidung:** **iterate** – Der Prototyp zeigt, dass RealityKit die Szene mit allen Instanzen auf allen Apple-Plattformen rendert. Ob es auf der echten Apple TV flüssig ist, entscheiden R12/RK4. Danach ADR für den tvOS-Host als Entwurf; Rubens Entscheidung zu CHAOS-74 (Produktsäule) steht aus.

