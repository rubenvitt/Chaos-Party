# Bekannte Probleme und Grenzen (Release Candidate M4)

**Stand:** 2026-11-15 · **Aufgabe:** CHAOS-42 · **Gate:** CHAOS-43 · **Quellen:** Abnahmeberichte [M1](acceptance/M1.md)–[M3](acceptance/M3.md), [ADR-014](decisions/ADR-014-vertical-slice.md) mit Nachträgen, [performance.md](performance.md), [experiments.md](experiments.md) (EXP-010 … EXP-012), [ipad-zonen.md](ipad-zonen.md), [security-license-review.md](security-license-review.md)

**Kurz: Es gibt keinen bekannten kritischen Fehler.** Eine Partie lässt sich von der Lobby bis zur Revanche ohne Neustart spielen. Das größte offene Risiko liegt nicht im Code, sondern in der fehlenden Prüfung mit echten Menschen und echten Geräten.

| Schweregrad | Anzahl | Bedeutung |
|---|---|---|
| kritisch | **0** | Partie bricht ab, Daten gehen verloren, Spiel startet nicht |
| mittel | 6 | Spürbar für Spielende oder ungeprüftes Risiko; Workaround vorhanden |
| gering | 19 | Randfall, Kosmetik oder Entwicklerwerkzeug |

Ein Workaround „–“ heißt: Für Spielende gibt es nichts zu tun.

## Kritisch

Keine.

## Mittel

