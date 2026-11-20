# ADR-012: Minispiele in M3 – Logik im PC-Host, Server als Schiedsrichter, fester 1/60-Takt, Protokoll v3

**Status:** Angenommen
**Datum:** 2026-11-15
**Aufgabe:** CHAOS-3 (CHAOS-26 … CHAOS-34)
**Betroffene Annahmen:** `docs/assumptions.md` D4 (Regeln als reine Zustandsmaschine), C1 (Havok-WASM)

## Kontext

M3 verlangt drei echte Mehrspieler-Minispiele (Arcade, Physik, Hybrid) mit Anleitung, Ergebnis und Tests für Lebenszyklus, Wertung und Aufräumen (ROADMAP M3, ARCHITECTURE „Minigame contract“). In M2 lief nach jeder Runde ein Platzhalter in game-core (Rangfolge per Seed). Die Regeln laufen im Session-Server (ADR-011), die Darstellung im Host. Das Physik-Minispiel braucht Havok, das im Host bereits läuft (ADR-004). Mehrere Subagenten sollten parallel je ein Minispiel bauen; dafür brauchte es vorab einen festen Vertrag und eine Testumgebung ohne Browser.

## Entscheidung

**1. Minispiel-Logik läuft im Host (PC), nicht im Server.** Der Host erzeugt je Minispiel eine eigene Babylon-Szene, rechnet Logik und (falls nötig) Havok-Physik und meldet am Ende ein Ergebnis. Das bleibt PC-autoritativ (Host und Server laufen auf demselben PC); die Controller senden weiter nur Eingaben.

**2. Der Server ist Schiedsrichter.** game-core wählt je Runde ein Minispiel per Seed aus der Rotation (`GameConfig.minigames`, gemischt ohne Wiederholung, bis alle dran waren), vergibt einen Minispiel-Seed und führt die Phasen `minigame-intro` → `minigame-play` → `minigame-results`. Der Host meldet `minigame-result { minigameId, round, placements, highlights? }`; game-core prüft vollständig (laufende Runde/ID, jeder Teilnehmer genau einmal, gültige Wertung mit Gleichstand, Punkte passend zu Plätzen und Wertungsart, Textgrenzen) und verteilt erst dann Münzen je Platz (Gleichstand = gleiche Belohnung). Kommt bis Spielzeit + `minigameResultGraceMs` (15 s) kein gültiges Ergebnis, gilt das Minispiel als abgebrochen: keine Münzen, die Partie läuft weiter. Ohne konfigurierte Minispiele bleibt der M2-Platzhalter.

**3. Vertrag in `packages/minigame-sdk`** (zwei Einstiege):

- Rein (`@chaos-party/minigame-sdk`): Steckbrief `MinigameInfo` (Titel, Untertitel, 1–3 Anleitungszeilen, Bedienung Joystick/A/B mit Text oder `null`, Spielzeit, Physik ja/nein, Wertungsart, Einheit), Eingaben, Ergebnis, `rankByScore`, `checkResult`, `checkInfo`, Seed-RNG, Figuren-IDs/-Namen. Server, game-core und Controller nutzen nur diesen Teil.
- Babylon (`@chaos-party/minigame-sdk/babylon`): `Minigame` mit `prepare(ctx)`, `start()`, `handleInput(slot, input)`, `update(dt)`, `getResult()`, `getHud()`, `dispose()`; `MinigameModule { info, create }`. Die **Laufzeit** `createMinigameRunner` erzwingt die Reihenfolge, gibt Eingaben nur laufend und nur an Teilnehmer (Achsen begrenzt, doppelte Knopfdrücke gefiltert), schickt bei Trennung neutrale Eingaben, rechnet **feste Schritte von 1/60 s** (höchstens 15 je Aufruf = 250 ms Aufholen, längere Hänger werden verworfen; bis etwa 4 Bilder/s bleibt das Spiel in Echtzeit), pausiert ohne Zeitverlust, prüft das Ergebnis und wertet bei Überschreitung (+1 s) oder ungültigem Ergebnis selbst aus dem HUD (`forced`).
- **Szene gehört der Laufzeit**, alles darin dem Minispiel: Es legt Meshes, Materialien, Kamera, Licht, Physik-Körper und Beobachter selbst an und räumt sie in `dispose()` weg. Zeit nur über `update`, Zufall nur über `ctx.rng`. Effekte (`ctx.fx`: Klang, Partikel, Kamerawackeln) und Figuren (`ctx.characters`) kommen von der Laufzeit.
- **Physik:** Havok wird vor `prepare` in der Szene aktiviert, aber vom Rendern entkoppelt (`scene.physicsEnabled = false`); die Laufzeit rechnet nach jedem `update` genau einen Physikschritt. Damit läuft die Physik unabhängig von der Bildrate (60/120/144 Hz) gleich schnell.
- **Testharness** (`@chaos-party/minigame-sdk/testing`): NullEngine-Szene, Havok aus der WASM-Datei in Node, aufzeichnende Effekte, Kapsel-Figuren, `runMinigameHeadless` mit Eingabe-Skript, `sceneResidue` für die Aufräumprüfung. Physik wird über Invarianten getestet, nicht bitgenau.

