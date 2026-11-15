# Gerätecheckliste (echte iPhones, iPad und PC): M1, ab Abschnitt 8 M2

**Stand:** 2026-11-14 · **Aufgabe:** CHAOS-15 · **Gate:** CHAOS-16 (M1-Abnahme, nur Ruben)

Diese Liste prüft, was Browser-Automatisierung **nicht** beweisen kann: echtes iOS-/iPadOS-Safari, Multitouch, WLAN, Firewall, Sperrbildschirm und gefühlte Latenz. Alle automatischen Tests laufen in Chromium mit Geräte-Emulation und synthetischen Touch-Ereignissen. Sie sind ein Hinweis, kein Beleg.

**Regeln**
- Ausfüllen nur durch Ruben (oder wer die Geräte in der Hand hat). Claude trägt hier keine Ergebnisse ein, die nicht gemeldet wurden.
- Ergebnis je Punkt: `ok` · `fehlerhaft` (mit Beschreibung) · `nicht unterstützt` (Gerät/Browser kann es nicht) · `nicht geprüft`.
- Nachweis: Foto, Bildschirmaufnahme, kurze Notiz oder Terminal-Ausgabe. Dateien gern nach `docs/acceptance/m1-nachweise/` legen oder in Zunder an CHAOS-16 hängen.
- Spalte „Annahme“ verweist auf [`assumptions.md`](assumptions.md). Ergebnisse dort mit Datum nachtragen.
- Ablauf zum Starten: [M1-Demo-Anleitung](m1-demo.md). Netzwerkprobleme: [network-setup.md](network-setup.md).
- Messwerte: `?debug=1` (Host) bzw. `&debug=1` (Controller) blendet eine Messanzeige mit „Kopieren“ ein ([ADR-010](decisions/ADR-010-messanzeige.md)). Es gibt bewusst keine Grenzwerte; die Werte dieser Liste sind die M1-Baseline.

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
| P3 | B6 | Gefühlte Latenz: schnelle Richtungswechsel, Antippen. Dazu Controller mit `&debug=1` öffnen (Link um `&debug=1` ergänzen) und nach 1 min Spielen „Kopieren“ bzw. die Zeile abschreiben | Bewertung 1 (unspielbar) – 5 (wie Konsole): ___ ; Rundlaufzeit Controller↔Server Median/p95: ___ / ___ ms; optional Zeitlupenvideo (240 fps): Bilder zwischen Fingerbewegung und Figurbewegung → ___ ms | | |
| P4 | E5 | Lesbarkeit: Wer bin ich? Was kann ich drücken? | Spielerfarbe/-symbol und Knöpfe ohne Erklärung verständlich; Knöpfe groß genug | | |
| P5 | A4 | Hämmern auf A/B, Doppeltipp, Zwei-Finger-Zoom, langes Halten, über den Rand ziehen | kein Zoom, kein Scrollen, keine Textauswahl, keine Lupe, kein Kontextmenü | | |
| P6 | A5 | Vom linken Rand nach rechts wischen; oben nach unten ziehen | keine Zurück-Navigation, kein Neuladen – oder: Seite kommt nach Reload sofort wieder in denselben Slot (R3) | | |
| P7 | A6 | iPhone mitten im Spiel zwischen Hoch- und Querformat drehen, auch während der Joystick gehalten wird | Layout passt sich an, nichts „klemmt“ (Figur läuft nicht weiter, wenn losgelassen) | | |
| P8 | A7 | Ältestes verfügbares iPhone mitspielen lassen | Controller reagiert flüssig | | |
| P9 | C2 | Host-Bildrate am PC: Host mit `http://localhost:8787/host/?debug=1` öffnen, 1 min mit 2 (testweise 4) Figuren spielen, Messzeile kopieren | fps: ___ ; Frame-Zeit Median/p95: ___ / ___ ms; Eingabe→Frame Median/p95: ___ / ___ ms; GPU/WebGL laut Anzeige: ___ | | |

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
| Entscheidung | **APPROVED** durch Ruben am 2026-11-15 („approved“); nur iPhone getestet, Einzelwerte nicht gemeldet |

## 8. M2 – Brettspiel (für CHAOS-25)

**Stand:** 2026-11-15 · **Aufgabe:** CHAOS-2 · **Gate:** CHAOS-25 (M2-Abnahme, nur Ruben) · Ablauf: [m2-demo.md](m2-demo.md)

