# Gerätecheckliste M1 (echte iPhones, iPad und PC)

**Stand:** 2026-11-14 · **Aufgabe:** CHAOS-15 · **Gate:** CHAOS-16 (M1-Abnahme, nur Ruben)

Diese Liste prüft, was Browser-Automatisierung **nicht** beweisen kann: echtes iOS-/iPadOS-Safari, Multitouch, WLAN, Firewall, Sperrbildschirm und gefühlte Latenz. Alle automatischen Tests laufen in Chromium mit Geräte-Emulation und synthetischen Touch-Ereignissen. Sie sind ein Hinweis, kein Beleg.

**Regeln**
- Ausfüllen nur durch Ruben (oder wer die Geräte in der Hand hat). Claude trägt hier keine Ergebnisse ein, die nicht gemeldet wurden.
- Ergebnis je Punkt: `ok` · `fehlerhaft` (mit Beschreibung) · `nicht unterstützt` (Gerät/Browser kann es nicht) · `nicht geprüft`.
- Nachweis: Foto, Bildschirmaufnahme, kurze Notiz oder Terminal-Ausgabe. Dateien gern nach `docs/acceptance/m1-nachweise/` legen oder in Zunder an CHAOS-16 hängen.
- Spalte „Annahme“ verweist auf [`assumptions.md`](assumptions.md). Ergebnisse dort mit Datum nachtragen.
- Ablauf zum Starten: [M1-Demo-Anleitung](m1-demo.md). Netzwerkprobleme: [network-setup.md](network-setup.md).

## 1. Testumgebung

| Feld | Eintrag |
|---|---|
| Datum | |
| Commit / Branch | |
| PC: Betriebssystem, CPU/GPU | |
| PC: Browser + Version (Host) | |
| PC: Netz (WLAN oder Kabel), Router/Mesh-Modell | |
| WLAN-Art (Heimnetz, Mesh, Gästenetz, Hotspot) | |
| Firewall-Abfrage beim ersten Start erschienen? (Windows/macOS) | |

| Gerät | Modell | iOS/iPadOS-Version | Browser + Version | Rolle |
|---|---|---|---|---|
| iPhone 1 | | | Safari | Spieler (1 Platz) |
| iPhone 2 | | | Safari | Spieler (1 Platz) |
| iPad | | | Safari | geteilt (2 Plätze, optional 3–4) |
| weitere (optional) | | | z. B. Chrome iOS | |

## 2. Start und Beitritt

