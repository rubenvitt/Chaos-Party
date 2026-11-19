# Nativer Apple-Host (`@chaos-party/apple-host`)

Mac oder Apple TV hosten eine Partie allein, ohne PC ([ADR-019](../../docs/decisions/ADR-019-nativer-apple-host.md), W2). iPhones und iPads bleiben Controller: im Browser (die App liefert `apps/controller` selbst aus) oder mit der nativen Controller-App (ADR-017).

Hervorgegangen aus dem Spike CHAOS-138 ([EXP-024](../../docs/experiments.md)), seit CHAOS-139 Produktcode.

| Teil      | Ort                                                                             | Aufgabe                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| JS-Kern   | `src/` → `dist/chaos-host.js`                                                   | Session-Server (`apps/server`), game-core, Host-Rolle (`apps/host`) und Minispiele headless mit Havok, als ein Bündel für JavaScriptCore |
| Vertrag   | [`src/contract.ts`](src/contract.ts), Übersicht in [`CONTRACT.md`](CONTRACT.md) | `HostEnv`, `ChaosHostInstance`, `renderState` (zod-Schema)                                                                               |
| Swift-App | `app/`, `project.yml`                                                           | ein Ziel für macOS und tvOS: JavaScriptCore, HTTP + WebSocket auf einem Port, Lobby mit QR-Code, RealityKit-Darstellung                  |
| Harness   | `harness/`                                                                      | spielt in JavaScriptCore eine Bot-Partie und dekodiert die Beispielnachrichten mit dem `RenderState` der App                             |

Swift ist nur Transport, Uhr und Darstellung. Regeln, Server-Prüfungen und Minispiel-Logik sind dieselbe TypeScript-Wahrheit wie am PC.

## JS-Kern

```sh
pnpm --filter @chaos-party/apple-host build        # dist/chaos-host.js (≈ 5 MB) + dist/HavokPhysics.wasm; auch Teil von `pnpm build`
pnpm --filter @chaos-party/apple-host bots         # Bot-Partie bis zum ersten Minispiel im nackten node:vm-Kontext
pnpm --filter @chaos-party/apple-host bots --full  # ganze Partie: 10 Runden, alle Minispiele der Rotation (≈ 20 s)
pnpm --filter @chaos-party/apple-host bots --full --matches 3  # drei Partien mit Revanche, Speicher je Partie, Grenze +20 MB (CHAOS-141, ≈ 40 s)
pnpm check:bundle                                  # Budget, kein node:crypto/ws/import.meta im Bündel
node scripts/export-apple-host-fixtures.mjs        # Beispielnachrichten für Swift neu schreiben (--check prüft)
```

- `src/main.ts` – `ChaosHost.create(env)`. Controller-Verbindungen gehen unverändert an die `Session`. Die Host-Rolle ist `connectHost` aus `apps/host` an einem Socket im Prozess (negative Verbindungs-IDs): `host-hello`, Herzschlag, `host-ready`, Start und Befehle. Minispiel-Ablauf, Ergebnisversand und Texte kommen aus `apps/host` (`plan.ts`, `results.ts`, `resultSender.ts`, `texts.ts`, `layout.ts`). Zustellungen zwischen Host und Session laufen über eine Warteschlange, nie verschachtelt.
- `src/stage.ts` – Minispiel-Bühne ohne Canvas: NullEngine-Szene, Runner aus dem minigame-sdk, Kapsel-Figuren, keine Effekte. `bodies()` liest Meshes generisch aus der Szene. Der Aufbau ist über mehrere `tick` verteilt (CHAOS-141, siehe unten).
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
- Der Aufbau einer Minispiel-Bühne lief synchron in einem `tick` (EXP-024: bis 98 ms auf der Apple TV). Seit CHAOS-141 rufen die Minispiele in `prepare` zwischen ihren Bauschritten `ctx.pace()`; der Kern gibt nach 2 ms (`PREPARE_BUDGET_MS`, echte Uhr `Date.now()`) ab und baut im nächsten `tick` weiter (Zeitgeber der virtuellen Uhr). Danach werden die Grundformen bestimmt, ebenfalls verteilt; bis dahin liefert `bodies()` nichts und das Minispiel startet nicht. Neue Minispiele brauchen dasselbe: kein großer Bauschritt ohne `await ctx.pace()` (eine Kugel mit Standard-Segmenten kostet ohne JIT schon gut 10 ms). Messung im EXP-024-Nachtrag.

