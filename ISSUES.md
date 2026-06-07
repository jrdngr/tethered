# Tethered — Issues

Tracked issues from the [PoC deep review](docs/reports/POC_REVIEW.md) (2026-06-07), triaged with decisions baked in. Each file records the problem, evidence, the decided fix, and an implementation sketch.

## Balance

| Issue | Impact | Decision |
|---|---|---|
| [i-frames make death nearly impossible](issues/balance-iframes.md) | High | `IFRAME_DURATION 1.0 → 0.5` |
| [Spawn curve too slow; no scaling](issues/balance-spawn-curve.md) | High | `SPAWN_DOUBLE_TIME → 90` + floor + per-minute stat scaling + interim cap |
| [Combo coin economy runaway](issues/balance-coin-economy.md) | High | Sublinear payout (×√combo) |
| [Base damage 1 makes upgrades mandatory](issues/balance-base-damage.md) | High | `PLAYER_DAMAGE 1 → 2` |
| [MOMENTUM multiplicative outlier](issues/balance-momentum-outlier.md) | Medium | Make MOMENTUM additive (+4 cap) |
| [Risk-inverted economy (runner farming)](issues/balance-risk-reward.md) | Medium | Runners get a panic dash that stings; 3× payout stays |
| [Enemy mix permanently 70% chasers](issues/balance-enemy-mix.md) | Low | Ramp special spawn chances with survival time |

## Design

| Issue | Impact | Decision |
|---|---|---|
| [Rope wrap invisible and unrewarded](issues/design-wrap-unrewarded.md) | High | Tension/wrap visuals + per-wrap kill coin bonus |
| [Missing juice: shake, hit-stop, audio, bash feedback](issues/design-juice.md) | High | All four |
| [Grab hard-resets combo](issues/design-grab-combo-reset.md) | Medium | Grabs no longer reset combo; decay keeps ticking |
| [No counter to "stay fast"](issues/design-enemy-roster.md) | Medium | Ranged/zoning + speed-punisher + shielded enemies |
| [Single static arena](issues/design-arena-variety.md) | Low | Interior obstacles the rope can wrap |

## Engine

| Issue | Impact | Decision |
|---|---|---|
| [Post-PoC engine choice](issues/engine-migration.md) | Strategic | TypeScript + Vite, in-place incremental migration; Bevy demoted |

## Consciously excluded

Reviewed and decided **not** to track (from the same report):

- **Pop-explosion nerf (Balance E)** — the `POP_EXPLODE_DAMAGE 4→2` nerf stands as-is
- **Score system** — coins/levels remain the scoreboard for now
- **Meta-progression / upgrade-pool exhaustion** — too early for persistence
