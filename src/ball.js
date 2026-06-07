// Ball state, drag, wall bounces, invincibility rule.
window.Tethered = window.Tethered || {};

(function (S) {
  S.createBall = function (w, h) {
    return {
      x: w / 2,
      y: h / 2,
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

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.iframes > 0) b.iframes -= dt;
    if (b.shieldCooldown > 0) b.shieldCooldown -= dt;

    // Walls: clamp position, reflect velocity with restitution (upgradable
    // stat — ELASTICITY can push it past 1, which is safe: drag and the
    // speed cap dominate between bounces).
    // Velocity-direction guards prevent re-bouncing while still overlapping.
    const rest = game.stats.wallRestitution;
    const preSpeed = S.ballSpeed(b);
    let bounced = false;
    if (b.x - b.r < 0) {
      b.x = b.r;
      if (b.vx < 0) { b.vx = -b.vx * rest; bounced = true; }
    } else if (b.x + b.r > game.width) {
      b.x = game.width - b.r;
      if (b.vx > 0) { b.vx = -b.vx * rest; bounced = true; }
    }
    if (b.y - b.r < 0) {
      b.y = b.r;
      if (b.vy < 0) { b.vy = -b.vy * rest; bounced = true; }
    } else if (b.y + b.r > game.height) {
      b.y = game.height - b.r;
      if (b.vy > 0) { b.vy = -b.vy * rest; bounced = true; }
    }

    // Combo only counts for fast bounces — no farming with slow dribbles.
    if (bounced && preSpeed > T.SPEED_THRESHOLD) {
      S.bumpCombo(game);
      S.audio.play('bounce');
      // ELASTICITY special: a fast bounce slams a shockwave into nearby
      // enemies (the same wave the TAIL special fires).
      if (game.stats.specials.bounceBlast) {
        S.geom.radialPush(game.enemies, b.x, b.y, T.ENEMY_POP_PUSH, T.ENEMY_POP_PUSH_RADIUS, 'kx', 'ky');
      }
    }
  };
})(Tethered);
