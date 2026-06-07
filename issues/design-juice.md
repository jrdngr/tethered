# Missing core juice — no screen shake, no hit-stop, no audio

**Area:** Design · **Impact:** High · **Status:** Open

## Problem

For a game whose fantasy is *smashing*, impacts barely register. Verified by the review:

- **Zero screen shake** — the only canvas transform is the static `ctx.translate(0, HUD_HEIGHT)`
- **Zero hit-stop** anywhere
- **Zero audio** anywhere
- Bash kills produce the *identical* pop ring as ordinary kills — no bash flag is stored on the pop (`src/enemies.js:288`), so the most powerful moment in the game is visually indistinguishable from the weakest

The one rich effect that exists (player-death flash + shockwaves, `src/render.js:164-179`) proves the primitives are easy in this codebase.

## Decision

All four elements:

1. **Screen shake** — decaying offset vector added to the existing `ctx.translate`; magnitude scaled by event (kill < bash < explosion < player hit)
2. **Hit-stop** — ~40 ms freeze on kills/bashes; trivial with the accumulator loop (pause consuming accumulated time, keep rendering)
3. **WebAudio synth** — tiny procedural SFX (no asset files): smash, wall bounce, coin, level-up. Oscillator + envelope per event is enough
4. **Distinct bash feedback** — store a `bash` flag on the pop at `src/enemies.js:288`; bash pops get a bigger ring, screen flash, heavier shake/stop

## Implementation

- Shake: `game.shake = {x, y, mag}`; add to the translate in `drawGame`; decay with the existing framerate-independent `exp(-rate·dt)` idiom. `addShake(mag)` helper called from kill/bash/hit sites
- Hit-stop: `game.freeze` seconds; in the main loop (`src/main.js:155` area) skip physics steps while `freeze > 0` (decrement by real dt), render as normal
- Audio: new `src/audio.js` script (plain `<script>` tag, `Tethered` namespace, per project convention); lazy-init AudioContext on first input
- New TUNING constants: `SHAKE_KILL`, `SHAKE_BASH`, `SHAKE_DECAY`, `HITSTOP_KILL: 0.04`, `HITSTOP_BASH`, volume/pitch params

## Interactions

- Slow-mo has landed as `game.timeScale` scaling the fixed step (src/main.js) — hit-stop is the same machinery (`freeze` is just `timeScale 0` with a timer); build it on that system
- Shake/flash hooks slot into render.js's `LAYERS` table
