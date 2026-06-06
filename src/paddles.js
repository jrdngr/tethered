// Wall paddles: upgrade-granted rectangles that patrol a screen edge,
// bouncing across its range, and launch the ball to top speed on contact.
window.Tethered = window.Tethered || {};

(function (S) {
  // Edges use the spawn-side convention: 0 top, 1 bottom, 2 left, 3 right.
  const EDGES = [0, 1, 2, 3];

  function edgeLength(game, edge) {
    return edge < 2 ? game.width : game.height;
  }

  // Paddle length along its edge; the PADDLE special doubles every paddle.
  function paddleLen(game) {
    return S.TUNING.PADDLE_LENGTH * (game.stats.paddleWide ? 2 : 1);
  }

  // The PADDLE upgrade: fill empty edges first, then double up (one paddle
  // per level, four max). A second paddle drops into the emptier half of its
  // edge so it doesn't spawn on top of its peer.
  S.addPaddle = function (game) {
    const counts = EDGES.map((e) => game.paddles.filter((p) => p.edge === e).length);
    const fewest = Math.min(...counts);
    const open = EDGES.filter((e) => counts[e] === fewest);
    const edge = open[Math.floor(Math.random() * open.length)];
    const peer = game.paddles.find((p) => p.edge === edge);
    const len = edgeLength(game, edge);
    game.paddles.push({
      edge,
      pos: peer ? (peer.pos < len / 2 ? len * 0.75 : len * 0.25) : len / 2,
      dir: Math.random() < 0.5 ? -1 : 1,
    });
  };

  // The paddle's rectangle, shared by physics and render.
  S.paddleRect = function (game, p) {
    const T = S.TUNING;
    const L = paddleLen(game);
    const K = T.PADDLE_THICKNESS;
    if (p.edge === 0) return { x: p.pos - L / 2, y: 0, w: L, h: K };
    if (p.edge === 1) return { x: p.pos - L / 2, y: game.height - K, w: L, h: K };
    if (p.edge === 2) return { x: 0, y: p.pos - L / 2, w: K, h: L };
    return { x: game.width - K, y: p.pos - L / 2, w: K, h: L };
  };

  S.updatePaddles = function (game, dt) {
    const T = S.TUNING;
    const half = paddleLen(game) / 2;

    // Patrol: slide along the edge, bouncing off its ends. The clamp also
    // herds paddles back in bounds after a window resize.
    for (const p of game.paddles) {
      p.pos += p.dir * T.PADDLE_SPEED * dt;
      const len = edgeLength(game, p.edge);
      if (p.pos < half) { p.pos = half; p.dir = 1; }
      else if (p.pos > len - half) { p.pos = len - half; p.dir = -1; }
    }

    // Paddle pairs sharing an edge bounce off each other: on overlap,
    // separate at the midpoint and send them apart.
    for (const edge of EDGES) {
      const pair = game.paddles.filter((p) => p.edge === edge);
      if (pair.length < 2) continue;
      pair.sort((a, b) => a.pos - b.pos);
      const [lo, hi] = pair;
      if (hi.pos - lo.pos < paddleLen(game)) {
        const mid = (lo.pos + hi.pos) / 2;
        lo.pos = mid - half;
        hi.pos = mid + half;
        lo.dir = -1;
        hi.dir = 1;
      }
    }

    // Ball contact: reflect off the paddle face and launch at the speed cap.
    if (game.state !== S.STATE.PLAYING) return;
    const b = game.ball;
    for (const p of game.paddles) {
      const r = S.paddleRect(game, p);
      // Circle-vs-rect via the closest point on the rect to the ball center.
      const cx = Math.max(r.x, Math.min(b.x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(b.y, r.y + r.h));
      if (Math.hypot(b.x - cx, b.y - cy) >= b.r) continue;

      // Inward arena normal for the paddle's edge.
      const nx = p.edge === 2 ? 1 : p.edge === 3 ? -1 : 0;
      const ny = p.edge === 0 ? 1 : p.edge === 1 ? -1 : 0;

      // Same combo rule as walls: only a fast arrival counts.
      if (S.ballSpeed(b) > T.SPEED_THRESHOLD) S.bumpCombo(game);

      // Reflect the into-paddle velocity component, then scale the whole
      // velocity to top speed (straight inward if the ball was at rest).
      const into = b.vx * nx + b.vy * ny;
      if (into < 0) {
        b.vx -= 2 * into * nx;
        b.vy -= 2 * into * ny;
      }
      const speed = S.ballSpeed(b);
      if (speed > 1) {
        b.vx *= game.stats.maxSpeed / speed;
        b.vy *= game.stats.maxSpeed / speed;
      } else {
        b.vx = nx * game.stats.maxSpeed;
        b.vy = ny * game.stats.maxSpeed;
      }

      // Separate along the normal so the next step doesn't re-hit.
      if (nx) b.x = (nx > 0 ? r.x + r.w : r.x) + nx * b.r;
      if (ny) b.y = (ny > 0 ? r.y + r.h : r.y) + ny * b.r;
    }
  };
})(Tethered);
