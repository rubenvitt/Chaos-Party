# Probe: Kann die Apple TV allein hosten? (CHAOS-135, ADR-019)

Wegwerf-Probe, kein Spielcode. Eine tvOS-App ohne Oberfläche prüft auf dem echten Gerät:

- ob JavaScriptCore `WebAssembly` anbietet (kleines Modul, 5 Mio. Aufrufe)
- ob Havok (`HavokPhysics.wasm`) übersetzt, startet und rechnet: 40 Kugeln, 600 Schritte
- wie schnell game-core läuft: 20 Bot-Partien aus `simulateGame`, gebündelt mit esbuild
- ob ein `NWListener` mit WebSocket-Protokoll lauschen darf

## Ergebnis (17.11.2026, Apple TV 4K 3. Gen., tvOS 27)

```
PROBE WebAssembly=object
PROBE tiny ok sum=5000000 ms=496
PROBE havok compile ok bytes=2094563 ms=16
PROBE havok init ms=21 600 steps 40 bodies ms=462 perStep=0.770
PROBE gamecore {"games":20,"ms":77,"turns":800}
PROBE listener state ready
```

Havok braucht in JavaScriptCore zwei Anpassungen:

- einen Polyfill `globalThis.performance = { now: () => Date.now() }`
- eine synchrone Instanziierung über `instantiateWasm` mit `new WebAssembly.Instance(...)`

Die asynchrone Emscripten-Instanziierung kehrt in JavaScriptCore nicht zurück.

## Bauen und starten (fish, im Repo-Wurzelverzeichnis)

```fish
set P spikes/apple-host-probe
node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild $P/gamecore-entry.ts --bundle --format=iife --target=es2022 --outfile=$P/app/gamecore.js
cp node_modules/.pnpm/@babylonjs+havok@*/node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm $P/app/
cp node_modules/.pnpm/@babylonjs+havok@*/node_modules/@babylonjs/havok/lib/umd/HavokPhysics_umd.js $P/app/havok_umd.js
cd $P; and xcodegen generate
xcodebuild -project JSCProbe.xcodeproj -scheme JSCProbe -destination "id=<UDID der Apple TV>" -configuration Release -derivedDataPath build -allowProvisioningUpdates build
xcrun devicectl device install app --device <ID> build/Build/Products/Release-appletvos/JSCProbe.app
xcrun devicectl device process launch --device <ID> --console --terminate-existing dev.rubeen.chaosparty.jscprobe
```

Die kopierten und erzeugten Dateien (`app/gamecore.js`, `app/HavokPhysics.wasm`, `app/havok_umd.js`, `*.xcodeproj`, `build/`) sind nicht eingecheckt.
