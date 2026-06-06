// Coins and health pickups dropped by popped enemies, gentle magnetism
// toward the ball, leveling.
window.Tethered = window.Tethered || {};

(function (S) {
  // Coins needed to clear the given level.
  S.coinsForLevel = function (level) {
    const T = S.TUNING;
    return Math.round(T.LEVEL_COINS_BASE * Math.pow(T.LEVEL_COINS_GROWTH, level - 1));
  };

  // Coin radius grows with denomination so the merged tiers read at a glance.
  function coinRadius(value) {
    const T = S.TUNING;
    return T.COIN_RADIUS * Math.pow(value, T.COIN_SIZE_GROWTH);
  }

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
        value: 1,
        spin: Math.random() * Math.PI * 2, // render phase for the pulse
      });
    }
  };

  // Rare health drop where an enemy was popped. It lives in the coins array
  // and shares the same physics and magnetism, but heals on pickup instead
  // of counting toward the level. Flung well clear of the pop, and immune to
  // scoop/magnetism for a grace period so the grab is a deliberate move.
  S.spawnHealthPickup = function (game, x, y) {
    const T = S.TUNING;
    const angle = Math.random() * Math.PI * 2;
    const speed = T.HEALTH_FLING_SPEED * (0.7 + 0.3 * Math.random());
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

  // Radial shockwave for pickups: shove every coin and health pickup within
  // `radius` of (x, y) away, fading linearly with distance. The pickup
  // counterpart of S.pushEnemies.
  S.pushCoins = function (game, x, y, speed, radius) {
    for (const c of game.coins) {
      const dx = c.x - x;
      const dy = c.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d >= radius) continue;
      const fade = 1 - d / radius;
      c.vx += (dx / d) * speed * fade;
      c.vy += (dy / d) * speed * fade;
    }
  };

  // Green spark burst where a health pickup was grabbed.
  function spawnHealParticles(game, x, y) {
    const T = S.TUNING;
    for (let i = 0; i < T.HEAL_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = T.HEAL_PARTICLE_SPEED * (0.3 + 0.7 * Math.random());
      game.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: T.HEAL_PARTICLE_LIFE * (0.6 + 0.4 * Math.random()),
      });
    }
  }

  S.updateCoins = function (game, dt) {
    const T = S.TUNING;
    const b = game.ball;
    const decay = Math.exp(-T.COIN_DRAG * dt);
    // The popped ball can't scoop or attract anything during the death pop.
    const playing = game.state === 'playing';

    // Advance heal-burst particles (same drag as coins).
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        game.particles.splice(i, 1);
        continue;
      }
      p.vx *= decay;
      p.vy *= decay;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // Count, per coin, how many same-value coins sit inside merge range
    // (itself included) — clusters short of a full merge group repel a
    // little instead of stacking.
    const near = new Array(game.coins.length).fill(1);
    for (let i = 0; i < game.coins.length; i++) {
      const a = game.coins[i];
      if (a.heal || !T.COIN_MERGE_COUNTS[a.value]) continue;
      for (let j = i + 1; j < game.coins.length; j++) {
        const o = game.coins[j];
        if (o.heal || o.value !== a.value) continue;
        const d = Math.hypot(o.x - a.x, o.y - a.y);
        if (d < (a.r + o.r) * T.COIN_MERGE_DIST_MULT) { near[i]++; near[j]++; }
      }
    }

    // Slow pairwise attraction between same-value coins that can still merge
    // up, so clusters drift together. Reaches double the coin's diameter.
    // Merge-close pairs short of a full group flip to a gentle repulsion, so
    // undersized clusters blob around each other until the last coin arrives.
    for (let i = 0; i < game.coins.length; i++) {
      const a = game.coins[i];
      const need = T.COIN_MERGE_COUNTS[a.value];
      if (a.heal || !need) continue;
      const range = a.r * T.COIN_ATTRACT_RADIUS_MULT;
      for (let j = i + 1; j < game.coins.length; j++) {
        const o = game.coins[j];
        if (o.heal || o.value !== a.value) continue;
        const dx = o.x - a.x;
        const dy = o.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d >= range) continue;
        const mergeDist = (a.r + o.r) * T.COIN_MERGE_DIST_MULT;
        const blob = d < mergeDist && near[i] < need && near[j] < need;
        const force = blob
          ? -T.COIN_BLOB_REPEL_ACCEL * (1 - d / mergeDist) * dt
          : T.COIN_ATTRACT_ACCEL * (1 - d / range) * dt;
        a.vx += (dx / d) * force;
        a.vy += (dy / d) * force;
        o.vx -= (dx / d) * force;
        o.vy -= (dy / d) * force;
      }
    }

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

      // Fresh health pickups fly free for a grace period so they visibly
      // scatter instead of being scooped the instant they spawn.
      const settled = !c.heal || c.age >= T.HEALTH_GRACE;

      // Scooped up on contact with the ball.
      if (playing && settled && dist < b.r + c.r) {
        game.coins.splice(i, 1);
        if (c.heal) {
          b.hp = Math.min(b.hp + c.heal, game.stats.maxHp);
          spawnHealParticles(game, c.x, c.y);
          continue;
        }
        game.coinProgress += c.value;
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
      if (playing && settled && dist < game.stats.magnetRadius) {
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

    // Merge clusters: when enough same-value coins nearly overlap, replace
    // them with one coin of the next denomination at their centroid. Brand-new
    // coins sit out a short grace so burst drops don't merge mid-scatter.
    // Merged coins push onto the end of the array with age 0, so chaining a
    // fresh 5 into a 25 also waits out the grace.
    let anyMerged = false;
    for (let i = 0; i < game.coins.length; i++) {
      const c = game.coins[i];
      if (c.heal || c.merged || c.age < T.COIN_MERGE_GRACE) continue;
      const need = T.COIN_MERGE_COUNTS[c.value];
      if (!need) continue;
      const group = [c];
      for (let j = i + 1; j < game.coins.length && group.length < need; j++) {
        const o = game.coins[j];
        if (o.heal || o.merged || o.value !== c.value || o.age < T.COIN_MERGE_GRACE) continue;
        const d = Math.hypot(o.x - c.x, o.y - c.y);
        if (d < (c.r + o.r) * T.COIN_MERGE_DIST_MULT) group.push(o);
      }
      if (group.length < need) continue;
      let mx = 0, my = 0, mvx = 0, mvy = 0;
      for (const g of group) {
        mx += g.x; my += g.y; mvx += g.vx; mvy += g.vy;
        g.merged = true;
      }
      anyMerged = true;
      const value = c.value * need;
      game.coins.push({
        x: mx / need, y: my / need,
        vx: mvx / need, vy: mvy / need,
        r: coinRadius(value),
        age: 0, // the new coin lives a full term
        value,
        spin: Math.random() * Math.PI * 2,
      });
    }
    if (anyMerged) {
      for (let i = game.coins.length - 1; i >= 0; i--) {
        if (game.coins[i].merged) game.coins.splice(i, 1);
      }
    }
  };
})(Tethered);
