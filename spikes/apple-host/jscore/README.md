# JS-Kern des Apple-Hosts (Spike CHAOS-138, ADR-019 W2)

Ein Bündel `dist/chaos-host.js` für JavaScriptCore: Session-Server (`apps/server/src/session.ts`),
game-core und die Host-Rolle samt headless Minispielen (Babylon-NullEngine + Havok). Swift macht
nur Transport, Uhr und Darstellung. Schnittstelle: [`../CONTRACT.md`](../CONTRACT.md).

## Bauen und prüfen

```sh
spikes/apple-host/jscore/build.sh                      # dist/chaos-host.js + dist/HavokPhysics.wasm
swift spikes/apple-host/jscore/harness/main.swift      # 2 Controller bis zum ersten angenommenen Minispiel
swift spikes/apple-host/jscore/harness/main.swift full # ganze Partie bis zum Endstand
pnpm exec tsc -p spikes/apple-host/jscore              # Typprüfung
```

Der Harness lädt das Bündel in ein `JSContext` (macOS), spielt mit zwei Controllern über echte
Protokoll-Nachrichten (join, pick-character, ready, choose, move/press, heartbeat), startet per
`hostCommand('start')` und gibt Phasenwechsel, `renderState`-Auszüge und die CPU-Zeit je Tick aus.
Die Uhr ist virtuell (60 Ticks je Spielsekunde ohne Warten). Gemessen wird die CPU-Zeit des Threads.

**JIT:** Im Harness läuft JSC auf macOS faktisch ohne JIT. Eine Zählschleife (3·10⁷ Runden) braucht
in JSC 2,6 s, mit `node --jitless` 3,0 s und mit node samt JIT 0,5 s (alles auf derselben, stark
ausgelasteten Maschine). `JSC_useJIT=false` ändert nichts. Die Zahlen sind damit näher an tvOS als
erwartet. Ein Apple-TV-Kern ist aber langsamer, auf tvOS ist also mit höheren Zeiten zu rechnen.

## Messwerte (macOS, 17.11.2026, Maschine stark ausgelastet)

Ganze Partie (`full`): 10 Runden, 10 Minispiele aus der Rotation (Sockenregen, Pudding-Gerangel,
Wackelturm, Kuckucks-Klatsche), 10 von 10 Ergebnissen angenommen, Endstand erreicht, keine
JS-Ausnahmen. CPU-Zeit je Aufruf, Ø / max:

| Abschnitt | `tick` | `renderState` |
|---|---|---|
| Brett | 0,06 / 32 ms | 0,06 / 4 ms |
| Minispiel-Intro | 0,7 / 960 ms | 0,8 / 48 ms |
| Minispiel-Spiel (50–100 Körper) | 0,4 / 26 ms | 3,0 / 22 ms |

Die Spitze im Intro ist der Aufbau der Bühne (NullEngine, Szene, `prepare`, Havok-Welt). Er läuft
synchron in einem `tick` und hält den Swift-Hauptthread an. Auf tvOS kann das über eine Sekunde
dauern. `renderState` im Minispiel kostet am meisten (Körper + JSON, 9–16 KiB je Bild).

## Aufbau

- `src/main.ts` – `ChaosHost.create(env)`. Controller-Verbindungen gehen unverändert an die
  `Session`. Die Host-Rolle ist `connectHost` aus `apps/host` an einem Socket im Prozess (negative
  Verbindungs-IDs): `host-hello`, Herzschlag, `host-ready`, Start/Befehle. Minispiel-Ablauf,
  Ergebnisversand und Texte kommen aus `apps/host` (`plan.ts`, `results.ts`, `resultSender.ts`,
  `texts.ts`, `layout.ts`). Zustellungen zwischen Host und Session laufen über eine Warteschlange,
  nie verschachtelt.
- `src/stage.ts` – Minispiel-Bühne ohne Canvas: NullEngine-Szene, Runner aus dem minigame-sdk,
  Kapsel-Figuren, keine Effekte. `bodies()` liest Meshes generisch aus der Szene.
- `src/polyfills.ts` – `setTimeout`/`clearTimeout` (feuern in `tick`), `performance.now` (Uhr aus
  `tick`), `structuredClone` (JSON), `global` (NullEngine sucht `self ?? global ?? window`).
- `src/nodeCrypto.ts` – Ersatz für `node:crypto` (esbuild-Alias) aus `env.randomBytes`.

## Erkenntnisse

- Ein nacktes `JSContext` hat weder `setTimeout`, `performance`, `structuredClone`, `URL`,
  `TextEncoder` noch `queueMicrotask`. `window`/`self` bleiben bewusst undefiniert.
- `URL` fehlt: zods `z.url()` würde jede `joinUrl` ablehnen. Die Session bekommt darum keine
  `joinUrl`. `renderState().lobby.joinUrl` kommt direkt aus `env`, und `lobby` an den Host hat kein
  `joinUrl` (braucht der Apple-Host nicht).
- Havok: ESM-Build, synchron über `instantiateWasm` mit `new WebAssembly.Instance`. Swift sollte
  `havokWasm` ohne Kopie als `Uint8Array` übergeben
  (`JSObjectMakeTypedArrayWithBytesNoCopy`, siehe Harness). 2 MB als `NSNumber`-Array sind langsam.
- Ohne Rendern zählt Babylon die Render-ID nicht hoch, und `computeWorldMatrix()` liefert dann die
  Matrix aus dem ersten Aufruf. `bodies()` erhöht die Render-ID darum wie ein gerendertes Bild. Die
  Lage eines Meshes wird nur neu gerechnet, wenn sich seine Weltmatrix ändert (`updateFlag`).
- Promises in JSC: Mikrotasks laufen nach jedem Aufruf aus Swift. Abgelehnte Promises meldet JSC
  nicht, darum hat jeder Promise-Weg ein explizites `catch` → `env.log`.

## Uhr und Koordinaten

- `tick(nowMs)`: Jede monotone ms-Uhr passt (z. B. `CACurrentMediaTime() * 1000`). Der Kern zählt ab
  dem ersten `tick` von 0. Epoch-Zeit (`Date()`) läuft auch, kann aber springen (NTP); Rücksprünge
  werden ignoriert, Vorsprünge lassen Fristen ablaufen.
- Koordinaten sind roh aus Babylon/game-core: linkshändig, y oben, x rechts, z nach hinten. Für
  RealityKit (rechtshändig) z spiegeln: `z → -z`, Quaternion `(x, y, z, w) → (-x, -y, z, w)`.

## renderState: Körper

`pos` = Weltmitte der Bounding-Box, `rot` = Weltrotation (Quaternion x, y, z, w), `size` = lokale
Ausdehnung × Skalierung (vor der Rotation). `shape` wird aus den Eckpunkten geschätzt (Kugel /
Zylinder inkl. Scheibe, Kapsel und Torus / sonst Quader). `color` ist `diffuseColor` bzw.
`albedoColor` des Materials. Unsichtbare und deaktivierte Meshes fehlen. Thin Instances werden
nicht einzeln ausgegeben.

## Grenzen (Spike)

- Kein Klang, keine Partikel, keine Figurenmodelle: Figuren sind Kapseln.
- Keine M1-Arena (`mode: 'arena'`): Phase `play` erscheint als `lobby`.
- Ist Havok beim ersten Physik-Minispiel noch nicht geladen, wird das Minispiel nicht aufgebaut. Der
  Server bricht es dann nach seiner Frist ab. Praktisch kommt das nicht vor: Havok ist geladen,
  sobald `create` zu Swift zurückkehrt (Mikrotasks).