Automatisch geprüft (Chromium-Emulation, synthetische Touches) sind alle Entscheidungen, die Sperre nach dem Senden, der Countdown, gleichzeitige Wahlen in zwei iPad-Zonen und eine komplette Runde mit Host und zwei iPhones gegen den echten Server. Diese Liste prüft, was nur echte Geräte und echte Menschen zeigen.

**iPad nach M3 verschoben (Ruben, 2026-11-15):** M2 wird nur mit iPhones getestet. B6/B7 und das geteilte iPad aus Abschnitt 4 (I1–I9, CHAOS-47) folgen nach dem M3-Gate; dort als „verschoben“ eintragen.

| ID | Schritt | Erwartung | Ergebnis | Nachweis |
|---|---|---|---|---|
| B1 | 2–4 Personen spielen eine Partie mit 3 Runden (`ROUNDS=3 pnpm start`) | Alle verstehen ohne Erklärung, wer dran ist und was zu tippen ist | | |
| B2 | Würfeln, Weg wählen, Trophäe kaufen auf dem iPhone | Knöpfe groß, sofort verständlich, keine versehentlichen Doppeltipps | | |
| B3 | Münzklau gegen eine Person: Reaktionsfenster | Countdown und pulsierender Knopf fallen auf; Reaktion per Daumen in der Zeit schaffbar; fühlt sich fair an | | |
| B4 | Vibration bei Reaktion | iOS-Safari unterstützt `navigator.vibrate` nicht: **keine** Vibration erwartet; prüfen, ob das stört | | |
| B5 | Lange Optionstexte (Wegweiser, Namen) auf kleinem iPhone hoch/quer | Lesbar, Silbentrennung sinnvoll, nichts abgeschnitten | | |
| B6 | Geteiltes iPad, 2 Zonen: zwei Personen wählen **gleichzeitig** (z. B. eine reagiert, eine wählt einen Weg) | Jede Wahl landet beim richtigen Spieler; Finger in Zone 1 löst nichts in Zone 2 aus | | |
| B7 | Geteiltes iPad, 4 Zonen: Brett-Knöpfe | Groß genug, lesbar aus jeder Sitzposition | | |
| B8 | iPhone mitten im eigenen Zug sperren, 20 s warten, entsperren | Spiel wählt nach ~15 s automatisch weiter; nach dem Entsperren gleicher Platz, aktueller Stand | | |
| B9 | Host-Tab neu laden mitten in der Partie | Brett, Stand und „am Zug“ erscheinen sofort wieder; Partie läuft weiter | | |
| B10 | Brett am Fernseher/Monitor aus Sofa-Abstand | Feldtypen, Figuren, Wegweiser, HUD und Meldungen lesbar | | |
| B11 | Tempo | Wartezeit bei fremden Zügen ok; Animationen nicht zu langsam/schnell; Reaktionsfenster bremst nicht | | |
| B12 | Sabotage | Klau/Falle überraschen und sind lustig statt frustrierend | | |

### Gesamturteil M2 (für CHAOS-25)

| Frage | Antwort |
|---|---|
| 2–4 Personen spielen wiederholt Züge ohne Verwirrung? | |
| Sabotage macht Spaß statt zu frustrieren? | |
| Reaktionsfenster bremsen die Runde nicht? | |
| Entscheidung | **APPROVED** durch Ruben am 2026-11-15 („approved“); nur iPhone getestet, Einzelwerte nicht gemeldet |

## 9. M3 – Minispiele am Controller (für CHAOS-35)

**Stand:** 2026-11-15 · **Aufgabe:** CHAOS-33 (Controller-Teil) · **Gate:** CHAOS-35 (M3-Abnahme, nur Ruben)

Automatisch geprüft (Chromium-Emulation, synthetische Touches, nachgebauter Server: `tests/e2e/controller-minispiel.spec.ts`): Intro mit Titel, Anleitung und Bedienlegende; Spiel-Layout mit beschrifteten Knöpfen, ausgeblendetem Joystick/B laut Steckbrief; Loslassen gehaltener Knöpfe und Joysticks beim Wechsel ins Ergebnis; Platz, Punkte und Abbruch; vier iPad-Zonen mit gleichzeitigen Fingern. Diese Liste prüft, was nur echte Geräte und echte Hände zeigen. Belegbilder der Emulation: `docs/screenshots/m3-controller-intro.png`, `m3-controller-spiel.png`, `m3-controller-ergebnis.png`, `m3-ipad-minispiel.png`.

