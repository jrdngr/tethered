// Interior shapes: freestanding circles generated into every room (never
// corridors). The ball bounces off them (with the walls' combo credit and
// ELASTICITY restitution) and the rope wraps them — each room becomes a
// slingshot playground. A shape is a `parts` list (just one circle for now;
// the part model keeps the door open for more) plus the wrap pegs the tether
// pivots on.
window.Tethered = window.Tethered || {};

(function (S) {
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // A wrap peg: a static pivot circle the tether holds exactly like an enemy.
  // `obstacle` exempts it from the dead-pivot drop and the wrap drag.
  function peg(x, y, r) {
    return { x, y, _px: x, _py: y, r, obstacle: true };
  }

  function circleShape(x, y) {
    const r = rnd(S.TUNING.OBSTACLE_CIRCLE_R[0], S.TUNING.OBSTACLE_CIRCLE_R[1]);
    return { parts: [{ type: 'circle', x, y, r }], pegs: [peg(x, y, r)] };
  }

  // --- Geometry: circle vs one part (geom.circleOverlap return shape) -------
  function partHit(part, x, y, r) {
    if (part.type === 'circle') {
      return S.geom.circleOverlap(part.x, part.y, part.r, x, y, r);
    }
    // Capsule (latent — no shape builds one today): nearest spine point, then
    // a circle test at its radius.
    const cp = S.geom.segClosest(part.x1, part.y1, part.x2, part.y2, x, y);
    return S.geom.circleOverlap(cp.x, cp.y, part.r, x, y, r);
  }

  // Deepest part hit for a whole shape (same return shape as partHit).
  S.obstacleHit = function (o, x, y, r) {
    let best = null;
    for (const part of o.parts) {
      const hit = partHit(part, x, y, r);
      if (hit && (!best || hit.overlap > best.overlap)) best = hit;
    }
    return best;
  };

  function shapeMaxRadius(o) {
    let m = 0;
    for (const part of o.parts) m = Math.max(m, part.r);
    return m;
  }

  // Every part center must sit on floor with PAD to spare, so a shape never
  // pokes into (or across) a wall.
  function onFloor(map, o) {
    const T = S.TUNING;
    const need = shapeMaxRadius(o) + T.OBSTACLE_CLEAR_PAD;
    for (const part of o.parts) {
      const tx = Math.floor(part.x / T.TILE_SIZE);
      const ty = Math.floor(part.y / T.TILE_SIZE);
      if (map.isWall(tx, ty)) return false;
      if (map.clearance[ty * map.tw + tx] * T.TILE_SIZE < need) return false;
    }
    return true;
  }

  // Generate circles into every room (rooms only — never corridors).
  // Placement is room-centered (within half the room radius) and
  // floor-validated, so circles stay in open interiors clear of the corridor
  // mouths, and they steer clear of the player spawn and the exit.
  S.placeObstacles = function (game) {
    const T = S.TUNING;
    const map = game.map;
    game.obstacles = [];
    if (!map || !map.chambers) return;
    const [lo, hi] = T.OBSTACLE_PER_CHAMBER;
    for (const ch of map.chambers) {
      const cx = ch.cx * T.TILE_SIZE;
      const cy = ch.cy * T.TILE_SIZE;
      const rw = ch.r * T.TILE_SIZE;
      const count = lo + Math.floor(Math.random() * (hi - lo + 1));
      for (let k = 0; k < count; k++) {
        for (let tries = 0; tries < 12; tries++) {
          const off = Math.random() * rw * 0.55; // stay well inside the room
          const oa = Math.random() * Math.PI * 2;
          const shape = circleShape(cx + Math.cos(oa) * off, cy + Math.sin(oa) * off);
          if (onFloor(map, shape) && !overlapsExisting(game, shape) && !nearReserved(map, shape)) {
            game.obstacles.push(shape);
            break;
          }
        }
      }
    }
  };

  // Cheap spacing test: a new shape's pegs shouldn't sit inside an existing
  // shape (keeps two circles from fusing into a confusing blob).
  function overlapsExisting(game, shape) {
    for (const o of game.obstacles) {
      for (const p of shape.pegs) {
        if (S.obstacleHit(o, p.x, p.y, p.r)) return true;
      }
    }
    return false;
  }

  // Don't drop a circle on the player's spawn point or the exit.
  function nearReserved(map, shape) {
    return !!(S.obstacleHit(shape, map.spawn.x, map.spawn.y, 70) ||
      S.obstacleHit(shape, map.exit.x, map.exit.y, 70));
  }

  // Make the pegs wrap-queryable this step — called right after the step-top
  // grid rebuild. Not re-inserted after the separation rebuild: the pair pass
  // must never see pegs, or it would shove shape corners around like enemies.
  S.insertObstaclePegs = function (game) {
    for (const o of game.obstacles) {
      for (const p of o.pegs) S.grid.insert(p);
    }
  };

  // Ball vs every shape: position correction plus reflection at the wall
  // restitution stat (so ELASTICITY applies). Returns whether anything
  // bounced — the caller folds that into the fast-bounce combo credit.
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
