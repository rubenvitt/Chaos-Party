## EXP-005: Arcade-Minispiel – Konzeptvergleich (2026-11-15, CHAOS-29, CHAOS-30)

> Eigene Datei, damit parallele Minispiel-Experimente nicht in `docs/experiments.md` kollidieren. Der Koordinator führt den Eintrag dort zusammen (Übersichtszeile: „EXP-005 | Arcade-Minispiel: Konzepte | CHAOS-29/30 | keep A4 „Sockenregen“; B, C discard“).

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
