# Bare-ball collision is discrete while weapons are swept — latent tunneling

**Area:** Physics / Correctness · **Impact:** Medium (latent) · **Status:** Open

## Problem

Ball-vs-enemy body collision is a pure overlap test (`src/enemies.js:443-444`) with no sweep, while weapons already use swept segment checks (`segClosest`). Today's margin is safe: max travel = 1000 px/s ÷ 120 Hz = 8.33 px/step, well under the smallest combined shell (ball 16 + orbiter 12 = 28 px). But:

- `maxSpeed` is an upgrade: +150 × 4 levels → 1600 → 13.3 px/step
- Paddles and KILL SURGE launch the ball straight to the cap
- Any future faster cap, smaller enemy, or [slingshot impulse](physics-slingshot.md) erodes the margin further

One tuning change away from bullet-through-paper.

## Decision

Sweep the ball's prev→current segment against enemy circles, mirroring the weapons' existing approach. The previous position is already snapshotted as `tether.pbx/pby` — reuse it. O(1) per enemy; future-proofs every speed upgrade.

## Implementation

- In the ball-vs-enemy pass (`src/enemies.js:443-444`), replace the point-overlap test with closest-point-on-segment (`pbx,pby → ball.x,ball.y`) vs enemy center, threshold `ball.r + enemy.r` — same math `segClosest` already uses in `src/weapons.js`
- On hit, resolve at the impact point along the segment so bounce direction stays correct at high speed
- Extract the shared segment-distance helper as part of [refactor-shared-helpers](refactor-shared-helpers.md) rather than duplicating it a sixth time

## Verification

Dev-panel test: set `maxSpeed` to 3000 and fling through a line of orbiters — every contact should register. Behavior at normal speeds should be visually unchanged.
