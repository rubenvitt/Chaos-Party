# ADR-017: Native Controller-App in SwiftUI für iPhone und iPad, Browser-Controller bleibt Rückfall

**Status:** Vorgeschlagen (Entwurf; Vertrag steht, Umsetzung in zwei Arbeitspaketen folgt)
**Datum:** 2026-11-17
**Aufgabe:** CHAOS-115
**Betroffene Annahmen:** ADR-003 (Protokoll), ADR-006 (Controller-UI), ADR-007 (QR-Join), ADR-008 (iPad-Zonen), ADR-009 (Reconnect)

## Kontext

Heute steuern die Spieler Chaos Party mit dem React-Controller im iPhone-Browser (`apps/controller`, ADR-006). Er wird vom Spiel-PC ausgeliefert, spricht per WebSocket das Protokoll v4 (ADR-003, `packages/protocol`) und ist gegen die üblichen Safari-Fallen gehärtet: Doppeltipp-Zoom, Scrollen, eingefrorene Tabs, Sperrbildschirm. Grenzen, die sich im Browser nicht lösen lassen: kein Vibrieren (iOS Safari kennt `navigator.vibrate` nicht), kein verlässliches Wachhalten des Bildschirms, Browserleisten und Gesten am Rand, keine Kamera-Integration ohne den Umweg über die Kamera-App, die jeden QR-Scan in einem neuen Tab öffnet (siehe `net/tokenStore.ts`).

**Entscheidung von Ruben (17.11.2026):** Es gibt eine eigene SwiftUI-App für iPhone und iPad, die dasselbe Protokoll in der Rolle `controller` spricht. Der Browser-Controller bleibt als Rückfall bestehen. Der Server bleibt die Vertrauensgrenze und prüft weiter jede Nachricht; die App bekommt keine Sonderrechte.

Die Säulen bleiben unberührt: Das Spiel läuft auf dem PC, iPhones und iPads sind nur Controller, 2–4 Spieler lokal.

## Entscheidung

### Ort und Projekt

- **Ordner `apps/controller-ios/`**, außerhalb des pnpm-Workspace (kein `package.json`). `pnpm install`, `pnpm check` und die CI bleiben unberührt.
- **xcodegen:** `apps/controller-ios/project.yml` ist die Quelle, das `.xcodeproj` wird erzeugt und nicht eingecheckt, wie beim RealityKit-Spike (`spikes/renderer-realitykit/project.yml`, CHAOS-78).
- **iOS/iPadOS 26+**, Swift 6 (strikte Nebenläufigkeit), nur Apple-Frameworks (Foundation, SwiftUI, Observation, Network, VisionKit/AVFoundation). Keine Fremdabhängigkeiten.
- **Bundle-ID `dev.rubeen.chaosparty.controller`**, Tests `dev.rubeen.chaosparty.controller.tests`. Alle weiteren Reverse-DNS-Kennungen liegen unter `dev.rubeen.*`.
- Aufbau: `Sources/Protocol/` ist der **Vertrag** (Nachrichten, Join-Ziel, Sitzungs-Schnittstelle, Fake), `Sources/Net/` die echte Sitzung, `Sources/UI/` die Bildschirme, `Tests/` mit `Tests/Fixtures/` als generiertem Korpus.

### Protokoll in Swift

- `Sources/Protocol/Messages.swift` bildet jede Nachricht der Controller-Rolle aus `schemas.ts` ab: Feldnamen und JSON-Form sind identisch, die Version ist `4`.
  - **Eingehend:** `welcome`, `context` (mit `prompt`, `board`, `minigame`, `lobby`), `feedback`, `error`, `heartbeat-ack`.
  - **Ausgehend:** `join` (mit `names`), `reconnect`, `heartbeat`, `ready`, `pick-character`, `choose`, `move`, `press`, `release`, `gesture`, `reaction`.
