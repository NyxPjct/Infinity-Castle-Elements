'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'public', 'game.js'), 'utf8');

function makeEl(ctx) {
  return {
    textContent: '', value: '', style: {}, onclick: null,
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {},
    getContext() { return ctx; }
  };
}
const ctx = new Proxy({}, {
  get(target, prop) {
    if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (prop === 'measureText') return () => ({ width: 10 });
    if (!(prop in target)) target[prop] = () => {};
    return target[prop];
  },
  set(target, prop, value) { target[prop] = value; return true; }
});
const canvas = makeEl(ctx); canvas.width = 1600; canvas.height = 900; canvas.getContext = () => ctx;
const els = new Map([['#game', canvas]]);
const document = {
  querySelector(sel) { if (!els.has(sel)) els.set(sel, makeEl(ctx)); return els.get(sel); },
  addEventListener() {}, fullscreenElement: null, webkitFullscreenElement: null,
  exitFullscreen: async () => {}, webkitExitFullscreen() {}
};
const socket = { on() {}, emit() {} };
const sandbox = {
  console, document, window: null, io: () => socket,
  localStorage: { getItem() { return null; }, setItem() {} },
  performance: { now: () => 1000 }, requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {},
  addEventListener() {}, navigator: { clipboard: { writeText: async () => {} } },
  fetch: async () => ({ json: async () => ({ enabled: false }) }), Math, JSON
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'public/game.js' });

