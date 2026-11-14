# ADR-005: Lokaler autoritativer Session-Server

**Status:** Angenommen
**Datum:** 2026-11-14
**Aufgabe:** CHAOS-9
**Betroffene Annahmen:** `docs/assumptions.md` A9, B7, B8, B9, B10

## Kontext

ADR-003 legt das Protokoll fest (Nachrichten, Fehlercodes, Rollen-Handshake, `seq` pro Verbindung), lässt aber offen, *wie* der Server Slots, Tokens, Rate-Limits und Host-Wechsel verwaltet. ADR-002 sieht einen Node-Prozess auf einem Port vor (B9); der WebSocket-Endpunkt muss neben Controller-App und `/health` laufen. Anforderungen aus CHAOS-9 und `ARCHITECTURE.md`: kurzer Join-Code, Slots 1–4 mit Controller-Token, Abweisung von Spoofing, Doppel-Join, ungültigen Aktionen, begrenzte Rate-Limits, Weiterleitung der Eingaben an den Host, kontextbezogener Zustand an jeden Controller. Abnahme: Integrationstests mit mehreren synthetischen Controllern, gleichzeitigen Eingaben und Missbrauchsfällen.

## Entscheidung

**Schnitt: reine Session + dünner Adapter.**
- `apps/server/src/session.ts`: Klasse `Session` ohne Netzwerkcode. Ereignisse `connect(id)`, `message(id, rawText)`, `disconnect(id)` liefern eine Liste von Aktionen `{ kind: 'send', to, message } | { kind: 'close', to, code, reason }`. Uhr (`now`, Standard `performance.now()`), Token-Erzeugung und Grenzwerte sind injizierbar → deterministische Unit-Tests. Ausnahmen in Handlern werden gefangen, protokolliert und als `internal` gemeldet.
- `apps/server/src/socket.ts`: `ws` (MIT) im `noServer`-Modus am vorhandenen `node:http`-Server, nur Upgrades auf **`/ws`** (sonst HTTP 404), `maxPayload` **16 KiB** (größere Frames schließt `ws` mit 1009), höchstens **64** gleichzeitige Verbindungen (sonst 503). Binärframes gelten als ungültige Nachricht.
- `createChaosServer({ staticDir, joinCode?, joinUrl?, now?, createToken?, rateLimit?, maxInvalidMessages? })` → `{ listen, close, joinCode, session }`; `close()` beendet alle Sockets sofort und ist idempotent.
- Prüfreihenfolge je Nachricht: Rate-Limit → Parser (Größe, JSON, Version, Schema; ADR-003) → Rolle → Phase (`isIntentAllowed`) → Slot-Besitz → angebotene Aktion → `seq` → Wirkung.