- **Prüfreihenfolge wie `parseWith`:** Größe (65 536 UTF-16-Zeichen) → JSON-Objekt → `v` vorhanden → `v == 4` → `type` → Nutzlast. Kaputte Nachrichten werfen `ProtocolDecodingError` und werden verworfen, wie im Web-Client (`onInvalid`). Sie bringen die App nie zum Absturz.
- **Bewusst nachsichtiger als zod**, damit ein neuerer Server die App nicht sofort bricht:
  - Ein unbekannter `type` wird zu `.unknown(type:)` und übersprungen.
  - Aufzählungsfelder sind offene Zeichenketten-Typen: Ein unbekannter Wert wie ein neuer `ErrorCode` oder eine neue `PromptKind` lässt nicht den ganzen `context` scheitern.
  - Unbekannte Felder werden ignoriert. Das passt zu additiven Nachträgen wie `takenBy` (CHAOS-40).
- **Einschränkungen, die der Server sonst als `bad-message` ablehnt, prüft die App vor dem Senden selbst:**
  - Joystick-Länge ≤ 1 (Toleranz 0,001)
  - Join-Code `^[A-Z0-9]{4,8}$`
  - Name 1–16 UTF-16-Einheiten, ohne Steuer- und Bidi-Zeichen und ohne Leerraum am Rand (`PlayerName.isValid`)

### Beitreten

- **QR-Code scannen in der App** (VisionKit `DataScannerViewController`, Rückfall AVFoundation). Der QR-Code enthält wie bisher `http://<adresse>:<port>/?code=<JOINCODE>` (`buildJoinUrl`, ADR-007).
- **Daraus die Socket-Adresse ableiten**, wie es `controllerSocketUrl` für den gleichen Ursprung tut:
  - `http` → `ws`, `https` → `wss`
  - gleicher Host und Port, Pfad `/ws`
  - IPv6 bleibt in Klammern

  Der Code wird wie in `parseLaunchParams` getrimmt, großgeschrieben und geprüft. `seats` und `mode` werden im ersten Schnitt ignoriert (`JoinTarget.fromScannedURL`).
- **Manuelle Eingabe als Rückfall:** Die App läuft nicht auf dem Ursprung des Servers. Deshalb braucht sie **Adresse (IP oder Hostname, optional mit Port, Standard 8787) und Code** (`JoinTarget.manual`). Der PC zeigt beides schon heute an.
- **Name beim Beitreten:** Das Protokoll kennt keine Umbenennung. Ein Name geht nur über `join.names`; der Server übernimmt ihn als Bezeichnung (`apps/server/src/session.ts`). Das Namensfeld steht deshalb auf dem Beitritts-Bildschirm, nicht in der Lobby. Ohne Namen bleibt die Slot-Farbe („Blau“). Beim `reconnect` bleibt der Name, den der Server kennt.
- **Bonjour-Suche kommt später.** Dafür muss der Server einen Dienst ankündigen; das ist eine Server-Änderung mit eigener Aufgabe.
- Der Server prüft beim WebSocket-Upgrade nur den Pfad, keinen `Origin`. `URLSessionWebSocketTask` kann sich also ohne Server-Änderung verbinden.

### Plattform-Voraussetzungen (beim ersten Gerätetest prüfen)

- **ATS `NSAllowsLocalNetworking`:** Klartext-`ws://` ins LAN ohne globale Ausnahme.
- **`NSLocalNetworkUsageDescription`:** iOS fragt beim ersten Verbindungsversuch nach dem lokalen Netz. Wird die Erlaubnis verweigert, scheitert die Verbindung still. Die App muss das als „PC nicht erreichbar“ melden und auf die Einstellungen hinweisen.
- **`NSCameraUsageDescription`:** für den QR-Scan.
- Alle drei stehen in `project.yml`. Ob iOS sie wie erwartet anwendet, zeigt erst ein echtes Gerät (Simulator und Browser beweisen das nicht).

### Erster Schnitt: ein iPhone = ein Platz

Er umfasst die volle Schleife: Beitreten, Lobby (Figur wählen, „Bereit!“), Brett-Prompts (Würfeln, Ziel, Weg, Trophäe, Reaktion, mit Countdown), Minispiel (Intro, Joystick + Knöpfe A/B, Ergebnis, Abbruch), Pause, Endstand, Fehler- und Wiederverbinden-Anzeige.

Verhalten wie im Web-Controller (Zahlen in `SessionTiming`):

