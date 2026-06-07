# Shared drawShape — weapon/enemy shapes are drawn twice with drifting constants

**Area:** Refactoring · **Impact:** Medium · **Status:** Done

## Problem

Every weapon shape is drawn in two places — gameplay (`src/weapons.js`) and upgrade-card icon (`src/upgrades.js`) — with constants hand-copied between them. Drift already exists:

- `35` hardcoded at `src/upgrades.js:272` vs `WEAPON_EARS_SPAN / 2`
- `Math.PI / 4` at `src/upgrades.js:294` vs `WEAPON_HORN_ANGLE`

Likewise, `devpanel.js`'s `drawMiniEnemy` re-derives `render.js`'s enemy drawing. Any shape tweak now silently desyncs its icon.

## Decision

Each `WEAPONS` / `ENEMY_TYPES` entry exposes one resolution-independent `drawShape(ctx, scale)`:

- Gameplay passes radius × level scale
- Upgrade icons pass glyph scale
- Dev panel minis pass thumbnail scale

One definition, three consumers, no copied constants.

## Implementation

- Move each shape's path code into its registry entry, parameterized purely by `scale` (and reading its own TUNING constants directly)
- Replace the three call sites with `def.drawShape(ctx, scale)` wrapped in the caller's own translate/rotate/fill setup
- Fix the two drifted constants as part of the move (use the TUNING values — that's a deliberate, tiny behavior change to the icons)

## Sequencing

Easier after [refactor-render-layers](refactor-render-layers.md); natural companion to [refactor-weapon-specials](refactor-weapon-specials.md) since both enrich the same registry entries.
