// Combo multiplier, survival time, health outcomes.
window.Tethered = window.Tethered || {};

(function (S) {
  // Combo is a multiplier on coins dropped per kill: baseline ×1,
  // +1 per wall bounce / enemy kill while fast.
  S.bumpCombo = function (game) {
    game.combo += 1;
    // VITALITY special: crossing the threshold grants a one-hit shield
    // (max 1 held — losing it means rebuilding the combo for another, and
    // a broken shield keeps a fresh one away for the cooldown).
    if (game.stats.comboShield && game.combo >= S.TUNING.COMBO_SHIELD_THRESHOLD &&
        !game.ball.shield && game.ball.shieldCooldown <= 0) {
      game.ball.shield = true;
    }
  };

  // Vulnerable ball touched by an enemy. (nx, ny) is the unit normal from
  // enemy to ball. A shield eats the damage, but the hit still knocks back,
  // grants i-frames, and resets the combo.
  S.damageBall = function (game, enemy, nx, ny) {
    const T = S.TUNING;
    const b = game.ball;
    if (b.shield) {
      b.shield = false;
      b.shieldCooldown = T.COMBO_SHIELD_COOLDOWN;
    } else {
      b.hp -= enemy.damage;
    }
    b.iframes = T.IFRAME_DURATION;
    game.combo = 1;
    // Knock both apart.
    b.vx = nx * T.KNOCKBACK_SPEED;
    b.vy = ny * T.KNOCKBACK_SPEED;
    enemy.kx = -nx * T.KNOCKBACK_SPEED;
    enemy.ky = -ny * T.KNOCKBACK_SPEED;
    if (b.hp <= 0) S.gameOver(game);
  };

  // The ball pops: enter the 'dying' state, which keeps physics running
  // (sans ball) while the death animation plays, then flips to 'gameover'.
  S.gameOver = function (game) {
    const T = S.TUNING;
    const b = game.ball;
    game.state = 'dying';
    game.tether.active = false;
    game.playerPop = { x: b.x, y: b.y, t: 0 };
    // White-hot debris flung from the popped ball.
    for (let i = 0; i < T.PLAYER_POP_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = T.PLAYER_POP_PARTICLE_SPEED * (0.2 + 0.8 * Math.random());
      game.particles.push({
        x: b.x, y: b.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: T.PLAYER_POP_DURATION * (0.4 + 0.6 * Math.random()),
        color: Math.random() < 0.5 ? '#ffffff' : '#aef4ff',
        size: 2,
      });
    }
    // Shockwave: every enemy in the arena is flung away from the dying player.
    S.pushEnemies(game, b.x, b.y, T.PLAYER_POP_PUSH, Infinity);
  };

  S.updateCombo = function (game) {
    // Combo only survives while the ball stays fast.
    if (S.ballSpeed(game.ball) < S.TUNING.SPEED_THRESHOLD) game.combo = 1;
  };
})(Tethered);
