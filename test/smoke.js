// Headless smoke harness: stub the browser, load the game scripts in index.html
// order, then pump frames so any runtime exception in the update/render loop
// surfaces with a stack trace. Boot goes straight into Arena mode.
// Run: node test/smoke.js
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

const order = ['tuning', 'geom', 'audio', 'grid', 'camera', 'combo', 'ball',
  'tether', 'enemies', 'pickups', 'devpanel', 'render', 'main'];
for (const f of order) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', f + '.js'), 'utf8');
  (0, eval)(code); // window===global, so the Tethered global is populated
}

const S = global.Tethered;
S.audio = { play: noop, unlock: noop }; // silence audio entirely

function pump(ms) {
  t += ms;
  const cbs = rafQueue; rafQueue = [];
  for (const cb of cbs) cb(t);
}

// Boot drops straight into Arena (no menu).
console.log('after boot: state =', S.game.state, ' enemies =', S.game.enemies.length,
  ' wave =', S.game.wave.number);

// Pump ~120 frames (~2s): the first wave should spawn and enemies should chase.
for (let i = 0; i < 120; i++) pump(16);
console.log('after 120 frames: state =', S.game.state,
  ' enemies =', S.game.enemies.length, ' wave =', S.game.wave.number,
  ' ballpos =', Math.round(S.game.ball.x), Math.round(S.game.ball.y));
console.log('sample enemy:', S.game.enemies[0] &&
  { type: S.game.enemies[0].type, x: Math.round(S.game.enemies[0].x), y: Math.round(S.game.enemies[0].y) });

// Grab on the ball → the tether holds (A/D would cinch its length).
S.game.mouse = { x: S.game.ball.x, y: S.game.ball.y };
S.tryGrab(S.game);
console.log('grab: active =', S.game.tether.active, ' restLength =', Math.round(S.game.tether.restLength));
for (let i = 0; i < 30; i++) pump(16); // swing a bit
const before = Math.hypot(S.game.ball.vx, S.game.ball.vy);
S.releaseTether(S.game); // release → slingshot impulse
for (let i = 0; i < 3; i++) pump(16);
console.log('release: active =', S.game.tether.active, ' ball speed', Math.round(before),
  '→', Math.round(Math.hypot(S.game.ball.vx, S.game.ball.vy)));

// A few hundred more frames to exercise waves, kills, pickups, and death.
for (let i = 0; i < 600; i++) pump(16);
console.log('after 720 frames: state =', S.game.state, ' wave =', S.game.wave.number,
  ' kills =', S.game.kills, ' enemies =', S.game.enemies.length,
  ' pickups =', S.game.pickups.length);
console.log('SMOKE OK');
