// Combo multiplier, survival time, health outcomes.
window.Tethered = window.Tethered || {};

(function (S) {
  // Combo is a multiplier on coins dropped per kill: baseline ×1,
  // +1 per wall bounce / enemy kill while fast.
  S.bumpCombo = function (game) {
    game.combo += 1;
  };

  // Vulnerable ball touched by an enemy. (nx, ny) is the unit normal from enemy to ball.
  S.damageBall = function (game, enemy, nx, ny) {
    const T = S.TUNING;
    const b = game.ball;
    b.hp -= enemy.damage;
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

  S.updateCombo = function (game) {
    // Combo only survives while the ball stays fast.
    if (S.ballSpeed(game.ball) < S.TUNING.SPEED_THRESHOLD) game.combo = 1;
  };
})(Tethered);
