// Entry point: canvas setup, input, game state, fixed-timestep loop.
window.Tethered = window.Tethered || {};

(function (S) {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let game;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (game) {
      game.width = canvas.width;
      game.height = canvas.height;
    }
  }
  window.addEventListener('resize', resize);
  resize();

  function reset() {
    // Exposed as Tethered.game for debugging and tuning from the console.
    game = S.game = {
      width: canvas.width,
      height: canvas.height,
      ball: S.createBall(canvas.width, canvas.height),
      tether: { active: false, restLength: 0, stretch: 0 },
      enemies: [],
      pops: [], // enemy death pop animations
      playerPop: null, // the (much bigger) player death pop, set on death
      coins: [], // dropped by popped enemies (includes health pickups)
      paddles: [], // edge-patrolling launch paddles, granted by the PADDLE upgrade
      particles: [], // green sparks from grabbed health pickups

      mouse: { x: canvas.width / 2, y: canvas.height / 2 },
      combo: 1,
      level: 1,
      coinProgress: 0, // coins collected toward the next level
      stats: S.createStats(), // per-run stats raised by level-up upgrades
      pendingLevelUps: 0, // level-ups awaiting an upgrade pick
      upgradeChoices: null, // the three cards on offer while state is 'levelup'
      time: 0,
      spawnTimer: S.TUNING.SPAWN_INTERVAL_START,
      slowmo: { scale: 1, cooldown: 0, recovering: false }, // world time scale around the vulnerability drop
      state: 'playing',
    };
  }

  function updateMouse(e) {
    const rect = canvas.getBoundingClientRect();
    game.mouse.x = e.clientX - rect.left;
    game.mouse.y = e.clientY - rect.top;
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
    S.updateCombo(game);
  }

  // World time scale: as the ball's speed falls through the flash window the
  // world eases toward SLOWMO_MIN_SCALE, bottoming out at the instant it
  // drops vulnerable, then quickly but continuously ramps back to full speed.
  // Crossing the threshold consumes the trigger for SLOWMO_COOLDOWN real
  // seconds. Runs on real (unscaled) frame time.
  function updateSlowmo(dt) {
    const T = S.TUNING;
    const sm = game.slowmo;
    if (sm.cooldown > 0) sm.cooldown -= dt;
    if (game.state !== 'playing') {
      sm.scale = 1;
      sm.recovering = false;
      return;
    }
    const speed = S.ballSpeed(game.ball);
    if (sm.recovering) {
      sm.scale += ((1 - T.SLOWMO_MIN_SCALE) / T.SLOWMO_RECOVER_TIME) * dt;
      if (sm.scale >= 1) {
        sm.scale = 1;
        sm.recovering = false;
      }
    } else if (sm.scale < 1 && speed <= T.SPEED_THRESHOLD) {
      // The slowdown was engaged and the ball just went vulnerable: snap back.
      sm.recovering = true;
      sm.cooldown = T.SLOWMO_COOLDOWN;
    } else if (sm.cooldown <= 0 && speed > T.SPEED_THRESHOLD &&
               speed < T.SPEED_THRESHOLD + T.SPEED_FLASH_WINDOW) {
      sm.scale = T.SLOWMO_MIN_SCALE + (1 - T.SLOWMO_MIN_SCALE) *
        (speed - T.SPEED_THRESHOLD) / T.SPEED_FLASH_WINDOW;
    } else {
      sm.scale = 1;
    }
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
      updateSlowmo(dt);
      acc += dt * game.slowmo.scale;
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
