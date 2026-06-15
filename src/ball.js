// Ball state, drag, arena-border bounces, invincibility rule.
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

    // Speed cap.
    const speed = S.ballSpeed(b);
    if (speed > T.BALL_MAX_SPEED) {
      b.vx *= T.BALL_MAX_SPEED / speed;
      b.vy *= T.BALL_MAX_SPEED / speed;
    }

    if (b.iframes > 0) b.iframes -= dt;

    const rest = T.WALL_RESTITUTION;
    const preSpeed = S.ballSpeed(b);
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Arena-border bounce: clamp + reflect. Velocity-direction guards prevent
    // re-bouncing while overlapping.
    let bounced = false;
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

    // Bounce sound only for fast bounces — no farming with slow dribbles.
    // Arena-wall bounces earn no combo (only kills build the streak).
    if (bounced && preSpeed > T.SPEED_THRESHOLD) S.audio.play('bounce');
  };
})(Tethered);
