// Headless smoke harness: stub the browser, load the game scripts in index.html
// order, start an Arena run, and pump frames so any runtime exception in the
// update/render loop surfaces with a stack trace. Run: node test/smoke.js
'use strict';
const fs = require('fs');
const path = require('path');

const noop = () => {};
global.window = global; // so `window.Tethered = ...` exposes the `Tethered` global

const ctx = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas') return fakeCanvas;
    if (p === 'measureText') return () => ({ width: 0 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (p in t) return t[p];
    return noop; // any ctx method is a no-op
  },
  set(t, p, v) { t[p] = v; return true; },
});
const fakeCanvas = {
  width: 1600, height: 900,
  getContext: () => ctx,
  addEventListener: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
};
global.document = { getElementById: () => fakeCanvas, createElement: () => fakeCanvas };
global.innerWidth = 1600;
global.innerHeight = 900;
global.addEventListener = noop;
let t = 0;
let rafQueue = [];
global.performance = { now: () => t };
global.requestAnimationFrame = (cb) => { rafQueue.push(cb); };
const AC = function () {
  return new Proxy({ currentTime: 0, destination: {}, state: 'running' }, {
    get: () => () => new Proxy({}, { get: () => noop, set: () => true }),
    set: () => true,
  });
};
global.AudioContext = AC;
global.webkitAudioContext = AC;

const order = ['tuning', 'geom', 'audio', 'grid', 'mapgen', 'flowfield', 'camera',
  'obstacles', 'arena', 'combo', 'ball', 'tether', 'enemies', 'weapons', 'coins',
  'upgrades', 'minimap', 'devpanel', 'render', 'main'];
for (const f of order) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', f + '.js'), 'utf8');
  (0, eval)(code); // window===global, so the Tethered global is populated
}

const S = global.Tethered;
S.audio = { play: noop, unlock: noop }; // silence audio entirely

function pump(ms, label) {
  t += ms;
  const cbs = rafQueue; rafQueue = [];
  for (const cb of cbs) cb(t);
}

// Boot queued the first frame and left us on the menu.
console.log('after boot: state =', S.game.state);

// Pick Arena + scheme A, then click START via the real menu hit-test.
S.game.config.mode = 'arena';
S.game.config.scheme = 'A';
const start = S.menuWidgets(S.game).find((w) => w.id === 'start');
S.game.mouseScreen = { x: start.x + 4, y: start.y + 4 };
S.menuClick(S.game);
console.log('after START: state =', S.game.state, ' mode =', S.game.mode,
  ' enemies =', S.game.enemies.length, ' wave =', S.game.wave.number);

// Pump ~120 frames (~2s) and report.
for (let i = 0; i < 120; i++) pump(16);
console.log('after 120 frames: state =', S.game.state,
  ' enemies =', S.game.enemies.length, ' wave =', S.game.wave.number,
  ' ballpos =', Math.round(S.game.ball.x), Math.round(S.game.ball.y));
console.log('sample enemy:', S.game.enemies[0] &&
  { type: S.game.enemies[0].type, x: Math.round(S.game.enemies[0].x), y: Math.round(S.game.enemies[0].y), aggro: S.game.enemies[0].aggro });

// Scheme A: grab on the ball → short rope, charging.
S.game.mouse = { x: S.game.ball.x, y: S.game.ball.y };
S.arenaPointerDown(S.game);
console.log('grab: active =', S.game.tether.active, ' phase =', S.game.tether.phase,
  ' restLength =', Math.round(S.game.tether.restLength));
for (let i = 0; i < 90; i++) pump(16); // ~1.5s of charging
console.log('charged ~1.5s: restLength =', Math.round(S.game.tether.restLength),
  '(min', S.TUNING.ROPE_MIN_REST, '→ max', S.TUNING.ROPE_MAX_REST, ')');
S.arenaPointerUp(S.game); // freeze length, stay attached
console.log('release LMB: phase =', S.game.tether.phase, ' active =', S.game.tether.active);
const before = Math.hypot(S.game.ball.vx, S.game.ball.vy);
S.arenaPointerDown(S.game); // second click → fling
for (let i = 0; i < 3; i++) pump(16);
console.log('second click: active =', S.game.tether.active, ' ball speed', Math.round(before),
  '→', Math.round(Math.hypot(S.game.ball.vx, S.game.ball.vy)));
console.log('SMOKE OK');
