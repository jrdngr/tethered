# Base damage 1 vs enemy HP 4–12 makes upgrades mandatory, not optional

**Area:** Balance · **Impact:** High · **Status:** Open

## Problem

`PLAYER_DAMAGE 1` (`src/tuning.js:40`); base `smashDamage` is 1 regardless of ball speed (`src/upgrades.js:40-46`). Hits-to-kill at base: chaser 4, tank/splitter 8, supersplitter 12 — and each non-killing hit bounces the ball off (`src/enemies.js:389-392`), so base play is dribbling, not smashing. A full supersplitter chain = 12 + 2×8 + 4×4 = **44 hits** of ping-pong.

Bash requires `dmg > maxHp × 1.5` (6 for a chaser, 18 for a supersplitter) — unreachable at base. The result: DAMAGE and weapons are prerequisites rather than build choices, and build diversity collapses toward them.

## Decision

`PLAYER_DAMAGE: 1 → 2`. Enemy HP table unchanged.

- Hits-to-kill becomes: chaser 2, tank/splitter 4, supersplitter 6 (full chain 22)
- Base play smashes; DAMAGE/weapons go back to being *accelerators*
- Bash threshold (6 for a chaser) stays out of reach at base — bash remains upgrade-gated, which is correct

## Implementation

One constant at `src/tuning.js:40`. No code changes.

## Interactions

- [balance-spawn-curve](balance-spawn-curve.md) adds per-minute enemy HP scaling — at +8%/min, a chaser crosses back to 3 base hits around minute 6, which is the intended pressure curve, but verify the two together.
- [balance-momentum-outlier](balance-momentum-outlier.md) rebuilds how DAMAGE/MOMENTUM stack on top of this base.
