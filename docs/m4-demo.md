# M4-Demo: eine komplette Partie auf echten Geräten

**Stand:** 2026-11-15 · **Aufgabe:** CHAOS-41 · **Abnahme:** CHAOS-43 · **Checkliste:** [device-test-checklist.md → Abschnitt 12](device-test-checklist.md#12-m4--vollständiger-slice-für-chaos-43) (dazu Abschnitt 4 für den iPad-Nachtest CHAOS-47 und Abschnitt 11 für die Performance)

Netzwerk, Firewall und QR-Probleme wie bisher: [network-setup.md](network-setup.md), Grundlagen in [m1-demo.md](m1-demo.md). Diese Seite beschreibt den heutigen Stand einer ganzen Partie mit Figurenwahl, Rundenwahl, Pause, Finale und Revanche. Bekannte Probleme: [known-issues.md](known-issues.md).

## Starten

```bash
pnpm play                        # installiert und baut bei Bedarf, startet Port 8787, öffnet den Host
```

Ein Befehl für einen frischen PC (CHAOS-42, Details in der [README](../README.md)); `OPEN=0 pnpm play` öffnet keinen Browser, `pnpm play --rebuild` erzwingt den Neubau. Gleichwertig von Hand: `pnpm install && pnpm build && pnpm start`. Join-Code zufällig, Standard 10 Runden.

Optional (auch mit `pnpm play`): `ROUNDS=3 pnpm start` (andere Standard-Rundenzahl in der Lobby, 1–20), `SEED=2026 pnpm start` (reproduzierbare Würfe; das Terminal nennt beim Spielstart den Seed), `JOIN_CODE=ABCD pnpm start` (fester Code). Das Terminal zeigt den LAN-Link mit QR-Code.

Am PC `http://localhost:8787/host/` öffnen, am besten im Vollbild auf dem Fernseher, und **einmal in die Seite klicken** (Ton braucht eine Geste; der Klick auf „Los geht’s!“ zählt auch).

## Beitreten

- **iPhone:** In der Host-Lobby „iPhone“ wählen und den QR-Code mit der Kamera-App scannen. Ohne Kamera: `http://<LAN-IP>:8787/` öffnen und den großen Join-Code eintippen.
- **Geteiltes iPad:** In der Lobby auf „iPad“ umschalten (Link mit `&seats=2`) und den QR-Code mit dem iPad scannen. Für 3 oder 4 Personen am iPad die Zahl im Link anpassen (`&seats=3` bzw. `&seats=4`). Ohne Code geöffnet bietet die Code-Eingabe „2 Spieler · iPad“ an. Im Hochformat ist die obere Zone um 180° gedreht.
- Gemischt geht alles: z. B. zwei iPhones + iPad mit zwei Zonen = vier Spieler. Höchstens vier Spieler insgesamt.

## Lobby: Figur und Runden

- **Figurenwahl am Controller:** Jede Person tippt eine der vier Figuren (Schraubi, Kalle Kaktus, Wusel, Socke Sigi). Vergebene Figuren sind ausgegraut und zeigen die Farbe des Besitzers. Tippen zwei gleichzeitig dieselbe, gewinnt die erste; die andere sieht „Die Figur hat sich gerade jemand anderes geschnappt.“ Umwählen setzt „bereit“ zurück. Wer nicht wählt, bekommt beim Start eine freie Figur.
- **„Bereit!“** tippen. Der PC zeigt je Spieler Figur, Namen und „bereit ✓“.
- **Runden am PC:** 10 / 16 / 20 (mit geschätzter Dauer nach Spielerzahl; 10 Runden ≈ 15 Minuten). Die Wahl erscheint auch auf den Controllern. Mit Maus oder Tastatur (Tab + Enter).
- **„Los geht’s!“** am PC. Er leuchtet, sobald alle bereit sind; starten geht ab zwei Spielern auch vorher.

## Während der Partie

- **Brett:** Wer dran ist, bekommt die Knöpfe (Würfeln, Item, Weg, Trophäe kaufen); alle anderen sehen, wer dran ist. Bei Münzklau gegen dich erscheint kurz ein Reaktionsknopf.
- **Minispiel nach jeder Runde:** 7 s Anleitung am PC und Controller, dann Joystick und beschriftete Knöpfe, danach das eigene Ergebnis mit Münzen (10/5/3/0).
- **Pause am PC:** Knopf „Pause“ oben links, Taste **P** oder **Esc**. Alle Controller zeigen „Pause – Der PC hat angehalten.“, Countdowns und Minispiele stehen. „Weiter“ (oder Esc) setzt fort, „Partie beenden“ fragt nach und springt zum Finale („vorzeitig beendet“).
- **Neuladen/Sperrbildschirm am Controller:** Das Gerät kommt mit demselben Platz und derselben Figur zurück. Wer im eigenen Zug länger als ~15 s weg ist, für den wählt das Spiel automatisch.
- **Host-Tab neu laden:** Die Partie pausiert automatisch, bis der Host wieder verbunden ist und Brett bzw. Minispiel samt Figuren geladen hat (CHAOS-68), und läuft dann weiter (ein Minispiel mit der Restzeit vom Moment des Neuladens).

## Finale und Revanche

- Nach der letzten Runde: **Trophäenzählung** – vom letzten Platz an aufgedeckt, Trophäen und Münzen zählen hoch; bei Gleichstand bei den Trophäen entscheiden die Münzen, danach die Minispiel-Siege, sonst ist der Platz geteilt. „Überspringen ›“ springt zum Siegerbildschirm.
- **Siegerbildschirm:** 3D-Podest mit den gewählten Figuren, Endstand, Bonus-Titel. Jeder Controller zeigt den eigenen Platz, Trophäen, Münzen und Siege.
- **„Nochmal spielen“** (hat den Fokus, Enter genügt): alle zurück in die Lobby, Figuren und Rundenzahl bleiben, „Bereit!“ neu tippen.

| Host-URL | Wozu |
|---|---|
| `/host/` | normale Partie |
| `/host/?finale=fast` | Trophäenzählung vierfach schneller (ungeduldige Runden) |
| `/host/?finale=skip` | Trophäenzählung überspringen, sofort Siegerbildschirm |
| `/host/?mute=1` bzw. `?volume=40` | Ton aus bzw. leiser (0–100, Standard 70) |
| `/host/?rounds=3` | Rundenzahl beim Verbinden setzen (1–20, auch außerhalb der Vorschläge) |
| `/host/?debug=1` | Messanzeige (siehe unten) |

## Messen beim Gerätetest (`?debug=1`)

- **Host:** `http://localhost:8787/host/?debug=1`. Unten rechts fps, Bildabstand, Eingabe→Frame, WebGL-Kontexte und Render-Schleifen **je Szene** (`lobby`, `brett`, `minispiel:<id>`, `finale`, `podest`). Am Siegerbildschirm **„Alle Szenen kopieren“** – eine Zeile je Szene mit Grafikkarte, Auflösung und User-Agent in die Zwischenablage. Einfügen in Checkliste Abschnitt 11 (PF1).
- **Controller:** Join-Link um `&debug=1` ergänzen (iPad: `…&seats=2&debug=1`). Zeigt die Rundlaufzeit zum Server je Szene; „Kopieren“ am Endstand. Im LAN ohne HTTPS erscheint der Text markiert in einem Feld zum manuellen Kopieren.
- Hintergrund und Grenzen: [performance.md](performance.md), [ADR-010](decisions/ADR-010-messanzeige.md).

## Was automatisch geprüft ist – und was nicht

`tests/e2e/m4-gesamtablauf.spec.ts` spielt zwei komplette Partien mit echten Seiten gegen den echten Server, alle Eingaben über die Controller-UI (Details: [testing.md](testing.md#m4-gesamtablauf-chaos-41)). Das läuft in Chromium mit iPhone-/iPad-Emulation und beschleunigtem Test-Pacing. Echtes iOS-/iPadOS-Safari, Multitouch mit echten Fingern, WLAN, Ton, Lesbarkeit am Fernseher, die echte Partiedauer und vor allem Spaß zeigt nur der Durchgang nach Abschnitt 12 der Checkliste.

## Bekannte Grenzen (heutiger Stand)

- Alle Balance-Werte (Rundenzahl, Preise, Sabotage, Münzen) stammen aus Bot-Simulationen (EXP-001 … EXP-004, EXP-011 … EXP-013); die echte Partiedauer und ob 10 Runden der richtige Standard sind, misst erst der Playtest (Checkliste V2).
- Das geteilte iPad ist bisher nur in der Emulation geprüft (iPad-Nachtest CHAOS-47, Checkliste Abschnitt 4 und 12.3).
- Performance-Schwellen auf echter Hardware sind offen, bis Ruben misst (Checkliste Abschnitt 11).
