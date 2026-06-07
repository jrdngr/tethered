# Elasticity and mass as upgrade axes

**Area:** Physics / Feature · **Impact:** Medium · **Status:** Open

## Problem / Opportunity

The upgrade pool is all damage/speed/economy; none of the upgrades change how the ball *feels*. Two physics-native axes are cheap because the plumbing exists:

1. **Elasticity** — wall restitution is a constant; making it an upgrade synergizes directly with the combo-on-fast-wall-bounce rule (bouncier ball = combo engine)
2. **Mass** — bash is currently a binary threshold (`BASH_HP_FACTOR`); a continuous mass term turns plow-through into a spectrum

## Decision

Include both axes.

## Implementation

- **ELASTICITY upgrade:** replace the `WALL_RESTITUTION` constant read with `game.stats.wallRestitution` — the exact pattern `maxSpeed` already uses (`createStats` default = current constant; upgrade adds per level). Applies to walls and, later, [arena obstacles](design-arena-variety.md)
- **Mass:** add `game.stats.ballMass` feeding `BASH_DEFLECT_MAX` and `KILL_SPEED_KEEP` — heavier ball deflects less on non-kill hits and keeps more speed through kills, making the bash threshold feel like momentum rather than a hidden HP gate. Could be its own upgrade or a secondary stat on an existing one
- New upgrade entries in `src/upgrades.js` + TUNING constants for per-level steps

## Interactions

- Ranked below [physics-slingshot](physics-slingshot.md) and [physics-slowmo](physics-slowmo.md) by the review — this is more tuning surface than new feel; sequence it after those
- The upgrade pool is near its 55-pick ceiling design-wise; two more entries also dilute the [MOMENTUM-dominant meta](balance-momentum-outlier.md), which is a side benefit
