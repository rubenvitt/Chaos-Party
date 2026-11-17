# Spike „Apple TV hostet allein“ – Vertrag zwischen JS-Kern und Swift-App (CHAOS-138, ADR-019 W2)

Swift ist nur Transport, Uhr und Darstellung. Alles Spiel – Session-Server, game-core und die
Host-Rolle samt Minispielen (headless, Havok) – läuft als ein JS-Bündel in JavaScriptCore.

## Bündel

`spikes/apple-host/jscore/dist/chaos-host.js` (IIFE, ES2022, ohne Node-APIs) definiert
`globalThis.ChaosHost`. Havok kommt als Bytes von Swift (`env.havokWasm`), nicht per fetch.

```ts
interface HostEnv {
  send(connId: number, text: string): void;          // Text-Frame an eine Controller-Verbindung
  close(connId: number, code: number, reason: string): void;
  log(line: string): void;
  randomBytes(n: number): number[];                  // Swift: SecRandomCopyBytes
  havokWasm: Uint8Array | number[];                  // Inhalt von HavokPhysics.wasm
  joinUrl: string;                                   // http://<ip>:<port>/?code=<CODE>
  joinCode: string;
}
interface ChaosHostApi {
  create(env: HostEnv): ChaosHostInstance;
}
interface ChaosHostInstance {
  open(connId: number): void;                        // neue WebSocket-Verbindung an /ws
  message(connId: number, text: string): void;       // eingehender Text-Frame
  closed(connId: number): void;
  tick(nowMs: number): void;                         // ~60× pro s von Swift (Anzeige-Takt); treibt Zeitgeber,
                                                     // Session-Fristen und feste 1/60-Schritte der Minispiele
  renderState(): string;                             // JSON, siehe unten; Swift ruft es je Bild auf
  hostCommand(cmd: string): void;                    // z. B. 'start' (Partie starten, wie der Start-Knopf am PC)
}
```

`setTimeout`, `performance`, `crypto` gibt es in JavaScriptCore nicht: das Bündel polyfillt sie
aus `tick` und `env.randomBytes`.

## renderState (JSON)

```jsonc
{
  "phase": "lobby" | "board" | "minigame" | "final" | "paused",
  "lobby": { "joinUrl": "…", "joinCode": "…", "players": [{ "slot": 1, "name": "…", "color": "#…", "connected": true, "ready": false, "character": "robot" }] },
  "board": {
    "round": 1, "rounds": 5, "activeSlot": 1,
    "spaces": [{ "id": "s1", "x": 0, "z": 0, "kind": "plus" }],          // Weltkoordinaten wie im Babylon-Host
    "pawns": [{ "slot": 1, "spaceId": "s3", "x": 1.2, "z": -3.4, "character": "robot" }],
    "messages": ["Blau würfelt 4"]
  },
  "minigame": null | {
    "id": "pudding-gerangel", "stage": "intro" | "play" | "results", "elapsedMs": 1234,
    "bodies": [{ "id": "p1", "shape": "sphere" | "box" | "cylinder", "pos": [0,0,0], "rot": [0,0,0,1], "size": [1,1,1], "color": "#…" }],
    "hud": "…"
  }
}
```

Der Minispiel-Zustand kommt aus der Babylon-NullEngine-Szene (Meshes mit Position/Rotation/Bounding-Box),
nicht aus minispielspezifischem Code – so braucht der Spike keine eigene Darstellung je Minispiel.
