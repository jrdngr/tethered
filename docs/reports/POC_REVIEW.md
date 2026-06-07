# Tethered — PoC Deep Review

*Multi-agent review, 2026-06-07. 41 agents: 4 code-review dimensions with per-finding adversarial verification (32 findings survived; refuted claims dropped, corrected ones adjusted), 3 engine research reports, judged synthesis.*

A physics arcade prototype with a genuinely distinctive core (elastic rope that wraps enemies as pivots; speed-as-invincibility). The engineering is clean for hand-rolled work — symplectic Euler, framerate-independent decay everywhere, data-driven enemy/weapon registries. The problems are concentrated in the *tuning curve* and the *feedback layer*, not the architecture.

---

## 1. Game balance

Three forgiving levers flatten the entire difficulty/economy curve. Fix these first — everything else is downstream.

### High impact

**A. i-frames cap incoming DPS at one hit/second → death is nearly impossible.**
`MAX_HP 100`, `IFRAME_DURATION 1.0` (`src/tuning.js:30-31`). A vulnerable touch deals damage then sets a full second of invulnerability (`src/combo.js:37-39`), so no matter how many enemies pile on, you take ≤1 hit/sec.

| Pressure | Damage/hit | Time-to-die |
|---|---|---|
| Pure tank | 25 | ~3–4 s (and requires standing still) |
| Mixed (chaser 10 / splitter 15 / orbiter 15) | ~12–15 | 7–10 s |

Compounded by: fast balls (>`SPEED_THRESHOLD 420`) bypass damage entirely (`src/enemies.js:456`), the optional combo-shield (`src/combo.js:13-16`), `HEALTH_HEAL 20` drops, and `+20` VITALITY picks.

**Fix:** `IFRAME_DURATION → 0.4–0.6`, and/or lower `MAX_HP`; keep knockback so being surrounded is genuinely dangerous.

**B. Spawn rate is so slow that mid/late difficulty never materializes.**
`interval = SPAWN_INTERVAL_START 5.0 × 2^(-time/SPAWN_DOUBLE_TIME 600)` (`src/enemies.js:408`; `src/tuning.js:128-129`).

| t | interval | rate |
|---|---|---|
| 0 | 5.00 s | 0.20/s |
| 60 s | 4.67 s | 0.21/s |
| 300 s | 3.54 s | 0.28/s |
| 600 s | 2.50 s | 0.40/s |
| 1200 s | 1.25 s | 0.80/s |

One enemy/sec doesn't arrive until **~23 minutes**. Removal rate (a fast ball keeps 95% speed per smash, `KILL_SPEED_KEEP`) vastly exceeds spawn, so the arena is never crowded. No concurrent-enemy cap exists. Enemy HP/speed/damage **never scale with time** — only count, slowly.

**Fix:** `SPAWN_DOUBLE_TIME → 60–120`; add a concurrent-enemy floor so clearing the board triggers refill; add per-minute multipliers to enemy HP/speed (~+8%/min) so late game is harder enemies, not just more.

**C. Combo-driven coin economy is a runaway: one clean 10-kill streak fast-forwards 8 levels.**
Coins/kill = avg 8 × combo × coinMult (`src/coins.js:30-32`); combo bumps +1 on every untethered kill and fast wall-bounce, never caps, decays only after 10 s idle. Payout fires *before* the combo bump, so k untethered kills = **4k(k+1)** coins avg. A 10-streak = **440 coins**.

| Levels | Cost (`25 × 1.2^(n-1)`) | Cumulative |
|---|---|---|
| L1–8 | 25/30/36/43/52/62/75/90 | **413** |
| L9 | 107 | 520 |

440 ≥ 413 → exactly 8 level-ups in one burst, drained by the `while` loop at `src/coins.js:197-200` that queues all 8 upgrade modals at once. Payout is quadratic in streak; level cost grows at only 1.2×.

**Fix:** cap combo (~×10–20), OR make payout sublinear (×√combo), OR steepen `LEVEL_COINS_GROWTH → 1.5–1.7`.

