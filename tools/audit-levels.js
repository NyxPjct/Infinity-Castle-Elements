'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'public', 'game.js'), 'utf8');

function makeEl(ctx) {
  return {
    textContent: '', value: '', style: {}, onclick: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
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
  querySelectorAll() { return []; },
  createElement() { return makeEl(ctx); },
  addEventListener() {}, fullscreenElement: null, webkitFullscreenElement: null,
  exitFullscreen: async () => {}, webkitExitFullscreen() {}
};
const socket = { on() {}, emit() {} };
const sandbox = {
  console, document, window: null, io: () => socket,
  localStorage: { getItem() { return null; }, setItem() {} },
  __now: 10000, performance: { now: () => sandbox.__now }, requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {},
  addEventListener() {}, navigator: { clipboard: { writeText: async () => {} } },
  fetch: async () => ({ json: async () => ({ enabled: false }) }), Math, JSON
};
sandbox.window = sandbox;
vm.createContext(sandbox);
const runtimeHook = `
;globalThis.__runtimeSmoke = (level) => {
  state.mode='singleplayer';state.running=false;state.shopOpen=false;state.soloResetPending=false;state.soloTransition=false;
  globalThis.__now += 50;startLevel(level);
  if(!state.levelData)throw new Error('startLevel terminou sem levelData');
  if(!Array.isArray(state.levelData.platforms)||state.levelData.platforms.length<2)throw new Error('startLevel terminou sem plataformas jogáveis');
  if(!state.levelData.goal)throw new Error('startLevel terminou sem saída');
  render();
  for(const role of ['earth','air','light','darkness']){
    state.selectedRole=role;state.role=role;state.running=true;state.shopOpen=false;state.soloResetPending=false;player.dead=false;player.reset();
    globalThis.__now+=20;player.update(1/60);
    state.lastAbility=0;globalThis.__now+=2500;activateAbility();
  }
  state.running=true;state.shopOpen=false;state.soloResetPending=false;player.dead=false;
  for(const x of [300,520,760,980,1220,1460]){player.x=x;player.y=690;player.vx=0;player.vy=0;globalThis.__now+=120;processTrolls(player);}
  render();
  return {platforms:state.levelData.platforms.length,goal:!!state.levelData.goal,roles:4};
};`
vm.runInContext(code + runtimeHook, sandbox, { filename: 'public/game.js' });

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
  if(kind==='enemies')return{x:Math.min(v.x0,v.x1),y:v.y-(v.rangeY||0),w:Math.abs(v.x1-v.x0)+v.w,h:v.h+(v.rangeY||0)*2};
  return v;
}
function dynamicInvades(ld,zone){
  for(const kind of ['elevators','bookshelves','armors','crushers','ghosts','chandeliers','fallingBlocks','slamWalls','enemies'])for(const v of ld[kind]||[])if(intersects(sweep(kind,v),zone))return kind;
  return null;
}

