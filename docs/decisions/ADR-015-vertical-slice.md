# ADR-015: Vertical Slice in M4 – Charakterwahl, Rundenzahl, Pause/Ende, Gleichstandsregel, Revanche, Protokoll v4

**Status:** Angenommen
**Datum:** 2026-11-15
**Aufgabe:** CHAOS-4 (CHAOS-36, CHAOS-37, CHAOS-55)
**Betroffene Annahmen:** `docs/assumptions.md` D4 (Regeln als reine Zustandsmaschine), B8 (Zeitbezug nur Server-Uhr)

## Kontext

M4 verlangt eine komplette Partie ohne Entwickler-Eingriff: Lobby mit Charakterwahl und einstellbarer Rundenzahl, Start/Pause/Ende, Trophäenzählung mit Siegerbildschirm und einen Weg zurück in die Lobby (ROADMAP M4). Bis M3 gab es weder Figurenwahl (Host nutzte `defaultCharacterFor(slot)`), noch Pause, noch ein Ende außer der letzten Runde; nach `game-results` musste der Server neu gestartet werden (ADR-011, „Konsequenzen“). Gleichstand in Trophäen und Münzen ergab einen geteilten Platz ohne weiteres Kriterium. Aus dem M3-Review blieben offen: Münzen je Slot im Brett-Stand, `tied`/`aborted` im Controller-Kontext und eine Bestätigung für Minispiel-Ergebnisse (CHAOS-55).

Host-, Controller- und Server-Arbeit sollten danach parallel laufen; dafür braucht es vorab einen festen Vertrag (wie ADR-011/012).

## Entscheidung

**Protokoll v4** (`PROTOCOL_VERSION = 4`, additiv zu v3, Changelog in `packages/protocol/src/version.ts`).

### 1. Charakterwahl (CHAOS-36)

- **Eine Quelle** für Figuren: `packages/protocol/src/characters.ts` (`CHARACTER_IDS`, `CharacterId`, `CHARACTER_NAMES`, `defaultCharacterFor`, `isCharacterId`, `pickFreeCharacter`), ohne zod, zusätzlich als Unterpfad `@chaos-party/protocol/characters`. Das minigame-sdk re-exportiert daraus (Host und Minispiele importieren unverändert aus dem SDK); `packages/assets/src/contract.ts` bleibt eine per Test geprüfte Kopie. Abhängigkeitsrichtung: protocol ← minigame-sdk ← game-core/host.
- Controller → Server `pick-character { slot, seq, character }`, nur in Phase `lobby`. Prüfreihenfolge wie ADR-005 (Phase, Slot-Besitz, `seq`), dann: Figur eines **anderen** Slots → Fehler **`character-taken`** (normaler Wettlauf, zählt nicht als Missbrauch, der Controller bekommt seinen Kontext neu). Dieselbe Figur erneut = nichts passiert.
- **Umwählen ist jederzeit in der Lobby erlaubt und setzt `ready` zurück.** Begründung: Wer umwählt, soll bewusst wieder „bereit“ sagen; der Host startet nie mit einer Figur, die gerade gewechselt wird. Darum bietet auch der Warte-Kontext (`ready`) `pick-character` an.
- `LobbyPlayer.character: CharacterId | null`; das Schema verbietet doppelte Figuren. Controller-Kontext in der Lobby: `lobby { character, takenCharacters, rounds }`, `actions` = `['ready', 'pick-character']` (nicht bereit, Layout `lobby`) bzw. `['pick-character']` (bereit, Layout `wait`). Lobby-Kontexte gehen bei jeder Änderung neu raus (die Session vergleicht Kontexte jetzt in allen Phasen, nicht nur im Brett).
- **Auto-Zuweisung beim Start** (deterministisch, Slot-Reihenfolge): Spieler ohne Wahl bekommen ihre Standardfigur, falls frei, sonst die erste freie in `CHARACTER_IDS`-Reihenfolge. Figuren reservierter, getrennter Slots bleiben vergeben.
- Die Figur steht in `BoardPlayer.character` (jeder `board`-Stand) und im Controller-Brettkontext (`board.character`). **Der Host nimmt die Figur je Slot aus `view.players[].character`** (Brett, Minispiel-Spieler, Ergebnis) bzw. in der Lobby aus `lobby.players[].character` (`null` → Platzhalter/Vorschlag `defaultCharacterFor`).
- Lobby-Schonfrist (ADR-009): Wird ein Slot freigegeben, ist auch seine Figur frei.

