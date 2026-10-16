'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/visuals.js'), 'utf8'), sandbox);
const api = sandbox.ICEVisuals, fx = api.create();
let now = 0;
function frame(actors = [], traps = [], extra = {}) {
  now += 16;
  const input = Object.freeze({ now, level: 414, active: true, reducedMotion: false,
    actors: Object.freeze(actors.map(a => Object.freeze({ ...a }))),
    traps: Object.freeze(traps.map(t => Object.freeze({ ...t }))), ...extra });
  const before = JSON.stringify(input);
  fx.update(input);
  assert.equal(JSON.stringify(input), before, 'Effects must not change player or trap state');
}
const roles = ['earth', 'air', 'light', 'darkness'];
const actors = (x, ground = false, ability = true) => roles.map((role, i) => ({ id: String(i), role, x: x + i * 200, y: 500 + i * 10, onGround: ground, ability }));
for (let i = 0; i < 500; i++) frame(actors(i * 3));
assert.equal(fx.stats().actors, 4);
assert.ok(fx.stats().points >= 80 && fx.stats().points <= 112, 'Four moving powers retain bounded, useful trails');
const paused = fx.stats().time;
for (let i = 0; i < 100; i++) frame(actors(1500), [], { active: false });
assert.equal(fx.stats().time, paused, 'Pause freezes visual time');
frame(actors(1500));
assert.equal(fx.stats().time, paused + 16, 'Resume must not age effects by the entire pause');
assert.equal(fx.stats().points, 0, 'Resume must not connect old trails to players that moved during pause');
frame(actors(20000));
assert.equal(fx.stats().points, 0, 'Teleports must not draw a trail across the level');
frame(actors(20000, true));
const landedParticles = fx.stats().particles;
assert.ok(landedParticles > 0, 'Real landing emits an impact');
frame(actors(20000, true));
assert.equal(fx.stats().particles, landedParticles, 'Standing still must not repeatedly emit landings');
for (let i = 0; i < 100; i++) frame(actors(20000, true, false));
assert.equal(fx.stats().particles, 0, 'Landing effects expire');
assert.equal(fx.stats().points, 0, 'An ended ability cannot leave a permanent trail');

fx.reset();
const trap = { id: 'fall:1', x: 400, y: 100, w: 60, h: 60, floorY: 500 };
frame([], [trap]);
for (let y = 120; y <= 440; y += 20) frame([], [{ ...trap, y }]);
assert.ok(fx.stats().particles > 0, 'Trap contact with its floor emits debris');
const impactParticles = fx.stats().particles;
frame([], [{ ...trap, y: 440 }]);
assert.equal(fx.stats().particles, impactParticles, 'A landed block must not emit impacts each frame');
for (let i = 0; i < 300; i++) frame(actors(i * 4, i % 2 === 0), [{ ...trap, y: i % 2 ? 420 : 440 }]);
assert.ok(fx.stats().particles <= 160, 'Particle capacity remains bounded under repeated impacts');
frame(actors(0), [], { reducedMotion: true });
assert.equal(fx.stats().points, 0);
assert.equal(fx.stats().particles, 0);
for (let i = 0; i < 30; i++) frame(actors(i * 3, i % 2 === 0), [], { reducedMotion: true });
assert.equal(fx.stats().points, 0, 'Reduced motion disables trails');
assert.equal(fx.stats().particles, 0, 'Reduced motion disables impact particles');

// Exercise real draw paths and reject invalid coordinates even with four powers active.
let calls = 0, depth = 0;
const ctx = new Proxy({}, { get(target, key) {
  if (key.startsWith('create')) return () => ({ addColorStop() {} });
  if (key === 'save') return () => { depth++; };
  if (key === 'restore') return () => { assert.ok(depth > 0); depth--; };
  if (typeof target[key] !== 'undefined') return target[key];
  return (...args) => { calls++; for (const n of args) if (typeof n === 'number') assert.ok(Number.isFinite(n), key + ' received invalid geometry'); };
}, set(target, key, value) { target[key] = value; return true; } });
for (let i = 0; i < 35; i++) frame(actors(i * 4), [{ ...trap, y: 100 + i * 8 }]);
fx.drawTrails(ctx); fx.drawTrapMotion(ctx); fx.drawImpacts(ctx);
for (const type of ['roots', 'storm', 'curse']) fx.drawHazard(ctx, { x: 1, y: 800, w: 100, h: 80, type });
for (const role of roles) for (const airborne of [false, true]) api.drawLimbs(ctx, role, '#fff', { facing: -1, run: .7, airborne, moving: !airborne, vy: -300 });
api.drawBlock(ctx, trap); api.drawBlock(ctx, trap, true);
api.drawSpikes(ctx, { x: 5, y: 100, w: 50, h: 30 });
api.drawSpikes(ctx, { x: 5, y: 100, w: 50, h: 30, dir: 'down' });
assert.ok(calls > 500, 'All visual draw paths were exercised');
assert.equal(depth, 0, 'Canvas state must be restored after every effect');
frame([]);
assert.equal(fx.stats().actors, 0, 'Disconnected players are removed');
assert.equal(fx.stats().traps, 0, 'Inactive traps are removed');
frame(actors(1), [], { level: 415 });
assert.equal(fx.stats().points, 0, 'Changing rooms clears old trails');
assert.equal(fx.stats().particles, 0, 'Changing rooms clears old impacts');
console.log('Visual effects: PASS — four elements, trap/landing impacts, pause, teleports, reduced motion, canvas isolation and bounded memory.');
