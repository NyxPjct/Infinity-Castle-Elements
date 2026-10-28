'use strict';
const assert=require('node:assert/strict');
const E=require('../public/solo');
const {engine}=require('./expedition-engine.cjs');
function solve(e,level,role,ng=false){
 const ld=e.start(level,role,ng),ps=ld.platforms;let p=e.snapshot(),support=0,flightTarget=0,frames=0;
 const steering=(dx,vx)=>{const desired=Math.max(-330,Math.min(330,dx*6));return vx<desired-12?2:vx>desired+12?1:0;};
 for(;frames<9000&&p.level===level;frames++){
  let mask=0,idx=ps.findIndex(r=>p.onGround&&Math.abs(p.y+56-r.y)<2&&p.x+42>r.x&&p.x<r.x+r.w);
  const targetNode=ld.soloNodes?.find((n,i)=>!p.nodes.includes(i));
  if(idx>=0){
   support=idx;const platform=ps[idx];
   const onNode=targetNode&&targetNode.x>=platform.x&&targetNode.x<=platform.x+platform.w&&Math.abs(targetNode.y+40-platform.y)<2;
   if(onNode){const dx=targetNode.x+14-(p.x+21);mask=steering(dx,p.vx);if(ld.soloKind===1&&Math.abs(dx)<45&&p.cooldown<=0)mask|=8;}
   else if(idx===ps.length-1)mask=steering(ld.goal.x+10-p.x,p.vx);
   else{
    const edge=platform.x+platform.w-42-12;mask=2;
    if(p.x>=edge){mask|=4;flightTarget=idx+1;}
   }
  }else{
   const platform=ps[flightTarget];mask=steering(platform.x+platform.w/2-(p.x+21),p.vx);
  }
  p=e.tick(mask);if(p.y>1020)return {ok:false,reason:'fell',frames,p,support,flightTarget};
 }
 return {ok:p.level!==level,frames,p,support,flightTarget};
}

function solveRoute(e,role){
 const ld=e.start(20,role),steps=ld.soloRoute.steps;let p=e.snapshot(),stage=0,targetIndex=0;
 const steer=(target)=>{const dx=target-(p.x+21),desired=Math.max(-330,Math.min(330,dx*6));return p.vx<desired-12?2:p.vx>desired+12?1:0;};
 for(let frame=0;frame<1800;frame++){
  let mask=0;
  if(stage===0){mask=steer(180);if(p.onGround&&Math.abs(p.x+21-180)<12){mask|=4;stage=1;}}
  else if(stage===1){mask=steer(180);if(p.onGround&&Math.abs(p.y+56-690)<2){stage=2;targetIndex=0;}}
  else{
   if(!p.unlocked&&role!=='darkness')mask|=8;
   if(role==='air'){
    mask|=steer(756);if(p.onGround&&p.y+56>400)mask|=4;
   }else{
    const index=steps.findIndex(s=>p.onGround&&Math.abs(p.y+56-s.y)<2&&p.x+42>s.x&&p.x<s.x+s.w);
    if(index>=0){
     targetIndex=Math.min(steps.length-1,index+1);
     if(index===steps.length-1){mask|=steer(756);if(role==='darkness'&&p.cooldown<=0)mask|=8;}
     else if(role==='darkness'&&index===3&&p.x>585&&p.cooldown<=0){mask|=8|4|2;}
     else{mask|=2;const edge=steps[index].x+steps[index].w-54;if(p.x>=edge)mask|=4;}
    }else mask|=steer(targetIndex===steps.length-1?756:steps[targetIndex].x+steps[targetIndex].w/2);
   }
  }
  p=e.tick(mask);if(p.route)return {ok:true,frame};if(p.y>1020)return {ok:false,stage,targetIndex,frame,p};
 }
 return {ok:false,stage,targetIndex,p};
}

