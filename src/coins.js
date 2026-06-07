// Coins and health pickups dropped by popped enemies, gentle magnetism
// toward the ball, leveling.
window.Tethered = window.Tethered || {};

(function (S) {
  // Random scatter velocity for burst spawns: a uniform angle at
  // maxSpeed × (minFrac..1). Shared by coin, heal, and death-particle bursts.
  S.randomVelocity = function (maxSpeed, minFrac) {
    const angle = Math.random() * Math.PI * 2;
    const speed = maxSpeed * (minFrac + (1 - minFrac) * Math.random());
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  };

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
      game.coins.push({
        x, y,
        ...S.randomVelocity(T.COIN_BURST_SPEED, 0.3),
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
    game.coins.push({
      x, y,
      ...S.randomVelocity(T.HEALTH_FLING_SPEED, 0.7),
      r: T.HEALTH_RADIUS,
      age: 0,
      heal: T.HEALTH_HEAL,
    });
  };

  // Green spark burst where a health pickup was grabbed.
  function spawnHealParticles(game, x, y) {
    const T = S.TUNING;
    for (let i = 0; i < T.HEAL_PARTICLES; i++) {
      game.particles.push({
        x, y,
        ...S.randomVelocity(T.HEAL_PARTICLE_SPEED, 0.3),
        age: 0,
        life: T.HEAL_PARTICLE_LIFE * (0.6 + 0.4 * Math.random()),
      });
    }
  }

  // Index the coins eligible for the pairwise merge dance (near-counting,
  // attraction/repulsion, merging): non-heal, past the merge grace, of a
  // still-mergeable value. Grouped by value, since only same-value pairs
  // interact — each group is its own small n² instead of one big one, and
  // fresh burst drops (the bulk right after a kill) sit out entirely until
  // their grace ends.
  function mergeBuckets(game) {
    const T = S.TUNING;
    const buckets = {};
    for (const c of game.coins) {
      if (c.heal || c.merged || c.age < T.COIN_MERGE_GRACE || !T.COIN_MERGE_COUNTS[c.value]) continue;
      (buckets[c.value] || (buckets[c.value] = [])).push(c);
    }
    return buckets;
  }

  S.updateCoins = function (game, dt) {
    const T = S.TUNING;
    const b = game.ball;
    const decay = Math.exp(-T.COIN_DRAG * dt);
    // The popped ball can't scoop or attract anything during the death pop.
    const playing = game.state === S.STATE.PLAYING;

    // Advance heal-burst particles (same drag as coins).
    S.advanceParticles(game.particles, dt, T.COIN_DRAG);

    // Pairwise merge dance, one value bucket at a time. First count, per
    // coin, how many bucket-mates sit inside merge range (itself included) —
    // clusters short of a full merge group repel a little instead of
    // stacking. Then, with the counts complete, apply a slow pairwise
    // attraction so clusters drift together (reaching double the coin's
    // diameter); merge-close pairs short of a full group flip to a gentle
    // repulsion, so undersized clusters blob around each other until the
    // last coin arrives. Squared-distance early-outs; sqrt only when a force
    // actually applies.
    const buckets = mergeBuckets(game);
    for (const value in buckets) {
      const list = buckets[value];
      const need = T.COIN_MERGE_COUNTS[value];
      for (const c of list) c.near = 1;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const o = list[j];
          const dx = o.x - a.x;
          const dy = o.y - a.y;
          const mergeDist = (a.r + o.r) * T.COIN_MERGE_DIST_MULT;
          if (dx * dx + dy * dy < mergeDist * mergeDist) { a.near++; o.near++; }
        }
      }
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const range = a.r * T.COIN_ATTRACT_RADIUS_MULT;
        for (let j = i + 1; j < list.length; j++) {
          const o = list[j];
          const dx = o.x - a.x;
          const dy = o.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= range * range) continue;
          const d = Math.sqrt(d2) || 1;
          const mergeDist = (a.r + o.r) * T.COIN_MERGE_DIST_MULT;
          const blob = d < mergeDist && a.near < need && o.near < need;
          const force = blob
            ? -T.COIN_BLOB_REPEL_ACCEL * (1 - d / mergeDist) * dt
            : T.COIN_ATTRACT_ACCEL * (1 - d / range) * dt;
          a.vx += (dx / d) * force;
          a.vy += (dy / d) * force;
          o.vx -= (dx / d) * force;
          o.vy -= (dy / d) * force;
        }
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
        if (game.pendingLevelUps > 0 && game.state === S.STATE.PLAYING) {
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
      const R = T.PICKUP_RESTITUTION;
      if (c.x - c.r < 0) { c.x = c.r; c.vx = -c.vx * R; }
      else if (c.x + c.r > game.width) { c.x = game.width - c.r; c.vx = -c.vx * R; }
      if (c.y - c.r < 0) { c.y = c.r; c.vy = -c.vy * R; }
      else if (c.y + c.r > game.height) { c.y = game.height - c.r; c.vy = -c.vy * R; }
    }

    // Merge clusters: when enough same-value coins nearly overlap, replace
    // them with one coin of the next denomination at their centroid. Brand-new
    // coins sit out a short grace so burst drops don't merge mid-scatter.
    // Merged coins push onto the end of the array with age 0, so chaining a
    // fresh 5 into a 25 also waits out the grace. The buckets are rebuilt —
    // the loop above scoops and expires coins.
    let anyMerged = false;
    for (const [value, list] of Object.entries(mergeBuckets(game))) {
      const need = T.COIN_MERGE_COUNTS[value];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.merged) continue;
        const group = [c];
        for (let j = i + 1; j < list.length && group.length < need; j++) {
          const o = list[j];
          if (o.merged) continue;
          const dx = o.x - c.x;
          const dy = o.y - c.y;
          const mergeDist = (c.r + o.r) * T.COIN_MERGE_DIST_MULT;
          if (dx * dx + dy * dy < mergeDist * mergeDist) group.push(o);
        }
        if (group.length < need) continue;
        let mx = 0, my = 0, mvx = 0, mvy = 0;
        for (const g of group) {
          mx += g.x; my += g.y; mvx += g.vx; mvy += g.vy;
          g.merged = true;
        }
        anyMerged = true;
        const merged = c.value * need; // the next denomination up
        game.coins.push({
          x: mx / need, y: my / need,
          vx: mvx / need, vy: mvy / need,
          r: coinRadius(merged),
          age: 0, // the new coin lives a full term
          value: merged,
          spin: Math.random() * Math.PI * 2,
        });
      }
    }
    if (anyMerged) {
      for (let i = game.coins.length - 1; i >= 0; i--) {
        if (game.coins[i].merged) game.coins.splice(i, 1);
      }
    }
  };
})(Tethered);
