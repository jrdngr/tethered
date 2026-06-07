// Uniform-grid broadphase over enemies, shared by every all-pairs consumer:
// enemy separation, rope wrap detection, and the weapon capsule pass.
// Enemies are bucketed by center point once per pass (rebuild is O(N));
// queries return a candidate superset and leave the exact narrow-phase tests
// to the caller, so behavior matches the brute-force scans — just without
// the O(N²) pair walk. The dev panel's BRUTE FORCE toggle makes every query
// return the full list, for A/B correctness checking.
window.Tethered = window.Tethered || {};

(function (S) {
  const buckets = new Map(); // cell key -> enemy array; buckets persist, contents reset per rebuild
  const used = [];    // buckets filled since the last rebuild, for O(touched) clearing
  const scratch = []; // shared query result — valid only until the next query
  let all = [];       // the rebuilt list, returned whole when brute force is toggled
  let count = 0;      // _gi stamp source: list order, for the separation pass's pair ordering

  // Unique while |cell y| < 4096 cells (≈ ±260k px) — far beyond any arena.
  function key(cx, cy) {
    return cx * 4096 + cy;
  }

  function place(e) {
    const c = S.TUNING.GRID_CELL;
    const k = key(Math.floor(e.x / c), Math.floor(e.y / c));
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = []));
    if (!b.length) used.push(b);
    b.push(e);
  }

  // Gather every bucket in the cell range into scratch. With `seg`, cells
  // farther than `pad` from the segment are culled — one segClosest per cell
  // beats per-enemy distance tests on a long diagonal capsule's AABB.
  function gather(cx0, cy0, cx1, cy1, seg, pad) {
    const c = S.TUNING.GRID_CELL;
    scratch.length = 0;
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const b = buckets.get(key(cx, cy));
        if (!b || !b.length) continue;
        if (seg) {
          const mx = (cx + 0.5) * c;
          const my = (cy + 0.5) * c;
          const p = S.geom.segClosest(seg.x1, seg.y1, seg.x2, seg.y2, mx, my);
          if (Math.hypot(p.x - mx, p.y - my) > pad) continue;
        }
        for (const e of b) scratch.push(e);
      }
    }
    return scratch;
  }

  function bruteForce() {
    return S.dev && S.dev.bruteForce;
  }

  S.grid = {
    maxR: 0, // largest enemy radius seen at rebuild — pads pair-test query radii

    // Re-bucket everything by current center. Runs at the top of the step
    // (for the wrap and weapon queries) and again before separation, once
    // the brains have moved everyone — see main.js's ordering contract.
    rebuild(enemies) {
      for (const b of used) b.length = 0;
      used.length = 0;
      all = enemies;
      count = 0;
      this.maxR = 0;
      for (const e of enemies) {
        e._gi = count++;
        if (e.r > this.maxR) this.maxR = e.r;
        place(e);
      }
    },

    // Make a freshly spawned enemy queryable immediately — rebuilds are
    // per-pass, not per-spawn. The _gi stamp continues list order.
    insert(e) {
      e._gi = count++;
      if (e.r > this.maxR) this.maxR = e.r;
      place(e);
    },

    // Candidates for pair tests around (x, y): everything bucketed in the
    // cells the circle's AABB touches. The caller's exact test filters.
    queryCircle(x, y, r) {
      if (bruteForce()) return all;
      const c = S.TUNING.GRID_CELL;
      return gather(
        Math.floor((x - r) / c), Math.floor((y - r) / c),
        Math.floor((x + r) / c), Math.floor((y + r) / c));
    },

    // Candidates within ~r of the segment: cells in its inflated AABB, far
    // cells culled by center-to-segment distance (+ half a cell diagonal,
    // so any cell the capsule touches survives the cull).
    querySegment(x1, y1, x2, y2, r) {
      if (bruteForce()) return all;
      const c = S.TUNING.GRID_CELL;
      return gather(
        Math.floor((Math.min(x1, x2) - r) / c), Math.floor((Math.min(y1, y2) - r) / c),
        Math.floor((Math.max(x1, x2) + r) / c), Math.floor((Math.max(y1, y2) + r) / c),
        { x1, y1, x2, y2 }, r + c * 0.71);
    },

    // Candidates inside the rect (wrap detection's swept-segment boxes).
    queryRect(x0, y0, x1, y1) {
      if (bruteForce()) return all;
      const c = S.TUNING.GRID_CELL;
      return gather(
        Math.floor(x0 / c), Math.floor(y0 / c),
        Math.floor(x1 / c), Math.floor(y1 / c));
    },
  };
})(Tethered);
