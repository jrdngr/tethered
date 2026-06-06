// Weapons: upgrade-granted shapes attached to the ball. They arm on tether
// release while the ball is fast, orient along the velocity vector, and
// expire (until the next release) once the ball slows into the flash-warning
// zone. A weapon hit resolves like a body smash with the weapon's bonus
// damage added, so weapons read as reach extensions of the ball.
window.Tethered = window.Tethered || {};

(function (S) {
  // Upgrade level for a weapon kind (0 = unowned).
  function weaponLevel(game, kind) {
    return game.upgradeLevels[S.WEAPONS[kind].name] || 0;
  }

  // Bonus damage a weapon adds on top of the base smash. Levels 1-4 each add
  // the per-level damage; the 5th pick is the special and adds none.
  S.weaponDamage = function (game, kind) {
    return Math.min(weaponLevel(game, kind), 4) * S.WEAPONS[kind].dmg();
  };

  // Reach/width multiplier: weapons grow a little with each level (1-4).
  function weaponScale(game, kind) {
    const lvl = Math.min(weaponLevel(game, kind), 4);
    return 1 + S.TUNING.WEAPON_SIZE_GROWTH * (lvl - 1);
  }

  // A spike triangle pointing +x from under the ball out to its tip.
  function spike(ctx, r0, reach, halfWidth) {
    ctx.beginPath();
    ctx.moveTo(0, -halfWidth);
    ctx.lineTo(r0 + reach, 0);
    ctx.lineTo(0, halfWidth);
    ctx.closePath();
    ctx.fill();
  }

  // Registry. Each weapon: its upgrade-card name, per-level bonus damage,
  // collision capsules, and its visual — capsules and draw both in the
  // ball-local frame where +x is the travel direction (callers rotate).
  // Sizes read TUNING live so console tuning shows up immediately.
  S.WEAPONS = {
    poker: {
      name: 'POKER',
      dmg: () => S.TUNING.WEAPON_POKER_DMG,
      // POKER special: skewer — the spike doubles in length.
      reach: (game, scale) => S.TUNING.WEAPON_POKER_REACH * scale *
        (game.stats.pokerSkewer ? S.TUNING.WEAPON_POKER_SKEWER_MULT : 1),
      capsules(game, scale) {
        const r0 = game.ball.r;
        return [{ x1: r0, y1: 0, x2: r0 + this.reach(game, scale), y2: 0,
          r: S.TUNING.WEAPON_POKER_WIDTH * scale }];
      },
      draw(ctx, game, scale) {
        spike(ctx, game.ball.r, this.reach(game, scale), S.TUNING.WEAPON_POKER_WIDTH * scale);
      },
    },

    ears: {
      name: 'EARS',
      dmg: () => S.TUNING.WEAPON_EARS_DMG,
      // Each ear's hitbox is a capsule along the crescent's chord at its
      // mid radius — close enough to the drawn annular sector.
      capsules(game, scale) {
        const T = S.TUNING;
        const rm = game.ball.r + (T.WEAPON_EARS_REACH * scale) / 2;
        const h = (T.WEAPON_EARS_SPAN / 2) * Math.PI / 180;
        return [1, -1].map((side) => {
          const c = side * Math.PI / 2;
          return {
            x1: Math.cos(c - h) * rm, y1: Math.sin(c - h) * rm,
            x2: Math.cos(c + h) * rm, y2: Math.sin(c + h) * rm,
            r: T.WEAPON_EARS_WIDTH * scale,
          };
        });
      },
      draw(ctx, game, scale) {
        const T = S.TUNING;
        const r0 = game.ball.r;
        const outer = r0 + T.WEAPON_EARS_REACH * scale;
        const h = (T.WEAPON_EARS_SPAN / 2) * Math.PI / 180;
        for (const side of [1, -1]) {
          const c = side * Math.PI / 2;
          ctx.beginPath();
          ctx.arc(0, 0, outer, c - h, c + h);
          ctx.arc(0, 0, r0 - 2, c + h, c - h, true); // inner edge tucks under the ball
          ctx.closePath();
          ctx.fill();
        }
      },
    },

    horns: {
      name: 'HORNS',
      dmg: () => S.TUNING.WEAPON_HORNS_DMG,
      capsules(game, scale) {
        const T = S.TUNING;
        const r0 = game.ball.r;
        const reach = T.WEAPON_HORNS_REACH * scale;
        return [1, -1].map((side) => {
          const a = side * T.WEAPON_HORN_ANGLE * Math.PI / 180;
          return {
            x1: Math.cos(a) * r0, y1: Math.sin(a) * r0,
            x2: Math.cos(a) * (r0 + reach), y2: Math.sin(a) * (r0 + reach),
            r: T.WEAPON_HORNS_WIDTH * scale,
          };
        });
      },
      draw(ctx, game, scale) {
        const T = S.TUNING;
        for (const side of [1, -1]) {
          ctx.save();
          ctx.rotate(side * T.WEAPON_HORN_ANGLE * Math.PI / 180);
          spike(ctx, game.ball.r, T.WEAPON_HORNS_REACH * scale, T.WEAPON_HORNS_WIDTH * scale);
          ctx.restore();
        }
      },
    },

    tail: {
      name: 'TAIL',
      dmg: () => S.TUNING.WEAPON_TAIL_DMG,
      capsules(game, scale) {
        const T = S.TUNING;
        const r0 = game.ball.r;
        return [{ x1: -r0, y1: 0, x2: -(r0 + T.WEAPON_TAIL_REACH * scale), y2: 0,
          r: T.WEAPON_TAIL_WIDTH * scale }];
      },
      draw(ctx, game, scale) {
        ctx.save();
        ctx.rotate(Math.PI);
        spike(ctx, game.ball.r, S.TUNING.WEAPON_TAIL_REACH * scale, S.TUNING.WEAPON_TAIL_WIDTH * scale);
        ctx.restore();
      },
    },
  };

  // Arming threshold: the speed where the ball starts its vulnerability
  // warning flash — weapons live only while the ball is clearly fast.
  function armSpeed() {
    return S.TUNING.SPEED_THRESHOLD + S.TUNING.SPEED_FLASH_WINDOW;
  }

  // Called from releaseTether: every release while fast (re)arms the weapons.
  // A slow release arms nothing — only the next fast release does.
  S.triggerWeapons = function (game) {
    if (S.ballSpeed(game.ball) >= armSpeed()) game.weaponState.active = true;
  };

  // Per-tick expiry: weapons hide while the ball is held and expire once it
  // slows into the warning flash.
  S.updateWeapons = function (game) {
    if (game.tether.active || S.ballSpeed(game.ball) < armSpeed()) {
      game.weaponState.active = false;
    }
  };

  // World-space hit capsules for every owned weapon, oriented to the heading.
  S.weaponSegments = function (game) {
    const b = game.ball;
    const ang = Math.atan2(b.vy, b.vx);
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const segs = [];
    for (const kind in S.WEAPONS) {
      if (!weaponLevel(game, kind)) continue;
      for (const c of S.WEAPONS[kind].capsules(game, weaponScale(game, kind))) {
        segs.push({
          kind,
          r: c.r,
          x1: b.x + c.x1 * cos - c.y1 * sin,
          y1: b.y + c.x1 * sin + c.y1 * cos,
          x2: b.x + c.x2 * cos - c.y2 * sin,
          y2: b.y + c.x2 * sin + c.y2 * cos,
        });
      }
    }
    return segs;
  };

  // Closest point on the segment (x1,y1)-(x2,y2) to (cx,cy).
  function segClosest(x1, y1, x2, y2, cx, cy) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((cx - x1) * dx + (cy - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + t * dx, y: y1 + t * dy };
  }

  // Weapon pass, run before the body-collision loop: each enemy takes at
  // most one weapon hit per tick; resolveSmash kills (flagging dead for the
  // sweep) or knocks the survivor flush against the weapon, so the body
  // loop can't land a second hit the same step.
  S.updateWeaponCollisions = function (game) {
    if (!game.weaponState.active) return;
    const segs = S.weaponSegments(game);
    if (!segs.length) return;
    const T = S.TUNING;
    const b = game.ball;
    for (const e of game.enemies) {
      if (e.dead || e.invuln > 0) continue;
      for (const s of segs) {
        const p = segClosest(s.x1, s.y1, s.x2, s.y2, e.x, e.y);
        const gap = Math.hypot(e.x - p.x, e.y - p.y);
        if (gap >= s.r + e.r) continue;
        // Same normal convention as the body collision: from the enemy
        // toward the contact, so a tip hit bounces the ball back along the
        // weapon's axis and a side hit deflects it laterally.
        const nx = (p.x - e.x) / (gap || 1);
        const ny = (p.y - e.y) / (gap || 1);
        S.resolveSmash(game, e, nx, ny, false, {
          dmgBonus: S.weaponDamage(game, s.kind),
          // HORNS special: gore — horn hits always bash through.
          bashOverride: s.kind === 'horns' && game.stats.hornsGore,
          // EARS special: boxer — ear hits knock survivors back harder.
          knockMult: s.kind === 'ears' && game.stats.earsBoxer
            ? T.WEAPON_EARS_KNOCK_MULT : 1,
          ax: p.x, ay: p.y, ar: s.r,
        });
        // TAIL special: wake — a tail hit also shoves everything nearby.
        if (s.kind === 'tail' && game.stats.tailWake) {
          S.pushEnemies(game, b.x, b.y, T.ENEMY_POP_PUSH, T.ENEMY_POP_PUSH_RADIUS);
        }
        break;
      }
    }
  };

  // Drawn under the ball fill so the shapes emerge from its rim. Weapons are
  // only ever visible while the ball is fast and bright, so a fixed pale
  // cyan reads as part of it.
  S.drawWeapons = function (ctx, game) {
    const b = game.ball;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillStyle = '#aef4ff';
    for (const kind in S.WEAPONS) {
      if (!weaponLevel(game, kind)) continue;
      S.WEAPONS[kind].draw(ctx, game, weaponScale(game, kind));
    }
    ctx.restore();
  };
})(Tethered);