### Uhr und Koordinaten

- `tick(nowMs)`: jede monotone ms-Uhr (`CACurrentMediaTime() * 1000`). Der Kern zählt ab dem ersten `tick` von 0; Rücksprünge werden ignoriert, Vorsprünge lassen Fristen ablaufen.
- Koordinaten sind roh aus Babylon/game-core: linkshändig, y oben, x rechts, z nach hinten. Grundkörper (Minispiele) in RealityKit (rechtshändig): `z → -z`, Quaternion `(x, y, z, w) → (-x, -y, z, w)`.
- Achtung, das Brett: `brett.usdz` entsteht mit `(x, y, z) → (-x, y, z)` (`apps/host/src/export/boardExport.ts`). Figuren stehen darum auf den Feld-Ankern; nur der Versatz mehrerer Figuren auf einem Feld wird mit `x → -x` übernommen, ebenso der Kamerafokus. Geprüft: Die Felder einer Bot-Partie liegen mit `-x` auf 0 mm genau auf `fields` aus `brett.szene.json`.

## App

`app/` ist eine SwiftUI-/RealityKit-App für macOS 26 und tvOS 26 (`dev.rubeen.chaosparty.host`, Anzeigename „Chaos Party“). Sie lädt `chaos-host.js` in einen `JSContext` auf einer eigenen seriellen Queue, reicht Havok als `Uint8Array` hinein und ruft je Bild `tick(now)` und `renderState()` auf (Takt: `SceneEvents.Update` der ARView; läuft der letzte Tick noch, wird das Bild ausgelassen).

- **Ein Port für alles** (8787, sonst der nächste freie): `NWListener` mit reinem TCP. `GET /ws` mit Upgrade wird zur WebSocket-Verbindung (RFC 6455 von Hand: Maskierung, 7/16/64-Bit-Längen, Fragmente, Ping/Pong, Close, Grenze 1 MiB), alles andere liefert den Controller-Build aus dem Bundle (`/?code=…` → `index.html`, nichts außerhalb des Controller-Ordners).
- **Join-Link** `http://<LAN-IPv4>:<port>/?code=<4 Zeichen>`: erste IPv4 eines `en*`-Interfaces (en0 bevorzugt), Code aus dem Alphabet von `apps/server/src/ids.ts`.
- **Darstellung** (CHAOS-142): `RealityRenderer` in einer eigenen Metal-Ebene, getaktet von der Anzeige (`app/RenderLoop.swift`, aus dem Spike, CHAOS-114). Interne Auflösung höchstens 1920 Bildpunkte breit auf tvOS (EXP-020: 4K-Ausgabe, bilinear, drei Bilder im Flug, ohne MSAA) bzw. 2560 am Mac (MetalFX, MSAA 4×), hochskaliert auf die Anzeige. Fordert die Anzeige keine Bilder an (Fenster verdeckt), läuft das Spiel über einen Ersatztakt weiter.
  - **Lobby** (`App.swift`): Brett als Übersicht im Hintergrund, darüber QR-Code, Join-Code, Link und je Slot eine Karte mit Porträt der Figur (Akzent in Slot-Farbe), Name, Figur, getrennt/bereit. „Partie starten“ erst, wenn das Brett geladen ist und alle bereit sind (macOS: Return, tvOS: Auswahl auf der Fernbedienung).
  - **Brett** (`app/BoardScene.swift`): `brett.usdz` mit Gras- und Blumen-Instanzen, Sonne mit Schatten und Himmelslicht aus `brett.szene.json`, Figuren als USDZ (je Figur einmal geladen, je Slot geklont, Akzent in Slot-Farbe, Clips `idle`/`run` aus `clips.json`, Maßstab 1,3 wie im Babylon-Host). Figuren stehen auf den Feld-Ankern `feld_<id>`; sie laufen geradlinig zum neuen Feld, bis die Brett-Regie (CHAOS-143) die Hüpfer übernimmt. Kamera wie im Babylon-Host: Brettmitte, zum aktiven Spieler um (0,12; 0,04) verschoben, Halbwertszeit 0,7 s.
  - **Minispiele** und Brett ohne Assets: Grundkörper (`Primitives` in `app/Stage.swift`); echte Minispiel-Grafik folgt mit CHAOS-144/149.
  - **`host-ready`** erst, wenn Brett, Instanzen und Figuren geladen sind (`deferSceneReady`, CHAOS-68).
