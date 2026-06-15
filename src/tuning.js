// All gameplay constants live here.
window.Tethered = window.Tethered || {};

Tethered.TUNING = {
  // HUD: a reserved band above the play area, so game elements never pass
  // under the UI. The arena starts below it.
  HUD_HEIGHT: 64,         // px

  // Ball
  BALL_RADIUS: 16,        // px
  BALL_MASS: 1,           // mass unit — the standard chaser is 1 too; turns ball speed into impact force
  BALL_DRAG: 0.4,         // 1/s — exponential velocity decay (top-down friction)
  BALL_MAX_SPEED: 1000,   // px/s — speed cap
  WALL_RESTITUTION: 0.9,  // arena-border bounce energy retention

  // Pegs: static circular obstacles scattered around the arena. The ball
  // bounces off them, the rope wraps them like enemies, and enemies are blocked
  // by them. The count is derived from PEG_PER_SCREEN so on-screen density holds
  // regardless of window size (viewport is 1:1 with world px, no zoom).
  PEG_RADIUS: 32,         // px — ~2× the ball radius
  PEG_PER_SCREEN: 1.5,    // target pegs visible at once; drives the total count
  PEG_MIN: 2,             // clamp floor on the derived peg count
  PEG_MAX: 12,            // clamp ceiling on the derived peg count
  PEG_RESTITUTION: 0.9,   // ball bounce energy retention off a peg (like a wall)

  // Tether (elastic spring to cursor)
  GRAB_RADIUS: 176,       // px beyond ball radius that still counts as a grab
  ROPE_K: 9,              // 1/s^2 — spring constant (accel per px of stretch)
  ROPE_DAMPING: 1.2,      // 1/s — along-rope damping
  ROPE_MAX_REST: 384,     // px — the rope's maximum (slack) length; tension only above it. Every grab seeds restLength here, so the ball swings free within this radius and the rope pulls only once stretched past it. Well above the grab reach (BALL_RADIUS + GRAB_RADIUS = 192), so no grab starts pre-stretched.
  ROPE_MIN_SEG: 8,        // px — segments shorter than this can't gain a pivot (anti-chatter)
  WRAP_CROSS_EPS: 0.05,   // crossings this close to a segment endpoint are pass-bys, not wraps
  SLINGSHOT_IMPULSE_K: 2.5,  // px/s of release-launch impulse per px of stretch (0 = no slingshot)

  // Edge wrapping: the rope hugs pivot circles with tangent lines + contact
  // arcs, so winding consumes rope and raises tension naturally — that's the
  // wrap limit; the pivot/angle caps below only guard degenerate states.
  WRAP_UNWRAP_EPS: 0.02,      // rad — a pivot whose contact arc shrinks below this releases
  WRAP_SAFETY_MAX_PIVOTS: 16, // degenerate-state cap on simultaneous pivots (not a balance knob)
  WRAP_MAX_PIVOT_ANGLE: 6 * Math.PI, // per-pivot accumulated contact-angle clamp (3 full turns)
  WRAP_DRAG_K: 0.8,           // scale on rope tension dragging wrapped live enemies (raised with the ROPE_K 12 -> 9 cut to hold the product — drag strength is its own knob, not a tension follower)

  // Wrap visuals: the rope reads like a drawn bow (thicker + glowing with
  // stretch, highlight rings on wrap pivots).
  WRAP_GLOW_STRETCH: 200,    // px of stretch at full rope tension color/width/glow
  WRAP_ROPE_WIDTH: 3,        // extra px of rope width at full tension (on the base 2)
  WRAP_GLOW_BLUR: 16,        // px of tension glow at full stretch
  WRAP_RING_PAD: 5,          // px the wrap-pivot highlight ring sits off the pivot's edge

  // Invincibility
  SPEED_THRESHOLD: 420,   // px/s — smash without taking damage above this; tethered bumps reset the combo
  SPEED_COLOR_MAX: 700,   // px/s — ball color/glow gradient reaches full brightness
  SPEED_FLASH_WINDOW: 120, // px/s above threshold where the ball flashes a vulnerability warning

  // Health
  MAX_HP: 100,
  IFRAME_DURATION: 0.75,  // s of post-hit invulnerability — short enough that being swarmed kills
  KNOCKBACK_SPEED: 320,   // px/s applied to the enemy on a hit
  PLAYER_KNOCKBACK_SPEED: 520, // px/s the ball is flung on taking a hit — big enough to clear a swarm before i-frames lapse

  // Enemies
  ENEMY_RADIUS: 14,       // px
  ENEMY_SPEED: 110,       // px/s chaser seek speed
  ENEMY_HP: 16,           // basic enemy HP
  ENEMY_DAMAGE: 10,       // HP the ball loses to a basic enemy touch
  ENEMY_MASS: 1,          // the reference mass; every other enemy is relative to this
  KILL_SPEED_KEEP: 0.95,  // fraction of speed the ball keeps when it hits an enemy

  // Force-based damage: an impact's force drives the damage, continuously — no
  // "smash" threshold. A ball hit's force is BALL_MASS × ball speed (the ball is
  // the heavy driver); an enemy-vs-enemy hit's force is the pair's reduced-mass
  // impulse (impactForce in enemies.js). Below FORCE_MIN nothing is damaged (the
  // ball just bounces; the player takes a touch on a slow contact); at the floor
  // a hit deals FORCE_DAMAGE_BASE, then +1 damage per FORCE_PER_DAMAGE above it.
  // FORCE_MIN = BALL_MASS × SPEED_THRESHOLD, so a ball at the old smash speed
  // hitting a standard enemy lands exactly on the floor (≈ the old flat damage).
  FORCE_MIN: 420,
  FORCE_DAMAGE_BASE: 2,    // damage at the force floor
  FORCE_PER_DAMAGE: 115,   // force per +1 damage above the floor (a max-speed hit ≈ 7)
  BIG_HIT_FORCE: 840,      // a kill landed with at least this force plays the heavy-pop juice

  HIT_FLASH_DURATION: 0.15, // s — enemy flashes white when a hit doesn't kill
  ENEMY_BOUNCE: 40,       // px/s — light shove when two enemies bump (impulse, scaled by 1/mass)
  ENEMY_KNOCKBACK_DECAY: 4, // 1/s — exponential decay of every shove (hits, splits, pops, bumps)
  ENEMY_HIT_COOLDOWN: 0.12, // s an enemy is immune to further enemy-vs-enemy force hits (anti-spam)

  // Wave spawn mix: each type unlocks at its *_UNLOCK_DEPTH and claims its
  // CHANCE slice (weight) of every spawn roll; whatever's left is a basic
  // chaser. Weights scale inversely with strength (super-splitter rarest) and
  // ramp with the wave number (game.depth) — every unlocked weight is
  // multiplied by (1 + depth / MIX_RAMP_DEPTH), clamped so the specials' total
  // never exceeds MIX_SPECIAL_TOTAL_MAX. Unlock order is teaching order: a new
  // type roughly every wave so each gets a clean introduction.
  MIX_RAMP_DEPTH: 6,           // waves for the special weights to double
  MIX_SPECIAL_TOTAL_MAX: 0.7,  // ceiling on the specials' summed chance

  // Tanks: rarer armored enemies that take four base-damage hits
  TANK_HP: 32,
  TANK_DAMAGE: 25,        // HP the ball loses to a tank touch
  TANK_RADIUS: 18,        // px
  TANK_SPEED: 70,         // px/s — the slowest enemy
  TANK_MASS: 3,           // heaviest single body — barely budges when hit, a rolling wall
  TANK_CHANCE: 0.04,      // fraction of spawns that are tanks, once unlocked — strongest, so rarest
  TANK_UNLOCK_DEPTH: 3,   // wave tanks start appearing

  // Splitters: tank-tough enemies that break into two basic chasers on death
  SPLITTER_HP: 32,           // same starting HP as tanks
  SPLITTER_DAMAGE: 15,
  SPLITTER_RADIUS: 17,       // px
  SPLITTER_SPEED: 100,       // px/s — out-paces tanks
  SPLITTER_MASS: 2,          // weighs as much as two standard enemies
  SPLITTER_CHANCE: 0.06,
  SPLITTER_UNLOCK_DEPTH: 2,  // wave
  SPLIT_FLING: 600,          // px/s the children fling apart
  SPLIT_INVULN: 0.1,         // s the freshly split children can't be hurt

  // Super-splitters: rarer, bigger splitters that break into two regular
  // splitters (four chasers once those die too)
  SUPER_SPLITTER_HP: 48,
  SUPER_SPLITTER_DAMAGE: 20,
  SUPER_SPLITTER_RADIUS: 21,      // px
  SUPER_SPLITTER_SPEED: 75,       // px/s
  SUPER_SPLITTER_MASS: 3,         // heaviest tier, alongside tanks
  SUPER_SPLITTER_CHANCE: 0.02,    // a third the splitter rate — splitter children is a lot
  SUPER_SPLITTER_UNLOCK_DEPTH: 8, // wave

  // Orbiters: creep toward the ball while slowing; once stalled they spiral
  // out around the stall point to max radius, close back in, then creep again
  ORBITER_HP: 16,             // basic HP — the trick is the movement
  ORBITER_DAMAGE: 15,
  ORBITER_RADIUS: 12,         // px
  ORBITER_SPEED: 70,          // px/s at the start of each creep
  ORBITER_MASS: 0.7,          // light and floaty
  ORBITER_DECEL: 0.3,         // 1/s — exponential creep-speed decay
  ORBITER_STOP_SPEED: 12,     // px/s — below this the creep stalls and the orbit starts
  ORBITER_MAX_RADIUS: 110,    // px — orbit radius at full spiral
  ORBITER_RADIUS_SPEED: 70,   // px/s the orbit radius opens and closes
  ORBITER_ANGULAR_SPEED: 2.6, // rad/s
  ORBITER_CHANCE: 0.08,       // mid-strength: tricky movement but only basic HP
  ORBITER_UNLOCK_DEPTH: 5,    // wave

  // Runners: chase like a chaser at double speed, but bolt once the ball gets
  // close. A ball closing in at smash speed triggers a telegraphed panic dash
  // — an unpredictable burst whose contact stings — making the chase a real
  // pursuit, not a free pickup.
  RUNNER_HP: 16,            // basic HP — the chase is the point, not the fight
  RUNNER_DAMAGE: 5,
  RUNNER_RADIUS: 12,        // px
  RUNNER_SPEED: 220,        // px/s — 2× chaser speed
  RUNNER_MASS: 0.5,         // the lightest enemy — rockets away when hit
  RUNNER_FLEE_RADIUS: 240,  // px from the ball where chasing flips to fleeing
  RUNNER_DASH_TRIGGER_DIST: 140, // px — a smash-speed ball this close triggers the panic dash
  RUNNER_DASH_WINDUP: 0.2,  // s of telegraphed freeze (white blink) before the burst
  RUNNER_DASH_SPEED: 700,   // px/s burst, decaying like any knockback
  RUNNER_DASH_DANGER: 0.4,  // s after the burst that contact deals the dash damage
  RUNNER_DASH_DAMAGE: 15,   // HP a dashing runner's touch costs (vs the usual 5)
  RUNNER_DASH_COOLDOWN: 2.5, // s before it can panic again
  RUNNER_CHANCE: 0.10,      // weakest special, so most common
  RUNNER_UNLOCK_DEPTH: 1,   // wave

  // Spitters: zoners that hold a standoff band from the ball and lob slow
  // projectiles at it. The shots hit regardless of ball speed (only i-frames
  // protect), so pure "stay fast" play has to path around them.
  SPITTER_HP: 16,
  SPITTER_DAMAGE: 10,
  SPITTER_RADIUS: 13,         // px
  SPITTER_SPEED: 90,          // px/s
  SPITTER_MASS: 0.9,          // light-ish zoner
  SPITTER_RANGE: 380,         // px standoff it tries to hold from the ball
  SPITTER_FIRE_INTERVAL: 2.5, // s between shots
  SPITTER_WINDUP: 0.4,        // s of telegraphed charge before a shot (the tell)
  SPITTER_CHANCE: 0.06,
  SPITTER_UNLOCK_DEPTH: 4,    // wave
  PROJECTILE_SPEED: 170,      // px/s — slow enough to dodge by pathing
  PROJECTILE_RADIUS: 6,       // px
  PROJECTILE_DAMAGE: 10,      // HP the ball loses to a shot
  PROJECTILE_LIFETIME: 4,     // s before an unspent shot fizzles

  // Spikers: slow drifting mines that locally invert speed=safety — fast
  // contact pricks the ball (damage plus the knockback's speed bleed) unless
  // the hit bashes through; a slow touch is the safe kill.
  SPIKER_HP: 24,
  SPIKER_DAMAGE: 15,
  SPIKER_RADIUS: 15,          // px (spike visuals overhang slightly)
  SPIKER_SPEED: 55,           // px/s — a hazard you steer around, not flee
  SPIKER_MASS: 1.6,           // a dense, slow mine
  SPIKER_CHANCE: 0.05,
  SPIKER_UNLOCK_DEPTH: 7,     // wave

  // Shieldbearers: a frontal guard tracks the ball and refuses all damage;
  // vulnerable from behind, or from anywhere once a bash breaks the guard
  // open (stunned). Forces angle play — wraps and slingshots earn it.
  SHIELD_HP: 24,
  SHIELD_DAMAGE: 15,
  SHIELD_RADIUS: 16,          // px
  SHIELD_SPEED: 95,           // px/s
  SHIELD_MASS: 1.8,           // armored, medium-heavy
  SHIELD_ARC: 150,            // ° of frontal coverage
  SHIELD_TURN_RATE: 90,       // °/s the guard tracks — a quick swing outflanks it
  SHIELD_STUN: 2.5,           // s a bash leaves the guard broken open
  SHIELD_CHANCE: 0.05,
  SHIELD_UNLOCK_DEPTH: 6,     // wave

  // Enemy death pop animation
  POP_DURATION: 0.25,     // s — how long the pop ring lasts
  POP_SCALE: 2.4,         // final pop ring radius, × enemy radius
  ENEMY_POP_PUSH: 350,        // px/s — shove to nearby enemies/pickups when one dies...
  ENEMY_POP_PUSH_RADIUS: 120, // ...fading to 0 at this range

  // Damage popups: floating numbers over a hit enemy's head that drift up and
  // fade. The tilt keeps a cluster of numbers from all reading as one column.
  DAMAGE_POP_LIFE: 1.0,    // s — lifetime, fading out over it
  DAMAGE_POP_RISE: 55,     // px/s the number floats up (world space)
  DAMAGE_POP_ANGLE: 10,    // ° — max random tilt, ±this
  DAMAGE_POP_FONT: 'bold 18px monospace',

  // Heavy-hit pop: a kill landed with BIG_HIT_FORCE+ of force plows through and
  // plays the bigger, hotter pop (slow-mo, screen flash, harder shockwave).
  BASH_POP_PUSH: 2,         // × ENEMY_POP_PUSH on a heavy-hit pop

  // Juice: screen shake, hit-stop, and the bash screen flash, all scaled by
  // event weight (kill < bash < player hit). Shake accumulates (capped) and
  // decays on real frame time; hit-stop pauses the physics accumulator while
  // rendering continues. The synth voices live in audio.js; only the master
  // volume is tuned here.
  SHAKE_KILL: 3,            // px of shake added per ordinary kill
  SHAKE_BASH: 8,            // px per bash kill
  SHAKE_HIT: 14,           // px when the player takes a hit
  SHAKE_MAX: 22,           // px cap when events stack
  SHAKE_DECAY: 9,          // 1/s — exponential shake falloff
  HITSTOP_KILL: 0.04,       // s frozen on an ordinary kill
  HITSTOP_BASH: 0.09,       // s frozen on a bash kill
  BASH_POP_SCALE: 1.8,      // × POP_SCALE — a bash pop's ring grows this much bigger
  BASH_FLASH_DURATION: 0.09, // s of white screen flash on a bash kill
  BASH_FLASH_ALPHA: 0.22,   // peak flash opacity
  AUDIO_VOLUME: 0,          // master SFX volume (0 = mute) — disabled for now

  // Slow-mo: a bash kill drops the global time scale for a cinematic beat.
  // Every integrator is dt-parameterized, so the whole world slows together
  // while rendering stays at full frame rate.
  SLOWMO_FACTOR: 0.35,      // timeScale set on a bash kill (1 = slow-mo off)
  SLOWMO_RECOVERY: 2.5,     // 1/s — exponential ease back to full speed, on real time

  // Player death: a far bigger pop than an enemy's — staggered shockwave
  // rings, a spark burst, and a screen flash — plus an arena-wide blast that
  // flings every enemy away.
  PLAYER_POP_PUSH: 1000,          // px/s — flings enemies clear of the dying ball
  PLAYER_POP_DURATION: 1.0,       // s — each ring expands and fades over this
  PLAYER_POP_SCALE: 14,           // final ring radius, × ball radius
  PLAYER_POP_RINGS: 3,            // staggered expanding rings
  PLAYER_POP_RING_LAG: 0.12,      // s between successive rings
  PLAYER_POP_PARTICLES: 48,       // sparks in the death burst
  PLAYER_POP_PARTICLE_SPEED: 700, // px/s — max scatter speed
  PLAYER_POP_FLASH: 0.25,         // s — white screen flash at the moment of death

  // Difficulty scaling: the wave number (game.depth) drives spawn count, mix,
  // and per-enemy stat scaling — deeper waves are tougher and a touch faster,
  // not just more numerous. HP rounds so hits-to-kill stays a clean step.
  ENEMY_CAP: 150,                  // max live enemies (frame-time guard); waves cap below it
  ENEMY_SCALE_HP_PER_DEPTH: 0.18,  // spawn HP × (1 + this × (depth-1)), rounded
  ENEMY_SCALE_SPEED_PER_DEPTH: 0.05, // spawn speed × (1 + this × (depth-1))

  // Combo — kills build it (combo.js/enemies.js); a hit resets it. The
  // timeout is short enough that a streak dies if you stop killing.
  COMBO_TIMEOUT: 6,        // s without a combo change before it resets to ×1

  // Health pickups: occasional heart drops from dead enemies, gentle
  // magnetism toward the ball, heal on contact.
  HEALTH_DROP_CHANCE: 0.05, // fraction of enemy deaths that drop one
  HEALTH_HEAL: 20,         // HP restored on pickup (capped at max HP)
  HEALTH_RADIUS: 15,       // px
  HEALTH_FLING_SPEED: 500, // px/s — flung away from the pop
  HEALTH_GRACE: 0.4,       // s before a fresh pickup can be magnetized/scooped
  PICKUP_DRAG: 3,          // 1/s — pickups (and heal sparks) settle quickly
  PICKUP_RESTITUTION: 0.6, // arena-border bounce energy retention for pickups
  PICKUP_MAGNET_RADIUS: 360, // px from ball center the magnet reaches
  PICKUP_MAGNET_ACCEL: 2700, // px/s^2 pull at point-blank, fading to 0 at the magnet radius

  // Heal burst: green particles when a health pickup is grabbed
  HEAL_PARTICLES: 14,        // particles per burst
  HEAL_PARTICLE_SPEED: 260,  // px/s — max scatter speed
  HEAL_PARTICLE_LIFE: 0.5,   // s — max particle lifetime

  // Camera (src/camera.js): smoothed follow on the ball over the arena; the
  // viewport (game.width/height) stays the canvas play area.
  CAM_LERP: 8,              // 1/s — exponential ease toward the ball-centered target

  // Broadphase (src/grid.js)
  GRID_CELL: 64,          // px — uniform-grid cell, ≥ the largest enemy diameter so pair queries scan one neighbor ring

  // Dev panel: a reserved column on the right (like the HUD band up top) with
  // debug buttons — pause, heal, invincibility, spawners. Hidden by default;
  // the toggle key shrinks the arena to make room.
  DEV_PANEL_WIDTH: 150,          // px column when open
  DEV_PANEL_TOGGLE: 'Backquote', // KeyboardEvent.code that toggles it

  // Arena (src/main.js setupArena): one large fixed rectangle (camera follows)
  // with endless waves. The wave number drives game.depth, so enemy
  // stat-scaling and type unlocks ramp the difficulty for free.
  ARENA_W: 2600,                  // px — fixed arena width (bigger than the viewport)
  ARENA_H: 1700,                  // px — fixed arena height
  WAVE_COUNT_BASE: 6,             // enemies in wave 1...
  WAVE_COUNT_PER_WAVE: 2,         // ...growing this many per wave (capped at ENEMY_CAP)
  WAVE_INTERVAL: 60,              // s between waves — counts down regardless of kills, so
                                  // waves can stack; clearing the floor starts the next early
  WAVE_SPAWN_BALL_CLEARANCE: 320, // px around the ball kept spawn-free

  // Edge pips: red chevrons at the viewport rim pointing at enemies the camera
  // has scrolled offscreen, so an incoming swarm is never a total surprise.
  PIP_MARGIN: 18,                 // px the chevrons sit inside the viewport rim
  PIP_MAX: 8,                     // most pips shown at once (the nearest offscreen enemies)

  // Loop
  PHYSICS_HZ: 120,
};

// Game states, compared all over — the enum keeps a typo from failing silently.
Tethered.STATE = Object.freeze({
  PLAYING: 'playing',
  DYING: 'dying',     // death pop playing out; the world coasts, then GAMEOVER
  GAMEOVER: 'gameover', // click to restart
});
