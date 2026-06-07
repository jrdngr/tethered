// All canvas drawing: arena, rope, ball, enemies, coins, HUD, game-over overlay.
window.Tethered = window.Tethered || {};

(function (S) {
  // Draw order, bottom to top, in two passes. WORLD_LAYERS render under the
  // camera translate (world coordinates — gameplay); SCREEN_LAYERS render
  // after it, in viewport coordinates (full-screen flashes, overlay cards —
  // things that must cover the view, not a patch of world). The arrays *are*
  // the z-order: each layer is one (ctx, game) function. Adding a visual
  // means one function plus an index in the right pass. Like update()'s
  // ordering contract (see main.js), the order is load-bearing — overlays
  // must cover the world, the ball sits above the things it smashes, etc.
  const WORLD_LAYERS = [
    drawExit, // on the floor, under everything that moves over it
    drawTether,
    drawWalls, // above the rope, so a rope wrapped on a corner tucks behind the wall
    drawObstacles, // ditto for pillar wraps
    drawOnboarding, // spawn-room hints (depth 1)
    drawCoins,
    drawParticles,
    drawProjectiles,
    drawEnemies,
    drawPops,
    drawFloaters,
    drawPlayerPop, // the shockwave rings; the death flash is a screen layer
    drawBall,
  ];
  const SCREEN_LAYERS = [
    drawPlayerPopFlash,
    drawFlash,
    layerEdgePips, // offscreen-threat warnings
    layerMinimap, // explored-fog minimap (under the overlays)
    drawOverlays,
  ];
  function layerMinimap(ctx, game) { S.drawMinimap(ctx, game); }
  function layerEdgePips(ctx, game) { S.drawEdgePips(ctx, game); }

  S.drawGame = function (ctx, game) {
    const T = S.TUNING;

    // Background (HUD band + viewport), then the HUD in its own band up top.
    ctx.fillStyle = '#0d0e14';
    ctx.fillRect(0, 0, game.width, T.HUD_HEIGHT + game.height);
    drawHud(ctx, game);

    // Everything below renders translated under the HUD and clipped to the
    // viewport, so game elements never draw under the UI.
    ctx.save();
    ctx.translate(0, T.HUD_HEIGHT);
    ctx.beginPath();
    ctx.rect(0, 0, game.width, game.height);
    ctx.clip();

    // World pass: camera scroll + screen shake on the same translate (the
    // world jolts, the HUD and overlays stay planted).
    ctx.save();
    ctx.translate(game.shake.x - game.camera.x, game.shake.y - game.camera.y);
    for (const layer of WORLD_LAYERS) layer(ctx, game);
    ctx.restore();

    // Screen pass: viewport coordinates, still clipped to the play area.
    for (const layer of SCREEN_LAYERS) layer(ctx, game);
    ctx.restore();

    // Dev panel column on the right, in raw canvas coordinates. The arena
    // fills above only cover game.width, so the two tile exactly.
    S.drawDevPanel(ctx, game);
  };

  // Cave walls: the smooth contour polygons are the source of truth (same
  // curves the ball and rope collide with). Fill ONLY the wall region —
  // even-odd of (viewport rect + visible loops) leaves the floor
  // transparent, so the rope drawn underneath shows on floor but tucks
  // behind a wall it crosses. The viewport rect as the base makes the
  // bbox cull safe: a loop enclosing the view has a bbox covering it (kept);
  // a loop off to the side encloses no visible point (dropping it is fine).
  function drawWalls(ctx, game) {
    const map = game.map;
    if (!map || !map.wallLoops) return;
    const cam = game.camera;
    const vx0 = cam.x - 4;
    const vy0 = cam.y - 4;
    const vw = game.width + 8;
    const vh = game.height + 8;
    const vx1 = vx0 + vw;
    const vy1 = vy0 + vh;

    const visible = [];
    for (const loop of map.wallLoops) {
      if (loop.maxX < vx0 || loop.minX > vx1 || loop.maxY < vy0 || loop.minY > vy1) continue;
      visible.push(loop);
    }

    // Wall fill: viewport rect minus the floor loops (even-odd).
    ctx.beginPath();
    ctx.rect(vx0, vy0, vw, vh);
    for (const loop of visible) tracePath(ctx, loop.pts);
    ctx.fillStyle = '#1c1f2a';
    ctx.fill('evenodd');

    // Edge stroke (loops only — not the viewport rect).
    ctx.beginPath();
    for (const loop of visible) tracePath(ctx, loop.pts);
    ctx.strokeStyle = '#3a3f52';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function tracePath(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  // The exit: a glowing portal disc with a pulsing rim. While the player
  // channels it (sitting still inside), a bright arc winds around the rim as
  // a progress ring — full circle = transition.
  function drawExit(ctx, game) {
    const T = S.TUNING;
    const ex = game.exit;
    if (!ex) return;
    ctx.save();
    ctx.fillStyle = 'rgba(94, 255, 160, 0.12)';
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2);
    ctx.fill();
    const pulse = 0.6 + 0.4 * Math.sin(game.time * 4);
    ctx.strokeStyle = `rgba(94, 255, 160, ${0.5 + 0.3 * pulse})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#5effa0';
    ctx.shadowBlur = 12 * pulse;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (ex.channel > 0) {
      const frac = Math.min(ex.channel / T.EXIT_CHANNEL_TIME, 1);
      ctx.strokeStyle = '#aef4ff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.r + 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
  }

  // Depth-1 onboarding: two lines of world-space text centered in the start
  // room, so a first-time player knows the two verbs (grab, exit). Fades as
  // the ball leaves the room.
  function drawOnboarding(ctx, game) {
    if (game.depth !== 1 || !game.map) return;
    const room = game.map.chambers.find((c) => c.reserved === 'spawn');
    if (!room) return;
    const cx = room.cx * S.TUNING.TILE_SIZE;
    const cy = room.cy * S.TUNING.TILE_SIZE;
    const d = Math.hypot(game.ball.x - cx, game.ball.y - cy);
    const alpha = Math.max(0, 1 - d / (room.r * S.TUNING.TILE_SIZE + 200));
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#9aa0b4';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('hold near the ball to grab, release to fling', cx, cy - 16);
    ctx.fillText('find the exit', cx, cy + 16);
    ctx.restore();
  }

  // Rope (cursor anchor -> tangents and contact arcs -> ball): the player
  // should feel it loading like a drawn bow, so width, color, and glow all
  // scale with stretch, and each wrap pivot gets a pulsing highlight ring.
  // The tangent/arc geometry is read straight off the wraps' physics cache,
  // so the drawn rope is exactly the simulated rope. Untethered, a grab hint
  // ring shows when hovering near the ball.
  function drawTether(ctx, game) {
    const T = S.TUNING;
    const b = game.ball;
    if (game.tether.active) {
      const tension = Math.min(game.tether.stretch / T.WRAP_GLOW_STRETCH, 1);
      ctx.save();
      ctx.strokeStyle = `rgba(255, ${Math.round(230 - 130 * tension)}, ${Math.round(230 - 200 * tension)}, 0.9)`;
      ctx.lineWidth = 2 + T.WRAP_ROPE_WIDTH * tension;
      ctx.shadowColor = '#ff641e';
      ctx.shadowBlur = T.WRAP_GLOW_BLUR * tension;
      ctx.beginPath();
      ctx.moveTo(game.mouse.x, game.mouse.y);
      for (const w of game.tether.wraps) {
        ctx.lineTo(w.entryX, w.entryY);
        // Hug the pivot's edge from entry to exit contact, in wind order.
        ctx.arc(w.e.x, w.e.y, w.e.r, w.entryPhi, w.exitPhi, w.wind < 0);
      }
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // Anchor ring at the cursor.
      ctx.beginPath();
      ctx.arc(game.mouse.x, game.mouse.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Highlight ring on each wrap pivot, pulsing while the wrap holds —
      // the rope is bent around this thing, and it's paying out.
      const pulse = 1 + Math.sin(game.time * 10);
      ctx.strokeStyle = `rgba(255, 160, 60, ${0.5 + 0.3 * tension})`;
      ctx.lineWidth = 2;
      for (const w of game.tether.wraps) {
        ctx.beginPath();
        ctx.arc(w.e.x, w.e.y, (w.e.r || 0) + T.WRAP_RING_PAD + pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (game.state === S.STATE.PLAYING) {
      // Grab hint when hovering near the ball.
      const d = Math.hypot(game.mouse.x - b.x, game.mouse.y - b.y);
      if (d <= b.r + T.GRAB_RADIUS) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + T.GRAB_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Interior shapes: each part drawn to match its collision/wrap silhouette
  // exactly — circles as discs, capsules as round-capped bars. A slightly
  // larger edge-colored pass under the fill gives a 2px border without
  // tracing capsule outlines by hand. Palette is the wall chrome, a shade
  // lighter, so shapes read as architecture distinct from the walls.
  function drawObstacles(ctx, game) {
    ctx.lineCap = 'round';
    for (const o of game.obstacles) {
      // Edge pass (wider), then fill pass (on top).
      for (let pass = 0; pass < 2; pass++) {
        const color = pass === 0 ? '#3a3f52' : '#262a38';
        const grow = pass === 0 ? 2 : 0;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        for (const part of o.parts) {
          if (part.type === 'circle') {
            ctx.beginPath();
            ctx.arc(part.x, part.y, part.r + grow, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.lineWidth = (part.r + grow) * 2;
            ctx.beginPath();
            ctx.moveTo(part.x1, part.y1);
            ctx.lineTo(part.x2, part.y2);
            ctx.stroke();
          }
        }
      }
    }
  }

  // Pickups, each drawn by its PICKUP_TYPES entry, fading out at the end of
  // their life.
  function drawCoins(ctx, game) {
    const T = S.TUNING;
    for (const c of game.coins) {
      ctx.globalAlpha = Math.min((T.COIN_LIFETIME - c.age) / 1.5, 1);
      S.PICKUP_TYPES[c.type].draw(ctx, c, game);
    }
    ctx.globalAlpha = 1;
  }

  // Spark bursts (green heal sparks by default; the player death burst
  // overrides color and size), shrinking and fading as they die.
  function drawParticles(ctx, game) {
    for (const p of game.particles) {
      const t = p.age / p.life;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color || '#6fdc8c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, (p.size || 1) * (1 + 2.5 * (1 - t)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Spitter shots: hot mint dots with a faint halo, in the spitter's color
  // so the threat reads as theirs.
  function drawProjectiles(ctx, game) {
    for (const p of game.projectiles) {
      ctx.fillStyle = '#3dd68c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(61, 214, 140, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // One enemy body: the base disc in the type's color (flashing white when
  // a hit doesn't kill), the type's own decoration (tank armor ring), and
  // seams hinting how a splitter breaks — one diameter line per pair of
  // pieces it ultimately yields (a super-splitter shows a four-piece cross).
  // Shared by the enemy layer and the dev panel's mini spawn glyphs (which
  // pass a fake, scaled-down `e`) — one definition, no drifting copies.
  S.drawEnemyBody = function (ctx, type, e) {
    const def = S.ENEMY_TYPES[type];
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : def.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
    if (def.draw) def.draw(ctx, e);
    if (e.pieces) {
      const seams = e.pieces / 2;
      ctx.strokeStyle = '#0d0e14';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < seams; k++) {
        const a = Math.PI / 2 + (k * Math.PI) / seams;
        const sx = Math.cos(a) * e.r;
        const sy = Math.sin(a) * e.r;
        ctx.moveTo(e.x + sx, e.y + sy);
        ctx.lineTo(e.x - sx, e.y - sy);
      }
      ctx.stroke();
    }
  };

  function drawEnemies(ctx, game) {
    const T = S.TUNING;
    for (const e of game.enemies) {
      if (e.aggro === 'dormant') ctx.globalAlpha = 0.5; // asleep reads dimmer
      S.drawEnemyBody(ctx, e.type, e);
      ctx.globalAlpha = 1;
      // Spitter charge tell: a hot ring tightening onto the muzzle over the
      // wind-up, so an incoming shot is telegraphed even from off-center.
      const bs = e.brainState;
      if (bs && bs.windup > 0) {
        const t = 1 - bs.windup / T.SPITTER_WINDUP;
        ctx.strokeStyle = `rgba(61, 214, 140, ${0.4 + 0.5 * t})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 10 * (1 - t) + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Death pops: an expanding, fading ring where an enemy was smashed.
  // DAMAGE-special explosions (`explode`) render as a fiery blast wave
  // instead — a filled flash plus a hot ring expanding to the splash
  // radius (p.r holds the radius itself, not an enemy radius to scale).
  function drawPops(ctx, game) {
    const T = S.TUNING;
    for (const p of game.pops) {
      if (p.explode) {
        const t = p.t / T.POP_EXPLODE_DURATION;
        const ease = 1 - (1 - t) * (1 - t);
        const r = p.r * ease;
        ctx.fillStyle = `rgba(247, 107, 21, ${0.3 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 200, 60, ${1 - t})`;
        ctx.lineWidth = 2 + 5 * (1 - t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const t = p.t / T.POP_DURATION;
      const ease = 1 - (1 - t) * (1 - t); // ease-out: fast burst, slow settle
      // Bash pops are the power read: a bigger, hotter, thicker ring than
      // an ordinary kill's.
      const scale = p.bash ? T.BASH_POP_SCALE : 1;
      ctx.strokeStyle = p.bash ? `rgba(255, 200, 60, ${1 - t})` : `rgba(229, 72, 77, ${1 - t})`;
      ctx.lineWidth = (1 + 3 * (1 - t)) * (p.bash ? 2 : 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + (T.POP_SCALE * scale - 1) * ease), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Floating reward text (e.g. "+6 WRAP"): drifts up and fades, making
  // bonus payouts legible at the kill site.
  function drawFloaters(ctx, game) {
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffc53d';
    for (const f of game.floaters) {
      ctx.globalAlpha = 1 - f.age / f.life;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  // Player death pop: staggered white-hot shockwave rings, far bigger and
  // longer than an enemy pop. World layer — the rings expand where the ball
  // died; the companion flash is the screen layer below.
  function drawPlayerPop(ctx, game) {
    const T = S.TUNING;
    if (!game.playerPop) return;
    const p = game.playerPop;
    for (let i = 0; i < T.PLAYER_POP_RINGS; i++) {
      const t = (p.t - i * T.PLAYER_POP_RING_LAG) / T.PLAYER_POP_DURATION;
      if (t < 0 || t >= 1) continue;
      const ease = 1 - (1 - t) * (1 - t);
      ctx.strokeStyle = `rgba(174, 244, 255, ${1 - t})`;
      ctx.lineWidth = 2 + 6 * (1 - t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, T.BALL_RADIUS * (1 + (T.PLAYER_POP_SCALE - 1) * ease), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The white flash at the moment of death — screen layer, so it covers the
  // viewport regardless of where the camera is.
  function drawPlayerPopFlash(ctx, game) {
    const T = S.TUNING;
    if (!game.playerPop || game.playerPop.t >= T.PLAYER_POP_FLASH) return;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * (1 - game.playerPop.t / T.PLAYER_POP_FLASH)})`;
    ctx.fillRect(0, 0, game.width, game.height);
  }

  // Ball color tracks speed (tethered or not): dark blue while slow, a
  // gradient that brightens (with growing glow) toward SPEED_COLOR_MAX
  // while fast. Just above the threshold it flashes the vulnerable dark
  // blue as an "about to drop out" warning. The glow is cyan when free
  // and tether-red while held.
  // Flash during i-frames. Once it pops, there's no ball to draw.
  function drawBall(ctx, game) {
    const T = S.TUNING;
    const b = game.ball;
    if (game.state === S.STATE.DYING || game.state === S.STATE.GAMEOVER) return;
    const speed = S.ballSpeed(b);
    const nearThreshold = speed < T.SPEED_THRESHOLD + T.SPEED_FLASH_WINDOW;
    const flashDark = nearThreshold && Math.sin(game.time * 25) > 0;
    ctx.save();
    if (b.iframes > 0 && Math.sin(game.time * 30) > 0) ctx.globalAlpha = 0.35;
    // Weapons draw first, under the ball, so the shapes emerge from its rim.
    // Armed weapons at full size; while tethered, a small faded preview
    // hints that they'll deploy on release.
    if (game.weaponState.active) S.drawWeapons(ctx, game);
    else if (game.tether.active) S.drawWeapons(ctx, game, true);
    if (speed > T.SPEED_THRESHOLD && !flashDark) {
      const f = Math.min(
        (speed - T.SPEED_THRESHOLD) / (T.SPEED_COLOR_MAX - T.SPEED_THRESHOLD), 1);
      ctx.fillStyle = lerpColor([86, 140, 200], [174, 244, 255], f);
      ctx.shadowColor = game.tether.active ? '#ff641e' : '#56e8ff';
      ctx.shadowBlur = 10 + 22 * f;
    } else {
      ctx.fillStyle = '#33557a'; // vulnerable dark blue (also the warning flash)
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // VITALITY special: the held one-hit shield is a cyan ring.
    if (b.shield) {
      ctx.strokeStyle = '#aef4ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Bash screen flash: a brief white pop over the whole viewport, fading out.
  function drawFlash(ctx, game) {
    const T = S.TUNING;
    if (game.flash <= 0) return;
    ctx.fillStyle = `rgba(255, 255, 255, ${T.BASH_FLASH_ALPHA * game.flash / T.BASH_FLASH_DURATION})`;
    ctx.fillRect(0, 0, game.width, game.height);
  }

  // Overlays render in the screen pass (viewport coordinates), so their
  // card/click rects line up with game.mouseScreen; the HUD stays visible
  // above.
  function drawOverlays(ctx, game) {
    if (game.state === S.STATE.LEVELUP) drawLevelUp(ctx, game);
    if (game.state === S.STATE.GAMEOVER) drawGameOver(ctx, game);
    if (game.state === S.STATE.VICTORY) drawVictory(ctx, game);
  }

  function lerpColor(a, b, t) {
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  // Survival time as M:SS.
  function formatTime(seconds) {
    const secs = Math.floor(seconds);
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function drawHud(ctx, game) {
    const T = S.TUNING;
    const b = game.ball;

    ctx.font = '16px monospace';
    ctx.textBaseline = 'top';

    // Combo, top-left, with a bar draining over COMBO_TIMEOUT — the time
    // left before an idle combo resets.
    ctx.textAlign = 'left';
    ctx.fillStyle = game.combo > 1 ? '#56e8ff' : '#6b6f80';
    ctx.fillText(`COMBO x${game.combo}`, 16, 14);
    if (game.combo > 1) {
      const left = Math.max(1 - game.comboIdle / T.COMBO_TIMEOUT, 0);
      ctx.fillStyle = '#1c1f2a';
      ctx.fillRect(16, 33, 100, 4);
      ctx.fillStyle = '#56e8ff';
      ctx.fillRect(16, 33, 100 * left, 4);
    }

    // HP bar below.
    const hpW = 160;
    const hpH = 10;
    ctx.fillStyle = '#33212a';
    ctx.fillRect(16, 42, hpW, hpH);
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(16, 42, hpW * Math.max(b.hp / game.stats.maxHp, 0), hpH);
    ctx.strokeStyle = '#2a2d3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(15.5, 41.5, hpW + 1, hpH + 1);

    // Level + coin progress bar, top center.
    const barW = 260;
    const barH = 8;
    const bx = (game.width - barW) / 2;
    const by = 18;
    const need = S.coinsForLevel(game.level);
    ctx.fillStyle = '#1c1f2a';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = '#ffc53d';
    ctx.fillRect(bx, by, barW * Math.min(game.coinProgress / need, 1), barH);
    ctx.strokeStyle = '#2a2d3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 0.5, by - 0.5, barW + 1, barH + 1);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffc53d';
    ctx.fillText(`LV ${game.level}`, bx - 10, 14);

    // Depth, top-right (the progression readout — was survival time).
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8e8f0';
    ctx.fillText(`DEPTH ${game.depth}/${T.MAX_DEPTH}`, game.width - 16, 14);

    // Speed meter, top center just below the level bar: shows how close the
    // ball is to the invincibility threshold (the key feedback for learning
    // the mechanic).
    const meterW = 240;
    const meterH = 10;
    const mx = (game.width - meterW) / 2;
    const my = by + barH + 10;
    const maxShown = T.SPEED_THRESHOLD * 1.6;
    const frac = Math.min(S.ballSpeed(b) / maxShown, 1);
    ctx.fillStyle = '#1c1f2a';
    ctx.fillRect(mx, my, meterW, meterH);
    const fast = S.ballSpeed(b) > T.SPEED_THRESHOLD;
    ctx.fillStyle = !fast ? '#6b6f80' : game.tether.active ? '#ff641e' : '#56e8ff';
    ctx.fillRect(mx, my, meterW * frac, meterH);
    // Threshold marker.
    const tx = mx + meterW * (T.SPEED_THRESHOLD / maxShown);
    ctx.fillStyle = '#e8e8f0';
    ctx.fillRect(tx - 1, my - 3, 2, meterH + 6);
  }

  // Level-up pause: up to three upgrade cards, hover to highlight, click to
  // pick. Each card shows its level as a row of pips; an upgrade one pick
  // from the cap advertises its special in gold instead of the normal gain.
  function drawLevelUp(ctx, game) {
    ctx.fillStyle = 'rgba(13, 14, 20, 0.8)';
    ctx.fillRect(0, 0, game.width, game.height);

    const cx = game.width / 2;
    const cy = game.height / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffc53d';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(`LEVEL ${game.level}`, cx, cy - 130);
    ctx.fillStyle = '#e8e8f0';
    ctx.font = '16px monospace';
    ctx.fillText('choose an upgrade', cx, cy - 95);

    const rects = S.upgradeCardRects(game);
    game.upgradeChoices.forEach((u, i) => {
      const r = rects[i];
      const hover = game.mouseScreen.x >= r.x && game.mouseScreen.x <= r.x + r.w &&
        game.mouseScreen.y >= r.y && game.mouseScreen.y <= r.y + r.h;
      ctx.fillStyle = hover ? '#242838' : '#1c1f2a';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = hover ? '#ffc53d' : '#2a2d3a';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      // The upgrade's glyph — the same icon the dev panel buttons use.
      ctx.save(); // icons set their own colors/joins/alpha
      u.icon(ctx, r.x + r.w / 2, r.y + 26, 28);
      ctx.restore();
      ctx.fillStyle = '#ffc53d';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(u.name, r.x + r.w / 2, r.y + 58);
      const lvl = S.upgradeLevel(game, u);
      const final = lvl === S.TUNING.UPGRADE_LEVEL_MAX - 1; // next pick is the special
      ctx.fillStyle = final ? '#ffc53d' : '#9aa0b4';
      ctx.font = '13px monospace';
      ctx.fillText(final ? u.specialDesc() : u.desc(), r.x + r.w / 2, r.y + 86);
      // Level pips: one per level, filled up to the current level.
      const max = S.TUNING.UPGRADE_LEVEL_MAX;
      const pipGap = 14;
      const px0 = r.x + r.w / 2 - ((max - 1) * pipGap) / 2;
      for (let p = 0; p < max; p++) {
        ctx.beginPath();
        ctx.arc(px0 + p * pipGap, r.y + r.h - 16, 3.5, 0, Math.PI * 2);
        if (p < lvl) {
          ctx.fillStyle = '#ffc53d';
          ctx.fill();
        } else {
          ctx.strokeStyle = '#2a2d3a';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    });
  }

  function drawGameOver(ctx, game) {
    ctx.fillStyle = 'rgba(13, 14, 20, 0.8)';
    ctx.fillRect(0, 0, game.width, game.height);

    const cx = game.width / 2;
    const cy = game.height / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e5484d';
    ctx.font = 'bold 48px monospace';
    ctx.fillText('GAME OVER', cx, cy - 60);

    ctx.fillStyle = '#e8e8f0';
    ctx.font = '20px monospace';
    ctx.fillText(`DEPTH ${game.depth}/${S.TUNING.MAX_DEPTH}`, cx, cy);
    ctx.fillText(`${game.kills || 0} KILLS · LEVEL ${game.level}`, cx, cy + 32);

    ctx.fillStyle = '#6b6f80';
    ctx.font = '16px monospace';
    ctx.fillText('click to restart', cx, cy + 80);
  }

  // Victory: cleared the final depth.
  function drawVictory(ctx, game) {
    ctx.fillStyle = 'rgba(13, 14, 20, 0.85)';
    ctx.fillRect(0, 0, game.width, game.height);
    const cx = game.width / 2;
    const cy = game.height / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5effa0';
    ctx.font = 'bold 48px monospace';
    ctx.fillText('ESCAPED', cx, cy - 60);
    ctx.fillStyle = '#e8e8f0';
    ctx.font = '20px monospace';
    ctx.fillText(`all ${S.TUNING.MAX_DEPTH} depths cleared`, cx, cy);
    ctx.fillText(`${game.kills || 0} KILLS · ${formatTime(game.time)}`, cx, cy + 32);
    ctx.fillStyle = '#6b6f80';
    ctx.font = '16px monospace';
    ctx.fillText('click to play again', cx, cy + 80);
  }
})(Tethered);