- **Startparameter** (`--name=wert`): `--assets=<ordner>` (USDZ statt aus dem Bundle), `--skala=0.5` (fester Anteil statt Höchstbreite), `--skalierer=metalfx|bilinear`, `--imflug=1…3`, `--msaa=0|1`, `--bild=<pfad>` (PNG der 3D-Szene bei jedem Phasenwechsel, `<pfad>-<phase>.png`), `--bildtakt=<s>` (zusätzlich alle s Sekunden), `--lobbybild=<pfad>` (nur macOS: Lobby als PNG über `<bild>-lobby.png`, 20 s nach dem Start).
- **Messung**: alle 10 s eine Zeile `HOST-MESSUNG {json}` (Bildabstand und JS-Zeit je Tick, Median/p95/max, ausgelassene Ticks, Verbindungen, Körper).
- `app/RenderState.swift` dekodiert `renderState` nachsichtig (alles Entbehrliche optional) und ist mit dem Harness geteilt.

### Bauen

```sh
cd apps/apple-host
pnpm build:apple-assets # USDZ nach build/apple-assets (CHAOS-140, ≈ 1 min am Mac); prepare.sh bricht ohne sie ab
./prepare.sh            # baut JS-Kern + Controller, legt payload/ an (SKIP_BUILD=1 nimmt vorhandene Builds, OHNE_ASSETS=1 Grundkörper)
xcodegen generate
# macOS
xcodebuild -project ChaosHost.xcodeproj -scheme ChaosHost -destination 'platform=macOS' -configuration Release -derivedDataPath build build
open -W -n --stdout /tmp/host.log --stderr /tmp/host.log build/Build/Products/Release/ChaosHost.app   # ad hoc signiert, Hardened Runtime (siehe Release)
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

Danach im Browser `http://<ip>:<port>/?code=<CODE>` öffnen (zweiter Spieler in einem privaten Fenster), Figur wählen, „Bereit!“, in der App „Partie starten“. Gerätetest: [`docs/device-test-checklist.md`](../../docs/device-test-checklist.md) §22.

### Release (signiert und notarisiert, CHAOS-118)

`scripts/release-macos.sh` baut die Mac-App so, wie sie auf einen fremden Mac geht: Archiv als Universal-Binary (arm64 + x86_64), Developer-ID-Signatur mit Hardened Runtime und Zeitstempel, ohne `get-task-allow`. Danach Selbsttest der fertigen App, Notarisierung mit `notarytool` (App-Store-Connect-API-Key), Heften, Gatekeeper-Prüfung (`spctl`: „Notarized Developer ID“) und Zip `build/release/Chaos-Party-<Version>-macOS.zip` mit „Chaos Party.app“ und `.sha256`.

