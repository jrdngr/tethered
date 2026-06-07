# MOMENTUM is a multiplicative outlier — DAMAGE+MOMENTUM dominates every build

**Area:** Balance · **Impact:** Medium · **Status:** Open

## Problem

MOMENTUM's `speedDamage` scales 1→3 (×0.5/lvl) and **multiplies** `smashDamage`. Maxed DAMAGE × MOMENTUM at top speed = 5 × 3 = **15** damage, dwarfing the additive weapons (each capped at +4). Its `bashEasy` special also drops the supersplitter bash threshold from 18 to 12, so the maxed combo plows through everything in the game. Multiplicative scaling on top of additive alternatives means there's one correct build.

Verifier notes from the review: KILL SURGE is *not* a dead pick (its clamp is at `maxSpeed 1000`, not `SPEED_THRESHOLD 420`, so maxed +560/pop pays off across the whole 420→1000 band); the genuinely weak standalone pick is TOP SPEED, which mostly exists to enable MOMENTUM/KILL SURGE.

## Decision

**Make MOMENTUM additive.** `speedDamage` becomes a flat bonus that scales with ball speed and MOMENTUM level, added to `smashDamage` instead of multiplying it.

- Suggested shape: `damage = smashDamage + speedFrac × momentumBonus`, where `speedFrac = clamp(speed / maxSpeed, 0, 1)` and `momentumBonus` caps at **+4** at level 5 — directly comparable to a maxed weapon
- Maxed DAMAGE+MOMENTUM ceiling drops from 15 to 9; weapons become competitive picks
- Revisit `bashEasy` after the change — with a 9 ceiling it may be fine as-is

## Implementation

`src/upgrades.js:40-46` (the `smashDamage`/`speedDamage` computation) plus the MOMENTUM entry's per-level values. New TUNING constant for the per-level bonus step (e.g. `MOMENTUM_BONUS_PER_LEVEL: 0.8`).

## Interactions

- Assumes [balance-base-damage](balance-base-damage.md) (`PLAYER_DAMAGE 2`) lands first — the +4 cap is calibrated against base 2.
- Lower damage ceilings make bash rarer; if bash never happens in practice, tune `BASH_HP_FACTOR` rather than re-buffing MOMENTUM.
