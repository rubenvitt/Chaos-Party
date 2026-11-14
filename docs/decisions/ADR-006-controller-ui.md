# ADR-006: iPhone-Controller – Client/Reducer/UI-Schnitt, Joystick per Pointer Events, iOS-Härtung, Test mit nachgebautem Server

**Status:** Angenommen
**Datum:** 2026-11-14
**Aufgabe:** CHAOS-10
**Betroffene Annahmen:** `docs/assumptions.md` A4, A5, A6, A7, B5

## Kontext

CHAOS-10 bringt den iPhone-Controller: eine React-Web-App ohne Spielwelt-Rendering, deren Bildschirm dem Kontext des Servers folgt (`context { phase, layout, actions }`, ADR-003). Sie braucht große Touch-Ziele, eine klare Spielerkennung, Hoch- und Querformat und darf beim Spielen weder zoomen noch scrollen noch Text markieren. Zwei Folgeaufgaben bauen direkt darauf auf und bestimmen den Schnitt mit:

- **CHAOS-12** (Wiederverbinden): automatisches Wiederverbinden mit Backoff und Statusanzeige.
- **CHAOS-13** (geteiltes iPad): mehrere Spielerzonen über **eine** Verbindung (`seats` 2–4, A9).

Der echte Session-Server (CHAOS-9) entsteht parallel; die E2E-Tests dürfen nicht von ihm abhängen.

## Entscheidung

### Schichten

| Schicht | Datei(en) | Aufgabe |
|---|---|---|
| Startparameter | `src/config.ts` | `?code=` lesen/normalisieren, `CODE_LENGTH = 4`, `PHONE_SEATS = 1`. `?seats=`/`?mode=ipad` sind für CHAOS-13 reserviert und werden heute ignoriert. |
| Transport | `src/net/client.ts` | `createClient(url, handlers, socketFactory)`: ein WebSocket, prüft **jede** eingehende Nachricht mit `parseServerToControllerMessage` (ungültige → `onInvalid`, nie weitergereicht), `send()` für Handshake/Herzschlag, `sendIntent()` ergänzt `v` und `seq` (ein Zähler pro Verbindung über alle Slots, ADR-003/B8). `close()` meldet kein `onClose`. Kein React. |
| Sitzung | `src/net/session.ts` | `createControllerSession({ url, seats, tokens, … })`: Handshake (`reconnect` mit gemerktem Token, sonst `join { joinCode, seats }`), `bad-token` → Token vergessen, neue Verbindung mit `join`; Herzschlag alle 5 s; `subscribe`/`getState` für `useSyncExternalStore`; `join(code)`, `retry()`, `sendIntent()`, `dismissNotice()`, `dispose()`. |
| Token | `src/net/tokenStore.ts` | `sessionStorage` (pro Tab, übersteht Neuladen), jeder Zugriff in `try/catch`; Token gilt nur für denselben Join-Code. |
| Zustand | `src/state/reducer.ts` | Reiner Reducer `reduce(state, event)` für `welcome`, `context`, `feedback`, `error`, `heartbeat-ack` und Verbindungsereignisse; Kontexte und Rückmeldungen **pro Slot**; `selectScreen()` wählt `code-entry | connecting | error | controller`. |
| Fehler | `src/state/errors.ts` | Code → deutscher Text und Schwere (`silent`, `toast`, `code`, `blocking`); die technische `message` des Servers wird nie angezeigt. |
| Eingabe | `src/input/joystick.ts`, `src/input/moveSender.ts` | Reine Joystick-Mathematik und Drosselung (siehe unten). |
| UI | `src/ui/*`, `src/App.tsx` | `SlotController` (eine Spielerfläche: Plakette, Lobby/Warten/Spiel je nach `layout`, nur Aktionen aus `actions`), `Joystick`, `ActionButton`, Bildschirme für Code-Eingabe, Verbinden, Fehler und Toast. `App` zeigt im iPhone-Modus den ersten Slot aus `welcome`. |

Die Sitzung wird in `main.tsx` einmal pro Seite erzeugt (nicht in einem React-Effekt), damit StrictMode keine Doppelverbindungen öffnet.

**Nahtstellen für Folgeaufgaben**

- CHAOS-12: `session.ts` → `onClose` (markiert mit „CHAOS-12“) ist die Stelle für automatisches Wiederverbinden; heute zeigt der Controller „Verbindung weg“ mit Knopf „Neu verbinden“ (`retry()`, nutzt das Token). Nach Neuladen der Seite wird automatisch `reconnect` gesendet.
- CHAOS-13: `createControllerSession({ seats: n })` und mehrere `<SlotController>` nebeneinander; Reducer und Client sind bereits mehrslotfähig, `send` jeder Fläche setzt ihren eigenen `slot`.

### Joystick und Knöpfe

