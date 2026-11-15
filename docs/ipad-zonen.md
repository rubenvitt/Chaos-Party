# Geteiltes iPad: Zonen, Layout und Grenzen

Ein iPad bedient 2–4 Personen gleichzeitig: **eine** WebSocket-Verbindung, je Person ein Slot und eine Spielerzone. Entscheidung und Begründung: [ADR-008](decisions/ADR-008-ipad-zonen.md) (CHAOS-13). Code: `apps/controller/src/zones/` (Geometrie, Tracker, Router), `apps/controller/src/ui/ZoneBoard.tsx`.

## Starten

| Link | Wirkung |
|---|---|
| `http://<pc>:8787/?code=ABCD&seats=2` | iPad mit 2 Zonen |
| `…&seats=3`, `…&seats=4` | 3 bzw. 4 Zonen (2×2) |
| `…&mode=ipad` | wie `seats=2` |
| ohne `seats` | iPhone-Modus (1 Platz); die Code-Eingabe bietet „2 Spieler · iPad“ an |

Der QR-Code des Hosts zeigt heute den iPhone-Link; am iPad in der Code-Eingabe „iPad“ wählen oder `&seats=2` anhängen.

## Layout

Zahlen für iPad Pro 11" (1194 × 834 CSS-px). `▲`-Zonen sind um 180° gedreht: ihr Inhalt zeigt zur Person an der oberen Kante. Zwischen den Zonen liegt ein toter Streifen von 16 px (dunkle Linie); Berührungen dort gehören niemandem.

### 2 Zonen, Querformat – nebeneinander an der langen Kante

```
┌───────────────────────┬─┬───────────────────────┐
│       ● Blau          │ │       ▲ Orange        │
│              (B)      │ │              (B)      │
│        (A)            │ │        (A)            │
│  ┌─────────────────┐  │ │  ┌─────────────────┐  │
│  │   Joystick-     │  │ │  │   Joystick-     │  │
│  │   Feld (O)      │  │ │  │   Feld (O)      │  │
│  └─────────────────┘  │ │  └─────────────────┘  │
└───────────────────────┴─┴───────────────────────┘
        Person 1                   Person 2
```

### 2 Zonen, Hochformat – gegenüber

```
            Person 2 (sitzt oben, schaut nach unten)
┌───────────────────────────────────────┐
│  (B)         ┌─────────────────┐      │   ← Inhalt um 180° gedreht
│        (A)   │ Joystick-Feld   │      │
│              └─────────────────┘      │
│              ▲ Orange (kopfüber)      │
├───────────────────────────────────────┤ ← Randstreifen
│              ● Blau                   │
│  ┌─────────────────┐            (B)   │
│  │ Joystick-Feld   │       (A)        │
│  └─────────────────┘                  │
└───────────────────────────────────────┘
            Person 1 (sitzt unten)
```

### 3–4 Zonen – 2×2 um den Tisch, im Uhrzeigersinn

```
            Person 4            Person 3
┌──────────────────────┬─┬──────────────────────┐
│  4 ★ Rosa  (180°)    │ │  3 ■ Grün  (180°)    │
│  (bei 3 Plätzen frei)│ │                      │
├──────────────────────┼─┼──────────────────────┤
│  1 ● Blau            │ │  2 ▲ Orange          │
│  Joystick | A B      │ │  Joystick | A B      │
└──────────────────────┴─┴──────────────────────┘
            Person 1            Person 2
```

Breite Zonen (Seitenverhältnis ≥ 1,15) bekommen die Gamepad-Anordnung (Joystick links, Knöpfe rechts), hohe Zonen die iPhone-Hochkant-Anordnung (Knöpfe oben, Joystick unten). Belege: `docs/screenshots/m1-ipad-2-zonen.png` (quer), `m1-ipad-2-zonen-hoch.png`, `m1-ipad-4-zonen.png`.

### Größen (unit-getestet)

| | iPad Pro 11" quer | iPad mini quer | kleinstes geprüftes (656 × 944) |
|---|---|---|---|
| Zone bei 2 Plätzen | 589 × 834 | 558 × 744 | 656 × 464 (hoch) |
| Zone bei 4 Plätzen | 589 × 409 | 558 × 364 | 320 × 464 (hoch) |
| Knopf A / B | 88–140 / ≥ 76 px | ≥ 88 / ≥ 76 px | 88 / 76 px |
| Abstand zum Zonenrand | ≥ 20 px | ≥ 20 px | ≥ 20 px |

Bei 4 Zonen auf kleinen iPads liegen die Knöpfe an der Untergrenze; die Joystick-Fläche bleibt mindestens so groß wie der Ring (Radius 56–85 px).

## Regeln für Berührungen (Kurzfassung)

- Ein Finger gehört der Zone und dem Element, auf dem er **aufsetzt**, bis er abhebt oder abgebrochen wird – auch über die Zonengrenze hinweg.
- Pro Zone folgt der Joystick nur dem ersten Finger; weitere Finger dürfen A/B drücken.
- Abbruch (Systemgeste, App-Wechsel, Fokusverlust): Joystick `{0, 0}`, Knöpfe `release`.
- Drehen: Zonen werden neu angeordnet; gehaltene Eingaben werden losgelassen, die Finger sind bis zum Abheben wirkungslos.

