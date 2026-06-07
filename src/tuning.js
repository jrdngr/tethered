// All gameplay constants live here.
window.Tethered = window.Tethered || {};

Tethered.TUNING = {
  // HUD: a reserved band above the play area, so game elements never pass
  // under the UI. The arena starts below it.
  HUD_HEIGHT: 64,         // px

  // Ball
  BALL_RADIUS: 16,        // px
  BALL_DRAG: 0.4,         // 1/s — exponential velocity decay (top-down friction)
  BALL_MAX_SPEED: 1000,   // px/s — base speed cap (upgradable)
  WALL_RESTITUTION: 0.9,  // bounce energy retention (base; the ELASTICITY upgrade raises it)

  // Tether (elastic spring to cursor)
  GRAB_RADIUS: 176,       // px beyond ball radius that still counts as a grab
  ROPE_K: 9,              // 1/s^2 — spring constant (accel per px of stretch)
  ROPE_DAMPING: 1.2,      // 1/s — along-rope damping
  ROPE_MAX_REST: 192,     // px — max rest length at grab time; = BALL_RADIUS + GRAB_RADIUS, so no grab starts pre-stretched (a clamp below the grab reach yanks the ball at grab and starves wraps of rope)
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

  // Wrap rewards: the rope reads like a drawn bow (thicker + glowing with
  // stretch, highlight rings on wrap pivots), and tethered kills pay a
  // wrap-angle coin bonus through the normal payout path.
  WRAP_UNIT_ANGLE: Math.PI,  // rad of total contact angle per kill-bonus unit (one half-turn)
  WRAP_KILL_BONUS: 3,        // bonus coins per half-turn wrap unit on a tethered kill (× combo/coinMult)
  WRAP_GLOW_STRETCH: 200,    // px of stretch at full rope tension color/width/glow
  WRAP_ROPE_WIDTH: 3,        // extra px of rope width at full tension (on the base 2)
  WRAP_GLOW_BLUR: 16,        // px of tension glow at full stretch
  WRAP_RING_PAD: 5,          // px the wrap-pivot highlight ring sits off the pivot's edge

  // Floating reward text (the "+N WRAP" payout callout).
  FLOATER_LIFE: 0.9,         // s before the text fades out
  FLOATER_RISE: 50,          // px/s initial upward drift

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
  ENEMY_HP: 4,            // basic enemies die to two base-damage hits (weapons speed this up)
  ENEMY_DAMAGE: 10,       // HP the ball loses to a basic enemy touch
  KILL_SPEED_KEEP: 0.95,  // fraction of speed kept when smashing an enemy
  PLAYER_DAMAGE: 2,       // base damage per smash (upgradable) — base play smashes; upgrades accelerate
  HIT_FLASH_DURATION: 0.15, // s — enemy flashes white when a hit doesn't kill
  ENEMY_BOUNCE: 40,       // px/s — light shove when two enemies bump (no stacking)
  ENEMY_KNOCKBACK_DECAY: 4, // 1/s — exponential decay of every shove (hits, splits, pops, bumps)

  // Special spawn mix: each type unlocks after its SPAWN_DELAY of survival
  // and claims its CHANCE slice of every spawn roll; whatever's left is a
  // basic chaser. Chances scale inversely with strength (super-splitter
  // rarest) and ramp together with survival time — every unlocked chance is
  // multiplied by (1 + time / MIX_RAMP_TIME), clamped so the specials'
  // total never exceeds MIX_SPECIAL_TOTAL_MAX. Relative proportions hold
  // through the ramp; only the chaser share shrinks (all eight unlocked:
  // specials total 0.46 at the base chances, capped at 0.7 — chasers 0.3).
  MIX_RAMP_TIME: 300,          // s of survival for the special chances to double
  MIX_SPECIAL_TOTAL_MAX: 0.7,  // ceiling on the specials' summed chance

  // Tanks: rarer armored enemies that take four base-damage hits
  TANK_HP: 8,
  TANK_DAMAGE: 25,        // HP the ball loses to a tank touch
  TANK_RADIUS: 18,        // px
  TANK_SPEED: 80,         // px/s — slower than chasers
  TANK_CHANCE: 0.04,      // fraction of spawns that are tanks, once unlocked — strongest, so rarest
  TANK_SPAWN_DELAY: 15,   // s of survival before tanks start spawning
  TANK_COIN_MULT: 2,      // tanks drop this × the base coin burst

  // Splitters: tank-tough enemies that break into two basic chasers on death
  SPLITTER_HP: 8,            // same starting HP as tanks
  SPLITTER_DAMAGE: 15,
  SPLITTER_RADIUS: 17,       // px
  SPLITTER_SPEED: 90,        // px/s
  SPLITTER_CHANCE: 0.06,
  SPLITTER_SPAWN_DELAY: 25,  // s
  SPLIT_FLING: 600,          // px/s the children fling apart
  SPLIT_INVULN: 0.1,         // s the freshly split children can't be hurt

  // Super-splitters: rarer, bigger splitters that break into two regular
  // splitters (four chasers once those die too)
  SUPER_SPLITTER_HP: 12,
  SUPER_SPLITTER_DAMAGE: 20,
  SUPER_SPLITTER_RADIUS: 21,      // px
  SUPER_SPLITTER_SPEED: 75,       // px/s
  SUPER_SPLITTER_CHANCE: 0.02,    // a third the splitter rate — splitter children is a lot
  SUPER_SPLITTER_SPAWN_DELAY: 50, // s

  // Orbiters: creep toward the ball while slowing; once stalled they spiral
  // out around the stall point to max radius, close back in, then creep again
  ORBITER_HP: 4,              // basic HP — the trick is the movement
  ORBITER_DAMAGE: 15,
  ORBITER_RADIUS: 12,         // px
  ORBITER_SPEED: 70,          // px/s at the start of each creep
  ORBITER_DECEL: 0.3,         // 1/s — exponential creep-speed decay
  ORBITER_STOP_SPEED: 12,     // px/s — below this the creep stalls and the orbit starts
  ORBITER_MAX_RADIUS: 110,    // px — orbit radius at full spiral
  ORBITER_RADIUS_SPEED: 70,   // px/s the orbit radius opens and closes
  ORBITER_ANGULAR_SPEED: 2.6, // rad/s
  ORBITER_CHANCE: 0.08,       // mid-strength: tricky movement but only basic HP
  ORBITER_SPAWN_DELAY: 40,    // s

  // Runners: chase like a chaser at double speed, but bolt once the ball
  // gets close; worth triple coins. The 3× is a skill-shot bounty, so
  // collecting it costs something: a ball closing in at smash speed
  // triggers a telegraphed panic dash — an unpredictable burst whose
  // contact stings — making the chase a real pursuit, not a free pickup.
  RUNNER_HP: 4,             // basic HP — the payout is the point, not the fight
  RUNNER_DAMAGE: 5,
  RUNNER_RADIUS: 12,        // px
  RUNNER_SPEED: 220,        // px/s — 2× chaser speed
  RUNNER_FLEE_RADIUS: 240,  // px from the ball where chasing flips to fleeing
  RUNNER_DASH_TRIGGER_DIST: 140, // px — a smash-speed ball this close triggers the panic dash
  RUNNER_DASH_WINDUP: 0.2,  // s of telegraphed freeze (white blink) before the burst
  RUNNER_DASH_SPEED: 700,   // px/s burst, decaying like any knockback
  RUNNER_DASH_DANGER: 0.4,  // s after the burst that contact deals the dash damage
  RUNNER_DASH_DAMAGE: 15,   // HP a dashing runner's touch costs (vs the usual 5)
  RUNNER_DASH_COOLDOWN: 2.5, // s before it can panic again
  RUNNER_COIN_MULT: 3,      // runners drop this × the base coin burst
  RUNNER_CHANCE: 0.10,      // weakest special, so most common
  RUNNER_SPAWN_DELAY: 20,   // s

  // Spitters: zoners that hold a standoff band from the ball and lob slow
  // projectiles at it. The shots hit regardless of ball speed (only
  // i-frames/shield protect), so pure "stay fast" play has to path around
  // them instead of ignoring everything.
  SPITTER_HP: 4,
  SPITTER_DAMAGE: 10,
  SPITTER_RADIUS: 13,         // px
  SPITTER_SPEED: 90,          // px/s
  SPITTER_RANGE: 380,         // px standoff it tries to hold from the ball
  SPITTER_FIRE_INTERVAL: 2.5, // s between shots
  SPITTER_CHANCE: 0.06,
  SPITTER_SPAWN_DELAY: 30,    // s
  PROJECTILE_SPEED: 170,      // px/s — slow enough to dodge by pathing
  PROJECTILE_RADIUS: 6,       // px
  PROJECTILE_DAMAGE: 10,      // HP the ball loses to a shot
  PROJECTILE_LIFETIME: 4,     // s before an unspent shot fizzles

  // Spikers: slow drifting mines that locally invert speed=safety — fast
  // contact pricks the ball (damage plus the knockback's speed bleed)
  // unless the hit bashes through; a slow touch is the safe kill, and
  // weapons work as usual.
  SPIKER_HP: 6,
  SPIKER_DAMAGE: 15,
  SPIKER_RADIUS: 15,          // px (spike visuals overhang slightly)
  SPIKER_SPEED: 55,           // px/s — a hazard you steer around, not flee
  SPIKER_CHANCE: 0.05,
  SPIKER_SPAWN_DELAY: 35,     // s

  // Shieldbearers: a frontal guard tracks the ball and refuses all damage;
  // vulnerable from behind, or from anywhere once a bash breaks the guard
  // open (stunned). Forces angle play — wraps and slingshots earn it.
  SHIELD_HP: 6,
  SHIELD_DAMAGE: 15,
  SHIELD_RADIUS: 16,          // px
  SHIELD_SPEED: 95,           // px/s
  SHIELD_ARC: 150,            // ° of frontal coverage
  SHIELD_TURN_RATE: 90,       // °/s the guard tracks — a quick swing outflanks it
  SHIELD_STUN: 2.5,           // s a bash leaves the guard broken open
  SHIELD_CHANCE: 0.05,
  SHIELD_SPAWN_DELAY: 45,     // s

  // Enemy death pop animation
  POP_DURATION: 0.25,     // s — how long the pop ring lasts
  POP_SCALE: 2.4,         // final pop ring radius, × enemy radius
  ENEMY_POP_PUSH: 350,        // px/s — shove to nearby enemies/pickups when one dies...
  ENEMY_POP_PUSH_RADIUS: 120, // ...fading to 0 at this range

  // Bashing: a smash dealing more than BASH_HP_FACTOR × the enemy's
  // max HP plows through (deflected, never bounced back) and pops harder
  BASH_HP_FACTOR: 1.5,      // damage must exceed this × max HP
  BASH_POP_PUSH: 2,         // × ENEMY_POP_PUSH on a bash pop
  BASH_DEFLECT_MAX: 89,     // ° — bounce deflection clamp; <90 keeps forward momentum

  // Juice: screen shake, hit-stop, and the bash screen flash, all scaled by
  // event weight (kill < bash < explosion < player hit). Shake accumulates
  // (capped) and decays on real frame time; hit-stop pauses the physics
  // accumulator while rendering continues. The synth voices live in
  // audio.js; only the master volume is tuned here.
  SHAKE_KILL: 3,            // px of shake added per ordinary kill
  SHAKE_BASH: 8,            // px per bash kill
  SHAKE_EXPLODE: 10,        // px per DAMAGE-special explosion
  SHAKE_HIT: 14,            // px when the player takes a hit
  SHAKE_MAX: 22,            // px cap when events stack
  SHAKE_DECAY: 9,           // 1/s — exponential shake falloff
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
  // rings, a spark burst, and a screen flash — plus an arena-wide blast
  // that flings every enemy away.
  PLAYER_POP_PUSH: 1000,          // px/s — 2× the health-pickup fling force
  PLAYER_POP_DURATION: 1.0,       // s — each ring expands and fades over this
  PLAYER_POP_SCALE: 14,           // final ring radius, × ball radius
  PLAYER_POP_RINGS: 3,            // staggered expanding rings
  PLAYER_POP_RING_LAG: 0.12,      // s between successive rings
  PLAYER_POP_PARTICLES: 48,       // sparks in the death burst
  PLAYER_POP_PARTICLE_SPEED: 700, // px/s — max scatter speed
  PLAYER_POP_FLASH: 0.25,         // s — white screen flash at the moment of death

  // Interior obstacles: static geometry the ball bounces off (combo credit
  // like walls; restitution reads the ELASTICITY stat) and the rope can
  // wrap — the rope hugs the silhouette's edge — turning the arena itself
  // into slingshot anchors. Rects are capsules (rounded ends, radius = half
  // the short side) so wraps hug a fat arc instead of pinching at sharp
  // corners. One layout per run, cycling across runs. Positions are arena
  // fractions (fx/fy); sizes are px.
  OBSTACLE_LAYOUTS: [
    // Twin pillars flanking the spawn point.
    [{ kind: 'circle', fx: 0.3, fy: 0.5, r: 30 },
     { kind: 'circle', fx: 0.7, fy: 0.5, r: 30 }],
    // Upper and lower bars: end wraps and bounce alleys.
    [{ kind: 'rect', fx: 0.5, fy: 0.26, w: 170, h: 26 },
     { kind: 'rect', fx: 0.5, fy: 0.74, w: 170, h: 26 }],
  ],

  // Spawning: the rate climbs exponentially, doubling every SPAWN_DOUBLE_TIME
  // (one enemy/sec at ~3.5 min). A growing concurrent-enemy floor refills a
  // cleared board immediately (no dead air), a cap bounds live enemies as a
  // frame-time safety net (excess spawns wait for a free slot), and enemies
  // spawn with per-minute HP/speed multipliers so the late game is harder
  // enemies, not just more of them.
  SPAWN_INTERVAL_START: 5.0,  // s
  SPAWN_DOUBLE_TIME: 90,      // s of survival for the spawn rate to double
  SPAWN_MIN_BALL_DIST: 150,   // px — edge spawns re-roll if closer to the ball
  SPAWN_FLOOR_BASE: 2,        // live enemies the board never drops below...
  SPAWN_FLOOR_PER_MIN: 1,     // ...growing this much per minute of survival
  ENEMY_CAP: 150,             // max live enemies (frame-time guard, not a balance knob)
  ENEMY_SCALE_HP_PER_MIN: 0.08,    // spawn HP × (1 + this × minutes), rounded
  ENEMY_SCALE_SPEED_PER_MIN: 0.08, // spawn speed × (1 + this × minutes)

  // Combo
  COMBO_TIMEOUT: 10,       // s without a combo change before it resets to ×1

  // Coins & leveling
  COIN_RADIUS: 5,          // px
  COINS_PER_KILL_MIN: 6,   // base coins dropped per popped enemy...
  COINS_PER_KILL_MAX: 10,  // ...rolled in this range, then × combo^exponent
  COMBO_PAYOUT_EXPONENT: 0.5, // payout scales with combo^this — sublinear so
                              // streaks always matter but never explode
                              // (1.0 = linear; quadratic-in-streak total)
  COIN_BURST_SPEED: 220,   // px/s — max scatter speed on drop
  COIN_DRAG: 3,            // 1/s — coins settle quickly
  COIN_MAGNET_RADIUS: 128, // px from ball center
  COIN_MAGNET_ACCEL: 1800, // px/s^2 pull at point-blank, fading to 0 at the magnet radius
  COIN_LIFETIME: 30,       // s before an uncollected coin fades away
  PICKUP_RESTITUTION: 0.6, // wall-bounce energy retention for coins/pickups
  LEVEL_COINS_BASE: 25,    // coins to clear level 1
  LEVEL_COINS_GROWTH: 1.2, // × per level

  // Coin merging: same-value coins drift together and combine into a higher
  // denomination — 5×1 → 5, 5×5 → 25, 4×25 → 100 (the highest coin).
  COIN_MERGE_COUNTS: { 1: 5, 5: 5, 25: 4 }, // coins of this value needed to merge up
  COIN_ATTRACT_RADIUS_MULT: 4, // × coin radius — double the coin's diameter
  COIN_ATTRACT_ACCEL: 120,     // px/s^2 pull at point-blank; vs drag ≈ 40 px/s drift
  COIN_BLOB_REPEL_ACCEL: 240,  // px/s^2 shove between merge-close coins short of a full group
  COIN_MERGE_DIST_MULT: 0.5,   // × combined radii — "nearly overlapping" to merge
  COIN_MERGE_GRACE: 0.2,       // s after spawning before a coin may merge
  COIN_SIZE_GROWTH: 0.25,      // coin radius = COIN_RADIUS × value^this

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

  // Paddles: upgrade-granted rectangles that patrol screen edges and launch
  // the ball to top speed on contact. One per PADDLE level (4 max); the
  // level-5 special doubles every paddle's length instead.
  PADDLE_LENGTH: 55,     // px along the edge (doubled by the PADDLE special)
  PADDLE_THICKNESS: 14,  // px into the arena
  PADDLE_SPEED: 200,     // px/s patrol speed

  // Weapons: upgrade-granted shapes attached to the ball that arm on tether
  // release while fast and expire once it slows into the warning flash. Each
  // adds its bonus damage on top of the base smash; levels 1-4 add the
  // per-level damage and grow the shape, the 5th pick is the special.
  WEAPON_POKER_REACH: 48,      // px front spike length (1.5× ball diameter)
  WEAPON_POKER_WIDTH: 6,       // px hit-capsule radius / half-width at the base
  WEAPON_POKER_DMG: 1,         // bonus damage per level (1-4)
  WEAPON_TAIL_REACH: 72,       // px rear cone length (2.25× ball diameter)
  WEAPON_TAIL_WIDTH: 12,       // px hit-capsule radius / half-width at the wide tip
  WEAPON_TAIL_DMG: 1,
  WEAPON_TAIL_TURN_K: 140,     // 1/s^2 — spring accel pulling the floppy tail toward straight-behind
  WEAPON_TAIL_TURN_DAMPING: 12, // 1/s — moderate damping: a few overshoots before the tail settles
  WEAPON_TAIL_WIND_PER_SPEED: 1.0, // 1/s^2 per px/s — headwind: extra pull toward straight-behind per unit of ball speed
  WEAPON_TAIL_TIME_SCALE: 0.5, // the tail spring integrates in slowed time: the same motion at this × speed
  WEAPON_EARS_REACH: 16,       // px the side crescents extend (0.5× ball diameter)
  WEAPON_EARS_WIDTH: 8,
  WEAPON_EARS_DMG: 1,
  WEAPON_EARS_SPAN: 70,        // ° of ball circumference each crescent covers
  WEAPON_HORNS_REACH: 32,      // px horn length (1× ball diameter)
  WEAPON_HORNS_WIDTH: 10,
  WEAPON_HORNS_DMG: 1,
  WEAPON_HORN_ANGLE: 45,       // ° off the heading per horn
  WEAPON_SIZE_GROWTH: 0.1,     // size × (1 + this × (level-1)), levels 1-4
  WEAPON_PREVIEW_SCALE: 0.35,  // × base size of the tethered "will deploy" ghost (never grows with level)
  WEAPON_POKER_SKEWER_MULT: 2, // POKER special — × spike length
  WEAPON_EARS_KNOCK_MULT: 2,   // EARS special — × knockback on ear hits

  // Level-up upgrades (gain per pick; the damage upgrade is +1). Each tops
  // out at UPGRADE_LEVEL_MAX: levels 1-4 are the normal gain, the 5th pick
  // grants only that upgrade's special effect, then it leaves the pool.
  UPGRADE_LEVEL_MAX: 5,       // picks per upgrade; the 5th is a special
  UPGRADE_MAX_HP: 20,         // max HP gained (and healed) per VITALITY pick
  UPGRADE_MAGNET_RADIUS: 40,  // px of coin magnet radius
  UPGRADE_MAGNET_ACCEL: 450,  // px/s^2 of coin pull (×2 = the MAGNET RANGE special)
  UPGRADE_MAX_SPEED: 150,     // px/s of ball speed cap
  MOMENTUM_BONUS_PER_LEVEL: 1, // flat damage at the speed cap per MOMENTUM pick — additive, so a maxed MOMENTUM (+4) is directly comparable to a maxed weapon
  UPGRADE_KILL_BOOST: 140,    // px/s gained per popped enemy per KILL SURGE pick
  UPGRADE_WALL_RESTITUTION: 0.05, // wall bounce retention per ELASTICITY pick (combo engine)
  UPGRADE_BALL_MASS: 0.25,    // ball mass per MASS pick (base 1) — straighter bashes, more speed kept

  // Level-5 specials
  POP_EXPLODE_DAMAGE: 2,         // DAMAGE — splash dmg inside the pop push radius
  POP_EXPLODE_DURATION: 0.45,    // DAMAGE — s, fiery blast wave expanding to the splash radius
  COMBO_SHIELD_THRESHOLD: 10,    // VITALITY — combo crossing this grants a shield
  COMBO_SHIELD_COOLDOWN: 30,     // s after a shield breaks before another can be granted
  HOMING_ACCEL: 1400,            // TOP SPEED — px/s^2 bend toward the nearest enemy
  MAX_SPEED_FRACTION: 0.98,      // "at top speed" = ballSpeed >= this × stats.maxSpeed
  MOMENTUM_BASH_HP_FACTOR: 1,    // MOMENTUM — bash factor at top speed (else BASH_HP_FACTOR)

  // Dungeon generation (src/mapgen.js): constructive caves — chamber blobs
  // stamped first (arena-scale swing room is a precondition, not a lottery),
  // corridors carved along a spanning tree, then organic-ized edges. Sizes
  // are in 32px tiles; a "screen" is the reference viewport below, so map
  // size reads in screens-of-play-area.
  TILE_SIZE: 32,            // px — ball radius = 1 tile; 3-tile corridors = 96px
  MAP_SCREEN_W: 1600,       // px — reference screen for map sizing
  MAP_SCREEN_H: 900,
  MAP_SCREENS_BASE: 2,      // depth 1 is a 2×2-screen map...
  MAP_SCREENS_PER_DEPTH: 1, // ...growing one screen per depth...
  MAP_SCREENS_CAP: 6,       // ...capped at 6×6 (depth 5+)
  MAX_DEPTH: 10,            // clearing this depth's exit wins the run
  MAP_BORDER_TILES: 2,      // solid wall band around the map, never carved
  CHAMBER_COUNT_BY_DEPTH: [2, 4, 6, 8, 10, 12, 13, 14, 15, 16], // sub-linear — no encounter-count cliffs
  CHAMBER_RADIUS_MIN: 18,   // tiles — stamped chamber blob radius (576px)...
  CHAMBER_RADIUS_MAX: 22,   // ...to 704px: arena-scale swing room guaranteed
  CHAMBER_GAP_TILES: 6,     // tiles of wall kept between stamped chambers
  MIN_PASSAGE_TILES: 3,     // tiles — corridor width floor (96px ≥ 3× enemy diameter)
  CA_EDGE_ITERS: 2,         // smoothing passes over the wall/floor boundary band
  CA_NOISE_FLOOR_P: 0.35,   // boundary wall→floor flip chance (erosion-biased...)
  CA_NOISE_WALL_P: 0.22,    // ...vs floor→wall, so organic-izing never seals space)
  MAX_GEN_ATTEMPTS: 10,     // reseeded tries before accepting the best-scoring map
  WALL_PEG_RADIUS: 10,      // px — wrap peg at each convex wall corner
  WALL_PEG_MIN_ANGLE: 25,   // ° — contour turn below this is "straight": no peg (anti-chatter)
  PEG_DP_EPSILON: 0.8,      // tiles — Douglas-Peucker tolerance simplifying wall contours

  // Broadphase (src/grid.js)
  GRID_CELL: 64,          // px — uniform-grid cell, ≥ the largest enemy diameter so pair queries scan one neighbor ring

  // Dev panel: a reserved column on the right (like the HUD band up top)
  // with debug buttons — pause, heal, invincibility, spawners, upgrades.
  // Hidden by default; the toggle key shrinks the arena to make room.
  DEV_PANEL_WIDTH: 150,          // px column when open
  DEV_PANEL_TOGGLE: 'Backquote', // KeyboardEvent.code that toggles it

  // Loop
  PHYSICS_HZ: 120,
};

// Game states, compared all over — the enum keeps a typo from failing silently.
Tethered.STATE = Object.freeze({
  PLAYING: 'playing',
  DYING: 'dying',
  LEVELUP: 'levelup',
  GAMEOVER: 'gameover',
});
