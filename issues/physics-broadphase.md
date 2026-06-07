# Enemy separation is unconditional O(N²) at 120 Hz

**Area:** Physics / Performance · **Impact:** High · **Status:** Open

## Problem

`resolveEnemyOverlaps` runs a double loop with a `Math.hypot` per pair (`src/enemies.js:231-237`), every physics step regardless of tether state (`src/enemies.js:472`) — even during the death animation. At N=60 that's 1,770 pairs × 120 Hz ≈ **212k hypot/sec**, and N is unbounded (no spawn cap). This is the first thing that will cap frame time on long runs — especially once [balance-spawn-curve](balance-spawn-curve.md) makes crowds real.

Related per-step costs that share the same culprit (all-pairs scans over enemies):

- Wrap detection: up to ~8N segment evaluations/step while tethered (`src/tether.js:109-132`)
- `buildPath` reallocates an array 1–3×/step
- Ball and weapon collision scans iterate all enemies

## Decision

**Uniform-grid spatial hash**, shared by all consumers: enemy separation, wrap detection, and ball/weapon collision scans. One broadphase, rebuilt (or incrementally updated) once per step.

## Implementation

- New `src/grid.js` (plain script, `Tethered` namespace): cell size ≈ largest enemy diameter; `rebuild(enemies)` once per step into a flat `Map` (or array of buckets) keyed by cell; `queryCircle(x, y, r)` / `querySegment(...)` iterate only neighboring cells
- `resolveEnemyOverlaps`: only test pairs within the same/adjacent cells; also skip the pass entirely during the death animation
- Wrap detection and ball/weapon scans switch from full-list iteration to `querySegment`/`queryCircle`
- Reuse one preallocated wrap-path array in `buildPath` (mutate in place) while in there
- Keep the brute-force path behind a dev-panel toggle for A/B correctness checking during the transition

## Verification

Behavior should be identical (same pairs found) — diff kill/position traces with the toggle. Perf target: separation cost grows ~O(N) for spread-out enemies; a 200-enemy stress spawn via the dev panel should hold 120 Hz.

## Interactions

- Unblocks removing the interim `ENEMY_CAP` from [balance-spawn-curve](balance-spawn-curve.md)
- [design-arena-variety](design-arena-variety.md) obstacles should register in the same grid
