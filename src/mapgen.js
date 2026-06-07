// Constructive cave generation: chambers are stamped first (arena-scale
// swing room is a precondition, not a rejection-sample lottery), corridors
// carved along a spanning tree, then the edges are organic-ized with
// boundary noise + smoothing so the result reads as a cave, not stamped
// rooms. The final grid also yields the wrap geometry: every convex corner
// of the (Douglas-Peucker-simplified) wall contour gets a peg the tether
// can wrap, exactly like an obstacle peg.
//
// Everything is deterministic per seed. Tiles: 1 = wall, 0 = floor.
window.Tethered = window.Tethered || {};

(function (S) {
  // --- Seeded RNG (mulberry32) -------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function angleDelta(a, b) {
    return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  }

  // --- Per-depth parameters ----------------------------------------------
  S.genParamsForDepth = function (depth) {
    const T = S.TUNING;
    const screens = Math.min(
      T.MAP_SCREENS_BASE + (depth - 1) * T.MAP_SCREENS_PER_DEPTH,
      T.MAP_SCREENS_CAP
    );
    const counts = T.CHAMBER_COUNT_BY_DEPTH;
    return {
      screens,
      tw: Math.round((screens * T.MAP_SCREEN_W) / T.TILE_SIZE),
      th: Math.round((screens * T.MAP_SCREEN_H) / T.TILE_SIZE),
      chamberTarget: counts[Math.min(depth, counts.length) - 1],
    };
  };

  // --- Map accessors (closed over the typed arrays) -----------------------
  function makeMap(tw, th, depth, seed) {
    const T = S.TUNING;
    const tiles = new Uint8Array(tw * th).fill(1);
    const map = {
      tw, th, depth, seed,
      w: tw * T.TILE_SIZE,
      h: th * T.TILE_SIZE,
      tiles,
      clearance: null, // Uint8Array, set after generation settles
      chambers: [],
      spawn: null, // {x, y} world px
      exit: null,
      wallLoops: null, // smooth contour polygons (render + collision source)
      segGrid: null, // collision segment broadphase
      stats: {},
      isWall(tx, ty) {
        return tx < 0 || ty < 0 || tx >= tw || ty >= th || tiles[ty * tw + tx] === 1;
      },
      worldToTile(x, y) {
        return { tx: Math.floor(x / T.TILE_SIZE), ty: Math.floor(y / T.TILE_SIZE) };
      },
      tileToWorld(tx, ty) { // tile center
        return { x: (tx + 0.5) * T.TILE_SIZE, y: (ty + 0.5) * T.TILE_SIZE };
      },
    };
    return map;
  }

  // --- Smooth-wall collision (runtime physics) -----------------------------
  // Walls collide as the SAME smooth polylines that render (map.segGrid:
  // short segments, each with a unit normal pointing to the floor side).
  // The ball sub-steps (≤0.4 tile/sub-step ≪ ball radius), so each resolve
  // starts shallow and the radial push-out toward the floor side is always
  // well-conditioned; a wall-side guard handles the rare deeper case.
  // restitution null = slide (enemies stop, don't bounce); a number = bounce
  // (the ball). Velocity lives on body[vxKey/vyKey] so the enemy knockback
  // channel works through it. Returns whether anything reflected.
  S.collideCircleWalls = function (map, body, restitution, vxKey = 'vx', vyKey = 'vy') {
    if (!map.segGrid) return false;
    const ts = S.TUNING.TILE_SIZE;
    let bounced = false;
    for (let iter = 0; iter < 3; iter++) {
      // The floor/wall side is decided once per pass by the tile the center
      // sits in — NOT per segment. A center in floor always pushes radially
      // out (it's on the floor side of every nearby edge, so this rounds
      // convex corners correctly instead of mis-reading a corner tip as a
      // wall-side crossing). Only a center that actually tunneled into a
      // wall tile pushes back across along the floor normal.
      const inWall = map.isWall(Math.floor(body.x / ts), Math.floor(body.y / ts));
      const cx0 = Math.floor((body.x - body.r) / ts);
      const cx1 = Math.floor((body.x + body.r) / ts);
      const cy0 = Math.floor((body.y - body.r) / ts);
      const cy1 = Math.floor((body.y + body.r) / ts);
      let best = null;
      let bestPen = 1e-6;
      const seen = body._collSeen || (body._collSeen = new Set());
      seen.clear();
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const segs = map.segGrid.get(cx * 100000 + cy);
          if (!segs) continue;
          for (const s of segs) {
            if (seen.has(s.id)) continue;
            seen.add(s.id);
            const cp = S.geom.segClosest(s.ax, s.ay, s.bx, s.by, body.x, body.y);
            const dx = body.x - cp.x;
            const dy = body.y - cp.y;
            const d = Math.hypot(dx, dy);
            let nx;
            let ny;
            let pen;
            if (inWall) {
              // Tunneled past the edge: shove fully across to the floor side.
              nx = s.nx;
              ny = s.ny;
              pen = body.r + d;
            } else {
              if (d >= body.r) continue;
              // Floor side: radial push out (corner-rounding).
              if (d > 1e-6) { nx = dx / d; ny = dy / d; } else { nx = s.nx; ny = s.ny; }
              pen = body.r - d;
            }
            if (pen > bestPen) {
              bestPen = pen;
              best = { nx, ny, overlap: pen };
            }
          }
        }
      }
      if (!best) break;
      body.x += best.nx * best.overlap;
      body.y += best.ny * best.overlap;
      const into = body[vxKey] * best.nx + body[vyKey] * best.ny;
      if (into < 0) {
        if (restitution == null) {
          body[vxKey] -= into * best.nx;
          body[vyKey] -= into * best.ny;
        } else {
          body[vxKey] -= (1 + restitution) * into * best.nx;
          body[vyKey] -= (1 + restitution) * into * best.ny;
          bounced = true;
        }
      }
    }
    return bounced;
  };

  // Nearest floor world-point to (x, y) — clamps the tether anchor out of
  // walls so a cursor dragged into the rock stays reachable.
  S.nearestFloorPoint = function (map, x, y) {
    const ts = S.TUNING.TILE_SIZE;
    const t = nearestFloor(map, Math.floor(x / ts), Math.floor(y / ts));
    if (t.tx === Math.floor(x / ts) && t.ty === Math.floor(y / ts)) return { x, y };
    return map.tileToWorld(t.tx, t.ty);
  };

  // Stamp a floor disk, clamped off the border band. Also marks the carve
  // mask when given — masked tiles are re-floored after every smoothing
  // pass, so organic-izing can never seal a corridor.
  function stampDisk(map, mask, cx, cy, r) {
    const B = S.TUNING.MAP_BORDER_TILES;
    const r2 = r * r;
    const x0 = Math.max(B, Math.floor(cx - r));
    const x1 = Math.min(map.tw - 1 - B, Math.ceil(cx + r));
    const y0 = Math.max(B, Math.floor(cy - r));
    const y1 = Math.min(map.th - 1 - B, Math.ceil(cy + r));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const dx = tx + 0.5 - cx;
        const dy = ty + 0.5 - cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = ty * map.tw + tx;
        map.tiles[i] = 0;
        if (mask) mask[i] = 1;
      }
    }
  }

  // --- Chambers ------------------------------------------------------------
  // Spawn and exit chambers are reserved at the left/right map edges; the
  // rest are rejection-placed with a wall gap so they stay distinct rooms.
  function placeChambers(map, rng, target) {
    const T = S.TUNING;
    const B = T.MAP_BORDER_TILES;
    const chambers = [];
    const radius = (shrink) => {
      const r = (T.CHAMBER_RADIUS_MIN + rng() * (T.CHAMBER_RADIUS_MAX - T.CHAMBER_RADIUS_MIN)) * shrink;
      // Lobes overhang the main disk ~15%; keep the full footprint inside.
      return Math.max(T.CHAMBER_RADIUS_MIN * 0.6, Math.min(r, (map.th - 2 * B - 2) / 2 / 1.15));
    };
    const fits = (cx, cy, r) =>
      chambers.every((c) => Math.hypot(c.cx - cx, c.cy - cy) >= (c.r + r) * 1.15 + T.CHAMBER_GAP_TILES);
    const jitterY = () => map.th / 2 + (rng() - 0.5) * map.th * 0.3;

    // Reserved: spawn hugs the left edge, exit the right. They must leave a
    // wall gap with real corridor room between them — but the chambers' x
    // depend on their radius (they hug the edges), so a one-shot shrink
    // overshoots. Binary-search the largest equal radius whose footprints
    // still leave minGap of corridor, then keep our random target if it's
    // smaller (variety) — never bigger (fit).
    const spawnCy = jitterY();
    const exitCy = jitterY();
    const minGap = T.CHAMBER_GAP_TILES + 1.5 * T.MIN_PASSAGE_TILES;
    const rMax = Math.min(T.CHAMBER_RADIUS_MAX, (map.th - 2 * B - 2) / 2 / 1.15);
    const sepFor = (r) => {
      const sx = B + r * 1.15 + 1;
      const ex = map.tw - 1 - B - r * 1.15 - 1;
      return Math.hypot(ex - sx, exitCy - spawnCy) - 2 * r * 1.15;
    };
    let fit = rMax;
    if (sepFor(rMax) < minGap) {
      let lo = 4;
      let hi = rMax;
      for (let it = 0; it < 24; it++) {
        const mid = (lo + hi) / 2;
        if (sepFor(mid) >= minGap) lo = mid; else hi = mid;
      }
      fit = lo;
    }
    const rr = Math.min(radius(1), fit);
    // The exit room is deliberately smaller (it holds no enemies — just the
    // portal). Shrinking it only widens the spawn↔exit gap, so the fit search
    // above still holds; re-hug the right edge with the smaller radius.
    const er = rr * T.EXIT_ROOM_RADIUS_MULT;
    const spawn = { cx: B + rr * 1.15 + 1, cy: spawnCy, r: rr, reserved: 'spawn' };
    const exit = { cx: map.tw - 1 - B - er * 1.15 - 1, cy: exitCy, r: er, reserved: 'exit' };
    chambers.push(spawn, exit);

    for (let n = chambers.length; n < target; n++) {
      let placed = false;
      for (let tries = 0; tries < 40 && !placed; tries++) {
        // A crowded map gets progressively smaller chambers before giving up.
        const cr = radius(1 - 0.5 * (tries / 40));
        const m = B + cr * 1.15 + 1;
        const cx = m + rng() * (map.tw - 2 * m);
        const cy = m + rng() * (map.th - 2 * m);
        if (!fits(cx, cy, cr)) continue;
        chambers.push({ cx, cy, r: cr });
        placed = true;
      }
      if (!placed) break; // map is full — score records the shortfall
    }

    // Stamp: a main disk plus 2-3 offset lobes for an organic multi-lobe blob.
    for (const c of chambers) {
      stampDisk(map, null, c.cx, c.cy, c.r);
      const lobes = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < lobes; i++) {
        const a = rng() * Math.PI * 2;
        const d = c.r * (0.35 + rng() * 0.3);
        stampDisk(map, null, c.cx + Math.cos(a) * d, c.cy + Math.sin(a) * d, c.r * (0.45 + rng() * 0.3));
      }
    }
    map.chambers = chambers;
    return chambers;
  }

  // --- Corridors ------------------------------------------------------------
  // Spanning tree (Prim) over chamber centers plus a few short loop edges,
  // each carved as a wandering brush stroke wide enough for the passage floor.
  function carveCorridors(map, mask, rng, chambers) {
    if (chambers.length < 2) return;
    const inTree = [0];
    const treeEdges = [];
    const rest = chambers.map((_, i) => i).slice(1);
    while (rest.length) {
      let best = null;
      for (const i of inTree) {
        for (const j of rest) {
          const d = Math.hypot(chambers[i].cx - chambers[j].cx, chambers[i].cy - chambers[j].cy);
          if (!best || d < best.d) best = { i, j, d };
        }
      }
      treeEdges.push(best);
      inTree.push(best.j);
      rest.splice(rest.indexOf(best.j), 1);
    }

    // Loop edges: the shortest non-tree pairs, one per ~4 chambers.
    const extra = [];
    for (let i = 0; i < chambers.length; i++) {
      for (let j = i + 1; j < chambers.length; j++) {
        if (treeEdges.some((e) => (e.i === i && e.j === j) || (e.i === j && e.j === i))) continue;
        extra.push({ i, j, d: Math.hypot(chambers[i].cx - chambers[j].cx, chambers[i].cy - chambers[j].cy) });
      }
    }
    extra.sort((a, b) => a.d - b.d);
    const edges = treeEdges.concat(extra.slice(0, Math.floor(chambers.length / 4)));
    // Remembered for the arena gates: each edge names the two chambers a
    // corridor joins, so the runtime can seal the right mouths (src/arena.js).
    map.corridorEdges = edges.map((e) => ({ i: e.i, j: e.j }));

    const brush = S.TUNING.MIN_PASSAGE_TILES / 2;
    for (const e of edges) {
      const a = chambers[e.i];
      const b = chambers[e.j];
      let x = a.cx;
      let y = a.cy;
      let heading = Math.atan2(b.cy - y, b.cx - x);
      const maxSteps = Math.ceil(e.d * 4);
      for (let s = 0; s < maxSteps; s++) {
        const distB = Math.hypot(b.cx - x, b.cy - y);
        if (distB <= 1) break;
        const target = Math.atan2(b.cy - y, b.cx - x);
        // Wander hardest mid-corridor, converging at both mouths.
        const wander = Math.min(Math.hypot(x - a.cx, y - a.cy), distB) / 10;
        heading += angleDelta(heading, target) * 0.18 + (rng() - 0.5) * 0.55 * Math.min(1, wander);
        x += Math.cos(heading);
        y += Math.sin(heading);
        stampDisk(map, mask, x, y, brush);
      }
      // Guarantee arrival even if the wander burned the step budget.
      const steps = Math.ceil(Math.hypot(b.cx - x, b.cy - y));
      for (let s = 1; s <= steps; s++) {
        stampDisk(map, mask, x + ((b.cx - x) * s) / steps, y + ((b.cy - y) * s) / steps, brush);
      }
    }
  }

  // --- Organic edges ---------------------------------------------------------
  function neighborWalls8(map, tx, ty) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && map.isWall(tx + dx, ty + dy)) n++;
      }
    }
    return n;
  }

  // A tile is in the boundary band when the opposite tile type sits within
  // `depth` (Chebyshev). depth 1 = the classic one-tile edge; deeper bands
  // let the noise take bigger bites, so silhouettes get lumpy at a larger
  // scale instead of merely fuzzy.
  function inBand(map, tx, ty, depth) {
    const wall = map.isWall(tx, ty);
    for (let dy = -depth; dy <= depth; dy++) {
      for (let dx = -depth; dx <= depth; dx++) {
        if ((dx || dy) && map.isWall(tx + dx, ty + dy) !== wall) return true;
      }
    }
    return false;
  }

  function isBoundary(map, tx, ty) {
    return inBand(map, tx, ty, 1);
  }

  // One pass of boundary noise: walls flip to floor at pFloor, floors flip
  // to wall at pWall (never the carve mask, never the border).
  function noisePass(map, mask, rng, pFloor, pWall, depth) {
    const B = S.TUNING.MAP_BORDER_TILES;
    const flips = [];
    for (let ty = B; ty < map.th - B; ty++) {
      for (let tx = B; tx < map.tw - B; tx++) {
        if (!inBand(map, tx, ty, depth)) continue;
        const i = ty * map.tw + tx;
        if (map.tiles[i] === 1) {
          if (rng() < pFloor) flips.push([i, 0]);
        } else if (!mask[i] && rng() < pWall) {
          flips.push([i, 1]);
        }
      }
    }
    // Collected first, applied after: flips must not cascade through the
    // band test mid-scan or the result drifts with iteration order.
    for (const [i, v] of flips) map.tiles[i] = v;
  }

  function forceBorder(map) {
    const B = S.TUNING.MAP_BORDER_TILES;
    for (let ty = 0; ty < map.th; ty++) {
      for (let tx = 0; tx < map.tw; tx++) {
        if (tx < B || ty < B || tx >= map.tw - B || ty >= map.th - B) {
          map.tiles[ty * map.tw + tx] = 1;
        }
      }
    }
  }

  function reapplyMask(map, mask) {
    for (let i = 0; i < mask.length; i++) if (mask[i]) map.tiles[i] = 0;
  }

  // Wall nubs — lone wall tiles barely attached to anything — read as noise
  // and would each mint a cluster of spurious wrap pegs. Two passes melt them.
  function killWallNubs(map) {
    const B = S.TUNING.MAP_BORDER_TILES;
    for (let pass = 0; pass < 2; pass++) {
      const flips = [];
      for (let ty = B; ty < map.th - B; ty++) {
        for (let tx = B; tx < map.tw - B; tx++) {
          const i = ty * map.tw + tx;
          if (map.tiles[i] === 1 && neighborWalls8(map, tx, ty) <= 1) flips.push(i);
        }
      }
      for (const i of flips) map.tiles[i] = 0;
      if (!flips.length) break;
    }
  }

  // Boundary noise then smoothing, restricted to the wall/floor boundary
  // band: chamber cores and deep walls never churn. The carve mask is
  // re-floored after every wall-converting pass — corridors cannot seal.
  // A light post-smooth noise pass restores the fine grain the smoother
  // melts, so edges read rough instead of rounded.
  function organicEdges(map, mask, rng) {
    const T = S.TUNING;
    const B = T.MAP_BORDER_TILES;

    noisePass(map, mask, rng, T.CA_NOISE_FLOOR_P, T.CA_NOISE_WALL_P, Math.max(1, T.CA_NOISE_DEPTH));

    for (let iter = 0; iter < T.CA_EDGE_ITERS; iter++) {
      const flips = [];
      for (let ty = B; ty < map.th - B; ty++) {
        for (let tx = B; tx < map.tw - B; tx++) {
          if (!isBoundary(map, tx, ty)) continue;
          const i = ty * map.tw + tx;
          const n = neighborWalls8(map, tx, ty);
          if (map.tiles[i] === 0 && n >= 5 && !mask[i]) flips.push([i, 1]);
          else if (map.tiles[i] === 1 && n <= 2) flips.push([i, 0]);
        }
      }
      for (const [i, v] of flips) map.tiles[i] = v;
      reapplyMask(map, mask);
    }

    if (T.CA_POST_NOISE_P > 0) {
      // Erosion-biased like the main pass (floor flips at 0.7×) so grain
      // never strangles space the smoother just opened.
      noisePass(map, mask, rng, T.CA_POST_NOISE_P, T.CA_POST_NOISE_P * 0.7, 1);
      reapplyMask(map, mask);
    }
    killWallNubs(map);
    forceBorder(map);
  }

  // --- Clearance (distance-to-wall transform) --------------------------------
  // 4-connected BFS hops from the nearest wall: wall = 0, floor against a
  // wall = 1, a 3-tile corridor's spine = 2. Cheap, reused by the width
  // guarantee here and by AI/placement later.
  function distanceTransform(map) {
    const { tw, th, tiles } = map;
    const dist = new Uint8Array(tw * th);
    const qx = new Int32Array(tw * th);
    const qy = new Int32Array(tw * th);
    let head = 0;
    let tail = 0;
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        if (tiles[ty * tw + tx] === 1) {
          qx[tail] = tx;
          qy[tail] = ty;
          tail++;
        }
      }
    }
    const seen = new Uint8Array(tw * th);
    for (let i = 0; i < tail; i++) seen[qy[i] * tw + qx[i]] = 1;
    while (head < tail) {
      const x = qx[head];
      const y = qy[head];
      head++;
      const d = dist[y * tw + x];
      const push = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th) return;
        const i = ny * tw + nx;
        if (seen[i]) return;
        seen[i] = 1;
        dist[i] = Math.min(255, d + 1);
        qx[tail] = nx;
        qy[tail] = ny;
        tail++;
      };
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }
    return dist;
  }

  // --- Width guarantee --------------------------------------------------------
  // A passage at the MIN_PASSAGE_TILES floor has a spine of clearance
  // ceil(width/2); every floor tile of a wide-enough passage sits within
  // spine-1 of such a tile. A floor tile with no spine tile in that reach is
  // "thin" — each pass dilates the floor there; carving only, never
  // filling, iterated to a bounded fixpoint.
  function widthGuarantee(map, mask) {
    const brush = S.TUNING.MIN_PASSAGE_TILES / 2;
    const spine = Math.ceil(S.TUNING.MIN_PASSAGE_TILES / 2);
    const reach = spine - 1;
    for (let pass = 0; pass < 3; pass++) {
      const clear = distanceTransform(map);
      const thin = [];
      for (let ty = 0; ty < map.th; ty++) {
        for (let tx = 0; tx < map.tw; tx++) {
          if (map.tiles[ty * map.tw + tx] === 1) continue;
          let ok = false;
          for (let dy = -reach; dy <= reach && !ok; dy++) {
            for (let dx = -reach; dx <= reach && !ok; dx++) {
              const nx = tx + dx;
              const ny = ty + dy;
              if (nx >= 0 && ny >= 0 && nx < map.tw && ny < map.th && clear[ny * map.tw + nx] >= spine) ok = true;
            }
          }
          if (!ok) thin.push([tx, ty]);
        }
      }
      if (!thin.length) return;
      for (const [tx, ty] of thin) stampDisk(map, mask, tx + 0.5, ty + 0.5, brush);
      killWallNubs(map); // fresh carve boundaries can expose nubs
      forceBorder(map);
    }
  }

  // --- Connectivity -------------------------------------------------------------
  // One flood fill at the very end; everything but the largest floor region
  // becomes wall. Constructive carving makes losing anything here rare.
  function keepLargestRegion(map) {
    const { tw, th, tiles } = map;
    const label = new Int32Array(tw * th).fill(-1);
    const sizes = [];
    const stack = [];
    for (let start = 0; start < tw * th; start++) {
      if (tiles[start] === 1 || label[start] !== -1) continue;
      const id = sizes.length;
      let size = 0;
      stack.push(start);
      label[start] = id;
      while (stack.length) {
        const i = stack.pop();
        size++;
        const x = i % tw;
        const y = (i / tw) | 0;
        const visit = (nx, ny) => {
          if (nx < 0 || ny < 0 || nx >= tw || ny >= th) return;
          const j = ny * tw + nx;
          if (tiles[j] === 1 || label[j] !== -1) return;
          label[j] = id;
          stack.push(j);
        };
        visit(x + 1, y);
        visit(x - 1, y);
        visit(x, y + 1);
        visit(x, y - 1);
      }
      sizes.push(size);
    }
    let largest = 0;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[largest]) largest = i;
    for (let i = 0; i < tw * th; i++) {
      if (tiles[i] === 0 && label[i] !== largest) tiles[i] = 1;
    }
    return sizes.length ? sizes[largest] : 0;
  }

  // --- Spawn/exit gate ------------------------------------------------------------
  function nearestFloor(map, tx, ty) {
    if (!map.isWall(tx, ty)) return { tx, ty };
    for (let r = 1; r < Math.max(map.tw, map.th); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!map.isWall(tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
        }
      }
    }
    return { tx, ty };
  }

  function bfsDistances(map, fromTx, fromTy) {
    const { tw, th } = map;
    const dist = new Int32Array(tw * th).fill(-1);
    const qx = new Int32Array(tw * th);
    const qy = new Int32Array(tw * th);
    let head = 0;
    let tail = 0;
    qx[0] = fromTx;
    qy[0] = fromTy;
    tail = 1;
    dist[fromTy * tw + fromTx] = 0;
    while (head < tail) {
      const x = qx[head];
      const y = qy[head];
      head++;
      const d = dist[y * tw + x];
      const push = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th) return;
        const i = ny * tw + nx;
        if (dist[i] !== -1 || map.tiles[i] === 1) return;
        dist[i] = d + 1;
        qx[tail] = nx;
        qy[tail] = ny;
        tail++;
      };
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }
    return dist;
  }

  // The player spawns at the edge of the start room furthest from the
  // corridor — approximated as the room edge pointing away from the rest of
  // the map's chambers (which is where the corridor leads) — pulled slightly
  // off the wall (the outermost floor with ≥2 tiles of clearance, so the
  // ball is clear of the rock but still hugging the back of the room).
  function farEdgeSpawn(map, spawnC) {
    const T = S.TUNING;
    let ax = 0;
    let ay = 0;
    let n = 0;
    for (const c of map.chambers) {
      if (c === spawnC) continue;
      ax += c.cx; ay += c.cy; n++;
    }
    let dx;
    let dy;
    if (n) { dx = spawnC.cx - ax / n; dy = spawnC.cy - ay / n; }
    else { dx = -1; dy = 0; } // lone room: head for the outer wall
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const cxw = spawnC.cx * T.TILE_SIZE;
    const cyw = spawnC.cy * T.TILE_SIZE;
    const step = T.TILE_SIZE * 0.5;
    const maxT = spawnC.r * 1.7 * T.TILE_SIZE;
    let best = { x: cxw, y: cyw };
    for (let t = 0; t <= maxT; t += step) {
      const x = cxw + dx * t;
      const y = cyw + dy * t;
      const tx = Math.floor(x / T.TILE_SIZE);
      const ty = Math.floor(y / T.TILE_SIZE);
      if (tx < 0 || ty < 0 || tx >= map.tw || ty >= map.th || map.isWall(tx, ty)) break;
      if (map.clearance[ty * map.tw + tx] >= 2) best = { x, y };
    }
    return best;
  }

  // Spawn is the far edge of the reserved left chamber (above). The exit
  // starts as the reserved right chamber, but a failed distance gate
  // retargets it to the chamber farthest by BFS path — depth-aware: tiny
  // early maps only need "the two most separated chambers, at least a screen
  // apart"; bigger maps demand ~60% of the diagonal so the run crosses the map.
  function placeSpawnExit(map) {
    const T = S.TUNING;
    const spawnC = map.chambers.find((c) => c.reserved === 'spawn') || map.chambers[0];
    const s = nearestFloor(map, Math.round(spawnC.cx), Math.round(spawnC.cy));
    const dist = bfsDistances(map, s.tx, s.ty);

    const pathTiles = (c) => {
      const t = nearestFloor(map, Math.round(c.cx), Math.round(c.cy));
      return { t, d: dist[t.ty * map.tw + t.tx] };
    };

    let exitC = map.chambers.find((c) => c.reserved === 'exit') || map.chambers[map.chambers.length - 1];
    let { t: e, d } = pathTiles(exitC);

    const need = map.depth <= 2
      ? T.MAP_SCREEN_W / T.TILE_SIZE
      : (0.6 * Math.hypot(map.tw, map.th));
    let gatePass = d >= need;
    if (!gatePass) {
      for (const c of map.chambers) {
        const p = pathTiles(c);
        if (p.d > d) {
          d = p.d;
          e = p.t;
          exitC = c;
        }
      }
      gatePass = d >= need;
    }

    map.spawn = farEdgeSpawn(map, spawnC);
    map.exit = map.tileToWorld(e.tx, e.ty);
    map.stats.spawnExitPathPx = d > 0 ? d * T.TILE_SIZE : 0;
    map.stats.gateNeedPx = need * T.TILE_SIZE;
    map.stats.gatePass = gatePass && d > 0;
  }

  // --- Wrap pegs from wall contours ----------------------------------------------
  // Trace every wall/floor boundary loop (floor kept on the left of travel,
  // wall on the right), simplify with Douglas-Peucker, and emit a peg at
  // each convex wall corner sharp enough to matter. Pegs are the same
  // duck-typed pivots obstacles use, offset into the wall by their radius
  // so the wrap arc kisses the visible corner.
  function traceLoops(map) {
    const { tw, th } = map;
    const vw = tw + 1; // vertex grid is one wider/taller than the tile grid
    const edges = new Map(); // start vertex key -> [{dx, dy, used}]
    const addEdge = (vx, vy, dx, dy) => {
      const k = vy * vw + vx;
      let list = edges.get(k);
      if (!list) edges.set(k, (list = []));
      list.push({ dx, dy, used: false });
    };
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        if (map.tiles[ty * tw + tx] === 1) continue; // floor tiles emit the edges
        if (map.isWall(tx, ty - 1)) addEdge(tx + 1, ty, -1, 0);
        if (map.isWall(tx, ty + 1)) addEdge(tx, ty + 1, 1, 0);
        if (map.isWall(tx - 1, ty)) addEdge(tx, ty, 0, 1);
        if (map.isWall(tx + 1, ty)) addEdge(tx + 1, ty + 1, 0, -1);
      }
    }

    const loops = [];
    for (const [startKey, list] of edges) {
      for (const first of list) {
        if (first.used) continue;
        const loop = [];
        let vx = startKey % vw;
        let vy = (startKey / vw) | 0;
        let edge = first;
        // Walk until we return to the starting directed edge.
        for (;;) {
          edge.used = true;
          loop.push([vx, vy]);
          vx += edge.dx;
          vy += edge.dy;
          const outs = edges.get(vy * vw + vx);
          if (!outs) break; // shouldn't happen on a closed grid boundary
          // Prefer the tightest right turn so pinch-point vertices (two
          // diagonal floor tiles meeting) split into separate loops.
          const order = [
            [-edge.dy, edge.dx], // right
            [edge.dx, edge.dy], // straight
            [edge.dy, -edge.dx], // left
            [-edge.dx, -edge.dy], // back
          ];
          edge = null;
          for (const [dx, dy] of order) {
            edge = outs.find((o) => !o.used && o.dx === dx && o.dy === dy);
            if (edge) break;
          }
          if (!edge) break; // loop closed (its edges are all consumed)
        }
        if (loop.length >= 4) loops.push(loop);
      }
    }
    return loops;
  }

  function simplifyLoop(loop, epsilon) {
    // Closed loop: split at the two mutually farthest-ish vertices (v0 and
    // the vertex farthest from it), DP each open chain, and rejoin.
    let far = 0;
    let farD = -1;
    for (let i = 1; i < loop.length; i++) {
      const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    const a = dp(loop.slice(0, far + 1), epsilon);
    const b = dp(loop.slice(far).concat([loop[0]]), epsilon);
    return a.slice(0, -1).concat(b.slice(0, -1)); // drop duplicated joints
  }

  function dp(points, epsilon) {
    if (points.length <= 2) return points.slice();
    const [x1, y1] = points[0];
    const [x2, y2] = points[points.length - 1];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
    let worst = 0;
    let worstD = -1;
    for (let i = 1; i < points.length - 1; i++) {
      const d = Math.abs((x2 - x1) * (y1 - points[i][1]) - (x1 - points[i][0]) * (y2 - y1)) / len;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worstD <= epsilon) return [points[0], points[points.length - 1]];
    const left = dp(points.slice(0, worst + 1), epsilon);
    return left.slice(0, -1).concat(dp(points.slice(worst), epsilon));
  }

  // Chaikin corner-cutting on a closed loop: each pass replaces every vertex
  // with two points at 1/4 and 3/4 of its incident edges, halving corner
  // angles. Square tile staircases melt into smooth curves; chamber lobes
  // (big features) survive as gentle waves, edge noise as small ripples.
  // The curve stays within the original polygon, so smooth floor ⊇ tile
  // floor at concave corners and ⊆ at convex — never far from the tiles.
  function chaikin(pts, iters) {
    for (let it = 0; it < iters; it++) {
      const out = [];
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      pts = out;
    }
    return pts;
  }

  // Tile at a world point is floor? (the collision/normal side test)
  function floorAt(map, x, y) {
    const ts = S.TUNING.TILE_SIZE;
    return !map.isWall(Math.floor(x / ts), Math.floor(y / ts));
  }

  // Trace the wall contours, smooth them into organic curves, and store the
  // result as the single source of truth for rendering, collision, and pegs:
  //   map.wallLoops — closed smooth polygons (world px) with bboxes
  //   map.segGrid   — short segments binned by tile-cell, each with a unit
  //                   normal pointing to the floor side (collision broadphase)
  function buildSmoothWalls(map) {
    const T = S.TUNING;
    const ts = T.TILE_SIZE;
    const loops = traceLoops(map);
    map.stats.contourLoops = loops.length;

    const wallLoops = [];
    const segGrid = new Map();
    let segId = 0;
    let segCount = 0;

    for (const loop of loops) {
      // To world px, smooth, then DP-simplify to shed redundant points
      // without losing the bumps.
      let pts = loop.map(([vx, vy]) => [vx * ts, vy * ts]);
      pts = chaikin(pts, T.WALL_SMOOTH_ITERS);
      pts = simplifyLoop(pts, T.WALL_SIMPLIFY_PX);
      if (pts.length < 3) continue;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [x, y] of pts) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      wallLoops.push({ pts, minX, minY, maxX, maxY });

      // Bin each segment, with a floor-pointing normal found by sampling.
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % n];
        let nx = -(by - ay);
        let ny = bx - ax;
        const nl = Math.hypot(nx, ny) || 1e-9;
        nx /= nl; ny /= nl;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        // Whichever side reads floor is outward; sample a hair off the edge.
        if (!floorAt(map, mx + nx * 3, my + ny * 3)) {
          if (floorAt(map, mx - nx * 3, my - ny * 3)) { nx = -nx; ny = -ny; }
        }
        const seg = { id: segId++, ax, ay, bx, by, nx, ny };
        segCount++;
        const x0 = Math.floor(Math.min(ax, bx) / ts);
        const x1 = Math.floor(Math.max(ax, bx) / ts);
        const y0 = Math.floor(Math.min(ay, by) / ts);
        const y1 = Math.floor(Math.max(ay, by) / ts);
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            const k = cx * 100000 + cy;
            let list = segGrid.get(k);
            if (!list) segGrid.set(k, (list = []));
            list.push(seg);
          }
        }
      }
    }
    map.wallLoops = wallLoops;
    map.segGrid = segGrid;
    map.stats.segCount = segCount;
  }

  // --- Top level --------------------------------------------------------------------
  function tryGenerate(depth, seed) {
    const params = S.genParamsForDepth(depth);
    const rng = mulberry32(seed);
    const map = makeMap(params.tw, params.th, depth, seed);
    const mask = new Uint8Array(params.tw * params.th); // corridor/carve floor — never sealed

    placeChambers(map, rng, params.chamberTarget);
    carveCorridors(map, mask, rng, map.chambers);
    organicEdges(map, mask, rng);
    widthGuarantee(map, mask);
    const floorTiles = keepLargestRegion(map);
    map.clearance = distanceTransform(map);
    placeSpawnExit(map);

    map.stats.floorFraction = floorTiles / (map.tw * map.th);
    map.stats.chambersPlaced = map.chambers.length;
    map.stats.chamberTarget = params.chamberTarget;
    map.stats.corridorFrac = corridorFraction(map);
    map.stats.score =
      (map.stats.gatePass ? 1000 : 0) +
      map.chambers.length * 10 +
      (map.stats.corridorFrac >= 0.02 ? 100 : 0) + // kissing-blob maps lose
      (map.stats.floorFraction > 0.25 && map.stats.floorFraction < 0.6 ? 50 : 0);
    return map;
  }

  // Fraction of the floor outside every chamber footprint — ~0 means the
  // chambers fused into one kissing blob with no real corridors.
  function corridorFraction(map) {
    const inChamber = new Uint8Array(map.tw * map.th);
    for (const c of map.chambers) {
      const rr = (c.r * 1.2) ** 2;
      const x0 = Math.max(0, Math.floor(c.cx - c.r * 1.2));
      const x1 = Math.min(map.tw - 1, Math.ceil(c.cx + c.r * 1.2));
      const y0 = Math.max(0, Math.floor(c.cy - c.r * 1.2));
      const y1 = Math.min(map.th - 1, Math.ceil(c.cy + c.r * 1.2));
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if ((tx + 0.5 - c.cx) ** 2 + (ty + 0.5 - c.cy) ** 2 <= rr) inChamber[ty * map.tw + tx] = 1;
        }
      }
    }
    let floor = 0;
    let corridor = 0;
    for (let i = 0; i < map.tiles.length; i++) {
      if (map.tiles[i] === 0) {
        floor++;
        if (!inChamber[i]) corridor++;
      }
    }
    return floor ? corridor / floor : 0;
  }

  // Generate a map for `depth`. Reseeds up to MAX_GEN_ATTEMPTS times on a
  // failed spawn/exit gate, then accepts the best scorer — constructive
  // stamping means every attempt is at least playable.
  S.generateMap = function (depth, seed) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const base = seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed >>> 0;
    let best = null;
    let attempts = 0;
    for (let i = 0; i < S.TUNING.MAX_GEN_ATTEMPTS; i++) {
      attempts++;
      const map = tryGenerate(depth, (base + i * 0x9e3779b9) >>> 0);
      if (!best || map.stats.score > best.stats.score) best = map;
      // Good enough to stop: gate passed, real corridors exist, and the
      // chamber count isn't badly short of target.
      if (
        map.stats.gatePass &&
        map.stats.corridorFrac >= 0.02 &&
        map.stats.chambersPlaced >= map.stats.chamberTarget * 0.75
      ) {
        best = map;
        break;
      }
    }
    buildSmoothWalls(best); // smooth contours — drives render + collision
    best.stats.attempts = attempts;
    best.stats.genMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return best;
  };
})(Tethered);
