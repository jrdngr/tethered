// Weapons: upgrade-granted shapes attached to the ball. They arm on tether
// release while the ball is fast, orient along the velocity vector (the
// tail lags behind on a rotational spring), and expire (until the next
// release) once the ball slows into the flash-warning zone. A weapon hit
// resolves like a body smash with the weapon's bonus damage added, so
// weapons read as reach extensions of the ball.
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
  // Hit hooks, both optional, keep each weapon's quirks and special in its
  // own entry (updateWeaponCollisions calls them generically):
  //   onHit(game, e)    -> extra resolveSmash opts for this hit, or null to
  //                        decline it (the poker's re-hit cooldown)
  //   afterHit(game, e) -> side effects after the smash resolves
  S.WEAPONS = {
    poker: {
      name: 'POKER',
      dmg: () => S.TUNING.WEAPON_POKER_DMG,
      // POKER special: skewer — the spike doubles in length.
      reach: (game, scale) => S.TUNING.WEAPON_POKER_REACH * scale *
        (game.stats.specials.pokerSkewer ? S.TUNING.WEAPON_POKER_SKEWER_MULT : 1),
      // The poker pierces — its hits never bounce the ball away from what it
      // pokes — so without a cooldown it would re-hit a survivor it's still
      // plowing toward every tick. The hit flash doubles as the cooldown.
      onHit: (game, e) => (e.flash > 0 ? null : { pierce: true }),
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
      // EARS special: boxer — ear hits knock survivors back harder.
      onHit: (game) => ({
        knockMult: game.stats.specials.earsBoxer ? S.TUNING.WEAPON_EARS_KNOCK_MULT : 1,
      }),
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
      // HORNS special: gore — horn hits always bash through.
      onHit: (game) => ({ bashOverride: game.stats.specials.hornsGore }),
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
      // TAIL special: wake — a tail hit also shoves everything nearby.
      afterHit(game) {
        if (!game.stats.specials.tailWake) return;
        const T = S.TUNING;
        const b = game.ball;
        S.geom.radialPush(game.enemies, b.x, b.y, T.ENEMY_POP_PUSH, T.ENEMY_POP_PUSH_RADIUS, 'kx', 'ky');
      },
      // The tail is floppy: it points along its own sprung world angle
      // (integrated in updateWeapons) rather than snapping straight behind.
      // Capsules and draw work in the ball-local frame (callers rotate by
      // the heading), so the world angle is expressed as an offset from it.
      localAngle(game) {
        const b = game.ball;
        return game.weaponState.tailAngle - Math.atan2(b.vy, b.vx);
      },
      capsules(game, scale) {
        const T = S.TUNING;
        const r0 = game.ball.r;
        const a = this.localAngle(game);
        const tip = r0 + T.WEAPON_TAIL_REACH * scale;
        return [{ x1: Math.cos(a) * r0, y1: Math.sin(a) * r0,
          x2: Math.cos(a) * tip, y2: Math.sin(a) * tip,
          r: T.WEAPON_TAIL_WIDTH * scale }];
      },
      // Reverse taper to the spike: a point under the ball flaring out to
      // the wide end at the tip, so the tail reads heaviest away from it.
      draw(ctx, game, scale) {
        const T = S.TUNING;
        const tip = game.ball.r + T.WEAPON_TAIL_REACH * scale;
        const halfWidth = T.WEAPON_TAIL_WIDTH * scale;
        ctx.save();
        ctx.rotate(this.localAngle(game));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(tip, -halfWidth);
        ctx.lineTo(tip, halfWidth);
        ctx.closePath();
        ctx.fill();
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
  S.updateWeapons = function (game, dt) {
    if (game.tether.active || S.ballSpeed(game.ball) < armSpeed()) {
      game.weaponState.active = false;
    }
    // Floppy-tail spring: the tail's world angle chases straight-behind
    // with rotational force. The spring is underdamped, so it overshoots
    // and keeps swinging — it (almost) never sits still. On top of the
    // base spring, the ball's velocity is a headwind: a speed-proportional
    // pull toward straight-behind, so a fast ball recenters its tail
    // quickly without losing the wag. Integrated every tick, armed or
    // not, so it's already trailing when the weapons deploy.
    const T = S.TUNING;
    const ws = game.weaponState;
    const b = game.ball;
    const tdt = dt * T.WEAPON_TAIL_TIME_SCALE; // slowed time: same motion shape, slower playback
    const target = Math.atan2(-b.vy, -b.vx);
    const dev = Math.atan2(Math.sin(target - ws.tailAngle), Math.cos(target - ws.tailAngle));
    const k = T.WEAPON_TAIL_TURN_K + T.WEAPON_TAIL_WIND_PER_SPEED * S.ballSpeed(b);
    ws.tailVel += k * dev * tdt;
    ws.tailVel *= Math.exp(-T.WEAPON_TAIL_TURN_DAMPING * tdt);
    const a = ws.tailAngle + ws.tailVel * tdt;
    ws.tailAngle = Math.atan2(Math.sin(a), Math.cos(a)); // keep wrapped
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

  // Weapon pass, run before the body-collision loop: each enemy takes at
  // most one weapon hit per tick; resolveSmash kills (flagging dead for the
  // sweep) or knocks the survivor flush against the weapon, so the body
  // loop can't land a second hit the same step.
  S.updateWeaponCollisions = function (game) {
    if (!game.weaponState.active) return;
    const segs = S.weaponSegments(game);
    if (!segs.length) return;
    const b = game.ball;
    // Broadphase: only enemies near some capsule can be hit. Collecting into
    // a set up front keeps the enemies-outer iteration below — and with it
    // the hit order and the one-hit-per-enemy rule — identical to a full
    // scan. (A survivor only ever relocates toward the weapon that hit it,
    // so nothing can be knocked *into* range mid-pass.)
    const near = new Set();
    for (const s of segs) {
      for (const e of S.grid.querySegment(s.x1, s.y1, s.x2, s.y2, s.r + S.grid.maxR)) near.add(e);
    }
    for (const e of game.enemies) {
      if (!near.has(e) || e.dead || e.invuln > 0) continue;
      for (const s of segs) {
        const def = S.WEAPONS[s.kind];
        const p = S.geom.segClosest(s.x1, s.y1, s.x2, s.y2, e.x, e.y);
        const hit = S.geom.circleOverlap(e.x, e.y, e.r, p.x, p.y, s.r);
        if (!hit) continue;
        // The weapon's own hit options (pierce, bash/knock overrides); null
        // declines the hit (the poker's re-hit cooldown).
        const opts = def.onHit ? def.onHit(game, e) : {};
        if (!opts) continue;
        // Same normal convention as the body collision: from the enemy
        // toward the contact, so a tip hit bounces the ball back along the
        // weapon's axis and a side hit deflects it laterally.
        let { nx, ny } = hit;
        // An enemy dead on the capsule axis has no contact direction — a
        // zero normal would zero the ball's bounce. It happens for real: a
        // body bounce off a survivor leaves ball, velocity, and enemy
        // collinear, putting the enemy exactly on the tail's axis next
        // tick. Fall back to enemy→ball, the line the weapon swept along.
        if (hit.d < 1e-6) {
          const d = Math.hypot(b.x - e.x, b.y - e.y) || 1;
          nx = (b.x - e.x) / d;
          ny = (b.y - e.y) / d;
        }
        S.resolveSmash(game, e, nx, ny, false, {
          dmgBonus: S.weaponDamage(game, s.kind),
          ax: p.x, ay: p.y, ar: s.r,
          ...opts,
        });
        if (def.afterHit) def.afterHit(game, e);
        break;
      }
    }
  };

  // Drawn under the ball fill so the shapes emerge from its rim. Weapons are
  // only ever visible while the ball is fast and bright, so a fixed pale
  // cyan reads as part of it. While tethered, owned weapons instead show as
  // a faded fixed-size ghost (`preview`) — a hint that release deploys them.
  // The preview never grows: it uses WEAPON_PREVIEW_SCALE regardless of
  // level, and a stub `stats` hides size specials like the poker's skewer.
  S.drawWeapons = function (ctx, game, preview) {
    const b = game.ball;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillStyle = '#aef4ff';
    if (preview) ctx.globalAlpha *= 0.5; // faded ghost (× any i-frame flash fade)
    const g = preview ? { ball: game.ball, stats: { specials: {} }, weaponState: game.weaponState } : game;
    for (const kind in S.WEAPONS) {
      if (!weaponLevel(game, kind)) continue;
      S.WEAPONS[kind].draw(ctx, g, preview ? S.TUNING.WEAPON_PREVIEW_SCALE : weaponScale(game, kind));
    }
    ctx.restore();
  };
})(Tethered);