| ID | Schritt | Erwartung | Ergebnis | Nachweis |
|---|---|---|---|---|
| G1 | Intro auf dem iPhone hoch und quer, Armlänge Abstand | Titel, Untertitel, Anleitung und Bedienlegende in wenigen Sekunden lesbar; nichts abgeschnitten, kein Scrollen nötig | | |
| G2 | Intro in iPad-Zonen (2 und 4 Zonen), aus jeder Sitzposition | Kompakte Anleitung in der eigenen Zone lesbar; gedrehte Zonen zeigen zur gegenübersitzenden Person | | |
| G3 | Bedienlegende vs. Spiel | Was die Legende zeigt (Joystick/A/B mit Verb), erscheint im Spiel genau so; fehlende Elemente fehlen auch im Spiel | | |
| G4 | Spiel mit Joystick + A (iPhone hoch und quer) | Daumen erreichen Joystick und Knopf ohne Umgreifen; Beschriftung im Knopf lesbar, auch während der Daumen darauf liegt | | |
| G5 | Spiel nur mit Knöpfen (z. B. Pump-Parade) | Großer Knopf mittig; schnelles Tippen (≥ 5/s) zählt jeden Tipper, kein Zoomen, Markieren oder Doppeltipp-Zoom | | |
| G6 | Geteiltes iPad, 2–4 Personen spielen ein Minispiel gleichzeitig mit mehreren Fingern | Jede Eingabe wirkt nur für die eigene Zone; Finger in der Nachbarzone stören nicht; kein Hängenbleiben eines Knopfes | | |
| G7 | Ende des Minispiels, während ein Daumen noch auf A bzw. dem Joystick liegt | Figur am PC bleibt sofort stehen bzw. lässt los; danach erscheint das Ergebnis, kein „klebender“ Knopf in der nächsten Phase | | |
| G8 | Ergebnis auf iPhone und in iPad-Zonen | Eigener Platz („Platz 1!“) groß und sofort klar, Punkte mit Einheit lesbar; Gleichstand (zwei Mal Platz 1) verständlich | | |
| G9 | Abbruch eines Minispiels auslösen (Weg laut Server-Doku, z. B. Host-Tab mitten im Spiel schließen) | Controller zeigt „Minispiel abgebrochen“, danach wieder die Brettanzeige | | |
| G10 | iPhone mitten im Minispiel sperren, 10 s warten, entsperren | Gehaltene Eingaben wurden beim Sperren losgelassen; nach dem Entsperren gleicher Platz und aktuelle Stage (Spiel oder schon Ergebnis) | | |
| G11 | App-Wechsel bzw. Kontrollzentrum während des Spiels (iPhone und iPad) | Keine hängenden Eingaben; zurück im Spiel funktionieren Joystick und Knöpfe sofort | | |
| G12 | Systemgesten am Rand während des Spiels (Home-Leiste, Mitteilungen) | Gesten vom Bildschirmrand lösen keine Spieleingabe aus; Spielelemente liegen weit genug vom Rand | | |
| G13 | Farbe und Symbol des Slots | In Intro, Spiel und Ergebnis jederzeit erkennbar, welcher Spieler man ist | | |
| G14 | „Bewegung reduzieren“ in iOS einschalten | Titel und Platz erscheinen ohne Hüpf-Animation; alles bleibt bedienbar | | |
| G15 | Rückmeldung | Keine Vibration auf iOS erwartet (Safari kann es nicht); Farbblitz bei Rückmeldung sichtbar, stört nicht | | |
| G16 | Gefühlte Eingabeverzögerung im Minispiel (`&debug=1` für Messwerte) | Knopfdruck → Reaktion am PC fühlt sich direkt an; Werte notieren | | |

### Gesamturteil Minispiel-Controller (für CHAOS-35)

| Frage | Antwort |
|---|---|
| Versteht man jedes Minispiel aus dem Intro am Controller ohne Erklärung? | |
| Bedienung im Spiel daumenfreundlich, ohne versehentliche Gesten? | |
| iPad-Zonen mit mehreren Fingern zuverlässig? | |
| Ergebnis sofort verständlich? | |
| Entscheidung | |

