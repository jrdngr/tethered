// Enemies: a per-type definition registry (stats, spawn gating, behavior
// hooks), edge spawning with a ramping rate, steering, collision outcomes.
window.Tethered = window.Tethered || {};

(function (S) {
  // Steering brains. Each integrates position from its own steering plus the
  // shared decaying knockback (kx/ky). Default: seek the ball along the flow
  // field (straight when in line of sight) so chasers round walls instead of
  // pressing into them.
  function seekBall(game, e, dt) {
    const dir = S.desiredDir(game, e);
    e.x += (dir.x * e.speed + e.kx) * dt;
    e.y += (dir.y * e.speed + e.ky) * dt;
  }

  // Walk back toward the home position the enemy was placed at (deaggro).
  // Straight-line; the wall pass slides it along obstructions and the
  // return timeout sleeps it in place if a concave pocket dead-sticks it.
  function steerHome(game, e, dt) {
    const dx = e.home.x - e.x;
    const dy = e.home.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += ((dx / d) * e.speed + e.kx) * dt;
    e.y += ((dy / d) * e.speed + e.ky) * dt;
  }

  // Advance the aggro state machine; returns false when the enemy is dormant
  // (caller skips it entirely this step). dormant→awake when the ball comes
  // within AGGRO_RADIUS; awake→returning past DEAGGRO_RADIUS; returning
  // re-aggros if the ball comes back, sleeps on reaching home, or sleeps in
  // place after RETURN_TIMEOUT if a wall dead-sticks the walk back.
  function updateAggro(game, e, dt) {
    const T = S.TUNING;
    const d = Math.hypot(game.ball.x - e.x, game.ball.y - e.y);
    if (e.aggro === 'dormant') {
      if (d <= T.AGGRO_RADIUS) { e.aggro = 'awake'; return true; }
      return false;
    }
    if (e.aggro === 'awake') {
      if (d > T.DEAGGRO_RADIUS) { e.aggro = 'returning'; e.returnTimer = 0; }
      return true;
    }
    // returning
    if (d <= T.AGGRO_RADIUS) { e.aggro = 'awake'; return true; }
    e.returnTimer += dt;
    const dh = Math.hypot(e.home.x - e.x, e.home.y - e.y);
    if (dh < T.TILE_SIZE || e.returnTimer >= T.RETURN_TIMEOUT) { e.aggro = 'dormant'; return false; }
    return true;
  }

  // Contact aggro: anything that touches an enemy wakes it (covers the
  // returning→awake case the proximity check would otherwise miss for a
  // step). Proximity already covers dormant — contact can't reach a sleeper.
  S.wakeEnemy = function (e) {
    if (e.aggro !== 'awake') { e.aggro = 'awake'; e.returnTimer = 0; }
  };

  // Runner: chase like a chaser, but bolt once the ball gets close — pinned
  // inside the arena so fleeing can't leave the screen. A smash-speed ball
  // closing inside the trigger distance sets off a panic dash: a telegraphed
  // freeze (the blink), then an unpredictable burst through the knockback
  // plumbing whose contact stings (the dash damage) while the danger window
  // runs — collecting the 3× bounty is a pursuit with a mistake cost.
  function runnerBrain(game, e, dt) {
    const T = S.TUNING;
    const bs = e.brainState;
    const dx = game.ball.x - e.x;
    const dy = game.ball.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (bs.cooldown > 0) bs.cooldown -= dt;
    if (bs.danger > 0) {
      bs.danger -= dt;
      if (bs.danger <= 0) e.damage = bs.baseDamage;
    }
    if (bs.windup > 0) {
      bs.windup -= dt;
      if (bs.windup <= 0) {
        // Burst away from the ball ± up to 75° of scatter — readable as
        // panic, unpredictable enough that the chaser can't pre-aim.
        const a = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * (150 * Math.PI / 180);
        e.kx += Math.cos(a) * T.RUNNER_DASH_SPEED;
        e.ky += Math.sin(a) * T.RUNNER_DASH_SPEED;
        e.damage = T.RUNNER_DASH_DAMAGE;
        bs.danger = T.RUNNER_DASH_DANGER;
        bs.cooldown = T.RUNNER_DASH_COOLDOWN;
      }
      // Frozen mid-windup (knockback still applies): the telegraph beat.
      e.x += e.kx * dt;
      e.y += e.ky * dt;
    } else {
      if (bs.cooldown <= 0 && d < T.RUNNER_DASH_TRIGGER_DIST &&
          S.ballSpeed(game.ball) > T.SPEED_THRESHOLD) {
        bs.windup = T.RUNNER_DASH_WINDUP;
      }
      // Close: flee down an open corridor (clearance-aware, so it doesn't
      // corner-trap). Far: chase along the flow field.
      const dir = d < T.RUNNER_FLEE_RADIUS ? S.fleeDir(game, e) : S.desiredDir(game, e);
      e.x += (dir.x * e.speed + e.kx) * dt;
      e.y += (dir.y * e.speed + e.ky) * dt;
    }
    // No bounds clamp: the end-of-update wall pass keeps everyone on floor.
  }

  // Orbiter brain. Drift: creep toward the ball, bleeding speed. Stalled:
  // anchor in place and spiral out to max radius, close back in, then drift
  // again. Knockback shoves the anchor while orbiting.
  function orbiterBrain(game, e, dt) {
    const T = S.TUNING;
    const bs = e.brainState;
    if (bs.phase === 'drift') {
      bs.driftSpeed *= Math.exp(-T.ORBITER_DECEL * dt);
      const dir = S.desiredDir(game, e);
      e.x += (dir.x * bs.driftSpeed + e.kx) * dt;
      e.y += (dir.y * bs.driftSpeed + e.ky) * dt;
      if (bs.driftSpeed <= T.ORBITER_STOP_SPEED) {
        bs.phase = 'orbit';
        bs.cx = e.x;
        bs.cy = e.y;
        bs.angle = Math.random() * Math.PI * 2;
        bs.radius = 0;
        bs.radiusDir = 1;
      }
    } else {
      bs.cx += e.kx * dt;
      bs.cy += e.ky * dt;
      bs.angle += T.ORBITER_ANGULAR_SPEED * dt;
      bs.radius += bs.radiusDir * T.ORBITER_RADIUS_SPEED * dt;
      if (bs.radius >= T.ORBITER_MAX_RADIUS) {
        bs.radius = T.ORBITER_MAX_RADIUS;
        bs.radiusDir = -1;
      } else if (bs.radius <= 0) {
        bs.phase = 'drift';
        bs.driftSpeed = T.ORBITER_SPEED;
      }
      // Clamp the effective radius to the anchor's clearance so the orbit
      // shrinks gracefully in a tight chamber/corridor instead of writing
      // the orbiter into a wall (a raw push-out can't hold — the next tick
      // recomputes position from the anchor).
      let r = bs.radius;
      if (game.map) {
        const tx = Math.floor(bs.cx / T.TILE_SIZE);
        const ty = Math.floor(bs.cy / T.TILE_SIZE);
        if (!game.map.isWall(tx, ty)) {
          const clrPx = game.map.clearance[ty * game.map.tw + tx] * T.TILE_SIZE;
          r = Math.min(r, Math.max(0, clrPx - e.r));
        }
      }
      e.x = bs.cx + Math.cos(bs.angle) * r;
      e.y = bs.cy + Math.sin(bs.angle) * r;
    }
  }

  // An orbiting orbiter's position is recomputed from its anchor, so a shift
  // must move the anchor along with it.
  function orbiterShift(e, dx, dy) {
    const bs = e.brainState;
    if (bs.phase === 'orbit') {
      bs.cx += dx;
      bs.cy += dy;
    }
  }

  // Spitter: holds a standoff band from the ball — advancing when far,
  // backing off when crowded — and lobs slow projectiles on a timer. The
  // shots ignore ball speed entirely, so "stay fast" has to path around
  // them.
  function spitterBrain(game, e, dt) {
    const T = S.TUNING;
    const dx = game.ball.x - e.x;
    const dy = game.ball.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const bs = e.brainState;
    // Hold the standoff band, pathing via the flow field when the line is
    // broken (advance toward the ball when far, retreat when crowded).
    if (d > T.SPITTER_RANGE) {
      const dir = S.desiredDir(game, e);
      e.x += (dir.x * e.speed + e.kx) * dt;
      e.y += (dir.y * e.speed + e.ky) * dt;
    } else if (d < T.SPITTER_RANGE * 0.7) {
      e.x += ((-dx / d) * e.speed + e.kx) * dt;
      e.y += ((-dy / d) * e.speed + e.ky) * dt;
    } else {
      e.x += e.kx * dt;
      e.y += e.ky * dt;
    }
    // Fire only with a clear line — no wasting shots into a wall. A short
    // telegraphed wind-up (the tell, drawn by render) precedes the shot.
    const los = S.geom && d <= T.SPITTER_RANGE * 1.2 && clearLine(game, e.x, e.y);
    if (bs.windup > 0) {
      bs.windup -= dt;
      if (bs.windup <= 0 && game.state === S.STATE.PLAYING) {
        game.projectiles.push({
          x: e.x, y: e.y,
          vx: (dx / d) * T.PROJECTILE_SPEED,
          vy: (dy / d) * T.PROJECTILE_SPEED,
          r: T.PROJECTILE_RADIUS,
          damage: T.PROJECTILE_DAMAGE,
          age: 0,
        });
        bs.fire = T.SPITTER_FIRE_INTERVAL;
      }
    } else {
      bs.fire -= dt;
      if (bs.fire <= 0 && los && game.state === S.STATE.PLAYING) {
        bs.windup = T.SPITTER_WINDUP; // telegraph, then fire
      }
    }
  }

  // Clear tile line from a spitter to the ball — the same DDA the flow
  // field's LOS uses, but unbounded by range (the caller gates range).
  function clearLine(game, x, y) {
    const T = S.TUNING;
    const map = game.map;
    if (!map) return true;
    const dx = game.ball.x - x;
    const dy = game.ball.y - y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / (T.TILE_SIZE * 0.5));
    for (let s = 1; s < steps; s++) {
      const px = x + (dx * s) / steps;
      const py = y + (dy * s) / steps;
      if (map.isWall(Math.floor(px / T.TILE_SIZE), Math.floor(py / T.TILE_SIZE))) return false;
    }
    return true;
  }

  // Shieldbearer: seeks like a chaser with its guard raised toward the
  // ball. The guard turns at SHIELD_TURN_RATE rather than snapping, so a
  // quick swing around it beats the tracking — rear hits are earned by
  // movement, not just wraps. A bash breaks the guard open (stun): it
  // stands dazed — knockback only — and is vulnerable from every side
  // until it recovers.
  function shieldBrain(game, e, dt) {
    const T = S.TUNING;
    const bs = e.brainState;
    if (bs.glint > 0) bs.glint -= dt;
    if (bs.stun > 0) {
      bs.stun -= dt;
      e.x += e.kx * dt;
      e.y += e.ky * dt;
      return;
    }
    const dx = game.ball.x - e.x;
    const dy = game.ball.y - e.y;
    const want = Math.atan2(dy, dx);
    if (bs.fx === 0 && bs.fy === 0) {
      // First tick: raise the guard toward the ball, no swing-around.
      bs.fx = Math.cos(want);
      bs.fy = Math.sin(want);
    } else {
      let diff = want - Math.atan2(bs.fy, bs.fx);
      if (diff > Math.PI) diff -= Math.PI * 2;
      else if (diff < -Math.PI) diff += Math.PI * 2;
      const max = (T.SHIELD_TURN_RATE * Math.PI / 180) * dt;
      const a = want - diff + Math.max(-max, Math.min(max, diff));
      bs.fx = Math.cos(a);
      bs.fy = Math.sin(a);
    }
    // Guard faces the ball (above); movement follows the flow field so it
    // closes around walls rather than pressing its shield into one.
    const dir = S.desiredDir(game, e);
    e.x += (dir.x * e.speed + e.kx) * dt;
    e.y += (dir.y * e.speed + e.ky) * dt;
  }

  // Guard hook (see resolveSmash): refuse front-arc damage while the guard
  // is up. A bash deals no damage either, but breaks the guard open — the
  // stun is the payoff, making angle play (wraps, slingshots, rear hits)
  // the answer rather than raw damage.
  function shieldGuard(game, e, nx, ny, bash) {
    const T = S.TUNING;
    const bs = e.brainState;
    if (bs.stun > 0) return false; // guard down — the hit lands
    const half = (T.SHIELD_ARC / 2) * Math.PI / 180;
    if (nx * bs.fx + ny * bs.fy < Math.cos(half)) return false; // from behind
    if (bash) bs.stun = T.SHIELD_STUN;
    bs.glint = T.HIT_FLASH_DURATION;
    return true;
  }

  // Everything about an enemy type in one place. `stats` resolves from TUNING
  // at spawn time so console tuning shows up live; `spawnGate` claims a slice
  // of each spawn roll once its delay passes (no gate = the fallback chaser);
  // `splitCount` types break into that many children (`splitChild`, default
  // chaser) instead of paying out.
  // Hooks: `onSpawn` (brain-private state goes under `e.brainState` — each
  // brain owns its namespace; engine fields stay top-level), `brain`
  // (steering; default seekBall),
  // `onShift` (keep brain state consistent when the enemy is teleported),
  // `guard` (inspect a smash's contact normal and refuse the damage —
  // shieldbearer; the ball still bounces), `punishesSpeed` (flag: fast
  // non-bash contact hurts the ball instead of smashing — spiker; see the
  // collision branch in updateEnemies), and
  // `draw` (render decoration — render.js draws the base disc in `color`,
  // then `draw`, plus one seam line per pair of `pieces`, the chasers the
  // type ultimately yields — splitCount unless its children split further).
  // Adding a type is one entry here plus its TUNING constants.
  S.ENEMY_TYPES = {
    chaser: {
      color: '#e5484d', // red
      stats: (T) => ({ r: T.ENEMY_RADIUS, hp: T.ENEMY_HP, damage: T.ENEMY_DAMAGE, speed: T.ENEMY_SPEED, coinMult: 1 }),
    },
    // Gated types claim their roll slice in this order (see the spawn-mix
    // notes in tuning.js).
    tank: {
      color: '#b558f6', // purple
      stats: (T) => ({ r: T.TANK_RADIUS, hp: T.TANK_HP, damage: T.TANK_DAMAGE, speed: T.TANK_SPEED, coinMult: T.TANK_COIN_MULT }),
      spawnGate: (T) => ({ unlock: T.TANK_UNLOCK_DEPTH, weight: T.TANK_CHANCE }),
      // Armor ring above 1 HP that breaks off with the first hit.
      draw(ctx, e) {
        if (e.hp <= 1) return;
        ctx.strokeStyle = '#d8b4fe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2);
        ctx.stroke();
      },
    },
    splitter: {
      color: '#f76b15', // orange
      stats: (T) => ({ r: T.SPLITTER_RADIUS, hp: T.SPLITTER_HP, damage: T.SPLITTER_DAMAGE, speed: T.SPLITTER_SPEED, coinMult: 1 }),
      spawnGate: (T) => ({ unlock: T.SPLITTER_UNLOCK_DEPTH, weight: T.SPLITTER_CHANCE }),
      splitCount: 2,
    },
    supersplitter: {
      color: '#ff3300', // red-orange — a splitter, but angrier
      stats: (T) => ({ r: T.SUPER_SPLITTER_RADIUS, hp: T.SUPER_SPLITTER_HP, damage: T.SUPER_SPLITTER_DAMAGE, speed: T.SUPER_SPLITTER_SPEED, coinMult: 1 }),
      spawnGate: (T) => ({ unlock: T.SUPER_SPLITTER_UNLOCK_DEPTH, weight: T.SUPER_SPLITTER_CHANCE }),
      splitCount: 2,
      splitChild: 'splitter',
      pieces: 4, // seams show the four chasers its splitters become
    },
    orbiter: {
      color: '#e93d82', // pink
      stats: (T) => ({ r: T.ORBITER_RADIUS, hp: T.ORBITER_HP, damage: T.ORBITER_DAMAGE, speed: T.ORBITER_SPEED, coinMult: 1 }),
      spawnGate: (T) => ({ unlock: T.ORBITER_UNLOCK_DEPTH, weight: T.ORBITER_CHANCE }),
      onSpawn(e) {
        e.brainState = {
          phase: 'drift', // 'drift' (creep toward ball) or 'orbit' (spiral)
          driftSpeed: e.speed,
        };
      },
      brain: orbiterBrain,
      onShift: orbiterShift,
    },
    runner: {
      color: '#cc9a1f', // dark gold — it's the payday target
      stats: (T) => ({ r: T.RUNNER_RADIUS, hp: T.RUNNER_HP, damage: T.RUNNER_DAMAGE, speed: T.RUNNER_SPEED, coinMult: T.RUNNER_COIN_MULT }),
      spawnGate: (T) => ({ unlock: T.RUNNER_UNLOCK_DEPTH, weight: T.RUNNER_CHANCE }),
      onSpawn(e) {
        e.brainState = { windup: 0, danger: 0, cooldown: 0, baseDamage: e.damage };
      },
      brain: runnerBrain,
      // Panic-dash telegraph: a hard white blink through the wind-up, then a
      // red danger ring while contact stings. (The dev panel's mini glyph
      // has no brainState — calm runner, no decoration.)
      draw(ctx, e) {
        const T = S.TUNING;
        const bs = e.brainState || { windup: 0, danger: 0 };
        if (bs.windup > 0) {
          if (Math.floor(bs.windup / (T.RUNNER_DASH_WINDUP / 3)) % 2 === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (bs.danger > 0) {
          ctx.strokeStyle = '#e5484d';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      },
    },
    spitter: {
      color: '#3dd68c', // mint — the zoner
      stats: (T) => ({ r: T.SPITTER_RADIUS, hp: T.SPITTER_HP, damage: T.SPITTER_DAMAGE, speed: T.SPITTER_SPEED, coinMult: 1 }),
      spawnGate: (T) => ({ unlock: T.SPITTER_UNLOCK_DEPTH, weight: T.SPITTER_CHANCE }),
      onSpawn(e) {
        // Desynced fire timers so a pack doesn't volley in lockstep.
        e.brainState = { fire: S.TUNING.SPITTER_FIRE_INTERVAL * (0.5 + Math.random() * 0.5), windup: 0 };
      },
      brain: spitterBrain,
      // The dark "mouth" it spits from.
      draw(ctx, e) {
        ctx.fillStyle = '#0d0e14';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    spiker: {
      color: '#8d93a5', // steel — a drifting mine
      punishesSpeed: true,
      stats: (T) => ({ r: T.SPIKER_RADIUS, hp: T.SPIKER_HP, damage: T.SPIKER_DAMAGE, speed: T.SPIKER_SPEED, coinMult: 1 }),
      spawnGate: (T) => ({ unlock: T.SPIKER_UNLOCK_DEPTH, weight: T.SPIKER_CHANCE }),
      // The spike ring — the "don't hit me fast" warning.
      draw(ctx, e) {
        ctx.strokeStyle = '#cdd3e0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.moveTo(e.x + Math.cos(a) * e.r * 0.7, e.y + Math.sin(a) * e.r * 0.7);
          ctx.lineTo(e.x + Math.cos(a) * (e.r + 5), e.y + Math.sin(a) * (e.r + 5));
        }
        ctx.stroke();
      },
    },
    shieldbearer: {
      color: '#5472f0', // blue — the guard
      stats: (T) => ({ r: T.SHIELD_RADIUS, hp: T.SHIELD_HP, damage: T.SHIELD_DAMAGE, speed: T.SHIELD_SPEED, coinMult: 1 }),
      spawnGate: (T) => ({ unlock: T.SHIELD_UNLOCK_DEPTH, weight: T.SHIELD_CHANCE }),
      onSpawn(e) {
        e.brainState = { fx: 0, fy: 0, stun: 0, glint: 0 }; // facing set by the brain
      },
      brain: shieldBrain,
      guard: shieldGuard,
      // The guard: a bright arc on the facing side, glinting white when it
      // blocks; gone while stunned. (The dev panel's mini glyph has no
      // brainState — default to a raised guard facing +x.)
      draw(ctx, e) {
        const T = S.TUNING;
        const bs = e.brainState || { fx: 1, fy: 0, stun: 0, glint: 0 };
        if (bs.stun > 0) return;
        const a = Math.atan2(bs.fy, bs.fx);
        const half = (T.SHIELD_ARC / 2) * Math.PI / 180;
        ctx.strokeStyle = bs.glint > 0 ? '#ffffff' : '#aef4ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 3, a - half, a + half);
        ctx.stroke();
      },
    },
  };

  // One roll decides a spawn type for the given depth: each type unlocked at
  // its depth claims its weight slice; whatever's left is a basic chaser.
  // Weights ramp with depth (one shared factor, proportions hold), clamped
  // so the specials' total never exceeds MIX_SPECIAL_TOTAL_MAX. An optional
  // theme multiplies one type's weight (themed floors); `pool`, if given,
  // restricts to those unlocked types (pattern-specific mixes).
  function rollTypeForDepth(depth, theme, pool) {
    const T = S.TUNING;
    const list = [];
    let total = 0;
    for (const type in S.ENEMY_TYPES) {
      const gate = S.ENEMY_TYPES[type].spawnGate;
      if (!gate) continue;
      const g = gate(T);
      if (depth < g.unlock) continue;
      if (pool && pool.indexOf(type) < 0) continue;
      let w = g.weight;
      if (theme && theme.type === type) w *= theme.mult;
      list.push([type, w]);
      total += w;
    }
    if (!total) return 'chaser';
    const ramp = Math.min(1 + depth / T.MIX_RAMP_DEPTH, T.MIX_SPECIAL_TOTAL_MAX / total);
    let roll = Math.random();
    for (const [type, w] of list) {
      const p = w * ramp;
      if (roll < p) return type;
      roll -= p;
    }
    return 'chaser';
  }

  function makeEnemy(game, type, x, y) {
    const T = S.TUNING;
    const def = S.ENEMY_TYPES[type];
    const stats = def.stats(T);
    // Depth stat scaling, baked in at spawn: deeper enemies are tougher and
    // a touch faster, not just more numerous. HP rounds so hits-to-kill
    // stays a clean integer step.
    const d = (game.depth || 1) - 1;
    const hp = Math.round(stats.hp * (1 + T.ENEMY_SCALE_HP_PER_DEPTH * d));
    const e = {
      x, y, type,
      kx: 0, ky: 0,
      r: stats.r,
      hp,
      maxHp: hp,
      damage: stats.damage,
      speed: stats.speed * (1 + T.ENEMY_SCALE_SPEED_PER_DEPTH * d),
      coinMult: stats.coinMult,
      flash: 0, // hit-feedback timer when a smash doesn't kill
      invuln: 0, // can't be hurt (or hurt the ball) while this runs down
      // Aggro: placed enemies idle until the ball nears (proximity is always
      // a wider net than contact, so a dormant enemy can't be touched). home
      // is where it returns to and sleeps when the ball leaves.
      aggro: 'dormant', // 'dormant' | 'awake' | 'returning'
      home: { x, y },
      returnTimer: 0,
    };
    if (def.splitCount) {
      e.splitCount = def.splitCount;
      e.splitChild = def.splitChild;
      e.pieces = def.pieces || def.splitCount;
    }
    if (def.onSpawn) def.onSpawn(e);
    return e;
  }

  // === Generation-time placement (M5) ======================================
  // Enemies are dropped into the map once, at generation, by a pattern
  // library — no trickle spawner. Depth drives count, mix, and which
  // patterns dominate.

  // Clearance (px) a type needs around a placement point — orbiter needs its
  // whole orbit, spiker wants chamber interior; the rest just their body.
  function minClearPx(type, r) {
    const T = S.TUNING;
    if (type === 'orbiter') return T.ORBITER_MAX_RADIUS + r + 10;
    if (type === 'spiker') return r + T.TILE_SIZE * 2;
    return r + 8;
  }

  // Try to create an enemy of `type` at (x, y): rejects walls, too-tight
  // floor, overlapping a shape, or inside the spawn safe-zone. Returns the
  // enemy or null. Honors the global cap.
  function tryPlace(game, type, x, y) {
    const T = S.TUNING;
    const map = game.map;
    if (game.enemies.length >= T.ENEMY_CAP) return null;
    const r = S.ENEMY_TYPES[type].stats(T).r;
    const tx = Math.floor(x / T.TILE_SIZE);
    const ty = Math.floor(y / T.TILE_SIZE);
    if (map.isWall(tx, ty)) return null;
    if (map.clearance[ty * map.tw + tx] * T.TILE_SIZE < minClearPx(type, r)) return null;
    if (Math.hypot(x - map.spawn.x, y - map.spawn.y) < T.SAFE_SPAWN_RADIUS) return null;
    for (const o of game.obstacles) if (S.obstacleHit(o, x, y, r)) return null;
    const e = makeEnemy(game, type, x, y);
    game.enemies.push(e);
    return e;
  }

  // Place `count` enemies around (cx, cy) within `spread` px. typeFn() picks
  // each type; a type that won't fit after a few tries substitutes a chaser
  // (always placeable), so budgets are met without leaving gaps.
  function placeCluster(game, cx, cy, spread, count, typeFn) {
    for (let i = 0; i < count; i++) {
      let placed = null;
      for (let tries = 0; tries < 10 && !placed; tries++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * spread;
        const type = tries < 7 ? typeFn() : 'chaser';
        placed = tryPlace(game, type, cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      }
    }
  }

  const PATTERN_POOLS = {
    PACK: ['chaser', 'splitter', 'runner', 'super-splitter'],
    AMBUSH: null,   // any unlocked type (the mixed surprise)
    GUARD: ['shieldbearer', 'spitter', 'orbiter', 'tank'],
    SCATTER: null,  // any unlocked type, loosely spread
  };

  function rollPattern(depth) {
    const T = S.TUNING;
    const band = depth <= 3 ? 0 : depth <= 6 ? 1 : 2;
    const w = T.PATTERN_WEIGHTS;
    const keys = Object.keys(w);
    let total = 0;
    for (const k of keys) total += w[k][band];
    let r = Math.random() * total;
    for (const k of keys) { if (r < w[k][band]) return k; r -= w[k][band]; }
    return 'SCATTER';
  }

  // Lay one pattern into a room.
  function placePattern(game, ch, pattern, depth, theme, budget) {
    const T = S.TUNING;
    const cx = ch.cx * T.TILE_SIZE;
    const cy = ch.cy * T.TILE_SIZE;
    const rw = ch.r * T.TILE_SIZE;
    const pool = PATTERN_POOLS[pattern];
    const pick = () => rollTypeForDepth(depth, theme, pool);
    if (pattern === 'PACK') {
      // A tight knot of fodder off-center — combo bait.
      const a = Math.random() * Math.PI * 2;
      const ox = cx + Math.cos(a) * rw * 0.4;
      const oy = cy + Math.sin(a) * rw * 0.4;
      placeCluster(game, ox, oy, rw * 0.3, budget + 2, pick);
    } else if (pattern === 'GUARD') {
      // A couple of controllers anchored at the room center.
      placeCluster(game, cx, cy, rw * 0.4, Math.max(2, Math.round(budget * 0.6)), pick);
    } else if (pattern === 'AMBUSH') {
      // A waiting group on the room's far side (they're dormant by default).
      const a = Math.random() * Math.PI * 2;
      placeCluster(game, cx + Math.cos(a) * rw * 0.55, cy + Math.sin(a) * rw * 0.55, rw * 0.35, budget + 1, pick);
    } else {
      // SCATTER: loose across the whole room.
      placeCluster(game, cx, cy, rw * 0.75, budget, pick);
    }
  }

  // The exit-room garrison: a heavy guard the player must fight through to
  // hold the exit. Grows with depth (depth 10 the toughest), drawn from the
  // controller pool plus straight fodder.
  function placeGarrison(game, ch, depth, theme) {
    const T = S.TUNING;
    const cx = ch.cx * T.TILE_SIZE;
    const cy = ch.cy * T.TILE_SIZE;
    const rw = ch.r * T.TILE_SIZE;
    const n = Math.round(T.EXIT_GUARD_BASE + T.EXIT_GUARD_PER_DEPTH * (depth - 1));
    placeCluster(game, cx, cy, rw * 0.6, n, () => rollTypeForDepth(depth, theme));
  }

  // One instance of a freshly-unlocked type, dropped in an early room on the
  // path so the player meets it before packs/themes pile on (the debut beat).
  function placeDebut(game, depth, theme) {
    let debutType = null;
    for (const type in S.ENEMY_TYPES) {
      const g = S.ENEMY_TYPES[type].spawnGate;
      if (g && g(S.TUNING).unlock === depth) { debutType = type; break; }
    }
    if (!debutType) return;
    // Nearest non-spawn room to the player.
    let best = null;
    for (const ch of game.map.chambers) {
      if (ch.reserved === 'spawn') continue;
      const d = Math.hypot(ch.cx * S.TUNING.TILE_SIZE - game.map.spawn.x,
        ch.cy * S.TUNING.TILE_SIZE - game.map.spawn.y);
      if (!best || d < best.d) best = { ch, d };
    }
    if (best) placeCluster(game, best.ch.cx * S.TUNING.TILE_SIZE, best.ch.cy * S.TUNING.TILE_SIZE,
      best.ch.r * S.TUNING.TILE_SIZE * 0.4, 1, () => debutType);
  }

  // Stragglers: a few corridors get one or two lone wanderers.
  function placePassages(game, depth, theme) {
    const T = S.TUNING;
    const map = game.map;
    // Sample corridor-ish tiles (low-ish clearance floor outside rooms).
    const inRoom = (x, y) => map.chambers.some((c) =>
      Math.hypot(x - c.cx * T.TILE_SIZE, y - c.cy * T.TILE_SIZE) < c.r * T.TILE_SIZE);
    let placed = 0;
    const want = Math.round(map.chambers.length * T.PASSAGE_ENEMY_CHANCE);
    for (let tries = 0; tries < 200 && placed < want; tries++) {
      const tx = Math.floor(Math.random() * map.tw);
      const ty = Math.floor(Math.random() * map.th);
      if (map.isWall(tx, ty)) continue;
      const clr = map.clearance[ty * map.tw + tx];
      if (clr < 3 || clr > 6) continue; // corridor band, not deep rooms
      const p = map.tileToWorld(tx, ty);
      if (inRoom(p.x, p.y)) continue;
      if (tryPlace(game, rollTypeForDepth(depth, theme, ['chaser', 'runner']), p.x, p.y)) placed++;
    }
  }

  // Pick a themed-floor skew for this depth, or null.
  S.pickMapTheme = function (game) {
    const T = S.TUNING;
    if (Math.random() > T.THEME_CHANCE) { game.mapTheme = null; return; }
    const eligible = T.THEMES.filter((th) => game.depth >= th.minDepth);
    game.mapTheme = eligible.length ? eligible[Math.floor(Math.random() * eligible.length)] : null;
  };

  // Populate the whole map: a pattern per room, a heavy garrison in the exit
  // room, the new type's debut, and a few corridor stragglers. Called once
  // per map at generation (reset / nextMap).
  S.placeEnemies = function (game) {
    const T = S.TUNING;
    const depth = game.depth;
    const theme = game.mapTheme;
    const budget = Math.max(2, Math.round(T.ROOM_BUDGET_BASE + T.ROOM_BUDGET_PER_DEPTH * (depth - 1)));
    for (const ch of game.map.chambers) {
      if (ch.reserved === 'spawn') continue; // the breather room
      if (ch.reserved === 'exit') { placeGarrison(game, ch, depth, theme); continue; }
      placePattern(game, ch, rollPattern(depth), depth, theme, budget);
    }
    placeDebut(game, depth, theme);
    placePassages(game, depth, theme);
  };

  // Spawn a forced type at a world point — the dev panel drops one just
  // outside the ball's reach.
  S.spawnEnemyAt = function (game, type, x, y) {
    const r = S.ENEMY_TYPES[type].stats(S.TUNING).r;
    const e = makeEnemy(game, type,
      Math.max(r, Math.min(x, game.world.w - r)),
      Math.max(r, Math.min(y, game.world.h - r)));
    game.enemies.push(e);
    S.grid.insert(e);
    return e;
  };

  // A dead splitter breaks into its children (two chasers; a super-splitter
  // breaks into two regular splitters) flung evenly apart, briefly invincible
  // so the smash that freed them can't kill them in the same instant.
  function splitEnemy(game, e, count) {
    const T = S.TUNING;
    const base = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = base + (i / count) * Math.PI * 2;
      const child = makeEnemy(game, e.splitChild || 'chaser', e.x + Math.cos(a) * e.r * 0.6, e.y + Math.sin(a) * e.r * 0.6);
      child.kx = Math.cos(a) * T.SPLIT_FLING;
      child.ky = Math.sin(a) * T.SPLIT_FLING;
      child.invuln = T.SPLIT_INVULN;
      // Children of a fight are awake, and inherit the parent's home so they
      // leash back to it rather than to wherever the parent happened to die.
      child.aggro = 'awake';
      child.home = { x: e.home.x, y: e.home.y };
      game.enemies.push(child);
      S.grid.insert(child);
    }
  }

  // Move an enemy without breaking its brain — the type's onShift hook keeps
  // any derived state (an orbiter's anchor) in step.
  function shiftEnemy(e, dx, dy) {
    e.x += dx;
    e.y += dy;
    const onShift = S.ENEMY_TYPES[e.type].onShift;
    if (onShift) onShift(e, dx, dy);
  }

  // Enemies don't stack: overlapping pairs separate and trade a light bounce
  // through the same decaying knockback a hit applies. Pairs come from the
  // broadphase (rebuilt just before this pass) instead of an O(N²) walk;
  // sorting candidates by _gi keeps resolution order identical to the
  // brute-force i<j loop — shifts accumulate, so order matters. The query
  // pads by a cell to cover enemies already shifted by earlier pairs.
  const pairScratch = [];
  function resolveEnemyOverlaps(game) {
    const T = S.TUNING;
    const list = game.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const candidates = S.grid.queryCircle(a.x, a.y, a.r + S.grid.maxR + T.GRID_CELL);
      pairScratch.length = 0;
      for (const b of candidates) if (b._gi > a._gi) pairScratch.push(b);
      pairScratch.sort((p, q) => p._gi - q._gi);
      for (const b of pairScratch) {
        const hit = S.geom.circleOverlap(a.x, a.y, a.r, b.x, b.y, b.r);
        if (!hit) continue;
        const { nx, ny, overlap } = hit;
        shiftEnemy(a, -nx * overlap / 2, -ny * overlap / 2);
        shiftEnemy(b, nx * overlap / 2, ny * overlap / 2);
        a.kx -= nx * T.ENEMY_BOUNCE;
        a.ky -= ny * T.ENEMY_BOUNCE;
        b.kx += nx * T.ENEMY_BOUNCE;
        b.ky += ny * T.ENEMY_BOUNCE;
      }
    }
  }

  // Closest live enemy to (x, y), or null. Used by the TOP SPEED special's
  // homing bend.
  S.nearestEnemy = function (game, x, y) {
    let best = null;
    let bestD = Infinity;
    for (const e of game.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };

  // Pop a dead enemy: ring animation, shockwave to nearby enemies and
  // pickups (before this kill's own coins drop, so they only get their burst
  // scatter), splitter split after the shockwave (so the children only get
  // their own opposing fling), coin drop at the combo at the moment of the
  // kill, health-drop roll, and (for untethered kills) the combo bump.
  // Splitters drop nothing themselves — their children pay out instead.
  function popEnemy(game, e, bash, bumpCombo, wraps) {
    const T = S.TUNING;
    game.kills = (game.kills || 0) + 1; // run kill count for the end screens
    // Bash kills are the power moment: drop into slow-mo for a beat. min()
    // makes a bash during slow-mo a clean refresh, never a deepening jolt.
    // The screen flash marks the same beat.
    if (bash) {
      game.timeScale = Math.min(game.timeScale, T.SLOWMO_FACTOR);
      game.flash = T.BASH_FLASH_DURATION;
    }
    // Kill juice — shake, hit-stop, and a smash report, all heavier on a
    // bash. The pop's bash flag picks the bigger, hotter ring in render.js.
    S.addShake(game, bash ? T.SHAKE_BASH : T.SHAKE_KILL);
    S.addFreeze(game, bash ? T.HITSTOP_BASH : T.HITSTOP_KILL);
    S.audio.play(bash ? 'bash' : 'smash');
    game.pops.push({ x: e.x, y: e.y, r: e.r, t: 0, bash });
    const push = T.ENEMY_POP_PUSH * (bash ? T.BASH_POP_PUSH : 1);
    S.geom.radialPush(game.enemies, e.x, e.y, push, T.ENEMY_POP_PUSH_RADIUS, 'kx', 'ky');
    S.geom.radialPush(game.coins, e.x, e.y, push, T.ENEMY_POP_PUSH_RADIUS);
    if (e.splitCount) {
      splitEnemy(game, e, e.splitCount); // splitters drop nothing — no wrap bonus either
    } else {
      // Wrapped-rope kills sweeten the payout: a flat bonus per half-turn
      // wrap unit rides the normal coin path (so combo and coinMult apply),
      // with floating text so the reward is legible. The combo is already at
      // the reset ×1 here — wraps are paid in coins, not combo.
      const bonus = (wraps || 0) * T.WRAP_KILL_BONUS;
      S.spawnCoinBurst(game, e.x, e.y, e.coinMult, bonus);
      if (bonus) S.spawnFloater(game, e.x, e.y, `+${Math.round(bonus * S.comboPayout(game.combo) * e.coinMult)} WRAP`);
      if (Math.random() < T.HEALTH_DROP_CHANCE) S.spawnHealthPickup(game, e.x, e.y);
    }
    if (bumpCombo) S.bumpCombo(game);
  }

  // DAMAGE special: a smashed enemy's pop splash-damages the live enemies
  // inside its push radius; deaths pop normally (coins, combo) but don't
  // explode in turn — only enemies the player actually hits explode.
  // Corpses are flagged `dead` and swept at the end of updateEnemies.
  function explodePop(game, e) {
    const T = S.TUNING;
    // Distinct death animation: a blast wave out to the actual splash radius
    // on top of the normal pop ring (`explode` pops render fiery and live
    // POP_EXPLODE_DURATION instead of POP_DURATION).
    game.pops.push({ x: e.x, y: e.y, r: T.ENEMY_POP_PUSH_RADIUS, t: 0, explode: true });
    S.addShake(game, T.SHAKE_EXPLODE);
    for (const o of game.enemies) {
      if (o.dead || o.invuln > 0) continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) >= T.ENEMY_POP_PUSH_RADIUS) continue;
      o.hp -= T.POP_EXPLODE_DAMAGE;
      if (o.hp <= 0) {
        o.dead = true;
        popEnemy(game, o, false, true);
      } else {
        o.flash = T.HIT_FLASH_DURATION;
      }
    }
  }

  // Resolve a fast hit on an enemy — shared by body smashes and weapon hits.
  // nx/ny is the unit normal from the enemy toward the contact point. The
  // enemy takes the player's damage (speed-scaled once MOMENTUM is picked);
  // the ball bounces off along the normal (same shape as the damage
  // knockback) keeping most of its speed either way. Bashing — damage past
  // BASH_HP_FACTOR × max HP — plows through instead (deflected but never
  // bounced backwards) and pops with BASH_POP_PUSH × force. opts:
  //   dmgBonus     extra damage on top of smashDamage (weapon hits)
  //   pierce       the hit never redirects the ball — it keeps its heading
  //                (poker). The enemy is resolved normally, so a survivor
  //                still blocks and bounces the ball's body.
  //   bashOverride force a bash regardless of the damage threshold
  //   knockMult    × KNOCKBACK_SPEED on a surviving enemy
  //   ax/ay/ar     separation anchor a survivor is pushed flush against
  //                (defaults to the ball; weapons pass their contact point)
  //   wraps        half-turn wrap units at impact — a kill pays the wrap
  //                coin bonus (only tethered body smashes pass this)
  // Would a hit dealing `dmg` bash this enemy? (MOMENTUM special: bashing
  // comes easier at top speed.) Shared by resolveSmash and the spiker's
  // fast-contact exception in updateEnemies.
  S.wouldBash = function (game, e, dmg) {
    const T = S.TUNING;
    const bashFactor = game.stats.specials.bashEasy && S.atMaxSpeed(game)
      ? T.MOMENTUM_BASH_HP_FACTOR : T.BASH_HP_FACTOR;
    return dmg > e.maxHp * bashFactor;
  };

  S.resolveSmash = function (game, e, nx, ny, tethered, opts = {}) {
    const T = S.TUNING;
    const b = game.ball;
    if (tethered) game.combo = 1;
    const dmg = S.smashDamage(game) + (opts.dmgBonus || 0);
    const bash = opts.bashOverride || S.wouldBash(game, e, dmg);
    // A type can guard hits (shieldbearer): its hook inspects the contact
    // normal and refuses the damage — a bash breaks the guard open instead.
    // The ball still bounces/deflects below either way, so a blocked smash
    // reads as hitting a wall, not a whiff.
    const def = S.ENEMY_TYPES[e.type];
    const guarded = def.guard && def.guard(game, e, nx, ny, bash);
    if (!guarded) e.hp -= dmg;
    const killed = e.hp <= 0;
    if (killed) {
      e.dead = true;
      popEnemy(game, e, bash, !tethered, opts.wraps);
      if (game.stats.specials.popExplode) explodePop(game, e);
    } else {
      // Armor (or a guard) absorbed the hit: knock the enemy back and
      // separate so the next physics step doesn't land a second hit. No
      // combo — that only counts kills. Guards glint instead of flashing.
      const knock = T.KNOCKBACK_SPEED * (opts.knockMult || 1);
      const ax = opts.ax !== undefined ? opts.ax : b.x;
      const ay = opts.ay !== undefined ? opts.ay : b.y;
      const ar = opts.ar !== undefined ? opts.ar : b.r;
      if (!guarded) e.flash = T.HIT_FLASH_DURATION;
      e.kx = -nx * knock;
      e.ky = -ny * knock;
      e.x = ax - nx * (ar + e.r);
      e.y = ay - ny * (ar + e.r);
    }
    // KILL SURGE: pops feed speed back into the ball (capped next step);
    // its special pays out on every smash, kill or not. A bash plows
    // through: it deflects toward the bounce normal but never backwards
    // — clamped to BASH_DEFLECT_MAX off the incoming heading, so the
    // ball always keeps forward momentum. Otherwise it bounces off along
    // the normal.
    const surge = killed || game.stats.specials.surgeEverySmash ? game.stats.killBoost : 0;
    // Mass keeps speed through hits: the fraction lost shrinks as 1/mass.
    const keep = 1 - (1 - T.KILL_SPEED_KEEP) / game.stats.ballMass;
    const speed = S.ballSpeed(b) * keep + surge;
    if (opts.pierce) {
      // Pierce: straight through — the heading never changes.
      const heading = Math.atan2(b.vy, b.vx);
      b.vx = Math.cos(heading) * speed;
      b.vy = Math.sin(heading) * speed;
    } else if (bash) {
      const heading = Math.atan2(b.vy, b.vx);
      let dev = Math.atan2(ny, nx) - heading;
      dev = Math.atan2(Math.sin(dev), Math.cos(dev)); // wrap to ±180°
      // Mass straightens bashes: the deflection clamp shrinks as 1/mass.
      const max = (T.BASH_DEFLECT_MAX / game.stats.ballMass) * Math.PI / 180;
      const out = heading + Math.max(-max, Math.min(max, dev));
      b.vx = Math.cos(out) * speed;
      b.vy = Math.sin(out) * speed;
    } else {
      b.vx = nx * speed;
      b.vy = ny * speed;
    }
  };

  // Projectiles (spitter shots): straight flight, expiring on walls,
  // obstacles (cover works), or timeout. They hit the ball regardless of
  // its speed — only i-frames (and the shield, via damageBall) protect —
  // so they're dodged by pathing, not pace.
  function updateProjectiles(game, dt) {
    const T = S.TUNING;
    const b = game.ball;
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const p = game.projectiles[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      let gone = p.age >= T.PROJECTILE_LIFETIME ||
        p.x < -p.r || p.x > game.world.w + p.r || p.y < -p.r || p.y > game.world.h + p.r;
      // Die on a wall tile — a shot can't pass through the cave.
      if (!gone && game.map &&
          game.map.isWall(Math.floor(p.x / T.TILE_SIZE), Math.floor(p.y / T.TILE_SIZE))) gone = true;
      for (const o of game.obstacles) {
        if (gone) break;
        if (S.obstacleHit(o, p.x, p.y, p.r)) gone = true;
      }
      if (!gone && game.state === S.STATE.PLAYING && b.iframes <= 0 &&
          S.geom.circleOverlap(p.x, p.y, p.r, b.x, b.y, b.r)) {
        const d = Math.hypot(b.x - p.x, b.y - p.y) || 1;
        // damageBall writes its knockback to p — harmless, the shot is spent.
        S.damageBall(game, p, (b.x - p.x) / d, (b.y - p.y) / d);
        gone = true;
      }
      if (gone) game.projectiles.splice(i, 1);
    }
  }

  S.updateEnemies = function (game, dt) {
    const T = S.TUNING;

    // Advance death-pop animations (explosion blast waves run longer).
    for (let i = game.pops.length - 1; i >= 0; i--) {
      const p = game.pops[i];
      p.t += dt;
      if (p.t >= (p.explode ? T.POP_EXPLODE_DURATION : T.POP_DURATION)) game.pops.splice(i, 1);
    }

    // No trickle spawner — the map's population is placed at generation
    // (placeEnemies). Clearing a room keeps it clear.

    // Weapon pass first: kills are flagged dead and survivors are knocked
    // out of body range, so the body-collision loop below can't land a
    // second hit the same step.
    if (game.state === S.STATE.PLAYING) S.updateWeaponCollisions(game);

    updateProjectiles(game, dt);

    const b = game.ball;
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];

      // Killed earlier this tick by a pop chain — already popped, just waits
      // for the sweep below.
      if (e.dead) continue;

      if (e.flash > 0) e.flash -= dt;
      if (e.invuln > 0) e.invuln -= dt;

      // Aggro gate. Dormant enemies do nothing but a distance check — and
      // can't be touched, since the wake radius is far wider than contact.
      if (!updateAggro(game, e, dt)) continue;

      // Per-type steering brain (default: seek the ball), plus decaying
      // knockback integrated by each brain. A returning enemy ignores its
      // brain and walks home instead.
      const decay = Math.exp(-T.ENEMY_KNOCKBACK_DECAY * dt);
      e.kx *= decay;
      e.ky *= decay;
      if (e.aggro === 'returning') steerHome(game, e, dt);
      else (S.ENEMY_TYPES[e.type].brain || seekBall)(game, e, dt);

      // Collision with the ball (skipped while the death pop plays out —
      // the ball is already gone — and while a fresh split child's
      // invincibility runs down: it can't be hurt or deal a hit).
      if (game.state !== S.STATE.PLAYING || e.invuln > 0) continue;
      // Swept, not point-overlap: a capped ball can cross most of a small
      // enemy's shell in one step (and upgrades raise the cap), so test the
      // prev→current segment — the same segClosest approach the weapons use.
      // The previous position is the tether's sweep snapshot (stamped every
      // step, tethered or not).
      const p = S.geom.segClosest(game.tether.pbx, game.tether.pby, b.x, b.y, e.x, e.y);
      const hit = S.geom.circleOverlap(e.x, e.y, e.r, p.x, p.y, b.r);
      if (!hit) continue;
      S.wakeEnemy(e); // touched — wake a returning enemy (proximity covers dormant)
      let { nx, ny } = hit; // unit normal from enemy to the impact point
      // An enemy dead on the sweep line has no contact direction (the same
      // degenerate case the weapon capsules guard against) — a zero normal
      // would zero the bounce. Fall back to the direction the ball came from.
      if (hit.d < 1e-6) {
        const d = Math.hypot(game.tether.pbx - e.x, game.tether.pby - e.y) || 1;
        nx = (game.tether.pbx - e.x) / d;
        ny = (game.tether.pby - e.y) / d;
      }

      // Bumping an enemy snaps the tether. A fast ball smashes whether or
      // not it was tethered, but a tethered bump costs the combo: it resets
      // to ×1 (before the coins drop, so they pay out at ×1). Grabbing
      // itself is free — only cashing a kill through the rope isn't.
      const fast = S.ballSpeed(b) > T.SPEED_THRESHOLD;
      const tethered = game.tether.active;
      // Wrapped-rope kills pay a coin bonus per half-turn of total contact
      // angle — capture the units before the release clears the wraps.
      const wraps = tethered
        ? Math.floor(S.totalContactAngle(game.tether) / T.WRAP_UNIT_ANGLE) : 0;
      if (tethered) S.releaseTether(game);

      // Spikers invert the speed rule: a fast ball that can't bash through
      // gets pricked (damageBall: damage plus the knockback's hard speed
      // bleed) instead of smashing, while a slow touch is the safe hit.
      // Bashes — and the MASS juggernaut — plow through spikes like
      // anything else.
      let smashes = fast;
      if (S.ENEMY_TYPES[e.type].punishesSpeed) {
        smashes = !fast || game.stats.specials.juggernaut ||
          S.wouldBash(game, e, S.smashDamage(game));
      }

      if (smashes) {
        // Anchor the resolution at the impact point along the sweep, so a
        // survivor separates (and the ball bounces) from where contact
        // actually happened, not from wherever the ball ended up. MASS
        // special: smashes pierce — the ball plows through everything.
        S.resolveSmash(game, e, nx, ny, tethered,
          { ax: p.x, ay: p.y, pierce: game.stats.specials.juggernaut, wraps });
      } else if (b.iframes <= 0) {
        S.damageBall(game, e, nx, ny);
        if (game.state !== S.STATE.PLAYING) break; // dead — still sweep corpses below
      } else {
        // During i-frames: just keep the enemy from overlapping the ball
        // (anchor-aware so the push sticks on an orbiting orbiter).
        shiftEnemy(e, b.x - nx * (b.r + e.r) - e.x, b.y - ny * (b.r + e.r) - e.y);
      }
    }

    // Sweep this tick's corpses in one pass — the loop and the pop chains
    // only flag them, so mid-iteration kills can't corrupt the indices.
    game.enemies = game.enemies.filter((e) => !e.dead);

    // While the death pop plays out, enemies just coast: nothing can be hit
    // and the blast is flinging them apart anyway — skip separation (and
    // its rebuild) entirely.
    if (game.state === S.STATE.DYING) return;
    // Re-bucket before the pair pass: brains and knockback moved everyone
    // since the step-start rebuild.
    S.grid.rebuild(game.enemies);
    resolveEnemyOverlaps(game);

    // Walls and obstacles are solid to enemies: push any overlapper out
    // flush (anchor-aware, so the shove sticks on an orbiting orbiter).
    // Deliberately the LAST pass of the step — brains, knockback, and
    // separation can all shove an enemy wallward, and whatever runs after a
    // wall pass can re-embed; nothing runs after this one.
    for (const e of game.enemies) {
      for (const o of game.obstacles) {
        const hit = S.obstacleHit(o, e.x, e.y, e.r);
        if (hit) shiftEnemy(e, hit.nx * hit.overlap, hit.ny * hit.overlap);
      }
      collideEnemyTiles(game, e);
    }
  };

  // Wall-tile push-out for one enemy: probe the shared circle-vs-tiles
  // resolver, then apply the shift anchor-aware and keep the velocity
  // (knockback channel) slide — the wall-normal component is zeroed, so a
  // shove along a wall glides instead of pinning.
  function collideEnemyTiles(game, e) {
    if (!game.map) return;
    const probe = { x: e.x, y: e.y, r: e.r, vx: e.kx, vy: e.ky };
    S.collideCircleWalls(game.map, probe, null);
    if (probe.x !== e.x || probe.y !== e.y) {
      shiftEnemy(e, probe.x - e.x, probe.y - e.y);
      e.kx = probe.vx;
      e.ky = probe.vy;
    }
  }
})(Tethered);
