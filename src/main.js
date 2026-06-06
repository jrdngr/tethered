// Entry point: canvas setup, input, game state, fixed-timestep loop.
window.Tethered = window.Tethered || {};

(function (S) {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let game;

  // The game's coordinate space is the play area: the canvas minus the HUD
  // band reserved at the top. Rendering translates the world down by
  // HUD_HEIGHT so game elements never pass under the UI.
  function playHeight() {
    return canvas.height - S.TUNING.HUD_HEIGHT;
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (game) {
      game.width = canvas.width;
      game.height = playHeight();
    }
  }
  window.addEventListener('resize', resize);
  resize();

  function reset() {
    // Exposed as Tethered.game for debugging and tuning from the console.
    game = S.game = {
      width: canvas.width,
      height: playHeight(),
      ball: S.createBall(canvas.width, playHeight()),
      tether: { active: false, restLength: 0, stretch: 0, wraps: [], pmx: 0, pmy: 0, pbx: 0, pby: 0 },
      enemies: [],
      pops: [], // enemy death pop animations
      playerPop: null, // the (much bigger) player death pop, set on death
      coins: [], // dropped by popped enemies (includes health pickups)
      paddles: [], // edge-patrolling launch paddles, granted by the PADDLE upgrade
      particles: [], // green sparks from grabbed health pickups

      mouse: { x: canvas.width / 2, y: playHeight() / 2 },
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
      state: 'playing',
    };
  }

  function updateMouse(e) {
    const rect = canvas.getBoundingClientRect();
    game.mouse.x = e.clientX - rect.left;
    // Play-area coordinates; clamp so a cursor over the HUD anchors the
    // tether at the arena's top edge instead of inside the UI.
    game.mouse.y = Math.max(e.clientY - rect.top - S.TUNING.HUD_HEIGHT, 0);
  }

  canvas.addEventListener('mousemove', updateMouse);
  canvas.addEventListener('mousedown', (e) => {
    updateMouse(e);
    if (game.state === 'gameover') {
      reset();
      return;
    }
    if (game.state === 'levelup') {
      S.pickUpgradeAt(game, game.mouse.x, game.mouse.y);
      return;
    }
    if (game.state !== 'playing') return; // no grabbing the popped ball
    S.tryGrab(game);
  });
  window.addEventListener('mouseup', () => S.releaseTether(game));
  window.addEventListener('blur', () => S.releaseTether(game));

  function update(dt) {
    const T = S.TUNING;
    if (game.state === 'dying') {
      // Death pop playing out: the ball and survival clock are frozen, the
      // rest of the world coasts. Show the overlay once the last ring fades.
      game.playerPop.t += dt;
      const total = T.PLAYER_POP_DURATION + (T.PLAYER_POP_RINGS - 1) * T.PLAYER_POP_RING_LAG;
      if (game.playerPop.t >= total) game.state = 'gameover';
    } else {
      game.time += dt;
      S.updateTether(game, dt);
      S.updateBall(game, dt);
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

    // Physics runs while playing and through the death animation.
    const live = () => game.state === 'playing' || game.state === 'dying';
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