```sh
# lokal, Zertifikat „Developer ID Application“ im Anmelde-Schlüsselbund, API-Key unter ~/.appstoreconnect/private_keys/
ASC_KEY_ID=<KEY-ID> ASC_ISSUER_ID=<ISSUER> VERSION=0.1.0 apps/apple-host/scripts/release-macos.sh
# ohne Zertifikat (wie die CI bei jedem PR): ad hoc signiert, Hardened Runtime, Selbsttest, keine Notarisierung
RELEASE_DRY_RUN=1 apps/apple-host/scripts/release-macos.sh
```

- **Selbsttest** `ChaosHost.app/Contents/MacOS/ChaosHost --selftest` (`app/SelfTest.swift`, nur macOS): ohne Fenster laden JS-Kern und Havok, der Listener liefert `/?code=…` als HTML aus, ein WebSocket-Client aus Network.framework tritt bei und bekommt `welcome`, dazu 300 Ticks ohne Problemzeile im Log. Exit 0 mit `SELBSTTEST OK`, sonst 1 mit dem fehlenden Schritt. Er belegt, dass JavaScriptCore und WebAssembly unter der Hardened Runtime **ohne** JIT-Berechtigung laufen (ADR-019 §7).
- **Hardened Runtime** ist in `project.yml` für macOS immer an, damit JavaScriptCore auch in jedem lokalen Build ohne JIT-Berechtigung laufen muss wie in der notarisierten App. Eine Abweichung gibt es (CHAOS-176): Ad hoc signiert lädt die App unter macOS 27 das ebenfalls ad hoc signierte `Sparkle.framework` nicht mehr (dyld: „different Team IDs“, obwohl keine der beiden Signaturen eine Team-ID trägt; unter macOS 26 ging es noch). Lokale Builds und `RELEASE_DRY_RUN=1` bekommen deshalb [`config/ChaosHost-adhoc.entitlements`](config/ChaosHost-adhoc.entitlements), das nur `com.apple.security.cs.disable-library-validation` setzt. Das Developer-ID-Release baut ohne diese Datei (App und Sparkle haben dort dieselbe Team-ID), `release-macos.sh` bricht ab, falls sie doch in der Signatur steht.
- **Workflow** [`release-macos.yml`](../../.github/workflows/release-macos.yml): bei jedem Push auf `main`, der App, Server, Host-Rolle, Controller oder `packages/` ändert, dazu manuell, aber nur, wenn seit dem letzten Release ein `feat`-, `fix`- oder `perf`-Commit kam. Die Version bestimmt semantic-release aus den Conventional Commits ([`release.config.mjs`](../../release.config.mjs), [`scripts/next-version.mjs`](scripts/next-version.mjs)): `feat` → `0.2.0`, `fix` → `0.1.6`. Tag `macos-v<Version>`, Release-Notizen mit den Commits, Build-Nummer ist die Laufnummer. Vorabversion, solange der Host Grundkörper zeichnet (`PRERELEASE` im Workflow). `MARKETING_VERSION` in `project.yml` gilt nur noch für lokale Builds.
- **Secrets** (Repository → Settings → Secrets → Actions):
  - `MACOS_CERTIFICATE_P12`: base64 der `.p12` mit dem Zertifikat „Developer ID Application“ **samt privatem Schlüssel** (Schlüsselbundverwaltung → Zertifikat und Schlüssel markieren → exportieren; dann `base64 -i developer-id.p12 | pbcopy`)
  - `MACOS_CERTIFICATE_PASSWORD`: Passwort dieser `.p12`
  - `APPLE_API_KEY`, `APPLE_API_KEY_P8`, `APPLE_API_ISSUER`: dieselben wie für TestFlight (CHAOS-115); `notarytool` braucht mindestens die Rolle „Developer“.
  - `SPARKLE_ED_PRIVATE_KEY` und die Variable `SPARKLE_PUBLIC_ED_KEY`: Updates per Sparkle, siehe unten.

### Automatische Updates (Sparkle, CHAOS-156)

