// Elastic spring tether: anchor is the cursor while the mouse is held.
window.Tethered = window.Tethered || {};

(function (S) {
  S.tryGrab = function (game) {
    const T = S.TUNING;
    const b = game.ball;
    const m = game.mouse;
    const d = Math.hypot(m.x - b.x, m.y - b.y);
    if (d <= b.r + T.GRAB_RADIUS) {
      game.tether.active = true;
      game.tether.restLength = Math.min(d, T.ROPE_MAX_REST);
      game.tether.stretch = 0;
    }
  };

  S.releaseTether = function (game) {
    game.tether.active = false;
    game.tether.stretch = 0;
  };

  S.updateTether = function (game, dt) {
    const tether = game.tether;
    if (!tether.active) return;

    const T = S.TUNING;
    const b = game.ball;
    const m = game.mouse;

    const dx = m.x - b.x;
    const dy = m.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return;

    const stretch = dist - tether.restLength;
    tether.stretch = Math.max(stretch, 0);
    if (stretch <= 0) return; // a rope can't push

    // Unit vector from ball toward the anchor (cursor).
    const nx = dx / dist;
    const ny = dy / dist;

    // Spring pulls toward the anchor; damping resists radial motion.
    const vAlong = b.vx * nx + b.vy * ny; // ball velocity toward anchor
    const accel = T.ROPE_K * stretch - T.ROPE_DAMPING * vAlong;
    b.vx += accel * nx * dt;
    b.vy += accel * ny * dt;
  };
})(Tethered);
