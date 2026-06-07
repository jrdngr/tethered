# Shared geometry and particle helpers

**Area:** Refactoring · **Impact:** Medium (enabler) · **Status:** Open

## Problem

The same primitives are re-derived across files:

- **Radial push:** `pushEnemies` (`src/enemies.js:255-265`) and `pushCoins` (`src/coins.js:63-73`) are structurally identical
- **Circle overlap:** re-derived in 5 places — `src/enemies.js:235,443,464`, `src/weapons.js:247`, `src/coins.js:180`
- **Decaying-velocity particle integration:** repeated at `src/coins.js:112-123`, `src/coins.js:216-227`, `src/enemies.js:434`

Every new collidable or effect re-derives them a sixth time.

## Decision

Add three helpers to the `Tethered` namespace (new `src/geom.js`, or fold into an existing leaf script):

- `S.geom.circleOverlap(x1, y1, r1, x2, y2, r2)`
- `S.geom.radialPush(list, x, y, radius, strength)` — replaces both push functions
- `S.advanceParticles(list, dt, dragRate)` — the shared decaying-velocity integrate loop (using the standard `exp(-rate·dt)` idiom)

Plus, from [physics-swept-ball](physics-swept-ball.md): hoist the existing `segClosest` segment-distance math here rather than duplicating it.

## Implementation

Mechanical: extract, swap call sites one file at a time, `node --check` after each. Zero behavior change — keep argument conventions identical to the strictest current caller.

## Unblocks

[design-enemy-roster](design-enemy-roster.md) projectiles · [design-arena-variety](design-arena-variety.md) obstacle collision · [physics-swept-ball](physics-swept-ball.md) · [refactor-pickup-registry](refactor-pickup-registry.md)
