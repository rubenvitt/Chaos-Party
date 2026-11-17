# Native controller – phase 2 work packages (CHAOS-115, ADR-017)

Two agents work in parallel against the frozen contract in `Sources/Protocol/`. Read first:
`docs/decisions/ADR-017-native-controller.md`, then the contract files, then the TS sources
named per package. Player-facing text is German with real umlauts; identifiers are English.

## Frozen contract (owner: coordinator – do not edit; ask instead)

| File | Content |
|---|---|
| `Sources/Protocol/Messages.swift` | Codable wire types (protocol v4), `ServerMessage.decode`, `ControllerMessage.encoded()`, `SlotIntent`, open string enums, `JoinCode`, `PlayerName` |
| `Sources/Protocol/JoinTarget.swift` | QR link / manual entry → `ws://…/ws` + code, `storageKey` |
| `Sources/Protocol/ControllerSession.swift` | `ControllerState` (mirror of `state/reducer.ts`), selectors (`screen`, `link`, `slotScreen`, `ownPrompt`, `isLocked`), `UiErrorCode` (texts/severity), `SessionTiming`, `ControllerSessionProtocol`, `FakeControllerSession`, `ControllerState.*Sample` |
| `Tests/Fixtures/**` | Generated – `node scripts/export-protocol-fixtures.mjs` (repo root). Never hand-edit. |
| `project.yml` | xcodegen spec (targets `ChaosControllerKit` = Protocol/Net/UI framework, `ChaosController` = app shell, `ChaosControllerTests` = non-hosted tests) |

If the contract is wrong or missing something, stop and report the smallest change you need.
Do not work around it with parallel types.

Verified on 2026-11-17: all contract files typecheck with Swift 6 (`-swift-version 6`, iOS 26
simulator SDK). A throwaway check decoded/round-tripped every fixture, rejected every
`invalid/` fixture with the right error, matched every enum against `protocol-constants.json`
and parsed QR/IPv6/manual join targets correctly. Agent A turns that into real tests.

## Commands

See `README.md` (German) for build, device and test details. Short form, from the repo root (fish):

```fish
node scripts/export-protocol-fixtures.mjs            # regenerate fixtures (after schema changes)
node scripts/export-protocol-fixtures.mjs --check    # exit 1 if the corpus is stale
pnpm install --frozen-lockfile                       # once, the integration suite starts the server
apps/controller-ios/scripts/run-tests.sh             # all Swift suites incl. server integration
apps/controller-ios/scripts/run-tests.sh --no-server # without the integration suite
```

`xcodebuild test` hangs with the iOS 27 simulator on the dev Mac (host app waits for a debugger,
"test runner hung before establishing connection"). The tests are therefore a non-hosted bundle
against the `ChaosControllerKit` framework, started by the script with `simctl spawn … xctest`.

CI has no Xcode (`ubuntu-latest` only). Swift tests are local-only; report their output.

---

## Agent A – networking, state, reconnect, tests

**Owns:** `Sources/Net/**`, `Tests/ProtocolTests/**`, `Tests/NetTests/**`,
`Tests/ServerIntegrationTests/**`. Touches nothing in `Sources/UI/**` or `Sources/App/**`.

**Read:** `apps/controller/src/net/{client,session,backoff,tokenStore,wake}.ts`,
`state/reducer.ts`, `state/errors.ts`, `board/countdown.ts`, `input/moveSender.ts`, their
`*.test.ts`, and `docs/decisions/ADR-009-reconnect.md`.

### Work

1. **`ControllerReducer`** (pure): `reduce(_ state: ControllerState, _ event:) -> ControllerState`
   – a line-by-line port of `reduce`/`reduceServerMessage`. Events: connect(target),
   socketOpen, socketClosed, reconnectScheduled(attempt), gaveUp(UiErrorCode),
   server(ServerMessage, receivedAt: ContinuousClock.Instant), noticeDismissed(id),
   choiceSent(slot, promptId, option), pickSent(slot, character, seq). Port `activatePrompt`
   (keep `totalMs` for the same prompt id), the choice and pick locks, the `pickSeqs` memory
   (8 entries) for `character-taken` → notice slot, and the severity handling (`code` →
   `target = nil`, back to the join screen). `.unknown` messages leave the state unchanged.
2. **Transport:** a `URLSessionWebSocketTask` wrapper behind a small protocol (fake in tests).
   Text frames only. Decode with `ServerMessage.decode`; on error log and drop (never crash,
   never close). Outbound: `ControllerMessage.encoded()`; the client owns `seq` (starts at 1
   per socket, increments for every `SlotIntent`, shared across slots).
