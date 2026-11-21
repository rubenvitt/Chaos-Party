# Chaos Party — Technical Architecture

**Status:** Target architecture; verify high-risk assumptions with M1 spikes before treating them as settled.

## Architectural principles

- **PC-authoritative simulation.** The PC owns game state, rules, random seeds, scoring, physics outcomes and match progression. Controller browsers transmit input intents only.
- **Mobile devices are controllers, not game hosts.** The game world renders only on the host: the PC (Babylon.js) or, since 2026-11-17, a Mac or Apple TV with the native RealityKit host (ADR-019). The native host can run the TypeScript session server and game-core embedded (JavaScriptCore), so an Apple TV hosts on its own.
- **Code-first and testable.** Separate deterministic game rules from rendering, networking and touch UI.
- **Minigames are plugins/modules.** Each minigame follows a documented lifecycle and can be tested in isolation.
- **Vertical delivery.** Every milestone ends in a working integrated build.

## Proposed stack

| Concern | Technology | Notes |
|---|---|---|
| 3D host | Babylon.js + TypeScript | Code-defined scenes, camera, animation and VFX |
| Physics | Havok via Babylon.js | Verify WASM loading, deterministic assumptions and deployment |
| Host UI | React | Lobby, HUD, settings and results; integrate with canvas |
| Controller UI | React web app | Responsive iPhone and shared-iPad multitouch layouts |
| Local communication | WebSockets | Authoritative host/server; typed messages and validation |
| Game rules | Pure TypeScript package | Seeded random source, explicit state transitions |
| Workspace | pnpm monorepo | Shared contracts and isolated packages |
| Unit/integration | Vitest | Rules, protocols, minigame contracts |
| E2E/visual | Playwright | Browser flows, screenshots, simulated multiple clients |
| Desktop packaging | Browser first; Tauri optional | Revisit only if browser hosting is inadequate |

## Proposed repository layout

```text
chaos-party/
  VISION.md
  CLAUDE.md
  ARCHITECTURE.md
  ROADMAP.md
  apps/
    host/                 # PC game: Babylon.js canvas + React UI
    controller/           # Mobile browser controller, shared-iPad modes
    server/               # Local authoritative session / WebSocket server
    controller-ios/       # Native controller app (ADR-017)
    apple-host/           # Native Mac/Apple TV host: TS core in JavaScriptCore + SwiftUI/RealityKit (ADR-019)
  packages/
    game-core/            # Pure rules, seeded RNG, scoring, turn state
    protocol/             # Typed, versioned messages and validation
    minigame-sdk/         # Minigame lifecycle and shared APIs
    minigame-kit/         # Minigame building blocks: clock, spawner, movement, bots, arenas, cameras (ADR-021)
    minigames/            # The minigames, one folder each (ADR-012)
    ui/                   # Optional shared design primitives
    assets/               # Manifests, conversion/validation tooling
  tests/
    e2e/
    integration/
  docs/
    decisions/
    experiments.md
    progress.md
    device-test-checklist.md
```

This layout is a **starting proposal**. Consolidate packages if complexity exceeds their value, and document structural changes.

## Runtime topology

```text
                      local Wi-Fi / LAN
  iPhone browser ───────┐
  iPhone browser ───────┤  WebSocket input intents
  shared iPad browser ──┼──────────► PC session server
  (2–4 touch zones) ────┘                 │
                                         ▼
                                  game-core rules
                                         │
                               authoritative state
                                         │
                                         ▼
                                 PC Babylon.js host
                               (React UI + 3D scene)
```

A PC may run both server and host UI. Choose network bindings and discovery carefully; QR links must point to a LAN-reachable address, **not `localhost`**. A reverse proxy is unnecessary for the first local proof unless browser security constraints require it. Browser features requiring secure contexts (notably some motion APIs) need a specific feasibility test and fallback. Consider local HTTPS only when required and practical.

## Session and controller protocol

- Session has short join code / QR link; server assigns player slot and controller token.
- Messages are **versioned**, typed and runtime-validated (e.g., with a schema library).
- Suggested intents: `join`, `ready`, `move`, `press`, `release`, `gesture`, `reaction`, `heartbeat`, `reconnect`.
- Server broadcasts only relevant UI/control context to each controller: phase, available actions, input layout and feedback.
- Prevent spoofed player IDs, duplicate joins and invalid/out-of-phase actions. Apply bounded rate limits and input sanitization.
- Sequence numbers/timestamps help discard stale input; heartbeat detects disconnects; reconnect tokens are scoped to a session.
- For shared iPad, map **touch identifier → player zone** at touch start and keep ownership until release/cancel. Explicitly handle concurrent touches and orientation changes.
- Never assume network delivery timing is deterministic. Define reasonable input buffering, reaction windows and fallback behavior.

