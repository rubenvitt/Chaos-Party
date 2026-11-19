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
  deferSceneReady?: boolean;                         // true: host-ready erst nach sceneReady() (CHAOS-142)
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
  hostCommand(cmd: string): void; // 'start' | 'pause' | 'resume' | 'end-game' | 'rematch' | 'configure:…'
  sceneReady(): void; // Brett und Figuren geladen → host-ready (CHAOS-68/142)
}
```

`configure` (CHAOS-166): `configure:rounds=12`, `configure:moreReactionTime=1` (`0`/`1`/`true`/`false`) oder beides mit Komma, `configure:rounds=12,moreReactionTime=1`. Runden 1–20. Wirkt nur in der Lobby; außerhalb loggt der Kern „ignoriert: nur in der Lobby“, Ungültiges „Ungültiger Host-Befehl“, gesendet wird dann nichts. Der neue Stand steht im nächsten `renderState().lobby.settings`.

`host-ready` (CHAOS-68): Ohne `deferSceneReady` ist der Host sofort bereit (Harness, Tests, `--selftest`). Die App setzt es und ruft `sceneReady()`, sobald `brett.usdz`, die Instanzen und die Figuren geladen sind; bis dahin ist „Partie starten“ gesperrt.

`setTimeout`, `performance`, `structuredClone` und `crypto` gibt es in JavaScriptCore nicht: Das Bündel polyfillt sie aus `tick` und `env.randomBytes`. Nach jedem Aufruf aus Swift laufen die Mikrotasks des Kontexts leer (JSC-Verhalten, auf das sich der Kern verlässt).

## renderState (JSON)

```jsonc
{
  "phase": "lobby" | "board" | "minigame" | "final" | "paused",
  "lobby": { "joinUrl": "…", "joinCode": "AB12",
             "players": [{ "slot": 1, "name": "Anna", "color": "#0072B2", "connected": true, "ready": false, "character": "raccoon" | null }],
             "settings": null | { "rounds": 10, "roundPresets": [10, 16, 20], "moreReactionTime": false } },  // CHAOS-166
  "board": null | {
    "round": 1, "rounds": 10, "activeSlot": 1 | null,
    "spaces": [{ "id": "s01", "x": 0, "z": 0, "kind": "start" | "coins-plus" | "coins-minus" | "event" | "item" | "trophy" }],
    "pawns": [{ "slot": 1, "spaceId": "s03", "x": 1.2, "z": -3.4, "character": "raccoon",
                "y": 0.4, "hop": null | { "from": "s03", "to": "s04", "t": 0.5, "style": "walk" | "gust" | "swap" },
                "heading": null | 1.57, "connected": true }],                   // Lage aus der Brett-Regie (CHAOS-143)
    "messages": ["Anna würfelt eine 4."],                                // höchstens 6, älteste zuerst
    "notice": null | { "title": "Sabotage wird stärker!", "detail": "Klau: 6 Münzen · Falle: 5 Münzen" }
                                                                         // große Einblendung, 4 s (CHAOS-157)
    // Brett-Regie (CHAOS-143), aus director.getFrame()/getHud() im JS-Kern:
    "popups": [{ "id": 12, "kind": "coins" | "dice" | "item" | "trap" | "trophy" | "event" | "shield" | "steal",
                 "slot": 1 | null, "spaceId": null | "s05", "text": "+3", "tone": "good" | "bad" | "neutral" | "gold",
                 "progress": 0.3, "stack": 0, "reaction": null | "cheer" | "hit" | "jump" }],
                                                                         // stack: Stapelebene gleichzeitiger Popups über derselben Stelle, je 1,4 entlang Kamera-oben (CHAOS-189)
    "ticker": [{ "id": 7, "text": "Anna bekommt 3 Münzen", "slot": 1 | null, "tone": "good" }],   // höchstens 4, je 5 s
    "hud": null | { "boardName": "Wackelwald", "roundText": "Runde 3/10", "banner": null | "Ben ist dran!", "bannerSlot": 2,
                    "status": null | { "slot": 2, "kind": "roll", "text": "Ben darf würfeln …", "detail": null, "countdown": null | "3 … 2 … 1" },
                    "players": [{ "slot": 1, "name": "Anna", "color": "#0072B2", "coins": 12, "trophies": 1,
                                  "items": [{ "id": "shield", "name": "Schild" }], "connected": true, "active": false }],
                    "tailwind": null | { "lead": "…", "rows": [{ "slot": 2, "name": "Ben", "amount": "+4 Münzen" }] } },
    "camera": { "x": 3.9, "z": 3.9 },                                    // Blickpunkt (cameraFocus), Swift zieht nach
    "trophySpaces": ["s12"], "traps": [{ "spaceId": "s15", "owner": 2 }],
    "sounds": [{ "id": 3, "name": "dice", "voices": [{ "wave": "noise", "freq": 0, "attack": 0.002, "duration": 0.04, "gain": 0.26,
                                                       "filter": { "type": "bandpass", "freq": 1900, "q": 2 } }] }]
  },
  "minigame": null | {
    "id": "pudding-gerangel", "stage": "intro" | "play" | "results", "elapsedMs": 1234,
    "bodies": [{ "id": "kirsche#57", "shape": "sphere" | "box" | "cylinder",
                 "pos": [0, 0, 0], "rot": [0, 0, 0, 1], "size": [1, 1, 1], "color": "#D7263D",
                 // CHAOS-144, alle optional:
                 "mesh": "g12", "role": "kirsche", "key": "2", "alpha": 0.4, "glow": "#3A0B11",
                 "finish": "matt" | "glanz" | "metall" | "stoff", "twoSided": true }],
    "hud": "48 s · Anna 3 · Ben 1",                                      // Kurzfassung (Debug)
    "ready": true, "round": 3, "repeat": false, "countdown": 7 | null,
    "info": { "title": "…", "tagline": "…", "instructions": ["…"], "controls": { "joystick": "Laufen", "a": "Schubsen", "b": null }, "scoreUnit": "Punkte" },
    "camera": null | { "pos": [0, 11.5, -13.5], "target": [0, -1.3, 0.8], "fov": 0.8, "fovAxis": "vertical" | "horizontal" },
    "backdrop": null | { "halfX": 7.2, "halfZ": 7.2, "groundY": -3.3, "surface": "wiese" | "decke" },
    "figures": [{ "slot": 1, "character": "raccoon", "pos": [0, 0, 0], "rot": [0, 0, 0, 1], "scale": [1, 1, 1],
                  "visible": true, "anim": "run", "animSeq": 4 }],
    "scoreboard": null | { "seconds": 48, "banner": "…" | null, "waiting": false,
                           "scores": [{ "slot": 1, "name": "Anna", "character": "Wusel", "color": "#0072B2", "symbol": "●",
                                        "score": 3, "status": null, "connected": true }] },
    "results": null | { "aborted": false, "headline": "Anna gewinnt!", "highlights": ["…"],
                        "rows": [{ "slot": 1, "name": "Anna", "character": "Wusel", "color": "#0072B2", "symbol": "●",
                                   "place": 1, "tied": false, "scoreText": "5 Punkte", "coins": 10, "prizes": ["Schild"] }] },
    "effects": [{ "seq": 7, "kind": "impact" | "sparkle" | "confetti" | … | "shake", "pos": [0, 0, 0], "color": null, "strength": 1 }],
    "geometry": [{ "id": "g12", "vertices": 482, "positions": "<base64>", "normals": "<base64>", "indices": "<base64>",
                   "wideIndices": false, "extent": [1, 0.5, 1] }],
    "geometryTotal": 43
  }
}
```

- `lobby.settings` (CHAOS-166) ist der Server-Stand der Lobby-Einstellungen für die nächste Partie: Rundenzahl, Vorschläge für die Rundenwahl (aufsteigend) und „Mehr Zeit zum Reagieren“ (CHAOS-124, Reaktionsfenster 5 s statt 3 s). `null` nur, bis die Host-Rolle ihre erste `lobby`-Nachricht hat (in der Praxis schon nach `create`). Ändern über `hostCommand('configure:…')`.
- **Brett-Regie (CHAOS-143):** `round`, `activeSlot`, `messages` und `notice` folgen dem neuesten Stand (wie bisher). Alles andere zeigt den Stand, den die Regie gerade spielt (`apps/host/src/board/director.ts`, unverändert, in `src/boardDirection.ts`): `pawns` (Lage auf der Hüpf- bzw. Flugbahn, `heading` in Babylon-Konvention, RealityKit: negieren), `popups`, `ticker`, `hud` (Texte aus `texts.ts`, Münzen schon um gespielte Ereignisse aktualisiert), `camera`, `trophySpaces`, `traps`. Während eines Minispiels steht die Regie; danach holt sie ohne Animation auf.
- `board.sounds`: Klänge der letzten 1,5 s mit steigender `id` je Partie (neue Partie: ab 1). Swift spielt jede ID einmal und setzt den Zähler in der Lobby zurück. `voices` ist das Rezept aus `apps/host/src/fx/sounds.ts` mit Lautstärke und Tonhöhe angewandt.
- `board.notice` kommt aus `eventNotice` (`apps/host/src/board/texts.ts`): bisher nur in Wachstumsrunden der Sabotage (`round-started` mit `sabotage`), bei `sabotageGrowthRounds: 0` nie. Der Kern hält sie 4 s (`src/notice.ts`); Swift zeigt sie nur in der Phase `board`.
- `phase` ist `lobby`, solange die Session nicht im Brettspiel ist (auch die M1-Arena erscheint als `lobby`). `paused` hat Vorrang vor `minigame` und `final`.
- Koordinaten roh aus Babylon/game-core (linkshändig). Pawns: Feldmitte plus Versatz bei mehreren Figuren auf einem Feld.
- Körper: `pos` = Weltmitte der Bounding-Box, `rot` = Weltrotation (x, y, z, w), `size` = lokale Ausdehnung × Skalierung (vor der Rotation). `shape` wird aus den Eckpunkten geschätzt (Kugel / Zylinder inkl. Scheibe, Kapsel und Torus / sonst Quader). `color` ist `diffuseColor` bzw. `albedoColor`. Unsichtbare und deaktivierte Meshes fehlen; Thin Instances werden nicht einzeln ausgegeben. Figuren (`markVisual`-Rolle `figur`) fehlen in `bodies`; sie kommen als `figures`.

### Minispiel-Darstellung (CHAOS-144)

- **Geometrie statt Grundform:** Die Minispiele bauen ihre Requisiten aus Babylon-Meshes. Der Kern schickt deren echte Geometrie einmal je Minispiel (`src/geometry.ts`): dedupliziert (gleiche Vertexdaten = ein Eintrag), um die Mitte der lokalen Bounding-Box verschoben, als Base64 der rohen Bytes (Float32-Positionen, Int8-Normalen ÷ 127, Uint16- bzw. Uint32-Indizes, little-endian). `geometry` enthält nur, was seit dem letzten `renderState` fertig kodiert ist (höchstens ≈ 256 KB und 2 ms Kodierzeit je Aufruf); jeder Eintrag kommt genau einmal. Ein Körper mit `mesh` wird mit Skalierung `size / extent` je Achse gezeichnet (Achse ohne Ausdehnung: 1); fehlt die Geometrie noch, zeichnet Swift `shape`. Swift spiegelt z an Positionen und Normalen; Babylons Vorderseiten (im Uhrzeigersinn) werden dadurch zu RealityKits Vorderseiten, die Indizes bleiben.
- **Rollen:** `role`/`key` aus `markVisual` (CHAOS-149), fehlt = Kulisse. Swift kann einzelne Rollen später durch eigene Modelle oder Effekte ersetzen; heute zeichnet es jede Rolle mit ihrer Geometrie.
- **Material:** `color` und `alpha` (Material × Sichtbarkeit) je Bild, `glow` = Eigenleuchten, `finish` aus `look.material` (Rauheit wie der Look des Browser-Hosts), `twoSided` = `backFaceCulling = false`.
- **Look:** Die Bühne gibt dem Minispiel wie der Browser-Host einen `look` (gleicher Code-Pfad, kein eigenes Licht, kein Boden bis zum Horizont). `backdrop` ist die Spielfläche aus `look.backdrop`; die Kulisse drumherum (Wiese, Picknickdecke, Bäume) baut Swift.
- **Figuren:** Wurzelknoten (Füße) mit Lage, Rotation und Skalierung; `anim` ist die zuletzt gespielte Animation, `animSeq` zählt jedes `play` (Einmal-Clips wie `hit` erneut abspielen). Im Ergebnis jubelt Platz 1, die anderen schmollen (wie `celebrate` im Browser-Host).
- **Kamera:** `scene.activeCamera` je Bild (Position, Ziel, Öffnungswinkel in Radiant).
- **Effekte:** `ctx.fx.burst`/`shake` als nummerierte Ereignisse der letzten 1,5 s; Swift spielt jede `seq` einmal. Klänge fehlen im nativen Host noch.
- **Bildschirme:** `info`, `countdown` (Intro), `scoreboard` (Spiel), `results` (Ergebnis mit Münzen und Trostpreis) kommen aus denselben Funktionen wie im Browser-Host (`plan.ts`, `results.ts`, `texts.ts`); `repeat` = kurze Anleitung (CHAOS-66).
