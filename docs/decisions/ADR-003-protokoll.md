# ADR-003: Controller-Protokoll (typisiert, versioniert, laufzeitvalidiert)

**Status:** Angenommen
**Datum:** 2026-11-14
**Aufgabe:** CHAOS-7
**Betroffene Annahmen:** `docs/assumptions.md` A9, B8, B10

## Kontext

Controller (iPhone, geteiltes iPad), Server und Host (PC-Browser) tauschen Nachrichten über **einen** WebSocket-Endpunkt aus (ADR-001, ADR-002/B9). `ARCHITECTURE.md` („Session and controller protocol“) verlangt versionierte, typisierte und zur Laufzeit validierte Nachrichten, die Intents `join`, `ready`, `move`, `press`, `release`, `gesture`, `reaction`, `heartbeat`, `reconnect` sowie pro Controller Phase, verfügbare Aktionen, Layout und Rückmeldung. Gefälschte Spieler-IDs, Doppel-Joins, Eingaben außerhalb der Phase und veraltete Eingaben müssen abgewiesen werden. Ein geteiltes iPad bedient 2–4 Spieler über **eine** Verbindung (A9). Client-Uhren sind nicht vertrauenswürdig (B8). Join-Code + Token genügen im LAN, Missbrauch wird serverseitig abgewiesen (B10).

Das Paket `@chaos-party/protocol` wird von Server, Controller und Host gleichermaßen importiert; es enthält nur Schemas, Typen und reine Funktionen, keinen Netzwerkcode.

## Entscheidung

**Bibliothek:** zod v4 (MIT). Schemas sind die einzige Quelle; alle TypeScript-Typen werden mit `z.infer` abgeleitet.

**Umschlag:** JSON-Text, ein flaches Objekt pro Nachricht mit `v` (Protokollversion, Literal `PROTOCOL_VERSION = 1`) und `type` (Diskriminator, `z.discriminatedUnion`). Alle Objekte sind **strikt**: unbekannte Felder (auch `__proto__`, `constructor`, `playerId` …) führen zur Ablehnung.

**Parser werfen nie.** `parseClientMessage`, `parseControllerMessage`, `parseHostMessage`, `parseServerMessage`, `parseServerToControllerMessage`, `parseServerToHostMessage` nehmen einen JSON-String oder einen bereits geparsten Wert und liefern `{ ok: true, message } | { ok: false, error: { code, message } }`. Reihenfolge der Prüfung, jeweils mit eigenem Code:

1. String länger als `MAX_MESSAGE_LENGTH` (4096 Zeichen) → `too-large`, ohne JSON zu lesen.
2. Kein JSON / kein Objekt / `v` fehlt → `bad-message`.
3. `v` ≠ 1 → `version-mismatch` (vor jeder Schemaprüfung, damit alte Clients einen eindeutigen Hinweis „Seite neu laden“ bekommen).
4. Schema verletzt → `bad-message` (Text gekürzt auf 200 Zeichen).

**Rollen-Handshake:** Es gibt kein eigenes `hello`. Die **erste** Nachricht einer Verbindung legt die Rolle fest (`handshakeRole`): `join` oder `reconnect` → Controller, `host-hello` → Host; alles andere → `not-joined`. Danach parst der Server mit dem rollenspezifischen Parser, sodass ein Controller kein `start` senden und der Host keine Eingaben fälschen kann.

**Verbindung ↔ Slots (A9):** Eine Controller-Verbindung besitzt 1–4 Slots. `join { joinCode, seats: 1..4, names? }` → `welcome { sessionToken, players: [{ slot, color, label }] }`. Jede Eingabe nennt ihren `slot` (1–4); der Server prüft, dass er der Verbindung gehört (`not-your-slot`). `reconnect { sessionToken }` stellt alle Slots des Tokens wieder her. Tokens sind serverseitig erzeugte, undurchsichtige base64url-Strings (16–128 Zeichen); das Protokoll prüft nur die Form. Join-Codes: 4–8 Zeichen `A–Z0–9`. Farben/Bezeichnungen der Slots stehen als Konstanten in `PLAYER_SLOTS` (Okabe-Ito-Palette plus Symbol als farbunabhängige Kennung).

**Sequenznummern (B8):** Jede Slot-Eingabe (`ready`, `move`, `press`, `release`, `gesture`, `reaction`) trägt `seq`, eine nicht-negative sichere Ganzzahl, die **pro Verbindung** über alle Slots streng steigt. Der Server hält je Verbindung einen `createSeqGuard()`; nur `seq > last` wird angenommen, sonst `stale-seq`. Lücken sind erlaubt. Eine neue Verbindung (auch nach `reconnect`) beginnt mit neuem Wächter. `heartbeat { t }` spiegelt die Client-Uhr nur zurück (`heartbeat-ack { t }`); Zeitbezug für Spiellogik ist ausschließlich die Server-Empfangszeit (`input.at`).

