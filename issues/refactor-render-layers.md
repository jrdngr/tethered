# Extract render.js into ordered draw layers

**Area:** Refactoring · **Impact:** High (enabler) · **Status:** Open

## Problem

`drawGame` (`src/render.js:5-232`) hard-codes every entity inline, discriminating by tag (`c.heal`, `p.color`, `p.explode`) in an undocumented, load-bearing z-order. Only enemies use the `def.draw` registry hook (`src/render.js:116`). Every new visual — pickups, obstacles, wrap glow, bash rings — means surgery inside one 230-line function, and the z-order is control flow rather than data.

This is the review's "do first" refactor: it makes every later visual change "one function + an index."

## Decision

Extract per-entity draw functions and drive them from an ordered layer table:

```js
const LAYERS = [drawArena, drawCoins, drawTether, drawEnemies, drawPops, drawBall, drawWeapons, drawParticles, drawHUDFloaters];
```

## Implementation

- Pure mechanical extraction — `drawCoins`, `drawParticles`, `drawPops`, `drawPaddles`, `drawBall`, etc., each `(ctx, game)`; `drawGame` becomes the translate + `for (const layer of LAYERS) layer(ctx, game)`
- Preserve the current z-order exactly (read it out of today's statement order); the layer array *documents* it
- Zero behavior change — verify by eyeball A/B before/after
- `node --check` per project convention

## Unblocks

[design-wrap-unrewarded](design-wrap-unrewarded.md) visuals · [design-juice](design-juice.md) shake/flash hooks · [design-arena-variety](design-arena-variety.md) obstacle layer · [refactor-pickup-registry](refactor-pickup-registry.md) `draw` hooks · [refactor-draw-shape](refactor-draw-shape.md)
