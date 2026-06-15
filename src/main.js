// Entry point: canvas setup, input, game state, fixed-timestep loop.
window.Tethered = window.Tethered || {};

(function (S) {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let game;

  // Run config chosen on the start menu. Module-scoped (not on game) so it
  // survives the reset that rebuilds game; the menu writes it, beginRun reads it.
  let config = { mode: 'arena', upgrades: false };

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
    if (game.camera && game.world) S.updateCamera(game, 0); // re-clamp; skipped on the menu (no world yet)
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
    S.placeEnemies(game); // the room patterns + the debut; tags enemies by room
    game.exit = { x: map.exit.x, y: map.exit.y, r: S.TUNING.EXIT_RADIUS, channel: 0, magnetLockout: 0 };
    S.buildRooms(game); // arena state + corridor gates; seals the start room
    game.state = S.STATE.PLAYING;
  }

  // Back to the start menu: a minimal game carrying only what the menu and the
  // frame loop touch (no world/ball/camera/tether yet). Boot lands here.
  function reset() {
    const w = S.arenaWidth(canvas.width);
    game = S.game = {
      width: w, // viewport — see the coordinate-spaces note above
      height: playHeight(),
      mouseScreen: { x: w / 2, y: playHeight() / 2 },
      config, // live reference: the menu draws and edits the current selections
      time: 0,
      timeScale: 1,
      freeze: 0,
      shake: { x: 0, y: 0, mag: 0 }, // the frame loop jiggles/decays this every frame
      flash: 0,
      state: S.STATE.MENU,
    };
  }

  // Start a run with the menu's current config. Builds the run-persistent state
  // (the old reset() body), then the chosen world. Death/victory calls this to
  // relaunch the same mode. Exposed as Tethered.game for console tuning.
  function beginRun() {
    const w = S.arenaWidth(canvas.width);
    game = S.game = {
      width: w,
      height: playHeight(),
      depth: 1,
      ball: S.createBall(0, 0), // repositioned by the world setup
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
      config, // live reference to the menu's selections
      mode: config.mode, // 'arena' | 'dungeon' — fixed for the run
      upgradesEnabled: config.upgrades, // gates the level-up cards (both modes)
      keyAdjust: 0, // A/D rope-length nudge: -1 | 0 | +1 (both modes)
      state: S.STATE.PLAYING,
    };
    if (game.mode === 'arena') setupArena();
    else setupMap(1);
  }

  // Arena world: one big fixed rectangle with endless waves. Mirrors setupMap's
  // transient resets but skips dungeon generation — the world-border bounce in
  // ball.js gives the walls, and a lightweight map stub keeps the enemy brains
  // (which read map.isWall/clearance) and the map-guarded collision sites happy.
  function setupArena() {
    const T = S.TUNING;
    const ts = T.TILE_SIZE;
    const tw = Math.ceil(T.ARENA_W / ts);
    const th = Math.ceil(T.ARENA_H / ts);
    game.depth = 0; // the first updateWaves bumps to wave 1 / depth 1
    game.world = { w: T.ARENA_W, h: T.ARENA_H };
    // Open-interior stub: isWall true only outside the tile grid (so LOS is
    // always clear and orbits never clamp); segGrid:null makes collideCircleWalls
    // a no-op; wallLoops:null makes drawWalls and the minimap skip.
    game.map = {
      w: T.ARENA_W, h: T.ARENA_H, tw, th, seed: 0,
      isWall: (tx, ty) => tx < 0 || ty < 0 || tx >= tw || ty >= th,
      clearance: new Int16Array(tw * th).fill(999), // never tight
      tileToWorld: (tx, ty) => ({ x: (tx + 0.5) * ts, y: (ty + 0.5) * ts }),
      spawn: { x: T.ARENA_W / 2, y: T.ARENA_H / 2 },
      segGrid: null, wallLoops: null, chambers: [], corridorEdges: [],
    };
    game.flow = null; // open arena: straight-line LOS, no pathfinding
    game.exit = null; // no exit-to-next-depth; waves are the progression
    game.gates = []; // never sealed (no rooms)
    game.wave = { number: 0, betweenTimer: 0 };

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
    game.obstacles = []; // empty arena — no wrappable pillars
    game.ball.x = game.map.spawn.x;
    game.ball.y = game.map.spawn.y;
    game.ball.vx = 0;
    game.ball.vy = 0;
    game.mouse = { x: game.map.spawn.x, y: game.map.spawn.y };
    game.camera = S.createCamera(game);
    game.state = S.STATE.PLAYING;
  }

  // Start-menu click: toggle the option under the cursor, or START the run.
  S.menuClick = function (g) {
    for (const wdg of S.menuWidgets(g)) {
      if (wdg.disabled) continue;
      if (g.mouseScreen.x >= wdg.x && g.mouseScreen.x <= wdg.x + wdg.w &&
          g.mouseScreen.y >= wdg.y && g.mouseScreen.y <= wdg.y + wdg.h) {
        if (wdg.id === 'mode') config.mode = wdg.value;
        else if (wdg.id === 'upgrades') config.upgrades = !config.upgrades;
        else if (wdg.id === 'start') beginRun();
        return;
      }
    }
  };

  // Dev-panel actions (defined here, where config/beginRun/reset live).
  S.toMenu = function () {
    if (game.tether) S.releaseTether(game);
    reset();
  };

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
    if (game.upgradesEnabled && game.pendingLevelUps > 0) S.startLevelUp(game); // banked-coin picks
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
    if (!game.camera || !game.world) return; // menu: no world to anchor into
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
    if (game.state === S.STATE.MENU) {
      S.menuClick(game);
      return;
    }
    if (game.state === S.STATE.GAMEOVER || game.state === S.STATE.VICTORY) {
      beginRun(); // instant restart — same mode/upgrades
      return;
    }
    if (game.state === S.STATE.LEVELUP) {
      // Cards live in screen space — pick with the viewport point, not the
      // world anchor.
      S.pickUpgradeAt(game, game.mouseScreen.x, game.mouseScreen.y);
      return;
    }
    if (game.state !== S.STATE.PLAYING) return; // no grabbing the popped ball
    S.tryGrab(game); // both modes: classic grab (A/D adjusts length while held)
  });
  window.addEventListener('mouseup', () => {
    if (game.tether) S.releaseTether(game);
  });
  window.addEventListener('blur', () => { if (game.tether) S.releaseTether(game); });

  // Keyboard: dev-panel toggle, plus the A/D rope-length keys (both modes).
  // Closing the dev panel force-resumes so the game can't sit in an invisible
  // pause; invincibility deliberately persists while hidden.
  window.addEventListener('keydown', (e) => {
    if (e.code === S.TUNING.DEV_PANEL_TOGGLE) {
      S.dev.open = !S.dev.open;
      if (!S.dev.open) S.dev.paused = false;
      applyArenaSize();
      return;
    }
    if (game.keyAdjust === undefined) return; // no active run (menu / end screens)
    if (e.code === 'KeyA') game.keyAdjust = -1; // shrink the rope
    else if (e.code === 'KeyD') game.keyAdjust = 1; // grow the rope
  });
  window.addEventListener('keyup', (e) => {
    if (game.keyAdjust === undefined) return;
    if (e.code === 'KeyA' && game.keyAdjust < 0) game.keyAdjust = 0;
    else if (e.code === 'KeyD' && game.keyAdjust > 0) game.keyAdjust = 0;
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
    S.updateEnemies(game, dt);
    S.updateWaves(game, dt); // arena: spawn the next wave once the floor clears (no-op in dungeon)
    S.updateArena(game); // seal/clear rooms now that this step's kills are in (no-op in arena)
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
    if (ex.magnetLockout > 0) ex.magnetLockout -= dt;
    // The magnet is off briefly after a hit, so the knockback clears the
    // exit instead of being sucked straight back in.
    if (ex.magnetLockout <= 0 && d < T.EXIT_MAGNET_RADIUS && d > 1e-3) {
      let strength = 1 - d / T.EXIT_MAGNET_RADIUS; // 1 at center, 0 at the rim
      if (game.tether.active) strength *= T.EXIT_MAGNET_TETHER_MULT;
      // Pull toward the exit...
      const f = T.EXIT_MAGNET_ACCEL * strength;
      b.vx += (dx / d) * f * dt;
      b.vy += (dy / d) * f * dt;
      // ...and bleed off speed so a fast ball settles in instead of sailing
      // through (strongest at the center, none at the rim).
      const damp = Math.exp(-T.EXIT_MAGNET_DAMP * strength * dt);
      b.vx *= damp;
      b.vy *= damp;
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