- **Pointer Events mit Pointer-Capture** statt Touch Events: ein Modell für Touch, Maus und Stift; `pointerId` trennt Finger sauber, `pointercancel` und `lostpointercapture` decken abgebrochene Gesten (Drehen, Systemgesten) ab. Jeder Joystick und jeder Knopf folgt genau einem Finger; weitere Finger auf demselben Element werden ignoriert. Für das geteilte iPad mit 2–4 Zonen entscheidet CHAOS-13 neu (bekannte iOS-Grenzen bei vielen gleichzeitigen Touches), die Komponenten sind dafür schon fingergetrennt.
- **Schwebender Ursprung:** Der Ring springt dorthin, wo der Daumen in der (großen) Joystick-Zone aufsetzt; ohne Hinschauen bedienbar.
- **Mathematik** (`stickFromOffset`): Versatz / Radius, Bildschirm-y gespiegelt (oben = vorn = **+y**, wie in der Host-Szene), Länge auf 1 begrenzt, Totzone 0,12 mit stetiger Neuskalierung, Werte **zur Null hin** auf 0,01 abgeschnitten – damit bleibt die Länge nach dem Runden garantiert ≤ 1 (der Server lehnt > 1,001 ab).
- **Senderate** (`planMoveSend`/`createMoveSender`): nur bei Änderung, höchstens alle 33 ms (≈ 30 Hz), der letzte Zwischenwert wird per Timer nachgeliefert; Loslassen (`{0, 0}`) geht **sofort** raus.
- **Knöpfe:** `press` bei `pointerdown`, `release` bei `pointerup`/`pointercancel`/`lostpointercapture`/`pointerleave`.
- **Unterbrechungen:** Bei `blur`, `pagehide`, `visibilitychange → hidden` und beim Verschwinden der Komponente (neuer Kontext ohne diese Aktion) lassen Joystick und Knöpfe selbst los und senden `{0, 0}` bzw. `release` – sonst liefe eine Figur nach App-Wechsel weiter.
- Darstellung des Joysticks per direktem `transform` (kein React-Rendern pro Bewegung), reines DOM/CSS, kein Canvas/WebGL (A7).

### Code-Eingabe

Ohne gültigen `?code=` (4–8 Zeichen `A–Z0–9` nach Großschreibung) erscheint ein großes Eingabefeld: `autocapitalize="characters"`, keine Autokorrektur, Schriftgröße ≥ 16 px (sonst zoomt iOS beim Fokussieren). Eingaben werden normalisiert; bei vier Zeichen wird automatisch verbunden und der Code per `history.replaceState` in die URL geschrieben (Neuladen findet die Sitzung wieder). Ein falscher Code (`bad-join-code`) führt mit Hinweis zurück zur Eingabe.

### iOS-Härtung (A4/A5)

- CSS: `touch-action: none` (Eingabefeld: `manipulation`), `user-select: none`, `-webkit-touch-callout: none`, `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: none`, `body { position: fixed }`, `text-size-adjust: 100%`, Viewport mit `user-scalable=no, viewport-fit=cover` und Safe-Area-Abständen.
- JS (`src/ui/iosGuards.ts`): `preventDefault` auf `gesturestart/-change/-end`, `dblclick`, `touchmove` (außer in Eingabefeldern; bei mehreren Fingern immer), `contextmenu` und `selectstart` außerhalb von Eingabefeldern.
- Nicht umgesetzt: Schutz gegen die Safari-Zurück-Wischgeste per History-Trick (A5). Ein versehentliches Verlassen fängt das Token-Wiederverbinden nach Neuladen ab; ob die Geste im Spiel stört, zeigt der Gerätetest.
- Keine Secure-Context-APIs (B5): verwendet werden WebSocket, Pointer Events, `sessionStorage`, `history.replaceState`.

### Darstellung

Stil wie der Host (Himmelverlauf, dicke Tinte-Kontur `#1b1530`, harte Schatten, runde Schrift). Spielerfarbe als 10-px-Rahmen, Plakette mit Farbe, Symbol aus `PLAYER_SLOTS` (farbunabhängig) und Bezeichnung; Textfarbe auf der Plakette nach WCAG-Kontrast gewählt. Ziele: Bereit-Knopf ≥ 96 px hoch, A ≥ 96 px, B ≥ 80 px, Joystick-Zone füllt ihre Hälfte. Hochformat: Knöpfe oben, Joystick unten. Querformat: Joystick links, Knöpfe rechts, Plakette klein oben rechts.

### Tests

