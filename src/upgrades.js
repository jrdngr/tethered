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

  // Icon helpers. Icons draw centered at (x, y) inside a size×size box,
  // setting their own colors; both the level-up cards and the dev panel
  // call them, so they can't depend on a live game.

  // A weapon icon: the weapon shape in its in-game pale cyan emerging from a
  // mini ball disc, +x forward like the real ball-local frame. `shape` gets
  // (ctx, r0, u) — the mini ball radius and the box half-extent.
  function ballIcon(ctx, x, y, size, shape) {
    const r0 = size * 0.22;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#aef4ff';
    shape(ctx, r0, size / 2);
    ctx.fillStyle = '#568cc8'; // the fast-ball gradient's dark end
    ctx.beginPath();
    ctx.arc(0, 0, r0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // A spike triangle pointing +x from under the mini ball out to its tip
  // (weapons.js spike(), icon-local so icons don't couple to weapon code).
  function iconSpike(ctx, r0, reach, halfWidth) {
    ctx.beginPath();
    ctx.moveTo(0, -halfWidth);
    ctx.lineTo(r0 + reach, 0);
    ctx.lineTo(0, halfWidth);
    ctx.closePath();
    ctx.fill();
  }

  // The full pool; each level-up offers three of these at random.
  // desc/specialDesc are functions so console-tuned TUNING values show up
  // live. apply is the normal per-level gain; special fires on the final
  // pick. icon draws the upgrade's glyph (cards and dev panel).
  S.UPGRADES = [
    {
      name: 'MAGNET RANGE',
      desc: () => `+${S.TUNING.UPGRADE_MAGNET_RADIUS}px coin pull radius`,
      apply: (game) => { game.stats.magnetRadius += S.TUNING.UPGRADE_MAGNET_RADIUS; },
      specialDesc: () => '2× coin pull force',
      special: (game) => { game.stats.magnetAccel += 2 * S.TUNING.UPGRADE_MAGNET_ACCEL; },
      // Horseshoe magnet: a red arch opening downward with pale pole tips.
      icon(ctx, x, y, size) {
        const r = size * 0.32;
        const w = size * 0.24;
        ctx.strokeStyle = '#e5484d';
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(x, y - size * 0.08, r, Math.PI, 0);
        ctx.moveTo(x - r, y - size * 0.08);
        ctx.lineTo(x - r, y + size * 0.22);
        ctx.moveTo(x + r, y - size * 0.08);
        ctx.lineTo(x + r, y + size * 0.22);
        ctx.stroke();
        ctx.fillStyle = '#e8e8f0';
        ctx.fillRect(x - r - w / 2, y + size * 0.22, w, size * 0.14);
        ctx.fillRect(x + r - w / 2, y + size * 0.22, w, size * 0.14);
      },
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
      // The in-game health pickup: green disc, white cross.
      icon(ctx, x, y, size) {
        const r = size * 0.42;
        ctx.fillStyle = '#46a758';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8f5ec';
        const arm = r * 0.55;
        const thick = r * 0.3;
        ctx.fillRect(x - thick / 2, y - arm, thick, arm * 2);
        ctx.fillRect(x - arm, y - thick / 2, arm * 2, thick);
      },
    },
    {
      name: 'DAMAGE',
      desc: () => '+1 damage per smash',
      apply: (game) => { game.stats.damage += 1; },
      specialDesc: () => 'your kills explode',
      special: (game) => { game.stats.popExplode = true; },
      // Impact burst: a gold core with radiating shards.
      icon(ctx, x, y, size) {
        ctx.fillStyle = '#ffc53d';
        ctx.beginPath();
        ctx.arc(x, y, size * 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffc53d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 3;
          ctx.moveTo(x + Math.cos(a) * size * 0.24, y + Math.sin(a) * size * 0.24);
          ctx.lineTo(x + Math.cos(a) * size * 0.46, y + Math.sin(a) * size * 0.46);
        }
        ctx.stroke();
      },
    },
    {
      name: 'TOP SPEED',
      desc: () => `+${S.TUNING.UPGRADE_MAX_SPEED} max ball speed`,
      apply: (game) => { game.stats.maxSpeed += S.TUNING.UPGRADE_MAX_SPEED; },
      specialDesc: () => 'home in at top speed',
      special: (game) => { game.stats.homing = true; },
      // Double chevron pointing forward.
      icon(ctx, x, y, size) {
        const u = size / 2;
        ctx.strokeStyle = '#56e8ff';
        ctx.lineWidth = size * 0.14;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const off of [-u * 0.55, u * 0.15]) {
          ctx.moveTo(x + off - u * 0.3, y - u * 0.6);
          ctx.lineTo(x + off + u * 0.3, y);
          ctx.lineTo(x + off - u * 0.3, y + u * 0.6);
        }
        ctx.stroke();
      },
    },
    {
      name: 'MOMENTUM',
      desc: () => `+${S.TUNING.UPGRADE_SPEED_DAMAGE}× dmg at top speed`,
      apply: (game) => { game.stats.speedDamage += S.TUNING.UPGRADE_SPEED_DAMAGE; },
      specialDesc: () => 'easier bash at top speed',
      special: (game) => { game.stats.bashEasy = true; },
      // A ball with fading motion-trail arcs behind it.
      icon(ctx, x, y, size) {
        const u = size / 2;
        const r = u * 0.5;
        ctx.strokeStyle = '#56e8ff';
        ctx.lineWidth = size * 0.1;
        for (let i = 1; i <= 2; i++) {
          ctx.globalAlpha = i === 1 ? 0.55 : 0.25;
          ctx.beginPath();
          ctx.arc(x + u * 0.4 - i * u * 0.5, y, r, Math.PI * 0.65, Math.PI * 1.35);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#56e8ff';
        ctx.beginPath();
        ctx.arc(x + u * 0.4, y, r, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    {
      name: 'KILL SURGE',
      desc: () => `+${S.TUNING.UPGRADE_KILL_BOOST} speed per pop`,
      apply: (game) => { game.stats.killBoost += S.TUNING.UPGRADE_KILL_BOOST; },
      specialDesc: () => 'boost on every smash',
      special: (game) => { game.stats.surgeEverySmash = true; },
      // An up arrow bursting inside a pop ring.
      icon(ctx, x, y, size) {
        const u = size / 2;
        ctx.strokeStyle = '#56e8ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, u * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = size * 0.12;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y + u * 0.45);
        ctx.lineTo(x, y - u * 0.45);
        ctx.moveTo(x - u * 0.32, y - u * 0.1);
        ctx.lineTo(x, y - u * 0.45);
        ctx.lineTo(x + u * 0.32, y - u * 0.1);
        ctx.stroke();
      },
    },
    {
      name: 'PADDLE',
      desc: () => '+1 top-speed wall paddle',
      apply: (game) => S.addPaddle(game),
      specialDesc: () => '2× paddle width',
      special: (game) => { game.stats.paddleWide = true; },
      // A launch pad with its bright launching face up.
      icon(ctx, x, y, size) {
        const w = size * 0.8;
        const h = size * 0.28;
        ctx.fillStyle = '#3aa7c9';
        ctx.fillRect(x - w / 2, y - h / 2 + size * 0.15, w, h);
        ctx.fillStyle = '#aef4ff';
        ctx.fillRect(x - w / 2, y - h / 2 + size * 0.15, w, 2);
        // The ball it just launched.
        ctx.fillStyle = '#568cc8';
        ctx.beginPath();
        ctx.arc(x, y - size * 0.28, size * 0.16, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    // Weapons (see weapons.js): apply is a no-op because damage and size
    // derive straight from the upgrade level. Icons mirror each weapon's
    // in-game draw at glyph scale.
    {
      name: 'POKER',
      desc: () => `+${S.TUNING.WEAPON_POKER_DMG} dmg front spike`,
      apply: () => {},
      specialDesc: () => '2× spike length',
      special: (game) => { game.stats.pokerSkewer = true; },
      icon(ctx, x, y, size) {
        ballIcon(ctx, x - size * 0.18, y, size, (c, r0, u) => {
          iconSpike(c, r0, u * 0.85, r0 * 0.45);
        });
      },
    },
    {
      name: 'EARS',
      desc: () => `+${S.TUNING.WEAPON_EARS_DMG} dmg side fins`,
      apply: () => {},
      specialDesc: () => '2× ear knockback',
      special: (game) => { game.stats.earsBoxer = true; },
      icon(ctx, x, y, size) {
        ballIcon(ctx, x, y, size, (c, r0, u) => {
          const outer = u * 0.85;
          const h = (35 * Math.PI) / 180; // WEAPON_EARS_SPAN/2 at glyph scale
          for (const side of [1, -1]) {
            const a = side * Math.PI / 2;
            c.beginPath();
            c.arc(0, 0, outer, a - h, a + h);
            c.arc(0, 0, r0 - 1, a + h, a - h, true);
            c.closePath();
            c.fill();
          }
        });
      },
    },
    {
      name: 'HORNS',
      desc: () => `+${S.TUNING.WEAPON_HORNS_DMG} dmg front horns`,
      apply: () => {},
      specialDesc: () => 'horns always bash',
      special: (game) => { game.stats.hornsGore = true; },
      icon(ctx, x, y, size) {
        ballIcon(ctx, x - size * 0.12, y, size, (c, r0, u) => {
          for (const side of [1, -1]) {
            c.save();
            c.rotate(side * Math.PI / 4); // WEAPON_HORN_ANGLE
            iconSpike(c, r0, u * 0.65, r0 * 0.55);
            c.restore();
          }
        });
      },
    },
    {
      name: 'TAIL',
      desc: () => `+${S.TUNING.WEAPON_TAIL_DMG} dmg rear cone`,
      apply: () => {},
      specialDesc: () => 'tail hits shockwave',
      special: (game) => { game.stats.tailWake = true; },
      icon(ctx, x, y, size) {
        ballIcon(ctx, x + size * 0.22, y, size, (c, r0, u) => {
          // Reverse taper: a point under the ball flaring wide at the tip.
          const tip = r0 + u * 1.05;
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(-tip, -r0 * 0.8);
          c.lineTo(-tip, r0 * 0.8);
          c.closePath();
          c.fill();
        });
      },
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

  // Grant one level of an upgrade — shared by the card pick and the dev
  // panel. The final level grants only the special — no normal gain; past
  // the cap it's a no-op.
  S.grantUpgrade = function (game, u) {
    const next = S.upgradeLevel(game, u) + 1;
    if (next > S.TUNING.UPGRADE_LEVEL_MAX) return;
    if (next === S.TUNING.UPGRADE_LEVEL_MAX) u.special(game);
    else u.apply(game);
    game.upgradeLevels[u.name] = next;
  };

  S.chooseUpgrade = function (game, index) {
    S.grantUpgrade(game, game.upgradeChoices[index]);
    game.upgradeChoices = null;
    game.pendingLevelUps -= 1;
    if (game.pendingLevelUps > 0) S.startLevelUp(game);
    else game.state = S.STATE.PLAYING;
  };

  // Card layout, shared by render (drawing) and main (click hit-testing).
  // Sized to however many choices are on offer (the pool shrinks as upgrades max).
  S.upgradeCardRects = function (game) {
    const w = 200;
    const h = 132; // icon + name + desc + pips

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