const bad=[];
const regionCounts=Array(10).fill(0);
const archetypes=new Set();
let bosses=0, doors=0, rendered=0, runtimeFrames=0, jokerLevels=0, normalReverseLeaks=0, special666=0;
for(let level=1; level<=1000; level++) {
  let ld;
  try { ld=sandbox.safeGenerateLevel(level); } catch (e) { bad.push([level,`safeGenerateLevel lançou: ${e.stack||e}`]); continue; }
  const issues = sandbox.levelIntegrityIssues(ld) || [];
  for(const issue of issues) bad.push([level, issue]);

  const expectedRegion=Math.floor((level-1)/100);
  if(ld.regionIndex!==expectedRegion)bad.push([level,`região ${ld.regionIndex}, esperado ${expectedRegion}`]);
  regionCounts[ld.regionIndex]++;
  if(level%100===0){bosses++;if(!ld.boss)bad.push([level,'fase de chefe sem boss']);}
  else if(ld.boss)bad.push([level,'boss fora de múltiplo de 100']);
  if(ld.door){doors++;if(!ld.plate||!ld.plate2)bad.push([level,'portão sem as duas placas']);}
  if(!ld.boss&&!ld.special666)archetypes.add(ld.archetype);
  if(ld.special666){special666++;if(level!==666)bad.push([level,'special666 fora da fase 666']);}
  if(ld.joker){
    jokerLevels++;
    const rules=Array.isArray(ld.jokerRules)?ld.jokerRules:[];
    if(rules.length<1||rules.length>3)bad.push([level,`fase Coringa com ${rules.length} maldições, esperado 1-3`]);
    const hasReverse=rules.includes('reverse'),zones=(ld.reverseZones||[]).length;
    if(hasReverse&&!zones)bad.push([level,'Coringa com reverse sem zona de inversão']);
    if(!hasReverse&&zones)bad.push([level,'Coringa sem reverse contém zona de inversão']);
  } else if((ld.reverseZones||[]).length){normalReverseLeaks++;bad.push([level,'fase normal contém controles invertidos']);}

  if(!canReachRect(ld,ld.goal))bad.push([level,'auditoria independente: saída sem rota física de Terra']);
  if(ld.boss){
    const runes=Object.entries(ld.boss.runes||{});if(runes.length!==2)bad.push([level,`chefão com ${runes.length} runas, esperado 2`]);
    for(const [key,rune] of runes)if(!canReachRect(ld,rune))bad.push([level,`auditoria independente: runa ${key} inalcançável`]);
  }

  const spawn={x:70,y:675,w:125,h:75}, goalSafe={x:ld.goal.x-10,y:ld.goal.y-8,w:ld.goal.w+20,h:ld.goal.h+16};
  const lethal=[...ld.hazards,...ld.spikes];
  if(lethal.some(r=>intersects(r,spawn)))bad.push([level,'armadilha estática invade spawn']);
  if(lethal.some(r=>intersects(r,goalSafe)))bad.push([level,'armadilha estática invade saída']);
  const spawnDynamic=dynamicInvades(ld,spawn),goalDynamic=dynamicInvades(ld,goalSafe);
  if(level>=5&&level%100!==0&&!(ld.enemies||[]).length)bad.push([level,'fase >=5 sem inimigos']);
  if(spawnDynamic)bad.push([level,`${spawnDynamic} invade spawn`]);
  if(goalDynamic)bad.push([level,`${goalDynamic} invade saída`]);
  if(ld.door){for(const [name,plate] of [['esquerda',ld.plate],['direita',ld.plate2]]){const zone={x:plate.x-12,y:plate.y-68,w:plate.w+24,h:78},kind=dynamicInvades(ld,zone);if(kind)bad.push([level,`${kind} invade placa ${name}`]);}}

  try {
    const snap=sandbox.__runtimeSmoke(level);
    if(!snap||snap.platforms<2||!snap.goal)bad.push([level,'runtime: snapshot inválido']);
    else { rendered++; runtimeFrames+=snap.roles||0; }
  } catch(e) { bad.push([level,`runtime/startLevel/render lançou: ${e.stack||e}`]); }
}

if(bosses!==10)bad.push(['global',`chefes: ${bosses}, esperado 10`]);
if(doors!==240)bad.push(['global',`fases com portão: ${doors}, esperado 240`]);
if(archetypes.size!==12)bad.push(['global',`arquétipos procedurais usados: ${[...archetypes].sort((a,b)=>a-b)}, esperado 12 tipos`]);
if(special666!==1)bad.push(['global',`fases especiais 666: ${special666}, esperado 1`]);
for(let i=0;i<10;i++)if(regionCounts[i]!==100)bad.push(['global',`região ${i} tem ${regionCounts[i]} fases, esperado 100`]);
if(rendered!==1000)bad.push(['global',`renderizações concluídas: ${rendered}/1000`]);
if(runtimeFrames!==4000)bad.push(['global',`frames reais concluídos: ${runtimeFrames}/4000`]);
if(jokerLevels<20)bad.push(['global',`fases Coringa detectadas: ${jokerLevels}, esperado pelo menos 20`]);
if(normalReverseLeaks!==0)bad.push(['global',`vazamentos de controles invertidos em fases normais: ${normalReverseLeaks}`]);

const report={checked:1000, bosses, doors, jokerLevels, normalReverseLeaks, special666, archetypes:archetypes.size, regions:regionCounts, rendered, runtimeFrames, failures:bad.length};
console.log(JSON.stringify(report,null,2));
if(bad.length){console.error('\nFalhas (primeiras 100):');for(const x of bad.slice(0,100))console.error(`Fase ${x[0]}: ${x[1]}`);process.exit(1);}
console.log('\nOK: as 1000 fases passaram pela auditoria estrutural e de runtime definida nesta build.');
