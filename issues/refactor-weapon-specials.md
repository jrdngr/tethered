# Co-locate weapon specials with their weapon definitions

**Area:** Refactoring · **Impact:** High (for the specials gap) · **Status:** Open

## Problem

The 10 level-5 specials are the least-systemized part of the codebase: each is a boolean in the flat `createStats` bag (`src/upgrades.js:21-31`), set by a `special` closure, and consumed by a hand-placed `if (game.stats.X)` in a *different* file — spread across **5 files** (ball, combo, enemies, paddles, weapons). Weapon specials specifically are a parallel per-`kind` branch list inside `updateWeaponCollisions` (`src/weapons.js:264-276`). Adding a special means touching an upgrade definition *and* remembering which distant file consumes it.

## Decision

- **Weapon specials** move into the `WEAPONS` registry as `onHit`/`afterHit` hooks that the collision loop calls generically — zero per-kind branches in `updateWeaponCollisions`
- **Non-weapon specials** (those consumed in ball/combo/enemies/paddles) keep their current mechanism for now, but each gains a `// consumed at <file>:<fn>` comment at the definition site so the coupling is at least discoverable

## Implementation

- Extend `WEAPONS` entries with optional `onHit(game, enemy, weapon)` / `afterHit(...)`; the loop at `src/weapons.js:264-276` becomes `def.onHit?.(...)`
- Move each existing per-kind branch into its weapon's entry verbatim — zero behavior change
- Group the special booleans under `stats.specials = {}` while in here (absorbed from the naming cleanup — see [refactor-naming](refactor-naming.md))

## Unblocks

New weapons with bespoke specials become single-entry additions; [design-enemy-roster](design-enemy-roster.md)'s shielded/speed-punisher exception logic can follow the same hook pattern on `ENEMY_TYPES`.
