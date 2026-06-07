# Single static arena — no geometry to play against

**Area:** Design · **Impact:** Low · **Status:** Open

## Problem

Every run is the same full-window rectangle with flat background and plain walls (`src/main.js:21-24`, `src/render.js:12-27`). The rope-wrap system and wall-bounce combo rule both *want* geometry to interact with, and there is none.

The paddle code (`src/paddles.js`) already proves circle-vs-rect collision and dynamic geometry work in this codebase, so interior obstacles are within easy reach.

## Decision

Add interior obstacles: static shapes (rects/circles) that the ball bounces off and — crucially — that the **rope can wrap**, turning arena geometry into slingshot anchors and combo tools rather than mere walls.

## Implementation

- `game.obstacles = []` of simple shapes; ball collision reuses the paddle circle-vs-rect path; wall-bounce combo credit applies to obstacle bounces too
- Wrap support: obstacles join enemies as wrap-pivot candidates in `updateActiveTether` (`src/tether.js:109-132`) — for circles this is the same math; rects can wrap at corners
- Start with 1–2 hand-placed layouts cycled per run; random placement can come later
- Rendering slots in as a layer once [refactor-render-layers](refactor-render-layers.md) lands
- New TUNING constants: obstacle sizes, restitution (ties into [physics-elasticity-mass](physics-elasticity-mass.md))

## Interactions

- Multiplies the value of [physics-slingshot](physics-slingshot.md) (fixed anchors enable deliberate, repeatable slingshots) and [design-wrap-unrewarded](design-wrap-unrewarded.md) (more things to wrap)
- Obstacles must join the broadphase from [physics-broadphase](physics-broadphase.md) rather than adding bespoke scans
