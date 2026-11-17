# Chaos Party — Product Vision

**Version:** 2.0  
**Status:** Approved product direction; implementation details may evolve through experiments  
**Working title:** Chaos Party

## Elevator pitch

Chaos Party is a chaotic, funny, competitive 3D party board game for **2–4 people in the same room**. The game runs **on a PC only**. Each player uses their own **iPhone as a browser-based controller**, or several players share **one iPad with separate touch areas**; mixed configurations should be supported where feasible. **No physical gamepads are required.** Players control mischievous animals, eccentric toy robots and goofy cartoon characters, roll dice, navigate a reactive board, sabotage rivals, win minigames, collect coins and trophies, and laugh at unexpected reversals.

## Product pillars

1. **Couch-party chaos:** fast, readable, funny interactions and friendly competition; disruptive actions should be surprising, not relentlessly punitive.
2. **Accessible in seconds:** scan a QR code, join from a phone/tablet browser, understand controls through context-sensitive UI; avoid app installs.
3. **A real board game, not a minigame launcher:** dice-based turns, meaningful branching paths, events, coins, trophies, items, traps, stealing, attacks and limited reaction opportunities.
4. **Minigame variety:** arcade/reflex/timing, physics-driven chaos, and hybrids with tactical choices; multiplayer after each full cycle of turns.
5. **Distinctive cartoon personality:** exaggerated animation, readable silhouettes, mischievous humor, cohesive materials, lighting, sound and visual effects.
6. **Replayability without bloat:** configurable round count, variable events and item interactions; prioritize a polished vertical slice over a large feature count.
7. **Agentic-first development:** code-first, modular, automated verification and experimental autonomy bounded by product goals.

## Players, platform and controllers

- **Players:** 2–4 locally, on one PC screen; multiplayer is local, not online matchmaking.
- **Host:** a PC running the game. Browser-based desktop host is the initial delivery vehicle; native packaging may follow only if justified.
- **Apple hosts (2026-11-17):** a Mac or an Apple TV may host via a native RealityKit app, and the Apple TV must be able to host on its own without a computer (Ruben: „AppleTV muss HOST sein können“). iPhones and iPads remain controllers only. Decision: Ruben, „Ja, Apple TV als Host“ and „Nativer Host (RealityKit)“; details in ADR-019.
- **Controller option 1:** one iPhone per player, joining through a QR code and local network.
- **Controller option 2:** multiple players sharing one iPad, with distinct simultaneous multitouch zones. Define usable layouts for 2–4 players and verify on actual hardware; do not assume the browser supports every desired sensor or touch behavior.
- **Inputs:** context-dependent virtual joystick/buttons and gestures; optional motion sensors only after real-device verification. Controller clients are not game clients and do not render the game world.
- **Mixed controller arrangements:** a desirable capability, subject to M1 validation.
- **Accessibility/usability:** large touch targets, clear player colors/icons, responsive orientation layouts, reconnection handling and readable on-screen prompts.

## Core game loop

1. Players join the lobby, choose cosmetically distinct characters and set round count.
2. On their turn, a player rolls a die, moves along the interactive 3D board and resolves a space/event.
3. Players spend or acquire coins, use items, trigger traps, interfere with rivals and respond during **short, bounded reaction windows** when appropriate.
4. After all players have taken a turn, everyone participates in a multiplayer minigame.
5. Rewards and board state update; the next round begins.
6. At the configured end, the player with the **most trophies** wins. **Coins as a tiebreaker** are a proposed default to validate in playtests, not an immutable rule.

### Mechanics to implement and evaluate

- Dice movement, branching paths, interactive board spaces and events.
- Coins as spendable currency; trophies as primary victory resource.
- At least three distinct items for the first vertical slice, including sabotage or disruption.
- Limited reaction mechanic(s) that preserve pace and fairness.
- A complete turn cycle and end-of-game result screen.
- Deterministic seeded randomness in the simulation for reproducible tests.

## Minigame direction

The first vertical slice includes **three genuinely different multiplayer minigames**:

1. **Arcade:** readable reflex, timing or positioning challenge.
2. **Physics:** playful collisions, momentum or environmental chaos.
3. **Hybrid:** combines quick execution with tactical choices.

All must have understandable rules, quick onboarding, a clear win/score condition, robust 2–4-player behavior and an automated test strategy. Concrete concepts are **delegated to Claude Code for experimentation**, not pre-approved by this document.

## Art and asset direction

- Stylized, expressive **3D cartoon**; cheeky and absurd, not realistic or grim.
- Initial character set: **four** visually differentiated characters drawn from goofy figures, animals and toy robots. No character-specific gameplay advantages in the vertical slice.
- **Hybrid asset pipeline:** procedural board geometry, spaces, traps, simple props and VFX; imported, commissioned or AI-generated models/animations for more complex characters and props.
- Use glTF/GLB where practical, standardized scale, pivots, animation naming, materials, budgets and attribution.
- Maintain an explicit art-direction guide; imported assets must be visually harmonized and legally usable. No unverified asset licenses or scraped copyrighted material.
- Temporary placeholders may be used during development, but the vertical slice must feel intentionally art-directed.

## Scope: first playable vertical slice

A complete **lobby → character selection → configurable rounds → turns and board events → minigames → rewards → winner** flow with:

- One playable 3D board with branching paths and events.
- 2–4 players, phone controllers and shared-iPad controls.
- Four cosmetic characters.
- Coins, trophies, at least three items, sabotage and a bounded reaction mechanic.
- Three distinct minigames (arcade, physics, hybrid).
- Basic sound, animation, UI feedback and coherent cartoon art direction.
- Automatic verification and a reproducible playable build.

## Non-goals for the first slice

- Online matchmaking or remote multiplayer.
- Native iOS/iPadOS game application or rendering the game on mobile devices.
- Physical gamepad support.
- Large character rosters, many boards, dozens of minigames, monetization, accounts or persistent progression.
- Sophisticated motion control unless validated and shown to improve play.

## Experimental autonomy policy

Claude Code **may** invent, implement and compare minigame concepts, items, board events, pacing changes and visual approaches; it may retain the best variants when they fit this vision and pass quality gates. Experiments should state a hypothesis, measurable criteria, test approach, result and decision in an experiment log. Automated metrics are **proxies**, not proof of fun: subjective fun, usability and visual direction are judged by the human at milestone gates.

Claude Code **must request approval** before changing the host model (PC, Mac, Apple TV; ADR-019), 2–4 local players, mobile-device controller model, overall party-board-game genre, primary trophy-based win condition, core art direction or milestone scope. It must not silently expand scope or spend money on assets/services.

## Success criteria

- Four players can complete a session without developer assistance.
- Real iPhones and a shared iPad work as controllers; simultaneous touches, disconnections and rejoining are tested.
- The complete game loop is playable with understandable feedback.
- Three minigames are mechanically distinct and stable.
- No known critical failures in the release candidate; required automated gates pass.
- Human playtesters judge the game sufficiently understandable, amusing and worth replaying to approve the slice.

## Open design questions delegated to experiments

Exact board topology, dice distribution, coin economy, trophy acquisition, reaction timings, minigame rules, item balance, animation style details, round-count presets, reconnect UX and sound design. Record decisions rather than treating guesses as requirements.
