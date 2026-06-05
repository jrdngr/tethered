// Score, combo multiplier, survival time, health outcomes.
window.Swangin = window.Swangin || {};

(function (S) {
  // Combo is a multiplier: baseline ×1, +1 per wall bounce / enemy kill while fast.
  S.registerBounce = function (game) {
    game.combo += 1;
  };

  S.registerKill = function (game) {
    game.score += S.TUNING.ENEMY_BASE_POINTS * game.combo;
    game.combo += 1;
  };

  // Vulnerable ball touched by an enemy. (nx, ny) is the unit normal from enemy to ball.
  S.damageBall = function (game, enemy, nx, ny) {
    const T = S.TUNING;
    const b = game.ball;
    b.hp -= 1;
    b.iframes = T.IFRAME_DURATION;
    game.combo = 1;
    // Knock both apart.
    b.vx = nx * T.KNOCKBACK_SPEED;
    b.vy = ny * T.KNOCKBACK_SPEED;
    enemy.kx = -nx * T.KNOCKBACK_SPEED;
    enemy.ky = -ny * T.KNOCKBACK_SPEED;
    if (b.hp <= 0) S.gameOver(game);
  };

  S.gameOver = function (game) {
    game.state = 'gameover';
    game.tether.active = false;
  };

  S.updateScore = function (game, dt) {
    game.time += dt;
    // Combo only survives while the ball stays fast.
    if (S.ballSpeed(game.ball) < S.TUNING.SPEED_THRESHOLD) game.combo = 1;
  };
})(Swangin);
