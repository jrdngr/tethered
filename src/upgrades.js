// Level-up rewards: the game pauses and the player picks one of three
// upgrades rolled from the pool. Upgrades modify per-run stats, never TUNING.
window.Tethered = window.Tethered || {};

(function (S) {
  // Per-run stats that upgrades raise. Gameplay code reads these instead of
  // the corresponding TUNING base values.
  S.createStats = function () {
    const T = S.TUNING;
    return {
      magnetRadius: T.COIN_MAGNET_RADIUS,
      magnetAccel: T.COIN_MAGNET_ACCEL,
      maxHp: T.MAX_HP,
      damage: T.PLAYER_DAMAGE,
      maxSpeed: T.BALL_MAX_SPEED,
    };
  };

  // The full pool; each level-up offers three of these at random.
  // desc is a function so console-tuned TUNING values show up live.
  S.UPGRADES = [
    {
      name: 'MAGNET RANGE',
      desc: () => `+${S.TUNING.UPGRADE_MAGNET_RADIUS}px coin pull radius`,
      apply: (game) => { game.stats.magnetRadius += S.TUNING.UPGRADE_MAGNET_RADIUS; },
    },
    {
      name: 'MAGNET POWER',
      desc: () => `+${S.TUNING.UPGRADE_MAGNET_ACCEL} coin pull accel`,
      apply: (game) => { game.stats.magnetAccel += S.TUNING.UPGRADE_MAGNET_ACCEL; },
    },
    {
      name: 'VITALITY',
      desc: () => `+${S.TUNING.UPGRADE_MAX_HP} max HP, heal ${S.TUNING.UPGRADE_MAX_HP}`,
      apply: (game) => {
        game.stats.maxHp += S.TUNING.UPGRADE_MAX_HP;
        game.ball.hp += S.TUNING.UPGRADE_MAX_HP;
      },
    },
    {
      name: 'DAMAGE',
      desc: () => '+1 damage per smash',
      apply: (game) => { game.stats.damage += 1; },
    },
    {
      name: 'TOP SPEED',
      desc: () => `+${S.TUNING.UPGRADE_MAX_SPEED} max ball speed`,
      apply: (game) => { game.stats.maxSpeed += S.TUNING.UPGRADE_MAX_SPEED; },
    },
  ];

  // Three distinct upgrades, uniformly random from the pool (Fisher-Yates).
  function rollChoices() {
    const pool = S.UPGRADES.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
  }

  // Freeze the game and present three choices. Consumes one pending level-up;
  // chooseUpgrade chains back here if more are queued.
  S.startLevelUp = function (game) {
    game.state = 'levelup';
    S.releaseTether(game);
    game.upgradeChoices = rollChoices();
  };

  S.chooseUpgrade = function (game, index) {
    game.upgradeChoices[index].apply(game);
    game.upgradeChoices = null;
    game.pendingLevelUps -= 1;
    if (game.pendingLevelUps > 0) S.startLevelUp(game);
    else game.state = 'playing';
  };

  // Card layout, shared by render (drawing) and main (click hit-testing).
  S.upgradeCardRects = function (game) {
    const w = 200;
    const h = 120;
    const gap = 24;
    const x0 = (game.width - (3 * w + 2 * gap)) / 2;
    const y = game.height / 2 - h / 2;
    return [0, 1, 2].map((i) => ({ x: x0 + i * (w + gap), y, w, h }));
  };

  // Apply the upgrade under (mx, my), if any.
  S.pickUpgradeAt = function (game, mx, my) {
    const rects = S.upgradeCardRects(game);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        S.chooseUpgrade(game, i);
        return;
      }
    }
  };
})(Tethered);
