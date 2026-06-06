// Chaser enemies: edge spawning with a ramping rate, seek the ball, collision outcomes.
window.Tethered = window.Tethered || {};

(function (S) {
  S.spawnEnemy = function (game) {
    const T = S.TUNING;
    // Tanks (slower, armored, two base-damage hits) join the spawn mix after
    // TANK_SPAWN_DELAY of survival.
    const tank = game.time >= T.TANK_SPAWN_DELAY && Math.random() < T.TANK_CHANCE;
    const r = tank ? T.TANK_RADIUS : T.ENEMY_RADIUS;
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
      if (Math.hypot(x - game.ball.x, y - game.ball.y) > 150) break;
    }
    game.enemies.push({
      x, y, r,
      kx: 0, ky: 0,
      tank,
      hp: tank ? T.TANK_HP : T.ENEMY_HP,
      damage: tank ? T.TANK_DAMAGE : T.ENEMY_DAMAGE,
      speed: tank ? T.TANK_SPEED : T.ENEMY_SPEED,
      flash: 0, // hit-feedback timer when a smash doesn't kill
    });
  };

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

  S.updateEnemies = function (game, dt) {
    const T = S.TUNING;

    // Advance death-pop animations.
    for (let i = game.pops.length - 1; i >= 0; i--) {
      const p = game.pops[i];
      p.t += dt;
      if (p.t >= T.POP_DURATION) game.pops.splice(i, 1);
    }

    // Spawn rate ramps from START down to MIN over SPAWN_RAMP_TIME of
    // survival. Paused while the player's death pop plays out.
    if (game.state === 'playing') {
      const ramp = Math.min(game.time / T.SPAWN_RAMP_TIME, 1);
      const interval = T.SPAWN_INTERVAL_START + (T.SPAWN_INTERVAL_MIN - T.SPAWN_INTERVAL_START) * ramp;
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        S.spawnEnemy(game);
        game.spawnTimer = interval;
      }
    }

    const b = game.ball;
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];

      if (e.flash > 0) e.flash -= dt;

      // Seek the ball, plus decaying knockback.
      const toBallX = b.x - e.x;
      const toBallY = b.y - e.y;
      const dist = Math.hypot(toBallX, toBallY) || 1;
      const decay = Math.exp(-4 * dt);
      e.kx *= decay;
      e.ky *= decay;
      e.x += ((toBallX / dist) * e.speed + e.kx) * dt;
      e.y += ((toBallY / dist) * e.speed + e.ky) * dt;

      // Collision with the ball (skipped while the death pop plays out —
      // the ball is already gone).
      if (game.state !== 'playing') continue;
      const gap = Math.hypot(b.x - e.x, b.y - e.y);
      if (gap >= b.r + e.r) continue;
      const nx = (b.x - e.x) / (gap || 1); // unit normal from enemy to ball
      const ny = (b.y - e.y) / (gap || 1);

      // Bumping an enemy snaps the tether. A fast ball smashes whether or
      // not it was tethered, but a tethered bump costs the combo: it resets
      // to ×1 (before the coins drop, so they pay out at ×1).
      const fast = S.ballSpeed(b) > T.SPEED_THRESHOLD;
      const tethered = game.tether.active;
      if (tethered) S.releaseTether(game);

      if (fast) {
        if (tethered) game.combo = 1;
        // Smash: the enemy takes the player's damage stat; the ball bounces
        // off along the normal (same shape as the damage knockback) keeping
        // most of its speed either way.
        e.hp -= game.stats.damage;
        if (e.hp <= 0) {
          game.enemies.splice(i, 1);
          game.pops.push({ x: e.x, y: e.y, r: e.r, t: 0 });
          // The pop gives nearby enemies a small shove.
          S.pushEnemies(game, e.x, e.y, T.ENEMY_POP_PUSH, T.ENEMY_POP_PUSH_RADIUS);
          // Coin drop scales with the combo at the moment of the kill.
          S.spawnCoinBurst(game, e.x, e.y, e.tank ? T.TANK_COIN_MULT : 1);
          if (Math.random() < T.HEALTH_DROP_CHANCE) S.spawnHealthPickup(game, e.x, e.y);
          if (!tethered) S.bumpCombo(game);
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
        const speed = S.ballSpeed(b) * T.KILL_SPEED_KEEP;
        b.vx = nx * speed;
        b.vy = ny * speed;
      } else if (b.iframes <= 0) {
        S.damageBall(game, e, nx, ny);
        if (game.state !== 'playing') return;
      } else {
        // During i-frames: just keep the enemy from overlapping the ball.
        e.x = b.x - nx * (b.r + e.r);
        e.y = b.y - ny * (b.r + e.r);
      }
    }
  };
})(Tethered);