**4. Minispiele als Module in `packages/minigames`.** Je Ordner ein Minispiel (`info.ts` rein, `index.ts` Babylon). `./catalog` (rein) liefert Steckbriefe und Rotation für den Server, `.` die Module für den Host. `pump-parade` ist das Referenz-Minispiel des Vertrags und Rückfall, nicht in der Rotation. Ein generischer Test prüft jedes registrierte Modul (2–4 Spieler, Zufalls-Bots, gültiges Ergebnis, Szene leer nach `dispose`, Verbindungsverlust).

**5. Protokoll v3** (additiv zu v2):

- `BoardView.minigame` (`id`, `round`, `seed`, `playMs`, `elapsedMs`, `placements`, `highlights`, `aborted`); Ereignisse `minigame-started { minigame }` und `minigame-results { ranking, placements, aborted }`.
- Host → Server `minigame-result`; Fehlercode `invalid-result` (Partie läuft weiter).
- Controller-Kontext in der Brettphase mit `minigame` (`stage` `intro|play|results`, Anleitung, Bedienung, eigener Platz/Punkte). Während `minigame-play` Layout `joystick-buttons` mit genau den angebotenen Eingaben; `move`/`press`/`release` gehen wie in der M1-Arena als `input` an den Host.

**6. Host-Neuladen mitten im Minispiel:** Der Schnappschuss enthält `elapsedMs`; der Host startet das Minispiel mit der Restzeit neu (gleicher Seed, Spielstand des Minispiels geht verloren). Das ist selten (Host und Server auf demselben PC) und hält die Partie am Laufen.

## Betrachtete Alternativen

| Alternative                                          | Warum nicht                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Minispiel-Logik im Server, Host zeigt Schnappschüsse | Physik-Minispiel bräuchte Babylon + Havok im Node-Server und 30–60 Hz-Schnappschüsse mit Interpolation im Host; mehr bewegliche Teile, sichtbar ruckeliger. Vorteil (Host-Reload verlustfrei) ist bei Host und Server auf einem PC gering. |
| Physik im Render-Schritt (Babylon-Standard)          | Physik-Tempo hinge von der Bildrate ab (144-Hz-Monitor = schnelleres Spiel); Tests ohne Rendern wären nicht möglich.                                                                                                                       |
| Ergebnis ungeprüft übernehmen                        | Host-Nachricht ist Eingabe von außen; ein Fehler im Minispiel (doppelter Slot, Lücken) würde Münzen falsch verteilen. Die Prüfung kostet wenig.                                                                                            |
| Eigene Controller-Layouts je Minispiel               | Mehr Protokoll und Controller-Code; Joystick + A/B mit Texten deckt die drei Konzepte ab und passt in kleine iPad-Zonen.                                                                                                                   |
| Minispiele als Teil von game-core                    | game-core bliebe nicht rein (Babylon/Havok); Server bräuchte Render-Abhängigkeiten.                                                                                                                                                        |

