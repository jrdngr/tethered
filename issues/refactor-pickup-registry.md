# PICKUP_TYPES registry — stop tag-discriminating pickups

**Area:** Refactoring · **Impact:** Medium · **Status:** Open

## Problem

`coins` is a heterogeneous list where heal pickups are distinguished by a `c.heal` tag, checked at **5 sites**: spawn, merge eligibility, grace period, scoop handling, and render. Adding a third pickup type (magnet, shield charge, slow-mo token…) means hunting all five rather than adding one entry.

The codebase already has the right pattern twice — `ENEMY_TYPES` and `WEAPONS` registries.

## Decision

Mirror those: a `PICKUP_TYPES` registry where each entry declares

```js
{ radius, grace, mergeable, onScoop(game), draw(ctx, p) }
```

Coins keep their special merge/value behavior as the `coin` entry; heal collapses to one entry. A new pickup becomes one table row.

## Implementation

- Add the registry in `src/coins.js` (or a new `src/pickups.js` script tag)
- Replace each `c.heal` branch with a `def = PICKUP_TYPES[c.type]` dispatch
- `draw` hooks slot into the `drawCoins` layer from [refactor-render-layers](refactor-render-layers.md); collision via [refactor-shared-helpers](refactor-shared-helpers.md)
- Zero behavior change for the two existing types

## Sequencing

After [refactor-render-layers](refactor-render-layers.md) and [refactor-shared-helpers](refactor-shared-helpers.md) — both make this extraction smaller.