- Herzschlag alle 5 s.
- Verbindung gilt als tot nach 10 s ohne Server-Nachricht.
- Aufbau-Timeout 5 s.
- Backoff 0,5/1/2/4/5 s ±20 %.
- Probe nach dem Aufwachen innerhalb von 2 s.
- `move` höchstens alle 33 ms und nur bei Änderung; Loslassen sofort.
- `seq` je Verbindung ab 1, über alle Slots steigend.
- Close 4003 (Platz übernommen): nicht von selbst neu verbinden.
- Aufgeben bei falschem Code, vollem Spiel oder Versionskonflikt, und bei `out-of-phase` auf `join`, weil das Spiel dann schon läuft.

Die Aufwach-Signale des Browsers (`visibilitychange`, `online`, `pageshow`) entsprechen in der App `scenePhase == .active` und `NWPathMonitor`.

**Token: UserDefaults, nicht Keychain.**
- Das Token gilt nur für eine laufende LAN-Sitzung und verfällt mit dem Server-Neustart. Es ist das Gegenstück zu `localStorage` im Browser, kein Zugangsschlüssel.
- Die Keychain brächte mehr Code und würde eine Neuinstallation überleben, ohne dass das etwas nützt.
- Schlüssel: Server-Adresse **und** Join-Code (`JoinTarget.storageKey`), nicht nur der Code, weil verschiedene PCs denselben Code würfeln können.
- Bleibt das Token beim Abmelden liegen, ist der Schaden gering: Es öffnet höchstens den eigenen Platz in derselben Partie.

**Geteiltes iPad (zwei Spieler auf einem Gerät, ADR-008) ist ein zweiter Schritt mit eigener Aufgabe.** Bis dahin nutzen zwei Spieler an einem iPad den Browser-Controller. Ein iPad mit einem Spieler funktioniert schon im ersten Schnitt. Zustand und Schnittstelle sind schon nach Slots geschlüsselt, damit der zweite Schritt nur hinzufügt.

### Haptik, Bildschirm, Ausrichtung

- **Haptik:** `feedback` wird zu einem Haptik-Muster (`confirm`/`hit`: kurzer Impuls, `miss`: weich, `win`: Erfolg, `lose`: Warnung). Knopfdruck auf A/B und Prompt-Auswahl geben einen leichten Impuls. Das ist neu gegenüber dem Web, wo iOS nicht vibriert. Die Farbblitze bleiben.
- **Bildschirm bleibt an** (`isIdleTimerDisabled`), solange ein Spiel verbunden ist; auf dem Beitritts-Bildschirm nicht.
- **Ausrichtung wie der Web-Controller:** Hochformat für Lobby und Brett, Querformat für Joystick + Knöpfe. Beides ist erlaubt, das Layout passt sich an.
- Texte bleiben die des Web-Controllers (`state/errors.ts`, `lobby/view.ts`, `minigame/view.ts`, `board/*`). Wo das Web „Seite neu laden“ sagt, heißt es nativ „App aktualisieren“ bzw. „neu verbinden“.

### Protokoll-Drift absichern

Das wichtigste neue Risiko ist ein **Versionsversatz**. Der Browser-Controller kommt immer vom selben Server und kann nicht veralten; eine installierte App schon. Gegenmittel:

1. **Fixture-Korpus aus dem echten Schema:**
   - `node scripts/export-protocol-fixtures.mjs` schreibt `apps/controller-ios/Tests/Fixtures/`: 24 Server→Controller-Nachrichten, 13 Controller→Server-Nachrichten, eine Fremdnachricht (`lobby`), 9 kaputte Nachrichten und `protocol-constants.json` (Version, alle Aufzählungen, Grenzen).
   - Jede Fixture läuft durch den echten Parser.
   - Das Skript bricht ab, wenn ein Nachrichtentyp der Controller-Rolle keine Fixture hat.
   - `--check` meldet einen veralteten Korpus.
2. **Swift-Tests gegen den Korpus:**
   - Jede eingehende Fixture wird dekodiert und wieder kodiert; der Vergleich läuft nach Entfernen von `null`, weil Swift `null` und „fehlt“ gleich behandelt. Ein neues Feld im Schema fällt so als Unterschied auf.
   - Jede ausgehende Fixture macht einen exakten Rundlauf.
   - Kaputte Fixtures müssen mit dem passenden Fehler scheitern.
   - Die Aufzählungen müssen `protocol-constants.json` entsprechen.
   - Ein Probelauf am 17.11. lief vollständig grün.
