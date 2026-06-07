// Interior obstacles: static shapes the ball bounces off (with the walls'
// combo credit and ELASTICITY restitution) and the rope can wrap — arena
// geometry as slingshot anchor and combo tool, not mere walls. Layouts are
// hand-placed in TUNING at fractional arena positions; one layout per run,
// cycling across runs.
window.Tethered = window.Tethered || {};

(function (S) {
  let nextLayout = 0; // cycles one layout per run; module-level so it survives resets

  // A wrap peg: a static pivot circle updateActiveTether can hold exactly
  // like an enemy. It carries its own (never-moving) sweep snapshot;
  // `obstacle` exempts it from the dead-enemy pivot drop and the wrap drag.
  // `r` is the real wrap radius the rope's tangents and contact arcs hug.
  function peg(x, y, r) {
    return { x, y, _px: x, _py: y, r, obstacle: true };
  }

  // (Re)derive world positions from the layout's arena fractions — run at
  // reset and again on resize, so obstacles track the arena.
  S.layoutObstacles = function (game) {
    const defs = S.TUNING.OBSTACLE_LAYOUTS[game.obstacleLayout] || [];
    game.obstacles = defs.map((d) => {
      const o = { ...d, x: d.fx * game.width, y: d.fy * game.height };
      // The rope hugs pillar edges; blocks wrap at their corners, which act
      // as small rounded posts.
      o.pegs = o.kind === 'circle'
        ? [peg(o.x, o.y, o.r)]
        : [-1, 1].flatMap((sx) => [-1, 1].map((sy) =>
            peg(o.x + sx * o.w / 2, o.y + sy * o.h / 2, S.TUNING.WRAP_RECT_CORNER_R)));
      return o;
    });
  };

  S.cycleObstacles = function (game) {
    game.obstacleLayout = nextLayout++ % S.TUNING.OBSTACLE_LAYOUTS.length;
    S.layoutObstacles(game);
  };

  // Make the pegs wrap-queryable this step — called right after the
  // step-top grid rebuild. Deliberately not re-inserted after the
  // separation rebuild: the pair pass must never see pegs, or it would
  // shove obstacle corners around like enemies.
  S.insertObstaclePegs = function (game) {
    for (const o of game.obstacles) {
      for (const p of o.pegs) S.grid.insert(p);
    }
  };

  // Circle-vs-obstacle overlap, same return shape as geom.circleOverlap:
  // unit normal from the obstacle surface toward the circle center, plus
  // the penetration depth. Null when apart.
  S.obstacleHit = function (o, x, y, r) {
    if (o.kind === 'circle') return S.geom.circleOverlap(o.x, o.y, o.r, x, y, r);
    // Rect: closest point on the (centered) box to the circle center.
    const cx = Math.max(o.x - o.w / 2, Math.min(x, o.x + o.w / 2));
    const cy = Math.max(o.y - o.h / 2, Math.min(y, o.y + o.h / 2));
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= r) return null;
    if (d > 1e-6) return { nx: dx / d, ny: dy / d, overlap: r - d };
    // Center inside the box: push out through the nearest face.
    const faces = [
      { nx: -1, ny: 0, depth: x - (o.x - o.w / 2) },
      { nx: 1, ny: 0, depth: (o.x + o.w / 2) - x },
      { nx: 0, ny: -1, depth: y - (o.y - o.h / 2) },
      { nx: 0, ny: 1, depth: (o.y + o.h / 2) - y },
    ];
    const f = faces.reduce((a, b) => (b.depth < a.depth ? b : a));
    return { nx: f.nx, ny: f.ny, overlap: f.depth + r };
  };

  // Ball vs every obstacle: position correction plus reflection at the wall
  // restitution stat (so ELASTICITY applies, like the real walls). Returns
  // whether anything bounced — the caller folds that into the walls' fast-
  // bounce combo credit.
  S.collideBallObstacles = function (game) {
    const b = game.ball;
    let bounced = false;
    for (const o of game.obstacles) {
      const hit = S.obstacleHit(o, b.x, b.y, b.r);
      if (!hit) continue;
      b.x += hit.nx * hit.overlap;
      b.y += hit.ny * hit.overlap;
      const into = b.vx * hit.nx + b.vy * hit.ny;
      if (into < 0) {
        const rest = game.stats.wallRestitution;
        b.vx -= (1 + rest) * into * hit.nx;
        b.vy -= (1 + rest) * into * hit.ny;
        bounced = true;
      }
    }
    return bounced;
  };
})(Tethered);
