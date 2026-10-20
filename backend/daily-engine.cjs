'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const scripts=['journey.js','input.js','audio.js','mechanics.js','daily-run.js','game.js'].map(name=>new vm.Script(fs.readFileSync(path.join(root,'public',name),'utf8'),{filename:name}));
const bootstrap=new vm.Script(`
  window.ICEFeatures={updateTutorial(){},refreshControls(){},die(){state.dailyRun?.die();},finish(){if(!player.dead)state.dailyRun?.finish();}};
  globalThis.dailyEngine={
    start(spec){state.activity={type:'daily',level:spec.level,role:spec.role,date:spec.date,complete:false};state.mode='singleplayer';state.slot=0;state.id='solo';state.levelAttempts=new Map();return createDailyRun(spec);},
    step(mask){return state.dailyRun.step(mask);},
    snapshot(){return {x:player.x,y:player.y,vx:player.vx,vy:player.vy,onGround:player.onGround,dead:player.dead,complete:state.dailyRun.complete,deaths:state.dailyRun.deaths,frames:state.dailyRun.frames,time:state.dailyRun.time,level:state.level,role:state.role};},
    geometry(){return state.levelData;}
    ,replay(){return state.dailyRun.replay();}
  };
`);
function createEngine(spec){
  const elements=new Map();
  const context=new Proxy({},{get(target,key){if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});if(key==='measureText')return ()=>({width:10});return target[key]??(()=>{});},set(target,key,value){target[key]=value;return true;}});
  function element(){return {textContent:'',value:'',style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return true;}},addEventListener(){},setAttribute(){},removeAttribute(){},getContext(){return context;},append(){},appendChild(){},querySelectorAll(){return [];}};}
  const canvas=element();canvas.width=1600;canvas.height=900;elements.set('#game',canvas);
  const document={querySelector(key){if(!elements.has(key))elements.set(key,element());return elements.get(key);},querySelectorAll(){return [];},createElement:element,addEventListener(){},body:{...element()},documentElement:element()};
  const sandbox={console:{log(){},error(){}},document,window:null,performance:{now:()=>10000},requestAnimationFrame(){},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},addEventListener(){},navigator:{clipboard:{writeText:async()=>{}}},localStorage:{getItem(){return JSON.stringify({settings:{fullscreen:false,quality:'low'}});},setItem(){},removeItem(){}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},fetch:async()=>({json:async()=>({enabled:false})}),io:()=>({connected:false,on(){},emit(){}}),Math,JSON};
  sandbox.window=sandbox;vm.createContext(sandbox);
  for(const script of scripts)script.runInContext(sandbox,{timeout:1000});
  bootstrap.runInContext(sandbox,{timeout:1000});sandbox.dailyEngine.start(spec);return sandbox.dailyEngine;
}
module.exports={createEngine};
