// All gameplay constants live here. See docs/DESIGN.md for the tuning table.
window.Tethered = window.Tethered || {};

Tethered.TUNING = {
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
  SPEED_THRESHOLD: 420,   // px/s — smash without taking damage above this; tethered bumps reset the combo
  SPEED_COLOR_MAX: 700,   // px/s — ball color/glow gradient reaches full brightness
  SPEED_FLASH_WINDOW: 120, // px/s above threshold where the ball flashes a vulnerability warning

  // Health
  MAX_HP: 100,
  IFRAME_DURATION: 1.0,   // s of post-hit invulnerability
  KNOCKBACK_SPEED: 320,   // px/s applied to ball and enemy on a hit

  // Enemies
  ENEMY_RADIUS: 14,       // px
  ENEMY_SPEED: 110,       // px/s chaser seek speed
  ENEMY_HP: 1,            // basic enemies die to one base-damage hit
  ENEMY_DAMAGE: 10,       // HP the ball loses to a basic enemy touch
  KILL_SPEED_KEEP: 0.95,  // fraction of speed kept when smashing an enemy
  PLAYER_DAMAGE: 1,       // base damage per smash (upgradable)
  HIT_FLASH_DURATION: 0.15, // s — enemy flashes white when a hit doesn't kill

  // Tanks: rarer armored enemies that take two base-damage hits
  TANK_HP: 2,
  TANK_DAMAGE: 25,        // HP the ball loses to a tank touch
  TANK_RADIUS: 18,        // px
  TANK_SPEED: 80,         // px/s — slower than chasers
  TANK_CHANCE: 0.2,       // fraction of spawns that are tanks, once unlocked
  TANK_SPAWN_DELAY: 15,   // s of survival before tanks start spawning
  TANK_COIN_MULT: 2,      // tanks drop this × the base coin burst

  // Enemy death pop animation
  POP_DURATION: 0.25,     // s — how long the pop ring lasts
  POP_SCALE: 2.4,         // final pop ring radius, × enemy radius
  ENEMY_POP_PUSH: 160,        // px/s — small shove to nearby enemies when one dies...
  ENEMY_POP_PUSH_RADIUS: 120, // ...fading to 0 at this range

  // Player death: a far bigger pop than an enemy's — staggered shockwave
  // rings, a spark burst, and a screen flash — plus an arena-wide blast
  // that flings every enemy away with health-pickup fling force.
  PLAYER_POP_DURATION: 1.0,       // s — each ring expands and fades over this
  PLAYER_POP_SCALE: 14,           // final ring radius, × ball radius
  PLAYER_POP_RINGS: 3,            // staggered expanding rings
  PLAYER_POP_RING_LAG: 0.12,      // s between successive rings
  PLAYER_POP_PARTICLES: 48,       // sparks in the death burst
  PLAYER_POP_PARTICLE_SPEED: 700, // px/s — max scatter speed
  PLAYER_POP_FLASH: 0.25,         // s — white screen flash at the moment of death

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
  COIN_MAGNET_RADIUS: 128, // px from ball center — 2× the grab handle (BALL_RADIUS + GRAB_RADIUS)
  COIN_MAGNET_ACCEL: 1800, // px/s^2 pull at point-blank, fading to 0 at the magnet radius
  COIN_LIFETIME: 30,       // s before an uncollected coin fades away
  LEVEL_COINS_BASE: 50,    // coins to clear level 1
  LEVEL_COINS_GROWTH: 1.2, // × per level

  // Health pickups: occasional heart drops from dead enemies. They use the
  // same physics/magnetism as coins but heal instead of leveling.
  HEALTH_DROP_CHANCE: 0.05, // fraction of enemy deaths that drop one
  HEALTH_HEAL: 20,         // HP restored on pickup (capped at max HP)
  HEALTH_RADIUS: 15,       // px — 3× coin radius
  HEALTH_FLING_SPEED: 500, // px/s — flung away from the pop harder than coins
  HEALTH_GRACE: 0.4,       // s before a fresh pickup can be magnetized/scooped

  // Heal burst: green particles when a health pickup is grabbed
  HEAL_PARTICLES: 14,        // particles per burst
  HEAL_PARTICLE_SPEED: 260,  // px/s — max scatter speed
  HEAL_PARTICLE_LIFE: 0.5,   // s — max particle lifetime

  // Level-up upgrades (gain per pick; the damage upgrade is +1)
  UPGRADE_MAX_HP: 20,         // max HP gained (and healed) per VITALITY pick
  UPGRADE_MAGNET_RADIUS: 40,  // px of coin magnet radius
  UPGRADE_MAGNET_ACCEL: 450,  // px/s^2 of coin magnet pull
  UPGRADE_MAX_SPEED: 150,     // px/s of ball speed cap

  // Loop
  PHYSICS_HZ: 120,
};
