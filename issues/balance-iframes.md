# i-frames cap incoming DPS at one hit/second — death is nearly impossible

**Area:** Balance · **Impact:** High · **Status:** Open

## Problem

`MAX_HP 100` combined with `IFRAME_DURATION 1.0` (`src/tuning.js:30-31`) means a vulnerable touch deals damage then grants a full second of invulnerability (`src/combo.js:37-39`). No matter how many enemies pile on, the player takes at most one hit per second.

| Pressure | Damage/hit | Time-to-die |
|---|---|---|
| Pure tank | 25 | ~3–4 s (and requires standing still) |
| Mixed (chaser 10 / splitter 15 / orbiter 15) | ~12–15 | 7–10 s |

This is compounded by every other survivability lever in the game:

- Fast balls (> `SPEED_THRESHOLD 420`) bypass damage entirely (`src/enemies.js:456`)
- The optional combo-shield at ×10 (`src/combo.js:13-16`)
- `HEALTH_HEAL 20` pickup drops
- `+20` max HP per VITALITY pick

The result: being surrounded carries almost no threat, which flattens the entire difficulty curve and undercuts the spawn-pressure fixes in [balance-spawn-curve](balance-spawn-curve.md).

## Decision

Shorten i-frames; leave `MAX_HP` at 100.

- `IFRAME_DURATION: 1.0 → 0.5` as the starting point for tuning
- Keep the existing knockback on hit so being surrounded is escapable but genuinely dangerous

## Implementation

One constant in `src/tuning.js:31`. No code changes. Tune from 0.5 via the dev panel — the 0.4–0.6 band is the expected landing zone.

## Verification

With mixed pressure (~12–15 dmg/hit) at 0.5 s i-frames, time-to-die when swarmed drops from 7–10 s to ~3.5–5 s. A surrounded player who doesn't escape should die; one who flings out should survive.
