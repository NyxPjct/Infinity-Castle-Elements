/* Canvas effects only: never changes movement, collision geometry or network state. */
(function (root) {
  'use strict';
  const COLORS = { earth: '#a8e66b', air: '#a6e8ff', light: '#ffe87f', darkness: '#a665ff' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const valid = p => p && [p.x, p.y].every(Number.isFinite);

  function gradient(ctx, kind, args, stops, fallback) {
    const g = ctx[kind]?.(...args);
    if (!g?.addColorStop) return fallback;
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }
  function disc(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }
  function ribbon(ctx, points, width, offset, color, glow) {
    if (points.length < 2) return;
    const edge = (i, side) => {
      const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const taper = Math.sin((i / (points.length - 1)) * Math.PI / 2);
      const w = offset + side * width * taper;
      return [p.x - dy / length * w, p.y + dx / length * w];
    };
    ctx.fillStyle = color; ctx.shadowColor = glow; ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = edge(i, 1); if (i) ctx.lineTo(...p); else ctx.moveTo(...p);
    }
    for (let i = points.length - 1; i >= 0; i--) ctx.lineTo(...edge(i, -1));
    ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  }

  function create() {
    const actors = new Map(), traps = new Map(), particles = [];
    let level = null, lastNow = null, time = 0, reduced = false, active = false;
    const MAX_PARTICLES = 160, MAX_POINTS = 28, TRAIL_MS = 460;
    function reset() {
      actors.clear(); traps.clear(); particles.length = 0;
      lastNow = null; time = 0;
    }
    function impact(x, y, color, strength = 1, stone = false) {
      if (reduced) return;
      const count = Math.round(10 * strength);
      for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
        const angle = -Math.PI * (.12 + .76 * i / Math.max(1, count - 1));
        const speed = (45 + (i * 37) % 125) * strength;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          age: 0, life: 340 + (i % 4) * 95, size: stone ? 2 + i % 4 : 1.4 + i % 3,
          color: i % 3 === 0 ? '#fff1c1' : color, shape: stone ? 'chip' : 'spark' });
      }
      if (particles.length < MAX_PARTICLES) particles.push({ x, y, vx: 0, vy: -10,
        age: 0, life: 330, size: 15 * strength, color, shape: 'dust' });
    }
    function update(frame) {
      if (frame.level !== level) { reset(); level = frame.level; }
      const now = Number(frame.now) || 0;
      const dt = lastNow === null ? 0 : clamp(now - lastNow, 0, 50);
      lastNow = now;
      const resuming = !!frame.active && !active;
      active = !!frame.active;
      const nextReduced = !!frame.reducedMotion;
      if (nextReduced !== reduced) { actors.clear(); traps.clear(); particles.length = 0; }
      reduced = nextReduced;
      // Stop visual clocks while paused; discard old paths when leaving a session.
      if (!active) return;
      // Other online players can move while this client is paused.
      if (resuming) { actors.clear(); traps.clear(); }
      time += dt;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.age += dt;
        if (p.age >= p.life) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
        p.vy += (p.shape === 'dust' ? -25 : 390) * dt / 1000;
      }
      const seen = new Set();
      for (const a of (frame.actors || []).slice(0, 4)) {
        if (!valid(a) || !COLORS[a.role]) continue;
        const id = String(a.id); seen.add(id);
        let old = actors.get(id);
        const teleport = old && Math.hypot(a.x - old.x, a.y - old.y) > 200;
        if (!old || old.role !== a.role || teleport) {
          old = { ...a, points: [], grounded: !!a.onGround, lastSample: -100 }; actors.set(id, old);
        }
        if (!reduced && !old.grounded && a.onGround) impact(a.x + 21, a.y + 56, COLORS[a.role], .7, a.role === 'earth');
        const distance = Math.hypot(a.x - old.x, a.y - old.y);
        if (!reduced && a.ability && distance > .5 && time - old.lastSample >= 14) {
          old.points.push({ x: a.x + 21, y: a.y + 28, t: time }); old.lastSample = time;
        }
        old.points = old.points.filter(p => time - p.t < TRAIL_MS).slice(-Math.max(1,Math.min(MAX_POINTS,Number(frame.maxPoints)||MAX_POINTS)));
        Object.assign(old, a, { grounded: !!a.onGround });
      }
      for (const id of actors.keys()) if (!seen.has(id)) actors.delete(id);
      const trapSeen = new Set();
      for (const tr of (frame.traps || []).slice(0, 64)) {
        if (!valid(tr)) continue;
        const id = String(tr.id); trapSeen.add(id); const old = traps.get(id);
        const vy = old && dt > 0 ? (tr.y - old.y) / (dt / 1000) : 0;
        const vx = old && dt > 0 ? (tr.x - old.x) / (dt / 1000) : 0;
        const grounded = Number.isFinite(tr.floorY) && tr.y + tr.h >= tr.floorY - 2;
        const landed = old && grounded && !old.grounded && (old.vy > 25 || vy > 25);
        if (landed) impact(tr.x + tr.w / 2, tr.y + tr.h, '#bda582', 1.4, true);
        traps.set(id, { ...tr, vx, vy, grounded });
      }
      for (const id of traps.keys()) if (!trapSeen.has(id)) traps.delete(id);
    }
    function drawTrails(ctx) {
      if (reduced) return;
      ctx.save();
      for (const a of actors.values()) {
        const points = a.points;
        if (points.length < 2) continue;
        const start = points[0], end = points[points.length - 1];
        const fade = clamp(1 - (time - end.t) / TRAIL_MS, 0, 1);
        ctx.globalAlpha = fade;
        const c = COLORS[a.role];
        const fill = gradient(ctx, 'createLinearGradient', [start.x, start.y, end.x, end.y],
          [[0, c + '00'], [.4, c + '58'], [1, c + 'ce']], c);
        if (a.role === 'darkness') {
          ribbon(ctx, points, 20, 0, '#13091dbb', c);
          ribbon(ctx, points, 6, 5, fill, c);
        } else {
          ribbon(ctx, points, a.role === 'air' ? 10 : 19, 0, fill, c);
          ribbon(ctx, points, a.role === 'light' ? 5 : 3, -5, a.role === 'light' ? '#fff8d8b0' : c + 'a0', c);
          ribbon(ctx, points, 2, 12, c + '74', c);
        }
        // Small leaves, sparks and shadow fragments follow the sampled path.
        for (let i = 0; i < points.length - 1; i += 3) {
          const p = points[i], q = i / points.length;
          ctx.globalAlpha = fade * q * .75;
          ctx.fillStyle = c;
          const offset = Math.sin(i * 2.4) * (11 + (1 - q) * 13);
          ctx.save(); ctx.translate(p.x + offset, p.y - offset * .5); ctx.rotate(i * .8);
          if (a.role === 'earth') { ctx.beginPath(); ctx.ellipse(0, 0, 5, 2, 0, 0, Math.PI * 2); ctx.fill(); }
          else if (a.role === 'darkness') { ctx.fillStyle = i % 2 ? c : '#13091d'; ctx.fillRect(-4, -2, 8, 3); }
          else disc(ctx, 0, 0, 1.5 + q, a.role === 'light' ? '#fff7c0' : c);
          ctx.restore();
        }
      }
      ctx.restore();
    }
    function drawTrapMotion(ctx) {
      if (reduced) return;
      ctx.save(); ctx.lineWidth = 1.4;
      for (const tr of traps.values()) {
        const vertical = Math.abs(tr.vy) > Math.abs(tr.vx), speed = Math.hypot(tr.vx, tr.vy);
        if (speed < 95) continue;
        const length = clamp(speed * .15, 18, 150), direction = vertical ? Math.sign(tr.vy) : Math.sign(tr.vx);
        ctx.strokeStyle = '#f6e9cf';
        for (let i = 0; i < 4; i++) {
          ctx.globalAlpha = .08 + (i % 2) * .09;
          ctx.beginPath();
          if (vertical) {
            const x = tr.x + tr.w * (.14 + i * .24), y = direction > 0 ? tr.y - 7 : tr.y + tr.h + 7;
            ctx.moveTo(x, y); ctx.lineTo(x, y - direction * length * (.7 + i * .13));
          } else {
            const x = direction > 0 ? tr.x - 7 : tr.x + tr.w + 7, y = tr.y + tr.h * (.14 + i * .24);
            ctx.moveTo(x, y); ctx.lineTo(x - direction * length * (.7 + i * .13), y);
          }
          ctx.stroke();
        }
        if (vertical && tr.vy > 150) {
          for (let i = 0; i < 5; i++) {
            const drift = (time * .045 + i * 13) % 34;
            const x = tr.x + (i % 2 ? tr.w + 4 + drift * .3 : -5 - drift * .3);
            const y = tr.y + tr.h * .5 - drift * 1.4;
            ctx.save(); ctx.globalAlpha = .18 + (1 - drift / 34) * .25;
            ctx.fillStyle = i % 2 ? '#d1b998' : '#847b77';
            ctx.translate(x, y); ctx.rotate(i + time * .002);
            ctx.fillRect(-2, -2, 3 + i % 3, 3 + i % 2); ctx.restore();
          }
        }
      }
      ctx.restore();
    }
    function drawImpacts(ctx) {
      ctx.save();
      for (const p of particles) {
        const q = 1 - p.age / p.life;
        ctx.globalAlpha = q * (p.shape === 'dust' ? .22 : .8);
        if (p.shape === 'dust') {
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * (2 - q), p.size * .42 * (2 - q), 0, 0, Math.PI * 2); ctx.fill();
        } else if (p.shape === 'chip') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.age * .007);
          ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .7); ctx.restore();
        } else {
          ctx.strokeStyle = p.color; ctx.lineWidth = p.size * q;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .025, p.y - p.vy * .025); ctx.stroke();
        }
      }
      ctx.restore();
    }
    function drawHazard(ctx, h) {
      const c = { roots: '#8cc653', curse: '#b85fff', storm: '#81dbff' }[h.type] || '#b85fff';
      const t = reduced ? 0 : time / 1000;
      ctx.save();
      ctx.fillStyle = gradient(ctx, 'createLinearGradient', [0, h.y, 0, h.y + h.h],
        [[0, c + 'af'], [.4, c + '64'], [1, c + '22']], c + '77');
      ctx.fillRect(h.x, h.y, h.w, h.h);
      // Clip every wave and bubble to the existing hazard rectangle.
      ctx.beginPath(); ctx.rect(h.x, h.y, h.w, h.h); ctx.clip();
      if (h.type === 'storm') {
        ctx.strokeStyle = '#d3f4ff'; ctx.lineWidth = 1.8; ctx.globalAlpha = .7;
        for (let y = h.y + 10; y < h.y + h.h; y += 20) {
          const shift = Math.sin(t * 3 + y) * 5;
          ctx.beginPath(); ctx.moveTo(h.x + 5, y); ctx.lineTo(h.x + h.w * .42, y - 5 + shift);
          ctx.lineTo(h.x + h.w * .58, y + 3); ctx.lineTo(h.x + h.w - 5, y - 8); ctx.stroke();
        }
      } else {
        for (let i = 0; i < Math.min(12, Math.ceil(h.w / 12)); i++) {
          const seed = i * 31 + h.x * .17;
          const travel = (t * (17 + i % 4 * 4) + seed * 3) % Math.max(1, h.h);
          const x = h.x + 5 + ((seed * 13) % Math.max(1, h.w - 10));
          const y = h.y + h.h - travel, radius = 2 + (i % 4) * 1.3;
          ctx.globalAlpha = .23 + (i % 3) * .12; disc(ctx, x, y, radius, '#f0d4ff');
          disc(ctx, x - radius * .25, y - radius * .3, radius * .25, '#ffffff');
        }
        if (h.type === 'roots') {
          ctx.strokeStyle = '#b6d778'; ctx.globalAlpha = .55; ctx.lineWidth = 3;
          for (let x = h.x + 12; x < h.x + h.w; x += 34) {
            ctx.beginPath(); ctx.moveTo(x, h.y + h.h); ctx.quadraticCurveTo(x - 10, h.y + 30, x + 5, h.y + 5); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = .8; ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(h.x, h.y + 2);
      for (let x = 0; x <= h.w; x += 4) ctx.lineTo(h.x + x, h.y + 3 + Math.sin(x * .13 + t * 2.4) * 2);
      ctx.stroke(); ctx.restore();
    }
    return { update, reset, drawTrails, drawTrapMotion, drawImpacts, drawHazard, get time() { return time; },
      stats: () => ({ actors: actors.size, traps: traps.size, particles: particles.length,
        points: [...actors.values()].reduce((n, a) => n + a.points.length, 0), time, reduced, active }) };
  }

  function drawLimbs(ctx, role, color, motion) {
    const facing = motion.facing, run = motion.run, airborne = motion.airborne;
    const moving = motion.moving, rising = motion.vy < -20;
    const tone = role === 'earth' ? '#7b633e' : role === 'darkness' ? '#8853c4' : color;
    function limb(x, y, mx, my, ex, ey, width) {
      const glow = ctx.shadowBlur;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(mx, my); ctx.lineTo(ex, ey);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#0b0b13'; ctx.lineWidth = width + 3; ctx.stroke();
      ctx.shadowBlur = Math.min(8, glow || 0);
      ctx.strokeStyle = tone; ctx.lineWidth = width; ctx.stroke();
      ctx.shadowBlur = glow;
    }
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stride = moving ? run * 11 : 0;
    for (const side of [-1, 1]) {
      if (airborne) {
        const forward = side === facing;
        limb(side * 5, 18, forward ? facing * 13 : -facing * 8, rising ? 20 : 26,
          forward ? facing * 8 : -facing * 17, rising ? 29 : 33, role === 'earth' ? 6 : 4);
        limb(side * 9, 0, side * 16, forward ? -3 : 9,
          forward ? facing * 20 : -facing * 14, forward ? -10 : 17, role === 'earth' ? 5 : 3.5);
      } else {
        limb(side * 6, 18, side * 7 + stride * side * .4, 25,
          side * 7 + stride * side, 30 - Math.max(0, stride * side) * .25, role === 'earth' ? 6 : 4);
        limb(side * 10, 1, side * 15 - stride * side * .45, 9,
          side * 14 - stride * side, 17 - Math.abs(stride) * .3, role === 'earth' ? 5 : 3.5);
      }
    }
    ctx.restore();
  }
  function drawBlock(ctx, r, crusher = false) {
    ctx.save();
    ctx.fillStyle = gradient(ctx, 'createLinearGradient', [r.x, r.y, r.x + r.w, r.y + r.h],
      [[0, '#96919c'], [.12, '#686772'], [.75, '#41414a'], [1, '#292b35']], '#62616b');
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#b1abb9'; ctx.lineWidth = 1.5; ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    ctx.fillStyle = '#ffffff18'; ctx.fillRect(r.x + 5, r.y + 4, r.w - 10, 3);
    ctx.fillStyle = '#11141e60'; ctx.fillRect(r.x + r.w - 5, r.y + 5, 3, r.h - 10);
    if (crusher) {
      for (let y = r.y + 10; y < r.y + r.h - 12; y += 18) {
        ctx.fillStyle = '#b2adba'; ctx.fillRect(r.x + 7, y, r.w - 14, 3);
        ctx.fillStyle = '#20212e'; ctx.fillRect(r.x + 7, y + 3, r.w - 14, 2);
      }
    } else {
      for (const x of [r.x + 15, r.x + r.w - 23]) {
        ctx.fillStyle = '#161923'; ctx.fillRect(x, r.y + 18, 8, 9);
        ctx.fillStyle = '#c8bdcd'; ctx.fillRect(x, r.y + 27, 8, 1);
      }
      for (const x of [r.x + 7, r.x + r.w - 7]) for (const y of [r.y + 7, r.y + r.h - 7]) disc(ctx, x, y, 1.5, '#c3bac9');
    }
    ctx.restore();
  }
  function drawSpikes(ctx, s) {
    ctx.save(); const n = Math.max(1, Math.floor(s.w / 18)), step = s.w / n;
    for (let i = 0; i < n; i++) {
      const x = s.x + i * step, down = s.dir === 'down', tip = down ? s.y + s.h : s.y, base = down ? s.y : s.y + s.h;
      ctx.fillStyle = gradient(ctx, 'createLinearGradient', [x, 0, x + step, 0],
        [[0, '#9ca0b2'], [.45, '#fbf5ff'], [.52, '#d4d2df'], [1, '#888b9f']], '#e4e3ef');
      ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + step / 2, tip); ctx.lineTo(x + step, base); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1a192d80'; ctx.lineWidth = .7; ctx.stroke();
    }
    ctx.restore();
  }
  root.ICEVisuals = { create, drawLimbs, drawBlock, drawSpikes };
})(typeof window === 'undefined' ? globalThis : window);
