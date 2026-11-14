# ADR-009: Reconnect und Verbindungsanzeige – Herzschlag, Timeouts, Token-/Slot-Politik, Client-Backoff

**Status:** Angenommen
**Datum:** 2026-11-14
**Aufgabe:** CHAOS-12
**Betroffene Annahmen:** `docs/assumptions.md` A5, B7, B8

## Kontext

Handys verlieren im Wohnzimmer ständig kurz die Verbindung: iOS sperrt den Bildschirm oder friert Safari beim App-Wechsel ein, das WLAN wechselt den Access Point, jemand lädt die Seite neu oder scannt den QR-Code noch einmal (B7). ADR-005 hat Slots und Tokens eingeführt, aber offen gelassen: Wer merkt, dass eine Verbindung tot ist (ohne `close`)? Wie lange bleibt ein Platz reserviert? Wie kommt der Controller von selbst zurück, und was sieht der PC? ADR-006 hat dafür im Controller eine Naht (`onClose`) und ein manuelles „Neu verbinden“ vorgesehen.

Anforderungen aus CHAOS-12: Herzschlag erkennt Verbindungsverlust; der Host zeigt getrennte Spieler deutlich; Reconnect-Token pro Session; der Controller übernimmt nach Neuladen/Netzwechsel seinen alten Platz, zeigt den Verbindungsstatus und verbindet automatisch neu. Abnahme: Integrationstests für Abbruch, Reconnect, abgelaufenes/fremdes Token.

## Entscheidung

### Server: Lebenszeichen und Timeouts

Die transportfreie `Session` (ADR-005) bekommt `tick()`; der Adapter ruft es **jede Sekunde** auf (`tickMs`). Alle Grenzen sind injizierbar (`timeouts`, `now`) und mit künstlicher Uhr getestet.

| Grenze | Wert | Wirkung | Begründung |
|---|---|---|---|
| Handshake | **5 s** | Verbindung ohne `join`/`reconnect`/`host-hello` → Close **4004** | Ein echter Client schickt den Handshake im selben Moment wie `open`; 5 s decken auch ein langsames Handy ab. Hängende Sockets belegen sonst Plätze im Limit (64). |
| Controller-Stille | **15 s** | Keine Nachricht → Socket wird abgebrochen (`terminate`, Close-Code 4005 im Protokoll), Spieler `connected: false` | Controller senden alle 5 s `heartbeat` → drei verpasste Schläge. Kürzer würde bei WLAN-Aussetzern flattern, länger lässt einen eingefrorenen Tab zu lange „verbunden“ aussehen. |
| Host-Stille | **30 s** | wie oben, danach darf ein neuer Host übernehmen | Der PC-Tab kann im Hintergrund liegen (Browser drosseln Timer); 30 s vermeiden Flattern, lösen aber einen hängenden Host-Tab (ADR-005) in absehbarer Zeit. |
| Lobby-Schonfrist | **60 s** | Getrennter Controller in der **Lobby** → seine Slots werden frei, das Token wird ungültig | Reicht für Neuladen, App-Wechsel, kurzes WLAN-Loch; danach kann ein anderer Mensch den Platz nehmen. |

- **Jede** eingehende Nachricht zählt als Lebenszeichen (auch ungültige oder gedrosselte), nicht nur `heartbeat`.
- Kein `ws`-Ping/Pong als Lebenszeichen: Browser beantworten Pings auf Netzwerkebene auch dann, wenn die Seite eingefroren ist (iOS-Hintergrund). Ein solcher Controller wäre „verbunden“, aber nicht bedienbar.
- Stille Verbindungen werden mit `terminate()` abgebrochen statt mit Close-Handshake, der bei toter Gegenstelle bis zu 30 s hängen würde.

### Token- und Slot-Politik

