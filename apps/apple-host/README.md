# Nativer Apple-Host (`@chaos-party/apple-host`)

Mac oder Apple TV hosten eine Partie allein, ohne PC ([ADR-019](../../docs/decisions/ADR-019-nativer-apple-host.md), W2). iPhones und iPads bleiben Controller: im Browser (die App liefert `apps/controller` selbst aus) oder mit der nativen Controller-App (ADR-017).

Hervorgegangen aus dem Spike CHAOS-138 ([EXP-024](../../docs/experiments.md)), seit CHAOS-139 Produktcode.

| Teil | Ort | Aufgabe |
|---|---|---|
| JS-Kern | `src/` → `dist/chaos-host.js` | Session-Server (`apps/server`), game-core, Host-Rolle (`apps/host`) und Minispiele headless mit Havok, als ein Bündel für JavaScriptCore |
| Vertrag | [`src/contract.ts`](src/contract.ts), Übersicht in [`CONTRACT.md`](CONTRACT.md) | `HostEnv`, `ChaosHostInstance`, `renderState` (zod-Schema) |
| Swift-App | `app/`, `project.yml` | ein Ziel für macOS und tvOS: JavaScriptCore, HTTP + WebSocket auf einem Port, Lobby mit QR-Code, RealityKit-Darstellung |
| Harness | `harness/` | spielt in JavaScriptCore eine Bot-Partie und dekodiert die Beispielnachrichten mit dem `RenderState` der App |

Swift ist nur Transport, Uhr und Darstellung. Regeln, Server-Prüfungen und Minispiel-Logik sind dieselbe TypeScript-Wahrheit wie am PC.

## JS-Kern

```sh
pnpm --filter @chaos-party/apple-host build        # dist/chaos-host.js (≈ 5 MB) + dist/HavokPhysics.wasm; auch Teil von `pnpm build`
pnpm --filter @chaos-party/apple-host bots         # Bot-Partie bis zum ersten Minispiel im nackten node:vm-Kontext
pnpm --filter @chaos-party/apple-host bots --full  # ganze Partie: 10 Runden, alle Minispiele der Rotation (≈ 20 s)
pnpm check:bundle                                  # Budget, kein node:crypto/ws/import.meta im Bündel
node scripts/export-apple-host-fixtures.mjs        # Beispielnachrichten für Swift neu schreiben (--check prüft)
```

- `src/main.ts` – `ChaosHost.create(env)`. Controller-Verbindungen gehen unverändert an die `Session`. Die Host-Rolle ist `connectHost` aus `apps/host` an einem Socket im Prozess (negative Verbindungs-IDs): `host-hello`, Herzschlag, `host-ready`, Start und Befehle. Minispiel-Ablauf, Ergebnisversand und Texte kommen aus `apps/host` (`plan.ts`, `results.ts`, `resultSender.ts`, `texts.ts`, `layout.ts`). Zustellungen zwischen Host und Session laufen über eine Warteschlange, nie verschachtelt.
- `src/stage.ts` – Minispiel-Bühne ohne Canvas: NullEngine-Szene, Runner aus dem minigame-sdk, Kapsel-Figuren, keine Effekte. `bodies()` liest Meshes generisch aus der Szene.
- `src/install.ts` + `src/polyfills.ts` – virtuelle Uhr (`setTimeout`/`clearTimeout` feuern in `tick`, `performance.now`), `structuredClone` (JSON), `global`. `install.ts` ist das erste Modul des Bündels.
- `src/nodeCrypto.ts` – Ersatz für `node:crypto` (esbuild-Alias), Zufall aus `env.randomBytes` (Swift: `SecRandomCopyBytes`).
- `src/examples.ts` – Beispielnachrichten je Phase, Quelle für `harness/Fixtures/render-state/`.

**Tests** (`test/`, laufen in `pnpm test`): Polyfills und `node:crypto`-Ersatz einzeln; Vertrag und Beispiele; das echte Bündel in einem nackten `node:vm`-Kontext (ohne `setTimeout`, `performance`, `structuredClone`, `console`, `URL`) mit einer Bot-Partie bis zum ersten angenommenen Minispiel. Jedes `renderState` muss das strenge Schema erfüllen. Die CI spielt im Linux-Job zusätzlich die ganze Partie (`bots --full`).

