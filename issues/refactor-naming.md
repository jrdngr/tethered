# Naming/structure cleanup — group ad-hoc state

**Area:** Refactoring · **Impact:** Low · **Status:** Open

## Problem

Two state bags have accreted flat, mixed-purpose fields:

- The orbiter stashes brain-private state (`cx`, `cy`, `angle`, `radius`, `radiusDir`) directly on the enemy root, indistinguishable from engine-owned fields
- `createStats` (`src/upgrades.js:21-31`) mixes the **7** tunable numbers with **10** special-unlock booleans in one flat object

## Decision

- Group brain-private state under `e.brainState = {}` — each enemy brain owns its namespace; engine fields stay top-level
- Group the special booleans under `stats.specials = {}` — this piece is absorbed into [refactor-weapon-specials](refactor-weapon-specials.md) and should land there

## Non-goals (verifier-flagged)

Do **not** gate the per-enemy tether snapshot on `tether.active` — the comment at `src/tether.js:73-74` shows it's intentionally always-on to avoid stale-position bugs on a fresh grab. (Also recorded in [refactor-update-contract](refactor-update-contract.md).)

## Implementation

Mechanical rename, one brain at a time, `node --check` after each. Do it opportunistically while touching the relevant files for other issues rather than as a standalone pass.
