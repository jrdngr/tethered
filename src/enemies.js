// Enemies: edge spawning with a ramping rate and a time-gated type mix
// (chasers, tanks, splitters, super-splitters, orbiters, runners), steering,
// collision outcomes.
window.Tethered = window.Tethered || {};

(function (S) {
  // One roll decides the spawn type: each special unlocked by survival time
  // claims its CHANCE slice; whatever's left is a basic chaser.
  function rollType(game) {
    const T = S.TUNING;
    const specials = [
      ['tank', T.TANK_SPAWN_DELAY, T.TANK_CHANCE],
      ['splitter', T.SPLITTER_SPAWN_DELAY, T.SPLITTER_CHANCE],
      ['supersplitter', T.SUPER_SPLITTER_SPAWN_DELAY, T.SUPER_SPLITTER_CHANCE],
      ['orbiter', T.ORBITER_SPAWN_DELAY, T.ORBITER_CHANCE],
      ['runner', T.RUNNER_SPAWN_DELAY, T.RUNNER_CHANCE],
    ];
    let roll = Math.random();
    for (const [type, delay, chance] of specials) {
      if (game.time < delay) continue;
      if (roll < chance) return type;
      roll -= chance;
    }
    return 'chaser';
  }

  function makeEnemy(type, x, y) {
    const T = S.TUNING;
    const stats = {
      chaser: { r: T.ENEMY_RADIUS, hp: T.ENEMY_HP, damage: T.ENEMY_DAMAGE, speed: T.ENEMY_SPEED, coinMult: 1 },
      tank: { r: T.TANK_RADIUS, hp: T.TANK_HP, damage: T.TANK_DAMAGE, speed: T.TANK_SPEED, coinMult: T.TANK_COIN_MULT },
      splitter: { r: T.SPLITTER_RADIUS, hp: T.SPLITTER_HP, damage: T.SPLITTER_DAMAGE, speed: T.SPLITTER_SPEED, coinMult: 1 },
      supersplitter: { r: T.SUPER_SPLITTER_RADIUS, hp: T.SUPER_SPLITTER_HP, damage: T.SUPER_SPLITTER_DAMAGE, speed: T.SUPER_SPLITTER_SPEED, coinMult: 1 },
      orbiter: { r: T.ORBITER_RADIUS, hp: T.ENEMY_HP, damage: T.ORBITER_DAMAGE, speed: T.ORBITER_SPEED, coinMult: 1 },
      runner: { r: T.RUNNER_RADIUS, hp: T.ENEMY_HP, damage: T.RUNNER_DAMAGE, speed: T.RUNNER_SPEED, coinMult: T.RUNNER_COIN_MULT },
    }[type];
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
    if (type === 'orbiter') {
      e.phase = 'drift'; // 'drift' (creep toward ball) or 'orbit' (spiral)
      e.driftSpeed = stats.speed;
    }
    return e;
  }

  S.spawnEnemy = function (game) {
    const type = rollType(game);
    const r = makeEnemy(type, 0, 0).r;
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

  // A dead splitter breaks into basic chasers (two; four for a
  // super-splitter) flung evenly apart, briefly invincible so the smash that
  // freed them can't kill them in the same instant.
  function splitEnemy(game, e, count) {
    const T = S.TUNING;
    const base = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = base + (i / count) * Math.PI * 2;
      const child = makeEnemy('chaser', e.x + Math.cos(a) * e.r * 0.6, e.y + Math.sin(a) * e.r * 0.6);
      child.kx = Math.cos(a) * T.SPLIT_FLING;
      child.ky = Math.sin(a) * T.SPLIT_FLING;
      child.invuln = T.SPLIT_INVULN;
      game.enemies.push(child);
    }
  }

  // Orbiter brain. Drift: creep toward the ball, bleeding speed. Stalled:
  // anchor in place and spiral out to max radius, close back in, then drift
  // again. Knockback shoves the anchor while orbiting.
  function updateOrbiter(game, e, dt) {
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

  // Move an enemy without breaking its brain: an orbiting orbiter's anchor
  // shifts along with it (its position is recomputed from the anchor).
  function shiftEnemy(e, dx, dy) {
    e.x += dx;
    e.y += dy;
    if (e.type === 'orbiter' && e.phase === 'orbit') {
      e.cx += dx;
      e.cy += dy;
    }
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
    if (e.type === 'splitter') {
      splitEnemy(game, e, 2);
    } else if (e.type === 'supersplitter') {
      splitEnemy(game, e, 4);
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

    const b = game.ball;
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];

      // Killed earlier this tick by a pop chain — already popped, just waits
      // for the sweep below.
      if (e.dead) continue;

      if (e.flash > 0) e.flash -= dt;
      if (e.invuln > 0) e.invuln -= dt;

      // Per-type steering, plus decaying knockback. Chasers/tanks/splitters
      // seek the ball; runners do too until the ball gets close, then bolt
      // (pinned inside the arena); orbiters run their creep/spiral brain.
      const decay = Math.exp(-4 * dt);
      e.kx *= decay;
      e.ky *= decay;
      if (e.type === 'orbiter') {
        updateOrbiter(game, e, dt);
      } else {
        const toBallX = b.x - e.x;
        const toBallY = b.y - e.y;
        const dist = Math.hypot(toBallX, toBallY) || 1;
        const seek = e.type === 'runner' && dist < T.RUNNER_FLEE_RADIUS ? -1 : 1;
        e.x += ((toBallX / dist) * e.speed * seek + e.kx) * dt;
        e.y += ((toBallY / dist) * e.speed * seek + e.ky) * dt;
        if (e.type === 'runner') {
          e.x = Math.max(e.r, Math.min(e.x, game.width - e.r));
          e.y = Math.max(e.r, Math.min(e.y, game.height - e.r));
        }
      }

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
        if (tethered) game.combo = 1;
        // Smash: the enemy takes the player's damage (speed-scaled once
        // MOMENTUM is picked); the ball bounces off along the normal (same
        // shape as the damage knockback) keeping most of its speed either way.
        // Bashing — damage past BASH_HP_FACTOR × max HP — plows
        // through instead (deflected but never bounced backwards) and
        // pops with BASH_POP_PUSH × force.
        const dmg = S.smashDamage(game);
        // MOMENTUM special: bashing comes easier at top speed.
        const bashFactor = game.stats.bashEasy && S.atMaxSpeed(game)
          ? T.MOMENTUM_BASH_HP_FACTOR : T.BASH_HP_FACTOR;
        const bash = dmg > e.maxHp * bashFactor;
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
          e.flash = T.HIT_FLASH_DURATION;
          e.kx = -nx * T.KNOCKBACK_SPEED;
          e.ky = -ny * T.KNOCKBACK_SPEED;
          e.x = b.x - nx * (b.r + e.r);
          e.y = b.y - ny * (b.r + e.r);
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
