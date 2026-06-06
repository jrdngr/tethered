// Enemies: a per-type definition registry (stats, spawn gating, behavior
// hooks), edge spawning with a ramping rate, steering, collision outcomes.
window.Tethered = window.Tethered || {};

(function (S) {
  // Steering brains. Each integrates position from its own steering plus the
  // shared decaying knockback (kx/ky). Default: seek the ball.
  function seekBall(game, e, dt) {
    const dx = game.ball.x - e.x;
    const dy = game.ball.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += ((dx / d) * e.speed + e.kx) * dt;
    e.y += ((dy / d) * e.speed + e.ky) * dt;
  }

  // Runner: chase like a chaser, but bolt once the ball gets close — pinned
  // inside the arena so fleeing can't leave the screen.
  function runnerBrain(game, e, dt) {
    const T = S.TUNING;
    const dx = game.ball.x - e.x;
    const dy = game.ball.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const seek = d < T.RUNNER_FLEE_RADIUS ? -1 : 1;
    e.x += ((dx / d) * e.speed * seek + e.kx) * dt;
    e.y += ((dy / d) * e.speed * seek + e.ky) * dt;
    e.x = Math.max(e.r, Math.min(e.x, game.width - e.r));
    e.y = Math.max(e.r, Math.min(e.y, game.height - e.r));
  }

  // Orbiter brain. Drift: creep toward the ball, bleeding speed. Stalled:
  // anchor in place and spiral out to max radius, close back in, then drift
  // again. Knockback shoves the anchor while orbiting.
  function orbiterBrain(game, e, dt) {
    const T = S.TUNING;
    if (e.phase === 'drift') {
      e.driftSpeed *= Math.exp(-T.ORBITER_DECEL * dt);
      const dx = game.ball.x - e.x;
      const dy = game.ball.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += ((dx / d) * e.driftSpeed + e.kx) * dt;
      e.y += ((dy / d) * e.driftSpeed + e.ky) * dt;
      if (e.driftSpeed <= T.ORBITER_STOP_SPEED) {
        e.phase = 'orbit';
        e.cx = e.x;
        e.cy = e.y;
        e.angle = Math.random() * Math.PI * 2;
        e.radius = 0;
        e.radiusDir = 1;
      }
    } else {
      e.cx += e.kx * dt;
      e.cy += e.ky * dt;
      e.angle += T.ORBITER_ANGULAR_SPEED * dt;
      e.radius += e.radiusDir * T.ORBITER_RADIUS_SPEED * dt;
      if (e.radius >= T.ORBITER_MAX_RADIUS) {
        e.radius = T.ORBITER_MAX_RADIUS;
        e.radiusDir = -1;
      } else if (e.radius <= 0) {
        e.phase = 'drift';
        e.driftSpeed = T.ORBITER_SPEED;
      }
      e.x = e.cx + Math.cos(e.angle) * e.radius;
      e.y = e.cy + Math.sin(e.angle) * e.radius;
    }
  }

  // An orbiting orbiter's position is recomputed from its anchor, so a shift
  // must move the anchor along with it.
  function orbiterShift(e, dx, dy) {
    if (e.phase === 'orbit') {
      e.cx += dx;
      e.cy += dy;
    }
  }

  // Everything about an enemy type in one place. `stats` resolves from TUNING
  // at spawn time so console tuning shows up live; `spawnGate` claims a slice
  // of each spawn roll once its delay passes (no gate = the fallback chaser);
  // `splitCount` types break into that many children (`splitChild`, default
  // chaser) instead of paying out.
  // Hooks: `onSpawn` (extra state), `brain` (steering; default seekBall),
  // `onShift` (keep brain state consistent when the enemy is teleported), and
  // `draw` (render decoration — render.js draws the base disc in `color`,
  // then `draw`, and derives split seams from splitCount). Adding a type is
  // one entry here plus its TUNING constants.
  S.ENEMY_TYPES = {
    chaser: {
      color: '#e5484d', // red
      stats: (T) => ({ r: T.ENEMY_RADIUS, hp: T.ENEMY_HP, damage: T.ENEMY_DAMAGE, speed: T.ENEMY_SPEED, coinMult: 1 }),
    },
    // Gated types claim their roll slice in this order (see the spawn-mix
    // notes in tuning.js).
    tank: {
      color: '#b558f6', // purple
      stats: (T) => ({ r: T.TANK_RADIUS, hp: T.TANK_HP, damage: T.TANK_DAMAGE, speed: T.TANK_SPEED, coinMult: T.TANK_COIN_MULT }),
      spawnGate: (T) => ({ delay: T.TANK_SPAWN_DELAY, chance: T.TANK_CHANCE }),
      // Armor ring above 1 HP that breaks off with the first hit.
      draw(ctx, e) {
        if (e.hp <= 1) return;
        ctx.strokeStyle = '#d8b4fe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2);
        ctx.stroke();
      },
    },
    splitter: {
      color: '#f76b15', // orange
      stats: (T) => ({ r: T.SPLITTER_RADIUS, hp: T.SPLITTER_HP, damage: T.SPLITTER_DAMAGE, speed: T.SPLITTER_SPEED, coinMult: 1 }),
      spawnGate: (T) => ({ delay: T.SPLITTER_SPAWN_DELAY, chance: T.SPLITTER_CHANCE }),
      splitCount: 2,
    },
    supersplitter: {
      color: '#ff3300', // red-orange — a splitter, but angrier
      stats: (T) => ({ r: T.SUPER_SPLITTER_RADIUS, hp: T.SUPER_SPLITTER_HP, damage: T.SUPER_SPLITTER_DAMAGE, speed: T.SUPER_SPLITTER_SPEED, coinMult: 1 }),
      spawnGate: (T) => ({ delay: T.SUPER_SPLITTER_SPAWN_DELAY, chance: T.SUPER_SPLITTER_CHANCE }),
      splitCount: 2,
      splitChild: 'splitter',
    },
    orbiter: {
      color: '#e93d82', // pink
      stats: (T) => ({ r: T.ORBITER_RADIUS, hp: T.ORBITER_HP, damage: T.ORBITER_DAMAGE, speed: T.ORBITER_SPEED, coinMult: 1 }),
      spawnGate: (T) => ({ delay: T.ORBITER_SPAWN_DELAY, chance: T.ORBITER_CHANCE }),
      onSpawn(e) {
        e.phase = 'drift'; // 'drift' (creep toward ball) or 'orbit' (spiral)
        e.driftSpeed = e.speed;
      },
      brain: orbiterBrain,
      onShift: orbiterShift,
    },
    runner: {
      color: '#cc9a1f', // dark gold — it's the payday target
      stats: (T) => ({ r: T.RUNNER_RADIUS, hp: T.RUNNER_HP, damage: T.RUNNER_DAMAGE, speed: T.RUNNER_SPEED, coinMult: T.RUNNER_COIN_MULT }),
      spawnGate: (T) => ({ delay: T.RUNNER_SPAWN_DELAY, chance: T.RUNNER_CHANCE }),
      brain: runnerBrain,
    },
  };

  // One roll decides the spawn type: each gated type unlocked by survival
  // time claims its chance slice; whatever's left is a basic chaser.
  function rollType(game) {
    const T = S.TUNING;
    let roll = Math.random();
    for (const type in S.ENEMY_TYPES) {
      const gate = S.ENEMY_TYPES[type].spawnGate;
      if (!gate) continue;
      const { delay, chance } = gate(T);
      if (game.time < delay) continue;
      if (roll < chance) return type;
      roll -= chance;
    }
    return 'chaser';
  }

  function makeEnemy(type, x, y) {
    const def = S.ENEMY_TYPES[type];
    const stats = def.stats(S.TUNING);
    const e = {
      x, y, type,
      kx: 0, ky: 0,
      r: stats.r,
      hp: stats.hp,
      maxHp: stats.hp,
      damage: stats.damage,
      speed: stats.speed,
      coinMult: stats.coinMult,
      flash: 0, // hit-feedback timer when a smash doesn't kill
      invuln: 0, // can't be hurt (or hurt the ball) while this runs down
    };
    if (def.splitCount) {
      e.splitCount = def.splitCount;
      e.splitChild = def.splitChild;
    }
    if (def.onSpawn) def.onSpawn(e);
    return e;
  }

  S.spawnEnemy = function (game) {
    const type = rollType(game);
    const r = S.ENEMY_TYPES[type].stats(S.TUNING).r;
    let x = 0;
    let y = 0;
    // Pick an edge point; re-roll a few times if it's right on top of the ball.
    for (let attempt = 0; attempt < 5; attempt++) {
      const side = Math.floor(Math.random() * 4);
      const t = Math.random();
      if (side === 0) { x = t * game.width; y = r; }
      else if (side === 1) { x = t * game.width; y = game.height - r; }
      else if (side === 2) { x = r; y = t * game.height; }
      else { x = game.width - r; y = t * game.height; }
      if (Math.hypot(x - game.ball.x, y - game.ball.y) > S.TUNING.SPAWN_MIN_BALL_DIST) break;
    }
    game.enemies.push(makeEnemy(type, x, y));
  };

  // A dead splitter breaks into its children (two chasers; a super-splitter
  // breaks into two regular splitters) flung evenly apart, briefly invincible
  // so the smash that freed them can't kill them in the same instant.
  function splitEnemy(game, e, count) {
    const T = S.TUNING;
    const base = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = base + (i / count) * Math.PI * 2;
      const child = makeEnemy(e.splitChild || 'chaser', e.x + Math.cos(a) * e.r * 0.6, e.y + Math.sin(a) * e.r * 0.6);
      child.kx = Math.cos(a) * T.SPLIT_FLING;
      child.ky = Math.sin(a) * T.SPLIT_FLING;
      child.invuln = T.SPLIT_INVULN;
      game.enemies.push(child);
    }
  }

  // Move an enemy without breaking its brain — the type's onShift hook keeps
  // any derived state (an orbiter's anchor) in step.
  function shiftEnemy(e, dx, dy) {
    e.x += dx;
    e.y += dy;
    const onShift = S.ENEMY_TYPES[e.type].onShift;
    if (onShift) onShift(e, dx, dy);
  }

  // Enemies don't stack: overlapping pairs separate and trade a light bounce
  // through the same decaying knockback a hit applies.
  function resolveEnemyOverlaps(game) {
    const T = S.TUNING;
    const list = game.enemies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const overlap = a.r + b.r - d;
        if (overlap <= 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        shiftEnemy(a, -nx * overlap / 2, -ny * overlap / 2);
        shiftEnemy(b, nx * overlap / 2, ny * overlap / 2);
        a.kx -= nx * T.ENEMY_BOUNCE;
        a.ky -= ny * T.ENEMY_BOUNCE;
        b.kx += nx * T.ENEMY_BOUNCE;
        b.ky += ny * T.ENEMY_BOUNCE;
      }
    }
  }

  // Radial shockwave: shove every enemy within `radius` of (x, y) away,
  // fading linearly with distance, via the same decaying knockback a hit
  // applies. Pass Infinity for a full-strength, arena-wide blast.
  S.pushEnemies = function (game, x, y, speed, radius) {
    for (const e of game.enemies) {
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d >= radius) continue;
      const fade = 1 - d / radius; // d/Infinity is 0, so Infinity → full force
      e.kx += (dx / d) * speed * fade;
      e.ky += (dy / d) * speed * fade;
    }
  };

  // Closest live enemy to (x, y), or null. Used by the TOP SPEED special's
  // homing bend.
  S.nearestEnemy = function (game, x, y) {
    let best = null;
    let bestD = Infinity;
    for (const e of game.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };

  // Pop a dead enemy: ring animation, shockwave to nearby enemies and
  // pickups (before this kill's own coins drop, so they only get their burst
  // scatter), splitter split after the shockwave (so the children only get
  // their own opposing fling), coin drop at the combo at the moment of the
  // kill, health-drop roll, and (for untethered kills) the combo bump.
  // Splitters drop nothing themselves — their children pay out instead.
  function popEnemy(game, e, bash, bumpCombo) {
    const T = S.TUNING;
    game.pops.push({ x: e.x, y: e.y, r: e.r, t: 0 });
    const push = T.ENEMY_POP_PUSH * (bash ? T.BASH_POP_PUSH : 1);
    S.pushEnemies(game, e.x, e.y, push, T.ENEMY_POP_PUSH_RADIUS);
    S.pushCoins(game, e.x, e.y, push, T.ENEMY_POP_PUSH_RADIUS);
    if (e.splitCount) {
      splitEnemy(game, e, e.splitCount);
    } else {
      S.spawnCoinBurst(game, e.x, e.y, e.coinMult);
      if (Math.random() < T.HEALTH_DROP_CHANCE) S.spawnHealthPickup(game, e.x, e.y);
    }
    if (bumpCombo) S.bumpCombo(game);
  }

  // DAMAGE special: a smashed enemy's pop splash-damages the live enemies
  // inside its push radius; deaths pop normally (coins, combo) but don't
  // explode in turn — only enemies the player actually hits explode.
  // Corpses are flagged `dead` and swept at the end of updateEnemies.
  function explodePop(game, e) {
    const T = S.TUNING;
    for (const o of game.enemies) {
      if (o.dead || o.invuln > 0) continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) >= T.ENEMY_POP_PUSH_RADIUS) continue;
      o.hp -= T.POP_EXPLODE_DAMAGE;
      if (o.hp <= 0) {
        o.dead = true;
        popEnemy(game, o, false, true);
      } else {
        o.flash = T.HIT_FLASH_DURATION;
      }
    }
  }

  // Resolve a fast hit on an enemy — shared by body smashes and weapon hits.
  // nx/ny is the unit normal from the enemy toward the contact point. The
  // enemy takes the player's damage (speed-scaled once MOMENTUM is picked);
  // the ball bounces off along the normal (same shape as the damage
  // knockback) keeping most of its speed either way. Bashing — damage past
  // BASH_HP_FACTOR × max HP — plows through instead (deflected but never
  // bounced backwards) and pops with BASH_POP_PUSH × force. opts:
  //   dmgBonus     extra damage on top of smashDamage (weapon hits)
  //   bashOverride force a bash regardless of the damage threshold
  //   knockMult    × KNOCKBACK_SPEED on a surviving enemy
  //   ax/ay/ar     separation anchor a survivor is pushed flush against
  //                (defaults to the ball; weapons pass their contact point)
  S.resolveSmash = function (game, e, nx, ny, tethered, opts = {}) {
    const T = S.TUNING;
    const b = game.ball;
    if (tethered) game.combo = 1;
    const dmg = S.smashDamage(game) + (opts.dmgBonus || 0);
    // MOMENTUM special: bashing comes easier at top speed.
    const bashFactor = game.stats.bashEasy && S.atMaxSpeed(game)
      ? T.MOMENTUM_BASH_HP_FACTOR : T.BASH_HP_FACTOR;
    const bash = opts.bashOverride || dmg > e.maxHp * bashFactor;
    e.hp -= dmg;
    const killed = e.hp <= 0;
    if (killed) {
      e.dead = true;
      popEnemy(game, e, bash, !tethered);
      if (game.stats.popExplode) explodePop(game, e);
    } else {
      // Armor absorbed the hit: flash, knock the enemy back, and separate
      // so the next physics step doesn't land a second hit. No combo —
      // that only counts kills.
      const knock = T.KNOCKBACK_SPEED * (opts.knockMult || 1);
      const ax = opts.ax !== undefined ? opts.ax : b.x;
      const ay = opts.ay !== undefined ? opts.ay : b.y;
      const ar = opts.ar !== undefined ? opts.ar : b.r;
      e.flash = T.HIT_FLASH_DURATION;
      e.kx = -nx * knock;
      e.ky = -ny * knock;
      e.x = ax - nx * (ar + e.r);
      e.y = ay - ny * (ar + e.r);
    }
    // KILL SURGE: pops feed speed back into the ball (capped next step);
    // its special pays out on every smash, kill or not. A bash plows
    // through: it deflects toward the bounce normal but never backwards
    // — clamped to BASH_DEFLECT_MAX off the incoming heading, so the
    // ball always keeps forward momentum. Otherwise it bounces off along
    // the normal.
    const surge = killed || game.stats.surgeEverySmash ? game.stats.killBoost : 0;
    const speed = S.ballSpeed(b) * T.KILL_SPEED_KEEP + surge;
    if (bash) {
      const heading = Math.atan2(b.vy, b.vx);
      let dev = Math.atan2(ny, nx) - heading;
      dev = Math.atan2(Math.sin(dev), Math.cos(dev)); // wrap to ±180°
      const max = T.BASH_DEFLECT_MAX * Math.PI / 180;
      const out = heading + Math.max(-max, Math.min(max, dev));
      b.vx = Math.cos(out) * speed;
      b.vy = Math.sin(out) * speed;
    } else {
      b.vx = nx * speed;
      b.vy = ny * speed;
    }
  };

  S.updateEnemies = function (game, dt) {
    const T = S.TUNING;

    // Advance death-pop animations.
    for (let i = game.pops.length - 1; i >= 0; i--) {
      const p = game.pops[i];
      p.t += dt;
      if (p.t >= T.POP_DURATION) game.pops.splice(i, 1);
    }

    // Spawn rate climbs exponentially: it doubles every SPAWN_DOUBLE_TIME of
    // survival. Paused while the player's death pop plays out.
    if (game.state === S.STATE.PLAYING) {
      const interval = T.SPAWN_INTERVAL_START * Math.pow(2, -game.time / T.SPAWN_DOUBLE_TIME);
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        S.spawnEnemy(game);
        game.spawnTimer = interval;
      }
    }

    // Weapon pass first: kills are flagged dead and survivors are knocked
    // out of body range, so the body-collision loop below can't land a
    // second hit the same step.
    if (game.state === S.STATE.PLAYING) S.updateWeaponCollisions(game);

    const b = game.ball;
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];

      // Killed earlier this tick by a pop chain — already popped, just waits
      // for the sweep below.
      if (e.dead) continue;

      if (e.flash > 0) e.flash -= dt;
      if (e.invuln > 0) e.invuln -= dt;

      // Per-type steering brain (default: seek the ball), plus decaying
      // knockback integrated by each brain.
      const decay = Math.exp(-4 * dt);
      e.kx *= decay;
      e.ky *= decay;
      (S.ENEMY_TYPES[e.type].brain || seekBall)(game, e, dt);

      // Collision with the ball (skipped while the death pop plays out —
      // the ball is already gone — and while a fresh split child's
      // invincibility runs down: it can't be hurt or deal a hit).
      if (game.state !== S.STATE.PLAYING || e.invuln > 0) continue;
      const gap = Math.hypot(b.x - e.x, b.y - e.y);
      if (gap >= b.r + e.r) continue;
      const nx = (b.x - e.x) / (gap || 1); // unit normal from enemy to ball
      const ny = (b.y - e.y) / (gap || 1);

      // Bumping an enemy snaps the tether. A fast ball smashes whether or
      // not it was tethered, but a tethered bump costs the combo: it resets
      // to ×1 (before the coins drop, so they pay out at ×1). The grab
      // already broke it, but fast wall bounces while held rebuild it.
      const fast = S.ballSpeed(b) > T.SPEED_THRESHOLD;
      const tethered = game.tether.active;
      if (tethered) S.releaseTether(game);

      if (fast) {
        S.resolveSmash(game, e, nx, ny, tethered);
      } else if (b.iframes <= 0) {
        S.damageBall(game, e, nx, ny);
        if (game.state !== S.STATE.PLAYING) break; // dead — still sweep corpses below
      } else {
        // During i-frames: just keep the enemy from overlapping the ball
        // (anchor-aware so the push sticks on an orbiting orbiter).
        shiftEnemy(e, b.x - nx * (b.r + e.r) - e.x, b.y - ny * (b.r + e.r) - e.y);
      }
    }

    // Sweep this tick's corpses in one pass — the loop and the pop chains
    // only flag them, so mid-iteration kills can't corrupt the indices.
    game.enemies = game.enemies.filter((e) => !e.dead);

    resolveEnemyOverlaps(game);
  };
})(Tethered);
