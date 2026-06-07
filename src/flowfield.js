// Flow field: a breadth-first distance/direction field from the ball's tile
// over walkable floor, so enemies path around walls instead of pressing into
// them. Recomputed only when the ball changes tile (throttled), and only
// over a window around the ball (the awake region), so it stays ~sub-ms.
// 8-connected, but a diagonal step is barred unless both orthogonal tiles
// are floor — enemies never clip a wall corner.
window.Tethered = window.Tethered || {};

(function (S) {
  S.createFlow = function (map) {
    const n = map.tw * map.th;
    return {
      tw: map.tw,
      th: map.th,
      dist: new Int32Array(n),
      dirx: new Int8Array(n), // unit tile step toward the ball (down-gradient)
      diry: new Int8Array(n),
      seen: new Uint32Array(n), // valid where seen === stamp
      stamp: 0,
      qx: new Int32Array(n),
      qy: new Int32Array(n),
      cooldown: 0,
      lastTx: -99999,
      lastTy: -99999,
    };
  };

  const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  function recompute(game) {
    const T = S.TUNING;
    const map = game.map;
    const f = game.flow;
    const tw = f.tw;
    const th = f.th;

    // Source = the ball's tile, snapped to the nearest floor if it's somehow
    // in a wall (border clamp, deep corner).
    let sx = Math.floor(game.ball.x / T.TILE_SIZE);
    let sy = Math.floor(game.ball.y / T.TILE_SIZE);
    if (map.isWall(sx, sy)) {
      const p = S.nearestFloorPoint(map, game.ball.x, game.ball.y);
      sx = Math.floor(p.x / T.TILE_SIZE);
      sy = Math.floor(p.y / T.TILE_SIZE);
    }

    const stamp = ++f.stamp;
    const maxSteps = Math.ceil(T.DEAGGRO_RADIUS / T.TILE_SIZE) + 3;
    const { dist, dirx, diry, seen, qx, qy } = f;
    let head = 0;
    let tail = 0;
    const start = sy * tw + sx;
    seen[start] = stamp;
    dist[start] = 0;
    dirx[start] = 0;
    diry[start] = 0;
    qx[0] = sx;
    qy[0] = sy;
    tail = 1;

    while (head < tail) {
      const x = qx[head];
      const y = qy[head];
      head++;
      const d = dist[y * tw + x];
      if (d >= maxSteps) continue;
      for (let k = 0; k < 8; k++) {
        const dx = DIRS[k][0];
        const dy = DIRS[k][1];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
        if (map.isWall(nx, ny)) continue;
        if (dx && dy && (map.isWall(x + dx, y) || map.isWall(x, y + dy))) continue; // no corner cut
        const ni = ny * tw + nx;
        if (seen[ni] === stamp) continue;
        seen[ni] = stamp;
        dist[ni] = d + 1;
        dirx[ni] = -dx; // point back toward the tile we came from (toward ball)
        diry[ni] = -dy;
        qx[tail] = nx;
        qy[tail] = ny;
        tail++;
      }
    }
  }

  // Recompute when the ball crosses into a new tile and the throttle allows.
  S.updateFlow = function (game, dt) {
    const f = game.flow;
    if (!f) return;
    const T = S.TUNING;
    if (f.cooldown > 0) f.cooldown -= dt;
    const tx = Math.floor(game.ball.x / T.TILE_SIZE);
    const ty = Math.floor(game.ball.y / T.TILE_SIZE);
    if ((tx !== f.lastTx || ty !== f.lastTy) && f.cooldown <= 0) {
      recompute(game);
      f.cooldown = T.FLOW_MIN_INTERVAL;
      f.lastTx = tx;
      f.lastTy = ty;
    }
  };

  // Tile raycast: is the ball in line of sight (within LOS_RANGE, no wall
  // between)? Sampled every half tile — cheap, and only run for awake
  // enemies near the ball.
  function hasLOS(game, e) {
    const T = S.TUNING;
    const map = game.map;
    const dx = game.ball.x - e.x;
    const dy = game.ball.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > T.LOS_RANGE) return false;
    const steps = Math.ceil(dist / (T.TILE_SIZE * 0.5));
    for (let s = 1; s < steps; s++) {
      const x = e.x + (dx * s) / steps;
      const y = e.y + (dy * s) / steps;
      if (map.isWall(Math.floor(x / T.TILE_SIZE), Math.floor(y / T.TILE_SIZE))) return false;
    }
    return true;
  }

  // The unit direction an enemy should travel to reach the ball: straight at
  // it when in sight, else along the flow field, else (outside the field)
  // straight at it as a fallback (the wall pass keeps it on floor).
  S.desiredDir = function (game, e) {
    const T = S.TUNING;
    const bx = game.ball.x;
    const by = game.ball.y;
    if (hasLOS(game, e)) {
      const dx = bx - e.x;
      const dy = by - e.y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: dx / d, y: dy / d };
    }
    const f = game.flow;
    const tx = Math.floor(e.x / T.TILE_SIZE);
    const ty = Math.floor(e.y / T.TILE_SIZE);
    const i = ty * f.tw + tx;
    if (f && f.seen[i] === f.stamp) {
      const dx = f.dirx[i];
      const dy = f.diry[i];
      if (dx || dy) {
        const l = Math.hypot(dx, dy);
        return { x: dx / l, y: dy / l };
      }
    }
    const dx = bx - e.x;
    const dy = by - e.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  };

  // Flee direction for the runner: of the walkable neighbor tiles, the one
  // best pointed away from the ball, nudged toward open space (clearance) so
  // it flows down corridors instead of cornering itself in a dead end.
  S.fleeDir = function (game, e) {
    const T = S.TUNING;
    const map = game.map;
    let ax = e.x - game.ball.x;
    let ay = e.y - game.ball.y;
    const al = Math.hypot(ax, ay) || 1;
    ax /= al; ay /= al;
    const tx = Math.floor(e.x / T.TILE_SIZE);
    const ty = Math.floor(e.y / T.TILE_SIZE);
    let best = null;
    let bestScore = -Infinity;
    for (let k = 0; k < 8; k++) {
      const dx = DIRS[k][0];
      const dy = DIRS[k][1];
      const nx = tx + dx;
      const ny = ty + dy;
      if (map.isWall(nx, ny)) continue;
      if (dx && dy && (map.isWall(tx + dx, ty) || map.isWall(tx, ty + dy))) continue;
      const l = Math.hypot(dx, dy);
      const align = (dx / l) * ax + (dy / l) * ay; // -1..1, away from ball
      const clr = map.clearance[ny * map.tw + nx];
      const score = align + clr * 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = { x: dx / l, y: dy / l };
      }
    }
    return best || { x: ax, y: ay };
  };
})(Tethered);
