# Economy is risk-inverted — runners are free money

**Area:** Balance · **Impact:** Medium · **Status:** Open

## Problem

Coin multipliers: chaser/orbiter/splitter-child 1, tank 2, **runner 3**. Runners have HP 4, the lowest contact damage (5), and *flee* — the highest-paying enemy is the safest kill in the game. Meanwhile splitter parents drop nothing (only terminal children pay), so destroying a 28-HP supersplitter tree through 20/15/15-damage parents yields just **4 chasers' worth** of coins.

Optimal play under this table: ignore the dangerous fights, farm runners and wall-bounce combo. The economy rewards exactly the opposite of what the game wants the player doing.

## Decision

**Make runners riskier; keep the 3× payout.** The 3× stays as a skill-shot bounty — the fix is that collecting it should cost something. (Splitter-parent payout and a flat coinMult nerf were considered and declined.)

Direction: give the runner a **panic dash** — when the ball closes within a threshold at speed, the runner bursts unpredictably (re-using the existing knockback-velocity plumbing), and contact during the dash stings. Chasing a runner becomes a real pursuit with a mistake cost instead of a free pickup.

## Implementation

- `src/enemies.js` RUNNER entry in `ENEMY_TYPES`: add dash trigger (ball distance + ball speed check in its brain), dash velocity burst, and a brief "dangerous" window flag during the dash
- Contact damage during the dash: either raise the runner's `damage` while dashing or apply a dedicated `RUNNER_DASH_DAMAGE`
- New TUNING constants: `RUNNER_DASH_TRIGGER_DIST`, `RUNNER_DASH_SPEED`, `RUNNER_DASH_DAMAGE`, `RUNNER_DASH_COOLDOWN`
- Telegraph it (flash/wind-up) so the sting is readable, not random — pairs with [design-juice](design-juice.md)

## Interactions

- [balance-coin-economy](balance-coin-economy.md) flattens payout magnitude; this fixes payout *direction*. Together they should kill runner-farming as the dominant strategy.