**Eine Session pro Prozess.** Join-Code: 4 Zeichen aus `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ohne 0/O/1/I), `crypto.randomInt`; fest vorgebbar per Option `joinCode` bzw. Umgebungsvariable `JOIN_CODE` (Demos, Tests), geprüft gegen `JoinCodeSchema`. `main.ts` gibt Code und WebSocket-URL aus. Token: `crypto.randomBytes(24).toString('base64url')` (32 Zeichen), **ein Token pro Join**, gilt für alle Slots dieser Verbindung.

**Slot-Politik.** `join { seats }` bekommt die niedrigsten freien Slots; reicht der Platz nicht, `session-full` (keine Teilvergabe). Labels: übergebene `names`, sonst Farbname aus `PLAYER_SLOTS`. Getrennte Controller behalten ihre Slots (`connected: false`), bis sie per `reconnect` zurückkommen; ein neuer `join` bekommt einen anderen Slot. Joins nur in `lobby` (sonst `out-of-phase`).

**Controller-Ablauf.** Erste Nachricht muss `join`/`reconnect` (oder `host-hello`) sein, sonst `not-joined` + Close **4001**. Falscher Code → `bad-join-code`, unbekanntes Token → `bad-token`; die Verbindung bleibt offen und darf erneut versuchen (begrenzt durch den Zähler ungültiger Nachrichten). Ein zweites `join`/`reconnect` auf einer beigetretenen Verbindung → `bad-message` („bereits beigetreten“). `reconnect` mit bekanntem Token bindet alle Slots des Tokens an die neue Verbindung; eine noch offene alte Verbindung wird mit **4003** geschlossen. Danach `welcome` (gleiches Token) und je Slot ein `context`. Jede neue Verbindung beginnt mit neuem `seq`-Wächter.

**Kontexte je Phase** (`context { slot, phase, layout, actions }`):

| Phase / Zustand | `layout` | `actions` |
|---|---|---|
| `lobby`, nicht bereit | `lobby` | `['ready']` |
| `lobby`, bereit | `wait` | `[]` |
| `play` | `joystick-buttons` | `['move', 'button-a', 'button-b']` |

Eingaben, deren Aktion im aktuellen Kontext nicht angeboten wird (z. B. `gesture` in `play`), werden mit `out-of-phase` abgewiesen. `ready` ist in der Lobby idempotent (zweites `ready` erzeugt nichts). `heartbeat` → `heartbeat-ack { t }` und aktualisiert `lastSeenAt`.

**Weiterleitung.** Geprüfte `move`/`press`/`release`/`gesture`/`reaction` gehen als `input { intent, at }` an den Host; `intent` wird feldweise neu aufgebaut, `at` ist die Server-Empfangszeit (monotone ms seit Prozessstart). Ist kein Host verbunden, werden geprüfte Eingaben **still verworfen** und in `snapshot().droppedInputs` gezählt.

**Host.** `host-hello` macht die Verbindung zum Host, sie bekommt sofort `lobby`; wiederholtes `host-hello` schickt den Schnappschuss erneut. Ist bereits ein Host verbunden, bekommt ein zweiter `host-taken` + Close **4002**. Trennt sich der Host, darf ein neuer übernehmen (Seiten-Reload am PC). `start` nur in `lobby` und nur mit mindestens einem *verbundenen* Spieler, sonst `out-of-phase`; danach Phase `play`, neue Kontexte an alle verbundenen Controller, `lobby` an den Host. `lobby` wird höchstens einmal pro Ereignis gesendet, sobald sich Spieler, Verbindung, Bereitschaft oder Phase ändern.

**Missbrauchsschutz.**
- Token-Bucket je Verbindung: **60 Nachrichten/s je gehaltenem Slot** (mindestens 1), Puffer **2 s** (Kapazität 120 bei einem Slot, 480 beim iPad mit vier Spielern). Ein Joystick mit 60 Hz pro Slot läuft dauerhaft ohne Drosselung (Unit-Test über 10 s, auch für 4 Slots auf einer Verbindung).
- Über dem Budget: Nachricht verworfen, höchstens **ein** `rate-limited`-Fehler pro Sekunde. Close **4008**, wenn die Flut-Phase **5 s** anhält (sie endet erst nach einer Sekunde ohne Abweisung) oder insgesamt **1000** Nachrichten abgewiesen wurden.
- Ungültige Nachrichten (Parserfehler, `not-your-slot`, `bad-join-code`, `session-full`, `bad-token`, Doppel-Join, Join außerhalb der Lobby) zählen; nach **20** Close **4008**. `stale-seq` und `out-of-phase` bei Eingaben zählen *nicht*, weil sie bei Phasenwechseln und Netzwerk-Umordnung legitim vorkommen; sie sind über das Rate-Limit begrenzt.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Logik direkt in den `ws`-Handlern | Tests bräuchten echte Sockets und Wartezeiten; Uhr und Zufall wären schwer zu steuern; flakige Rate-Limit-Tests. |
| Reducer mit unveränderlichem Zustand | Sauber, aber für Verbindungs-Bookkeeping (Seq-Wächter, Buckets) umständlich; die Klasse kapselt den Zustand und bleibt über die Aktionsliste genauso testbar. |
| Socket.IO / uWebSockets.js | Eigenes Protokoll bzw. native Abhängigkeit; `ws` ist Standard, reines JS und deckt alles ab. |
| Eigener WebSocket-Port | Zweite Firewall-Freigabe und zweite URL im QR-Code; widerspricht B9. |
| Token pro Slot | Ein iPad müsste mehrere Tokens verwalten; ein Token pro Verbindung passt zu „eine Verbindung ↔ n Slots“ (A9). |
| Festes Budget pro Verbindung | Ein geteiltes iPad mit 4 Spielern würde gedrosselt, obwohl jeder Spieler nur 60 Hz sendet. |
| Zweiten Host übernehmen lassen (alten trennen) | Ein zweiter Browser-Tab könnte die laufende Anzeige kapern; „erster Host gewinnt, neuer erst nach Trennung“ ist vorhersehbar. Ein hängender Host-Tab wird über Heartbeat-Timeouts (CHAOS-12) frei. |

## Konsequenzen

**Positiv**
- Alle Regeln sind als schnelle, deterministische Unit-Tests abgedeckt (`session.test.ts`); die Integrationstests (`socket.test.ts`) prüfen nur noch Transport, gleichzeitige Clients und Close-Codes.
- Dasselbe Protokoll für iPhones, geteiltes iPad und gemischte Aufstellungen (A9), inklusive Reconnect aller Slots mit einem Token.
- Der Server-Build ist eine einzelne ESM-Datei: `ws` wird mitgebündelt; ein `createRequire`-Banner stellt `require` für dessen Node-Module bereit, die optionalen nativen Beschleuniger (`bufferutil`, `utf-8-validate`) sind extern und fehlen bewusst (`ws` fällt auf JavaScript zurück).

**Negativ / Risiken**
- Reservierte Slots verfallen in M1 nie: Wer sein Token verliert (z. B. privater Tab geschlossen) und neu beitritt, belegt einen weiteren Slot. Abhilfe in CHAOS-12 (Token-Ablauf/Freigabe durch Host).
- Keine Prüfung des `Origin`-Headers: Eine fremde Webseite im Browser des PCs könnte sich als Host verbinden, solange noch keiner verbunden ist. Im LAN-Prototyp akzeptiert; bei Bedarf Origin-Positivliste (Host-/Controller-Dev-Server und LAN-URL).
- Verbindungen ohne Handshake und hängende Verbindungen bleiben offen, bis der Client schließt; kein Backpressure-Umgang bei langsamem Host (`bufferedAmount`).
- Join-Code-Raten ist pro Verbindung auf 20 Versuche begrenzt, aber nicht global (neue Verbindungen); im LAN mit 4 Zeichen (32⁴ ≈ 1 Mio.) akzeptiert.

**Offen für CHAOS-12 (Reconnect/Heartbeat):** Heartbeat-Timeout für Controller und Host (Grundlage: `lastSeenAt` je Spieler; ws-Ping optional), Timeout für Verbindungen ohne Handshake, Token-Ablauf bzw. Slot-Freigabe, Client-Auto-Reconnect mit gespeichertem Token, ggf. Token-Rotation beim Reconnect. Für CHAOS-11: `joinUrl` wird als Option an `createChaosServer` übergeben und erscheint in `lobby`.

## Überprüfung

Neu bewerten, wenn Geräte-Tests (CHAOS-15) Drosselung bei normalem Spiel zeigen, wenn Latenzmessungen (B6) die JSON-Verarbeitung als Engpass ausweisen, wenn mehrere Sessions pro Prozess nötig werden oder wenn M2 weitere Phasen/Layouts einführt.
