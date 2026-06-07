# Roster has no counter to "stay fast" — speed is uncontested invincibility

**Area:** Design · **Impact:** Medium · **Status:** Open

## Problem

Of the 6 enemy types, 4 simply seek the player. Since a ball above `SPEED_THRESHOLD 420` takes no contact damage (`src/enemies.js:456`), a player who keeps speed up is untouchable, and nothing in the roster contests that — no ranged threat, no zoning, no enemy that punishes speed itself. The difficulty curve has no inflection points.

The `ENEMY_TYPES` registry (`src/enemies.js`) makes each new type roughly one entry + TUNING constants, so this is cheap to fix.

## Decision

Three new archetypes (a periodic boss was considered and declined for now):

1. **Ranged/zoning enemy** — fires slow projectiles or drops area-denial zones that ball speed alone can't dodge; forces pathing decisions while swinging
2. **Speed-punisher** — a spiky shell that's dangerous specifically *to fast balls*: fast contact costs the player (damage or a hard speed bleed), inverting the speed=safety rule locally. Must be killable some other way (slow precise hit, bash, weapon)
3. **Shielded enemy** — only vulnerable from behind or after a bash stuns it; forces angle play and makes wraps and the landed slingshot release (src/tether.js) tactically valuable

## Implementation

- One `ENEMY_TYPES` entry each, with brains following the existing orbiter/runner patterns
- Ranged enemy needs a projectile pool — keep it on the shared particle/geometry helpers in src/geom.js
- The speed-punisher's fast-contact rule hooks the same collision site that currently grants fast-ball immunity (`src/enemies.js:456`) — it's an exception branch in the type def, which `WEAPONS`-registry-style `onHit` hooks (src/weapons.js) would keep tidy
- New TUNING constants per type (HP, damage, speeds, projectile params, shield arc)
- Fold all three into the spawn-mix ramp from [balance-enemy-mix](balance-enemy-mix.md) with late-run weights

## Interactions

- This is the systemic answer to the i-frame/speed safety problem that [balance-iframes](balance-iframes.md) only partially addresses: shorter i-frames make slow play dangerous; these make *fast* play contestable.