### Brettphase (M2, CHAOS-22)

- In der Brettphase zeigt jede Zone kompakt den eigenen Stand (Statuszeile), den Titel der offenen Entscheidung, bei Reaktionen einen Countdown-Balken und die Wahlknöpfe (Hauptknöpfe höchstens 180 px hoch, Zusatzzeile für Items 64 px).
- Wahlknöpfe sind Bedienelemente im Zonen-Tracker mit der Kennung `choice:<promptId>:<option>`. Darstellung und Trefferprüfung nutzen dieselben Rechtecke.
- **Gewählt wird beim Abheben** auf dem eigenen Knopf (wie „Bereit!“). Wer vom Knopf rutscht oder abbricht, wählt nichts. Ein Finger aus Zone 1 kann nie Knöpfe in Zone 2 auslösen.
- **Reaktionsknöpfe wählen schon beim Aufsetzen** (jede Zehntelsekunde zählt).
- Nach dem Senden sind die Knöpfe gesperrt („Gesendet …“). Liegt ein Finger auf einem Knopf, während ein neuer Prompt kommt, bleibt er bis zum Abheben wirkungslos; durch die Prompt-ID in der Kennung löst er keine gleichnamige Option des nächsten Prompts aus.

## Technische Grenzen und Empfehlungen

- **Gleichzeitige Finger:** iPadOS meldet Berichten zufolge bis etwa 11 gleichzeitige Touches. Bei 4 Personen mit je 2 Fingern sind es 8 – theoretisch im Rahmen, aber **ungeprüft** (A2). Der Tracker selbst hat keine Grenze (Unit-Test mit 8 Fingern).
- **Systemgesten (A3):** Mehrfingergesten (4–5 Finger zusammenziehen → Home, seitlich wischen → App-Wechsel) können bei 3–4 Personen versehentlich auslösen; iPadOS schickt dann `touchcancel` und der Controller lässt los. Empfehlung für Spielrunden: **Geführter Zugriff** (Einstellungen → Bedienungshilfen → Geführter Zugriff; startet mit dreimal Seitentaste) oder *Einstellungen → Multitasking & Gesten* → Gesten mit mehreren Fingern ausschalten. Wischen vom Rand (Kontrollzentrum, Mitteilungen, Dock) bleibt möglich; deshalb liegen Bedienelemente ≥ 20 px vom Zonenrand und Plaketten nicht an Bildschirmkanten.
- **Safari-Leisten:** Im Browser-Tab ist die Fläche kleiner als der Bildschirm; „Zum Home-Bildschirm“ (Vollbild) gibt mehr Platz. Kein Secure Context nötig.
- **Drehsperre:** Per Web-API auf iOS nicht möglich (A6); am besten die Ausrichtung im Kontrollzentrum sperren, bevor gespielt wird.
- **Platz am Tisch (E4):** 4 Personen um ein 11"-iPad ist eng; flach auf den Tisch legen, Personen an allen vier Kanten (2×2) bzw. an zwei gegenüberliegenden Kanten (2 Zonen hoch) oder nebeneinander (2 Zonen quer). Die gedrehten Zonen sind für Personen an der oberen Kante gedacht.
- **Kein Maus-Fallback:** Der iPad-Modus liest nur Touch Events.

## Was nur ein echtes iPad zeigt (für die Gerätecheckliste)

Für die Brettphase siehe zusätzlich [device-test-checklist.md → Abschnitt 8](device-test-checklist.md#8-m2--brettspiel-für-chaos-25) (B6, B7).

1. Zwei Personen bedienen gleichzeitig Joystick und Knöpfe in beiden Zonen, ohne Übersprechen (A1).
2. Ein Finger rutscht über die Zonengrenze: Seine Figur läuft weiter, die andere Zone reagiert nicht.
3. Ein Finger hebt ab, während der andere weiterzieht: Bewegung bleibt flüssig.
4. 3–4 Personen mit je 2 Fingern: Anzahl gleichzeitig gemeldeter Touches notieren; ob iPadOS Touches „stiehlt“ (A2).
5. 4–5-Finger-Gesten und Wischen vom Rand: mit und ohne Geführten Zugriff (A3); nach dem Abbruch keine hängenden Knöpfe/Figuren.
6. Drehen mitten im Spiel: Figuren bleiben stehen, Zonen ordnen sich neu, danach normal weiter (A6).
7. Lesbarkeit von Plakette und Knöpfen aus jeder Sitzposition; Hände kommen sich nicht in die Quere (E4).
8. Gemischte Aufstellung: iPad mit 2 Zonen + iPhone(s) in derselben Runde (A9).

Die Playwright-Tests (`tests/e2e/ipad-zonen.spec.ts`) erzeugen Mehrfinger-Ereignisse in **Chromium** per CDP. Sie prüfen Logik, Layout und Nachrichten, aber nicht, wie iPadOS-Safari Finger meldet.
