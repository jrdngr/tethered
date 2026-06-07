# Tethered — Issues

Tracked issues from the [PoC deep review](docs/reports/POC_REVIEW.md) (2026-06-07), triaged with decisions baked in. Each file records the problem, evidence, the decided fix, and an implementation sketch.

## Engine

| Issue | Impact | Decision |
|---|---|---|
| [Post-PoC engine choice](issues/engine-migration.md) | Strategic | TypeScript + Vite, in-place incremental migration; Bevy demoted |

## Consciously excluded

Reviewed and decided **not** to track (from the same report):

- **Pop-explosion nerf (Balance E)** — the `POP_EXPLODE_DAMAGE 4→2` nerf stands as-is
- **Score system** — coins/levels remain the scoreboard for now
- **Meta-progression / upgrade-pool exhaustion** — too early for persistence