- Das Token gilt nur für **diese Server-Session**: Ein Neustart des Servers erzeugt neue Tokens, alte ergeben `bad-token`. Ein Token aus einer anderen Server-Instanz ebenso. Ein Token mit falschem Format ist ein Schemafehler (`bad-message`).
- **Lobby:** Ein getrennter Platz bleibt 60 s reserviert (die Frist beginnt nach jedem Reconnect neu), danach Freigabe → `bad-token`. Ein Token hält alle Slots einer Verbindung (geteiltes iPad); sie werden gemeinsam frei und kommen gemeinsam zurück.
- **Spiel:** Plätze bleiben für die ganze Partie reserviert, auch Plätze, die schon in der Lobby getrennt waren. M1 hat kein Partieende; Freigabe im Spiel gibt es daher nicht. Neue Spieler können im Spiel weiterhin nicht beitreten (`out-of-phase`, ADR-003).
- `reconnect` mit gültigem Token übernimmt alle Slots des Tokens auf der neuen Verbindung; eine noch offene alte Verbindung wird mit **4003** geschlossen (ADR-005). Danach `welcome` + je Slot `context`, der Host bekommt `lobby` mit `connected: true`; die neue Verbindung beginnt mit frischem `seq`-Wächter. Keine Token-Rotation: Das Token verlässt nie das LAN, und Rotation würde das gleichzeitige Wiederverbinden zweier Tabs verkomplizieren.

### Controller: automatisches Wiederverbinden (`apps/controller/src/net/session.ts`)

- **Auslöser:** `close` des Sockets; **keine Server-Nachricht seit 10 s** (Herzschlag alle 5 s, der Server antwortet mit `heartbeat-ack`); **Verbindungsaufbau länger als 5 s** (iOS wartet bei unerreichbarem PC sonst sehr lange).
- **Backoff:** 0,5 s → 1 s → 2 s → 4 s → dann alle 5 s, jeweils **±20 %** Zufall (`backoffDelay`, rein, getestet), unbegrenzt viele Versuche. Ein Versuch im LAN ist billig; ±20 % verhindern, dass alle Handys nach einem Server-Neustart im Gleichschritt anklopfen.
- **Aufwachen:** `visibilitychange → visible`, `online` und `pageshow` (Back-Forward-Cache) prüfen sofort: Bei offenem Socket ein Probe-Herzschlag, dessen Antwort binnen **2 s** kommen muss (nach iOS-Sperre wirkt ein Socket oft offen, ist aber tot); während einer Wartezeit sofort neuer Versuch. Die Signale sind injizierbar (`wake`), Unit-Tests laufen ohne DOM.
- **Handshake:** gemerktes Token → `reconnect`; `bad-token` → Token vergessen, sofort `join` mit dem gemerkten Code.
- **Aufgeben** (kein automatischer Versuch mehr, Fehlerbildschirm mit „Neu verbinden“): falscher Code (zurück zur Eingabe), Spiel voll, neue Version, Neubeitritt im laufenden Spiel abgelehnt (`game-running`), Platz von einem anderen Tab/Gerät übernommen (Close 4003, `replaced`). Bei 4003 wäre Weiterversuchen schädlich: Zwei Tabs würden sich den Platz gegenseitig wegnehmen.
- **Eingaben** gehen nur mit beigetretener Verbindung raus (`welcome` erhalten); während der Trennung liefert `sendIntent` `false`.
- **Token-Speicher: `localStorage` statt `sessionStorage`** (ändert ADR-006): Die iOS-Kamera öffnet jeden QR-Scan in einem **neuen** Tab. Mit `sessionStorage` fehlte dort das Token, und wer im Spiel neu scannt, käme nicht mehr auf seinen Platz. Der neue Tab übernimmt den Platz, der alte zeigt „Dein Platz wird gerade in einem anderen Fenster … gespielt“ (4003). Die Platzzahl trennt weiterhin `tokenScope.ts` (CHAOS-13).
- Die API bleibt platzunabhängig: `createControllerSession({ seats })` für iPhone und iPad; neue Optionen `connectTimeoutMs`, `deadAfterMs`, `probeTimeoutMs`, `random`, `wake`; `retry()` heißt jetzt „Jetzt neu verbinden“ und nimmt nach dem Aufgeben das automatische Wiederverbinden wieder auf.

### Controller: Anzeige