**D. Base damage 1 vs enemy HP 4–12 makes weapons/DAMAGE mandatory, not optional.**
`PLAYER_DAMAGE 1` (`src/tuning.js:40`); base `smashDamage` = 1 regardless of speed (`src/upgrades.js:40-46`). Chaser = 4 hits, tank/splitter = 8, supersplitter = 12, and each non-killing hit bounces the ball off (`src/enemies.js:389-392`). Bash needs `dmg > maxHp × 1.5` — unreachable at base. A full supersplitter chain = **44 hits** of ping-ponging. DAMAGE/weapons become prerequisites → build diversity collapses.

**Fix:** `PLAYER_DAMAGE → 2` (or lower enemy HP); keep DAMAGE/weapons as accelerators.

### Medium impact

**E. The `POP_EXPLODE_DAMAGE 4→2` nerf killed the DAMAGE special.** 2 splash leaves even a chaser (HP 4) at 2 HP — it kills nothing at full HP, only finishes stragglers (`src/enemies.js:314-319`). Chained deaths call `popEnemy`, not `explodePop`, so there's no chain reaction. The new 0.45 s fiery blast-wave now oversells a dud.

**Fix:** restore splash ≥4 (or scale with `smashDamage`), OR make chained deaths re-trigger `explodePop` for a true chain — the `dead` recursion guard (`src/enemies.js:312,316`) already exists.

**F. MOMENTUM is a multiplicative outlier; DAMAGE+MOMENTUM dominates.** Maxed DAMAGE×MOMENTUM at top speed = 5×3 = **15**, dwarfing additive weapons (+4 cap each), and its `bashEasy` special drops the supersplitter bash threshold 18→12.

*Verifier correction:* the original "KILL SURGE is a dead pick" claim was **refuted** — its clamp is at `maxSpeed 1000`, not 420, so maxed +560/pop pays off across the whole 420→1000 band (re-accelerating you back above the invincibility line). **TOP SPEED standalone is the weaker pick** (mostly a MOMENTUM/KILL SURGE enabler).

**Fix:** make MOMENTUM additive or cap `speedDamage` lower so it doesn't bury additive upgrades.

**G. Economy is risk-inverted.** Runner: HP 4, lowest damage, flees, **coinMult 3** = pure free money. Splitters drop nothing themselves (only terminal children pay), so destroying a 28-HP supersplitter tree yields just **4 chasers' worth**. Optimal play: ignore the fight, farm runners + wall-bounce combo.

**Fix:** pay splitters proportional to HP (parent multiplier); lower runner coinMult or raise their risk; tie payout to danger.

### Low impact

**H. Late-game mix is permanently 70% chasers.** Special chances sum to 0.30 (TANK .04 / SPLITTER .06 / SUPER .02 / ORBITER .08 / RUNNER .10) and never change (`src/enemies.js:151-154`); supersplitter ≈ 1 per 150 s.

**Fix:** ramp special chances with survival time so the mix hardens late.

---

## 2. Game design — making it more fun & where to go next

### Verified findings

**The signature mechanic is invisible and anti-rewarded (the single highest fun-per-effort lever).** `updateActiveTether` (`src/tether.js:85-172`) is genuinely novel — the rope wraps enemies as pivots (up to `ROPE_MAX_WRAPS 6`), bending the spring and storing tension, with high-craft code (lagged sweep test, anti-chatter). But a wrap gives **no combo, no score, no bonus**, renders as just a thin bent line (`src/render.js:36-39`), and *ending a wrap in a tethered kill resets your combo* (`src/enemies.js:342`). The best idea in the game is hidden and actively punished.

**Missing core juice — no shake, no hit-stop, no audio.** Verified: zero screen shake (only the static `ctx.translate(0, HUD_HEIGHT)`), zero hit-stop, zero audio anywhere. Bash kills get the *identical* pop ring as normal kills (no bash flag stored on the pop, `src/enemies.js:288`). The death flash + shockwave effect (`src/render.js:164-179`) proves the screen-flash primitive already exists to reuse. For a smashing fantasy, this is the biggest felt gap.

**Combo has no stakes and no score.** There is no score system at all — game-over shows only LEVEL + SURVIVED (`src/render.js:393-394`). The real skill ceiling (keep fast, chain bounces/kills) pays out as "shop faster," not mastery.

