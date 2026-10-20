/* Shared 0.0.10 rules. These rules do not reveal or alter hidden traps. */
(function(root){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const COYOTE_MS=110;
  const quality=Object.freeze({low:{particles:48,trailPoints:8,fx:false,shadows:false},medium:{particles:110,trailPoints:16,fx:true,shadows:false},high:{particles:220,trailPoints:28,fx:true,shadows:true}});
  function qualityName(value){return ['auto','low','medium','high'].includes(value)?value:'auto';}
  function qualityController(initial='auto'){
    let setting=qualityName(initial),level=1,samples=0,total=0,lastChange=0;
    return {set(value){const next=qualityName(value);if(next!==setting){setting=next;samples=total=0;}},sample(ms,now){if(setting!=='auto'||!Number.isFinite(ms)||ms<=0||ms>250)return;total+=ms;samples++;if(samples<120)return;const average=total/samples;samples=total=0;if(now-lastChange<8000)return;if(average>24&&level>0){level--;lastChange=now;}else if(average<17.5&&level<2){level++;lastChange=now;}},get name(){return setting==='auto'?['low','medium','high'][level]:setting;},get config(){return quality[this.name];}};
  }
  function bossPhase(charge,required){return clamp(Math.floor((Number(charge)||0)/(Number(required)||1)),0,2);}
  function bossPlatforms(phase){return phase<1?[]:[{x:520,y:690,w:120,h:22},{x:960,y:690,w:120,h:22},...(phase>1?[{x:680,y:520,w:240,h:20}]:[])];}
  function combo(type,first,second,startedAtMs,id){
    if(!first||!second||Math.hypot(first.x-second.x,first.y-second.y)>320)return null;
    if(type==='earth-air')return {id,type,startedAtMs,durationMs:4000,x:clamp(first.x-52,0,1452),y:clamp(first.y+56,130,790),w:148,h:20,vx:(second.facing===-1?-1:1)*110};
    if(type==='light-darkness')return {id,type,startedAtMs,durationMs:3000,x:clamp((first.x+second.x)/2+21,50,1550),y:clamp((first.y+second.y)/2+28,60,820),radius:155};
    return null;
  }
  function comboPose(value,elapsedMs){
    const age=elapsedMs-value.startedAtMs;if(age<0||age>=value.durationMs)return null;
    if(value.type==='earth-air')return {...value,x:clamp(value.x+value.vx*age/1000,0,1600-value.w),y:value.y-Math.min(80,age*.12),_combo:true};
    return {...value};
  }
  root.ICEMechanics={COYOTE_MS,quality,qualityName,qualityController,bossPhase,bossPlatforms,combo,comboPose};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ICEMechanics;
})(typeof window==='undefined'?globalThis:window);
