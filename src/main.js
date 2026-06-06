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
      playerPop: null, // the (much bigger) player death pop, set on death
      coins: [], // dropped by popped enemies (includes health pickups)
      paddles: [], // edge-patrolling launch paddles, granted by the PADDLE upgrade
      particles: [], // green sparks from grabbed health pickups
      weaponState: { active: false }, // weapons arm on tether release, expire when slow

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
      spawnTimer: S.TUNING.SPAWN_INTERVAL_START,
      state: S.STATE.PLAYING,
    };
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
      S.updateTether(game, dt);
      S.updateBall(game, dt);
      S.updateWeapons(game);
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
        update(STEP);
        acc -= STEP;
      }
    } else {
      acc = 0; // freeze physics (and game.time, shown as the final survival time)
    }

    S.drawGame(ctx, game);
    requestAnimationFrame(frame);
  }

  reset();
  requestAnimationFrame(frame);
})(Tethered);
