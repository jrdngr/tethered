// Entry point: canvas setup, input, game state, fixed-timestep loop.
window.Tethered = window.Tethered || {};

(function (S) {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let game;

  // Two coordinate spaces. The WORLD (game.world, scrolled over by
  // game.camera) is where gameplay lives — ball, enemies, tether anchor.
  // The VIEWPORT (game.width/height: the canvas minus the HUD band and the
  // dev panel column) is where UI lives — HUD, overlay cards, flashes.
  // Rendering translates world layers by the camera; input converts the
  // other way at event time.
  function playHeight() {
    return canvas.height - S.TUNING.HUD_HEIGHT;
  }

  // Recompute the viewport from the canvas and the dev panel — called on
  // window resize and when the panel toggles. The world is untouched; the
  // camera just re-clamps to the new view size.
  function applyArenaSize() {
    game.width = S.arenaWidth(canvas.width);
    game.height = playHeight();
    if (game.camera && game.world) S.updateCamera(game, 0); // re-clamp to the new view
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (game) applyArenaSize();
  }
  window.addEventListener('resize', resize);
  resize();

  // Build a fresh run: one big fixed arena with endless waves. The
  // world-border bounce in ball.js gives the walls; the wave number drives
  // game.depth, so enemy stat-scaling and type unlocks ramp difficulty for
  // free. Boot lands here, and death restarts into here.
  function beginRun() {
    const T = S.TUNING;
    const w = S.arenaWidth(canvas.width);
    game = S.game = {
      width: w, // viewport — see the coordinate-spaces note above
      height: playHeight(),
      world: { w: T.ARENA_W, h: T.ARENA_H },
      depth: 0, // the first updateWaves bumps to wave 1
      ball: S.createBall(T.ARENA_W / 2, T.ARENA_H / 2),
      mouseScreen: { x: w / 2, y: playHeight() / 2 },
      mouse: { x: T.ARENA_W / 2, y: T.ARENA_H / 2 },
      wave: { number: 0, betweenTimer: 0 },
      enemies: [],
      pops: [],
      projectiles: [],
      pickups: [],
      particles: [],
      playerPop: null,
      tether: S.createTether(),
      combo: 1,
      comboIdle: 0, // s since the combo last changed; COMBO_TIMEOUT resets it
      kills: 0, // run kill count (shown on the end screen)
      time: 0,
      timeScale: 1, // global physics time scale; bash kills drop it for slow-mo
      freeze: 0, // s of hit-stop left; physics pauses while it runs down
      shake: { x: 0, y: 0, mag: 0 }, // the frame loop jiggles/decays this every frame
      flash: 0, // s of bash screen flash left
      keyAdjust: 0, // A/D rope-length nudge: -1 | 0 | +1
      state: S.STATE.PLAYING,
    };
    game.camera = S.createCamera(game);
  }

  // Dev-panel RESTART action (defined here, where beginRun lives).
  S.restartRun = function () {
    if (game.tether) S.releaseTether(game);
    beginRun();
  };

  // Raw canvas coordinates, for the dev panel (it sits outside the play area).
  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function updateMouse(e) {
    const p = canvasPoint(e);
    // Viewport coordinates; clamp so a cursor over the HUD (or the dev
    // panel) anchors the tether at the view's edge instead of inside the UI.
    game.mouseScreen.x = Math.max(Math.min(p.x, game.width), 0);
    game.mouseScreen.y = Math.max(p.y - S.TUNING.HUD_HEIGHT, 0);
    // World anchor = camera + screen, captured NOW (event time) and clamped
    // into the world. Recomputing this per frame would make a parked cursor
    // drift with the camera — the anchor must stay planted.
    game.mouse.x = Math.max(0, Math.min(game.camera.x + game.mouseScreen.x, game.world.w));
    game.mouse.y = Math.max(0, Math.min(game.camera.y + game.mouseScreen.y, game.world.h));
  }

  canvas.addEventListener('mousemove', (e) => {
    updateMouse(e);
    const p = canvasPoint(e);
    S.devHover(game, canvas.width, p.x, p.y);
  });
  canvas.addEventListener('mousedown', (e) => {
    S.audio.unlock(); // first user gesture — autoplay policy gate
    // Clicks in the dev panel column go to its buttons and never reach the
    // game — no grabbing the ball or restarting through it.
    const p = canvasPoint(e);
    if (S.dev.open && p.x >= game.width) {
      S.devClick(game, canvas.width, p.x, p.y);
      return;
    }
    updateMouse(e);
    if (game.state === S.STATE.GAMEOVER) {
      beginRun(); // instant restart
      return;
    }
    if (game.state !== S.STATE.PLAYING) return; // no grabbing the popped ball
    S.tryGrab(game); // classic grab (A/D adjusts length while held)
  });
  window.addEventListener('mouseup', () => {
    if (game.tether) S.releaseTether(game);
  });
  window.addEventListener('blur', () => { if (game.tether) S.releaseTether(game); });

  // Keyboard: dev-panel toggle, plus the A/D rope-length keys. Closing the
  // dev panel force-resumes so the game can't sit in an invisible pause;
  // invincibility deliberately persists while hidden.
  window.addEventListener('keydown', (e) => {
    if (e.code === S.TUNING.DEV_PANEL_TOGGLE) {
      S.dev.open = !S.dev.open;
      if (!S.dev.open) S.dev.paused = false;
      applyArenaSize();
      return;
    }
    if (e.code === 'KeyA') game.keyAdjust = -1; // shrink the rope
    else if (e.code === 'KeyD') game.keyAdjust = 1; // grow the rope
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA' && game.keyAdjust < 0) game.keyAdjust = 0;
    else if (e.code === 'KeyD' && game.keyAdjust > 0) game.keyAdjust = 0;
  });

  // ORDERING CONTRACT — the call order below (and within the callees) is
  // load-bearing. Violations produce subtle, hard-to-bisect bugs (stale
  // positions, double-hits, one-step-late pickups), so don't reorder during
  // a refactor without rechecking each invariant:
  //
  // 1. Broadphase rebuild before any query. The grid re-buckets at the top
  //    of the step — wrap detection queries it against positions nothing has
  //    yet mutated (spawners grid.insert as they go) — and again inside
  //    updateEnemies before separation, once the brains have moved everyone.
  // 2. Tether snapshot next. updateTether runs before every mover and
  //    stamps prev-step positions (mouse, ball, enemies) when it finishes,
  //    so next step's wrap sweep tests compare consistent prev/cur pairs
  //    that bracket all position mutations. The stamp is intentionally
  //    always-on, even untethered — a fresh grab must never compare against
  //    stale positions (see tether.js). The tether pass also writes the
  //    wrap drag into enemy kx/ky, which the brains integrate later this
  //    same step.
  // 3. Body-contact kills only flag `dead`; a single end-of-update filter in
  //    updateEnemies removes them, so mid-iteration kills can't corrupt the
  //    loop indices.
  // 4. Pickups after enemies. Pickups spawned by this step's deaths are
  //    integrated (and scoopable) the same step, never one step late.
  //
  // render.js's LAYERS table has the matching draw-order contract.
  function update(dt) {
    const T = S.TUNING;
    if (game.state === S.STATE.DYING) {
      // Death pop playing out: the ball and survival clock are frozen, the
      // rest of the world coasts. Show the overlay once the last ring fades.
      game.playerPop.t += dt;
      const total = T.PLAYER_POP_DURATION + (T.PLAYER_POP_RINGS - 1) * T.PLAYER_POP_RING_LAG;
      if (game.playerPop.t >= total) game.state = S.STATE.GAMEOVER;
    } else {
      game.time += dt;
      S.grid.rebuild(game.enemies); // broadphase for this step's wrap queries
      S.updateTether(game, dt);
      S.updateBall(game, dt);
    }
    S.updateEnemies(game, dt);
    S.updateWaves(game, dt); // spawn the next wave once the floor clears
    S.updatePickups(game, dt);
    S.updateCombo(game, dt);
    // Camera last, on this step's (scaled) time: render sees the settled
    // ball, and a bash slow-mo holds the frame instead of panning through it.
    S.updateCamera(game, dt);
  }

  // Fixed-timestep physics accumulated from rAF; render every frame.
  const STEP = 1 / S.TUNING.PHYSICS_HZ;
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.1); // avoid spiral of death after a background tab

    // Physics runs while playing and through the death animation — unless
    // the dev panel has it paused (rendering continues either way).
    const live = () => !S.dev.paused &&
      (game.state === S.STATE.PLAYING || game.state === S.STATE.DYING);
    if (live()) {
      acc += dt;
      while (acc >= STEP && live()) {
        if (game.freeze > 0) {
          // Hit-stop: real time passes but the world doesn't move —
          // rendering continues every frame, so the freeze reads as impact
          // weight, not a stutter.
          game.freeze -= STEP;
        } else {
          // Slow-mo: the accumulator consumes real time (same number of
          // steps per frame), each step just simulates less of it — so
          // rendering stays per-frame smooth while the world slows.
          update(STEP * game.timeScale);
          // Ease back toward full speed on *real* step time — recovering on
          // scaled time would never finish.
          game.timeScale = 1 + (game.timeScale - 1) * Math.exp(-S.TUNING.SLOWMO_RECOVERY * STEP);
        }
        acc -= STEP;
      }
    } else {
      acc = 0; // freeze physics (and game.time, shown as the final survival time)
    }

    // Shake jiggles/decays and the bash flash fades on real frame time, so
    // they animate smoothly through hit-stop and pauses.
    const sh = game.shake;
    sh.mag *= Math.exp(-S.TUNING.SHAKE_DECAY * dt);
    if (sh.mag < 0.05) sh.mag = 0;
    const ang = Math.random() * Math.PI * 2;
    sh.x = Math.cos(ang) * sh.mag;
    sh.y = Math.sin(ang) * sh.mag;
    if (game.flash > 0) game.flash -= dt;

    S.drawGame(ctx, game);
    requestAnimationFrame(frame);
  }

  beginRun();
  requestAnimationFrame(frame);
})(Tethered);