### 2. Rundenzahl (CHAOS-36)

- `lobby.settings { rounds, roundPresets }` (Pflichtfeld). `roundPresets` sind Platzhalter `[3, 5, 8]` (`DEFAULT_ROUND_PRESETS` in `apps/server/src/game.ts`), der Balance-Pass justiert sie – seit Nachtrag 2: `[10, 16, 20]`, Standard 10.
- Host → Server `configure { rounds }` (1–`MAX_ROUNDS`, nur Lobby). `start.rounds` bleibt und wird zur neuen Einstellung. Die Rundenzahl überlebt die Revanche.

### 3. Pause und vorzeitiges Ende (CHAOS-36)

- Host → Server `pause`, `resume`, `end-game` (nur Phase `board`).
- **game-core** bekommt reine Befehle `pause`, `resume`, `end` (mit `at`) und `GameState.paused`/`pausedAt`/`endedEarly`. In der Pause läuft **keine** Frist ab: `step` lässt die Zeit nicht laufen, nur `now` rückt vor. Beim Fortsetzen werden `resumeAt`, Prompt-Frist (auch die verkürzte für getrennte Spieler), `promptBaseDeadline` und `minigame.playStartedAt` um die Pausendauer verschoben – damit verschieben sich automatische Phasen, Prompt-Fristen und Minispiel-Spielzeit + Schonfrist gleichermaßen. Der Ablauf (Ereignisse, Endstand) ist mit und ohne Pause identisch (Test).
- In der Pause: `choose` → **`paused`**, erneutes `pause` → `paused`, `resume` ohne Pause → Fehler (Server: `out-of-phase`). `connection` wirkt (Schonfrist zählt ab Pausenbeginn), **`minigame-result` wird angenommen** und zum Pausenbeginn verbucht (Wettlauf: Ergebnis kam kurz vor der Pause beim Host an); die Ergebnisanzeige läuft erst nach `resume`.
- Anzeigen rechnen in der Pause ab `pausedAt` (`viewClock` in game-core): `remainingMs`, Prompt-Restzeit und `minigame.elapsedMs` stehen still. `BoardView.paused` und `board.paused` im Controller-Kontext; in der Pause bietet der Kontext nichts an (kein Prompt, Layout `board`, Minispiel-Info bleibt). Minispiel-Eingaben während der Pause lehnt die Session mit `paused` ab und leitet nichts an den Host weiter.
- `end` (Host `end-game`) springt aus jeder Phase zwischen `start` und `game-results` (auch aus der Pause) zum Endstand aus dem aktuellen Stand; ein laufendes Minispiel verfällt ohne Münzen (`minigame` = `null`). `BoardView.endedEarly`, `game-ended.endedEarly`.
- Der Host pausiert die Minispiel-Laufzeit mit `runner.pause()`/`runner.resume()` (`@chaos-party/minigame-sdk/babylon`): fester Takt steht, Eingaben werden ignoriert, gehaltene Sticks/Knöpfe beim Pausieren neutralisiert, keine Nachholzeit.

### 4. Wertung, Gleichstand, Statistik (CHAOS-37)

