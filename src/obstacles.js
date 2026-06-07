// Interior shapes: freestanding circles, pills (capsules), and rounded-L
// pairs generated into chambers (never corridors). The ball bounces off them
// (with the walls' combo credit and ELASTICITY restitution) and the rope
// wraps them — each chamber becomes a slingshot playground. A shape is a
// small set of `parts` (circles and capsules) sharing one collision/wrap/
// draw treatment, plus the wrap pegs the tether pivots on.
window.Tethered = window.Tethered || {};

(function (S) {
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // A wrap peg: a static pivot circle the tether holds exactly like an enemy.
  // `obstacle` exempts it from the dead-pivot drop and the wrap drag.
  function peg(x, y, r) {
    return { x, y, _px: x, _py: y, r, obstacle: true };
  }

  // --- Shape builders: world-space parts + pegs ----------------------------
  function circleShape(x, y) {
    const r = rnd(S.TUNING.OBSTACLE_CIRCLE_R[0], S.TUNING.OBSTACLE_CIRCLE_R[1]);
    return { parts: [{ type: 'circle', x, y, r }], pegs: [peg(x, y, r)] };
  }

  // Pill = one capsule: a segment with a round radius. Pegs at both caps; the
  // rope's tangent line between them lies on the flat sides (hug-and-slide).
  function pillShape(x, y, ang) {
    const T = S.TUNING;
    const r = rnd(T.OBSTACLE_PILL_R[0], T.OBSTACLE_PILL_R[1]);
    const len = rnd(T.OBSTACLE_PILL_LEN[0], T.OBSTACLE_PILL_LEN[1]);
    const half = Math.max(0, len / 2 - r); // cap-center offset along the axis
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const x1 = x - ux * half;
    const y1 = y - uy * half;
    const x2 = x + ux * half;
    const y2 = y + uy * half;
    return {
      parts: [{ type: 'capsule', x1, y1, x2, y2, r }],
      pegs: [peg(x1, y1, r), peg(x2, y2, r)],
    };
  }

  // Rounded L = two capsules meeting at an elbow, arms at a right angle. The
  // outer elbow corner and the two far caps are the wrap pivots.
  function lShape(x, y, ang) {
    const T = S.TUNING;
    const r = rnd(T.OBSTACLE_PILL_R[0], T.OBSTACLE_PILL_R[1]);
    const a1 = rnd(T.OBSTACLE_L_ARM[0], T.OBSTACLE_L_ARM[1]);
    const a2 = rnd(T.OBSTACLE_L_ARM[0], T.OBSTACLE_L_ARM[1]);
    const u1x = Math.cos(ang);
    const u1y = Math.sin(ang);
    const u2x = Math.cos(ang + Math.PI / 2);
    const u2y = Math.sin(ang + Math.PI / 2);
    // Center the bend so the L sits roughly on (x, y).
    const ex = x - (u1x * a1 + u2x * a2) / 3;
    const ey = y - (u1y * a1 + u2y * a2) / 3;
    const p1x = ex + u1x * a1;
    const p1y = ey + u1y * a1;
    const p2x = ex + u2x * a2;
    const p2y = ey + u2y * a2;
    return {
      parts: [
        { type: 'capsule', x1: ex, y1: ey, x2: p1x, y2: p1y, r },
        { type: 'capsule', x1: ex, y1: ey, x2: p2x, y2: p2y, r },
      ],
      pegs: [peg(ex, ey, r), peg(p1x, p1y, r), peg(p2x, p2y, r)],
    };
  }

  const BUILDERS = [circleShape, pillShape, lShape];

  // --- Geometry: circle vs one part (geom.circleOverlap return shape) -------
  function partHit(part, x, y, r) {
    if (part.type === 'circle') {
      return S.geom.circleOverlap(part.x, part.y, part.r, x, y, r);
    }
    // Capsule: nearest point on the spine, then a circle test at its radius.
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

  // The shape's footprint half-extent from a center sample, for placement
  // checks: how far its surface reaches, so we can demand that much floor.
  function shapeMaxRadius(o) {
    let m = 0;
    for (const part of o.parts) m = Math.max(m, part.r);
    return m;
  }

  // Every part-surface sample point must sit on floor with PAD to spare, so a
  // shape never pokes into (or across) a wall. Caps + spine midpoints suffice.
  function onFloor(map, o) {
    const T = S.TUNING;
    const need = shapeMaxRadius(o) + T.OBSTACLE_CLEAR_PAD;
    const pts = [];
    for (const part of o.parts) {
      if (part.type === 'circle') pts.push([part.x, part.y]);
      else {
        pts.push([part.x1, part.y1], [part.x2, part.y2],
          [(part.x1 + part.x2) / 2, (part.y1 + part.y2) / 2]);
      }
    }
    for (const [x, y] of pts) {
      const tx = Math.floor(x / T.TILE_SIZE);
      const ty = Math.floor(y / T.TILE_SIZE);
      if (map.isWall(tx, ty)) return false;
      if (map.clearance[ty * map.tw + tx] * T.TILE_SIZE < need) return false;
    }
    return true;
  }

  // Generate shapes into the chambers (rooms) — never corridors. Placement is
  // chamber-centered (within half the chamber radius) and floor-validated, so
  // shapes stay in open room interiors clear of the corridor mouths.
  S.placeObstacles = function (game) {
    const T = S.TUNING;
    const map = game.map;
    game.obstacles = [];
    if (!map || !map.chambers) return;
    for (const ch of map.chambers) {
      if (ch.reserved === 'spawn') continue; // keep the start room clear
      if (Math.random() > T.OBSTACLE_CHANCE) continue;
      const cx = ch.cx * T.TILE_SIZE;
      const cy = ch.cy * T.TILE_SIZE;
      const rw = ch.r * T.TILE_SIZE;
      const count = 1 + Math.floor(Math.random() * T.OBSTACLE_MAX_PER_CHAMBER);
      for (let k = 0; k < count; k++) {
        for (let tries = 0; tries < 8; tries++) {
          const off = Math.random() * rw * 0.5; // stay well inside the room
          const oa = Math.random() * Math.PI * 2;
          const x = cx + Math.cos(oa) * off;
          const y = cy + Math.sin(oa) * off;
          const build = BUILDERS[Math.floor(Math.random() * BUILDERS.length)];
          const shape = build(x, y, Math.random() * Math.PI * 2);
          if (onFloor(map, shape) && !overlapsExisting(game, shape)) {
            game.obstacles.push(shape);
            break;
          }
        }
      }
    }
  };

  // Cheap spacing test: a new shape's pegs shouldn't sit inside an existing
  // shape (keeps two shapes from fusing into a confusing blob).
  function overlapsExisting(game, shape) {
    for (const o of game.obstacles) {
      for (const p of shape.pegs) {
        if (S.obstacleHit(o, p.x, p.y, p.r)) return true;
      }
    }
    return false;
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