3. **`LiveControllerSession`**: `@MainActor @Observable final class` implementing
   `ControllerSessionProtocol`, init `LiveControllerSession(defaults: UserDefaults = .standard)`
   plus injectable transport factory, clock and random source for tests. It ports
   `createControllerSession`:
   - **Opening:** token for `target.storageKey` → `reconnect`, else
     `join { joinCode, seats: 1, names: [name] }` (omit `names` when the name is nil or
     invalid).
   - **Timers:** heartbeat every 5 s. `t` is a Double in ms since a per-session start
     `ContinuousClock.Instant`, so RTT = `(receivedAt − start) / .milliseconds(1) − ack.t`
     (`receivedAt` and `ActivePrompt.deadline` are `Instant`s). Watchdogs:
     `connectTimeout` while connecting, `deadAfter` after every message.
   - **Before `welcome`:**

     | Error | Action |
     |---|---|
     | `bad-token` on reconnect | clear the token, `join` again |
     | `bad-join-code`, `session-full` | clear the token, give up |
     | `version-mismatch` | give up |
     | `out-of-phase` on join | give up with `gameRunning` |

   - **Close 4003** → give up with `replaced`.
   - **Any other loss** → `socketClosed`, then backoff with `SessionTiming` and ±20 % jitter.
   - **`wake()`:** if the socket is open, send a heartbeat and arm `probeTimeout`; if there is
     no socket, open one now; if one is still connecting, do nothing.
   - **`NWPathMonitor`:** status `.satisfied` → `wake()`.
   - **`leave()`:** close, clear the token, reset to `ControllerState()`.
   - **`choose`:** refuse a second choice for a locked prompt and return `false`.
4. **Move throttle:** port `planMoveSend` + `createMoveSender` (33 ms; skip equal values;
   `(0,0)` immediately; trailing timer sends the last deferred value; `reset` on a new
   socket). Clamp the vector to length ≤ 1 before sending, because the server rejects
   length > 1.001.
5. **Token store:** UserDefaults key `dev.rubeen.chaosparty.controller.session` with
   `{storageKey, token}` (one entry, like `tokenStore.ts`). No Keychain (ADR-017).

### Tests (Swift Testing)

- **Fixtures** – load from the test bundle folder `Fixtures/`:
  - `server-to-controller/*.json`: `ServerMessage.decode` succeeds, not `.unknown`.
    Re-encode with `JSONEncoder` and compare to the fixture **after removing `null` values
    recursively**, because Swift treats `null` and a missing key the same. That catches
    fields added to the schema but missing in Swift.
  - `controller-to-server/*.json`: decode as `ControllerMessage`, `encoded()`, compare
    exactly as JSON objects.
  - `unknown-type/*.json` → `.unknown(type: "lobby")`.
  - `invalid/*.txt`: `decode` throws, and the error matches the file-name prefix
    (`bad-message-`, `version-mismatch-`, `too-large`).
  - `protocol-constants.json`: every `known` list equals the TS enum (same order), and
    `ProtocolConstants.version` matches.
- **Reducer:** port the cases of `reducer*.test.ts` that apply to one slot (welcome,
  contexts, prompt lock, `invalid-choice` unlock, pick lock + `character-taken` notice,
  severities, `socket-closed` keeps players, selectors `screen`/`link`/`slotScreen`).
- **Session with fake transport and a manual clock:** join vs reconnect handshake, `bad-token`
  rejoin, give-up cases, 4003, backoff sequence (seeded random), heartbeat/watchdog, `wake`
  probe, `seq` reset per socket, `leave`.
- **Malformed input:** frames that are not JSON, binary frames, wrong `v`, oversized, missing
  fields, unknown enum values inside a valid `context`. The session stays connected and the
  state stays unchanged.
- **Multiple quick inputs:** press/release/move interleaved keep strictly increasing `seq`.
- **`JoinTarget`:**

  | Case | Expected |
  |---|---|
  | QR link with lowercase code | code uppercased |
  | `https` link | `wss://…/ws` |
  | IPv6 host | brackets kept |
  | Manual entry without a port | port 8787 |
  | Invalid code, `ftp` scheme or missing host | `nil` |
- **`ServerIntegrationTests`:** skip unless `CHAOS_SERVER_URL` and `CHAOS_JOIN_CODE` are set.
  Use the real `LiveControllerSession`:
  1. Join; expect `welcome` and a lobby `context`.
  2. `pickCharacter` → `lobby.character` is set.
  3. `setReady` → layout `wait`.
  4. Wait for a heartbeat ack, so `rttMs` is set.
  5. Kill the socket; expect a `reconnect` to the same slot without a new `join`.
  6. `leave`.

  Check first that a controller can join without a host connected. If it cannot, report it
  and do not change the server.

### Acceptance

- All tests above are green on an iOS 26+ simulator; command and output are in the report.
- No force unwraps on network data, and no `fatalError` reachable from input.
- `xcodebuild` builds with zero warnings in `Sources/Net` under Swift 6 strict concurrency.

---

## Agent B – SwiftUI screens against `FakeControllerSession`

**Owns:** `Sources/App/**` (`@main` app, session selection), `Sources/UI/**`,
`Tests/UITests/**` (if any). Touches nothing in `Sources/Net/**`.

**Read:**
- `apps/controller/src/ui/*.tsx`
- `lobby/view.ts`, `minigame/view.ts`
- `board/{prompt,status,final,items,countdown}.ts`
- `state/screen.ts`, `state/errors.ts`
- `input/joystick.ts`
- `styles.css` and `styles-m4.css` for colors and layout intent