- **Rangfolge:** Trophäen → Münzen → Minispiel-Siege (Anzahl 1. Plätze; Gleichstand auf Platz 1 zählt für alle) → geteilter Platz (Platz = 1 + Zahl der echt Besseren). Die Siege zählt game-core sofort beim Verbuchen des Ergebnisses (`PlayerState.minigameWins`), damit auch eine Partie ohne Pacing korrekt wertet.
- `RankingEntry.minigameWins` und **`decidedBy: 'trophies' | 'coins' | 'minigame-wins' | 'shared'`** = tiefstes Kriterium, das diesen Spieler von allen anderen trennt (`shared` = geteilter Platz). Der Host kann damit die Trophäenzählung inszenieren („… und es entscheiden die Münzen!“).
- Nur zur Anzeige: `BoardPlayer.stats { coinsEarned, coinsLost, spacesMoved, itemsUsed }` und `minigameWins`, aus den Ereignissen gezählt; ohne Einfluss auf die Wertung.
- Controller-Kontext in `game-results`: `board.place`, `board.tied`, `board.endedEarly`, `coins`, `trophies`, `minigameWins`.

### 5. Revanche (CHAOS-37)

Host → Server `rematch`, nur wenn das Brettspiel im Endstand ist (sonst `out-of-phase`). Die Session wechselt zurück in Phase `lobby`: Spieler, Tokens, Figuren und Rundenzahl bleiben, `ready` wird zurückgesetzt, getrennte Plätze bekommen eine frische Lobby-Schonfrist. Die nächste Partie zieht beim Start einen neuen Seed (bei fest konfiguriertem `SEED` bewusst wieder denselben – Reproduzierbarkeit geht vor).

### 6. Minispiel-Ergebnis und Kontext (CHAOS-55)

- `BoardView.minigame.rewards: { slot, coins }[] | null` – tatsächlich ausgezahlte Münzen, `null` vor dem Ergebnis, leer bei Abbruch. Nach einem Host-Neuladen ist die Ergebnisanzeige damit vollständig.
- Controller-Minispiel-Kontext: `tied`, `aborted` (Pflicht), `reward?` (eigene Münzen im Ergebnis).
- Seit Nachtrag 4: `rewards[].items?` und Controller-`prizes?` für Items aus dem Ergebnis (Trostpreis).
- Server → Host **`minigame-result-ack { minigameId, round, accepted, code? }`** auf jedes `minigame-result`. Bei Ablehnung kommt zusätzlich wie bisher `error` (`invalid-result` bzw. `out-of-phase`); der Host kann am `ack` (Runde/ID) erkennen, ob er erneut senden muss.

### 7. Reconnect

Unverändert ADR-009: `reconnect` schickt `welcome` + aktuellen Kontext je Slot. Neu getestet: Lobby mit Figur, Pause, `game-results` (Platz, `endedEarly`) und nach `rematch` (Lobby-Kontext mit Figur).

### Testhelfer

`apps/server/src/testHarness.ts` (aus dem M2/M3-Integrationstest herausgelöst): `Harness` mit künstlicher Uhr, Bots, synthetischem Host (`boards`, `lobbies`, `acks`, `hostInputs`, `errors`) und den Host-Befehlen v4 (`pickCharacter`, `configure`, `pause`, `resume`, `endGame`, `rematch`, `runUntil`). Der komplette Lebenszyklus (Lobby → Figuren → Start → zwei Runden mit echten Minispielen und Pausen → Endstand → Revanche → zweite Partie bis zum Endstand mit denselben Controller-Verbindungen, CHAOS-50) läuft deterministisch in `apps/server/src/lifecycle.integration.test.ts`.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Umwählen nur, solange nicht bereit (Fehler sonst) | Zusätzlicher Fehlerfall und ein „nicht mehr bereit“-Knopf wären nötig; Zurücksetzen von `ready` ist für Kinder und Gäste verständlicher. |
| Figur schon bei `ready` automatisch zuweisen | Nimmt später Beitretenden ihre Standardfigur weg, obwohl der Erste gar nicht gewählt hat. |
| Figuren in game-core | Rein kosmetisch; der Server (`BoardGame`) reicht sie durch, die Regeln bleiben unberührt. |
| Pause nur im Host (Anzeige anhalten) | Server-Fristen (Prompts, Minispiel-Schonfrist) liefen weiter; nach einer längeren Pause wären Minispiele abgebrochen und Spieler auto-gewählt. |
| Pause als „Uhr anhalten“ im Server (virtuelle Zeit) | Würde alle Zeitpunkte in der Session (Herzschlag, Timeouts) mitziehen; Fristen verschieben ist lokal in game-core und testbar. |
| `minigame-result` in der Pause ablehnen | Wettlauf Host ↔ Pause würde ein gültiges Ergebnis verlieren und das Minispiel nach der Pause abbrechen. |
| Gleichstand per Zufall (Seed) auflösen | Fühlt sich unfair an; Minispiel-Siege belohnen Können und sind am PC erklärbar, geteilter Platz bleibt als ehrliches Ende. |
| Neue Ereignisse `game-paused`/`game-resumed` | Der Host spielt Ereignisse verzögert ab (ADR-011, Regie); die Pause muss sofort sichtbar sein, `view.paused` reicht. |
| Revanche = Server-Neustart | Verliert Tokens, Plätze und Figuren; alle müssten neu scannen. |

