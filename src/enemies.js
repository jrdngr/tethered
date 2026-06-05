// Chaser enemies: edge spawning with a ramping rate, seek the ball, collision outcomes.
window.Swangin = window.Swangin || {};

(function (S) {
  S.spawnEnemy = function (game) {
    const T = S.TUNING;
    const r = T.ENEMY_RADIUS;
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
    game.enemies.push({ x, y, r, kx: 0, ky: 0 });
  };

  S.updateEnemies = function (game, dt) {
    const T = S.TUNING;

    // Advance death-pop animations.
    for (let i = game.pops.length - 1; i >= 0; i--) {
      const p = game.pops[i];
      p.t += dt;
      if (p.t >= T.POP_DURATION) game.pops.splice(i, 1);
    }

    // Spawn rate ramps from START down to MIN over SPAWN_RAMP_TIME of survival.
    const ramp = Math.min(game.time / T.SPAWN_RAMP_TIME, 1);
    const interval = T.SPAWN_INTERVAL_START + (T.SPAWN_INTERVAL_MIN - T.SPAWN_INTERVAL_START) * ramp;
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      S.spawnEnemy(game);
      game.spawnTimer = interval;
    }

    const b = game.ball;
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];

      // Seek the ball, plus decaying knockback.
      const toBallX = b.x - e.x;
      const toBallY = b.y - e.y;
      const dist = Math.hypot(toBallX, toBallY) || 1;
      const decay = Math.exp(-4 * dt);
      e.kx *= decay;
      e.ky *= decay;
      e.x += ((toBallX / dist) * T.ENEMY_SPEED + e.kx) * dt;
      e.y += ((toBallY / dist) * T.ENEMY_SPEED + e.ky) * dt;

      // Collision with the ball.
      const gap = Math.hypot(b.x - e.x, b.y - e.y);
      if (gap >= b.r + e.r) continue;
      const nx = (b.x - e.x) / (gap || 1); // unit normal from enemy to ball
      const ny = (b.y - e.y) / (gap || 1);

      if (S.ballInvincible(game)) {
        // Smash: enemy dies, ball bounces off along the normal (same shape as
        // the damage knockback) keeping most of its speed.
        game.enemies.splice(i, 1);
        game.pops.push({ x: e.x, y: e.y, r: e.r, t: 0 });
        S.registerKill(game);
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
})(Swangin);