Texts come from those files; reuse them verbatim unless they mention the browser.

### Work

1. **App shell:** `@main ChaosControllerApp`.
   - The session comes from `makeSession()`, which returns a `FakeControllerSession` for now
     (launch argument `-sample <name>` picks a `ControllerState.*Sample`). The coordinator
     switches it to `LiveControllerSession` at integration.
   - Route on `state.screen`: `.join`, `.connecting`, `.error`, `.controller`.
   - The `state.link` overlay: online pill with RTT, full-screen reconnecting overlay with
     attempt count and a "Jetzt neu verbinden" button that calls `retry()`.
   - Toast from `state.notice`, with auto-dismiss via `dismissNotice`.
   - `scenePhase == .active` → `session.wake()`.
   - `isIdleTimerDisabled = true` only while `screen == .controller`.
2. **Join screen:**
   - QR scanner with VisionKit `DataScannerViewController` (fallback AVFoundation when
     `isSupported`/`isAvailable` is false) → `JoinTarget.fromScannedURL`.
   - Manual form: address + code, `JoinTarget.manual`.
   - Optional name field, validated with `PlayerName.isValid` and remembered via
     `@AppStorage`.
   - Show `state.joinError` (wrong code).
   - Camera denied → explain and offer manual entry.
   - Hint: local network permission ("Bist du im selben WLAN?").
3. **Controller screen:** switch on `state.slotScreen(slot)` for `state.ownSlot`.

   | Screen | Content |
   |---|---|
   | `lobby` | four character cards (`CharacterId.known`, name/blurb). States: mine (also pending from `state.picks`), free, taken. Taken cards use the owner color from `takenBy`, otherwise neutral. "Bereit!" when `actions` contains `ready`; ready = layout `wait`, with the hint texts from `lobby/view.ts`; rounds label |
   | `lobbyBasic` | only "Bereit!" |
   | `wait` | waiting screen |
   | `board` | own status (coins, trophies, items, round x/y, whose turn). With `state.ownPrompt(slot)`: buttons following `describePrompt` (roll / target with player colors + cancel / path / trophy buy-skip / reaction / other), countdown bar from `ActivePrompt.fraction(at:)` in a `TimelineView`, buttons locked while `state.isLocked(slot)` |
   | `minigame` | intro (title, tagline, instructions, control legend), results (`describeResult`: place / tied / score / reward), aborted |
   | `play` | joystick and A/B buttons following `describePlay`: an element shows only when offered in `actions` and not `nil` in `minigame.controls`; labels from `controls`. The joystick reports every drag change to `moveStick` (screen up = +y, length ≤ 1) and `(0, 0)` on release. Buttons call `press` on touch down and `release` on touch up or cancel. Multitouch: stick and button at the same time |
   | `pause` | pause screen, no inputs |
   | `final` | place, trophies, coins, minigame wins, tied, ended early |
4. **Error screen:**
   - `UiErrorCode.text`.
   - The button follows `remedy`: `.retry` → `retry()`; `.updateApp` → explain "App aktualisieren oder Browser-Controller nehmen".
   - "Anderes Spiel" → `leave()`.
5. **Haptics:**
   - On a new `state.feedback[slot]?.id`:

     | Kind | Haptic |
     |---|---|
     | `confirm`, `hit` | impact |
     | `miss` | soft impact |
     | `win` | success notification |
     | `lose` | warning notification |

     Keep the color flash.
   - Light impact on A/B press and on prompt choice.
6. **Layout:** iPhone portrait for lobby/board, landscape for play (both allowed). iPad with
   one player uses the same screens scaled. Slot color and symbol come from
   `PlayerInfo.color` and the symbols ● ▲ ■ ★ for slots 1–4 (`players.ts`), so nothing
   relies on color alone. Touch targets ≥ 44 pt; Dynamic Type for text outside the play
   layout; VoiceOver labels on all buttons.

### Acceptance

- Every `ControllerState.*Sample` has a `#Preview` and renders without layout breakage in
  iPhone portrait/landscape and iPad.
- Tapping in the fake produces the expected `FakeControllerSession.sent` entries: ready,
  pick-character, choose once per prompt, press/release pairs, move on drag and `(0,0)` on
  release.
- Builds with zero warnings under Swift 6. Screenshots of the main samples are attached to
  the report.

---

## Not in phase 2 (separate tasks)

- Shared-iPad zones (2–4 players on one iPad, ADR-008).
- Bonjour discovery (needs a server change).
- macOS CI runner for the Swift tests.
- The CI step `node scripts/export-protocol-fixtures.mjs --check`, which the coordinator adds.
- Optional: a `/health` pre-check, which already returns `protocolVersion`, to show a version
  mismatch before opening the socket.
- Distribution (signing team, TestFlight).
- The real-device test belongs in `docs/device-test-checklist.md`, written by the coordinator
  after integration. Simulators prove neither local network permission, haptics nor latency.