## Konsequenzen

**Positiv**

- Minispiele sind isoliert testbar (headless in Millisekunden bis wenige Sekunden je Lauf), parallel entwickelbar und austauschbar, ohne Regeln oder Server zu ändern.
- Brett ↔ Minispiel ist über die Session mit synthetischem Host durchgetestet (`apps/server/src/boardGame.integration.test.ts`).
- Gleichstände, Abbrüche und Host-Fehler führen nie zum Stillstand der Partie.

**Negativ / Risiken**

- Host-Neuladen setzt das laufende Minispiel zurück (Restzeit bleibt).
- Der Host ist für die Wertung vertrauenswürdig; manipulierte Ergebnisse mit gültiger Form erkennt der Server nicht (lokales Spiel, kein Wettbewerb – bewusst akzeptiert).
- Zwei Typquellen (game-core `MinigamePlacement`, zod-Schema) – wie ADR-011 über die Zuweisung in `apps/server/src/game.ts` abgesichert.

## Überprüfung

Neu bewerten, wenn Host-Neuladen im Playtest stört, wenn ein Minispiel eigene Controller-Elemente braucht (z. B. Neigung, Mehrfach-Touch), oder wenn Online-/Fernspiel ein Thema würde (dann Server-autoritative Minispiele).

## Nachtrag 1 (2026-11-18, CHAOS-141): verteilter Aufbau mit `ctx.pace()`

`MinigameContext` bekommt `pace(): Promise<void>`. Minispiele rufen es in `prepare` zwischen ihren Bauschritten auf (`await ctx.pace()`, etwa je Mesh-Gruppe, Figur oder vorgewärmtem Gegenstand). Mit Taktgeber (`RunnerOptions.pacing`: nächstes Bild, echte Uhr, Budget in ms) gibt `pace` ab, sobald das Budget des Bildes verbraucht ist, und der Aufbau geht im nächsten Bild weiter. Ohne Taktgeber löst `pace` sofort auf: Tests und der PC-Host bauen wie bisher am Stück. Wird die Laufzeit während des Aufbaus entsorgt, wirft `pace` `PrepareAborted` und `prepare` endet ohne weitere Meshes.

Grund: Im nativen Apple-Host läuft JavaScriptCore ohne JIT. Ein Aufbau am Stück hielt dort ein Bild bis zu 98 ms an (EXP-024), in der Interpreter-Näherung des Harness bis 330 ms. Mit `pace` und 2 ms Budget liegt das längste Bild in der Näherung bei 19 ms (EXP-024, Nachtrag). Bauschritte zwischen zwei `pace` sollten klein bleiben: eine Kugel mit Standard-Segmenten kostet ohne JIT bereits gut 10 ms.

## Nachtrag 2 (2026-11-20, CHAOS-206): Host wertet vor der Frist des Servers

Die Spielzeit eines Minispiels steht schon im Aufbau fest (`ctx.timeLimitMs`). Ist die Bühne erst nach dem Countdown fertig (langsamer Aufbau, gedrosselter Mac, CHAOS-203, Software-Rendering in der CI) oder rechnet der Host langsamer als die Uhr, läuft sein Spiel über das Ende beim Server hinaus. Das ist in Ordnung, solange das Ergebnis vor der Frist kommt (Spielzeit + `minigameResultGraceMs`, sonst bricht der Server ab). Darum richtet der Host seinen Ablauf an dieser Frist aus (`playDeadline` in `apps/host/src/minigame/plan.ts`, beide Hosts). Die Frist liest er aus `view.remainingMs` in `minigame-play`, so gilt auch eine anders eingestellte Kulanz.

