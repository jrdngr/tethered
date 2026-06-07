// Interior obstacles: static shapes the ball bounces off (with the walls'
// combo credit and ELASTICITY restitution) and the rope can wrap — arena
// geometry as slingshot anchor and combo tool, not mere walls. Layouts are
// hand-placed in TUNING at fractional arena positions; one random layout per
// run, never the same twice in a row.
window.Tethered = window.Tethered || {};

(function (S) {
  let lastLayout = -1; // previous run's layout; module-level so it survives resets

  // A wrap peg: a static pivot circle updateActiveTether can hold exactly
  // like an enemy. It carries its own (never-moving) sweep snapshot;
  // `obstacle` exempts it from the dead-enemy pivot drop and the wrap drag.
  // `r` is the real wrap radius the rope's tangents and contact arcs hug.
  function peg(x, y, r) {
    return { x, y, _px: x, _py: y, r, obstacle: true };
  }

  // Derive world positions from the layout's fractions, now of the world
  // rect (M6 replaces these hand layouts with generated chamber pillars).
  S.layoutObstacles = function (game) {
    const defs = S.TUNING.OBSTACLE_LAYOUTS[game.obstacleLayout] || [];
    game.obstacles = defs.map((d) => {
      const o = { ...d, x: d.fx * game.world.w, y: d.fy * game.world.h };
      // The rope hugs pillar edges. Rects are capsules (stadium silhouette,
      // end radius = half the short side): one fat peg per rounded end, and
      // the rope's tangent line between them lies exactly on the flat faces
      // — so a wrap visibly hugs the end and slides along the face, instead
      // of pinching at sharp-corner points.
      if (o.kind === 'circle') {
        o.pegs = [peg(o.x, o.y, o.r)];
      } else {
        const R = Math.min(o.w, o.h) / 2;
        const dx = o.w / 2 - R; // one of dx/dy is 0: the caps sit on the long axis
        const dy = o.h / 2 - R;
        o.pegs = dx || dy
          ? [peg(o.x - dx, o.y - dy, R), peg(o.x + dx, o.y + dy, R)]
          : [peg(o.x, o.y, R)];
      }
      return o;
    });
  };

  S.cycleObstacles = function (game) {
    const n = S.TUNING.OBSTACLE_LAYOUTS.length;
    let pick = Math.floor(Math.random() * n);
    if (n > 1 && pick === lastLayout) pick = (pick + 1) % n; // no repeats back-to-back
    game.obstacleLayout = lastLayout = pick;
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
    // Rect: capsule, the same silhouette the rope wraps and the renderer
    // draws. Clamp to the spine (the rect deflated by the end radius), then
    // it's a circle test against the cap radius.
    const R = Math.min(o.w, o.h) / 2;
    const cx = Math.max(o.x - (o.w / 2 - R), Math.min(x, o.x + (o.w / 2 - R)));
    const cy = Math.max(o.y - (o.h / 2 - R), Math.min(y, o.y + (o.h / 2 - R)));
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= r + R) return null;
    if (d > 1e-6) return { nx: dx / d, ny: dy / d, overlap: r + R - d };
    // Center exactly on the spine: push out through the short axis.
    return o.w >= o.h
      ? { nx: 0, ny: y >= o.y ? 1 : -1, overlap: r + R }
      : { nx: x >= o.x ? 1 : -1, ny: 0, overlap: r + R };
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