**No meta-progression; self-exhausting upgrade pool.** Every run starts identical (createStats fixed, `upgradeLevels {}`); no localStorage anywhere. The pool is 11 upgrades × `UPGRADE_LEVEL_MAX 5` = 55 picks; `rollChoices` filters maxed, and an empty pool silently consumes the level-up with no reward (`src/upgrades.js:336-342`). Long runs decay into rewardless attrition; uniform-random draws make runs converge.

**Grab friction.** `GRAB_RADIUS 176` → 192 px total reach, and `tryGrab` hard-resets combo to 1 on *every* grab (`src/tether.js:22-24`) — steering directly fights scoring, the huge radius makes accidental combo-kills easy, and nothing tells the player why their combo died.

**Fix:** pause combo decay while tethered instead of zeroing; flash a "COMBO BROKEN" HUD tick; reconsider zeroing combo on tethered kills (it punishes the signature mechanic).

**Roster lacks any anti-"stay fast" threat.** 6 types but 4 just seek; the speed-invincibility rule means a fast ball is untouchable. No ranged/zoning/shielded-from-behind enemy, no boss → no curve inflection points. The `ENEMY_TYPES` registry makes new types cheap (one entry + TUNING).

**Single static arena (low).** Full-window rectangle, flat background, plain walls every run (`src/main.js:21-24`, `src/render.js:12-27`). The paddle code already proves circle-vs-rect collision and dynamic geometry, so interior obstacles (which the rope could wrap) are within reach.

### Next directions — prioritized shortlist

1. **Add a SCORE** (kills × combo), shown at game-over and persisted as a high score. Cheapest replay hook; gives the combo skill a point.
2. **Juice pass:** screen shake (decaying vector on the existing `ctx.translate`), ~40 ms hit-stop on kills/bashes, a tiny WebAudio synth for smash/bounce/coin/level-up.
3. **Reward the wrap:** slingshot bonus + combo + juice on release with ≥1 wrap (Physics §J), plus a one-line tutorial hint.
4. **Faster, level-driven curve:** `SPAWN_DOUBLE_TIME → 90–120`, concurrent-enemy floor, per-minute stat scaling.
5. **2–3 anti-fast archetypes + a periodic boss** via the cheap registry.
6. **Lightweight meta-progression:** localStorage currency → unlocks/starting perk; overflow reward when the pool exhausts; 2–3 starting archetypes (Brawler / Glass-cannon / Economist).

---

## 3. Physics

Core is well-engineered: semi-implicit (symplectic) Euler with correct update ordering; every dissipative term uses `exp(-rate·dt)` — genuinely framerate-independent.

### Efficiency (highest structural priority)

**`resolveEnemyOverlaps` is unconditional O(N²) at 120 Hz.** Double loop with a `hypot` per pair (`src/enemies.js:231-237`), called every step regardless of tether state (`src/enemies.js:472`) — even during the death animation. N=60 → 1770 pairs × 120 = ~212k hypot/sec, and N is unbounded (no spawn cap), so this caps long runs first. Wrap detection adds up to ~8N evaluations/step while tethered (`src/tether.js:109-132`), and `buildPath` reallocates an array 1–3×/step.

**Fix:** shared uniform-grid/spatial-hash broadphase for separation + wrap + ball/weapon scans. Interim: gate separation to 60 Hz; reuse one preallocated path array.

### Correctness

**Bare-ball collision is discrete while weapons are swept (latent).** Body collision is a pure overlap test (`src/enemies.js:443-444`), no sweep. Today's margin is safe: max travel = 1000/120 = 8.33 px ≪ smallest shell (ball 16 + orbiter 12 = 28). But `maxSpeed` is an upgrade (+150×4 → 1600 → 13.3 px/step), and paddles/KILL SURGE launch to the cap. One higher cap or smaller/faster enemy → bullet-through-paper. Weapons already use swept `segClosest`.

**Fix:** sweep the ball segment (prev→current) against enemy centers — the previous position is already snapshotted as `tether.pbx/pby`. O(1)/enemy, future-proofs every speed upgrade.

**Hardcoded knockback decay (convention violation).** `const decay = Math.exp(-4 * dt)` (`src/enemies.js:434`) — the `4` is a raw literal governing how long *all* shoves (`SPLIT_FLING`/`ENEMY_BOUNCE`/`ENEMY_POP_PUSH`/`PLAYER_POP_PUSH`) persist, the single most feel-relevant enemy-motion constant, invisible to the dev panel.

