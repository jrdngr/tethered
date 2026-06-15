// Health pickups dropped by popped enemies: they scatter from the kill,
// then drift toward the ball with gentle magnetism and heal on contact.
// They share the world's `pickups` array, and the heal-spark particles ride
// the same drag integrator.
window.Tethered = window.Tethered || {};

(function (S) {
  // Pickup registry: one entry per pickup type, mirroring ENEMY_TYPES.
  // Everything type-specific — spawn radius, scoop grace, the scoop effect,
  // the visual — lives here, read from TUNING live so console tuning shows
  // up immediately. A new pickup type is one entry plus a spawn call.
  S.PICKUP_TYPES = {
    // Rare health drop. Heals on pickup; immune to scoop/magnetism for a
    // grace period so it visibly scatters and the grab is a deliberate move.
    heal: {
      radius: (T) => T.HEALTH_RADIUS,
      grace: (T) => T.HEALTH_GRACE,
      onScoop(game, c) {
        const b = game.ball;
        b.hp = Math.min(b.hp + S.TUNING.HEALTH_HEAL, S.TUNING.MAX_HP);
        S.audio.play('heal');
        spawnHealParticles(game, c.x, c.y);
      },
      // Green disc with a white cross.
      draw(ctx, c) {
        ctx.fillStyle = '#46a758';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8f5ec';
        const arm = c.r * 0.55; // cross half-length
        const thick = c.r * 0.3;
        ctx.fillRect(c.x - thick / 2, c.y - arm, thick, arm * 2);
        ctx.fillRect(c.x - arm, c.y - thick / 2, arm * 2, thick);
      },
    },
  };

  // Flung well clear of the pop.
  S.spawnHealthPickup = function (game, x, y) {
    const T = S.TUNING;
    game.pickups.push({
      type: 'heal',
      x, y,
      ...S.randomVelocity(T.HEALTH_FLING_SPEED, 0.7),
      r: S.PICKUP_TYPES.heal.radius(T),
      age: 0,
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

  S.updatePickups = function (game, dt) {
    const T = S.TUNING;
    const b = game.ball;
    const decay = Math.exp(-T.PICKUP_DRAG * dt);
    // The popped ball can't scoop or attract anything during the death pop.
    const playing = game.state === S.STATE.PLAYING;

    // Advance heal-burst particles (same drag as pickups).
    S.advanceParticles(game.particles, dt, T.PICKUP_DRAG);

    for (let i = game.pickups.length - 1; i >= 0; i--) {
      const c = game.pickups[i];
      c.age += dt; // tracked for the scoop grace

      const dx = b.x - c.x;
      const dy = b.y - c.y;
      const dist = Math.hypot(dx, dy) || 1;

      // Fly free until the grace ends, so a fresh drop visibly scatters
      // instead of being scooped the instant it spawns.
      const settled = c.age >= S.PICKUP_TYPES[c.type].grace(T);

      // Scooped up on contact with the ball: the type's effect, then gone.
      if (playing && settled && dist < b.r + c.r) {
        game.pickups.splice(i, 1);
        S.PICKUP_TYPES[c.type].onScoop(game, c);
        continue;
      }

      // Gentle magnetism toward the ball.
      if (playing && settled && dist < T.PICKUP_MAGNET_RADIUS) {
        const pull = T.PICKUP_MAGNET_ACCEL * (1 - dist / T.PICKUP_MAGNET_RADIUS);
        c.vx += (dx / dist) * pull * dt;
        c.vy += (dy / dist) * pull * dt;
      }

      c.vx *= decay;
      c.vy *= decay;
      c.x += c.vx * dt;
      c.y += c.vy * dt;

      // Keep pickups inside the arena with a soft bounce, so a fling doesn't
      // scatter them off the edge.
      const R = T.PICKUP_RESTITUTION;
      if (c.x - c.r < 0) { c.x = c.r; c.vx = -c.vx * R; }
      else if (c.x + c.r > game.world.w) { c.x = game.world.w - c.r; c.vx = -c.vx * R; }
      if (c.y - c.r < 0) { c.y = c.r; c.vy = -c.vy * R; }
      else if (c.y + c.r > game.world.h) { c.y = game.world.h - c.r; c.vy = -c.vy * R; }
    }
  };
})(Tethered);