## 10. M3 – Minispiele, Figuren und Ton am PC (für CHAOS-35)

**Stand:** 2026-11-15 · **Aufgabe:** CHAOS-3 · **Gate:** CHAOS-35 (nur Ruben) · **Anleitung:** [m3-demo.md](m3-demo.md)

Automatisch geprüft: Lebenszyklus, Wertung und Aufräumen jedes Minispiels headless (`packages/minigames`), Brett ↔ Minispiel über den Server (`apps/server/src/boardGame.integration.test.ts`), Bild jedes Minispiels mit festem Seed (`tests/e2e/m3-minispiele-bild.spec.ts`), Bühne mit echten Seiten (`tests/e2e/m3-minispiel-durchstich.spec.ts`). Diese Liste prüft, was nur Menschen am echten PC/Fernseher beurteilen können. Mit 2–4 Personen, `ROUNDS=3 pnpm start` (jedes Minispiel einmal).

| ID | Schritt | Erwartung | Ergebnis | Nachweis |
|---|---|---|---|---|
| P1 | Lobby mit 4 Spielern | Figur-Porträts mit Namen, klar unterscheidbar; jeder findet „seine“ Figur | | |
| P2 | Brett mit Figuren (Fernseher, Sofa-Abstand) | Figuren erkennbar, laufen/jubeln/zucken passend; Sockel/Symbol zeigt den Slot | | |
| P3 | Anleitung jedes Minispiels (7 s) | Alle haben vor dem Start verstanden, was zu tun ist (ohne Erklärung von außen) | | |
| P4 | Sockenregen spielen | Socke, Goldsocke und Bügeleisen sofort unterscheidbar; Schleudergang spürbar; fühlt sich fair an | | |
| P5 | Pudding-Gerangel spielen | Kirschfleck als Ziel klar; Kippen/Rempeln/Löffel witzig statt frustrierend; Rückkehr nach Sturz klar | | |
| P6 | Wackelturm spielen | Wackeln früh sichtbar; Kippen nachvollziehbar (nicht „grundlos“); Klauen witzig statt gemein | | |
| P7 | Eigene Figur im Gedränge finden | In allen drei Minispielen jederzeit klar, wer man ist (Farbe + Symbol + Figur) | | |
| P8 | Ergebnisanzeige | Plätze, Punkte, Münzen und Gleichstand sofort klar; 6 s reichen zum Lesen | | |
| P9 | Ton (Lautsprecher/Fernseher) | Klänge passen, nerven nicht, nicht zu laut; `?volume=` / `?mute=1` wirken | | |
| P10 | Bildrate am PC während der Minispiele (`&debug=1`) | flüssig (Wert notieren, Rechner/Browser angeben) | | |
| P11 | Host-Tab mitten im Minispiel neu laden | Minispiel startet mit Restzeit neu, Partie läuft weiter | | |

### Gesamturteil M3 (für CHAOS-35)

| Frage | Antwort |
|---|---|
| Versteht man jedes Minispiel schnell? | |
| Sind die Ergebnisse klar unterscheidbar? | |
| Macht das Chaos Spaß und bleibt fair? | |
| Passen Figuren und Stil zur Produktrichtung? | |
| Lieblings- und schwächstes Minispiel, warum? | |
| Entscheidung (APPROVED / CHANGES REQUESTED / BLOCKED) | |

## 11. M4 – Performance (für CHAOS-43)

**Stand:** 2026-11-15 · **Aufgabe:** CHAOS-39 · **Gate:** CHAOS-43 (nur Ruben) · **Hintergrund:** [performance.md](performance.md)

Automatisch gemessen wird nur im Headless-Chromium mit Software-Rendering (SwiftShader, `pnpm perf`): Das taugt für Vorher/Nachher-Vergleiche, sagt aber **nichts** über Rubens PC, Fernseher oder iPhones. Diese Punkte liefern die echten Werte; daraus werden die Schwellen für echte Hardware (bis dahin: „offen, Messung durch Ruben“).

