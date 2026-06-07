# Late-game enemy mix is permanently 70% chasers

**Area:** Balance · **Impact:** Low · **Status:** Open

## Problem

Special spawn chances are static and sum to 0.30 — TANK .04 / SPLITTER .06 / SUPERSPLITTER .02 / ORBITER .08 / RUNNER .10 — with the remaining 70% always chasers (`src/enemies.js:151-154`). The toughest enemies are the rarest forever: a supersplitter appears roughly once per 50 spawns (~one per 150 s at early rates). The composition at minute 20 is identical to minute 1.

## Decision

Ramp special chances with survival time so the mix hardens as the run progresses. Chaser share should fall from ~70% early toward ~30% by the 10-minute mark.

## Implementation

- In the spawn-type roll (`src/enemies.js:151-154`), scale each special chance by a time factor, e.g. `chance × (1 + t / MIX_RAMP_TIME)`, clamped so the specials' total stays ≤ ~0.7
- New TUNING constants: `MIX_RAMP_TIME` (suggest 300 s to double), `MIX_SPECIAL_TOTAL_MAX: 0.7`
- Keep relative proportions between specials intact (supersplitter stays the rarest special) unless playtesting says otherwise

## Interactions

- Multiplies with [balance-spawn-curve](balance-spawn-curve.md): more enemies *and* a harder mix. Tune the two ramps together — if both feel like too much, slow this one first since count pressure is the more fundamental fix.