### Erkenntnisse aus dem Spike

- Ein nacktes `JSContext` hat weder `setTimeout`, `performance`, `structuredClone`, `URL`, `TextEncoder` noch `queueMicrotask`. `window`/`self` bleiben bewusst undefiniert, sonst nimmt Babylon DOM-Pfade.
- `URL` fehlt: zods `z.url()` würde jede `joinUrl` ablehnen. Die Session bekommt darum keine `joinUrl`; `renderState().lobby.joinUrl` kommt direkt aus `env`.
- Havok: ESM-Build, synchron über `instantiateWasm` mit `new WebAssembly.Instance` (der asynchrone Weg löst in JSC nie auf). Swift übergibt `havokWasm` als `Uint8Array` ohne Umweg über `NSNumber`-Arrays (2 MB wären langsam).
- Ohne Rendern zählt Babylon die Render-ID nicht hoch, und `computeWorldMatrix()` liefert die Matrix aus dem ersten Aufruf. `advance()` erhöht die Render-ID darum wie ein gerendertes Bild. Die Lage eines Meshes wird nur neu gerechnet, wenn sich seine Weltmatrix ändert (`updateFlag`).
- Promises in JSC: Mikrotasks laufen nach jedem Aufruf aus Swift leer. Abgelehnte Promises meldet JSC nicht, darum hat jeder Promise-Weg ein `catch` → `env.log`. Der Node-Test bildet das nach (`settle()` nach jedem Aufruf).
- Der Aufbau einer Minispiel-Bühne läuft synchron in einem `tick` (EXP-024: bis 98 ms auf der Apple TV). Abhilfe: CHAOS-141.

### Uhr und Koordinaten

- `tick(nowMs)`: jede monotone ms-Uhr (`CACurrentMediaTime() * 1000`). Der Kern zählt ab dem ersten `tick` von 0; Rücksprünge werden ignoriert, Vorsprünge lassen Fristen ablaufen.
- Koordinaten sind roh aus Babylon/game-core: linkshändig, y oben, x rechts, z nach hinten. RealityKit (rechtshändig): `z → -z`, Quaternion `(x, y, z, w) → (-x, -y, z, w)`.

## App

`app/` ist eine SwiftUI-/RealityKit-App für macOS 26 und tvOS 26 (`dev.rubeen.chaosparty.host`, Anzeigename „Chaos Party“). Sie lädt `chaos-host.js` in einen `JSContext` auf einer eigenen seriellen Queue, reicht Havok als `Uint8Array` hinein und ruft je Bild `tick(now)` und `renderState()` auf (Takt: `SceneEvents.Update` der ARView; läuft der letzte Tick noch, wird das Bild ausgelassen).

- **Ein Port für alles** (8787, sonst der nächste freie): `NWListener` mit reinem TCP. `GET /ws` mit Upgrade wird zur WebSocket-Verbindung (RFC 6455 von Hand: Maskierung, 7/16/64-Bit-Längen, Fragmente, Ping/Pong, Close, Grenze 1 MiB), alles andere liefert den Controller-Build aus dem Bundle (`/?code=…` → `index.html`, nichts außerhalb des Controller-Ordners).
- **Join-Link** `http://<LAN-IPv4>:<port>/?code=<4 Zeichen>`: erste IPv4 eines `en*`-Interfaces (en0 bevorzugt), Code aus dem Alphabet von `apps/server/src/ids.ts`.
- **Darstellung** (noch Grundkörper): Lobby als SwiftUI-Overlay mit QR-Code, Link, Spielerliste und „Partie starten“ (macOS: Return, tvOS: Auswahl auf der Fernbedienung). Brett: Felder als Scheiben, Figuren als Kugeln; Minispiel: `minigame.bodies` als Kugel/Quader/Zylinder. Echte Grafik folgt in CHAOS-142/148/149, der hochskalierte 4K-Pfad (CHAOS-114) mit CHAOS-142.
- **Messung**: alle 10 s eine Zeile `HOST-MESSUNG {json}` (Bildabstand und JS-Zeit je Tick, Median/p95/max, ausgelassene Ticks, Verbindungen, Körper).
- `app/RenderState.swift` dekodiert `renderState` nachsichtig (alles Entbehrliche optional) und ist mit dem Harness geteilt.

