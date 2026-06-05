# Tethered

Physics-based arcade game: swing a ball on an elastic rope to smash enemies. Browser prototype, built iteratively.

## Running

No build, no server, no Python. Open `index.html` directly in a browser (`file://` works).

Don't test with the Chrome DevTools plugin/MCP — the developer always tests manually. `node --check` for syntax is fine.

## Source control

This repo uses [jj](https://github.com/jj-vcs/jj), not git.

- Commit work with `jj commit -m "<msg>"`. Create a new commit for each logical unit of work.
- Never use git directly.
- Don't use other jj commands that mutate the commit graph (no `rebase`, `squash`, `abandon`, `undo`, etc.). Read-only commands like `jj log`, `jj status`, and `jj diff` are fine.

## Documentation

The code is the documentation. Do not create or maintain separate design files.

## Code conventions

- Vanilla JS, HTML5 Canvas, hand-rolled physics. No dependencies, no bundler.
- Plain `<script>` tags (not ES modules) sharing a single `Tethered` global namespace, so `file://` loading works.
- All gameplay constants live in `Tethered.TUNING` — never scatter magic numbers; they're iterated constantly.
- Fixed-timestep physics (120 Hz) with rendering every animation frame.