- **Unit (Vitest, ohne DOM):** Joystick-Mathematik (inkl. Schema-Prüfung über viele Winkel), Drosselung mit künstlicher Uhr, Reducer, Fehlertexte, Client (seq, Validierung, Schließen) und Sitzung (Handshake, Token, `bad-token`, Herzschlag, Verbindungsverlust) mit nachgebautem Socket.
- **E2E (Playwright):** Projekte `iphone-hoch` (`devices['iPhone 13']`) und `iphone-quer` (`devices['iPhone 13 landscape']`), jeweils in **Chromium** (CI installiert nur Chromium; WebKit-Emulation ersetzt ohnehin kein echtes iOS). Gegen den **Production-Build** (`vite build` + `vite preview` auf Port 4174).
- **Nachgebauter Server:** `tests/e2e/fixtures/fakeSession.ts` fängt `/ws` mit `page.routeWebSocket` im Browser ab und spricht den nötigen Teil von ADR-003 (`join` → `welcome` + Lobby-Kontext, `ready` → Spiel-Kontext, `reconnect`, `heartbeat-ack`, Fehler auf Zuruf). Jede empfangene Nachricht wird mit dem echten `parseControllerMessage` geprüft; Tests lesen die Nachrichten direkt im Prozess. Kein zusätzlicher Port, keine neue Abhängigkeit (kein `ws`), unabhängig vom Stand von CHAOS-9.
- **Echte Touches:** `tests/e2e/fixtures/touch.ts` schickt `Input.dispatchTouchEvent` per CDP (Ziehen, zwei Finger gleichzeitig). Einschränkung: CDP kann einen einzelnen Finger nur anheben, wenn kein anderer mehr liegt.
- Screenshots von Lobby und Spiel in beiden Ausrichtungen; Texte und Symbole maskiert (Schriften unterscheiden sich zwischen Rechnern, wie ADR-004). Ungemaskierte Belege: `CONTROLLER_BELEG=1 pnpm test:e2e` schreibt `docs/screenshots/m1-controller-lobby.png` und `docs/screenshots/m1-controller-play-landscape.png`.

### Was nur ein echtes Gerät zeigt

Doppeltipp-/Pinch-Zoom, Lupe und Callout bei langem Drücken, Gummiband und Pull-to-Refresh, Zurück-Wischgeste vom Rand (A5), Verhalten beim Drehen mitten im Spiel (A6), gleichzeitige Touches mehrerer Finger, Eingabelatenz und Flüssigkeit auf älteren iPhones (A7), Tastaturverhalten der Code-Eingabe. Die Emulation prüft nur DOM-Ereignisse und Layout; diese Punkte gehören in `docs/device-test-checklist.md`.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Touch Events (`touchstart`/`touchmove`) | Eigene Fingerzuordnung über `changedTouches`, kein Capture, Maus für Desktop-Tests extra; Pointer Events decken alles ab. Für das iPad (CHAOS-13) bleibt die Frage offen. |
| Fester Joystick-Ursprung | Daumen muss die Mitte treffen; schwebender Ursprung ist auf Handys üblicher und verzeiht mehr. |
| `move` bei jedem Pointer-Ereignis | 60–240 Nachrichten/s pro Spieler; der Server würde drosseln (`rate-limited`), ohne spürbaren Gewinn. |
| Joystick-Werte runden statt abschneiden | (0,71; 0,71) ergäbe Länge 1,004 > 1,001 → Server lehnt ab. |
| Zustand in React-Context/useReducer | Sitzung und Zustand wären an React-Lebenszyklen gebunden (StrictMode-Doppelverbindungen); externer Store mit `useSyncExternalStore` bleibt testbar ohne DOM. |
| `localStorage` für das Token | Zwei Tabs auf einem Gerät würden sich ein Token teilen; `sessionStorage` reicht für Neuladen. Bei Bedarf entscheidet CHAOS-12 neu. |
| Echter Node-Fake-Server (`http` + `ws`) | Zusätzliche Abhängigkeit, eigener Port, Testzustand über HTTP abfragen; `routeWebSocket` ist deterministisch und liefert die Nachrichten direkt. Nachteil: Der echte Server wird hier nicht mitgetestet – das übernimmt ein Integrationstest nach CHAOS-9. |
| WebKit-Projekt mit `devices['iPhone 13']` | Nicht in CI installiert; WebKit unter Linux ist kein iOS-Safari. |

## Konsequenzen

**Positiv**
- Kontextgesteuertes Layout ist vollständig vom Server bestimmt; neue Layouts brauchen nur einen weiteren Zweig in `SlotController`.
- CHAOS-12/13 setzen an klar markierten Stellen an, ohne Client oder Reducer umzubauen.
- Alle gesendeten Nachrichten sind in Unit- und E2E-Tests gegen das Protokollschema geprüft.

**Negativ / Risiken**
- Die E2E-Tests beweisen nicht das Zusammenspiel mit dem echten Server (CHAOS-9) – ein gemeinsamer Integrationstest ist nötig, sobald beide zusammengeführt sind.
- Chromium-Emulation ≠ iOS-Safari; A4–A7 bleiben bis zum Gerätetest offen.
- Screenshot-Baselines mit DPR 3 sind auf Linux erzeugt; weichen CI-Runner ab, muss die Baseline einmal aus dem CI-Artefakt übernommen werden (wie ADR-004).

## Überprüfung

Neu bewerten, wenn der Gerätetest Zoom, Scrollen, Zurück-Geste oder Touch-Verluste zeigt, wenn 30 Hz auf dem Host spürbar ruckeln oder den Server überlasten, oder wenn CHAOS-13 für das iPad auf Touch Events wechselt.
