# Wrapped-release slingshot — turn stored rope tension into launch tech

**Area:** Physics / Feature · **Impact:** High (fun-per-effort) · **Status:** Open

## Problem / Opportunity

The tether already models stretch and wraps enemies as pivots, storing real tension — but releasing gives nothing back. The review's top fun-per-effort feature: convert stored stretch into a launch impulse on release, making the rope read like a drawn bow and giving the wrap system ([design-wrap-unrewarded](design-wrap-unrewarded.md)) a mechanical payoff.

## Decision

**Impulse on any stretched release; wraps multiply it.** In `releaseTether`, if `stretch > 0`, add an impulse along the ball→pivot unit vector proportional to stretch, scaled up per wrap:

```
impulse = SLINGSHOT_IMPULSE_K × stretch × (1 + wraps.length × SLINGSHOT_WRAP_BONUS)
```

- Applies to every stretched release, so the basic fling gets deeper too — broadest skill expression
- Use impulse ∝ stretch, **not** the spring-energy form — the codebase never computes spring PE, and linear-in-stretch is more predictable to learn
- The wrapped enemy then pops via the existing fast-ball smash path on the next step — no new kill logic

## Implementation

- `releaseTether` in `src/tether.js`: read current `stretch` and `wraps.length`, add the impulse to ball velocity, clear the tether as today. The existing `maxSpeed` clamp (`src/ball.js:53-60`) runs the same step, so no tunneling risk — but this is exactly why [physics-swept-ball](physics-swept-ball.md) should land first or alongside
- New TUNING constants: `SLINGSHOT_IMPULSE_K`, `SLINGSHOT_WRAP_BONUS` — both dev-panel tunable from day one
- Juice the release (snap SFX, brief rope-flash) once [design-juice](design-juice.md) machinery exists

## Verification

Pull-and-release with no wrap should feel like a stronger fling; a 2-wrap release should visibly outclass it. With `SLINGSHOT_IMPULSE_K: 0` the game must behave exactly as today.