## Konsequenzen

**Positiv**
- Eine Partie lässt sich am PC komplett bedienen (Figuren, Runden, Start, Pause, Ende, Revanche), ohne Neustart.
- Pause ist verlustfrei und deterministisch (gleicher Ablauf mit/ohne Pause, getestet).
- Klare, erklärbare Gleichstandsregel mit maschinenlesbarem Grund für die Inszenierung.

**Negativ / Risiken**
- `reaction-opened.deadline` im Ereignis ist absolut und wird nach einer Pause nicht nachgeführt; Anzeigen sollen `prompt.remainingMs` verwenden.
- Der Host muss `view.paused` sofort umsetzen (nicht erst nach der Ereignis-Regie) und die Minispiel-Laufzeit selbst pausieren; sonst laufen Host-Minispiel und Server-Spielzeit auseinander.
- ~~Ein Host-Absturz pausiert die Partie nicht automatisch (bewusst; ggf. später).~~ Überholt: Auto-Pause bei Host-Verlust, siehe Nachtrag 1.
- Fester `SEED` gilt für jede Partie der Sitzung, auch nach der Revanche.

## Überprüfung

Neu bewerten, wenn Playtests zeigen, dass Umwählen-setzt-ready-zurück stört, dass Spieler die Gleichstandsregel nicht verstehen, dass ein automatisches Pausieren bei Host-Trennung oder für getrennte Spieler gewünscht ist, oder wenn der Balance-Pass andere Rundenvorschläge festlegt.

## Nachtrag 1 (2026-11-15, CHAOS-38): Auto-Pause bei Host-Verlust

**Kontext.** Bisher lief die Partie weiter, wenn der Host-Tab am PC die Verbindung verlor (Neuladen, Absturz, eingefrorener Hintergrund-Tab → Herzschlag-Timeout 30 s, ADR-009). Ohne Host sieht niemand das Brett, Minispiele laufen nicht (der Host rechnet sie), ein Ergebnis kann nicht kommen: Nach Spielzeit + Schonfrist wurde das Minispiel abgebrochen, offene Prompts liefen ab, und Ereignisse ohne Host gingen verloren (der neue Host bekam nur einen Schnappschuss mit Lücke in `eventSeq`).