**Fix:** add `ENEMY_KNOCKBACK_DECAY: 4` to TUNING; zero behavior change.

*Dropped (refuted by verification):* the tether-spring "no clamp → tunnels through maxSpeed" concern — the maxSpeed clamp runs in the **same** step before position integration (`src/ball.js:53-60`), so no single-step teleport is possible. Also refuted: a claimed hidden 0.5× tail-damping factor — `WEAPON_TAIL_TIME_SCALE` scales the whole system, so the damping *ratio* (ζ ≈ 0.51, solidly underdamped) is invariant; the 3→6→12 damping doublings behaved exactly as the numbers read.

### New physics features (ranked by fun-per-effort)

**J. Wrapped-release slingshot (high).** The hard part is built. In `releaseTether`, if `stretch > 0` (and optionally `wraps.length > 0`), add an impulse along the ball→pivot unit vector ∝ stretch with a per-wrap multiplier, then clear. New constants `SLINGSHOT_IMPULSE_K` / `SLINGSHOT_WRAP_BONUS`. The wrapped enemy pops via the existing fast-ball smash path next step. Turns the invisible signature mechanic into the primary skill expression — zero new subsystems. (Use impulse ∝ stretch, not the energy form; the codebase never computes spring PE.)

**K. Slow-mo via global `timeScale` on the fixed-timestep loop (high).** Pass `STEP × game.timeScale` to `update()` while keeping the accumulator in real time (`src/main.js:155`); decay toward 1; trigger on bash kills / multi-death `explodePop` / player death. Because every integrator is already `dt`-parameterized and framerate-independent, scaling `dt` is physically consistent everywhere with no per-system math changes — rope, enemies, coins, particles slow together; render stays full-rate → reads cinematic. Highest fun-per-line. New constants `SLOWMO_FACTOR` (~0.35) / `SLOWMO_DURATION`.

**L. Elasticity / mass upgrade axes (medium).** An ELASTICITY upgrade scaling wall restitution (replace the `WALL_RESTITUTION` constant with `game.stats.wallRestitution`, same pattern `maxSpeed` already uses) synergizes with the combo-on-fast-bounce rule. A continuous ball-mass term feeding `BASH_DEFLECT_MAX`/`KILL_SPEED_KEEP` turns the binary `BASH_HP_FACTOR` threshold into a spectrum. More tuning surface than new feel — below slingshot/slow-mo.

---

## 4. Engine options for the post-PoC rewrite

Two facts all researchers converged on and the codebase confirms: **(a) keep the hand-rolled physics** — a bespoke spring/tether fights every generic rigid-body solver (rapier/avian/Box2D/matter alike) — and **(b) the 120 Hz accumulator loop ports near-verbatim to any `update(dt)+draw` host.** Criteria weighting: **LLM-friendliness > tuning iteration speed > PC (must) > mobile (nice).** Note: the working live-tuning dev panel (devpanel.js) + clean loop are capabilities any rewrite must *re-earn*.

### #1 — Stay on web; migrate in place to TypeScript + Vite

