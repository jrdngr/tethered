# Grabbing the ball hard-resets combo — steering fights scoring

**Area:** Design · **Impact:** Medium · **Status:** Open

## Problem

`tryGrab` resets combo to 1 on *every* grab (`src/tether.js:22-24`). The core loop is grab→fling→regrab, so the act of steering directly destroys the score multiplier. The huge grab reach (`GRAB_RADIUS 176` → 192 px total) makes accidental grabs easy, and nothing in the HUD explains why the combo died — the punishment is both constant and illegible.

## Decision

**Grabs no longer reset combo; the decay timer keeps running while tethered.**

- Remove the hard reset in `tryGrab` — grabbing is neutral, not punished
- Do *not* pause the 10 s decay while tethered: holding the ball is still time pressure, so the incentive to fling quickly survives
- Tethered *kills* still reset combo (`src/enemies.js:342`) — that rule is unchanged here (see [design-wrap-unrewarded](design-wrap-unrewarded.md) for how wrap play gets compensated)

## Implementation

Delete the combo reset at `src/tether.js:22-24`. No new constants. Verify the decay timer genuinely keeps ticking during a hold (it should — the reset was the only grab-specific combo interaction).

## Verification

Grab mid-streak, hold ~3 s, fling and kill: combo should continue the streak. Hold past 10 s: combo should decay exactly as it would untethered.