**Entscheidung.**
- Trennt sich der Host, während das Brettspiel läuft (Phase `board`, nicht im Endstand, nicht schon pausiert), pausiert die **Session** die Partie selbst (game-core `pause`) und merkt sich den Auslöser (`pausedBy: 'host-lost'` im Server-Schnappschuss; das Protokoll bleibt unverändert, Controller und Host sehen wie bei jeder Pause `paused`). Gilt für jeden Abriss: `close`, Missbrauch (4008), Herzschlag-Timeout.
- Pausiert wird zum **zuletzt verarbeiteten Zeitpunkt** (`state.now`), nicht zum Abrisszeitpunkt: Sonst erzeugt der Pause-Schritt Übergänge, die seit dem letzten Server-Takt fällig wurden, und ihre Ereignisse gingen ohne Host verloren (Fehler im ersten Entwurf, Test „Host-Abriss zwischen zwei Takten“).
- ~~**Kommt ein Host zurück (`host-hello`), setzt die Session eine Auto-Pause sofort fort**~~ (überholt durch Nachtrag 3: erst nach `host-ready`), bevor er den Stand bekommt: `lobby` + `board` mit `paused: false`, unveränderten Restzeiten und Minispiel-Stand (`elapsedMs` vom Moment des Abrisses). Eine Pause, die der Host selbst ausgelöst hat (`pause`), bleibt dagegen über einen Reload bestehen, bis er `resume` schickt.
- In der Auto-Pause gilt alles aus §3: keine Frist läuft ab (Schonfrist getrennter Spieler zählt ab Pausenbeginn), Controller-Eingaben werden mit `paused` abgewiesen, ein `minigame-result` wird angenommen; ein laufendes Minispiel wird **nicht** abgebrochen, auch wenn der Host länger als Spielzeit + Schonfrist weg ist.

**Begründung für automatisches Fortsetzen** (statt „pausiert bis `resume`“):
- Die Auto-Pause hat nur einen Grund – niemand kann zusehen. Ist wieder ein Host da, entfällt er; ein zusätzlicher Klick am PC hätte keinen Nutzen, würde aber bei jedem versehentlichen Neuladen nötig.
- Das bisherige Reload-Verhalten (M3: Bühne startet mit der Restzeit neu, Ergebnis nach Verbindungsabbruch erneut senden; `m3-minispiel-durchstich.spec.ts`) bleibt ohne Änderung an Host und E2E erhalten – nur verliert jetzt niemand Zeit.
- Eine bewusste Pause des Hosts bleibt bewusst: Sie wird nie automatisch aufgehoben.

**Betrachtete Alternative:** Pausiert lassen, bis der Host `resume` schickt. Vorteil: Zeit zum Orientieren, Host lädt Szene/Assets in Ruhe. Nachteil: Jeder Reload/Tab-Wechsel am PC braucht einen Klick; der Host müsste unterscheiden, ob er selbst pausiert hat (neues Protokollfeld). Verworfen, kann aber ohne Protokolländerung umgestellt werden (`resumeAfterHostLoss` in `apps/server/src/session.ts`).

**Konsequenzen.**
- Nach dem Wiederverbinden läuft die Partie sofort weiter; lädt die Host-Seite danach noch Assets, läuft die Zeit dabei (wie in M3). Falls Playtests zeigen, dass das stört: Host schickt `pause`, bis die Bühne steht.
- Controller sehen während des Abrisses `board.paused` (Joystick/Knöpfe verschwinden kurz); nach der Rückkehr kommt der vorherige Kontext wieder (gleiche Prompt-ID).
- Tests: `apps/server/src/hostLoss.integration.test.ts`.

**iPad-Mehrfachslots (Prüfung CHAOS-38, keine Änderung).** Ein geteiltes iPad ist **eine** Verbindung mit `join { seats: n }`: n Slots, **ein** Token, **ein** `seq`-Wächter über alle Zonen, Rate-Budget 60/s je Slot (ADR-005/008). Jede Zone wählt ihre Figur und meldet sich bereit über das `slot`-Feld; `character-taken` gilt auch zwischen Zonen desselben iPads (Fehler mit `seq`, der betroffene Slot bekommt seinen Kontext neu). `reconnect` holt alle Zonen zurück. Für eine komplette Partie fehlt nichts (Test `apps/server/src/mixedSetup.integration.test.ts`); einzelne Zonen können eine Partie nicht verlassen (kein Anwendungsfall in M4).

## Nachtrag 2 (2026-11-15, CHAOS-40): Besitzer vergebener Figuren, Hinweis je iPad-Zone, Runden-Vorschläge

