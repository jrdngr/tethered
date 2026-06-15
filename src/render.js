// All canvas drawing: arena, rope, ball, enemies, pickups, HUD, game-over overlay.
window.Tethered = window.Tethered || {};

(function (S) {
  // Draw order, bottom to top, in two passes. WORLD_LAYERS render under the
  // camera translate (world coordinates — gameplay); SCREEN_LAYERS render
  // after it, in viewport coordinates (full-screen flashes, overlay cards —
  // things that must cover the view, not a patch of world). The arrays *are*
  // the z-order: each layer is one (ctx, game) function. Adding a visual
  // means one function plus an index in the right pass. Like update()'s
  // ordering contract (see main.js), the order is load-bearing — overlays
  // must cover the world, the ball sits above the things it hits, etc.
  const WORLD_LAYERS = [
    drawPegs, // arena features, under everything
    drawTether,
    drawPickups,
    drawParticles,
    drawProjectiles,
    drawEnemies,
    drawPops,
    drawDamagePops, // floating damage numbers, above the bodies they came off
    drawPlayerPop, // the shockwave rings; the death flash is a screen layer
    drawBall,
  ];
  const SCREEN_LAYERS = [
    drawPlayerPopFlash,
    drawFlash,
    drawEdgePips, // offscreen-enemy warnings at the viewport rim
    drawOverlays,
  ];

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

  // Pickups, each drawn by its PICKUP_TYPES entry.
  function drawPickups(ctx, game) {
    for (const c of game.pickups) {
      S.PICKUP_TYPES[c.type].draw(ctx, c, game);
    }
  }

  // Pegs: static circular obstacles, a neutral slate so they read as arena
  // structure rather than another enemy color.
  function drawPegs(ctx, game) {
    for (const peg of game.pegs) {
      ctx.fillStyle = '#39404d';
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#525a6b';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
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
      S.drawEnemyBody(ctx, e.type, e);
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
  function drawPops(ctx, game) {
    const T = S.TUNING;
    for (const p of game.pops) {
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

  // Floating damage numbers: drift up and fade over their life, each tilted a
  // few degrees so a cluster doesn't read as a single column.
  function drawDamagePops(ctx, game) {
    const T = S.TUNING;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = T.DAMAGE_POP_FONT;
    for (const d of game.damagePops) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);
      ctx.globalAlpha = 1 - d.age / d.life;
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(String(d.amount), 0, 0);
      ctx.restore();
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
  // Edge pips: red chevrons at the viewport rim pointing at the nearest
  // enemies the camera has scrolled offscreen, so an incoming swarm (or a
  // wave that spawned across the arena) is never a total surprise. Drawn in
  // viewport coordinates — the world translate is already restored here.
  function drawEdgePips(ctx, game) {
    const T = S.TUNING;
    if (game.state !== S.STATE.PLAYING) return;
    const cam = game.camera;
    const offscreen = [];
    for (const e of game.enemies) {
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
  }

  function drawOverlays(ctx, game) {
    if (game.state === S.STATE.GAMEOVER) drawGameOver(ctx, game);
  }

  function lerpColor(a, b, t) {
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
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
    ctx.fillRect(16, 42, hpW * Math.max(b.hp / T.MAX_HP, 0), hpH);
    ctx.strokeStyle = '#2a2d3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(15.5, 41.5, hpW + 1, hpH + 1);

    // Wave readout, top-right, with the next-wave countdown just to its left.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8e8f0';
    const waveLabel = `WAVE ${game.wave.number}`;
    ctx.fillText(waveLabel, game.width - 16, 14);
    const waveW = ctx.measureText(waveLabel).width; // measured at 16px, before the font swap
    const secs = Math.max(0, Math.ceil(game.wave.timer));
    ctx.font = '13px monospace';
    ctx.fillStyle = '#6b6f80';
    ctx.fillText(`NEXT ${secs}s`, game.width - 16 - waveW - 14, 16);
    ctx.font = '16px monospace';

    // Speed meter, top center: shows how close the ball is to the
    // invincibility threshold (the key feedback for learning the mechanic).
    const meterW = 240;
    const meterH = 10;
    const mx = (game.width - meterW) / 2;
    const my = 26;
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
    ctx.fillText(`WAVE ${game.wave.number}`, cx, cy);
    ctx.fillText(`${game.kills || 0} KILLS`, cx, cy + 32);

    ctx.fillStyle = '#6b6f80';
    ctx.font = '16px monospace';
    ctx.fillText('click to restart', cx, cy + 80);
  }
})(Tethered);