**Eingabewerte:** `move { x, y }` mit endlichen Zahlen in [-1, 1] und Vektorlänge ≤ 1 + 0,001; Knöpfe `a | b`; Gesten `swipe-up | swipe-down | swipe-left | swipe-right`; `reaction { windowId }` als nicht-negative Ganzzahl. Anzeigetexte (Namen ≤ 16, Labels ≤ 24 Zeichen) ohne Steuer-/Bidi-Zeichen und ohne Rand-Leerraum.

**Phasen (M1):** `lobby | play`. Reine Funktion `isIntentAllowed(phase, type)`: Lobby erlaubt `join`, `reconnect`, `ready`, `heartbeat`, `host-hello`, `start`; Play erlaubt `reconnect`, `move`, `press`, `release`, `gesture`, `reaction`, `heartbeat`, `host-hello`. Sonst `out-of-phase`. Spätes Beitreten während `play` ist in M1 nicht vorgesehen.

**Server → Controller:** `welcome`, `context { slot, phase, layout, actions[] }`, `feedback { slot, kind }`, `error { code, message, seq? }`, `heartbeat-ack { t }`. **Server → Host:** `lobby { joinCode, joinUrl?, phase, players[{ slot, color, label, connected, ready }] }` (Schnappschuss, auch in `play`), `input { intent, at }` mit der geprüften Eingabe ohne Umschlag, `error`, `heartbeat-ack`. **Host → Server:** `host-hello`, `start`, `heartbeat`.

**Fehlercodes:** `bad-message`, `too-large`, `version-mismatch`, `not-joined`, `bad-join-code`, `session-full`, `bad-token`, `host-taken`, `not-your-slot`, `out-of-phase`, `stale-seq`, `rate-limited`, `internal`.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| valibot | Kleineres Bundle durch Tree-Shaking, aber weniger verbreitet, weniger Beispiele; der Größenvorteil ist im LAN (Controller lädt einmal) unerheblich. Bei Bedarf wäre `zod/mini` der erste Schritt. |
| Handgeschriebene Validatoren | Kein Abhängigkeitsrisiko, aber Typen und Prüfungen laufen auseinander; jede Nachricht doppelt pflegen ist fehleranfällig – gerade bei sicherheitsrelevanter Eingabeprüfung. |
| Verschachtelter Umschlag `{ v, type, payload }` | Eine Ebene mehr ohne Nutzen; flache Objekte sind kürzer, lesbarer in Logs und lassen sich genauso diskriminieren. |
| Eigenes `hello { role }` vor `join` | Zusätzlicher Roundtrip und ein weiterer Zwischenzustand; `join`/`reconnect`/`host-hello` bestimmen die Rolle eindeutig. |
| Eine Verbindung pro Slot (iPad öffnet n WebSockets) | Vier Verbindungen pro iPad, getrennte Reconnects, Zuordnung der Zonen zu Verbindungen im Browser aufwendiger; widerspricht dem Ziel „ein Protokoll für alle Aufstellungen“ (A9). |
| `seq` pro Slot statt pro Verbindung | Mehr Zustand ohne Vorteil; eine Verbindung sendet ohnehin in Reihenfolge, ein Zähler genügt. |
| Client-Zeitstempel für veraltete Eingaben | Uhren nicht synchron und manipulierbar (B8). |
| Nachsichtige Objekte (unbekannte Felder ignorieren) | Vorwärtskompatibel innerhalb einer Version, aber verdeckt Manipulation und Tippfehler; da alle Teile gemeinsam ausgeliefert werden, bringt Nachsicht nichts. Inkompatible Änderungen erhöhen `PROTOCOL_VERSION`. |

## Konsequenzen

**Positiv**
- Ein Vertrag für drei Apps; Änderungen am Schema schlagen sofort als Typfehler in Server, Controller und Host durch.
- Missbrauchsfälle (Slot 0/5, NaN/Infinity, zu lange Vektoren, Zusatzfelder, Prototype-Pollution-Schlüssel, Riesen-Nachrichten, alte Versionen, vertauschte `seq`) sind als Unit-Tests abgedeckt.
- Geteiltes iPad, iPhones und gemischte Aufstellungen nutzen dasselbe Protokoll.

**Negativ / Risiken**
- zod vergrößert die Bundles (Server-Bundle, Controller/Host sobald sie validieren); bei messbar spürbarer Ladezeit auf `zod/mini` umstellen.
- Strikte Schemas: Jede neue Nachricht oder jedes neue Feld braucht eine koordinierte Auslieferung aller Teile (im Monorepo gegeben).
- `MAX_MESSAGE_LENGTH` zählt UTF-16-Zeichen, nicht Bytes; der Server sollte zusätzlich `maxPayload` am WebSocket setzen (CHAOS-9).
- Rate-Limits, Slot-Besitz und Token-Gültigkeit prüft der Server (CHAOS-9); das Protokoll liefert nur Codes und reine Bausteine.

## Überprüfung

Neu bewerten, wenn Messungen in M1 (B6) zeigen, dass JSON/Validierung messbar Latenz kostet, wenn das Controller-Bundle auf echten Geräten spürbar langsam lädt, oder wenn M2/M3 weitere Phasen und Eingabearten brauchen (dann `PHASES`/`ACTIONS` erweitern und `PROTOCOL_VERSION` erhöhen).
