// Elastic spring tether: anchor is the cursor while the mouse is held.
// The rope wraps around enemy centers like a rope over pegs: the path runs
// mouse -> wrap pivots -> ball. Pivots are pure pegs (tension never moves
// them), the spring acts on total path length, and the ball only feels its
// own segment — uniform tension over frictionless pegs, so no per-wrap rest
// length bookkeeping is needed.
window.Tethered = window.Tethered || {};

(function (S) {
  // The tether's full shape: spring state plus the previous-step sweep
  // snapshot (pmx/pmy = mouse, pbx/pby = ball) that wrap detection compares
  // against.
  S.createTether = function () {
    return { active: false, restLength: 0, stretch: 0, wraps: [], pmx: 0, pmy: 0, pbx: 0, pby: 0 };
  };

  S.tryGrab = function (game) {
    const T = S.TUNING;
    const b = game.ball;
    const m = game.mouse;
    const d = Math.hypot(m.x - b.x, m.y - b.y);
    if (d <= b.r + T.GRAB_RADIUS) {
      game.combo = 1; // grabbing the ball breaks the combo
      const tether = game.tether;
      tether.active = true;
      tether.restLength = Math.min(d, T.ROPE_MAX_REST);
      tether.stretch = 0;
      tether.wraps.length = 0;
      // Seed the sweep snapshot so the first step compares against now.
      tether.pmx = m.x;
      tether.pmy = m.y;
      tether.pbx = b.x;
      tether.pby = b.y;
    }
  };

  // Releasing pays the stored tension back: a stretched release adds a launch
  // impulse along the ball's own segment (toward its pivot), and every wrap
  // multiplies it — the rope reads as a drawn bow. Impulse is linear in
  // stretch (not the spring-energy form): more predictable to learn, and the
  // codebase never computes spring PE anyway. The speed cap and the swept
  // ball collision both absorb the spike, so no tunneling risk. Applied
  // before triggerWeapons, so a hard sling arms the weapons by itself.
  S.releaseTether = function (game) {
    const T = S.TUNING;
    const tether = game.tether;
    if (tether.active && tether.stretch > 0) {
      const b = game.ball;
      const pivot = tether.wraps.length ? tether.wraps[tether.wraps.length - 1].e : game.mouse;
      const dx = pivot.x - b.x;
      const dy = pivot.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        const impulse = T.SLINGSHOT_IMPULSE_K * tether.stretch *
          (1 + tether.wraps.length * T.SLINGSHOT_WRAP_BONUS);
        b.vx += (dx / d) * impulse;
        b.vy += (dy / d) * impulse;
      }
    }
    tether.active = false;
    tether.stretch = 0;
    tether.wraps.length = 0;
    S.triggerWeapons(game); // every release while fast (re)arms the weapons
  };

  function cross(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  // The pivot path as points carrying current and previous-step positions.
  // Wrap detection compares the two: a one-step-lagged sweep test that
  // brackets every position mutation (ball integration, enemy AI, knockback,
  // cursor motion) without instrumenting the movers, because updateTether
  // runs first in the physics step.
  // One path array and point pool, mutated in place — buildPath runs up to
  // 3×/step in the hot loop and the rope caps at ROPE_MAX_WRAPS pivots, so
  // there's nothing worth reallocating.
  const path = [];
  const pathPool = [];
  function pathPoint(i, x, y, px, py) {
    const p = pathPool[i] || (pathPool[i] = { x: 0, y: 0, px: 0, py: 0 });
    p.x = x; p.y = y; p.px = px; p.py = py;
    return p;
  }
  function buildPath(game) {
    const tether = game.tether;
    path.length = 0;
    path.push(pathPoint(0, game.mouse.x, game.mouse.y, tether.pmx, tether.pmy));
    for (const w of tether.wraps) path.push(pathPoint(path.length, w.e.x, w.e.y, w.e._px, w.e._py));
    path.push(pathPoint(path.length, game.ball.x, game.ball.y, tether.pbx, tether.pby));
    return path;
  }

  // Bend orientation at pivot E between path neighbors A and B. A wrap holds
  // while this keeps the sign it had at insertion; a flip means the rope has
  // straightened back across the pivot.
  function bendSign(A, E, B) {
    return Math.sign(cross(E.x - A.x, E.y - A.y, B.x - E.x, B.y - E.y));
  }

  S.updateTether = function (game, dt) {
    const tether = game.tether;
    if (tether.active) updateActiveTether(game, dt);

    // Snapshot for next step's sweep tests — stamped even while untethered so
    // a fresh grab never compares against stale positions. Enemies spawned
    // this step get theirs here and become wrap-eligible next step.
    tether.pmx = game.mouse.x;
    tether.pmy = game.mouse.y;
    tether.pbx = game.ball.x;
    tether.pby = game.ball.y;
    for (const e of game.enemies) {
      e._px = e.x;
      e._py = e.y;
    }
  };

  function updateActiveTether(game, dt) {
    const T = S.TUNING;
    const tether = game.tether;
    const wraps = tether.wraps;
    const b = game.ball;

    // Drop pivots whose enemy died: the rope rejoins its neighbors straight.
    for (let i = wraps.length - 1; i >= 0; i--) {
      if (wraps[i].e.dead || !game.enemies.includes(wraps[i].e)) wraps.splice(i, 1);
    }

    // Unwrap any pivot the rope has straightened back across. Any pivot can
    // release, not just the ball-side one, since wraps form mid-rope too.
    let path = buildPath(game);
    for (let i = wraps.length - 1; i >= 0; i--) {
      if (bendSign(path[i], wraps[i].e, path[i + 2]) * wraps[i].wind < 0) {
        wraps.splice(i, 1);
        path = buildPath(game); // neighbors changed
      }
    }

    // Detect new wraps: an enemy center whose side of a segment flipped since
    // last step was swept over by the rope and becomes a pivot there.
    const found = [];
    for (let i = 0; i + 1 < path.length; i++) {
      const A = path[i];
      const B = path[i + 1];
      const sx = B.x - A.x;
      const sy = B.y - A.y;
      const segLen = Math.hypot(sx, sy);
      if (segLen < T.ROPE_MIN_SEG) continue;
      // Broadphase: only enemies near the swept segment can have crossed it.
      // The box spans this step's and last step's endpoints (a segment can
      // jump arbitrarily far in one frame — the mouse teleports); one cell
      // of margin covers an enemy's own motion since its sweep stamp.
      const m = T.GRID_CELL;
      const candidates = S.grid.queryRect(
        Math.min(A.x, A.px, B.x, B.px) - m, Math.min(A.y, A.py, B.y, B.py) - m,
        Math.max(A.x, A.px, B.x, B.px) + m, Math.max(A.y, A.py, B.y, B.py) + m);
      for (const e of candidates) {
        if (e._px === undefined) continue; // spawned this step: no sweep yet
        // Skip the segment's own endpoints (wraps[i-1] and wraps[i] flank segment i).
        if ((i > 0 && wraps[i - 1].e === e) || (i < wraps.length && wraps[i].e === e)) continue;
        const sNow = cross(sx, sy, e.x - A.x, e.y - A.y);
        const sPrev = cross(B.px - A.px, B.py - A.py, e._px - A.px, e._py - A.py);
        if (sPrev * sNow >= 0) continue; // no strict side flip (collinear never wraps)
        // The crossing must land in the segment interior — at an endpoint it's
        // a pass-by of the ball or anchor, not a wrap.
        const t = ((e.x - A.x) * sx + (e.y - A.y) * sy) / (segLen * segLen);
        if (t <= T.WRAP_CROSS_EPS || t >= 1 - T.WRAP_CROSS_EPS) continue;
        // Reject pivots that would create near-zero segments (anti-chatter).
        if (Math.hypot(e.x - A.x, e.y - A.y) < T.ROPE_MIN_SEG) continue;
        if (Math.hypot(e.x - B.x, e.y - B.y) < T.ROPE_MIN_SEG) continue;
        found.push({ seg: i, t, e, wind: bendSign(A, e, B) });
      }
    }
    if (found.length) {
      // Insert in path order; a pivot on segment i lands at wraps index i.
      found.sort((a, b2) => a.seg - b2.seg || a.t - b2.t);
      const used = new Set();
      let offset = 0;
      for (const f of found) {
        if (wraps.length >= T.ROPE_MAX_WRAPS) break;
        if (used.has(f.e)) continue;
        used.add(f.e);
        wraps.splice(f.seg + offset, 0, { e: f.e, wind: f.wind });
        offset++;
      }
      path = buildPath(game);
    }

    // Spring on the total path length; the ball only feels its own segment.
    let totalLen = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      totalLen += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    }
    const stretch = totalLen - tether.restLength;
    tether.stretch = Math.max(stretch, 0);
    if (stretch <= 0) return; // a rope can't push

    const last = path[path.length - 2]; // pivot nearest the ball (or the cursor)
    const dx = last.x - b.x;
    const dy = last.y - b.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) return;

    // Unit vector from ball toward its pivot.
    const nx = dx / segLen;
    const ny = dy / segLen;

    // Spring pulls along the ball's segment; damping resists radial motion.
    const vAlong = b.vx * nx + b.vy * ny; // ball velocity toward its pivot
    const accel = T.ROPE_K * stretch - T.ROPE_DAMPING * vAlong;
    b.vx += accel * nx * dt;
    b.vy += accel * ny * dt;
  }
})(Tethered);
