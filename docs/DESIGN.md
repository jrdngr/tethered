# Swangin — Design Doc

A physics-based arcade game. You don't control a character — you control a **ball on a rope**. Swing it, fling it, and smash enemies before they get to it.

This document describes the **first proof of concept (POC)**. The game will be built iteratively from here; future ideas are parked at the bottom and intentionally not designed in detail.

## Concept

A ball sits in a walled arena, viewed top-down (no gravity). Click and hold **on the ball** to tether it to your cursor with an elastic rope. Whip the cursor around to swing the ball and build speed, then release to fling it.

- The ball is **invincible while moving fast — but only when untethered**. A fast ball smashes enemies on contact.
- A slow ball, or a tethered ball at any speed, is **vulnerable**. Enemies that touch it deal damage.
- Enemies continually spawn and chase the ball. Survive as long as possible and rack up score.

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

### Scoring

- Enemy kill: `ENEMY_BASE_POINTS × current combo`.
- Survival time is tracked and shown, but score comes from kills.

### Health

- The ball has `MAX_HP` hit points. A vulnerable ball touched by an enemy loses 1 HP, takes knockback, flashes, and gets `IFRAME_DURATION` of invulnerability.
- Game over at 0 HP → overlay with final score + survival time, click to restart.

### Enemies (POC: one type)

- **Chaser** — spawns at the arena edge, seeks the ball at constant speed.
- Spawn interval starts at `SPAWN_INTERVAL_START` and ramps down toward `SPAWN_INTERVAL_MIN` as survival time increases.
- Invincible ball vs enemy: enemy dies with a pop animation (expanding, fading ring), ball bounces off along the collision normal (same direction rule as the damage knockback) keeping most of its speed, score + combo increase.
- Vulnerable ball vs enemy: ball takes damage (see Health), both get knocked back, combo resets, and the tether snaps if held.

## Tuning parameters

All constants live in one place in code (`Swangin.TUNING`) and are expected to be iterated heavily.

| Parameter | Initial value | Notes |
|---|---|---|
| `BALL_RADIUS` | 16 px | |
| `BALL_DRAG` | 0.4 /s | Exponential velocity decay (top-down friction) |
| `WALL_RESTITUTION` | 0.9 | Bounce energy retention |
| `GRAB_RADIUS` | 48 px | Forgiving click target around ball |
| `ROPE_K` | 18 /s² | Spring constant |
| `ROPE_DAMPING` | 1.2 /s | Along-rope damping |
| `ROPE_MAX_REST` | 120 px | Max rest length at grab |
| `SPEED_THRESHOLD` | 420 px/s | Invincibility / combo-active speed |
| `SPEED_COLOR_MAX` | 700 px/s | Ball color/glow gradient reaches full brightness |
| `SPEED_FLASH_WINDOW` | 120 px/s | Above threshold, ball flashes a vulnerability warning |
| `MAX_HP` | 3 | |
| `IFRAME_DURATION` | 1.0 s | Post-hit invulnerability |
| `ENEMY_RADIUS` | 14 px | |
| `ENEMY_SPEED` | 110 px/s | Chaser seek speed |
| `ENEMY_BASE_POINTS` | 100 | × combo on kill |
| `POP_DURATION` | 0.25 s | Enemy death pop animation length |
| `POP_SCALE` | 2.4 | Final pop ring radius, × enemy radius |
| `SPAWN_INTERVAL_START` | 2.5 s | |
| `SPAWN_INTERVAL_MIN` | 0.6 s | Reached gradually over ~2 min |

## POC scope

**In:**

- One arena (full-window canvas with walls), one ball, one enemy type
- Elastic spring tether to cursor, release-to-fling
- Invincibility rule, combo, scoring, HP + i-frames
- HUD: score, combo, HP pips, survival time, speed meter vs threshold
- Game over overlay + click-to-restart (no page reload)
- Flat-color shapes drawn on canvas (no sprites)

**Out (explicitly, for now):**

- Audio, art/sprites, particles & juice
- Multiple enemy types, bosses, waves
- Menus, pause, settings, persistence/high scores
- Mobile/touch support

## Tech

- Plain HTML5 Canvas, vanilla JavaScript, hand-rolled physics. No dependencies, no bundler, no server — `index.html` opens directly via `file://`.
- Plain `<script>` tags sharing a single `Swangin` global namespace (not ES modules, so `file://` works).
- Fixed-timestep physics (120 Hz) accumulated from `requestAnimationFrame`, render every frame.

## Future ideas (parked)

One-liners only — not designed yet:

- Enemy variety: shooters, splitters, rope-cutters, armored (need multiple hits)
- Power-ups: longer rope, multi-ball, temporary slow-mo
- Rope upgrades / alternate tether types (rigid chain, bungee)
- Juice: screen shake, particles, hit-stop, trails, audio
- Wave structure, score multipliers for style, leaderboards
