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
      coins: [], // dropped by popped enemies (includes health pickups)
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
    S.tryGrab(game);
  });
  window.addEventListener('mouseup', () => S.releaseTether(game));
  window.addEventListener('blur', () => S.releaseTether(game));

  function update(dt) {
    game.time += dt;
    S.updateTether(game, dt);
    S.updateBall(game, dt);
    S.updateEnemies(game, dt);
    S.updateCoins(game, dt);
    S.updateCombo(game);
  }

  // Fixed-timestep physics accumulated from rAF; render every frame.
  const STEP = 1 / S.TUNING.PHYSICS_HZ;
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.1); // avoid spiral of death after a background tab

    if (game.state === 'playing') {
      acc += dt;
      while (acc >= STEP && game.state === 'playing') {
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
