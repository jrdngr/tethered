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
    };
  };

  S.ballSpeed = function (ball) {
    return Math.hypot(ball.vx, ball.vy);
  };

  S.updateBall = function (game, dt) {
    const T = S.TUNING;
    const b = game.ball;

    // Top-down friction: exponential decay keeps it framerate-independent.
    const decay = Math.exp(-T.BALL_DRAG * dt);
    b.vx *= decay;
    b.vy *= decay;

    // Speed cap (upgradable stat).
    const speed = S.ballSpeed(b);
    if (speed > game.stats.maxSpeed) {
      b.vx *= game.stats.maxSpeed / speed;
      b.vy *= game.stats.maxSpeed / speed;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.iframes > 0) b.iframes -= dt;

    // Walls: clamp position, reflect velocity with restitution.
    // Velocity-direction guards prevent re-bouncing while still overlapping.
    const preSpeed = S.ballSpeed(b);
    let bounced = false;
    if (b.x - b.r < 0) {
      b.x = b.r;
      if (b.vx < 0) { b.vx = -b.vx * T.WALL_RESTITUTION; bounced = true; }
    } else if (b.x + b.r > game.width) {
      b.x = game.width - b.r;
      if (b.vx > 0) { b.vx = -b.vx * T.WALL_RESTITUTION; bounced = true; }
    }
    if (b.y - b.r < 0) {
      b.y = b.r;
      if (b.vy < 0) { b.vy = -b.vy * T.WALL_RESTITUTION; bounced = true; }
    } else if (b.y + b.r > game.height) {
      b.y = game.height - b.r;
      if (b.vy > 0) { b.vy = -b.vy * T.WALL_RESTITUTION; bounced = true; }
    }

    // Combo only counts for fast bounces — no farming with slow dribbles.
    if (bounced && preSpeed > T.SPEED_THRESHOLD) S.bumpCombo(game);
  };
})(Tethered);
