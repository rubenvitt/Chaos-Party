# Vertrag zwischen JS-Kern und Swift-App (ADR-019 §2, CHAOS-138/139)

Swift ist nur Transport, Uhr und Darstellung. Alles Spiel – Session-Server, game-core und die Host-Rolle samt Minispielen (headless, Havok) – läuft als ein JS-Bündel in JavaScriptCore.

**Quelle der Wahrheit ist [`src/contract.ts`](src/contract.ts)** (TypeScript-Typen und zod-Schema). Diese Datei fasst zusammen. Beispielnachrichten je Phase: [`harness/Fixtures/render-state/`](harness/Fixtures/render-state), erzeugt aus `src/examples.ts` mit `node scripts/export-apple-host-fixtures.mjs`.

Ein neues Feld in `renderState` heißt: in `RenderStateSchema` eintragen (sonst scheitert der Bündel-Test, das Schema ist streng), in `app/RenderState.swift` optional ergänzen, Beispiele nachziehen.

## Bündel

`apps/apple-host/dist/chaos-host.js` (IIFE, ES2022, ohne Node- und DOM-APIs) setzt `globalThis.ChaosHost` und `globalThis.ChaosHostInternals` (nur für Harness/Tests: `base64url`, `rotation`, `pendingTimers`). Havok kommt als Bytes von Swift (`env.havokWasm`), nicht per fetch.

```ts
interface HostEnv {
  send(connId: number, text: string): void; // Text-Frame an eine Controller-Verbindung
  close(connId: number, code: number, reason: string): void;
  log(line: string): void;
  randomBytes(n: number): number[]; // Swift: SecRandomCopyBytes, genau n Bytes
  havokWasm: Uint8Array | number[]; // Inhalt von HavokPhysics.wasm
  joinUrl: string; // http://<ip>:<port>/?code=<CODE>
  joinCode: string;
}
interface ChaosHostApi {
  create(env: HostEnv): ChaosHostInstance;
}
interface ChaosHostInstance {
  open(connId: number): void; // neue WebSocket-Verbindung an /ws (IDs > 0)
  message(connId: number, text: string): void; // eingehender Text-Frame
  closed(connId: number): void;
  tick(nowMs: number): void; // ~60× pro s (Anzeige-Takt), monotone ms-Uhr; treibt
  // Zeitgeber, Session-Fristen und 1/60-Schritte der Minispiele
  renderState(): string; // JSON, siehe unten; je Bild nach tick
  hostCommand(cmd: string): void; // 'start' | 'pause' | 'resume' | 'end-game' | 'rematch'
}
```

`setTimeout`, `performance`, `structuredClone` und `crypto` gibt es in JavaScriptCore nicht: Das Bündel polyfillt sie aus `tick` und `env.randomBytes`. Nach jedem Aufruf aus Swift laufen die Mikrotasks des Kontexts leer (JSC-Verhalten, auf das sich der Kern verlässt).

## renderState (JSON)

```jsonc
{
  "phase": "lobby" | "board" | "minigame" | "final" | "paused",
  "lobby": { "joinUrl": "…", "joinCode": "AB12",
             "players": [{ "slot": 1, "name": "Anna", "color": "#0072B2", "connected": true, "ready": false, "character": "raccoon" | null }] },
  "board": null | {
    "round": 1, "rounds": 10, "activeSlot": 1 | null,
    "spaces": [{ "id": "s01", "x": 0, "z": 0, "kind": "start" | "coins-plus" | "coins-minus" | "event" | "item" | "trophy" }],
    "pawns": [{ "slot": 1, "spaceId": "s03", "x": 1.2, "z": -3.4, "character": "raccoon" }],
    "messages": ["Anna würfelt eine 4."],                                // höchstens 6, älteste zuerst
    "notice": null | { "title": "Sabotage wird stärker!", "detail": "Klau: 6 Münzen · Falle: 5 Münzen" }
                                                                         // große Einblendung, 4 s (CHAOS-157)
  },
  "minigame": null | {
    "id": "pudding-gerangel", "stage": "intro" | "play" | "results", "elapsedMs": 1234,
    "bodies": [{ "id": "kirsche#57", "shape": "sphere" | "box" | "cylinder",
                 "pos": [0, 0, 0], "rot": [0, 0, 0, 1], "size": [1, 1, 1], "color": "#D7263D" }],
    "hud": "48 s · Anna 3 · Ben 1"
  }
}
```

- `board.notice` kommt aus `eventNotice` (`apps/host/src/board/texts.ts`): bisher nur in Wachstumsrunden der Sabotage (`round-started` mit `sabotage`), bei `sabotageGrowthRounds: 0` nie. Der Kern hält sie 4 s (`src/notice.ts`); Swift zeigt sie nur in der Phase `board`.
- `phase` ist `lobby`, solange die Session nicht im Brettspiel ist (auch die M1-Arena erscheint als `lobby`). `paused` hat Vorrang vor `minigame` und `final`.
- Koordinaten roh aus Babylon/game-core (linkshändig). Pawns: Feldmitte plus Versatz bei mehreren Figuren auf einem Feld.
- Körper: `pos` = Weltmitte der Bounding-Box, `rot` = Weltrotation (x, y, z, w), `size` = lokale Ausdehnung × Skalierung (vor der Rotation). `shape` wird aus den Eckpunkten geschätzt (Kugel / Zylinder inkl. Scheibe, Kapsel und Torus / sonst Quader). `color` ist `diffuseColor` bzw. `albedoColor`. Unsichtbare und deaktivierte Meshes fehlen; Thin Instances werden nicht einzeln ausgegeben. Eine stabile Zuordnung Körper → Darstellung folgt mit CHAOS-144/149.
