# Claude Code — Operating Instructions for Chaos Party

Read `VISION.md`, `ARCHITECTURE.md` and `ROADMAP.md` before making product or architectural changes. The files together are the project's source of truth. **Do not reinterpret iPads as game hosts: the game runs on the PC; iPhones/iPads are controllers only.**

## Mission and authority

Build Chaos Party with **highly autonomous, experimental, code-first development**. Plan, implement, test, inspect, correct, integrate and document without seeking approval for routine implementation decisions. Work in **vertical increments** and stop for **human product acceptance at M1, M2, M3 and M4**. Do not claim human approval unless explicitly received.

### Decisions you may make independently

- Architecture details consistent with `ARCHITECTURE.md` and established ADRs.
- Feature decomposition, sequencing within a milestone, test design, refactoring and bug fixes.
- Original minigame, item, board-event and art experiments within the product vision.
- Selection of open-source dependencies and properly licensed free assets after security/license review.
- Replacement of unsuccessful prototypes when supported by evidence.

### Escalate or obtain explicit approval for

- Changes to product pillars, PC-only game hosting, 2–4-player local multiplayer, phone/shared-iPad controls or trophy-focused victory.
- Significant scope increase, paid services/assets, irreversible operations, credential access, external publication or deployment outside the local development environment.
- A milestone's human acceptance; unresolvable blockers; legal/licensing ambiguity; repeated failed fixes.
- Major architectural pivots (e.g., replacing Babylon.js) after a documented spike.

## Development cycle

1. **Orient:** inspect repository and documents; identify current milestone, blockers and last validated state.
2. **Plan:** create a short task plan with explicit acceptance criteria and dependencies. Prefer the smallest complete vertical feature.
3. **Implement:** work code-first, preserve clear module boundaries, use small reviewable changes.
4. **Verify:** run relevant checks and tests; inspect runtime behavior and visual output when applicable.
5. **Repair:** diagnose failures, fix root causes, rerun checks; do not disable tests to get green.
6. **Record:** update decision log, experiment log, progress and remaining risks.
7. **Continue:** advance autonomously until milestone acceptance is required or a blocker demands intervention.

## Agent delegation and concurrency

Parallelize **independent, well-bounded** work only (e.g., controller UI, game rules, asset pipeline, test harness). Give each subagent ownership of files/interfaces and acceptance criteria. Avoid simultaneous edits to the same files. Use isolated branches/worktrees where available; integrate through a designated coordinator. Keep shared contracts stable, run integration tests after merging, and avoid creating agents merely to maximize agent count.

## Quality gates (mandatory when relevant)

- `pnpm install --frozen-lockfile` or documented equivalent succeeds in CI.
- TypeScript strict typecheck, lint, formatting verification and production build succeed.
- Unit tests cover pure game rules, state transitions, scoring, dice and item effects.
- Deterministic integration tests cover full turns and minigame transitions with seeded randomness.
- Playwright E2E covers lobby, join, controller input, round flow and winner screen; include screenshot/visual checks for changed UI/3D scenes.
- Controller protocol validation, malformed input, reconnect behavior and multiple simultaneous player inputs are tested.
- No critical runtime exceptions, broken assets or unhandled state transitions.
- Security and license checks for dependencies/assets; no secrets in repository.
- Relevant documentation and acceptance criteria are updated.

**Reality check:** browser automation and emulators cannot prove real iOS multitouch, local-network discovery, sensors or input latency. M1 must include a human-performed real-device test checklist and evidence; do not fabricate hardware validation.

## Definition of Done

A task is done only if its user-visible behavior is implemented, tests and builds pass, regressions are checked, documentation is updated, and known limitations are recorded. A **milestone** is complete only when automated gates pass **and** the human explicitly accepts the experience. A green test suite does not prove a game is fun.

## Experiment protocol

For meaningful gameplay experiments, add an entry to `docs/experiments.md` (create if absent):

- Hypothesis and intended player experience.
- Variants/prototypes and expected tradeoffs.
- Objective indicators (e.g., round duration, clarity, disconnect rate, collision stability, input delay) and subjective playtest questions.
- Test environment, seed, results, screenshots/video references where possible.
- Decision: keep, iterate or discard, with rationale.

You may choose the winning variant **within the approved vision**. Do not mistake automated simulation for a human fun test.

## Failure and blocker policy

Try a bounded series of materially different fixes (default maximum **three** serious attempts per root cause), then summarize evidence, options and the smallest question needed from the human. Do not loop indefinitely, mask failures, weaken acceptance criteria or silently drop scope. Maintain a `docs/blockers.md` if needed.

## Working artifacts

Maintain:
- `docs/decisions/` for architecture decision records (ADRs).
- `docs/experiments.md` for gameplay and art experiments.
- `docs/progress.md` for milestone status, validated commands and next steps.
- `docs/device-test-checklist.md` for actual iPhone/iPad verification.

## First assignment

Start **M1** from `ROADMAP.md`. Scaffold the smallest maintainable pnpm TypeScript monorepo. Prove the controller-to-PC path, a basic Babylon.js/Havok scene, and a two-player shared-iPad multitouch UI. Provide executable tests, QR joining instructions, real-device test checklist and a concise M1 acceptance report. **Do not start M2 until M1 is explicitly approved by the human.**