function intersects(a, b) { return a && b && a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
function supportPlatform(ld, r) {
  const bottom = r.y+r.h, cx = r.x+r.w/2;
  return ld.platforms.filter(p => cx >= p.x-2 && cx <= p.x+p.w+2 && p.y >= bottom && p.y-bottom <= 14).sort((a,b)=>a.y-b.y)[0] || null;
}
function jumpTime(fromY, toY) {
  const vy=-595, g=1580, rise=fromY-toY, disc=vy*vy-2*g*rise;
  return disc < 0 ? null : (-vy + Math.sqrt(disc))/g;
}
function canJump(a,b) {
  if (!a || !b || a === b || a.w < 42 || b.w < 42) return false;
  const t = jumpTime(a.y,b.y); if (t == null) return false;
  let gap=0; if (b.x>a.x+a.w) gap=b.x-(a.x+a.w); else if (a.x>b.x+b.w) gap=a.x-(b.x+b.w);
  return gap <= 330*t+6;
}
function reachable(ld) {
  const ps=ld.platforms.filter(p=>p.w>=42&&p.h>0&&p.y<=790);
  const start=ps.findIndex(p=>100>=p.x&&100<=p.x+p.w&&p.y>=740&&p.y<=795);
  const seen=new Set(); if(start<0)return {ps,seen}; seen.add(start); const q=[start];
  while(q.length){const i=q.shift();for(let j=0;j<ps.length;j++){if(seen.has(j))continue;if(canJump(ps[i],ps[j])){seen.add(j);q.push(j);}}}
  return {ps,seen};
}
function canReachRect(ld,r){const target=supportPlatform(ld,r);if(!target)return false;const {ps,seen}=reachable(ld);return seen.has(ps.indexOf(target));}
function sweep(kind,v){
  if(kind==='elevators')return{x:v.x,y:Math.min(v.y0,v.y1),w:v.w,h:Math.abs(v.y1-v.y0)+v.h};
  if(kind==='bookshelves'||kind==='armors')return{x:Math.min(v.x0,v.x1),y:v.y,w:Math.abs(v.x1-v.x0)+v.w,h:v.h};
  if(kind==='crushers')return v.axis==='x'?{x:Math.min(v.a,v.b),y:v.y,w:Math.abs(v.b-v.a)+v.w,h:v.h}:{x:v.x,y:Math.min(v.a,v.b),w:v.w,h:Math.abs(v.b-v.a)+v.h};
  if(kind==='ghosts')return{x:v.x-v.rangeX,y:v.y-v.rangeY,w:v.w+v.rangeX*2,h:v.h+v.rangeY*2};
  if(kind==='chandeliers')return{x:v.x,y:v.y,w:v.w,h:Math.max(v.h,v.floorY-v.y)};
  if(kind==='fallingBlocks')return{x:v.x,y:v.y,w:v.w,h:Math.max(v.h,v.floorY-v.y)};
  if(kind==='slamWalls')return{x:Math.min(v.startX,v.endX),y:v.y,w:Math.abs(v.endX-v.startX)+v.w,h:v.h};
  return v;
}
function dynamicInvades(ld,zone){
  for(const kind of ['elevators','bookshelves','armors','crushers','ghosts','chandeliers','fallingBlocks','slamWalls'])for(const v of ld[kind]||[])if(intersects(sweep(kind,v),zone))return kind;
  return null;
}

const bad=[];
const regionCounts=Array(10).fill(0);
const archetypes=new Set();
let bosses=0, doors=0, rendered=0;
for(let level=1; level<=1000; level++) {
  let ld;
  try { ld=sandbox.generateLevel(level); } catch (e) { bad.push([level,`generateLevel lançou: ${e.stack||e}`]); continue; }
  const issues = sandbox.levelIntegrityIssues(ld) || [];
  for(const issue of issues) bad.push([level, issue]);

  const expectedRegion=Math.floor((level-1)/100);
  if(ld.regionIndex!==expectedRegion)bad.push([level,`região ${ld.regionIndex}, esperado ${expectedRegion}`]);
  regionCounts[ld.regionIndex]++;
  if(level%100===0){bosses++;if(!ld.boss)bad.push([level,'fase de chefe sem boss']);}
  else if(ld.boss)bad.push([level,'boss fora de múltiplo de 100']);
  if(ld.door){doors++;if(!ld.plate||!ld.plate2)bad.push([level,'portão sem as duas placas']);}
  if(!ld.boss)archetypes.add(ld.archetype);

  if(!canReachRect(ld,ld.goal))bad.push([level,'auditoria independente: saída sem rota física de Terra']);
  if(ld.boss){
    for(const role of ['earth','air']) if(!canReachRect(ld,ld.boss.runes[role]))bad.push([level,`auditoria independente: runa ${role} inalcançável`]);
  }

  const spawn={x:70,y:675,w:125,h:75}, goalSafe={x:ld.goal.x-10,y:ld.goal.y-8,w:ld.goal.w+20,h:ld.goal.h+16};
  const lethal=[...ld.hazards,...ld.spikes];
  if(lethal.some(r=>intersects(r,spawn)))bad.push([level,'armadilha estática invade spawn']);
  if(lethal.some(r=>intersects(r,goalSafe)))bad.push([level,'armadilha estática invade saída']);
  const spawnDynamic=dynamicInvades(ld,spawn),goalDynamic=dynamicInvades(ld,goalSafe);
  if(spawnDynamic)bad.push([level,`${spawnDynamic} invade spawn`]);
  if(goalDynamic)bad.push([level,`${goalDynamic} invade saída`]);
  if(ld.door){for(const [name,plate] of [['esquerda',ld.plate],['direita',ld.plate2]]){const zone={x:plate.x-12,y:plate.y-68,w:plate.w+24,h:78},kind=dynamicInvades(ld,zone);if(kind)bad.push([level,`${kind} invade placa ${name}`]);}}

  try { sandbox.startLevel(level); sandbox.render(); rendered++; } catch(e) { bad.push([level,`render/startLevel lançou: ${e.stack||e}`]); }
}

if(bosses!==10)bad.push(['global',`chefes: ${bosses}, esperado 10`]);
if(doors!==240)bad.push(['global',`fases com portão: ${doors}, esperado 240`]);
if(archetypes.size!==12)bad.push(['global',`arquétipos usados: ${[...archetypes].sort((a,b)=>a-b)}, esperado 12 tipos`]);
for(let i=0;i<10;i++)if(regionCounts[i]!==100)bad.push(['global',`região ${i} tem ${regionCounts[i]} fases, esperado 100`]);
if(rendered!==1000)bad.push(['global',`renderizações concluídas: ${rendered}/1000`]);

const report={checked:1000, bosses, doors, archetypes:archetypes.size, regions:regionCounts, rendered, failures:bad.length};
console.log(JSON.stringify(report,null,2));
if(bad.length){console.error('\nFalhas (primeiras 100):');for(const x of bad.slice(0,100))console.error(`Fase ${x[0]}: ${x[1]}`);process.exit(1);}
console.log('\nOK: as 1000 fases passaram pela auditoria estrutural e de runtime definida nesta build.');
