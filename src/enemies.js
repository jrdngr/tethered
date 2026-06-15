// Enemies: a per-type definition registry (stats, spawn gating, behavior
// hooks), edge spawning with a ramping rate, steering, collision outcomes.
window.Tethered = window.Tethered || {};

(function (S) {
  // Steering. The open arena has no walls, so enemies seek the ball in a
  // straight line (and the runner flees in a straight line); the shared
  // decaying knockback (kx/ky) rides on top, integrated by each brain.
  function seekDir(game, e) {
    const dx = game.ball.x - e.x;
    const dy = game.ball.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  function fleeDir(game, e) {
    const dx = e.x - game.ball.x;
    const dy = e.y - game.ball.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  // Default brain: seek the ball.
  function seekBall(game, e, dt) {
    const dir = seekDir(game, e);
    e.x += (dir.x * e.speed + e.kx) * dt;
    e.y += (dir.y * e.speed + e.ky) * dt;
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
      // Close: flee straight away from the ball. Far: chase straight at it.
      const dir = d < T.RUNNER_FLEE_RADIUS ? fleeDir(game, e) : seekDir(game, e);
      e.x += (dir.x * e.speed + e.kx) * dt;
      e.y += (dir.y * e.speed + e.ky) * dt;
    }
    // No bounds clamp: updateWaves keeps everyone inside the arena.
  }

  // Orbiter brain. Drift: creep toward the ball, bleeding speed. Stalled:
  // anchor in place and spiral out to max radius, close back in, then drift
  // again. Knockback shoves the anchor while orbiting.
  function orbiterBrain(game, e, dt) {
    const T = S.TUNING;
    const bs = e.brainState;
    if (bs.phase === 'drift') {
      bs.driftSpeed *= Math.exp(-T.ORBITER_DECEL * dt);
      const dir = seekDir(game, e);
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
    const bs = e.brainState;
    // Hold the standoff band: advance toward the ball when far, retreat when
    // crowded.
    if (d > T.SPITTER_RANGE) {
      const dir = seekDir(game, e);
      e.x += (dir.x * e.speed + e.kx) * dt;
      e.y += (dir.y * e.speed + e.ky) * dt;
    } else if (d < T.SPITTER_RANGE * 0.7) {
      e.x += ((-dx / d) * e.speed + e.kx) * dt;
      e.y += ((-dy / d) * e.speed + e.ky) * dt;
    } else {
      e.x += e.kx * dt;
      e.y += e.ky * dt;
    }
    // Fire when the ball is in range. A short telegraphed wind-up (the tell,
    // drawn by render) precedes the shot.
    const los = d <= T.SPITTER_RANGE * 1.2;
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
    // Guard faces the ball (above); movement seeks the ball straight on.
    const dir = seekDir(game, e);
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
      stats: (T) => ({ r: T.ENEMY_RADIUS, hp: T.ENEMY_HP, damage: T.ENEMY_DAMAGE, speed: T.ENEMY_SPEED }),
    },
    // Gated types claim their roll slice in this order (see the spawn-mix
    // notes in tuning.js).
    tank: {
      color: '#b558f6', // purple
      stats: (T) => ({ r: T.TANK_RADIUS, hp: T.TANK_HP, damage: T.TANK_DAMAGE, speed: T.TANK_SPEED }),
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
      stats: (T) => ({ r: T.SPLITTER_RADIUS, hp: T.SPLITTER_HP, damage: T.SPLITTER_DAMAGE, speed: T.SPLITTER_SPEED }),
      spawnGate: (T) => ({ unlock: T.SPLITTER_UNLOCK_DEPTH, weight: T.SPLITTER_CHANCE }),
      splitCount: 2,
    },
    supersplitter: {
      color: '#ff3300', // red-orange — a splitter, but angrier
      stats: (T) => ({ r: T.SUPER_SPLITTER_RADIUS, hp: T.SUPER_SPLITTER_HP, damage: T.SUPER_SPLITTER_DAMAGE, speed: T.SUPER_SPLITTER_SPEED }),
      spawnGate: (T) => ({ unlock: T.SUPER_SPLITTER_UNLOCK_DEPTH, weight: T.SUPER_SPLITTER_CHANCE }),
      splitCount: 2,
      splitChild: 'splitter',
      pieces: 4, // seams show the four chasers its splitters become
    },
    orbiter: {
      color: '#e93d82', // pink
      stats: (T) => ({ r: T.ORBITER_RADIUS, hp: T.ORBITER_HP, damage: T.ORBITER_DAMAGE, speed: T.ORBITER_SPEED }),
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
      stats: (T) => ({ r: T.RUNNER_RADIUS, hp: T.RUNNER_HP, damage: T.RUNNER_DAMAGE, speed: T.RUNNER_SPEED }),
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
      stats: (T) => ({ r: T.SPITTER_RADIUS, hp: T.SPITTER_HP, damage: T.SPITTER_DAMAGE, speed: T.SPITTER_SPEED }),
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
      stats: (T) => ({ r: T.SPIKER_RADIUS, hp: T.SPIKER_HP, damage: T.SPIKER_DAMAGE, speed: T.SPIKER_SPEED }),
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
      stats: (T) => ({ r: T.SHIELD_RADIUS, hp: T.SHIELD_HP, damage: T.SHIELD_DAMAGE, speed: T.SHIELD_SPEED }),
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

  // One roll decides a spawn type for the given wave depth: each type unlocked
  // at its depth claims its weight slice; whatever's left is a basic chaser.
  // Weights ramp with depth (one shared factor, proportions hold), clamped so
  // the specials' total never exceeds MIX_SPECIAL_TOTAL_MAX.
  function rollTypeForDepth(depth) {
    const T = S.TUNING;
    const list = [];
    let total = 0;
    for (const type in S.ENEMY_TYPES) {
      const gate = S.ENEMY_TYPES[type].spawnGate;
      if (!gate) continue;
      const g = gate(T);
      if (depth < g.unlock) continue;
      list.push([type, g.weight]);
      total += g.weight;
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
    // Depth stat scaling, baked in at spawn: deeper waves are tougher and a
    // touch faster, not just more numerous. HP rounds so hits-to-kill stays a
    // clean integer step.
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

  // A random point just inside the arena wall, kept clear of the ball so a
  // wave never materializes on top of the player.
  function arenaEdgeSpawn(game) {
    const T = S.TUNING;
    const w = game.world.w;
    const h = game.world.h;
    const pad = 40; // just off the border
    for (let tries = 0; tries < 12; tries++) {
      let x;
      let y;
      if (Math.random() < 0.5) { // left/right edge
        x = Math.random() < 0.5 ? pad : w - pad;
        y = pad + Math.random() * (h - 2 * pad);
      } else { // top/bottom edge
        x = pad + Math.random() * (w - 2 * pad);
        y = Math.random() < 0.5 ? pad : h - pad;
      }
      if (Math.hypot(x - game.ball.x, y - game.ball.y) >= T.WAVE_SPAWN_BALL_CLEARANCE) {
        return { x, y };
      }
    }
    // Fallback: the corner farthest from the ball.
    return { x: game.ball.x > w / 2 ? pad : w - pad, y: game.ball.y > h / 2 ? pad : h - pad };
  }

  // Arena waves: once the floor is clear, wait WAVE_INTER_DELAY then spawn the
  // next (larger) burst at the edges. Wave number drives game.depth, so the
  // existing makeEnemy stat scaling and rollTypeForDepth unlocks ramp the
  // difficulty for free.
  S.updateWaves = function (game, dt) {
    if (game.state !== S.STATE.PLAYING) return;
    const T = S.TUNING;
    // Contain enemies inside the arena: a knockback that would shove an enemy
    // past the border just parks it against the border instead.
    for (const e of game.enemies) {
      e.x = Math.max(e.r, Math.min(e.x, game.world.w - e.r));
      e.y = Math.max(e.r, Math.min(e.y, game.world.h - e.r));
    }
    const wave = game.wave;
    if (game.enemies.length > 0) return; // clear the current wave first
    wave.betweenTimer -= dt;
    if (wave.betweenTimer > 0) return; // inter-wave breather
    wave.number += 1;
    game.depth = wave.number; // shared difficulty knob (stat scaling + type unlocks)
    wave.betweenTimer = T.WAVE_INTER_DELAY; // gap before the wave after this one
    const count = Math.min(T.ENEMY_CAP, T.WAVE_COUNT_BASE + T.WAVE_COUNT_PER_WAVE * (wave.number - 1));
    for (let i = 0; i < count; i++) {
      const p = arenaEdgeSpawn(game);
      S.spawnEnemyAt(game, rollTypeForDepth(game.depth), p.x, p.y);
    }
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

  // Pop a dead enemy: ring animation, shockwave to nearby enemies and
  // pickups, splitter split after the shockwave (so the children only get
  // their own opposing fling), a health-drop roll, and the combo bump.
  // Splitters split instead of dropping anything.
  function popEnemy(game, e, bash, bumpCombo) {
    const T = S.TUNING;
    game.kills = (game.kills || 0) + 1; // run kill count for the end screen
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
    S.geom.radialPush(game.pickups, e.x, e.y, push, T.ENEMY_POP_PUSH_RADIUS);
    if (e.splitCount) {
      splitEnemy(game, e, e.splitCount); // splitters split instead of dropping
    } else if (Math.random() < T.HEALTH_DROP_CHANCE) {
      S.spawnHealthPickup(game, e.x, e.y);
    }
    if (bumpCombo) S.bumpCombo(game);
  }

  // Would a hit dealing `dmg` bash this enemy? Shared by resolveSmash and the
  // spiker's fast-contact exception in updateEnemies.
  S.wouldBash = function (game, e, dmg) {
    return dmg > e.maxHp * S.TUNING.BASH_HP_FACTOR;
  };

  // Resolve a fast body hit on an enemy. nx/ny is the unit normal from the
  // enemy toward the contact point. The enemy takes the player's damage; the
  // ball bounces off along the normal keeping most of its speed. Bashing —
  // damage past BASH_HP_FACTOR × max HP — plows through instead (deflected but
  // never bounced backwards) and pops with BASH_POP_PUSH × force. opts:
  //   ax/ay/ar  separation anchor a survivor is pushed flush against
  //             (defaults to the ball; the body smash passes its contact point)
  S.resolveSmash = function (game, e, nx, ny, opts = {}) {
    const T = S.TUNING;
    const b = game.ball;
    const dmg = T.PLAYER_DAMAGE;
    const bash = S.wouldBash(game, e, dmg);
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
      popEnemy(game, e, bash, true); // every kill builds combo
    } else {
      // Armor (or a guard) absorbed the hit: knock the enemy back and
      // separate so the next physics step doesn't land a second hit. No
      // combo — that only counts kills. Guards glint instead of flashing.
      const ax = opts.ax !== undefined ? opts.ax : b.x;
      const ay = opts.ay !== undefined ? opts.ay : b.y;
      const ar = opts.ar !== undefined ? opts.ar : b.r;
      if (!guarded) e.flash = T.HIT_FLASH_DURATION;
      e.kx = -nx * T.KNOCKBACK_SPEED;
      e.ky = -ny * T.KNOCKBACK_SPEED;
      e.x = ax - nx * (ar + e.r);
      e.y = ay - ny * (ar + e.r);
    }
    // A bash plows through: it deflects toward the bounce normal but never
    // backwards — clamped to BASH_DEFLECT_MAX off the incoming heading, so the
    // ball always keeps forward momentum. Otherwise it bounces off along the
    // normal.
    const speed = S.ballSpeed(b) * T.KILL_SPEED_KEEP;
    if (bash) {
      const heading = Math.atan2(b.vy, b.vx);
      let dev = Math.atan2(ny, nx) - heading;
      dev = Math.atan2(Math.sin(dev), Math.cos(dev)); // wrap to ±180°
      const max = T.BASH_DEFLECT_MAX * Math.PI / 180;
      const out = heading + Math.max(-max, Math.min(max, dev));
      b.vx = Math.cos(out) * speed;
      b.vy = Math.sin(out) * speed;
    } else {
      b.vx = nx * speed;
      b.vy = ny * speed;
    }
  };

  // Projectiles (spitter shots): straight flight, expiring at the arena edge
  // or on timeout. They hit the ball regardless of its speed — only i-frames
  // protect — so they're dodged by pathing, not pace.
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

    // Advance death-pop animations.
    for (let i = game.pops.length - 1; i >= 0; i--) {
      const p = game.pops[i];
      p.t += dt;
      if (p.t >= T.POP_DURATION) game.pops.splice(i, 1);
    }

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
      // Swept, not point-overlap: a fast slingshot can cross most of a small
      // enemy's shell in one step, so test the prev→current segment. The
      // previous position is the tether's sweep snapshot (stamped every step,
      // tethered or not).
      const p = S.geom.segClosest(game.tether.pbx, game.tether.pby, b.x, b.y, e.x, e.y);
      const hit = S.geom.circleOverlap(e.x, e.y, e.r, p.x, p.y, b.r);
      if (!hit) continue;
      let { nx, ny } = hit; // unit normal from enemy to the impact point
      // An enemy dead on the sweep line has no contact direction — a zero
      // normal would zero the bounce. Fall back to the direction the ball
      // came from.
      if (hit.d < 1e-6) {
        const d = Math.hypot(game.tether.pbx - e.x, game.tether.pby - e.y) || 1;
        nx = (game.tether.pbx - e.x) / d;
        ny = (game.tether.pby - e.y) / d;
      }

      // Bumping an enemy snaps the tether. A fast ball smashes whether or not
      // it was tethered; the kill builds combo either way (the rope is a
      // scoring verb now).
      const fast = S.ballSpeed(b) > T.SPEED_THRESHOLD;
      if (game.tether.active) S.releaseTether(game);

      // Spikers invert the speed rule: a fast ball that can't bash through
      // gets pricked (damageBall: damage plus the knockback's hard speed
      // bleed) instead of smashing, while a slow touch is the safe hit.
      // Bashes plow through spikes like anything else.
      let smashes = fast;
      if (S.ENEMY_TYPES[e.type].punishesSpeed) {
        smashes = !fast || S.wouldBash(game, e, T.PLAYER_DAMAGE);
      }

      if (smashes) {
        // Anchor the resolution at the impact point along the sweep, so a
        // survivor separates (and the ball bounces) from where contact
        // actually happened, not from wherever the ball ended up.
        S.resolveSmash(game, e, nx, ny, { ax: p.x, ay: p.y });
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
    // since the step-start rebuild. (Arena containment — clamping enemies to
    // the border — runs in updateWaves.)
    S.grid.rebuild(game.enemies);
    resolveEnemyOverlaps(game);
  };
})(Tethered);
