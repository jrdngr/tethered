// Level-up rewards: the game pauses and the player picks one of three
// upgrades rolled from the pool. Upgrades modify per-run stats, never TUNING.
// Each upgrade has UPGRADE_LEVEL_MAX levels: every level but the last is the
// normal gain, the final pick grants only the upgrade's special effect, and a
// maxed upgrade leaves the pool.
window.Tethered = window.Tethered || {};

(function (S) {
  // Per-run stats that upgrades raise. Gameplay code reads these instead of
  // the corresponding TUNING base values. The booleans are level-5 specials.
  S.createStats = function () {
    const T = S.TUNING;
    return {
      magnetRadius: T.COIN_MAGNET_RADIUS,
      magnetAccel: T.COIN_MAGNET_ACCEL,
      maxHp: T.MAX_HP,
      damage: T.PLAYER_DAMAGE,
      maxSpeed: T.BALL_MAX_SPEED,
      speedDamage: 1, // × damage at the speed cap (MOMENTUM); 1 = speed has no effect
      killBoost: 0,   // px/s the ball gains per popped enemy (KILL SURGE)
      popExplode: false,      // DAMAGE: pops splash-damage nearby enemies, chaining
      homing: false,          // TOP SPEED: bend toward the nearest enemy at top speed
      bashEasy: false,        // MOMENTUM: lower bash threshold at top speed
      surgeEverySmash: false, // KILL SURGE: boost on every smash, not just kills
      paddleWide: false,      // PADDLE: every paddle is double length
      comboShield: false,     // VITALITY: crossing the combo threshold grants a shield
      pokerSkewer: false,     // POKER: the spike doubles in length
      earsBoxer: false,       // EARS: ear hits knock back harder
      hornsGore: false,       // HORNS: horn hits always bash
      tailWake: false,        // TAIL: tail hits fire a shockwave
    };
  };

  S.upgradeLevel = function (game, u) {
    return game.upgradeLevels[u.name] || 0;
  };

  // Damage per smash. With MOMENTUM picked, it scales with speed: ×1 at the
  // invincibility threshold up to ×speedDamage at the speed cap.
  S.smashDamage = function (game) {
    const T = S.TUNING;
    const f = Math.min(Math.max(
      (S.ballSpeed(game.ball) - T.SPEED_THRESHOLD) /
      (game.stats.maxSpeed - T.SPEED_THRESHOLD), 0), 1);
    return game.stats.damage * (1 + (game.stats.speedDamage - 1) * f);
  };

  // The full pool; each level-up offers three of these at random.
  // desc/specialDesc are functions so console-tuned TUNING values show up
  // live. apply is the normal per-level gain; special fires on the final pick.
  S.UPGRADES = [
    {
      name: 'MAGNET RANGE',
      desc: () => `+${S.TUNING.UPGRADE_MAGNET_RADIUS}px coin pull radius`,
      apply: (game) => { game.stats.magnetRadius += S.TUNING.UPGRADE_MAGNET_RADIUS; },
      specialDesc: () => '2× coin pull force',
      special: (game) => { game.stats.magnetAccel += 2 * S.TUNING.UPGRADE_MAGNET_ACCEL; },
    },
    {
      name: 'VITALITY',
      desc: () => `+${S.TUNING.UPGRADE_MAX_HP} max HP, heal ${S.TUNING.UPGRADE_MAX_HP}`,
      apply: (game) => {
        game.stats.maxHp += S.TUNING.UPGRADE_MAX_HP;
        game.ball.hp += S.TUNING.UPGRADE_MAX_HP;
      },
      specialDesc: () => `shield at combo x${S.TUNING.COMBO_SHIELD_THRESHOLD}`,
      special: (game) => { game.stats.comboShield = true; },
    },
    {
      name: 'DAMAGE',
      desc: () => '+1 damage per smash',
      apply: (game) => { game.stats.damage += 1; },
      specialDesc: () => 'your kills explode',
      special: (game) => { game.stats.popExplode = true; },
    },
    {
      name: 'TOP SPEED',
      desc: () => `+${S.TUNING.UPGRADE_MAX_SPEED} max ball speed`,
      apply: (game) => { game.stats.maxSpeed += S.TUNING.UPGRADE_MAX_SPEED; },
      specialDesc: () => 'home in at top speed',
      special: (game) => { game.stats.homing = true; },
    },
    {
      name: 'MOMENTUM',
      desc: () => `+${S.TUNING.UPGRADE_SPEED_DAMAGE}× dmg at top speed`,
      apply: (game) => { game.stats.speedDamage += S.TUNING.UPGRADE_SPEED_DAMAGE; },
      specialDesc: () => 'easier bash at top speed',
      special: (game) => { game.stats.bashEasy = true; },
    },
    {
      name: 'KILL SURGE',
      desc: () => `+${S.TUNING.UPGRADE_KILL_BOOST} speed per pop`,
      apply: (game) => { game.stats.killBoost += S.TUNING.UPGRADE_KILL_BOOST; },
      specialDesc: () => 'boost on every smash',
      special: (game) => { game.stats.surgeEverySmash = true; },
    },
    {
      name: 'PADDLE',
      desc: () => '+1 top-speed wall paddle',
      apply: (game) => S.addPaddle(game),
      specialDesc: () => '2× paddle width',
      special: (game) => { game.stats.paddleWide = true; },
    },
    // Weapons (see weapons.js): apply is a no-op because damage and size
    // derive straight from the upgrade level.
    {
      name: 'POKER',
      desc: () => `+${S.TUNING.WEAPON_POKER_DMG} dmg front spike`,
      apply: () => {},
      specialDesc: () => '2× spike length',
      special: (game) => { game.stats.pokerSkewer = true; },
    },
    {
      name: 'EARS',
      desc: () => `+${S.TUNING.WEAPON_EARS_DMG} dmg side fins`,
      apply: () => {},
      specialDesc: () => '2× ear knockback',
      special: (game) => { game.stats.earsBoxer = true; },
    },
    {
      name: 'HORNS',
      desc: () => `+${S.TUNING.WEAPON_HORNS_DMG} dmg front horns`,
      apply: () => {},
      specialDesc: () => 'horns always bash',
      special: (game) => { game.stats.hornsGore = true; },
    },
    {
      name: 'TAIL',
      desc: () => `+${S.TUNING.WEAPON_TAIL_DMG} dmg rear cone`,
      apply: () => {},
      specialDesc: () => 'tail hits shockwave',
      special: (game) => { game.stats.tailWake = true; },
    },
  ];

  // Up to three distinct upgrades, uniformly random from the pool
  // (Fisher-Yates). Maxed-out upgrades drop out, so late runs offer fewer.
  function rollChoices(game) {
    const pool = S.UPGRADES.filter((u) => S.upgradeLevel(game, u) < S.TUNING.UPGRADE_LEVEL_MAX);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
  }

  // Freeze the game and present the choices. Consumes one pending level-up;
  // chooseUpgrade chains back here if more are queued. With every upgrade
  // maxed there's nothing to offer — drop the queue and keep playing.
  S.startLevelUp = function (game) {
    const choices = rollChoices(game);
    if (choices.length === 0) {
      game.pendingLevelUps = 0;
      game.state = S.STATE.PLAYING; // also unfreezes a chooseUpgrade chain that ran dry
      return;
    }
    game.state = S.STATE.LEVELUP;
    S.releaseTether(game);
    game.upgradeChoices = choices;
  };

  S.chooseUpgrade = function (game, index) {
    const u = game.upgradeChoices[index];
    const next = S.upgradeLevel(game, u) + 1;
    // The final level grants only the special — no normal gain.
    if (next === S.TUNING.UPGRADE_LEVEL_MAX) u.special(game);
    else u.apply(game);
    game.upgradeLevels[u.name] = next;
    game.upgradeChoices = null;
    game.pendingLevelUps -= 1;
    if (game.pendingLevelUps > 0) S.startLevelUp(game);
    else game.state = S.STATE.PLAYING;
  };

  // Card layout, shared by render (drawing) and main (click hit-testing).
  // Sized to however many choices are on offer (the pool shrinks as upgrades max).
  S.upgradeCardRects = function (game) {
    const w = 200;
    const h = 120;
    const gap = 24;
    const n = game.upgradeChoices ? game.upgradeChoices.length : 3;
    const x0 = (game.width - (n * w + (n - 1) * gap)) / 2;
    const y = game.height / 2 - h / 2;
    return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y, w, h }));
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
