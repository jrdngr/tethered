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
    S.updateCamera(game, 0); // pure re-clamp (dt 0): no drift while paused
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (game) applyArenaSize();
  }
  window.addEventListener('resize', resize);
  resize();

  // Load depth `depth` into `game`: generate the map, place shapes/enemies/
  // exit, reset the per-map transient state, and snap everything to the new
  // spawn. Run-persistent state (hp, stats, upgrades, level, coins) is left
  // untouched — reset() seeds it, nextMap() carries it across.
  function setupMap(depth) {
    const map = S.generateMap(depth);
    game.depth = depth;
    game.map = map;
    game.world = { w: map.w, h: map.h };
    game.enemies = [];
    game.pops = [];
    game.projectiles = [];
    game.coins = [];
    game.particles = [];
    game.floaters = [];
    game.playerPop = null;
    game.tether = S.createTether();
    game.weaponState = { active: false, tailAngle: 0, tailVel: 0 };
    game.combo = 1;
    game.comboIdle = 0;
    game.ball.x = map.spawn.x;
    game.ball.y = map.spawn.y;
    game.ball.vx = 0;
    game.ball.vy = 0;
    game.mouse = { x: map.spawn.x, y: map.spawn.y };
    game.camera = S.createCamera(game);
    game.flow = S.createFlow(map); // BFS chase field, recomputed as the ball moves
    S.placeObstacles(game); // freestanding shapes in the rooms (not corridors)
    S.pickMapTheme(game); // optional themed-floor skew
    S.placeEnemies(game); // the room patterns + exit garrison
    game.exit = { x: map.exit.x, y: map.exit.y, r: S.TUNING.EXIT_RADIUS, channel: 0 };
    game.state = S.STATE.PLAYING;
  }

  function reset() {
    const w = S.arenaWidth(canvas.width);
    // A run starts at depth 1; death always restarts here (full-run stakes).
    // Exposed as Tethered.game for debugging and tuning from the console.
    game = S.game = {
      width: w, // viewport — see the coordinate-spaces note above
      height: playHeight(),
      depth: 1,
      ball: S.createBall(0, 0), // repositioned by setupMap
      paddles: [], // edge-patrolling launch paddles, granted by the PADDLE upgrade
      obstacles: [],
      mouseScreen: { x: w / 2, y: playHeight() / 2 },
      combo: 1,
      comboIdle: 0, // s since the combo last changed; COMBO_TIMEOUT resets it
      level: 1,
      coinProgress: 0, // coins collected toward the next level
      kills: 0, // run kill count (shown on the end screens)
      stats: S.createStats(), // per-run stats raised by level-up upgrades
      upgradeLevels: {}, // upgrade name -> level picked this run (absent = 0)
      pendingLevelUps: 0, // level-ups awaiting an upgrade pick
      upgradeChoices: null, // the cards on offer while state is 'levelup'
      time: 0,
      timeScale: 1, // global physics time scale; bash kills drop it for slow-mo
      freeze: 0, // s of hit-stop left; physics pauses while it runs down
      shake: { x: 0, y: 0, mag: 0 }, // screen-shake offset; decays on real time
      flash: 0, // s of bash screen flash left
      state: S.STATE.PLAYING,
    };
    setupMap(1);
  }

  // Reached the exit: bank leftover coins, then advance a depth (healing) or
  // win the run on the final depth. Persistent state rides along on `game`.
  function nextMap() {
    // Auto-credit the floor's uncollected coins — the kill, not the sweep,
    // is what pays. Credit by hand (not onScoop) so the level-up isn't
    // triggered until after the new map loads (setupMap would clobber the
    // state otherwise); any queued picks surface over the new map.
    for (const c of game.coins) {
      if (c.type !== 'coin') continue;
      game.coinProgress += c.value;
      while (game.coinProgress >= S.coinsForLevel(game.level)) {
        game.coinProgress -= S.coinsForLevel(game.level);
        game.level += 1;
        game.pendingLevelUps += 1;
      }
    }
    if (game.depth >= S.TUNING.MAX_DEPTH) {
      game.state = S.STATE.VICTORY;
      return;
    }
    setupMap(game.depth + 1);
    const heal = game.stats.maxHp * S.TUNING.HEAL_ON_EXIT_FRACTION;
    game.ball.hp = Math.min(game.stats.maxHp, game.ball.hp + heal);
    if (game.pendingLevelUps > 0) S.startLevelUp(game); // banked-coin picks
  }

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
    let wx = Math.max(0, Math.min(game.camera.x + game.mouseScreen.x, game.world.w));
    let wy = Math.max(0, Math.min(game.camera.y + game.mouseScreen.y, game.world.h));
    // Keep the anchor on floor, so a cursor dragged into the rock stays a
    // reachable point for the rope (and never anchors inside a wall).
    if (game.map) {
      const p = S.nearestFloorPoint(game.map, wx, wy);
      wx = p.x;
      wy = p.y;
    }
    game.mouse.x = wx;
    game.mouse.y = wy;
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
    if (game.state === S.STATE.GAMEOVER || game.state === S.STATE.VICTORY) {
      reset();
      return;
    }
    if (game.state === S.STATE.LEVELUP) {
      // Cards live in screen space — pick with the viewport point, not the
      // world anchor.
      S.pickUpgradeAt(game, game.mouseScreen.x, game.mouseScreen.y);
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
      S.insertObstaclePegs(game); // interior-shape wrap pivots ride the same queries
      S.updateFlow(game, dt); // refresh the BFS chase field before the brains read it
      S.updateTether(game, dt);
      S.updateBall(game, dt);
      S.updateWeapons(game, dt);
      if (updateExit(dt)) return; // channel completed → map transitioned this frame
    }
    S.updatePaddles(game, dt);
    S.updateEnemies(game, dt);
    S.updateCoins(game, dt);
    S.updateCombo(game, dt);
    // Camera last, on this step's (scaled) time: render sees the settled
    // ball, and a bash slow-mo holds the frame instead of panning through it.
    S.updateCamera(game, dt);
  }

  // The exit. A strong magnet (coins-law accel, zero at the rim) snaps a
  // free-flying ball onto the exit — but it's cut while the rope is held, so
  // a tethered player keeps control and can pull away. Sitting inside the
  // exit charges the channel (no speed gate); leaving resets it (a hit
  // resets it via combo.js). A full channel transitions. Returns true if it did.
  function updateExit(dt) {
    const T = S.TUNING;
    const ex = game.exit;
    if (!ex || game.state !== S.STATE.PLAYING) return false;
    const b = game.ball;
    const dx = ex.x - b.x;
    const dy = ex.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < T.EXIT_MAGNET_RADIUS && d > 1e-3) {
      let f = T.EXIT_MAGNET_ACCEL * (1 - d / T.EXIT_MAGNET_RADIUS);
      if (game.tether.active) f *= T.EXIT_MAGNET_TETHER_MULT;
      b.vx += (dx / d) * f * dt;
      b.vy += (dy / d) * f * dt;
    }
    if (d < ex.r) {
      ex.channel += dt;
      if (ex.channel >= T.EXIT_CHANNEL_TIME) {
        nextMap();
        return true;
      }
    } else {
      ex.channel = 0; // left the pad — start over
    }
    return false;
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
