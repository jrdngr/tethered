// Ball state, drag, wall bounces, invincibility rule.
window.Tethered = window.Tethered || {};

(function (S) {
  S.createBall = function (x, y) {
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      r: S.TUNING.BALL_RADIUS,
      hp: S.TUNING.MAX_HP,
      iframes: 0,
      shield: false, // one-hit shield from the VITALITY special
      shieldCooldown: 0, // s left before a broken shield can be re-granted
    };
  };

  S.ballSpeed = function (ball) {
    return Math.hypot(ball.vx, ball.vy);
  };

  // "At top speed" for the level-5 specials. Drag dips the speed slightly
  // between cap clamps, so accept anything within a hair of the cap.
  S.atMaxSpeed = function (game) {
    return S.ballSpeed(game.ball) >= game.stats.maxSpeed * S.TUNING.MAX_SPEED_FRACTION;
  };

  S.updateBall = function (game, dt) {
    const T = S.TUNING;
    const b = game.ball;

    // Top-down friction: exponential decay keeps it framerate-independent.
    const decay = Math.exp(-T.BALL_DRAG * dt);
    b.vx *= decay;
    b.vy *= decay;

    // TOP SPEED special: at the cap, bend gently toward the nearest enemy.
    // The cap below re-clamps, so it reads as a homing curve, not a speedup.
    // Suppressed while tethered — it would fight the player's steering.
    if (game.stats.specials.homing && !game.tether.active && S.atMaxSpeed(game)) {
      const e = S.nearestEnemy(game, b.x, b.y);
      if (e) {
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        b.vx += (dx / d) * T.HOMING_ACCEL * dt;
        b.vy += (dy / d) * T.HOMING_ACCEL * dt;
      }
    }

    // Speed cap (upgradable stat).
    const speed = S.ballSpeed(b);
    if (speed > game.stats.maxSpeed) {
      b.vx *= game.stats.maxSpeed / speed;
      b.vy *= game.stats.maxSpeed / speed;
    }

    if (b.iframes > 0) b.iframes -= dt;
    if (b.shieldCooldown > 0) b.shieldCooldown -= dt;

    // Integrate in sub-steps when fast: a capped-out slingshot can cross
    // more than a wall tile's thickness in one 120 Hz step, and the tile
    // test below is discrete. (The wrap sweep still sees the step's net
    // start→end chord via the tether snapshot — a sub-step bounce bending
    // the path mid-step is a known, self-correcting approximation.)
    const rest = game.stats.wallRestitution;
    const preSpeed = S.ballSpeed(b);
    const steps = Math.min(8, Math.max(1, Math.ceil((preSpeed * dt) / (T.TILE_SIZE * 0.4))));
    const sub = dt / steps;
    let bounced = false; // any reflection — sound + ELASTICITY blast
    let hitGeometry = false; // cave walls/obstacles — these earn combo credit
    for (let i = 0; i < steps; i++) {
      b.x += b.vx * sub;
      b.y += b.vy * sub;

      // World-border backstop: clamp + reflect. The map's border band is
      // already wall tiles; this guards the degenerate escapes.
      // Velocity-direction guards prevent re-bouncing while overlapping.
      if (b.x - b.r < 0) {
        b.x = b.r;
        if (b.vx < 0) { b.vx = -b.vx * rest; bounced = true; }
      } else if (b.x + b.r > game.world.w) {
        b.x = game.world.w - b.r;
        if (b.vx > 0) { b.vx = -b.vx * rest; bounced = true; }
      }
      if (b.y - b.r < 0) {
        b.y = b.r;
        if (b.vy < 0) { b.vy = -b.vy * rest; bounced = true; }
      } else if (b.y + b.r > game.world.h) {
        b.y = game.world.h - b.r;
        if (b.vy > 0) { b.vy = -b.vy * rest; bounced = true; }
      }

      // Cave walls bounce like the old interior obstacles — same
      // restitution stat, same combo credit: the dungeon's geometry IS the
      // combo tool, unlike the old arena's outer walls.
      if (game.map && S.collideCircleWalls(game.map, b, rest)) {
        bounced = true;
        hitGeometry = true;
      }
      if (S.collideBallObstacles(game)) {
        bounced = true;
        hitGeometry = true;
      }
    }

    // Bounce juice only for fast bounces — no farming with slow dribbles.
    if (bounced && preSpeed > T.SPEED_THRESHOLD) {
      if (hitGeometry) S.bumpCombo(game);
      S.audio.play('bounce');
      // ELASTICITY special: a fast bounce slams a shockwave into nearby
      // enemies (the same wave the TAIL special fires).
      if (game.stats.specials.bounceBlast) {
        S.geom.radialPush(game.enemies, b.x, b.y, T.ENEMY_POP_PUSH, T.ENEMY_POP_PUSH_RADIUS, 'kx', 'ky');
      }
    }
  };
})(Tethered);
