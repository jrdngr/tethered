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
      pegs: [],
      pegCells: null, // Map of cell key -> peg list (GRID_CELL cells)
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

  // --- Tile collision (runtime physics) -----------------------------------
  // Circle vs one wall tile: unit normal from the tile surface toward the
  // circle center plus penetration depth (the obstacleHit return shape).
  function tileHit(b, tx0, ty0, ts) {
    const cx = Math.max(tx0, Math.min(b.x, tx0 + ts));
    const cy = Math.max(ty0, Math.min(b.y, ty0 + ts));
    const dx = b.x - cx;
    const dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= b.r) return null;
    if (d > 1e-6) return { nx: dx / d, ny: dy / d, overlap: b.r - d };
    // Center inside the tile (deep hit): push out through the nearest face.
    const faces = [
      { nx: -1, ny: 0, overlap: b.x - tx0 + b.r },
      { nx: 1, ny: 0, overlap: tx0 + ts - b.x + b.r },
      { nx: 0, ny: -1, overlap: b.y - ty0 + b.r },
      { nx: 0, ny: 1, overlap: ty0 + ts - b.y + b.r },
    ];
    return faces.reduce((a, f) => (f.overlap < a.overlap ? f : a));
  }

  // Push a circle body out of wall tiles, resolving the deepest penetration
  // first and iterating so concave (two-tile inside) corners settle. With a
  // restitution the into-wall velocity reflects (a bounce); with null it's
  // zeroed (a slide — enemies stop at walls, they don't rebound). Velocity
  // lives on body[vxKey/vyKey] so the enemies' knockback channel works too.
  // Returns whether anything reflected.
  S.collideCircleTiles = function (map, body, restitution, vxKey = 'vx', vyKey = 'vy') {
    const ts = S.TUNING.TILE_SIZE;
    let bounced = false;
    for (let iter = 0; iter < 2; iter++) {
      const x0 = Math.floor((body.x - body.r) / ts);
      const x1 = Math.floor((body.x + body.r) / ts);
      const y0 = Math.floor((body.y - body.r) / ts);
      const y1 = Math.floor((body.y + body.r) / ts);
      let best = null;
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!map.isWall(tx, ty)) continue;
          const hit = tileHit(body, tx * ts, ty * ts, ts);
          if (hit && (!best || hit.overlap > best.overlap)) best = hit;
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

    // Reserved: spawn hugs the left edge, exit the right. On small maps two
    // full-size chambers would merge into one kissing blob with no corridor
    // between them — shrink both until a wall gap with real corridor room
    // is guaranteed.
    let r1 = radius(1);
    let r2 = radius(1);
    // Gap + ~2.5 corridor-widths of genuine corridor between the footprints.
    const minGap = T.CHAMBER_GAP_TILES + 2.5 * T.MIN_PASSAGE_TILES;
    const spawn = { cx: B + r1 * 1.15 + 1, cy: jitterY(), r: r1, reserved: 'spawn' };
    const exit = { cx: map.tw - 1 - B - r2 * 1.15 - 1, cy: jitterY(), r: r2, reserved: 'exit' };
    const sep = () => Math.hypot(exit.cx - spawn.cx, exit.cy - spawn.cy) - (spawn.r + exit.r) * 1.15;
    if (sep() < minGap) {
      const dist = Math.hypot(exit.cx - spawn.cx, exit.cy - spawn.cy);
      const scale = Math.max(0.4, (dist - minGap) / ((spawn.r + exit.r) * 1.15));
      spawn.r *= scale;
      exit.r *= scale;
      spawn.cx = B + spawn.r * 1.15 + 1;
      exit.cx = map.tw - 1 - B - exit.r * 1.15 - 1;
    }
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

  // Spawn is the reserved left chamber. The exit starts as the reserved
  // right chamber, but a failed distance gate retargets it to the chamber
  // farthest by BFS path — depth-aware: tiny early maps only need "the two
  // most separated chambers, at least a screen apart"; bigger maps demand
  // ~60% of the diagonal so the run crosses the map.
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

    map.spawn = map.tileToWorld(s.tx, s.ty);
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

  function derivePegs(map) {
    const T = S.TUNING;
    const minAngle = (T.WALL_PEG_MIN_ANGLE * Math.PI) / 180;
    const pegs = [];
    const loops = traceLoops(map);
    map.stats.contourLoops = loops.length;

    for (const loop of loops) {
      const poly = simplifyLoop(loop, T.PEG_DP_EPSILON);
      const n = poly.length;
      if (n < 3) continue;
      for (let i = 0; i < n; i++) {
        const p = poly[(i + n - 1) % n];
        const v = poly[i];
        const q = poly[(i + 1) % n];
        let ax = v[0] - p[0];
        let ay = v[1] - p[1];
        let bx = q[0] - v[0];
        let by = q[1] - v[1];
        const al = Math.hypot(ax, ay) || 1e-9;
        const bl = Math.hypot(bx, by) || 1e-9;
        ax /= al; ay /= al; bx /= bl; by /= bl;
        const cross = ax * by - ay * bx;
        const dot = ax * bx + ay * by;
        // Floor-on-left winding: cross > 0 = the path bends right around a
        // wall corner protruding into floor — the wrappable convex case.
        if (cross <= 0) continue;
        const turn = Math.atan2(Math.abs(cross), dot);
        if (turn < minAngle) continue;
        // Bisector of the two wall-side (right) normals points into the wall.
        let nx = -ay - by;
        let ny = ax + bx;
        const nl = Math.hypot(nx, ny) || 1e-9;
        nx /= nl; ny /= nl;
        const x = v[0] * T.TILE_SIZE + nx * T.WALL_PEG_RADIUS;
        const y = v[1] * T.TILE_SIZE + ny * T.WALL_PEG_RADIUS;
        pegs.push({ x, y, _px: x, _py: y, r: T.WALL_PEG_RADIUS, obstacle: true });
      }
    }

    // Cell index so the tether step inserts only pegs near the rope.
    const cells = new Map();
    for (const p of pegs) {
      const k = Math.floor(p.x / T.GRID_CELL) * 4096 + Math.floor(p.y / T.GRID_CELL);
      let list = cells.get(k);
      if (!list) cells.set(k, (list = []));
      list.push(p);
    }
    map.pegs = pegs;
    map.pegCells = cells;
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
    derivePegs(best);
    best.stats.attempts = attempts;
    best.stats.pegCount = best.pegs.length;
    best.stats.genMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return best;
  };
})(Tethered);