| Nr. | Problem | Auswirkung für Spielende | Workaround | Bezug |
|---|---|---|---|---|
| KI-1 | **Echte Geräte ungeprüft:** iPad-Nachtest (Multitouch mit 2–4 Zonen, Systemgesten), Performance-Messung PF0–PF10 am PC/Fernseher und der komplette M4-Ablauf auf iPhones/iPad stehen aus. Alle Browser-Tests laufen in Chromium mit Emulation und synthetischem Multitouch, nicht in iOS-Safari. | Ob Daumen, Multitouch, WLAN-Latenz und Bildrate im echten Wohnzimmer passen, ist nicht belegt. | Vor der Abnahme die [Gerätecheckliste](device-test-checklist.md) (Abschnitte 9–11) durchspielen; iPad-Tipps in [ipad-zonen.md](ipad-zonen.md). | CHAOS-47, CHAOS-43, [performance.md §5–6](performance.md#5-schwellen) |
| KI-2 | **Simulation ist kein Spaß-Test:** Würfel, Münzen, Items, Reaktionsfenster, Minispiel-Werte und Rundenzahl stammen aus Bot-Simulationen. | Ob das Spiel Spaß macht, fair wirkt und schnell verstanden wird, zeigt nur eine Testrunde. | Testpartie mit 3–4 Personen, Eindrücke an die Abnahme. | EXP-001 … EXP-012, CLAUDE.md „Definition of Done“ |
| KI-3 | **Führung zählt stark:** Der alleinige Halbzeit-Führende gewinnt bei 10 Runden 59–73 % der Partien (fair wären 33–50 %), mit vier Spielern 56–62 % (fair 25 %). Es gibt keine Aufholhilfe. | Wer zur Halbzeit hinten liegt, holt selten noch auf; nur etwa jede dritte bis vierte Partie dreht sich. | – (Playtest abwarten; Idee „Trophäe wandert vor die Hintersten“ liegt im Backlog) | EXP-011, CHAOS-44 |
| KI-4 | **Keine 40-Minuten-Partie:** Höchstens 20 Runden (`MAX_ROUNDS`, Protokoll v4) ≈ 25–31 min. Die Vorschläge sind 10/16/20 Runden ≈ 15/25/30 min. | Wer einen langen Spieleabend erwartet, spielt zwei Partien hintereinander (Revanche). | „Nochmal spielen“ startet sofort die nächste Partie mit denselben Figuren. | EXP-010, ADR-014 Nachtrag 2 (offene Frage an Ruben) |
| KI-5 | **`pnpm play` nur unter Linux real getestet.** Windows und macOS sind im Skript berücksichtigt (Browser öffnen per `start`/`open`, pnpm ohne Shell), aber nicht auf echten Rechnern ausprobiert. Unter Windows fragt die Konsole nach Strg+C eventuell „Batchvorgang abbrechen (J/N)?“ (pnpm startet Skripte über `cmd`). | Erster Start auf Rubens PC kann an einer Kleinigkeit hängen. | Fallback wie bisher: `pnpm install`, `pnpm build`, `pnpm start`. Nach Strg+C mit `J` bestätigen. | CHAOS-42, [README](../README.md#so-wird-gespielt) |
| KI-6 | **Zeit läuft sofort nach Host-Rückkehr:** Lädt der PC-Tab neu (oder kommt nach Absturz zurück), setzt der Server die automatische Pause sofort fort, auch wenn die Seite noch Figuren und Szene lädt. | Nach einem Neuladen des PC-Tabs fehlen in einer laufenden Wahl oder einem Minispiel ein paar Sekunden. Ein Minispiel startet mit der Restzeit neu (unter 3 s Rest: Abbruch ohne Münzen). | Vor dem Neuladen am PC **Pause** drücken; die bleibt über das Neuladen bestehen, bis jemand „Weiter“ drückt. | ADR-014 Nachtrag 1, [m3-demo.md](m3-demo.md) |

## Gering

| Nr. | Problem | Auswirkung für Spielende | Workaround | Bezug |
|---|---|---|---|---|
| KI-7 | Kein Beitritt nach dem Start: `join` geht nur in der Lobby. Wer sich mitten in der Partie trennt, behält seinen Platz; seine Wahlen laufen nach einer verkürzten Frist automatisch ab. | Nachzügler warten bis zur nächsten Partie. Getrennte Spieler kommen per Neuladen/QR in denselben Platz zurück. | „Nochmal spielen“ führt in die Lobby, dort kann jemand dazukommen. | ADR-005, ADR-009, M2-Bericht |
| KI-8 | Einzelne Zonen eines geteilten iPads können eine Partie nicht verlassen; das iPad ist eine Verbindung für alle Zonen. | Steht eine Person auf, bleibt ihre Zone im Spiel; ihre Wahlen laufen nach der Frist automatisch ab. | – (kein Anwendungsfall im Vertical Slice) | ADR-014 Nachtrag 1 |
| KI-9 | Ein getrennter Controller ohne sauberes Schließen (z. B. Akku leer) gilt erst nach bis zu ~16 s als getrennt (Herzschlag-Timeout 15 s). | Die Anzeige „getrennt“ kommt verzögert. | – | M1-Bericht Nr. 3, ADR-009 |
| KI-10 | Fester `SEED` (Umgebungsvariable) gilt für jede Partie der Sitzung, auch nach der Revanche. | Mit `SEED=…` verläuft jede Revanche gleich (gewollt für Reproduzierbarkeit). | Ohne `SEED` starten: dann neuer Seed je Partie. | ADR-014 §5 |
| KI-11 | Die M1-Arena (Phase `play`, nur über `/host/?arena=1`) hat kein Ende und keinen Weg zurück in die Lobby. | Betrifft nur den Test-/Demo-Link, nicht das Brettspiel. | Server mit Strg+C beenden und neu starten. | M1-Bericht Nr. 2 |
| KI-12 | Der Start-Knopf in der Host-Lobby ist schon ab **einem** verbundenen Spieler klickbar (gedacht als Probelauf). | Man kann versehentlich allein starten. | „Partie beenden“ im Pausenmenü, dann „Nochmal spielen“. | CHAOS-36 |
| KI-13 | Auf dem geteilten iPad erscheint nur der Hinweis „Figur weggeschnappt“ (`character-taken`) in der betroffenen Zone; andere Hinweise stehen mittig über allen Zonen. | Mittige Hinweise stehen für die gegenübersitzende Person auf dem Kopf. | – | ADR-014 Nachtrag 2 |
| KI-14 | `reaction-opened.deadline` im Ereignis ist absolut und wird nach einer Pause nicht nachgeführt. | Keine: Controller und Host rechnen mit `remainingMs`. Nur eine Falle für künftige Anzeigen. | Neue Anzeigen nutzen `prompt.remainingMs`. | ADR-014 „Konsequenzen“ |
| KI-15 | Im lokalen Brett-Modus ohne Server (`/host/?local=1&board=1`) lädt „Nochmal spielen“ nur die Seite neu. | Betrifft nur die Tastatur-Vorschau, nicht das Spiel mit Controllern. | – | CHAOS-37 |
| KI-16 | Das Brett-Gras überstrahlt leicht: gemessen RGB 176, 252, 125 statt Sollfarbe `#8fd16a`. | Wiese wirkt etwas grell. | – (Teil der Grafik-Neuausrichtung) | CHAOS-56 |
| KI-17 | iOS-Safari kann nicht vibrieren. | Das Reaktionsfenster (Münzklau) ist nur sichtbar, nicht spürbar. | – | M2-Bericht |
| KI-18 | Zurück-Wischen in Safari ist nicht abgefangen; der iPad-Modus reagiert nur auf Touch (keine Maus); iPadOS-Mehrfingergesten können bei 3–4 Personen auslösen. | Controller verlässt kurz die Seite bzw. Finger werden losgelassen; Rückkehr in denselben Platz klappt. | iPad: Geführter Zugriff oder Mehrfingergesten aus ([ipad-zonen.md](ipad-zonen.md#technische-grenzen-und-empfehlungen)); Ausrichtung im Kontrollzentrum sperren. | M1-Bericht Nr. 5–6, A3 |
| KI-19 | Adresswahl: Ein VPN-Adapter mit neutralem Namen (z. B. „Ethernet 3“) wird nicht als VPN erkannt und kann im QR-Code landen. | Handys finden den PC nicht. | In der Lobby „Andere Adresse“ wählen oder `PUBLIC_HOST=<IP> pnpm play`. | M1-Bericht Nr. 7, [network-setup.md](network-setup.md) |
| KI-20 | Host-Tab im Hintergrund: Starke Timer-Drosselung kann den Host nach 30 s vom Server trennen (dann automatische Pause). | Partie pausiert, bis der Tab wieder sichtbar ist. | PC-Tab im Vordergrund lassen (Vollbild). | M1-Bericht Nr. 8, ADR-014 Nachtrag 1 |
| KI-21 | Die Messanzeige (`?debug=1`) überdeckt bei vier Spielern den vierten Spieler-Chip. | Nur bei eingeschalteter Messanzeige. | – | M1-Bericht Nr. 9 |
| KI-22 | Host-Bundle ≈ 1,7 MB (≈ 450 kB gzip, überwiegend Babylon). | Erster Aufruf am PC lädt etwas länger; lokal unkritisch. | – | [performance.md](performance.md), Build-Ausgabe |
| KI-23 | Beim Beenden von `pnpm play` mit Strg+C meldet pnpm zusätzlich „ELIFECYCLE Command failed“. Der Server ist trotzdem sauber beendet (getestet). | Verwirrende Meldung im Terminal. | Ignorieren; alternativ `node scripts/play.mjs` statt `pnpm play`. | CHAOS-42 |
| KI-24 | Entwicklungswerkzeug: `minimatch` 10.2.6 unter ESLint hat eine mittlere Schwachstelle (Denial of Service über Glob-Muster). Laufzeit-Abhängigkeiten sind frei von bekannten Schwachstellen. | Keine (nicht im Spiel enthalten). | Update abwarten, dann `pnpm update`. | [security-license-review.md](security-license-review.md) O1 |
| KI-25 | Screenshot-Baselines der E2E-Tests gibt es nur für Linux. | Keine; betrifft Entwickler unter Windows/macOS. | E2E in CI (Linux) laufen lassen. | M2-Bericht, [testing.md](testing.md) |

## Nicht mehr aktuell (in M4 behoben)

Zur Einordnung älterer Berichte: Kein Weg zurück in die Lobby nach dem Endstand (M2/M3) → „Nochmal spielen“ (CHAOS-37). Feste Figur je Slot (M3) → Charakterwahl (CHAOS-36). Partie lief ohne Host weiter (M3) → automatische Pause bei Host-Verlust (CHAOS-38). Knöpfe nur „A“/„B“ (M1) → Kontext-Beschriftung je Minispiel (M3). Brett rendert hinter dem Finale weiter → pausiert (CHAOS-39). „Nochmal spielen“ zeigte den alten Endstand → behoben (CHAOS-39).