Die Mac-App sucht mit [Sparkle](https://sparkle-project.org) 2.10.1 selbst nach neuen Versionen: einmal täglich und sofort über „Chaos Party → Nach Updates suchen …“. Sie zeigt die neue Version an, lädt den Zip, prüft beide Signaturen (EdDSA und Developer ID) und startet neu. Nur macOS; die Apple TV aktualisiert über TestFlight. Hintergrund: ADR-019 Nachtrag 4.

- **Feed:** `appcast.xml` am Release [`macos-appcast`](https://github.com/rubenvitt/chaos-party/releases/tag/macos-appcast), feste Adresse `SPARKLE_FEED_URL` in `project.yml`. Den Feed schreibt [`scripts/sparkle-feed.sh`](scripts/sparkle-feed.sh) nach jedem Release: `sign_update` signiert den Zip, [`scripts/appcast.mjs`](scripts/appcast.mjs) prüft die Signatur gegen den Schlüssel der App und schreibt den Eintrag, `sign_update` signiert den Feed.
- **Schlüssel** (nie ins Repository): Variable `SPARKLE_PUBLIC_ED_KEY` (öffentlich, Repository → Settings → Secrets and variables → Actions → Variables) und Secret `SPARKLE_ED_PRIVATE_KEY`. Ohne beide gibt es Releases ohne Updater; die App zeigt den Menüpunkt dann ausgegraut.
- **Einmalig einrichten** auf dem Mac (der private Schlüssel bleibt zusätzlich im Schlüsselbund, als Sicherung):

  ```sh
  cd "$(mktemp -d)"
  curl -fsSLO https://github.com/sparkle-project/Sparkle/releases/download/2.10.1/Sparkle-2.10.1.tar.xz
  echo "1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27  Sparkle-2.10.1.tar.xz" | shasum -a 256 -c -
  tar -xf Sparkle-2.10.1.tar.xz ./bin/generate_keys
  ./bin/generate_keys --account chaos-party            # legt das Paar im Schlüsselbund an, gibt den öffentlichen aus
  gh variable set SPARKLE_PUBLIC_ED_KEY -R rubenvitt/chaos-party --body "$(./bin/generate_keys --account chaos-party -p)"
  ./bin/generate_keys --account chaos-party -x sparkle-private.key
  gh secret set SPARKLE_ED_PRIVATE_KEY -R rubenvitt/chaos-party < sparkle-private.key
  rm -P sparkle-private.key
  ```

- **Schlüssel verloren?** Dann können installierte Apps keine Updates mehr annehmen; man müsste die App einmal von Hand neu laden. Darum den Eintrag „chaos-party“ im Schlüsselbund nicht löschen.
- **CI:** Jeder PR baut die App ad hoc mit einem Wegwerf-Schlüssel und läuft `sparkle-feed.sh` einmal durch (Job „Native Apps“). Der echte Update-Weg von einer installierten Version auf die nächste ist nur am Mac prüfbar: Gerätecheckliste §28.

## TestFlight (Apple TV, CHAOS-151)

Die App kommt als „Chaos Party“ mit der Bundle-ID `dev.rubeen.chaosparty.tv` über TestFlight auf die Apple TV (vorher stand dort der RealityKit-Spike, CHAOS-119). `project.yml` signiert weiterhin nur lokal; [`scripts/testflight.sh`](scripts/testflight.sh) setzt Bundle-ID, Team und Signatur auf der Kommandozeile, baut nur für tvOS (Gerät) und prüft vorher und im Archiv, dass die Nutzlast (JS-Kern, Havok, Controller) drinsteckt.

- **CI:** [`.github/workflows/testflight-tv.yml`](../../.github/workflows/testflight-tv.yml) läuft bei jedem Push auf `main`, der diesen Ordner oder etwas aus der Nutzlast ändert (`apps/server/src`, `apps/host/src`, `apps/controller`, `packages/*`, Lockfile; ohne `*.md` und Tests), und lässt sich manuell starten (Actions → „TestFlight (Apple TV)“ → Run workflow). Secrets wie bei der Controller-App (`APPLE_API_KEY`, `APPLE_API_KEY_P8`, `APPLE_API_ISSUER`).
- **Mac-App:** kommt signiert und notarisiert aus dem Workflow „Release (Mac-App)“ (Abschnitt „Release“, CHAOS-118), nicht aus diesem.
- **Lokal** mit dem in Xcode angemeldeten Account (ruft `prepare.sh` selbst auf):

  ```bash
  XCODE_ACCOUNT=1 apps/apple-host/scripts/testflight.sh
  XCODE_ACCOUNT=1 UPLOAD=0 apps/apple-host/scripts/testflight.sh   # nur .ipa, kein Upload
  ```

- **Icons:** tvOS verlangt Bildstapel mit Parallaxe-Ebenen und Top-Shelf-Bilder. Sie liegen in `app-tv/Assets.xcassets` (nur für tvOS eingebunden) und entstehen mit `python3 -I apps/apple-host/scripts/tv-icons.py` aus dem Icon der Controller-App.
- **Nicht übernommen:** die Messvarianten-Auswahl des Spikes (CHAOS-147). Den hochskalierten 4K-Pfad hat der Host seit CHAOS-142 fest (Startparameter wie oben).
- **USDZ:** Der Workflow baut sie vor `prepare.sh` mit `pnpm build:apple-assets` (Python 3.13 mit `bpy`, Chromium). Ohne sie bricht `prepare.sh` ab, damit kein Build mit Grundkörpern auf die Apple TV geht. Dasselbe gilt für „Release (Mac-App)“.
- **Gerätetest:** [`docs/device-test-checklist.md`](../../docs/device-test-checklist.md) §20, Schritte TH1–TH4.

## Harness (nur macOS)

```sh
pnpm --filter @chaos-party/apple-host build
apps/apple-host/harness/run.sh        # bis zum ersten angenommenen Minispiel
apps/apple-host/harness/run.sh full   # ganze Partie, alle Minispiele der Rotation
```

`run.sh` baut `main.swift` zusammen mit `app/RenderState.swift` (`swiftc`). Der Harness dekodiert zuerst alle Beispielnachrichten, lädt dann das Bündel in ein `JSContext`, spielt mit zwei Controllern über echte Protokoll-Nachrichten, startet per `hostCommand('start')` und dekodiert unterwegs `renderState` mit dem Typ der App. Er scheitert bei jeder JS-Ausnahme, jeder Problemzeile im Log, jedem Server-Fehler an einen Controller, fehlenden Minispielen der Rotation oder abgelehnten Ergebnissen. Die Uhr ist virtuell (60 Ticks je Spielsekunde ohne Warten), gemessen wird CPU-Zeit des Threads.

**JIT:** JSC läuft im Harness auf macOS faktisch ohne JIT (EXP-024: Zählschleife 2,6 s, `node --jitless` 3,0 s, node mit JIT 0,5 s). Die CI setzt zusätzlich `JSC_useJIT=false`. Ein Apple-TV-Kern ist langsamer; die Zeiten sind eine Untergrenze für tvOS.

## CI

- Linux-Job: Typecheck, Lint, Unit-Tests (inkl. Bündel im `node:vm`), `pnpm build`, `pnpm check:bundle`, `bots --full --matches 3` (Speicher über drei Partien, CHAOS-141), Beispielnachrichten aktuell.
- macOS-Job „Native Apps“: JS-Kern und Controller bauen, Harness `full` in JavaScriptCore, App für macOS und tvOS bauen (ohne Signatur, ohne USDZ: `OHNE_ASSETS=1`).
- macOS-Job, letzter Schritt: `release-macos.sh` als Probelauf (ad hoc signiert, Hardened Runtime, Selbsttest der fertigen App).
- Workflow „Release (Mac-App)“: signiert, notarisiert und veröffentlicht (Abschnitt „Release“).
- Workflow „TestFlight (Apple TV)“: tvOS-Archiv zu TestFlight (Abschnitt „TestFlight“, CHAOS-151).
