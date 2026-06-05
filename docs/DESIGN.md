# Swangin — Design Doc

A physics-based arcade game. You don't control a character — you control a **ball on a rope**. Swing it, fling it, and smash enemies before they get to it.

This document describes the **first proof of concept (POC)**. The game will be built iteratively from here; future ideas are parked at the bottom and intentionally not designed in detail.

## Concept

A ball sits in a walled arena, viewed top-down (no gravity). Click and hold **on the ball** to tether it to your cursor with an elastic rope. Whip the cursor around to swing the ball and build speed, then release to fling it.

- The ball is **invincible while moving fast — but only when untethered**. A fast ball smashes enemies on contact.
- A slow ball, or a tethered ball at any speed, is **vulnerable**. Enemies that touch it deal damage.
- Enemies continually spawn and chase the ball. Popped enemies burst into coins; scoop them up to level and pick upgrades.

### Core loop

> grab → swing → **release** → smash → re-grab before it slows down → repeat

The tension: holding the rope is how you build speed, but the ball is never safe in your hand. Every grab is a calculated risk.

## Mechanics

### Tether (elastic spring)

- Press and hold the mouse within the **grab radius** of the ball to attach the rope. The anchor is the cursor and follows it while held.
- Rest length = distance between cursor and ball at grab time, clamped to `ROPE_MAX_REST`.
- Spring force applies **only when stretched** (a rope can't push):
  `F = -k · (dist − restLength) · dir − c · velAlongRope`
- Release the mouse to detach and fling the ball with whatever velocity it has.
- Bumping an enemy while tethered **snaps the rope**. The collision still resolves with the tethered (vulnerable) state — the snap is a consequence of the bump, not an escape into invincibility. Re-grab requires a fresh click.

### Invincibility

```
invincible = speed > SPEED_THRESHOLD && !tethered
```

- Visual cue: the ball's color tracks speed — dark blue while vulnerable, then a gradient that brightens (with a growing glow) to bright blue at `SPEED_COLOR_MAX` while invincible. Within `SPEED_FLASH_WINDOW` above the threshold, the ball flashes the vulnerable dark blue as a warning that invincibility is about to drop. The HUD also shows a speed meter relative to the threshold.
- This is the central skill check of the game — players must learn to release at speed, not drag the ball into enemies.

### Combo multiplier

- +1 combo for each **wall bounce** and each **enemy kill** — but only while the ball is above `SPEED_THRESHOLD` (no combo farming with slow dribbles).
- Combo **resets** when the ball's speed drops below the threshold or the ball takes a hit.
- Grabbing the rope does not reset the combo by itself — keeping a rally alive across re-grabs is the high-skill play.
- The combo multiplies the **number of coins** an enemy drops (there is no score).

### Coins & leveling

- A popped enemy bursts into `COINS_PER_KILL_MIN`–`COINS_PER_KILL_MAX` coins **× the combo at the moment of the kill** — big rallies rain coins. They scatter, settle quickly, and fade away after `COIN_LIFETIME` if uncollected.
- Coins are gently magnetized toward the ball within the magnet radius — its base value matches **the grab handle** (`BALL_RADIUS + GRAB_RADIUS`) and grows with upgrades. Collected on contact with the ball.
- Collecting `coinsForLevel(level)` coins (base `LEVEL_COINS_BASE`, growing `LEVEL_COINS_GROWTH`× per level) levels the player up and triggers an **upgrade pick** (see below).
- HUD: a coin-progress bar at the top center of the screen with the current level (`LV n`) beside it.
- Survival time is tracked and shown, but progression comes from coins.

### Level-up upgrades

- On level-up the game **pauses** and offers **three cards**, rolled at random (distinct) from the upgrade pool. Click one to apply it and resume. Multiple level-ups banked at once queue up back-to-back picks.
- Upgrades modify **per-run stats** (`game.stats`, seeded from `TUNING` at reset) — they stack without limit and reset on restart.

| Upgrade | Effect |
|---|---|
| Magnet range | +`UPGRADE_MAGNET_RADIUS` px coin magnet radius |
| Magnet power | +`UPGRADE_MAGNET_ACCEL` px/s² coin magnet pull |
| Vitality | +1 max HP, and heals 1 |
| Damage | +1 damage per smash |
| Top speed | +`UPGRADE_MAX_SPEED` px/s ball speed cap |

- The ball's speed is capped at `BALL_MAX_SPEED` (base) — the cap is what the top-speed upgrade raises.

### Health

- The ball starts with `MAX_HP` hit points (raisable via the vitality upgrade). A vulnerable ball touched by an enemy loses 1 HP, takes knockback, flashes, and gets `IFRAME_DURATION` of invulnerability.
- Game over at 0 HP → overlay with level reached + survival time, click to restart.

### Enemies

Enemies have HP; a smash deals the player's damage stat (base `PLAYER_DAMAGE`, raisable via upgrade).

- **Chaser** (red) — spawns at the arena edge, seeks the ball at constant speed. `ENEMY_HP` (1) HP: dies to one base-damage hit.
- **Tank** (purple, larger, slower) — `TANK_HP` (2) HP, so it takes two base-damage hits; it wears an armor ring that breaks off with the first hit. Only starts spawning after `TANK_SPAWN_DELAY` of survival, then replaces a `TANK_CHANCE` fraction of spawns. Drops `TANK_COIN_MULT`× the coins.
- Spawn interval starts at `SPAWN_INTERVAL_START` and ramps down toward `SPAWN_INTERVAL_MIN` as survival time increases.
- Invincible ball vs enemy: the enemy takes damage. If it dies — pop animation (expanding, fading ring), coin burst, combo increases. If it survives — it flashes white and takes knockback (no combo; only kills count). Either way the ball bounces off along the collision normal (same direction rule as the damage knockback) keeping most of its speed.
- Vulnerable ball vs enemy: ball takes damage (see Health), both get knocked back, combo resets, and the tether snaps if held.

## Tuning parameters

All constants live in one place in code (`Swangin.TUNING`) and are expected to be iterated heavily.

| Parameter | Initial value | Notes |
|---|---|---|
| `BALL_RADIUS` | 16 px | |
| `BALL_DRAG` | 0.4 /s | Exponential velocity decay (top-down friction) |
| `BALL_MAX_SPEED` | 1000 px/s | Base speed cap; raised by the top-speed upgrade |
| `WALL_RESTITUTION` | 0.9 | Bounce energy retention |
| `GRAB_RADIUS` | 48 px | Forgiving click target around ball |
| `ROPE_K` | 18 /s² | Spring constant |
| `ROPE_DAMPING` | 1.2 /s | Along-rope damping |
| `ROPE_MAX_REST` | 120 px | Max rest length at grab |
| `SPEED_THRESHOLD` | 420 px/s | Invincibility / combo-active speed |
| `SPEED_COLOR_MAX` | 700 px/s | Ball color/glow gradient reaches full brightness |
| `SPEED_FLASH_WINDOW` | 120 px/s | Above threshold, ball flashes a vulnerability warning |
| `MAX_HP` | 3 | Base; raised by the vitality upgrade |
| `IFRAME_DURATION` | 1.0 s | Post-hit invulnerability |
| `PLAYER_DAMAGE` | 1 | Base damage per smash; raised by upgrade |
| `ENEMY_RADIUS` | 14 px | |
| `ENEMY_SPEED` | 110 px/s | Chaser seek speed |
| `ENEMY_HP` | 1 | Chasers die to one base-damage hit |
| `HIT_FLASH_DURATION` | 0.15 s | Enemy flashes white on a non-lethal hit |
| `TANK_HP` | 2 | Two base-damage hits |
| `TANK_RADIUS` | 18 px | |
| `TANK_SPEED` | 80 px/s | Slower than chasers |
| `TANK_CHANCE` | 0.2 | Fraction of spawns that are tanks, once unlocked |
| `TANK_SPAWN_DELAY` | 15 s | Survival time before tanks start spawning |
| `TANK_COIN_MULT` | 2 | Tanks drop this × the base coin burst |
| `POP_DURATION` | 0.25 s | Enemy death pop animation length |
| `POP_SCALE` | 2.4 | Final pop ring radius, × enemy radius |
| `SPAWN_INTERVAL_START` | 2.5 s | |
| `SPAWN_INTERVAL_MIN` | 0.6 s | Reached gradually over ~2 min |
| `COIN_RADIUS` | 5 px | |
| `COINS_PER_KILL_MIN` | 6 | Base coins per popped enemy… |
| `COINS_PER_KILL_MAX` | 10 | …rolled in this range, then × combo |
| `COIN_BURST_SPEED` | 220 px/s | Max scatter speed on drop |
| `COIN_DRAG` | 3 /s | Coins settle quickly |
| `COIN_MAGNET_RADIUS` | 64 px | Base, from ball center; matches `BALL_RADIUS + GRAB_RADIUS` |
| `COIN_MAGNET_ACCEL` | 900 px/s² | Base pull at point-blank, fading to 0 at the magnet radius |
| `COIN_LIFETIME` | 30 s | Uncollected coins fade away |
| `LEVEL_COINS_BASE` | 200 | Coins to clear level 1 |
| `LEVEL_COINS_GROWTH` | 1.2 | × per level |
| `UPGRADE_MAGNET_RADIUS` | 40 px | Magnet-range upgrade, per pick |
| `UPGRADE_MAGNET_ACCEL` | 450 px/s² | Magnet-power upgrade, per pick |
| `UPGRADE_MAX_SPEED` | 150 px/s | Top-speed upgrade, per pick |

## POC scope

**In:**

- One arena (full-window canvas with walls), one ball, two enemy types (chaser, tank)
- Elastic spring tether to cursor, release-to-fling
- Invincibility rule, combo, coins + leveling, HP + i-frames
- Level-up upgrade picks (pause, choose 1 of 3)
- HUD: combo, HP pips, level + coin-progress bar, survival time, speed meter vs threshold
- Game over overlay + click-to-restart (no page reload)
- Flat-color shapes drawn on canvas (no sprites)

**Out (explicitly, for now):**

- Audio, art/sprites, particles & juice
- Bosses, waves, further enemy variety
- Menus, pause, settings, persistence/high scores
- Mobile/touch support

## Tech

- Plain HTML5 Canvas, vanilla JavaScript, hand-rolled physics. No dependencies, no bundler, no server — `index.html` opens directly via `file://`.
- Plain `<script>` tags sharing a single `Swangin` global namespace (not ES modules, so `file://` works).
- Fixed-timestep physics (120 Hz) accumulated from `requestAnimationFrame`, render every frame.

## Future ideas (parked)

One-liners only — not designed yet:

- Enemy variety: shooters, splitters, rope-cutters
- Power-ups: longer rope, multi-ball, temporary slow-mo
- Rope upgrades / alternate tether types (rigid chain, bungee)
- More level-up upgrades: rope perks (length, spring strength), combo keepers
- Juice: screen shake, particles, hit-stop, trails, audio
- Wave structure, coin bonuses for style, leaderboards