- Reducer: `socket-closed` erzeugt **keinen** Fehlerbildschirm mehr; neue Ereignisse `reconnect-scheduled { attempt }` und `gave-up { reason }`; `selectScreen` zeigt den Controller weiter, sobald Spieler bekannt sind; `selectLink` liefert `hidden | connecting | online | reconnecting { attempt, hadSession }`.
- `ui/ConnectionStatus.tsx` (in `App` für iPhone- und iPad-Modus): verbunden → kleine Pille „verbunden“ oben links (ohne Touch-Fläche); getrennt → großes Overlay „Verbindung verloren – verbinde neu … (Versuch n)“ bzw. „Spiel-PC nicht erreichbar“ vor dem ersten Beitritt, Knopf „Jetzt neu verbinden“, ab Versuch 5 ein WLAN-Hinweis. Das Overlay fängt alle Touches ab.
- Beim Abriss löst `ConnectionStatus` das Fensterereignis `chaos:connection-interrupted` aus; `useInterruption` behandelt es wie einen Fokusverlust: Joystick und Knöpfe (iPhone) bzw. der Zonen-Tracker (`cancelAll`, iPad) lassen los. Nach dem Wiederverbinden steht jeder Stick auf null, ein noch liegender Finger steuert nichts mehr, bis er neu greift.

### Host

- `hostConnection.ts`: Herzschlag alle **5 s**; ohne Server-Nachricht seit **15 s** gilt die Verbindung als tot → neu verbinden (alle 2 s wie bisher). Sichtbar-Werden der Seite/`online`: Probe-Herzschlag (2 s) bzw. sofortiger Versuch. Nach dem Wiederverbinden schickt der Server auf `host-hello` die aktuelle `lobby` (Phase, Spieler) – der Stand ist wiederhergestellt.
- Getrennte Spieler: Chip im HUD und Zeile in der Lobby grau, gestrichelt, „⚠ getrennt“ in Warnorange (farbunabhängig); die Figur ist halbtransparent und trägt ein schwebendes **„!“** in Warnorange; ihr Stick wird auf null gesetzt.
- Große Meldungen oben mittig (4 s): „Blau hat die Verbindung verloren“, „Blau ist wieder da“, „Platz von Blau ist wieder frei“ – abgeleitet aus aufeinanderfolgenden `lobby`-Schnappschüssen (`diffPlayers`, rein, getestet).

### Protokoll

Keine Änderung an `packages/protocol`. Neue Close-Codes nur im Server: **4004** Handshake-Timeout, **4005** Herzschlag-Timeout (bei `terminate` sieht der Client 1006). Der Controller kennt 4003 als eigene Konstante.

### Tests

- Server-Unit (künstliche Uhr): Handshake-Timeout, Herzschlag-Timeout (Controller 15 s, Host 30 s, jede Nachricht zählt), Lobby-Schonfrist (Freigabe, `bad-token`, Platz neu vergeben, Neustart der Frist, iPad-Token gemeinsam), Reservierung im Spiel (10 min), fremdes/kaputtes Token, frischer `seq`-Wächter, ersetzte Verbindung.
- Server-Integration (echte `ws`-Clients): `terminate()` → Host sieht getrennt → Reconnect → Eingaben fließen; stiller Client wird getrennt; Herzschlag hält am Leben; Handshake-Timeout 4004; Reconnect nach Schonfrist → `bad-token` + Neubeitritt; Token nach Server-Neustart → `bad-token`.
- Controller-Unit (Fake-Socket, Fake-Timer): Backoff-Folge, Wachhund, Aufbau-Timeout, Aufwachen, 4003, `game-running`, `session-full`, keine Eingaben ohne `welcome`; Reducer/`selectLink`.
- E2E `tests/e2e/reconnect-slot.spec.ts` gegen einen **eigenen** Server im Testprozess (Production-Builds, Port 0), weil die gemeinsame E2E-Session nach `host-lobby.spec.ts` im Spiel ist: Abbruch per `routeWebSocket` → Overlay mit „Versuch 2“ → Host „getrennt“ + Meldung → automatischer Reconnect auf denselben Platz → Host „wieder da“ → Knopf A kommt an; Neuladen behält den Platz; zweiter Tab übernimmt (4003, alter Tab drängelt nicht); geteiltes iPad: beide Plätze zurück, gehaltener Joystick losgelassen.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Lebenszeichen per `ws`-Ping/Pong | Browser antworten auch bei eingefrorener Seite; der Platz sähe verbunden aus, obwohl niemand steuern kann. |
| Timer pro Verbindung im Adapter | Zeitlogik verteilt auf zwei Schichten, Tests bräuchten echte Zeit; ein `tick()` in der Session ist deterministisch testbar. |
| Slots nie freigeben (ADR-005) | Wer sein Token verliert (Tab zu, Inkognito), blockiert in der Lobby einen Platz für immer. |
| Slots auch im Spiel nach einer Frist freigeben | Ohne Partieende/Spätbeitritt in M1 gewinnt niemand etwas; ein Spieler mit langem Funkloch verlöre seinen Platz und seine Figur. |
| Freigabe nur per Host-Knopf | Zusätzliche UI und Entscheidung am PC; die automatische Frist deckt den Normalfall ab. Kann später ergänzt werden. |
| Fester Retry-Takt (wie Host, 2 s) | Nach Server-Neustart klopfen alle Handys synchron; ohne schnellen ersten Versuch dauert die Rückkehr unnötig lange. |
| Exponentiell ohne Deckel / Aufgeben nach n Versuchen | Im LAN bringt längeres Warten nichts; die Spieler wollen weiterspielen, sobald der PC wieder da ist. Der Knopf „Jetzt neu verbinden“ bleibt ohnehin. |
| `sessionStorage` behalten | QR-Neuscan öffnet einen neuen Tab ohne Token → Platz im Spiel verloren. |
| Fehlerbildschirm statt Overlay | Der Controller verschwände bei jedem Aussetzer; das Overlay hält den Kontext sichtbar und erklärt den Zustand. |

