# Post-PoC engine: migrate in place to TypeScript + Vite

**Area:** Engine · **Impact:** Strategic · **Status:** Open (decision recorded)

## Context

Requirements, weighted: **LLM-friendliness (code written with Claude Code) > tuning iteration speed > PC (must) > mobile (nice)**. Two facts the research converged on and the codebase confirms:

1. **Keep the hand-rolled physics.** The bespoke spring/tether fights every generic rigid-body solver (rapier/avian/Box2D/matter alike) — the custom feel *is* the game.
2. **The 120 Hz accumulator loop ports near-verbatim** to any `update(dt) + draw` host.

Also: the working live-tuning dev panel (`src/devpanel.js`) and clean loop are capabilities any rewrite must *re-earn*.

## Ranking

### #1 — TypeScript + Vite (chosen)

Wins the top two axes at the lowest cost. TS is the most LLM-legible game language and gives Claude a tight `tsc`/LSP feedback loop *without a language port* — no other option *improves* LLM-friendliness; most spend it. Vite HMR beats the current reload loop; the dev panel survives. PC via Electron + `steamworks.js` (first-class Steamworks support; the every-frame rAF satisfies Electron's overlay quirk). Mobile via PWA/Capacitor. The one concession: drop the `file://` no-build rule (`node --check` → `tsc --noEmit`).

**Strongest case against:** it isn't really a rewrite. It bets PC on ~150 MB of Chromium; it pays the build-step tax; it's anticlimactic if the real motive is learning Rust or native perf headroom (canvas bottlenecks if particles ever reach thousands — at which point swap the draw layer to Pixi v8 WebGL behind the existing `drawGame` boundary).

### #2 — LÖVE (Lua)

The strongest *true rewrite* target if leaving the web: deep in training data, plain `.lua` + `love . --console` is the cleanest agent loop of any candidate, `love.load/update/draw` maps 1:1 onto the current loop, imposes no physics model (Balatro proves the ceiling). Declined because it's a full hand-translation into a *less* type-safe language, and Steam distribution is more manual.

### #3 — Rust + macroquad (not Bevy)

Immediate-mode loop closest to the current canvas code, small **stable** API (the key LLM edge over Bevy), ~16 s clean builds, desktop+web+mobile from one codebase; egui replaces the dev panel. Only worth it as a deliberate Rust-craft goal.

### Demoted — Bevy, Godot, Unity

**Bevy** loses both top axes: API breaks essentially every release (0.17 even renamed Events→Messages) so LLMs emit version-mixed non-compiling code; ECS is overkill for one ball; worst compile times in the field; live tuning would be reassembled from add-ons. **Godot/Unity:** scene-file/import-cache friction and editor-centric workflows; Unity adds flaky batchmode licensing.

## Migration plan (in place, incremental, runnable at every step)

1. **Vite + `allowJs: true`** — all current JS runs unchanged under the new toolchain
2. **IIFEs → ES modules** — the 12 `(function(S){…})(Tethered)` wrappers become module imports (the one real structural change; makes deps explicit and more LLM-legible)
3. **Type leaf modules first:** `ball`, `tether`, `combo`, `paddles`
4. **Define a typed `Game` interface** for the central state bag — the highest-leverage typing: a checked contract Claude can't drift from
5. **Convert `enemies`, `upgrades`, `render`;** `main.ts` last
6. **`tuning.ts` as a typed literal** — autocomplete on every constant
7. **Tighten strictness** one flag at a time (`noImplicitAny` → `strictNullChecks`)
8. **Packaging only when shipping:** `electron-builder` + `steamworks.js` for PC; PWA manifest/Capacitor for mobile

## Notes

- Defer starting the migration until the current feature push stabilizes — every open issue here is cheaper in plain JS than mid-migration
- Step 1–2 alone (Vite + modules, no TS yet) is a valid stopping point if the build-step concession needs validating first
