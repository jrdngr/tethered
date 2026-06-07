// Entry point: canvas setup, input, game state, fixed-timestep loop.
window.Tethered = window.Tethered || {};

(function (S) {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let game;

  // The game's coordinate space is the play area: the canvas minus the HUD
  // band reserved at the top and the dev panel column on the right (when
  // open). Rendering translates the world down by HUD_HEIGHT so game
  // elements never pass under the UI.
  function playHeight() {
    return canvas.height - S.TUNING.HUD_HEIGHT;
  }

  // Recompute the arena from the canvas and the dev panel — called on window
  // resize and when the panel toggles. A shrink self-corrects: the ball's
  // wall clamp snaps it back in, and enemies steer toward the (in-bounds)
  // ball.
  function applyArenaSize() {
    game.width = S.arenaWidth(canvas.width);
    game.height = playHeight();
    S.layoutObstacles(game); // obstacles sit at arena fractions — re-place them
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (game) applyArenaSize();
  }
  window.addEventListener('resize', resize);
  resize();

  function reset() {
    const w = S.arenaWidth(canvas.width);
    // Exposed as Tethered.game for debugging and tuning from the console.
    game = S.game = {
      width: w,
      height: playHeight(),
      ball: S.createBall(w, playHeight()),
      tether: S.createTether(),
      enemies: [],
      pops: [], // enemy death pop animations
      projectiles: [], // spitter shots
      playerPop: null, // the (much bigger) player death pop, set on death
      coins: [], // dropped by popped enemies (includes health pickups)
      paddles: [], // edge-patrolling launch paddles, granted by the PADDLE upgrade
      obstacles: [], // interior geometry; filled by cycleObstacles below
      obstacleLayout: 0, // index into OBSTACLE_LAYOUTS, set by cycleObstacles
      particles: [], // green sparks from grabbed health pickups
      floaters: [], // floating reward text (wrap bonuses)
      // Weapons arm on tether release, expire when slow; the floppy tail
      // keeps its own sprung world angle and angular velocity.
      weaponState: { active: false, tailAngle: 0, tailVel: 0 },

      mouse: { x: w / 2, y: playHeight() / 2 },
      combo: 1,
      comboIdle: 0, // s since the combo last changed; COMBO_TIMEOUT resets it
      level: 1,
      coinProgress: 0, // coins collected toward the next level
      stats: S.createStats(), // per-run stats raised by level-up upgrades
      upgradeLevels: {}, // upgrade name -> level picked this run (absent = 0)
      pendingLevelUps: 0, // level-ups awaiting an upgrade pick
      upgradeChoices: null, // the cards on offer while state is 'levelup'
      time: 0,
      timeScale: 1, // global physics time scale; bash kills drop it for slow-mo
      freeze: 0, // s of hit-stop left; physics pauses while it runs down
      shake: { x: 0, y: 0, mag: 0 }, // screen-shake offset; decays on real time
      flash: 0, // s of bash screen flash left
      spawnTimer: S.TUNING.SPAWN_INTERVAL_START,
      state: S.STATE.PLAYING,
    };
    S.cycleObstacles(game); // each run gets a random hand-placed layout
  }

  // Raw canvas coordinates, for the dev panel (it sits outside the play area).
  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function updateMouse(e) {
    const p = canvasPoint(e);
    // Play-area coordinates; clamp so a cursor over the HUD (or the dev
    // panel) anchors the tether at the arena's edge instead of inside the UI.
    game.mouse.x = Math.min(p.x, game.width);
    game.mouse.y = Math.max(p.y - S.TUNING.HUD_HEIGHT, 0);
  }

  canvas.addEventListener('mousemove', (e) => {
    updateMouse(e);
    const p = canvasPoint(e);
    S.devHover(game, canvas.width, p.x, p.y);
  });
  canvas.addEventListener('mousedown', (e) => {
    S.audio.unlock(); // first user gesture — autoplay policy gate
    // Clicks in the dev panel column go to its buttons and never reach the
    // game — no grabbing the ball, picking a card, or restarting through it.
    const p = canvasPoint(e);
    if (S.dev.open && p.x >= game.width) {
      S.devClick(game, canvas.width, p.x, p.y);
      return;
    }
    updateMouse(e);
    if (game.state === S.STATE.GAMEOVER) {
      reset();
      return;
    }
    if (game.state === S.STATE.LEVELUP) {
      S.pickUpgradeAt(game, game.mouse.x, game.mouse.y);
      return;
    }
    if (game.state !== S.STATE.PLAYING) return; // no grabbing the popped ball
    S.tryGrab(game);
  });
  window.addEventListener('mouseup', () => S.releaseTether(game));
  window.addEventListener('blur', () => S.releaseTether(game));

  // Dev panel toggle. Closing it force-resumes so the game can't sit in an
  // invisible pause; invincibility deliberately persists while hidden.
  window.addEventListener('keydown', (e) => {
    if (e.code !== S.TUNING.DEV_PANEL_TOGGLE) return;
    S.dev.open = !S.dev.open;
    if (!S.dev.open) S.dev.paused = false;
    applyArenaSize();
  });

  // ORDERING CONTRACT — the call order below (and within the callees) is
  // load-bearing. Violations produce subtle, hard-to-bisect bugs (stale
  // positions, double-hits, one-step-late pickups), so don't reorder during
  // a refactor without rechecking each invariant:
  //
  // 1. Broadphase rebuild before any query. The grid re-buckets at the top
  //    of the step — wrap detection and the weapon pass query it against
  //    positions nothing has yet mutated (spawners grid.insert as they go)
  //    — and again inside updateEnemies before separation, once the brains
  //    have moved everyone.
  // 2. Tether snapshot next. updateTether runs before every mover and
  //    stamps prev-step positions (mouse, ball, enemies) when it finishes,
  //    so next step's wrap sweep tests compare consistent prev/cur pairs
  //    that bracket all position mutations. The stamp is intentionally
  //    always-on, even untethered — a fresh grab must never compare against
  //    stale positions (see tether.js). The tether pass also writes the
  //    wrap drag into enemy kx/ky, which the brains integrate later this
  //    same step.
  // 3. Weapon pass before body collisions. Inside updateEnemies, the weapon
  //    collision pass runs first: kills are flagged dead and survivors are
  //    knocked out of body range, so the body-contact loop can't land a
  //    second hit on the same enemy in the same step.
  // 4. Corpse sweep last within updateEnemies. Kills (including pop-chain
  //    kills mid-loop) only flag `dead`; the single end-of-update filter
  //    removes them, so mid-iteration kills can't corrupt loop indices.
  // 5. Coins after enemies. Pickups spawned by this step's deaths are
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
      S.grid.rebuild(game.enemies); // broadphase for this step's wrap + weapon queries
      S.insertObstaclePegs(game); // obstacle wrap pivots ride the same queries
      S.updateTether(game, dt);
      S.updateBall(game, dt);
      S.updateWeapons(game, dt);
    }
    S.updatePaddles(game, dt);
    S.updateEnemies(game, dt);
    S.updateCoins(game, dt);
    S.updateCombo(game, dt);
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

  reset();
  requestAnimationFrame(frame);
})(Tethered);