**Kontext.** Der Controller zeigte vergebene Figuren nur dann in der Farbe des Besitzers, wenn der Besitzer auf demselben Gerät saß (Nachbarzone eines geteilten iPads); `takenCharacters` nennt nur die Figuren. Auf einem iPhone stand bei fremden Figuren bloß „vergeben“. Außerdem erschien `character-taken` auf dem geteilten iPad als ein Hinweis mittig über allen Zonen, oft auf dem Kopf für die betroffene Person. Die Runden-Vorschläge waren Platzhalter (§2).

**Entscheidung.**
- **Protokoll (additiv, v4 ohne Versionssprung):** Lobby-Kontext `takenBy?: { character, slot }[]` – dieselben Figuren wie `takenCharacters` (gleiche Reihenfolge `CHARACTER_IDS`) mit Besitzer-Slot. `takenCharacters` bleibt (Prüfung „vergeben“, ältere Clients). Optional, damit ein Controller mit älterem Server weiterläuft; dann gilt der bisherige Rückfall (Nachbarzonen, sonst neutral). Changelog in `packages/protocol/src/version.ts`.
- **Server** (`apps/server/src/session.ts`, `lobbyContextFor`) sendet `takenBy` immer. Ändert sich ein Besitzer, ändert sich der Kontext und geht neu raus (Kontextvergleich wie bisher).
- **Controller** (`apps/controller/src/lobby/view.ts`): `ownerSlot` kommt aus `takenBy`, sonst aus den Nachbarzonen. Die Karte zeigt Farbe, Symbol und „<Farbe> hat sie“ – geräteübergreifend.
- **Hinweis je Zone:** `Notice.slot` (Controller-Zustand) ordnet `character-taken` über die `seq` der gesendeten Figurenwahl einer Zone zu (`pickSeqs`, die letzten 8 je Verbindung; Rückfall: die einzige vorgemerkte Wahl). Das geteilte iPad zeigt den Hinweis dann in dieser Zone, mit ihr gedreht, oben unter der Plakette und mit Rand in Zonenfarbe; ohne eindeutige Zone bleibt er mittig. Das iPhone ist unverändert.
- **Runden-Vorschläge** `10 / 16 / 20`, Standard `10` (`apps/server/src/game.ts`), begründet in EXP-011/012 (`docs/experiments.md`): ≈ 15 / 25 / 30 min mit 3–4 Spielern. 40 min bräuchten 26–30 Runden, mehr als `MAX_ROUNDS` (20); das bleibt eine Frage an Ruben. Die Lobby zeigt die geschätzte Dauer nach Spielerzahl.

**Betrachtete Alternative:** `takenCharacters` durch `takenBy` ersetzen (Protokoll v5). Verworfen: Bruch für alle Nutzer und Fixtures ohne Gewinn, das Feld ist klein.

**Konsequenzen.** Tests: `packages/protocol/src/v4.test.ts`, `apps/server/src/session.v4.test.ts`, `apps/server/src/mixedSetup.integration.test.ts` (iPhone sieht Besitzer auf dem iPad), `apps/controller/src/lobby/view.test.ts`, `apps/controller/src/state/reducer.m4.test.ts`, E2E `controller-m4.spec.ts` und `ipad-m4.spec.ts` („Figur weggeschnappt“).

## Nachtrag 3 (2026-11-17, CHAOS-68): Fortsetzen erst, wenn der Host bereit ist

**Kontext.** Nachtrag 1 setzte eine Auto-Pause schon beim `host-hello` fort. Nach einem Neuladen des PC-Tabs lädt die Seite danach aber noch Brett bzw. Minispiel-Bühne samt Figuren (GLB), Licht und Shader – mit Software-Rendering mehrere Sekunden. In dieser Zeit liefen Fristen und Minispiel-Spielzeit schon; die neu aufgebaute Bühne startete mit weniger Restzeit, unter 3 s Rest wurde das Minispiel abgebrochen (KI-6).

