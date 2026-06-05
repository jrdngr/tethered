// Coins and health pickups dropped by popped enemies, gentle magnetism
// toward the ball, leveling.
window.Tethered = window.Tethered || {};

(function (S) {
  // Coins needed to clear the given level.
  S.coinsForLevel = function (level) {
    const T = S.TUNING;
    return Math.round(T.LEVEL_COINS_BASE * Math.pow(T.LEVEL_COINS_GROWTH, level - 1));
  };

  // Scatter a burst of coins where an enemy was popped, × the current combo
  // (and × an optional per-enemy multiplier — tanks pay out more).
  S.spawnCoinBurst = function (game, x, y, mult) {
    const T = S.TUNING;
    const base = T.COINS_PER_KILL_MIN +
      Math.floor(Math.random() * (T.COINS_PER_KILL_MAX - T.COINS_PER_KILL_MIN + 1));
    const count = base * game.combo * (mult || 1);
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

  // Rare health drop where an enemy was popped. It lives in the coins array
  // and shares the same physics and magnetism, but heals on pickup instead
  // of counting toward the level.
  S.spawnHealthPickup = function (game, x, y) {
    const T = S.TUNING;
    const angle = Math.random() * Math.PI * 2;
    const speed = T.COIN_BURST_SPEED * (0.3 + 0.7 * Math.random());
    game.coins.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: T.HEALTH_RADIUS,
      age: 0,
      spin: 0, // unused — health pickups don't spin
      heal: T.HEALTH_HEAL,
    });
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
        if (c.heal) {
          b.hp = Math.min(b.hp + c.heal, game.stats.maxHp);
          continue;
        }
        game.coinProgress += 1;
        while (game.coinProgress >= S.coinsForLevel(game.level)) {
          game.coinProgress -= S.coinsForLevel(game.level);
          game.level += 1;
          game.pendingLevelUps += 1; // each level pauses for an upgrade pick
        }
        if (game.pendingLevelUps > 0 && game.state === 'playing') {
          S.startLevelUp(game);
        }
        continue;
      }

      // Gentle magnetism toward the ball — radius starts at the grab handle
      // and grows with upgrades.
      if (dist < game.stats.magnetRadius) {
        const pull = game.stats.magnetAccel * (1 - dist / game.stats.magnetRadius);
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
})(Tethered);
