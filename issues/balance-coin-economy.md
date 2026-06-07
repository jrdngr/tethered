# Combo coin economy is a runaway — one 10-kill streak buys 8 levels

**Area:** Balance · **Impact:** High · **Status:** Open

## Problem

Coins/kill = avg 8 × combo × coinMult (`src/coins.js:30-32`). Combo bumps +1 on every untethered kill and fast wall-bounce, never caps, and decays only after 10 s idle. Payout fires *before* the combo bump, so k untethered kills pay avg 8 × k(k+1)/2 = **4k(k+1)** coins. A 10-streak = **440 coins**.

| Levels | Cost (`25 × 1.2^(n-1)`) | Cumulative |
|---|---|---|
| L1–8 | 25/30/36/43/52/62/75/90 | **413** |
| L9 | 107 | 520 |

440 ≥ 413 → exactly 8 level-ups in one burst, drained by the `while` loop at `src/coins.js:197-200`. The root mismatch: payout is **quadratic** in streak length while level cost grows at only 1.2×.

## Decision

**Sublinear payout:** coins scale with √combo instead of combo. Streaks always matter but never explode. Combo itself stays uncapped (it still drives the ×10 shield gate and future score hooks), and `LEVEL_COINS_GROWTH` stays 1.2.

The same 10-streak under √combo: Σ 8√k for k=1..10 ≈ **180 coins** → ~4 level-ups (cumulative L1–4 = 134). Streaks still feel great; they no longer skip the midgame.

## Implementation

In `src/coins.js:30-32`, change the payout factor from `combo` to `Math.sqrt(combo)` (keep `coinMult` as-is). Consider a `COMBO_PAYOUT_EXPONENT: 0.5` TUNING constant instead of a hardcoded sqrt so the curve stays tunable from the dev panel (1.0 = current behavior).

## Interactions

- [balance-risk-reward](balance-risk-reward.md) changes *which* kills pay; this changes *how much* — tune together.
- Slower income means upgrade pacing shifts; watch it alongside [balance-base-damage](balance-base-damage.md), which makes base play less upgrade-dependent.
