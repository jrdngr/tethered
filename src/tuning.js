// All gameplay constants live here. See docs/DESIGN.md for the tuning table.
window.Swangin = window.Swangin || {};

Swangin.TUNING = {
  // Ball
  BALL_RADIUS: 16,        // px
  BALL_DRAG: 0.4,         // 1/s — exponential velocity decay (top-down friction)
  BALL_MAX_SPEED: 1000,   // px/s — base speed cap (upgradable)
  WALL_RESTITUTION: 0.9,  // bounce energy retention

  // Tether (elastic spring to cursor)
  GRAB_RADIUS: 48,        // px beyond ball radius that still counts as a grab
  ROPE_K: 18,             // 1/s^2 — spring constant (accel per px of stretch)
  ROPE_DAMPING: 1.2,      // 1/s — along-rope damping
  ROPE_MAX_REST: 120,     // px — max rest length at grab time

  // Invincibility
  SPEED_THRESHOLD: 420,   // px/s — invincible above this, when untethered
  SPEED_COLOR_MAX: 700,   // px/s — ball color/glow gradient reaches full brightness
  SPEED_FLASH_WINDOW: 120, // px/s above threshold where the ball flashes a vulnerability warning

  // Health
  MAX_HP: 3,
  IFRAME_DURATION: 1.0,   // s of post-hit invulnerability
  KNOCKBACK_SPEED: 320,   // px/s applied to ball and enemy on a hit

  // Enemies
  ENEMY_RADIUS: 14,       // px
  ENEMY_SPEED: 110,       // px/s chaser seek speed
  ENEMY_HP: 1,            // basic enemies die to one base-damage hit
  KILL_SPEED_KEEP: 0.95,  // fraction of speed kept when smashing an enemy
  PLAYER_DAMAGE: 1,       // base damage per smash (upgradable)
  HIT_FLASH_DURATION: 0.15, // s — enemy flashes white when a hit doesn't kill

  // Tanks: rarer armored enemies that take two base-damage hits
  TANK_HP: 2,
  TANK_RADIUS: 18,        // px
  TANK_SPEED: 80,         // px/s — slower than chasers
  TANK_CHANCE: 0.2,       // fraction of spawns that are tanks, once unlocked
  TANK_SPAWN_DELAY: 15,   // s of survival before tanks start spawning
  TANK_COIN_MULT: 2,      // tanks drop this × the base coin burst

  // Enemy death pop animation
  POP_DURATION: 0.25,     // s — how long the pop ring lasts
  POP_SCALE: 2.4,         // final pop ring radius, × enemy radius

  // Spawning
  SPAWN_INTERVAL_START: 2.5, // s
  SPAWN_INTERVAL_MIN: 0.6,   // s
  SPAWN_RAMP_TIME: 120,      // s of survival to reach min interval

  // Coins & leveling
  COIN_RADIUS: 5,          // px
  COINS_PER_KILL_MIN: 6,   // base coins dropped per popped enemy...
  COINS_PER_KILL_MAX: 10,  // ...rolled in this range, then × combo
  COIN_BURST_SPEED: 220,   // px/s — max scatter speed on drop
  COIN_DRAG: 3,            // 1/s — coins settle quickly
  COIN_MAGNET_RADIUS: 64,  // px from ball center — matches grab handle (BALL_RADIUS + GRAB_RADIUS)
  COIN_MAGNET_ACCEL: 1800, // px/s^2 pull at point-blank, fading to 0 at the magnet radius
  COIN_LIFETIME: 30,       // s before an uncollected coin fades away
  LEVEL_COINS_BASE: 50,    // coins to clear level 1
  LEVEL_COINS_GROWTH: 1.2, // × per level

  // Level-up upgrades (gain per pick; HP and damage upgrades are +1 each)
  UPGRADE_MAGNET_RADIUS: 40,  // px of coin magnet radius
  UPGRADE_MAGNET_ACCEL: 450,  // px/s^2 of coin magnet pull
  UPGRADE_MAX_SPEED: 150,     // px/s of ball speed cap

  // Loop
  PHYSICS_HZ: 120,
};
