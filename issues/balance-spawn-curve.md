# Spawn curve is too slow — mid/late difficulty never materializes

**Area:** Balance · **Impact:** High · **Status:** Open

## Problem

`interval = SPAWN_INTERVAL_START 5.0 × 2^(-time/SPAWN_DOUBLE_TIME 600)` (`src/enemies.js:408`; `src/tuning.js:128-129`):

| t | interval | rate |
|---|---|---|
| 0 | 5.00 s | 0.20/s |
| 60 s | 4.67 s | 0.21/s |
| 300 s | 3.54 s | 0.28/s |
| 600 s | 2.50 s | 0.40/s |
| 1200 s | 1.25 s | 0.80/s |

One enemy per second doesn't arrive until **~23 minutes**. Meanwhile removal rate vastly exceeds spawn rate — a fast ball keeps 95% of its speed per smash (`KILL_SPEED_KEEP`) — so the arena is never crowded. There is no concurrent-enemy cap or floor anywhere, and enemy HP/speed/damage **never scale with time**; difficulty is count-only, and count barely grows.

## Decision

All four levers:

1. **Faster ramp:** `SPAWN_DOUBLE_TIME: 600 → 90`. One enemy/sec arrives at ~3.5 min (t = 90 × log₂5 ≈ 209 s) instead of ~23 min.
2. **Concurrent-enemy floor:** clearing the board triggers an immediate refill so there's never dead air. Floor can itself grow with time (e.g. `2 + minutes`).
3. **Per-minute stat scaling:** multiply enemy HP/speed by ~+8%/min so late game is *harder* enemies, not just more of them.
4. **Concurrent-enemy cap:** an upper bound on live enemies as a frame-time safety net. Excess spawns queue. (The broadphase has landed in src/grid.js, so the cap can be generous.)

## Implementation

- `src/tuning.js`: `SPAWN_DOUBLE_TIME: 90`, plus new `SPAWN_FLOOR_BASE`, `SPAWN_FLOOR_PER_MIN`, `ENEMY_SCALE_HP_PER_MIN: 0.08`, `ENEMY_SCALE_SPEED_PER_MIN: 0.08`, `ENEMY_CAP`.
- `src/enemies.js` spawn logic (`~:408`): after the interval check, add `if (liveCount < floor(t)) spawnEnemy()`; skip spawns while `liveCount >= ENEMY_CAP`.
- Apply the per-minute multipliers at spawn time (bake into the enemy's `hp`/`speed` so existing logic is untouched).

## Interactions

- Stat scaling changes hits-to-kill over time — tune alongside [balance-base-damage](balance-base-damage.md).
- The broadphase (`S.grid`, src/grid.js) already keeps separation ~O(N), so the cap guards render/AI cost, not collision — verify whether it's still needed with a dev-panel stress spawn.
- A denser arena makes the static 70%-chaser mix more visible — see [balance-enemy-mix](balance-enemy-mix.md).