**Entscheidung.**
- **Protokoll (additiv, v4 ohne Versionssprung):** Host-Nachricht `host-ready` (`{ v, type }`), in allen Phasen erlaubt. Der Host schickt sie, sobald die Bühne seiner Phase steht (Brett: `scene.ready` inkl. Figuren und erster Brett-Stand; Minispiel: `stage.ready`; Lobby/Arena: Arena-Szene) – einmal je Verbindung und erneut, wenn eine Bühne neu aufgebaut wurde (`apps/host/src/net/hostConnection.ts`, `setSceneReady`). Changelog in `packages/protocol/src/version.ts`.
- **Server** (`apps/server/src/session.ts`): Bei `host-hello` nach einer Auto-Pause bleibt die Partie pausiert (`awaitingHostReady: true` im Server-Schnappschuss); der Host bekommt den Stand mit `paused: true`. Erst `host-ready` setzt fort. Wartet keine Auto-Pause, ignoriert der Server `host-ready` ohne Fehler.
- **Rückfall:** Kommt binnen `hostReadyMs` (30 s, `SessionTimeouts`) kein `host-ready` – älterer Host ohne die Nachricht, Bühne lädt nie fertig –, setzt `tick` trotzdem fort (Verhalten wie vor CHAOS-68).
- Bricht die Verbindung beim Laden erneut ab, wartet die Auto-Pause auf den nächsten Host (keine Rückfallfrist ohne Host).
- **Host-Befehle beim Laden:** `resume` setzt sofort fort. `pause` macht aus der Auto-Pause eine eigene Pause des Hosts (`pausedBy: 'host'`), die bis `resume` bleibt; ein späteres `host-ready` ändert daran nichts. Im Host sind Pause-Knopf, -Overlay und Tasten P/Esc ausgeblendet, solange die Bühne lädt (`PauseControls`, `loading`); eine eigene Pause zeigt das Overlay danach wie bisher.
- Die Minispiel-Bühne rechnet ihre Restzeit aus einem pausierten Stand ohne „Zeit seit Empfang“ (`remainingPlayMs`), damit die Ladezeit auch dort nicht abgezogen wird.

**Betrachtete Alternative:** Host schickt nach dem Laden `resume`. Verworfen: Der Host kann eine Auto-Pause nicht von seiner eigenen Pause unterscheiden (das Protokoll kennt nur `paused`) und würde eine bewusste Pause nach dem Neuladen aufheben; ein neues Feld `pausedBy` im Stand wäre ebenso additiv, aber breiter.

**Konsequenzen.**
- Nach dem Neuladen sehen Controller `board.paused`, bis die Host-Bühne steht (Joystick/Knöpfe verschwinden so lange). Keine Restzeit geht beim Laden verloren.
- Ein Server ohne CHAOS-68 wiese `host-ready` als ungültig ab (zählt zu den 20 ungültigen Nachrichten bis zur Trennung). Host und Server kommen aus demselben Build; gemischte Stände sind nicht vorgesehen.
- Tests: `apps/server/src/hostLoss.integration.test.ts` („Host lädt nach der Rückkehr noch“), `apps/host/src/net/hostConnection.test.ts`, `apps/host/src/minigame/plan.test.ts`, `packages/protocol/src/v4.test.ts`, E2E `m3-minispiel-durchstich.spec.ts` (Figuren 3 s zurückgehalten: Server bleibt pausiert, danach Neustart mit voller Restzeit).

## Nachtrag 4 (2026-11-17, CHAOS-51): Trostpreis im Minispiel-Ergebnis

EXP-018 macht ein Item für den letzten Minispiel-Platz zum Standard (`items.minigameLastItems: 1`). Damit PC und Controller das zeigen können, auch nach einem Neuladen, trägt der Stand die Items:

- `BoardView.minigame.rewards[].items?: ItemKind[]` (1–4, fehlt ohne Item).
- Controller-Minispiel-Kontext `prizes?: ItemKind[]` (eigene Items aus dem Ergebnis, nur in `results`).

Beide Felder sind optional; die Protokollversion bleibt 4, weil Host, Server und Controller immer aus demselben Build kommen. Die Items kommen zusätzlich wie jedes gezogene Item als `item-gained` nach `minigame-results`.
