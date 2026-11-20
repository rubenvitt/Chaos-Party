# Prüfbericht Minispiele

Erzeugt von `packages/minigames/src/checks/checks.test.ts` (CHAOS-84) mit 200 Seeds je Tisch. Regeln, Tische und Begründung der Schwellen: [`pruefungen.md`](pruefungen.md). Neu erzeugen:

```sh
PRUEFBERICHT=1 pnpm exec vitest run packages/minigames/src/checks --silent=false
```

## Bot-Fairness

| Spiel | Seeds | Gleichstand P1 (≤ 25 %) | Abstand 1–2 (≤ 45 %) | Führungswechsel (≥ 1,0) | Siege Neuling (2 %–25 %) | Siege Profi (≥ 25 %) | Eindringling max. (≤ 1,50) | Rechenzeit s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sockenregen | 200 | 12 % | 17 % | 2,9 | 6 % | 72 % | 0,35 (Dauerdrücken (Hechtsprung)) | 2,6 |
| pudding-gerangel | 200 | 12 % | 8 % | 6,9 | 7 % | 34 % | 0,35 (Dauerrempler) | 68,1 |
| wackelturm | 200 | 7 % | 14 % | 6,1 | 32 % | 17 % | 1,28 (gierig (7–10 Törtchen)) | 4,7 |
| kuckucks-klatsche | 200 | 10 % | 15 % | 3,8 | 8 % | 53 % | 1,12 (Raffzahn (klaut alles)) | 0,7 |
| kruemel-kehraus | 200 | 21 % | 19 % | 2,2 | 7 % | 37 % | 0,98 (Dauerrempler) | 164,4 |

## Ergebnis je Spiel

- **sockenregen:** besteht
- **pudding-gerangel:** besteht
- **wackelturm:** besteht
  - Ausnahme maxNoviceWins: Schon EXP-007 maß für die gewählte Fassung A6 eine Außenseiter-Quote über fair (31 % bei 4 Spielern); Ruben hat Wackelturm in M3 abgenommen. Ob die Bots (Geschick = Tempo und Lenkung, kaum Gefühl für die Kippgrenze) oder das Spiel die Ursache sind, klärt CHAOS-215.
  - Ausnahme minProWins: Gegenstück zur Neuling-Quote: Der Profi-Bot stapelt schneller und verliert dadurch öfter den Turm. Bis CHAOS-215 geklärt hat, ob Bot oder Spiel, gilt die Ausnahme wie in EXP-007.
- **kuckucks-klatsche:** besteht
- **kruemel-kehraus:** besteht

## Eindringling-Test je Strategie

3 Spieler, Strategie gegen zwei normale Bots, Platz reihum. Siegfaktor = Siegquote × 3 (1,00 = fair).

| Spiel | Strategie | Siegfaktor |
| --- | --- | --- |
| sockenregen | Dauerdrücken (Hechtsprung) | 0,35 |
| pudding-gerangel | Dauerrempler | 0,35 |
| wackelturm | Raufbold (rempelt immer) | 0,40 |
| wackelturm | gierig (7–10 Törtchen) | 1,28 |
| wackelturm | vorsichtig (2–4 Törtchen) | 0,10 |
| kuckucks-klatsche | Dauerklatscher | 0,47 |
| kuckucks-klatsche | Raffzahn (klaut alles) | 1,12 |
| kuckucks-klatsche | brav (klaut nie) | 0,99 |
| kruemel-kehraus | Dauerrempler | 0,98 |
| kruemel-kehraus | Torsteher | 0,03 |
| kruemel-kehraus | Raufbold (jagt die Führung) | 0,02 |

## Vielfalts-Steckbriefe

| Spiel | kernverb | ziel | arena | kamera | bedienung | spielform | tempo | ähnlichstes Spiel | Abstand |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sockenregen | fangen | sammeln | rund | schraeg-fest | SA | FFA | hektisch | kruemel-kehraus | 3 / 7 |
| pudding-gerangel | rempeln | halten | insel-mit-kante | schraeg-fest | SA | FFA | wechselnd | sockenregen | 4 / 7 |
| wackelturm | stapeln | abliefern | rund | schraeg-fest | SAB | FFA | wechselnd | sockenregen | 4 / 7 |
| kuckucks-klatsche | reagieren | treffen | wand | frontal | A | FFA | wechselnd | pudding-gerangel | 5 / 7 |
| kruemel-kehraus | schieben | einlochen | rechteckig | schraeg-fest | SA | FFA | hektisch | sockenregen | 3 / 7 |
