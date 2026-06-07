// Combo multiplier, survival time, health outcomes, and the impact-juice
// helpers (screen shake, hit-stop) every hit site calls.
window.Tethered = window.Tethered || {};

(function (S) {
  // Shake accumulates (capped, so pop chains don't whip the camera) and
  // decays in the frame loop; magnitudes per event live in TUNING.
  S.addShake = function (game, mag) {
    game.shake.mag = Math.min(game.shake.mag + mag, S.TUNING.SHAKE_MAX);
  };

  // Hit-stop takes the max, never the sum — stacked kills refresh the
  // freeze instead of compounding into a stall.
  S.addFreeze = function (game, s) {
    game.freeze = Math.max(game.freeze, s);
  };

  // Combo is a multiplier on coins dropped per kill: baseline ×1,
  // +1 per wall bounce / enemy kill while fast.
  S.bumpCombo = function (game) {
    game.combo += 1;
    game.comboIdle = 0;
    // VITALITY special: crossing the threshold grants a one-hit shield
    // (max 1 held — losing it means rebuilding the combo for another, and
    // a broken shield keeps a fresh one away for the cooldown).
    if (game.stats.specials.comboShield && game.combo >= S.TUNING.COMBO_SHIELD_THRESHOLD &&
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
    // Dev-panel invincibility: the hit fully no-ops (no damage, knockback,
    // combo reset, or shield loss). I-frames still apply so the collision
    // loop doesn't re-enter every tick. (S.dev is defined in devpanel.js,
    // which loads after this file — guard for safety.)
    if (S.dev && S.dev.invincible) {
      b.iframes = T.IFRAME_DURATION;
      return;
    }
    if (b.shield) {
      b.shield = false;
      b.shieldCooldown = T.COMBO_SHIELD_COOLDOWN;
    } else {
      b.hp -= enemy.damage;
    }
    S.addShake(game, T.SHAKE_HIT); // taking a hit is the heaviest shake
    S.audio.play('hurt');
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
    game.state = S.STATE.DYING;
    S.releaseTether(game);
    S.addShake(game, T.SHAKE_HIT);
    S.audio.play('death');
    game.playerPop = { x: b.x, y: b.y, t: 0 };
    // White-hot debris flung from the popped ball.
    for (let i = 0; i < T.PLAYER_POP_PARTICLES; i++) {
      game.particles.push({
        x: b.x, y: b.y,
        ...S.randomVelocity(T.PLAYER_POP_PARTICLE_SPEED, 0.2),
        age: 0,
        life: T.PLAYER_POP_DURATION * (0.4 + 0.6 * Math.random()),
        color: Math.random() < 0.5 ? '#ffffff' : '#aef4ff',
        size: 2,
      });
    }
    // Shockwave: every enemy in the arena is flung away from the dying player.
    S.geom.radialPush(game.enemies, b.x, b.y, T.PLAYER_POP_PUSH, Infinity, 'kx', 'ky');
  };

  S.updateCombo = function (game, dt) {
    // Combo decays on idleness: COMBO_TIMEOUT without a change resets it.
    if (game.combo <= 1) return;
    game.comboIdle += dt;
    if (game.comboIdle >= S.TUNING.COMBO_TIMEOUT) game.combo = 1;
  };
})(Tethered);
