// All gameplay constants live here. See docs/DESIGN.md for the tuning table.
window.Swangin = window.Swangin || {};

Swangin.TUNING = {
  // Ball
  BALL_RADIUS: 16,        // px
  BALL_DRAG: 0.4,         // 1/s — exponential velocity decay (top-down friction)
  WALL_RESTITUTION: 0.9,  // bounce energy retention

  // Tether (elastic spring to cursor)
  GRAB_RADIUS: 48,        // px beyond ball radius that still counts as a grab
  ROPE_K: 18,             // 1/s^2 — spring constant (accel per px of stretch)
  ROPE_DAMPING: 1.2,      // 1/s — along-rope damping
  ROPE_MAX_REST: 120,     // px — max rest length at grab time

  // Invincibility
  SPEED_THRESHOLD: 420,   // px/s — invincible above this, when untethered

  // Health
  MAX_HP: 3,
  IFRAME_DURATION: 1.0,   // s of post-hit invulnerability
  KNOCKBACK_SPEED: 320,   // px/s applied to ball and enemy on a hit

  // Enemies
  ENEMY_RADIUS: 14,       // px
  ENEMY_SPEED: 110,       // px/s chaser seek speed
  ENEMY_BASE_POINTS: 100, // × combo on kill
  KILL_SPEED_KEEP: 0.95,  // fraction of speed kept when smashing an enemy

  // Enemy death pop animation
  POP_DURATION: 0.25,     // s — how long the pop ring lasts
  POP_SCALE: 2.4,         // final pop ring radius, × enemy radius

  // Spawning
  SPAWN_INTERVAL_START: 2.5, // s
  SPAWN_INTERVAL_MIN: 0.6,   // s
  SPAWN_RAMP_TIME: 120,      // s of survival to reach min interval

  // Loop
  PHYSICS_HZ: 120,
};