## Game-core design

Use a finite state machine, for example:

```text
LOBBY → SETUP → TURN_START → ROLL → MOVE → SPACE_EVENT
     → REACTION_WINDOW? → TURN_END
     → (next player | MINIGAME_INTRO → MINIGAME_PLAY
        → MINIGAME_RESULTS → ROUND_END)
     → (next round | GAME_RESULTS)
```

Transitions should be explicit and testable. A seeded random provider makes board events and item rolls reproducible. Treat physics-based minigames as potentially nondeterministic at floating-point level: test invariants and outcomes rather than promising bit-for-bit Havok determinism across platforms.

## Minigame contract (conceptual)

```ts
interface Minigame {
  id: string;
  prepare(context: MinigameContext): Promise<void>;
  start(): void;
  handleInput(playerId: string, input: PlayerInput): void;
  update(deltaSeconds: number): void;
  getResult(): MinigameResult | null;
  dispose(): Promise<void> | void;
}
```

The final contract should define scene ownership, input mapping, time limits, scoring, lifecycle cleanup, pause/reconnect behavior and deterministic test hooks. Minigames must not mutate global board state directly; they return validated results for game-core to apply.

## Computer players (KI seats, ADR-020)

Each seat is `human` or `ai` (at least one human). A KI seat has no connection, token or iPad zone. **Board decisions run in the session server** as a virtual controller: the seat reads the same controller context and answers through the same `choose` validation as a human, after a seeded "thinking" delay. **Minigame inputs are generated in the host** next to `createMinigameRunner` and enter through the same `handleInput` path, because only the host knows the minigame state (ADR-012). Both parts are TypeScript and therefore identical on the PC host and the native Apple host (ADR-019). Strength is one value 0…1 (easy/medium/hard fixed, or dynamic per round); play styles are assigned per seed. Every KI seat uses its own derived random stream so it never shifts game-core randomness.

## Hybrid asset pipeline

- **Procedural:** board tiles, path markers, basic traps, collision shapes, simple props, particles and lightweight effects.
- **Imported/generated:** complex characters, rigged animations and special props; normalize via glTF/GLB.
- Store source/attribution/license metadata in a machine-readable asset manifest.
- Validate missing references, file sizes, mesh scale, material compatibility, animation names and performance budgets in CI where feasible.
- Keep gameplay hitboxes independent of detailed render meshes; support asset replacement without modifying rules.
- Maintain a cohesive style guide for silhouettes, proportions, color, lighting and motion.

## Testing strategy

1. **Unit:** rules, score/trophy logic, items, transitions, seeded events, protocol validation.
2. **Integration:** server + game-core + synthetic controllers; full round and minigame handoffs.
3. **E2E:** Playwright browser sessions, join/ready/play/result paths, multiple clients and screenshot regression.
4. **Performance:** basic frame-rate and controller-input latency instrumentation; record hardware and test conditions, set thresholds from M1 baselines rather than inventing universal numbers.
5. **Hardware:** actual iPhone and iPad touch, simultaneous zones, reconnection, Wi-Fi reachability and optional sensors.
6. **Manual product gate:** fun, clarity, fairness, art coherence and replayability.

## Technical risks to retire early

| Risk | Early validation |
|---|---|
| iPad simultaneous multi-player touch | Real iPad test with at least two concurrent zones; expand to four |
| iPhone browser input and latency | Real phones on target LAN; record input-to-render timing |
| QR join / LAN reachability | Test Wi-Fi isolation, firewall, address selection and reconnect |
| Browser secure-context limits | Test sensor APIs; retain touch-only fallback |
| Babylon.js + Havok integration | Simple physics scene, asset load and packaged build |
| Visual test reliability | Stable camera, fixed seeds, deterministic screenshot conditions |
| Asset licensing and cohesion | Manifest + automated checks + human art review |

## Architecture decision policy

The stack is **preferred, not dogma**. Changing engine, server topology or packaging requires a small proof, comparative evidence, ADR and human approval if it materially changes product scope or maintenance burden.
