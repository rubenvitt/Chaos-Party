# M3-Demo: Minispiele und Figuren ausprobieren

**Stand:** 2026-11-15 · **Aufgabe:** CHAOS-3 · **Abnahme:** CHAOS-35 · **Checkliste:** [device-test-checklist.md → Abschnitt 9](device-test-checklist.md#9-m3--minispiele-am-controller-für-chaos-35)

Einrichten, Beitreten und Netzwerk wie in M1/M2: [m1-demo.md](m1-demo.md), [m2-demo.md](m2-demo.md), [network-setup.md](network-setup.md). Diese Seite beschreibt, was in M3 neu ist.

## Starten

```bash
pnpm install
pnpm build
ROUNDS=3 pnpm start          # 3 Runden = 3 Minispiele (jedes einmal, Reihenfolge per Seed)
```

Am PC `http://localhost:8787/host/` öffnen, **einmal in die Seite klicken** (Browser erlauben Ton erst nach einer Geste; der Klick auf „Los geht’s!“ zählt auch). Handys treten per QR-Code bei, „Bereit!“, „Los geht’s!“.

| Host-URL | Wozu |
|---|---|
| `/host/` | normale Partie: Lobby → Brett → nach jeder Runde ein Minispiel |
| `/host/?mute=1` bzw. `?volume=40` | Ton aus bzw. leiser (0–100, Standard 70) |
| `/host/?local=1&minigame=<id>&players=4` | ein Minispiel ohne Server mit der Tastatur |
| `/host/?local=1&minigame=<id>&flow=1` | dasselbe mit Anleitung → Spiel → Ergebnis |

Tastatur in der Vorschau: Blau WASD + Leertaste (A) + E (B), Orange Pfeiltasten + Enter (A) + Shift rechts (B). IDs: `sockenregen`, `pudding-gerangel`, `wackelturm`, seit CHAOS-54 auch `kuckucks-klatsche` (dann `ROUNDS=4` für jedes Minispiel einmal).

## Was neu ist

- **Vier Figuren** statt Spielsteinen (rein kosmetisch, Slot n → Figur n): Schraubi (Aufzieh-Roboter), Kalle Kaktus, Wusel (Waschbär), Socke Sigi. Slot-Farbe als Halstuch/Sockel, Slot-Symbol (● ▲ ■ ★) als Abzeichen. In der Lobby mit Porträt.
- **Nach jeder Runde ein echtes Minispiel** (7 s Anleitung am PC und Controller, dann Spiel, 6 s Ergebnis mit Plätzen, Punkten, Münzen 10/5/3/0, Gleichstand = gleiche Münzen):

| Minispiel | Kategorie | Bedienung | Ziel |
|---|---|---|---|
| **Sockenregen** (30 s) | Arcade | Joystick laufen, A Hechtsprung | Socken unter den Landeschatten fangen (Gold = 3). Roter Kreis = Bügeleisen → geplättet, eine Socke weg. Letzte 8 s Schleudergang. |
| **Pudding-Gerangel** (30 s) | Physik | Joystick laufen, A rempeln | Auf dem Kirschfleck stehen (Punkte je Sekunde). Der Pudding kippt zur Menge, ein Rührlöffel kreist, wer führt, trägt die Wackelkrone und fliegt leichter. Runtergefallen? Nach 1,5 s wieder da. |
| **Wackelturm** (35 s) | Hybrid | Joystick laufen, A greifen, B rempeln | Törtchen auf den Kopf stapeln und ins eigene Eck-Nest tragen. Ab 6 Stück doppelt, aber der Turm wackelt. Mit leeren Händen B: fremden Turm klauen. |
| **Kuckucks-Klatsche** (30 s, nach M4: CHAOS-54) | Arcade | nur A klatschen | Jede Person hat eine Tür im Kuckuckshaus. Kuckuck raus → schnell A (2 Punkte). Nach dem Gong (weißer Ring) darf jeder klauen (1 Punkt). Ente, Socke, Blume: Finger weg (−1). Ins Leere klatschen macht 1 s benommen. Letzte 8 s Mitternacht. |

- **Ton und Effekte:** prozedural erzeugt (keine Dateien), am Brett (Würfel, Münzen, Klau, Falle, Trophäe …) und in den Minispielen.
- **Controller:** zeigt die Anleitung, im Spiel beschriftete Knöpfe (nur die nötigen), danach den eigenen Platz.

## Bekannte Grenzen in M3

- Lädt man den PC-Tab mitten im Minispiel neu, startet es mit der Restzeit neu (unter 3 s Rest: abgebrochen, keine Münzen).
- Die Figurenwahl kommt erst in M4 (CHAOS-36); bis dahin fest je Slot.
- Nach dem Endstand weiter kein Weg zurück in die Lobby (Server neu starten).
- Alle Balance-Werte der Minispiele stammen aus Bot-Simulationen (EXP-005 … EXP-007). Ob sie Spaß machen und fair wirken, zeigt nur der Test mit Menschen.
- iPad-Zonen nur im Browser-Test geprüft (iPad-Nachtest CHAOS-47 folgt vor M4).
