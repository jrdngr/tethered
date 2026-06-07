// Elastic spring tether: anchor is the cursor while the mouse is held.
// The rope wraps around pivot circles (enemies, obstacle pegs) the way a
// real rope wraps a post: tangent lines into a contact arc hugging the
// circle's edge. The path runs mouse -> tangent/arc per pivot -> ball.
// Pivots are frictionless (tension is uniform along the rope), the spring
// acts on total path length including arcs — so winding consumes rope and
// raises tension, and that's the natural wrap limit. A pivot releases the
// moment its contact arc shrinks to zero: the rope straightening back
// (e.g. after a wall bounce) unwinds it physically instead of snapping.
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
      // Grabbing is neutral for the combo: steering shouldn't fight scoring.
      // The idle-decay timer keeps running while tethered, so holding the
      // ball is still time pressure.
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
  // impulse along the ball's own segment (toward its tangent contact point,
  // or the cursor when unwrapped). No per-wrap multiplier: winding already
  // consumed rope, so a wrapped rope at the same pose simply carries more
  // stretch. Impulse is linear in stretch (not the spring-energy form): more
  // predictable to learn, and the codebase never computes spring PE anyway.
  // The speed cap and the swept ball collision both absorb the spike, so no
  // tunneling risk. Applied before triggerWeapons, so a hard sling arms the
  // weapons by itself.
  S.releaseTether = function (game) {
    const T = S.TUNING;
    const tether = game.tether;
    if (tether.active && tether.stretch > 0) {
      const b = game.ball;
      const wraps = tether.wraps;
      const last = wraps.length ? wraps[wraps.length - 1] : null;
      const px = last ? last.exitX : game.mouse.x;
      const py = last ? last.exitY : game.mouse.y;
      const dx = px - b.x;
      const dy = py - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        const impulse = T.SLINGSHOT_IMPULSE_K * tether.stretch;
        b.vx += (dx / d) * impulse;
        b.vy += (dy / d) * impulse;
        // Clamp here too (updateBall caps before integrating anyway):
        // nothing — including the tile-collision sub-step count — should
        // ever observe a super-cap velocity, even for one step.
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > game.stats.maxSpeed) {
          b.vx *= game.stats.maxSpeed / sp;
          b.vy *= game.stats.maxSpeed / sp;
        }
      }
    }
    tether.active = false;
    tether.stretch = 0;
    tether.wraps.length = 0;
    S.triggerWeapons(game); // every release while fast (re)arms the weapons
  };

  // Total accumulated contact angle over all pivots — the wrap-kill bonus
  // reads this in half-turn units. Fresh from this step's tether pass.
  S.totalContactAngle = function (tether) {
    let sum = 0;
    for (const w of tether.wraps) sum += w.angle || 0;
    return sum;
  };

  function cross(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  // Tangent contact point on circle (Ox,Oy,r) as seen from point P; `side`
  // (±1) picks which of the two tangents. phi is the contact's bearing from
  // the circle center. When P is inside the circle the tangent degenerates
  // to the surface point nearest P — finite and stable (mouse dragged into
  // a pillar, ball pressed against the pillar it's wrapped on).
  const cpOut = { x: 0, y: 0, phi: 0 }; // hot loop: reused, consume immediately
  function contactPoint(Px, Py, Ox, Oy, r, side) {
    const dx = Px - Ox;
    const dy = Py - Oy;
    const D = Math.hypot(dx, dy);
    let phi;
    if (D <= r + 1e-6) {
      phi = Math.atan2(dy, dx);
    } else {
      const base = Math.atan2(dy, dx); // bearing center -> P
      const beta = Math.acos(Math.max(-1, Math.min(1, r / D)));
      phi = base + side * beta;
    }
    cpOut.x = Ox + r * Math.cos(phi);
    cpOut.y = Oy + r * Math.sin(phi);
    cpOut.phi = phi;
    return cpOut;
  }

  // Contact arc swept from entryPhi to exitPhi in the wind direction,
  // normalized to [0, 2π).
  const TAU = Math.PI * 2;
  function arcAngleFor(entryPhi, exitPhi, wind) {
    let d = (exitPhi - entryPhi) * wind;
    d = ((d % TAU) + TAU) % TAU;
    return d;
  }

  // Walk the rope from anchor to ball, computing each pivot's tangent
  // contact points and integrating its accumulated contact angle. Entry
  // tangents come from the previous pivot's exit point (anchor for the
  // first); exit tangents aim at the next pivot's center (ball for the
  // last) — the standard one-pass approximation, stable here because pivots
  // sit far apart relative to their radii. The angle delta is seam-unwrapped
  // to the nearest half-circle so winding past 2π keeps accumulating instead
  // of snapping back — that's what lets one pivot represent multiple
  // revolutions.
  function recomputePath(game) {
    const T = S.TUNING;
    const wraps = game.tether.wraps;
    let prevX = game.mouse.x;
    let prevY = game.mouse.y;
    for (let i = 0; i < wraps.length; i++) {
      const w = wraps[i];
      const e = w.e;
      const entry = contactPoint(prevX, prevY, e.x, e.y, e.r, w.wind);
      w.entryX = entry.x;
      w.entryY = entry.y;
      w.entryPhi = entry.phi;
      const next = i + 1 < wraps.length ? wraps[i + 1].e : game.ball;
      const exit = contactPoint(next.x, next.y, e.x, e.y, e.r, -w.wind);
      w.exitX = exit.x;
      w.exitY = exit.y;
      w.exitPhi = exit.phi;
      const newBase = arcAngleFor(w.entryPhi, w.exitPhi, w.wind);
      if (w.angle === undefined) {
        // First sighting after insertion: the rope just crossed the surface,
        // so the arc starts near zero and grows from here.
        w.angle = newBase;
      } else {
        let delta = newBase - w.baseArc;
        if (delta > Math.PI) delta -= TAU;
        if (delta < -Math.PI) delta += TAU;
        w.angle = Math.max(0, Math.min(w.angle + delta, T.WRAP_MAX_PIVOT_ANGLE));
      }
      w.baseArc = newBase;
      prevX = w.exitX;
      prevY = w.exitY;
    }
  }

  // The pivot path as center points carrying current and previous-step
  // positions — wrap *detection* still sweeps the center polyline (robust to
  // teleporting endpoints; the half-radius timing difference is sub-frame).
  // Detection compares the two: a one-step-lagged sweep test that brackets
  // every position mutation (ball integration, enemy AI, knockback, cursor
  // motion) without instrumenting the movers, because updateTether runs
  // first in the physics step.
  // One path array and point pool, mutated in place — buildPath runs in the
  // hot loop and the rope caps at WRAP_SAFETY_MAX_PIVOTS pivots, so there's
  // nothing worth reallocating.
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

  // Bend orientation at pivot E between path neighbors A and B — seeds a new
  // pivot's wind (which way the rope hugs the circle) at insertion.
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
    // Obstacle pegs never die, so they hold until the rope unwinds.
    for (let i = wraps.length - 1; i >= 0; i--) {
      const pe = wraps[i].e;
      if (!pe.obstacle && (pe.dead || !game.enemies.includes(pe))) wraps.splice(i, 1);
    }

    // Refresh tangent geometry and accumulated angles, then release any pivot
    // whose contact arc has collapsed — the rope straightening back across it
    // (a wall bounce, the anchor swinging past) unwinds it physically. Any
    // pivot can release, not just the ball-side one, since wraps form
    // mid-rope too. Iterate ball-side inward; each removal changes its
    // neighbors' tangents, so recompute before testing the next.
    recomputePath(game);
    for (let i = wraps.length - 1; i >= 0; i--) {
      if (wraps[i].angle <= T.WRAP_UNWRAP_EPS) {
        wraps.splice(i, 1);
        recomputePath(game);
      }
    }

    // Detect new wraps: a pivot circle whose center's side of a segment
    // flipped since last step was swept over by the rope and the rope now
    // bends around its edge. Pivots inserted here get their tangents and
    // starting arc (near zero, growing) from the recompute below, and face
    // the unwrap test from next step on.
    let cpath = buildPath(game);
    const found = [];
    for (let i = 0; i + 1 < cpath.length; i++) {
      const A = cpath[i];
      const B = cpath[i + 1];
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
        if (wraps.length >= T.WRAP_SAFETY_MAX_PIVOTS) break;
        if (used.has(f.e)) continue;
        used.add(f.e);
        wraps.splice(f.seg + offset, 0, { e: f.e, wind: f.wind });
        offset++;
      }
      recomputePath(game);
    }

    // Spring on the total path length — tangent segments plus contact arcs
    // (accumulated angle, so multi-revolution winding keeps consuming rope).
    // The ball only feels its own segment.
    let totalLen = 0;
    {
      let px = game.mouse.x;
      let py = game.mouse.y;
      for (const w of wraps) {
        totalLen += Math.hypot(w.entryX - px, w.entryY - py) + w.e.r * w.angle;
        px = w.exitX;
        py = w.exitY;
      }
      totalLen += Math.hypot(b.x - px, b.y - py);
    }
    const stretch = totalLen - tether.restLength;
    tether.stretch = Math.max(stretch, 0);
    if (stretch <= 0) return; // a rope can't push

    // The ball's far end: the last pivot's exit contact point, or the cursor.
    const last = wraps.length ? wraps[wraps.length - 1] : null;
    const dx = (last ? last.exitX : game.mouse.x) - b.x;
    const dy = (last ? last.exitY : game.mouse.y) - b.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) return;

    // Unit vector from ball toward its contact point.
    const nx = dx / segLen;
    const ny = dy / segLen;

    // Spring pulls along the ball's segment; damping resists radial motion.
    const vAlong = b.vx * nx + b.vy * ny; // ball velocity toward its pivot
    const accel = T.ROPE_K * stretch - T.ROPE_DAMPING * vAlong;
    b.vx += accel * nx * dt;
    b.vy += accel * ny * dt;

    // Tension drags wrapped live enemies: each rope segment pulls the pivot
    // toward its far end, and summing the two unit tangent directions gives
    // the frictionless-pulley net force — inward bisector with magnitude
    // 2·sin(arc/2) — for free. Written to the decaying knockback channel
    // (kx/ky) the enemy brains already integrate, so it composes with seek
    // and stays self-limiting. Obstacle pegs are static and skip it.
    const tension = T.WRAP_DRAG_K * T.ROPE_K * stretch * dt;
    for (let i = 0; i < wraps.length; i++) {
      const w = wraps[i];
      if (w.e.obstacle) continue;
      if (S.wakeEnemy) S.wakeEnemy(w.e); // wrapped → wake (so it integrates the drag)
      const prev = i > 0 ? wraps[i - 1] : null;
      const next = i + 1 < wraps.length ? wraps[i + 1] : null;
      let ix = (prev ? prev.exitX : game.mouse.x) - w.entryX;
      let iy = (prev ? prev.exitY : game.mouse.y) - w.entryY;
      let ox = (next ? next.entryX : b.x) - w.exitX;
      let oy = (next ? next.entryY : b.y) - w.exitY;
      const il = Math.hypot(ix, iy);
      const ol = Math.hypot(ox, oy);
      if (il > 1e-6) { ix /= il; iy /= il; } else { ix = 0; iy = 0; }
      if (ol > 1e-6) { ox /= ol; oy /= ol; } else { ox = 0; oy = 0; }
      w.e.kx += (ix + ox) * tension;
      w.e.ky += (iy + oy) * tension;
    }
  }
})(Tethered);
