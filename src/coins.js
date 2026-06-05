// Coins dropped by popped enemies, gentle magnetism toward the ball, leveling.
window.Swangin = window.Swangin || {};

(function (S) {
  // Coins needed to clear the given level.
  S.coinsForLevel = function (level) {
    const T = S.TUNING;
    return Math.round(T.LEVEL_COINS_BASE * Math.pow(T.LEVEL_COINS_GROWTH, level - 1));
  };

  // Scatter a burst of coins where an enemy was popped, × the current combo.
  S.spawnCoinBurst = function (game, x, y) {
    const T = S.TUNING;
    const base = T.COINS_PER_KILL_MIN +
      Math.floor(Math.random() * (T.COINS_PER_KILL_MAX - T.COINS_PER_KILL_MIN + 1));
    const count = base * game.combo;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = T.COIN_BURST_SPEED * (0.3 + 0.7 * Math.random());
      game.coins.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: T.COIN_RADIUS,
        age: 0,
        spin: Math.random() * Math.PI * 2, // render phase for the spin shimmer
      });
    }
  };

  S.updateCoins = function (game, dt) {
    const T = S.TUNING;
    const b = game.ball;
    const decay = Math.exp(-T.COIN_DRAG * dt);

    for (let i = game.coins.length - 1; i >= 0; i--) {
      const c = game.coins[i];
      c.age += dt;
      if (c.age >= T.COIN_LIFETIME) {
        game.coins.splice(i, 1);
        continue;
      }

      const dx = b.x - c.x;
      const dy = b.y - c.y;
      const dist = Math.hypot(dx, dy) || 1;

      // Scooped up on contact with the ball.
      if (dist < b.r + c.r) {
        game.coins.splice(i, 1);
        game.coinProgress += 1;
        while (game.coinProgress >= S.coinsForLevel(game.level)) {
          game.coinProgress -= S.coinsForLevel(game.level);
          game.level += 1; // leveling up does nothing yet
        }
        continue;
      }

      // Gentle magnetism toward the ball — radius matches the grab handle.
      if (dist < T.COIN_MAGNET_RADIUS) {
        const pull = T.COIN_MAGNET_ACCEL * (1 - dist / T.COIN_MAGNET_RADIUS);
        c.vx += (dx / dist) * pull * dt;
        c.vy += (dy / dist) * pull * dt;
      }

      c.vx *= decay;
      c.vy *= decay;
      c.x += c.vx * dt;
      c.y += c.vy * dt;

      // Keep coins inside the arena with a soft bounce.
      if (c.x - c.r < 0) { c.x = c.r; c.vx = -c.vx * 0.6; }
      else if (c.x + c.r > game.width) { c.x = game.width - c.r; c.vx = -c.vx * 0.6; }
      if (c.y - c.r < 0) { c.y = c.r; c.vy = -c.vy * 0.6; }
      else if (c.y + c.r > game.height) { c.y = game.height - c.r; c.vy = -c.vy * 0.6; }
    }
  };
})(Swangin);
