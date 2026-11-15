# ADR-014: Vertical Slice in M4 – Charakterwahl, Rundenzahl, Pause/Ende, Gleichstandsregel, Revanche, Protokoll v4

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

- `lobby.settings { rounds, roundPresets }` (Pflichtfeld). `roundPresets` sind Platzhalter `[3, 5, 8]` (`DEFAULT_ROUND_PRESETS` in `apps/server/src/game.ts`), der Balance-Pass justiert sie.
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
- Server → Host **`minigame-result-ack { minigameId, round, accepted, code? }`** auf jedes `minigame-result`. Bei Ablehnung kommt zusätzlich wie bisher `error` (`invalid-result` bzw. `out-of-phase`); der Host kann am `ack` (Runde/ID) erkennen, ob er erneut senden muss.

### 7. Reconnect

Unverändert ADR-009: `reconnect` schickt `welcome` + aktuellen Kontext je Slot. Neu getestet: Lobby mit Figur, Pause, `game-results` (Platz, `endedEarly`) und nach `rematch` (Lobby-Kontext mit Figur).

### Testhelfer

`apps/server/src/testHarness.ts` (aus dem M2/M3-Integrationstest herausgelöst): `Harness` mit künstlicher Uhr, Bots, synthetischem Host (`boards`, `lobbies`, `acks`, `hostInputs`, `errors`) und den Host-Befehlen v4 (`pickCharacter`, `configure`, `pause`, `resume`, `endGame`, `rematch`, `runUntil`). Der komplette Lebenszyklus (Lobby → Figuren → Start → zwei Runden mit echten Minispielen und Pausen → Endstand → Revanche → neue Partie) läuft deterministisch in `apps/server/src/lifecycle.integration.test.ts`.

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
- Ein Host-Absturz pausiert die Partie nicht automatisch (bewusst; ggf. später).
- Fester `SEED` gilt für jede Partie der Sitzung, auch nach der Revanche.

## Überprüfung

Neu bewerten, wenn Playtests zeigen, dass Umwählen-setzt-ready-zurück stört, dass Spieler die Gleichstandsregel nicht verstehen, dass ein automatisches Pausieren bei Host-Trennung oder für getrennte Spieler gewünscht ist, oder wenn der Balance-Pass andere Rundenvorschläge festlegt.
