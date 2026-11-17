# Spike „Apple TV hostet allein“ (CHAOS-138, ADR-019 W2)

Schnittstelle zwischen JS-Kern und Swift-App: [CONTRACT.md](CONTRACT.md).

## App

`app/` ist eine SwiftUI-/RealityKit-App für tvOS 26 und macOS 26 (`dev.rubeen.chaosparty.tvhost`). Sie lädt
`chaos-host.js` in einen `JSContext` auf einer eigenen seriellen Queue, reicht Havok als `Uint8Array` hinein und ruft
je Bild `tick(now)` und `renderState()` auf (Takt: `SceneEvents.Update` der ARView; läuft der letzte Tick noch, wird
das Bild ausgelassen). Netzwerk, Uhr, Zufall (`SecRandomCopyBytes`) und Darstellung kommen aus Swift.

- **Ein Port für alles** (8787, sonst der nächste freie): `NWListener` mit reinem TCP. `GET /ws` mit Upgrade wird zur
  WebSocket-Verbindung (RFC 6455 von Hand: Maskierung, 7/16/64-Bit-Längen, Fragmente, Ping/Pong, Close, Grenze 1 MiB),
  alles andere liefert den Controller-Build aus dem Bundle (`/?code=…` → `index.html`, MIME-Typen, nichts außerhalb
  des Controller-Ordners). Ein Listener mit `NWProtocolWebSocket` nimmt nur Upgrades an, der Controller verbindet sich
  aber mit demselben Ursprung (`apps/controller/src/net/client.ts`).
- **Join-Link** `http://<LAN-IPv4>:<port>/?code=<4 Zeichen>`: erste IPv4 eines `en*`-Interfaces (en0 bevorzugt), Code
  aus demselben Alphabet wie `apps/server/src/ids.ts`.
- **Darstellung** (Spike-Qualität): Lobby als SwiftUI-Overlay mit QR-Code (`CIQRCodeGenerator`), Link, Spielerliste
  und Knopf „Partie starten“ (macOS: Return, tvOS: Siri-Remote-Auswahl). Brett: Felder als Scheiben, Figuren als
  Kugeln; Minispiel: `minigame.bodies` generisch als Kugel/Quader/Zylinder. Babylon ist linkshändig: z und die
  x/y-Anteile der Quaternion werden gespiegelt.
- **Messung**: alle 10 s eine Zeile `SPIKE-ERGEBNIS {json}` (Bildabstand Median/p95, JS-Zeit je Tick für
  `tick`+`renderState` Median/p95/max, ausgelassene Ticks, Verbindungen, Körper).

`app/StubHost.js` ersetzt das Bündel, solange `jscore/dist/chaos-host.js` fehlt (kein Controller-Protokoll, nur
Echo und Scheindaten für Brett und Minispiel).

### Bauen

```sh
cd spikes/apple-host
./prepare.sh            # payload/: Havok-Wasm, Controller-Build (pnpm), chaos-host.js oder Stub
xcodegen generate
# macOS
xcodebuild -project ChaosTVHost.xcodeproj -scheme ChaosTVHost -destination 'platform=macOS' -configuration Release -derivedDataPath build build
open -W -n --stdout /tmp/tvhost.log --stderr /tmp/tvhost.log build/Build/Products/Release/ChaosTVHost.app
# tvOS-Simulator
xcodebuild -project ChaosTVHost.xcodeproj -scheme ChaosTVHost -destination 'generic/platform=tvOS Simulator' -configuration Release -derivedDataPath build build
```

Echtes Apple TV (Team nur auf der Kommandozeile; `xcodebuild` will die UDID, `devicectl` die CoreDevice-ID):

```sh
xcodebuild -project ChaosTVHost.xcodeproj -scheme ChaosTVHost -destination 'id=<UDID>' -configuration Release -derivedDataPath build -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=<TEAM-ID> CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" build
xcrun devicectl device install app --device <CoreDevice-ID> build/Build/Products/Release-appletvos/ChaosTVHost.app
xcrun devicectl device process launch --device <CoreDevice-ID> --console --terminate-existing dev.rubeen.chaosparty.tvhost
```

Mit dem Startargument `--autostart` (an `process launch` bzw. `simctl launch` anhängen) startet die Partie, sobald
alle Spieler der Lobby bereit sind; dann braucht es weder Fernbedienung noch Tastatur. Die App hält tvOS wach
(`isIdleTimerDisabled`), weil während einer Partie niemand die Fernbedienung anfasst.

Das Apple TV muss wach sein („System is asleep – foreground app launch forbidden“ sonst). Beim ersten Start fragt
tvOS nach dem Zugriff aufs lokale Netzwerk; ohne Zustimmung erreicht kein Controller die App.

### Prüfen

Der Join-Link steht im Log (`JOIN-URL …`).

```sh
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' 'http://<ip>:<port>/?code=<CODE>'   # 200 text/html
curl -s -o /dev/null -w '%{http_code}\n' --path-as-is 'http://<ip>:<port>/../../etc/passwd'  # 404
```

Danach im Browser `http://<ip>:<port>/?code=<CODE>` öffnen (zweiter Spieler in einem privaten Fenster), Figur wählen,
„Bereit!“, in der App „Partie starten“.