### Bauen

```sh
cd apps/apple-host
./prepare.sh            # baut JS-Kern + Controller, legt payload/ an (SKIP_BUILD=1 nimmt vorhandene Builds)
xcodegen generate
# macOS
xcodebuild -project ChaosHost.xcodeproj -scheme ChaosHost -destination 'platform=macOS' -configuration Release -derivedDataPath build build
open -W -n --stdout /tmp/host.log --stderr /tmp/host.log build/Build/Products/Release/ChaosHost.app
# tvOS-Simulator
xcodebuild -project ChaosHost.xcodeproj -scheme ChaosHost -destination 'generic/platform=tvOS Simulator' -configuration Release -derivedDataPath build build
```

Echte Apple TV (Team nur auf der Kommandozeile; `xcodebuild` will die UDID, `devicectl` die CoreDevice-ID):

```sh
xcodebuild -project ChaosHost.xcodeproj -scheme ChaosHost -destination 'id=<UDID>' -configuration Release -derivedDataPath build -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=<TEAM-ID> CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" build
xcrun devicectl device install app --device <CoreDevice-ID> build/Build/Products/Release-appletvos/ChaosHost.app
xcrun devicectl device process launch --device <CoreDevice-ID> --console --terminate-existing dev.rubeen.chaosparty.host
```

Mit dem Startargument `--autostart` startet die Partie, sobald alle Spieler der Lobby bereit sind. Die App hält tvOS wach (`isIdleTimerDisabled`). Das Apple TV muss beim Start wach sein („System is asleep – foreground app launch forbidden“ sonst).

### Prüfen

Der Join-Link steht im Log (`JOIN-URL …`).

```sh
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' 'http://<ip>:<port>/?code=<CODE>'   # 200 text/html
curl -s -o /dev/null -w '%{http_code}\n' --path-as-is 'http://<ip>:<port>/../../etc/passwd'  # 404
```

Danach im Browser `http://<ip>:<port>/?code=<CODE>` öffnen (zweiter Spieler in einem privaten Fenster), Figur wählen, „Bereit!“, in der App „Partie starten“. Gerätetest: [`docs/device-test-checklist.md`](../../docs/device-test-checklist.md) §21.

## Harness (nur macOS)

```sh
pnpm --filter @chaos-party/apple-host build
apps/apple-host/harness/run.sh        # bis zum ersten angenommenen Minispiel
apps/apple-host/harness/run.sh full   # ganze Partie, alle Minispiele der Rotation
```

`run.sh` baut `main.swift` zusammen mit `app/RenderState.swift` (`swiftc`). Der Harness dekodiert zuerst alle Beispielnachrichten, lädt dann das Bündel in ein `JSContext`, spielt mit zwei Controllern über echte Protokoll-Nachrichten, startet per `hostCommand('start')` und dekodiert unterwegs `renderState` mit dem Typ der App. Er scheitert bei jeder JS-Ausnahme, jeder Problemzeile im Log, jedem Server-Fehler an einen Controller, fehlenden Minispielen der Rotation oder abgelehnten Ergebnissen. Die Uhr ist virtuell (60 Ticks je Spielsekunde ohne Warten), gemessen wird CPU-Zeit des Threads.

**JIT:** JSC läuft im Harness auf macOS faktisch ohne JIT (EXP-024: Zählschleife 2,6 s, `node --jitless` 3,0 s, node mit JIT 0,5 s). Die CI setzt zusätzlich `JSC_useJIT=false`. Ein Apple-TV-Kern ist langsamer; die Zeiten sind eine Untergrenze für tvOS.

## CI

- Linux-Job: Typecheck, Lint, Unit-Tests (inkl. Bündel im `node:vm`), `pnpm build`, `pnpm check:bundle`, `bots --full`, Beispielnachrichten aktuell.
- macOS-Job „Native Apps“: JS-Kern und Controller bauen, Harness `full` in JavaScriptCore, App für macOS und tvOS bauen (ohne Signatur).

Signierte Mac-App mit Notarisierung: CHAOS-118. TestFlight für tvOS: CHAOS-119 (stellt später vom RealityKit-Spike auf diese App um).