## Konsequenzen

**Positiv**
- Neuladen, App-Wechsel, Bildschirmsperre, QR-Neuscan und kurze WLAN-Löcher führen ohne Zutun auf denselben Platz zurück; der PC zeigt jederzeit, wer fehlt.
- Alle Zeitgrenzen sind Zahlen an einer Stelle und mit künstlicher Uhr getestet.
- iPhone und geteiltes iPad nutzen dieselbe Sitzung, dieselbe Anzeige und dieselbe Loslass-Logik.

**Negativ / Risiken**
- Bis ein still gestorbener Controller am PC als getrennt erscheint, vergehen bis zu 15–16 s (Herzschlag-Timeout + Tick). Ein `close` (Neuladen, Tab zu, Netz meldet Abbruch) wirkt sofort.
- Getrennte Spieler bleiben im Spiel bis zum Ende reserviert (M1 ohne Partieende): Ein dauerhaft verschwundener Spieler bleibt als halbtransparente Figur mit „!“ stehen.
- `localStorage`: Zwei Tabs auf demselben Gerät teilen sich das Token (der neuere gewinnt). Bewusst so; ein zweiter Spieler auf demselben Handy ist kein Anwendungsfall.
- Hintergrund-Tabs am PC: Drosselt der Browser Timer stark (z. B. nach Minuten im Hintergrund), kann der Host nach 30 s getrennt und beim Sichtbar-Werden sofort neu verbunden werden. Ohne Host werden Eingaben verworfen (ADR-005).
- Ob iOS Safari nach Sperre/App-Wechsel wirklich `visibilitychange` liefert und den Socket schließt oder einfriert, zeigen nur echte Geräte.

**Nur auf echten Geräten prüfbar** (Gerätecheckliste): Bildschirm sperren und entsperren (Platz kommt zurück, Overlay kurz sichtbar), App-Wechsel und zurück, Safari-Tab im Hintergrund minutenlang, WLAN aus/an und Wechsel zwischen Access Points, Flugmodus, Neuladen und QR-Neuscan im laufenden Spiel, Zurück-Wischgeste mit anschließendem Vorwärts (A5, Back-Forward-Cache), PC-Server neu starten (Controller treten neu bei bzw. bekommen „Spiel läuft schon“), Zeit vom Abriss bis zur Anzeige am PC.

## Überprüfung

Neu bewerten, wenn der Gerätetest zeigt, dass iOS Sockets nach dem Aufwachen länger als die Probe-Frist hängen lässt, dass die Anzeige am PC zu spät kommt (dann Controller-Stille senken), dass 60 s Lobby-Schonfrist zu kurz/lang sind, oder sobald M2 ein Partieende/Spätbeitritt einführt (dann Freigabe im Spiel neu regeln).
