# Document the update-ordering contract in main.js

**Area:** Refactoring / Documentation · **Impact:** Medium · **Status:** Done

## Problem

`update()` (`src/main.js:118-136`) depends on ordering invariants that are stated only in scattered callee comments, if at all:

1. **Tether snapshot first** — brackets all movers so wrap sweep tests see consistent prev/cur positions (intentionally always-on, even untethered — see `src/tether.js:73-74`)
2. **Weapon pass before body collisions** — kills must be flagged before the ball's body-contact logic runs
3. **Corpse sweep last** within `updateEnemies`
4. **Coins after enemies** — pickups spawned by deaths are processed the same step

Violating any of these produces subtle, hard-to-bisect bugs (stale positions, double-hits, one-step-late pickups). Nothing currently stops a reordering during a refactor.

## Decision

A single header comment block above `update()` stating the contract: the required order, *why* each constraint exists, and a pointer to the per-step phase structure. No code change.

## Implementation

One comment block. Write it while [refactor-render-layers](refactor-render-layers.md) / [refactor-shared-helpers](refactor-shared-helpers.md) are in flight, since those are exactly the refactors most likely to disturb the ordering. The new draw-layer table should get a matching one-liner pointing here.