**So geht’s:** Host mit `http://localhost:8787/host/?debug=1` öffnen, Controller-Links um `&debug=1` ergänzen. Die Host-Anzeige (unten rechts) misst je Szene (`lobby`, `brett`, `minispiel:<id>`, Anleitung/Ergebnis als `minispiel:<id>:intro`/`:results`, `finale`, `podest`); „Alle Szenen kopieren“ legt eine Zeile je Szene in die Zwischenablage. Der Controller zeigt die Rundlaufzeit und kopiert sie je Szene (`lobby`, `brett`, `minispiel`, `endstand`). Kopierten Text bitte vollständig in die Spalte „Ergebnis“ oder als Datei nach `docs/acceptance/m4-nachweise/` legen.

| ID | Schritt | Erwartung / was notieren | Ergebnis | Nachweis |
|---|---|---|---|---|
| PF0 | Testumgebung: PC (Betriebssystem, CPU, GPU), Browser + Version, Monitor/Fernseher (Auflösung, Bildwiederholrate), Fenster/Vollbild, Netz (WLAN/Kabel) | vollständig ausgefüllt; die Host-Zeile nennt GPU und Render-Auflösung | | |
| PF1 | Ganze Partie mit 4 Spielern (`ROUNDS=3 pnpm start`, jedes Minispiel einmal), Host mit `?debug=1`; am Siegerbildschirm „Alle Szenen kopieren“ | Zeilen für `lobby`, `brett`, alle drei Minispiele, `finale`, `podest`; Text einfügen | | |
| PF2 | Bildrate je Szene aus PF1: fps und Bildabstand p95 je Szene | Werte notieren; gefühlt flüssig (1–5) je Szene; Ruckler wann? | | |
| PF3 | Eingabe→Frame im Minispiel und Brett→Frame auf dem Brett (aus PF1) | Median/p95 notieren (misst bis Ende des JS-Renderings, ohne GPU/Bildschirm, ADR-010) | | |
| PF4 | WebGL-Kontexte und Render-Schleifen (aus PF1) | `finale` und `podest`: „Kontexte max 2“, „Schleifen max 1“ (Brett pausiert hinter dem Finale); jede andere Szene 1 Kontext, 1 Schleife | | |
| PF5 | iPhone mit `&debug=1` eine ganze Partie spielen, am Endstand „Kopieren“ | RTT Median/p95 je Szene (`lobby`, `brett`, `minispiel`) notieren; Bewertung der gefühlten Reaktion 1–5 | | |
| PF6 | Geteiltes iPad mit `&seats=2&debug=1` (falls verfügbar), wie PF5 | RTT je Szene; Unterschied zum iPhone? | | |
| PF7 | Optional: Zeitlupenvideo (240 fps) von Daumen und Fernseher im Minispiel | Bilder zwischen Daumenbewegung und Figurbewegung → ms (Gesamtlatenz Finger → Bild, nicht automatisch messbar) | | |
| PF8 | Zweimal „Nochmal spielen“ (3 Partien hintereinander), danach in der Lobby „Alle Szenen kopieren“ | `Heap max` der Lobby nach Partie 3 ungefähr wie nach Partie 1 (nur Chrome/Edge zeigen den Heap); keine spürbare Verlangsamung | | |
| PF9 | Host-Tab mitten im Brett 30 s in den Hintergrund (anderer Tab/minimiert), dann zurück | „Pausen“ steigt um 1; Spiel läuft danach normal weiter, kein Nachruckeln | | |
| PF10 | Optional: schwächster verfügbarer Rechner (z. B. Laptop mit integrierter Grafik), wie PF1 | Werte wie PF2; ab welcher Szene wird es unflüssig? | | |

### Schwellen auf echter Hardware (offen, Messung durch Ruben)

| Kennzahl | Schwelle | Herkunft |
|---|---|---|
| Bildabstand p95 je Szene am Host-PC | offen | aus PF1/PF2; Vorschlag nach der Messung: Messwert von Rubens PC + 25 % als Regressionsgrenze |
| Eingabe→Frame p95 im Minispiel | offen | aus PF3 |
| RTT p95 Controller ↔ Server je Szene | offen | aus PF5/PF6 (M1-P3 wurde nicht gemeldet) |
| WebGL-Kontexte/Render-Schleifen je Szene | strukturell, schon gesetzt | `tests/perf/baseline.json`: Finale/Podest höchstens 2 Kontexte und 1 Schleife, sonst 1/1 |