const e=engine();let physicsRoutes=0;
for(const role of E.roles)assert.ok(solveRoute(e,role).ok,'Actual physics/power timing reaches the '+role+' route reward');
for(let level=20;level<1000;level+=20){
 if(level%100===0){assert.equal(E.room(level),null);continue;}
 for(const role of E.roles)for(const ng of [false,true]){
  const result=solve(e,level,role,ng);assert.ok(result.ok,JSON.stringify({level,role,ng,...result}));physicsRoutes++;
 }
 e.start(level,'earth');assert.deepEqual(Array.from(e.integrity()),[]);e.render();
 const room=E.room(level),a=E.attempt();
 if(room.soloNodes.length){assert.equal(E.exitOpen(room,a),false);for(const n of room.soloNodes)E.step(room,a,{x:n.x-7,y:n.y-14,w:42,h:56,vy:0},{role:'earth',power:true});assert.equal(E.exitOpen(room,a),true);assert.equal(a.nodes.length,3);}
 for(const role of E.roles){
  const state=E.attempt(),p={x:150,y:634,w:42,h:56,vy:50};
  E.step(room,state,p,{role,power:false});assert.equal(state.routeUnlocked,false);
  E.step(room,state,p,{role,power:true});assert.equal(state.routeUnlocked,true);
  if(role==='air'){p.x=350;E.step(room,state,p,{role,power:true});assert.equal(p.vy,-550);}
  const before=E.solids(room,state,role,false),during=E.solids(room,state,role,true);
  if(role==='darkness'){assert.ok(before.includes(room.soloRoute.gate));assert.equal(during.includes(room.soloRoute.gate),false);}
  Object.assign(p,{x:room.soloRoute.badge.x,y:room.soloRoute.badge.y});E.step(room,state,p,{role,power:true,phase:true});assert.equal(state.routeClaimed,true);
 }
}
assert.equal(physicsRoutes,320);
e.start(1000,'earth',false);const originalBoss=JSON.stringify(e.projectiles(2));const reforged=e.start(1000,'earth',true);assert.equal(reforged.boss.ngVariant,true);assert.notEqual(JSON.stringify(e.projectiles(2)),originalBoss,'NG+ guardian attacks use an alternative pattern');
const original={level:20,platforms:[],enemies:[]};for(const mode of ['multiplayer','chaos'])assert.equal(E.decorate(original,{mode}),original);for(const activity of ['daily','tutorial'])assert.equal(E.decorate(original,{mode:'singleplayer',activity}),original);
const d=E.blank(),room=E.room(20),a=E.attempt();a.powers=1;
const first=E.awardClear(d,'earth',room,a,{deaths:1,time:120});assert.equal(first.xp,4);assert.equal(E.awardClear(d,'earth',room,a,{deaths:1,time:120}).xp,0);
assert.equal(E.awardRoute(d,'earth',20),4);assert.equal(E.awardRoute(d,'earth',20),0);assert.equal(E.awardRoute(d,'air',20),4);assert.equal(E.awardRoute(d,'earth',20,true),4);
a.powers=0;a.routeClaimed=true;assert.equal(E.awardClear(d,'earth',room,a,{deaths:0,time:30}).xp,12);assert.equal(E.awardClear(d,'earth',room,a,{deaths:0,time:30}).xp,0);
assert.equal(E.rank(59),0);assert.equal(E.rank(60),1);assert.equal(E.rank(180),2);assert.equal(E.rank(360),3);
for(const role of E.roles)assert.ok(E.missions(d,role).some(m=>m.id==='signature'));
const trace=E.attempt();for(let i=0;i<20;i++)E.sample(trace,i*100,{x:i*5,y:700,facing:1},false);assert.equal(E.saveGhost(d,20,'earth',false,trace,2,1),true);assert.equal(E.saveGhost(d,20,'earth',false,trace,3,2),false);
const ghost=d.ghosts[E.ghostKey(20,'earth',false)];assert.equal(E.ghostPose(ghost,150).x,7.5);assert.equal(E.ghostPose(ghost,2001),null);
for(let level=1;level<30;level++)E.saveGhost(d,level,'air',false,trace,2,level);assert.equal(Object.keys(d.ghosts).length,24);
const malformed=E.normalize({ghosts:{bad:{trace:[[0,NaN,0,1,0],[1,0,0,1,0]]}}});assert.deepEqual(malformed.ghosts,{});
const story={choices:{},pending:1};assert.equal(E.choose(story,1,'free'),true);assert.equal(E.choose(story,1,'seal'),false);assert.equal(E.choose(story,10,'seal'),false);assert.equal(story.pending,null);
assert.notEqual(E.ending({choices:{1:'free',2:'free',3:'free'}}).name,E.ending({choices:{1:'seal',2:'seal',3:'seal'}}).name);
assert.match(E.ending({choices:{1:'free',2:'seal'}}).name,/PACTO/);
assert.equal(E.normalize({campaignComplete:true}).campaignComplete,true);
console.log('PASS: 40 authored rooms rendered and audited; 320 physics routes (four elements, original/NG+, enemy damage disabled for traversal); ordered runes/fragments, elemental gates/updrafts, duplicate XP protection, role challenges, bounded ghosts, migration and three narrative endings.');
