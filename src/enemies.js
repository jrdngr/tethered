// Enemies: a per-type definition registry (stats, spawn gating, behavior
// hooks), edge spawning with a ramping rate, steering, collision outcomes.
window.Tethered = window.Tethered || {};

(function (S) {
  // Steering brains. Each integrates position from its own steering plus the
  // shared decaying knockback (kx/ky). Default: seek the ball.
  function seekBall(game, e, dt) {
    const dx = game.ball.x - e.x;
    const dy = game.ball.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += ((dx / d) * e.speed + e.kx) * dt;
    e.y += ((dy / d) * e.speed + e.ky) * dt;
  }

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
      const seek = d < T.RUNNER_FLEE_RADIUS ? -1 : 1;
      e.x += ((dx / d) * e.speed * seek + e.kx) * dt;
      e.y += ((dy / d) * e.speed * seek + e.ky) * dt;
    }
    e.x = Math.max(e.r, Math.min(e.x, game.world.w - e.r));
    e.y = Math.max(e.r, Math.min(e.y, game.world.h - e.r));
  }

  // Orbiter brain. Drift: creep toward the ball, bleeding speed. Stalled:
  // anchor in place and spiral out to max radius, close back in, then drift
  // again. Knockback shoves the anchor while orbiting.
  function orbiterBrain(game, e, dt) {
    const T = S.TUNING;
    const bs = e.brainState;
    if (bs.phase === 'drift') {
      bs.driftSpeed *= Math.exp(-T.ORBITER_DECEL * dt);
      const dx = game.ball.x - e.x;
      const dy = game.ball.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += ((dx / d) * bs.driftSpeed + e.kx) * dt;
      e.y += ((dy / d) * bs.driftSpeed + e.ky) * dt;
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
      e.x = bs.cx + Math.cos(bs.angle) * bs.radius;
      e.y = bs.cy + Math.sin(bs.angle) * bs.radius;
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
    const seek = d > T.SPITTER_RANGE ? 1 : d < T.SPITTER_RANGE * 0.7 ? -1 : 0;
    e.x += ((dx / d) * e.speed * seek + e.kx) * dt;
    e.y += ((dy / d) * e.speed * seek + e.ky) * dt;
    e.x = Math.max(e.r, Math.min(e.x, game.world.w - e.r));
    e.y = Math.max(e.r, Math.min(e.y, game.world.h - e.r));
    e.brainState.fire -= dt;
    if (e.brainState.fire <= 0 && game.state === S.STATE.PLAYING) {
      e.brainState.fire = T.SPITTER_FIRE_INTERVAL;
      game.projectiles.push({
        x: e.x, y: e.y,
        vx: (dx / d) * T.PROJECTILE_SPEED,
        vy: (dy / d) * T.PROJECTILE_SPEED,
        r: T.PROJECTILE_RADIUS,
        damage: T.PROJECTILE_DAMAGE,
        age: 0,
      });
    }
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
    e.x += (bs.fx * e.speed + e.kx) * dt;
    e.y += (bs.fy * e.speed + e.ky) * dt;
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
      spawnGate: (T) => ({ delay: T.TANK_SPAWN_DELAY, chance: T.TANK_CHANCE }),
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
      spawnGate: (T) => ({ delay: T.SPLITTER_SPAWN_DELAY, chance: T.SPLITTER_CHANCE }),
      splitCount: 2,
    },
    supersplitter: {
      color: '#ff3300', // red-orange — a splitter, but angrier
      stats: (T) => ({ r: T.SUPER_SPLITTER_RADIUS, hp: T.SUPER_SPLITTER_HP, damage: T.SUPER_SPLITTER_DAMAGE, speed: T.SUPER_SPLITTER_SPEED, coinMult: 1 }),
      spawnGate: (T) => ({ delay: T.SUPER_SPLITTER_SPAWN_DELAY, chance: T.SUPER_SPLITTER_CHANCE }),
      splitCount: 2,
      splitChild: 'splitter',
      pieces: 4, // seams show the four chasers its splitters become
    },
    orbiter: {
      color: '#e93d82', // pink
      stats: (T) => ({ r: T.ORBITER_RADIUS, hp: T.ORBITER_HP, damage: T.ORBITER_DAMAGE, speed: T.ORBITER_SPEED, coinMult: 1 }),
      spawnGate: (T) => ({ delay: T.ORBITER_SPAWN_DELAY, chance: T.ORBITER_CHANCE }),
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
      spawnGate: (T) => ({ delay: T.RUNNER_SPAWN_DELAY, chance: T.RUNNER_CHANCE }),
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
      spawnGate: (T) => ({ delay: T.SPITTER_SPAWN_DELAY, chance: T.SPITTER_CHANCE }),
      onSpawn(e) {
        // Desynced fire timers so a pack doesn't volley in lockstep.
        e.brainState = { fire: S.TUNING.SPITTER_FIRE_INTERVAL * (0.5 + Math.random() * 0.5) };
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
      spawnGate: (T) => ({ delay: T.SPIKER_SPAWN_DELAY, chance: T.SPIKER_CHANCE }),
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
      spawnGate: (T) => ({ delay: T.SHIELD_SPAWN_DELAY, chance: T.SHIELD_CHANCE }),
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

  // One roll decides the spawn type: each gated type unlocked by survival
  // time claims its chance slice; whatever's left is a basic chaser. The
  // slices all ramp with survival (one shared factor, so relative
  // proportions hold), clamped so the specials' total never exceeds
  // MIX_SPECIAL_TOTAL_MAX — the mix hardens as the run goes on instead of
  // staying 70% chasers forever.
  function rollType(game) {
    const T = S.TUNING;
    let total = 0;
    for (const type in S.ENEMY_TYPES) {
      const gate = S.ENEMY_TYPES[type].spawnGate;
      if (!gate) continue;
      const { delay, chance } = gate(T);
      if (game.time >= delay) total += chance;
    }
    const ramp = Math.min(1 + game.time / T.MIX_RAMP_TIME,
      total > 0 ? T.MIX_SPECIAL_TOTAL_MAX / total : 1);
    let roll = Math.random();
    for (const type in S.ENEMY_TYPES) {
      const gate = S.ENEMY_TYPES[type].spawnGate;
      if (!gate) continue;
      const { delay, chance } = gate(T);
      if (game.time < delay) continue;
      if (roll < chance * ramp) return type;
      roll -= chance * ramp;
    }
    return 'chaser';
  }

  function makeEnemy(game, type, x, y) {
    const T = S.TUNING;
    const def = S.ENEMY_TYPES[type];
    const stats = def.stats(T);
    // Per-minute stat scaling, baked in at spawn time so existing logic is
    // untouched: late game is harder enemies, not just more of them. HP
    // rounds so hits-to-kill stays a clean integer step.
    const minutes = game.time / 60;
    const hp = Math.round(stats.hp * (1 + T.ENEMY_SCALE_HP_PER_MIN * minutes));
    const e = {
      x, y, type,
      kx: 0, ky: 0,
      r: stats.r,
      hp,
      maxHp: hp,
      damage: stats.damage,
      speed: stats.speed * (1 + T.ENEMY_SCALE_SPEED_PER_MIN * minutes),
      coinMult: stats.coinMult,
      flash: 0, // hit-feedback timer when a smash doesn't kill
      invuln: 0, // can't be hurt (or hurt the ball) while this runs down
    };
    if (def.splitCount) {
      e.splitCount = def.splitCount;
      e.splitChild = def.splitChild;
      e.pieces = def.pieces || def.splitCount;
    }
    if (def.onSpawn) def.onSpawn(e);
    return e;
  }

  // Edge-spawn one enemy. The type rolls from the survival-gated mix unless
  // forced (dev panel spawn buttons).
  S.spawnEnemy = function (game, forcedType) {
    const type = forcedType || rollType(game);
    const r = S.ENEMY_TYPES[type].stats(S.TUNING).r;
    let x = 0;
    let y = 0;
    // Pick an edge point; re-roll a few times if it's right on top of the ball.
    for (let attempt = 0; attempt < 5; attempt++) {
      const side = Math.floor(Math.random() * 4);
      const t = Math.random();
      if (side === 0) { x = t * game.world.w; y = r; }
      else if (side === 1) { x = t * game.world.w; y = game.world.h - r; }
      else if (side === 2) { x = r; y = t * game.world.h; }
      else { x = game.world.w - r; y = t * game.world.h; }
      if (Math.hypot(x - game.ball.x, y - game.ball.y) > S.TUNING.SPAWN_MIN_BALL_DIST) break;
    }
    const e = makeEnemy(game, type, x, y);
    game.enemies.push(e);
    S.grid.insert(e); // queryable this step — broadphase rebuilds are per-pass, not per-spawn
  };

  // Spawn a forced type at a world point — the dev panel drops one just
  // outside the ball's reach; M5's generation placement spawns populations
  // through it.
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

    // Spawn rate climbs exponentially: it doubles every SPAWN_DOUBLE_TIME of
    // survival. Paused while the player's death pop plays out. At the enemy
    // cap the timer holds at zero instead of resetting, so the next free
    // slot spawns immediately. Below the (growing) floor, refill one enemy
    // per step — a cleared board repopulates within a few frames, never
    // leaving dead air.
    if (game.state === S.STATE.PLAYING) {
      const interval = T.SPAWN_INTERVAL_START * Math.pow(2, -game.time / T.SPAWN_DOUBLE_TIME);
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        if (game.enemies.length < T.ENEMY_CAP) {
          S.spawnEnemy(game);
          game.spawnTimer = interval;
        } else {
          game.spawnTimer = 0;
        }
      }
      const floor = Math.min(
        Math.floor(T.SPAWN_FLOOR_BASE + (game.time / 60) * T.SPAWN_FLOOR_PER_MIN),
        T.ENEMY_CAP);
      if (game.enemies.length < floor) S.spawnEnemy(game);
    }

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

      // Per-type steering brain (default: seek the ball), plus decaying
      // knockback integrated by each brain.
      const decay = Math.exp(-T.ENEMY_KNOCKBACK_DECAY * dt);
      e.kx *= decay;
      e.ky *= decay;
      (S.ENEMY_TYPES[e.type].brain || seekBall)(game, e, dt);

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

    // Obstacles are solid to enemies too: push any overlapper out flush
    // (anchor-aware, so the shove sticks on an orbiting orbiter). A handful
    // of obstacles per layout keeps this a cheap O(N) pass.
    for (const e of game.enemies) {
      for (const o of game.obstacles) {
        const hit = S.obstacleHit(o, e.x, e.y, e.r);
        if (hit) shiftEnemy(e, hit.nx * hit.overlap, hit.ny * hit.overlap);
      }
    }
  };
})(Tethered);
