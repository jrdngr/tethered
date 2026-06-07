# The rope-wrap mechanic is invisible and unrewarded

**Area:** Design · **Impact:** High · **Status:** Open

## Problem

`updateActiveTether` (`src/tether.js:85-172`) is the most novel system in the game — the rope wraps enemies as pivots (up to `ROPE_MAX_WRAPS 6`), bending the spring and storing tension, with high-craft implementation (lagged sweep test, anti-chatter). But:

- A wrap grants **no score, no coins, no bonus** of any kind
- It renders as a thin bent line (`src/render.js:36-39`) — most players will never notice the mechanic exists
- The review's balance, design, and physics tracks all independently flagged this as the game's biggest wasted asset

## Decision

Two rewards (combo credit and a tutorial hint were considered and declined):

1. **Visual upgrade** — make wraps *read*: thicker rope when taut, tension glow scaling with stretch, highlight rings on wrap-pivot enemies. The player should feel the rope loading like a drawn bow.
2. **Score/coin bonus** — kills involving a wrapped rope pay a flat per-wrap bonus, so discovering and exploiting wraps is economically rewarded.

Note: tethered kills continue to reset combo (`src/enemies.js:342`) — wraps are paid in coins, not combo. If wrap play still feels punished after this lands, revisit that rule.

## Implementation

- **Visuals** (`src/render.js:36-39`): line width and glow alpha as functions of `tether.stretch` and `wraps.length`; small pulse ring on each wrap pivot. Lands naturally in render.js's `LAYERS` table.
- **Bonus**: in the kill path, if the dead enemy is a wrap pivot or the rope has ≥1 wrap, add `WRAP_KILL_BONUS × wraps.length` coins through the normal payout path (so `coinMult` and the [sublinear combo factor](balance-coin-economy.md) apply consistently). Floating "+N WRAP" text at the kill site so the reward is legible.
- New TUNING constants: `WRAP_KILL_BONUS`, `WRAP_GLOW_*` visual params.

## Interactions

- [physics-slingshot](physics-slingshot.md) gives wraps a mechanical payoff; this gives them a legible, economic one. Ship the visuals with whichever lands first.
