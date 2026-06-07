# Hardcoded knockback decay violates the everything-in-TUNING convention

**Area:** Physics / Convention · **Impact:** Low · **Status:** Open

## Problem

`const decay = Math.exp(-4 * dt)` at `src/enemies.js:434` — the `4` is a raw literal governing how long *every* shove persists (`SPLIT_FLING`, `ENEMY_BOUNCE`, `ENEMY_POP_PUSH`, `PLAYER_POP_PUSH`). It's arguably the most feel-relevant enemy-motion constant in the game, yet it's invisible to the dev panel while its direct analogues (`ORBITER_DECEL`, `BALL_DRAG`) live in TUNING.

## Decision

Add `ENEMY_KNOCKBACK_DECAY: 4` to `src/tuning.js` and reference it at `src/enemies.js:434`. Zero behavior change; the constant becomes live-tunable.

## Implementation

Two-line change. If [balance-risk-reward](balance-risk-reward.md)'s runner dash reuses the knockback-velocity plumbing, it inherits this constant — one more reason it should be tunable.