Wins the top two axes at lowest cost. TS is the most LLM-legible game language and gives Claude a tight `tsc`/LSP loop *without a language port*; no other option *improves* LLM-friendliness and most spend it. Vite HMR > today; instant iteration and the dev panel survive. PC via Electron + `steamworks.js` (the only desktop wrapper with first-class Steamworks support; the every-frame rAF satisfies Electron's overlay quirk). Mobile via PWA/Capacitor. Only concession: drop the `file://` no-build rule (`node --check` → `tsc --noEmit`).

**Strongest case against #1:** it isn't really a rewrite. It bets PC on ~150 MB of Chromium to draw a ball (the lean alternative, Tauri, forces Rust glue anyway); it pays the build-step tax; and it's anticlimactic if the real motive is learning Rust or native perf headroom (canvas bottlenecks if particle counts ever reach thousands). If native/Rust/perf is actually the priority, jump to #3 — **not Bevy**.

### #2 — LÖVE (Lua)

The strongest *true rewrite* target if leaving the web: deep in training data, plain `.lua` + `love . --console` is the cleanest agent loop of any rewrite candidate, `love.load/update/draw` maps 1:1 onto `reset/update/drawGame`, imposes no physics model (Balatro proves the ceiling). Why not #1: still a full hand-translation into a *less* type-safe language than TS, and Steam distribution is more manual than Electron.

### #3 — Rust + macroquad (not Bevy)

The credible conclusion of the Rust research — which argued *against* Bevy. Immediate-mode loop closest to the current canvas code, small **stable** API (the key LLM edge over Bevy), ~16 s clean builds, safe Rust, desktop+web+mobile from one codebase; integrator + TUNING port intact, egui replaces the dev panel. Only #3 because Rust is a harder LLM target and it accepts a compile loop the project doesn't have today — pick it only as a deliberate craft goal.

### Explicitly demoted

**Bevy** loses both top axes: API breaks essentially every release (0.12→0.17; 0.17 renamed Events→Messages) → LLMs emit version-mixed non-compiling code; ECS is overkill for one ball; worst compile times in the field; live tuning is an assembled add-on (rebuilding what exists for free today). The maintainers' no-LLM-contribution policy is a real signal about the ecosystem's LLM posture. **Godot/Unity** also ruled out: scene-file/import-cache friction and editor-centric workflows (Godot-as-pure-code was investigated and confirmed weak in practice); Unity adds flaky batchmode licensing.

### Migration sketch (#1), in-place, incremental, runnable at every step

- *Port verbatim (logic untouched, add types only):* `main.js` accumulator → `main.ts`; all physics (`ball`/`tether`/`weapons`); systems (`enemies`/`coins`/`paddles`/`combo`/`upgrades`); `render.js` keeps the single `drawGame(ctx, game)` boundary (swap to Pixi v8 WebGL *only* if measured particle counts head to thousands).
- *Rewrite/add:* the 12 `(function(S){…})(Tethered)` IIFEs → ES-module imports (the one real structural change; makes deps explicit and *more* LLM-legible); a typed `Game` interface for the central state bag (highest-leverage typing — a checked contract Claude can't drift from); `tsconfig` (`allowJs:true` first, tighten `noImplicitAny` → `strictNullChecks` one at a time) + Vite; `tuning.ts` as a typed `TUNING` literal (autocomplete on every constant).
- *Order:* Vite + `allowJs` (JS runs unchanged) → type leaf modules (`ball`/`tether`/`combo`/`paddles`) → define `Game` → convert `enemies`/`upgrades`/`render` → `main.ts` last → tighten strict flags → packaging (`electron-builder` + `steamworks.js`; PWA manifest) only when shipping.

---

## 5. Refactoring — systemization roadmap

Ordered so each step makes the next cheaper. The codebase is already well-systemized where it counts (`ENEMY_TYPES`/`WEAPONS` registries are clean); friction is concentrated below.

1. **Extract `render.js` into ordered draw layers (high; pure mechanical).** `drawGame` (`src/render.js:5-232`) hard-codes every entity inline, discriminating by tag (`c.heal`, `p.color`, `p.explode`) in an undocumented load-bearing z-order — only enemies use the `def.draw` registry hook (`src/render.js:116`). Extract `drawCoins`/`drawParticles`/`drawPops`/`drawPaddles`/`drawBall` and drive them from `const LAYERS = [...]` so z-order is data, not control flow. Do this first — it makes every later visual change "one fn + an index."
2. **Shared geometry + particle helpers (medium; unblocks every new collidable).** `pushEnemies` (`src/enemies.js:255-265`) and `pushCoins` (`src/coins.js:63-73`) are structurally identical; circle-overlap math is re-derived in 5 places (`src/enemies.js:235,443,464`, `src/weapons.js:247`, `src/coins.js:180`); the decaying-velocity integrate loop repeats across `src/coins.js:112-123,216-227` and `src/enemies.js:434`. Add `S.geom.radialPush(...)`, `circleOverlap(...)`, `S.advanceParticles(list, dt, drag)`.
3. **`PICKUP_TYPES` registry (medium).** `coins` is a heterogeneous list tag-discriminated by `c.heal` across 5 sites (spawn, merge eligibility, grace, scoop, render). Mirror `ENEMY_TYPES`: `{radius, grace, onScoop, draw, mergeable}` — a new pickup becomes one table row, not five edits.
4. **Co-locate weapon specials with their weapon (high for the specials gap).** The 10 level-5 specials are the least-systemized part: booleans in the flat `createStats` bag (`src/upgrades.js:21-31`), set by a `special` closure, consumed by hand-placed `if (game.stats.X)` checks across **5 files** (ball, combo, enemies, paddles, weapons). Move per-weapon specials into the `WEAPONS` registry as `onHit`/`afterHit` hooks the collision loop calls generically. For non-weapon specials, at minimum add `// consumed at <file:fn>` comments.
5. **Document the update-ordering contract (medium).** `update()` (`src/main.js:118-136`) depends on invariants stated only in scattered callee comments: tether snapshot first (brackets all movers), weapon pass before body collisions (kills flagged first), corpse sweep last in `updateEnemies`, coins after enemies. Add one header comment block stating the contract.
6. **Shared `drawShape(ctx, scale)` for weapon/enemy icons (medium).** Every weapon shape is drawn twice — gameplay (weapons.js) and icon (upgrades.js), with constants hand-copied and already drifting (`35` vs `WEAPON_EARS_SPAN/2` at `src/upgrades.js:272`; `Math.PI/4` vs `WEAPON_HORN_ANGLE` at `src/upgrades.js:294`); devpanel's `drawMiniEnemy` re-derives render's enemy draw. Have the registries expose one resolution-independent `drawShape`.
7. **Naming/structure cleanup (low).** Group orbiter brain-private state under `e.brainState = {}`; group the 10 special booleans under `stats.specials = {}`. (Verifier note: do **not** gate the per-enemy tether snapshot on `tether.active` — `src/tether.js:73-74` shows it's intentionally always-on to avoid stale-position bugs on a fresh grab.)

---

## 6. Top 10 actions (cross-cutting)

1. **Cut `IFRAME_DURATION 1.0 → 0.4–0.6`** (and/or lower `MAX_HP`). One line, fixes the dominant "can't die" lever. *(Balance A)*
2. **Speed the curve:** `SPAWN_DOUBLE_TIME → ~90`, add a concurrent-enemy floor. Turns dead air into the crowd the smash mechanic needs. *(Balance B / Design)*
3. **Screen shake + ~40 ms hit-stop + a WebAudio synth.** Biggest fun-per-effort win; the mechanics are good, they just don't *feel*. *(Design / juice)*
4. **Tame the economy:** cap combo (~×15) or make payout sublinear, and/or `LEVEL_COINS_GROWTH → 1.5`. Stops 8-levels-in-one-burst. *(Balance C)*
5. **Wrapped-release slingshot** + reward wraps with combo/score/juice + a tutorial hint. Converts the best, hidden, currently-*punished* mechanic into the core skill. *(Physics J / Design)*
6. **Raise `PLAYER_DAMAGE → 2`** (or lower enemy HP) so base play smashes instead of dribbles. *(Balance D)*
7. **Add a SCORE (kills × combo), shown at game-over and persisted.** Cheapest replay/mastery hook. *(Design)*
8. **Spatial-hash broadphase** shared by enemy separation + wrap + ball/weapon scans — kills the unconditional O(N²) at 120 Hz before unbounded N caps framerate. *(Physics — efficiency)*
9. **Global `timeScale` slow-mo on bash/multi-kill/death** — one-site change, physically consistent everywhere because every integrator is already `dt`-scaled. *(Physics K)*
10. **Refactor enablers:** extract `render.js` into ordered `LAYERS` and move weapon specials into the `WEAPONS` registry — together they make the next ten features one-entry changes instead of multi-file hunts. *(Refactoring 1 & 4)*

**Quick fixes worth bundling:** restore `POP_EXPLODE_DAMAGE` to ≥4 or make it chain (E); pull the hardcoded `4` knockback decay into TUNING; fix the runner/splitter coin inversion (G); pause combo decay while tethered + surface combo loss in the HUD.

---

*Verification notes: the adversarial pass killed two physics "bugs" that weren't (tether-spring tunneling; a claimed hidden tail-damping factor), corrected the "KILL SURGE is dead" balance claim, and fixed an invented "33-minute ramp" figure to the real ~23 min. The strongest cross-dimension convergence: balance, design, and physics all independently flagged the rope wrap — the most novel mechanic in the game is invisible, unrewarded, and killing through it resets the combo.*
