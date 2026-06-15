// Minimap + edge pips: navigation and offscreen-threat readability for the
// scrolling dungeon. The minimap pre-renders the (static) wall layout to an
// offscreen canvas once per map and keeps a fog canvas that's erased in a
// disc around the ball as it explores — cheap per frame (two drawImages and
// one arc), no per-tile work. Edge pips point at awake enemies the camera
// has scrolled off the viewport.
window.Tethered = window.Tethered || {};

(function (S) {
  // Build (once per map) the wall image + a fog overlay that starts opaque.
  function buildMini(map) {
    const T = S.TUNING;
    const scale = T.MINIMAP_SIZE / map.w;
    const mw = Math.max(1, Math.round(map.w * scale));
    const mh = Math.max(1, Math.round(map.h * scale));

    const walls = document.createElement('canvas');
    walls.width = mw;
    walls.height = mh;
    const wc = walls.getContext('2d');
    wc.fillStyle = '#11131a'; // wall
    wc.fillRect(0, 0, mw, mh);
    wc.save();
    wc.scale(scale, scale);
    wc.beginPath();
    for (const loop of map.wallLoops) {
      const p = loop.pts;
      wc.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) wc.lineTo(p[i][0], p[i][1]);
      wc.closePath();
    }
    wc.fillStyle = '#2a2d3d'; // floor (even-odd punches wall islands)
    wc.fill('evenodd');
    wc.restore();

    const fog = document.createElement('canvas');
    fog.width = mw;
    fog.height = mh;
    const fc = fog.getContext('2d');
    fc.fillStyle = '#0d0e14'; // fully opaque — unexplored map is blacked out
    fc.fillRect(0, 0, mw, mh);

    return { seed: map.seed, walls, fog, fc, scale, mw, mh, exitSeen: false };
  }

  S.drawMinimap = function (ctx, game) {
    const T = S.TUNING;
    const map = game.map;
    // No minimap in the arena (single fixed rectangle, no wall layout to map).
    if (!map || !map.wallLoops || (game.state !== S.STATE.PLAYING && game.state !== S.STATE.DYING)) return;
    if (!map._mini || map._mini.seed !== map.seed) map._mini = buildMini(map);
    const m = map._mini;
    const b = game.ball;

    // Reveal a disc of fog around the ball (and remember the exit once seen).
    m.fc.save();
    m.fc.globalCompositeOperation = 'destination-out';
    m.fc.beginPath();
    m.fc.arc(b.x * m.scale, b.y * m.scale, T.MINIMAP_REVEAL * m.scale, 0, Math.PI * 2);
    m.fc.fill();
    m.fc.restore();
    if (game.exit && Math.hypot(game.exit.x - b.x, game.exit.y - b.y) < T.MINIMAP_REVEAL) {
      m.exitSeen = true;
    }

    // Frame, in the viewport's bottom-right corner.
    const x0 = game.width - m.mw - 12;
    const y0 = game.height - m.mh - 12;
    ctx.save();
    ctx.drawImage(m.walls, x0, y0);
    ctx.drawImage(m.fog, x0, y0); // opaque black over the unexplored map
    ctx.strokeStyle = '#3a3f52';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, m.mw + 1, m.mh + 1);

    const dot = (wx, wy, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0 + wx * m.scale, y0 + wy * m.scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    // Awake enemies as faint red ticks (sleeping ones stay hidden).
    for (const e of game.enemies) {
      if (e.aggro === 'awake') dot(e.x, e.y, 'rgba(229, 72, 77, 0.8)', 1.5);
    }
    dot(map.spawn.x, map.spawn.y, '#5dffa0', 2.5); // start
    if (m.exitSeen) dot(game.exit.x, game.exit.y, '#ff5d6e', 3); // exit, once found
    dot(b.x, b.y, '#ffffff', 2.5); // the ball
    ctx.restore();
  };

  // Edge pips: red chevrons at the viewport rim pointing at the nearest awake
  // enemies the camera has scrolled offscreen, so an incoming swarm is never
  // a total surprise.
  S.drawEdgePips = function (ctx, game) {
    const T = S.TUNING;
    if (game.state !== S.STATE.PLAYING) return;
    const cam = game.camera;
    const offscreen = [];
    for (const e of game.enemies) {
      if (!e.aggro || e.aggro === 'dormant') continue;
      const sx = e.x - cam.x;
      const sy = e.y - cam.y;
      if (sx >= 0 && sx <= game.width && sy >= 0 && sy <= game.height) continue; // on screen
      offscreen.push({ e, d: Math.hypot(e.x - game.ball.x, e.y - game.ball.y) });
    }
    offscreen.sort((a, b) => a.d - b.d);
    const cx = game.width / 2;
    const cy = game.height / 2;
    const margin = T.PIP_MARGIN;
    for (let i = 0; i < offscreen.length && i < T.PIP_MAX; i++) {
      const e = offscreen[i].e;
      let dx = e.x - cam.x - cx;
      let dy = e.y - cam.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      // Project the direction onto the viewport rim (inset by margin).
      const halfW = cx - margin;
      const halfH = cy - margin;
      const scale = Math.min(halfW / Math.abs(dx || 1e-6), halfH / Math.abs(dy || 1e-6));
      const px = cx + dx * scale;
      const py = cy + dy * scale;
      const alpha = Math.max(0.25, 1 - offscreen[i].d / 2500);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = `rgba(229, 72, 77, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, -5);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  };
})(Tethered);
