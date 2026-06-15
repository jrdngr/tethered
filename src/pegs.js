// Pegs: static circular obstacles scattered around the arena. The ball bounces
// off them (here), the rope wraps them as pivots (tether.js), and enemies are
// blocked by them (enemies.js). A peg is just a static circle plus the fields
// the rope-wrap detector expects on a pivot:
//   { x, y, r, _px, _py, peg: true, kx: 0, ky: 0 }
// _px/_py is the previous-step sweep snapshot — pegs never move, so it's set
// once to x/y. `peg: true` marks it static so the tether skips the enemy-only
// drag/death handling. kx/ky are inert guards (the drag loop skips pegs).
window.Tethered = window.Tethered || {};

(function (S) {
  // Scatter pegs across the arena. The count comes from the on-screen target:
  // count ≈ PEG_PER_SCREEN × arenaArea / viewportArea, so the density a player
  // sees stays ~1–2 whatever the window size. Points are rejection-sampled off
  // the walls, clear of the ball's start, and spaced from each other.
  S.scatterPegs = function (game) {
    const T = S.TUNING;
    const r = T.PEG_RADIUS;
    const pegs = game.pegs;
    pegs.length = 0;

    const screenArea = Math.max(1, game.width * game.height);
    const arenaArea = game.world.w * game.world.h;
    const count = Math.max(T.PEG_MIN, Math.min(T.PEG_MAX,
      Math.round(T.PEG_PER_SCREEN * arenaArea / screenArea)));

    const pad = r + 60;              // keep pegs off the arena walls
    const gap = r * 3;               // min center spacing between pegs
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = pad + Math.random() * (game.world.w - 2 * pad);
        const y = pad + Math.random() * (game.world.h - 2 * pad);
        if (Math.hypot(x - game.ball.x, y - game.ball.y) < T.WAVE_SPAWN_BALL_CLEARANCE) continue;
        let ok = true;
        for (const p of pegs) {
          if (Math.hypot(x - p.x, y - p.y) < gap) { ok = false; break; }
        }
        if (!ok) continue;
        pegs.push({ x, y, r, _px: x, _py: y, peg: true, kx: 0, ky: 0 });
        break;
      }
    }
  };

  // Bounce the ball off any peg it overlaps: push it back to the surface and
  // reflect its velocity about the contact normal (v' = v − (1+e)(v·n)n), only
  // when it's moving inward. This keeps tangential glide (a glancing hit
  // glances). Pegs are big relative to a step at BALL_MAX_SPEED, so a plain
  // overlap test can't be tunneled. The tether is deliberately NOT released —
  // you keep swinging while you ricochet.
  S.bounceBallOffPegs = function (game) {
    const T = S.TUNING;
    const b = game.ball;
    for (const peg of game.pegs) {
      const hit = S.geom.circleOverlap(peg.x, peg.y, peg.r, b.x, b.y, b.r);
      if (!hit) continue;
      const { nx, ny, overlap } = hit; // normal points peg → ball
      b.x += nx * overlap;
      b.y += ny * overlap;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + T.PEG_RESTITUTION) * vn * nx;
        b.vy -= (1 + T.PEG_RESTITUTION) * vn * ny;
      }
    }
  };
})(Tethered);
