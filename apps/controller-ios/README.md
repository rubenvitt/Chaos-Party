# Chaos Party – native Controller-App (iPhone/iPad)

SwiftUI-App, die dasselbe Protokoll v4 spricht wie der Browser-Controller (CHAOS-115,
[ADR-017](../../docs/decisions/ADR-017-native-controller.md)). Das Spiel läuft weiter auf dem PC;
die App ist nur Controller. Der Browser-Controller bleibt der Rückfall.

Die App liegt außerhalb des pnpm-Workspace. `project.yml` ist die Quelle, das Xcode-Projekt
erzeugt `xcodegen` und es wird nicht eingecheckt.

## Aufbau

| Target | Inhalt |
|---|---|
| `ChaosControllerKit` (Framework) | `Sources/Protocol` (Vertrag), `Sources/Net` (Sitzung, Wiederverbinden), `Sources/UI` (Bildschirme, Figurenbilder) |
| `ChaosController` (App) | nur `Sources/App`: `@main`, zeigt `ControllerRoot()` |
| `ChaosControllerTests` | alle Tests in `Tests/`, ohne App-Host; Fixtures aus `Tests/Fixtures` |

Die App startet mit der echten Sitzung (`LiveControllerSession`). Mit dem Startargument
`-sample <name>` (z. B. `-sample lobby`) zeigt sie stattdessen einen Beispielzustand aus
`FakeControllerSession`, für Vorschauen und Screenshots.

## Voraussetzungen

- Xcode 26 oder neuer, `xcodegen` (`brew install xcodegen`)
- für die Integrationstests: Node und einmal `pnpm install --frozen-lockfile` im Repo

## Bauen und im Simulator starten

Alle Befehle aus `apps/controller-ios` (fish):

```fish
xcodegen generate
open ChaosController.xcodeproj
```

Im Simulator verbindet sich die App mit einem Server auf demselben Mac: Server im Repo mit
`pnpm build` und `pnpm start` starten, in der App von Hand `127.0.0.1` und den Join-Code eingeben.

## Auf dem iPhone oder iPad

Das Signier-Team steht nie im Repo. Es kommt nur über die Kommandozeile dazu:

```fish
xcodegen generate
xcodebuild -project ChaosController.xcodeproj -scheme ChaosController \
  -destination 'generic/platform=iOS' -derivedDataPath build/device \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=<TEAM-ID> build
xcrun devicectl list devices
xcrun devicectl device install app --device <GERÄTE-ID> \
  build/device/Build/Products/Debug-iphoneos/ChaosController.app
```

Alternativ in Xcode das Team wählen. Das geht beim nächsten `xcodegen generate` wieder verloren,
und das ist gewollt. iPhone und PC müssen im selben WLAN sein. Beim ersten Verbinden fragt iOS
nach dem lokalen Netzwerk; ohne diese Erlaubnis meldet die App „Spiel-PC nicht erreichbar“.
Was am Gerät zu prüfen ist, steht in `docs/device-test-checklist.md`.

## Tests

```fish
scripts/run-tests.sh               # alle Suites, startet den Server selbst auf einem freien Port
scripts/run-tests.sh --no-server   # ohne Integrationstests
```

Das Skript erzeugt das Projekt, baut mit `xcodebuild build-for-testing` und startet das
Test-Bundle mit `xcrun simctl spawn <Simulator> …/Agents/xctest`. Es nutzt einen eigenen
Simulator „ChaosController Tests“ (legt ihn bei Bedarf an) und fährt ihn danach wieder herunter.
Andere Simulatoren gehen über `SIMULATOR_UDID`, ein schon laufender Server über
`CHAOS_SERVER_URL` und `CHAOS_JOIN_CODE`.

Screenshots von Beispielzuständen (ohne Server, wie in CI „Native Apps“; Ergebnis als Artefakt
`controller-ios-screenshots`):

```fish
scripts/screenshots.sh minigameConsolation minigameResults   # JPEGs nach build/screenshots/
```

Die Integrationstests sprechen mit dem echten Server: beitreten, Figur, Bereit, Herzschlag,
abgerissene Verbindung mit `reconnect`, Platzübernahme (Close 4003) und alte Protokollversion.
Ein Host muss dafür nicht verbunden sein. Der Server hält getrennte Plätze in der Lobby 60 s;
mehr als vier Läufe gegen denselben Server in dieser Zeit enden mit „Spiel voll“.

### Warum nicht `xcodebuild test`

Mit dem iOS-27-Simulator hängt `xcodebuild test` auf dem Entwicklungs-Mac: Die Host-App startet
mit `WaitForDebugger`, der Simulator-Dienst meldet „failed to bless service hub“, und nach etwa
fünf Minuten bricht der Lauf mit „test runner hung before establishing connection“ ab. Das
passiert auch auf frischen Simulatoren und ohne Sandbox. Darum liegt der Code in einem Framework
und die Tests laufen ohne App-Host. Sobald `xcodebuild test` wieder geht, funktioniert es mit
demselben Projekt.

Die CI hat kein Xcode; die Swift-Tests laufen nur lokal. Ändert sich das Protokoll-Schema:
`node scripts/export-protocol-fixtures.mjs` im Repo neu ausführen.

## TestFlight (CI)

Wie bei Lichtung: `.github/workflows/testflight.yml` archiviert die App bei jedem Push auf `main`, der `apps/controller-ios/` ändert, signiert automatisch über den App-Store-Connect-API-Key und lädt sie zu TestFlight hoch (`scripts/testflight.sh`). Manuell startbar über „Run workflow“.

Voraussetzungen:

- Repository-Secrets `APPLE_API_KEY` (Key-ID), `APPLE_API_KEY_P8` (Inhalt der `.p8`, Klartext) und `APPLE_API_ISSUER` (Issuer-ID); der Key braucht die Rolle Admin.
- App-Eintrag für `dev.rubeen.chaosparty.controller` in App Store Connect.

Lokal hochladen mit dem in Xcode angemeldeten Account: `XCODE_ACCOUNT=1 scripts/testflight.sh`.

App-Icon: `Sources/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png`, am 17.11.2026 mit dem Bildgenerator von Codex (OpenAI) erzeugt, eigenes Motiv ohne Vorlage.

