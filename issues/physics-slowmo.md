# Slow-mo on bash kills via global timeScale

**Area:** Physics / Feature · **Impact:** High (fun-per-line) · **Status:** Open

## Problem / Opportunity

Bash kills are the game's power moment but pass at full speed with generic feedback. Because **every** integrator in the codebase is already `dt`-parameterized and framerate-independent (`exp(-rate·dt)` everywhere), scaling the physics timestep is physically consistent across all systems — rope, enemies, coins, particles slow together with zero per-system math changes — while rendering stays at full frame rate, which reads as cinematic rather than choppy.

## Decision

Global `timeScale` on the fixed-timestep loop, triggered on **bash kills only** (multi-kill pops and player death were considered and declined).

## Implementation

- `src/main.js` (~:155): pass `STEP × game.timeScale` to `update()` while the accumulator keeps consuming **real** time — so the number of steps per frame is unchanged, each step just simulates less
- `game.timeScale` eases back toward 1 with the standard `exp(-rate·dt)` idiom (use real dt for the recovery, not scaled dt, or it never recovers)
- Trigger: the bash-kill site sets `game.timeScale = SLOWMO_FACTOR`
- New TUNING constants: `SLOWMO_FACTOR: 0.35`, `SLOWMO_DURATION` (or a recovery rate), dev-panel tunable
- Note: combo decay and i-frame timers tick on scaled dt too — that's correct (the whole world slows), but verify nothing user-facing (e.g. the upgrade modal) runs on scaled time

## Interactions

- Implement together with [design-juice](design-juice.md) hit-stop — hit-stop is the same machinery at `timeScale 0` with a timer; build one system with both modes
- A bash during slow-mo should not re-trigger jarringly — either refresh the timer or ignore while active

## Verification

With `SLOWMO_FACTOR: 1.0` the game is bit-identical to today. At 0.35, a bash kill should produce a ~beat of slow motion with rendering still smooth.