3. **Ein Integrationstest** der echten Swift-Sitzung gegen den echten Server (lokal gestartet, Simulator): Beitreten, Kontext, Figur, Bereit, Herzschlag, Verbindungsabbruch mit `reconnect`.
4. **Laufzeit:** Ein Versionskonflikt (`version-mismatch`) zeigt einen eigenen Bildschirm („App aktualisieren oder Browser-Controller nehmen“). Der Browser bleibt der Rückfall.

**CI:** `.github/workflows/ci.yml` läuft nur auf `ubuntu-latest`, ohne Xcode. Die Swift-Tests laufen deshalb **nur lokal** (Befehle in `apps/controller-ios/IMPLEMENTATION.md`).
- In der CI kann `node scripts/export-protocol-fixtures.mjs --check` laufen: Wer das Schema ändert, muss den Korpus neu erzeugen und sieht den Unterschied im Review. Das ist vorgeschlagen, aber noch nicht eingebaut.
- Ein macOS-Runner für die Swift-Tests wäre möglich, kostet bei privaten Repositorys aber ein Vielfaches der Linux-Minuten. Das entscheidet Ruben.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| Nur Browser-Controller weiter härten | Haptik, Wachhalten des Bildschirms und QR-Scan ohne neuen Tab sind in iOS Safari nicht erreichbar; Rubens Entscheidung. |
| Web-Controller in einer WKWebView-Hülle | Bringt Haptik nur über eine JS-Brücke und behält die Safari-Eigenheiten (Touch, Einfrieren); zwei Welten statt einer. |
| Gemeinsamer Swift-Code aus dem TS-Schema generieren | Kein Generator für zod 4 → Swift, der Refinements und offene Aufzählungen sauber abbildet; der handgeschriebene Vertrag mit Fixture-Prüfung ist kleiner und fängt dieselbe Drift. |
| Keychain für das Token | Mehr Code, überlebt Neuinstallation ohne Nutzen; das Token ist ein kurzlebiger LAN-Sitzungsschlüssel. |
| Bonjour sofort | Braucht eine Server-Änderung (Dienst ankündigen) und eine weitere Berechtigung; QR + manuelle Eingabe reichen für den ersten Schnitt. |
| iPad-Zonen im ersten Schnitt | Verdoppelt die Touch-Logik (ADR-008, Zonen-Tracker); der Browser deckt das geteilte iPad bis dahin ab. |

## Konsequenzen

**Positiv**
- Haptik, wacher Bildschirm, QR-Scan direkt in der App, keine Browserleisten.
- Server, Protokoll und Host bleiben unverändert; der Browser-Controller bleibt vollwertiger Rückfall.
- Der Vertrag (`Sources/Protocol/`) erlaubt zwei parallele Arbeitspakete (Netz und UI) ohne gemeinsame Dateien.

**Negativ / Risiken**
- Zwei Controller-Implementierungen: Jede Protokolländerung muss in TS **und** Swift ankommen. Der Fixture-Korpus macht das sichtbar, erzwingt es ohne macOS-CI aber nicht.
- Versionsversatz zwischen installierter App und Server (siehe oben).
- Die Swift-Tests laufen nicht in der CI.
- Verteilung auf echte Geräte braucht Signierung (eigenes Team, TestFlight oder Kabel); Kosten und Weg klärt Ruben, falls mehr als Rubens eigene Geräte dazukommen.
- Erlaubnis für das lokale Netz und das Verhalten von ATS lassen sich nur auf echter Hardware prüfen.

## Überprüfung

- Nach dem ersten echten Gerätetest der App: Verbindung im LAN, Erlaubnis-Dialog, Haptik, Eingabelatenz im Vergleich zum Browser (`?debug=1`, ADR-010).
- Bei der nächsten Protokollversion (v5): ob der Fixture-Korpus die Änderung zuverlässig sichtbar gemacht hat; sonst macOS-CI oder Generator neu bewerten.
- Vor dem iPad-Zonen-Schritt: ob die nach Slots geschlüsselte Zustandsform reicht.
