## EXP-007: Hybrid-Minispiel – Konzeptvergleich „Wackelturm“ gegen „Geysir-Gier“ (2026-11-15, CHAOS-29, CHAOS-32)

> Eigene Datei, damit parallele M3-Experimente sich nicht in die Quere kommen; der Koordinator führt sie in `docs/experiments.md` zusammen.

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
