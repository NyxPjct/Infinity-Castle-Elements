'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function engine(){
 const ctx=new Proxy({},{get(t,k){if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>({addColorStop(){}});if(k==='measureText')return ()=>({width:10});return t[k]??(()=>{});},set(t,k,v){t[k]=v;return true;}});
 function el(){return {textContent:'',value:'',style:{setProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return true;}},addEventListener(){},setAttribute(){},removeAttribute(){},getContext(){return ctx;},querySelectorAll(){return [];}};}
 const elements=new Map(),canvas=el();canvas.width=1600;canvas.height=900;elements.set('#game',canvas);
 const document={querySelector(k){if(!elements.has(k))elements.set(k,el());return elements.get(k);},querySelectorAll(){return [];},createElement:el,addEventListener(){},body:el(),documentElement:el()};
 const box={document,window:null,console,Math,JSON,__now:10000,performance:{now(){return box.__now;}},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},requestAnimationFrame(){},addEventListener(){},localStorage:{getItem(){return null;},setItem(){}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{clipboard:{writeText:async()=>{}}},fetch:async()=>({json:async()=>({enabled:false})}),io:()=>({connected:false,on(){},emit(){}})};box.window=box;vm.createContext(box);
 for(const name of ['journey','input','audio','mechanics','daily-run','solo','game'])vm.runInContext(fs.readFileSync(path.join(root,'public',name+'.js'),'utf8'),box,{filename:name});
 vm.runInContext(`globalThis.testEngine={
  start(level,role,ngplus=false){state.mode='singleplayer';state.activity=null;state.ngplus=ngplus;state.role=role;state.slot=0;state.id='solo';state.levelAttempts=new Map();state.deaths=0;startLevel(level);state.invulnUntil=Infinity;return state.levelData;},
  tick(mask){globalThis.__now+=1000/60;inputController.touch('left',!!(mask&1));inputController.touch('right',!!(mask&2));inputController.touch('jump',!!(mask&4));if(mask&8)activateAbility();player.update(1/60);return this.snapshot();},
  snapshot(){return {x:player.x,y:player.y,w:42,h:56,vx:player.vx,vy:player.vy,onGround:player.onGround,dead:player.dead,level:state.level,nodes:[...state.expeditionRun.nodes],route:state.expeditionRun.routeClaimed,unlocked:state.expeditionRun.routeUnlocked,cooldown:Math.max(0,state.abilityCooldownUntil-gameNow()),elapsed:elapsed(),running:state.running};},
  projectiles(phase){state.bossCharge=phase*state.levelData.boss.required;state.levelStart=gameNow()-1800;return bossProjectiles();},
  integrity(){return levelIntegrityIssues(state.levelData);},render(){render();},
  routeSolids(){return ICEExpedition.solids(state.levelData,state.expeditionRun,state.role,gameNow()<state.abilityPhaseUntil);}
 };`,box);
 return box.testEngine;
}
module.exports={engine};
