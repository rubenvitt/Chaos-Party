## EXP-006: Physik-Minispiel – Konzeptvergleich mit Havok (2026-11-15, CHAOS-29, CHAOS-31)

> Eigene Datei für den Koordinator. Er übernimmt den Eintrag in `docs/experiments.md` (Übersicht: „EXP-006 | Physik-Minispiel | CHAOS-29/31 | keep Z: Pudding-Gerangel (A5)“).

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
