# M2-Demo: das Brettspiel ausprobieren

**Stand:** 2026-11-15 · **Aufgabe:** CHAOS-2 · **Abnahme:** CHAOS-25 · **Checkliste:** [device-test-checklist.md → Abschnitt 8](device-test-checklist.md#8-m2--brettspiel-für-chaos-25)

Einrichten, Starten, Beitreten und Netzwerkprobleme sind wie in M1: [m1-demo.md](m1-demo.md) und [network-setup.md](network-setup.md). Diese Seite beschreibt nur, was in M2 neu ist.

## Starten

```bash
pnpm install
pnpm build
pnpm start                       # Standard: 5 Runden, zufälliger Seed
ROUNDS=3 pnpm start              # kürzere Partie
SEED=2026 ROUNDS=3 pnpm start    # reproduzierbar: gleiche Würfe, gleiche Ereignisse
```

Beim Spielstart schreibt das Terminal `Brettspiel gestartet: … Seed <Zahl>`. Mit `SEED=<Zahl>` lässt sich eine Partie mit denselben Würfen nachspielen. Die Spieler müssen dabei dasselbe wählen.

Am PC `http://localhost:8787/host/` öffnen; Handys und iPad treten wie in M1 über den QR-Code bei. Mit „Los geht’s!“ startet das **Brettspiel**.

| Host-URL | Was passiert |
|---|---|
| `/host/` | Lobby → Brettspiel (Standard) |
| `/host/?rounds=2` | Brettspiel mit 2 Runden (überschreibt `ROUNDS`) |
| `/host/?arena=1` | M1-Arena statt Brettspiel (Joystick, Schubsen; Testbett für Latenz mit `&debug=1`) |
| `/host/?local=1&board=1` | Brett ohne Server mit festem Beispielstand (Optik prüfen) |
| `/host/?local=1&board=1&demo=1` | dasselbe mit einer kurzen, sich wiederholenden Ereignisfolge |

## So läuft eine Runde

1. **Zug beginnt:** Am PC erscheint „Blau ist dran!“. Nur Blaus Controller zeigt Knöpfe, die anderen sehen „Blau ist dran – schau auf den großen Bildschirm!“ und ihren Stand (Münzen, Trophäen, Items, Runde).
2. **Würfeln:** „Würfeln!“ tippen. Vor dem Wurf darf man **ein** Item einsetzen:
   - **Doppelwürfel:** Es wird mit zwei Würfeln gewürfelt.
   - **Münzklau:** Ziel wählen. Das Ziel hat ein kurzes **Reaktionsfenster** (3 s) mit Countdown: „Schild!“ (falls vorhanden) blockt den Klau, „Festhalten!“ halbiert ihn. Wer nichts tut, verliert den vollen Betrag (5 Münzen, ab Runde 6 eine mehr je 5 Runden, EXP-018).
   - **Falle:** Liegt danach auf dem eigenen Feld. Wer anderes darüberläuft oder darauf landet, zahlt an dich (4 Münzen).

   Jeder startet mit **einem zufälligen Item**; weitere gibt es auf Geschenkfeldern (höchstens 3).
3. **Laufen:** Die Figur hüpft Feld für Feld. An einer **Verzweigung** fragt der Controller nach dem Weg (Wegweiser am Brett: Klippenweg/Sumpfabkürzung, Pilzpfad/Wackelbrücke).
4. **Trophäe:** Drei Felder tragen gleichzeitig einen goldenen Pokal. Läufst du über eines und hast mindestens 15 Münzen, kannst du die Trophäe kaufen. Danach wandert dieser Pokal zu einem anderen Trophäenfeld.
5. **Feld:** Blau = Münzen +, Rot = Münzen −, Geschenk = Item, Lila = zufälliges Ereignis (Münzregen, Glücksfund, Windstoß, Platztausch, Pokal wandert).
6. Nach allen Zügen kommt der **Minispiel-Platzhalter** („kommt in M3“). Er verteilt per Zufall Münzen nach Platz.
7. Nach der letzten Runde zeigen PC und Controller den **Endstand**: Es gewinnt, wer die meisten Trophäen hat, bei Gleichstand entscheiden die Münzen.

**Verbindung weg?** Ein Spieler, der mitten im Zug die Verbindung verliert, hält die Partie nicht auf. Nach 15 s wählt das Spiel für ihn die Standardoption (würfeln, ersten Weg nehmen, nicht kaufen). Kommt er zurück, spielt er auf demselben Platz weiter.

## Bekannte Grenzen in M2

- Grafik ist vorläufig (prozedurale Formen, keine Charaktermodelle, kein Ton).
- Das Minispiel ist ein Platzhalter, echte Minispiele folgen in M3.
- Nach dem Endstand führt kein Weg zurück in die Lobby. Für eine neue Partie den Server neu starten (`Strg+C`, `pnpm start`).
- Wer erst nach dem Start beitritt, spielt nicht mit (Beitritt nur in der Lobby).
- 5 Runden dauern ohne echte Minispiele nur etwa 2–3 Minuten Brettzeit (EXP-001). Für einen längeren Test `ROUNDS=8 pnpm start` oder `/host/?rounds=8`.
- Alle Zahlen (Preise, Münzen, Items, Reaktionsfenster) stammen aus Simulationen ([experiments.md](experiments.md), EXP-001 bis EXP-004). Ob es Spaß macht, entscheidet erst der Test mit Menschen.