- Läuft das Spiel noch, wenn bis zur Frist höchstens `RESULT_MARGIN_MS` (3 s) bleiben, beendet der Host es mit `runner.finishNow()`. Hat das Minispiel noch kein Ergebnis, wertet die Laufzeit den Stand aus dem HUD (`RunnerResult.cut`, Log „Frist des Servers“).
- Bleiben bei Fertigstellung der Bühne bis zu diesem Punkt weniger als `MIN_RESTART_MS` (3 s) Spielzeit, startet das Spiel nicht mehr (Begründung wie beim Neuladen, Punkt 6). Der Server bricht nach seiner Frist ohne Münzen ab.
- Die angezeigte Restzeit reicht höchstens bis zum Werten vor der Frist (`shownRemainingMs`). Sonst stünden beim Abbruch noch Sekunden auf der Uhr.
- Ein wenig zu spät gestartetes Spiel behält seine volle Spielzeit und endet in der Kulanz. Gekürzt wird nur, wenn die Frist sonst reißt.
- In der Pause steht die Uhr. Im Testmodus und im lokalen Ablauf des PC-Hosts greift nichts davon (kein Server).

Verworfen: Das Spiel schon 1 s nach dem Ende der Spielzeit beim Server zu beenden. Das ließ in der CI unter Software-Rendering ein 8-s-Minispiel nie starten, dessen Bühne 5 s zu spät fertig war (`m2-brett-durchstich`, 60 s Kulanz). Vorher wurde es innerhalb der Kulanz angenommen.

Nachstellen: `HostEnv.debugStageDelayMs` verzögert im Apple-Host jede Bühne künstlich. Zwei Bündel-Tests prüfen das. Bei 5 s Verspätung wird mit voller Spielzeit angenommen. Bei 20 s Verspätung wird vor der Frist gewertet und angenommen; ohne die Ausrichtung meldete der Kern dort „nicht mehr gebraucht“.

## Nachtrag 3 (2026-11-20, CHAOS-205): Aufbau-Budget folgt der Tick-Dauer

Im Apple-Host bekam der Minispiel-Aufbau fest 2 ms je `tick` (Nachtrag 1). Tickt die App langsamer, etwa im Ersatztakt eines gedrosselten Macs (CHAOS-203) oder wenn Ticks ausfallen, kommt der Aufbau je Sekunde entsprechend weniger weit. Im Swift-Harness ohne JIT mit 10 Hz war die Bühne nur in 6 von 10 Runden vor dem Countdown-Ende fertig, vor allem bei der kurzen Anleitung (3 s) einer Wiederholung.

Jetzt bekommt jeder `tick` denselben Anteil seiner Dauer wie bei 60 Hz (2 von 16,7 ms, also 12 %), mindestens 2 ms und höchstens 20 ms (`prepareBudgetMs` in `apps/apple-host/src/stage.ts`). Das gilt für `ctx.pace()` und für das Kodieren der Geometrie in `renderState`. Bei 60 Hz und schneller bleibt alles wie bisher. Ein einzelner Hänger gibt nur dem nächsten Tick mehr Budget, gedeckelt.

Messung im Swift-Harness, ganze Partie ohne JIT:
- 10 Hz: Die Bühne war in 10 von 10 Runden vor dem Countdown-Ende fertig, vorher in 6 von 10. Der längste Tick der Anleitung dauerte 34 ms, bei einem Tick-Abstand von 100 ms.
- 60 Hz: 10 von 10 wie vorher. Das längste Bild der Anleitung (`tick` + `renderState`) lag in je drei Läufen bei 14,5/15,4/18,1 ms vorher und 18,2/16,4/21,8 ms nachher. Bei 60 Hz ist der Code-Pfad gleich, die Spitzen streuen.
- Bilder über 16,7 ms gab es schon vorher. Sie stammen von einzelnen Bauschritten zwischen zwei `pace` (Nachtrag 1, dort 19 ms) und nicht vom Budget.

Der CI-Job „macOS“ spielt die Partie im Harness zusätzlich mit `hz=10`. Ist dabei eine Bühne beim Spielstart nicht fertig, schlägt er fehl.