| ID | Annahme | Schritt | Erwartung | Ergebnis | Nachweis |
|---|---|---|---|---|---|
| J1 | B3 | `pnpm build && pnpm start` im Terminal | Terminal zeigt Link `http://<LAN-IP>:8787/?code=XXXX`, Begründung der Adresswahl, QR-Code; IP passt zum WLAN (z. B. `192.168.…`) | | |
| J2 | C5 | Am PC `http://localhost:8787/host/` öffnen | Arena, Lobby mit QR-Code, großem Join-Code, Link; Badge „Server: verbunden“ | | |
| J3 | B1, B2, B4 | iPhone 1: QR mit der **Kamera-App** scannen, Link öffnen | Controller öffnet sich ohne Fehlermeldung, Lobby-Bildschirm in Spielerfarbe mit Symbol | | |
| J4 | B2 | Falls J3 scheitert: Firewall-Abfrage/Freigabe nach [network-setup.md](network-setup.md#firewall) | nach Freigabe klappt J3; notieren, welcher Schritt nötig war | | |
| J5 | – | iPhone 2: QR scannen | zweiter, **anderer** Slot (andere Farbe/Symbol); Host-Lobby zeigt 2 Spieler | | |
| J6 | – | Code von Hand eingeben: Seite `http://<LAN-IP>:8787/` ohne `?code=` öffnen | Code-Eingabe erscheint, groß und gut tippbar; nach 4 Zeichen Beitritt | | |
| J7 | E5 | Auf beiden iPhones „Bereit!“ tippen | Host zeigt beide als „bereit“; Controller wechseln in Warteansicht | | |
| J8 | – | Am PC „Los geht’s!“ | beide Controller zeigen Joystick + A/B; Lobby verschwindet am Host | | |

## 3. Zwei iPhones gleichzeitig

| ID | Annahme | Schritt | Erwartung | Ergebnis | Nachweis |
|---|---|---|---|---|---|
| P1 | – | Beide Personen bewegen gleichzeitig ihren Joystick in verschiedene Richtungen | jede Figur folgt **nur** ihrem iPhone; Richtung stimmt (Joystick hoch = Figur vom Betrachter weg) | | |
| P2 | – | Taste A (Schubser) auf beiden, auch gleichzeitig, Figuren gegeneinander | Figuren stoßen sich sichtbar, Physik wirkt plausibel | | |
| P3 | B6 | Gefühlte Latenz: schnelle Richtungswechsel, Antippen | Bewertung 1 (unspielbar) – 5 (wie Konsole): ___ ; optional Zeitlupenvideo (240 fps): Bilder zwischen Fingerbewegung und Figurbewegung zählen → ___ ms | | |
| P4 | E5 | Lesbarkeit: Wer bin ich? Was kann ich drücken? | Spielerfarbe/-symbol und Knöpfe ohne Erklärung verständlich; Knöpfe groß genug | | |
| P5 | A4 | Hämmern auf A/B, Doppeltipp, Zwei-Finger-Zoom, langes Halten, über den Rand ziehen | kein Zoom, kein Scrollen, keine Textauswahl, keine Lupe, kein Kontextmenü | | |
| P6 | A5 | Vom linken Rand nach rechts wischen; oben nach unten ziehen | keine Zurück-Navigation, kein Neuladen – oder: Seite kommt nach Reload sofort wieder in denselben Slot (R3) | | |
| P7 | A6 | iPhone mitten im Spiel zwischen Hoch- und Querformat drehen, auch während der Joystick gehalten wird | Layout passt sich an, nichts „klemmt“ (Figur läuft nicht weiter, wenn losgelassen) | | |
| P8 | A7 | Ältestes verfügbares iPhone mitspielen lassen | Controller reagiert flüssig | | |
| P9 | C2 | Host-Bildrate am PC (subjektiv; optional Chrome-DevTools → Rendering → FPS-Anzeige) | flüssig mit 2 (und testweise 4) Figuren: ___ fps | | |

## 4. Geteiltes iPad (2 Zonen)

Beitritt: In der Host-Lobby den Link für das iPad verwenden (siehe [M1-Demo-Anleitung](m1-demo.md#5-ipad-als-geteilter-controller-2-spieler)) oder auf dem iPad `http://<LAN-IP>:8787/?code=XXXX&seats=2` öffnen, alternativ ohne Code öffnen und „2 Spieler · iPad“ wählen.

| ID | Annahme | Schritt | Erwartung | Ergebnis | Nachweis |
|---|---|---|---|---|---|
| I1 | A9 | iPad tritt mit 2 Plätzen bei | zwei Zonen in zwei Spielerfarben; Host zeigt zwei neue Spieler | | |
| I2 | A1 | Zwei Personen bedienen **gleichzeitig** je ihren Joystick | beide Figuren bewegen sich unabhängig, kein Übersprechen | | |
| I3 | A1 | Person 1 hält den Joystick, Person 2 hämmert auf A | Joystick von Person 1 bleibt stabil, Schubser von Person 2 kommt jedes Mal an | | |
| I4 | A1 | Finger über die Zonengrenze ziehen | Finger bleibt „seiner“ Zone zugeordnet, steuert nicht die andere Figur | | |
| I5 | A6 | iPad mitten im Spiel drehen (Hoch ↔ Quer) | Zonen ordnen sich neu (hoch: obere Zone um 180° gedreht); gehaltene Eingaben werden sauber beendet | | |
| I6 | A3 | Mit 4–5 Fingern gleichzeitig spielen, vom Rand wischen | Systemgesten (Home, App-Wechsler, Kontrollzentrum) stören? Notieren, was passiert; Gegenmittel „Geführter Zugriff“ testen (siehe [ipad-zonen.md](ipad-zonen.md)) | | |
| I7 | E4 | Platz und Haltung: Sitzen zwei Personen bequem am iPad, sehen sie dabei den PC-Bildschirm? | Bewertung + Notiz | | |
| I8 | A9 | Gemischt: iPad (2 Plätze) + 1 iPhone = 3 Spieler | alle drei Figuren unabhängig steuerbar | | |
| I9 | A2 | Optional: iPad mit `seats=4`, vier Personen | wie viele gleichzeitige Finger kommen an? Wird es zu eng? | | |

## 5. Verbindung, Abbruch, Wiederverbindung

| ID | Annahme | Schritt | Erwartung | Ergebnis | Nachweis |
|---|---|---|---|---|---|
| R1 | B7 | iPhone sperren, 10 s warten, entsperren | Controller zeigt kurz „Verbindung verloren …“ und verbindet sich automatisch; **gleicher** Slot/gleiche Farbe; Host zeigt dazwischen „getrennt“ | | |
| R2 | B7 | Zu einer anderen App wechseln, nach 30 s zurück | wie R1 | | |
| R3 | A5, B7 | Controller-Seite neu laden | kommt in denselben Slot zurück | | |
| R4 | B7 | WLAN am iPhone 5 s aus- und wieder einschalten | automatische Wiederverbindung, gleicher Slot | | |
| R5 | – | Flugmodus am iPhone ≥ 20 s | Host markiert den Spieler deutlich als getrennt; nach Rückkehr wieder verbunden | | |
| R6 | – | Host-Tab am PC neu laden | Lobby/Spielstand (Phase, Spieler) erscheint wieder, Controller bleiben verbunden | | |
| R7 | B1 | Mesh/Repeater: mit dem iPhone durch die Wohnung gehen (falls vorhanden) | Verbindung hält oder kommt automatisch zurück | | |
| R8 | B7 | Gerät ≥ 2 min im Sperrbildschirm lassen | nach Entsperren: Wiederverbindung oder klare Meldung, wie man wieder beitritt | | |

## 6. Nicht unterstützte Kombinationen

Hier jede Gerät-/Browser-Kombination eintragen, die nicht funktioniert hat (z. B. sehr altes iOS, In-App-Browser von Messenger-Apps nach Link-Klick, Gäste-WLAN).

| Gerät / Browser / Netz | Was passiert | Workaround |
|---|---|---|
| | | |

## 7. Gesamturteil (für CHAOS-16)

| Frage | Antwort |
|---|---|
| Join funktioniert zuverlässig? | |
| Gleichzeitige Eingaben (2 iPhones, iPad mit 2 Zonen) unabhängig? | |
| Controls lesbar und ohne Erklärung verständlich? | |
| Verbindung stabil, Wiederverbindung brauchbar? | |
| Reaktionszeit tolerierbar? | |
| Entscheidung | APPROVED / CHANGES REQUESTED / BLOCKED |
