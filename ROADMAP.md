# Chaos Party — Vertical Delivery Roadmap

**Strategy:** Four integrated milestones with automatic quality gates and explicit human product acceptance. Work autonomously **within** each milestone. Do not proceed to the next milestone before approval.

## Universal gates

For each milestone, deliver: runnable build and setup instructions; passing relevant typecheck/lint/build/unit/integration/E2E tests; screenshot or video evidence where useful; reproducible seeds; current risks and known issues; updated docs and experiment/decision logs; a short acceptance report. Critical defects block acceptance. Hardware-only requirements must be checked on actual devices, not inferred from Playwright.

## M1 — Technical throughline

**Goal:** prove that the PC game and mobile browser controllers work together on real hardware.

### Deliverables

- Minimal pnpm TypeScript workspace with host, controller, local server and shared protocol.
- Babylon.js 3D scene with a controllable object and basic Havok interaction.
- QR-code join URL that works over the LAN; player identity/slot assignment.
- Two separate iPhones connected concurrently, controlling distinct on-screen objects.
- Shared iPad controller with at least two simultaneous independent touch zones; design path to four zones.
- Basic reconnection and disconnect feedback; contextual control layout.
- Playwright smoke tests, protocol tests and real-device checklist.

### Human acceptance

Demonstrate on **actual** iPhones and iPad: join, simultaneous inputs, legible controls, stable connection and tolerable responsiveness. Record unsupported browser/device combinations. Human explicitly approves M1 before M2.

## M2 — Playable board

**Goal:** a complete playable board-turn cycle, even with provisional graphics.

### Deliverables

- One 3D board with branches and distinct event spaces.
- Dice roll, turn order, path choice and movement.
- Coins, trophy acquisition and basic economy.
- At least three items, including disruptive effects, plus bounded reaction window.
- Board state and scoring authoritative on PC; complete turn-cycle integration tests.
- First gameplay experiments: board pacing, coin rewards, item frequency and reaction duration.

### Human acceptance

2–4 people can complete repeated turns without confusion; sabotage is entertaining rather than oppressive; reactions do not stall the session. Approve or request iteration.

## M3 — Party identity and minigames

**Goal:** three differentiated minigames and a recognizable visual personality.

### Deliverables

- Three multiplayer minigames: arcade, physics and hybrid.
- Four visually distinct, cosmetic-only cartoon characters.
- Hybrid asset pipeline and asset license/attribution manifest.
- Consistent basic animation, sound, VFX, minigame instructions and results.
- Experiment records comparing minigame concepts and documenting selected variants.
- Automated lifecycle, scoring and scene-cleanup tests; visual checks.

### Human acceptance

Players understand each minigame quickly, can distinguish outcomes, and experience fun, fair chaos. Character/style cohesion meets product direction. Approve or iterate.

## M4 — Full vertical slice

**Goal:** a polished, fully playable end-to-end local party session.

### Deliverables

- Lobby, joining, character selection, configurable rounds, start/pause/end flow.
- Board turns, events, minigames, rewards, trophy tally and winner screen.
- Complete 2–4-player controller support, including shared-iPad mode and reconnect handling.
- Performance pass, gameplay balance pass, cohesive UI/audio/visual presentation.
- Automated end-to-end test of full game lifecycle and documented device validation.
- Reproducible launch/build procedure and final known-issues list.

### Human acceptance

A small group completes an entire game without developer intervention; core controls are comfortable, rules understandable, and experience worth replaying. Explicit human sign-off closes the vertical slice.

## First autonomous execution sequence

1. Read the four project documents and list assumptions that need validation.
2. Scaffold monorepo, typecheck/lint/test/build pipelines and local start commands.
3. Implement typed WebSocket join/input protocol and minimal PC-host rendering.
4. Add individual iPhone controller UI and shared-iPad multitouch zones.
5. Add basic Babylon/Havok physics scene, QR join and reconnect behavior.
6. Run automated tests; prepare real-device validation checklist and concise M1 demo instructions.
7. Stop at the **M1 human acceptance gate**. Do not claim device tests were performed without real evidence.

## Prioritization and scope control

Prefer a working vertical path to parallel half-finished subsystems. Any feature not required for current milestone or its immediate testability goes into a deferred backlog. Experimental features may be discarded without treating them as failures. Do not silently add online multiplayer, native mobile apps, paid dependencies or extra content.

## Human acceptance template

```text
Milestone:
Build / commit:
Automated gates (pass/fail):
Real-device checks (performed / not performed):
What can be played now:
Experiments and decisions:
Known defects / limitations:
Questions for product owner:
Decision: APPROVED / CHANGES REQUESTED / BLOCKED
```

## Definition of Done vs. milestone approval

A feature can be technically done when its tests and documentation pass. A milestone is **not accepted** until the human has tested or reviewed the playable result and explicitly approved it. Green CI alone is insufficient.
