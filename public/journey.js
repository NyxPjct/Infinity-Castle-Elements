(function(root){
  'use strict';
  const clamp=n=>Math.max(1,Math.min(1000,Math.floor(Number(n)||1)));
  function daily(date=new Date()){
    const day=date.toISOString().slice(0,10);let seed=2166136261;
    for(const c of day)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
    let level=5+seed%985;if(level%100===0||level===666)level++;
    return {date:day,level,role:['earth','air','light','darkness'][seed%4],seed};
  }
  function progress(raw={},savedLevel=1){
    raw=raw&&typeof raw==='object'?raw:{};
    return {unlocked:clamp(Math.max(Number(raw.unlocked)||1,Number(savedLevel)||1)),
      records:raw.records&&typeof raw.records==='object'?raw.records:{},practice:raw.practice&&typeof raw.practice==='object'?raw.practice:{}};
  }
  function record(store,level,result){
    const key=String(clamp(level)),old=store[key];
    const time=Math.max(.001,Number(result.time)||.001),deaths=Math.max(0,Number(result.deaths)||0);
    const better=!old||time<old.time;
    store[key]={time:better?time:old.time,deaths:better?deaths:old.deaths,clears:(old?.clears||0)+1};
    return store[key];
  }
  function tutorialLevel(){
    return {level:1,platforms:[{x:0,y:790,w:420,h:110},{x:500,y:740,w:420,h:160},{x:1000,y:790,w:600,h:110}],
      goal:{x:1515,y:690,w:56,h:100},hazards:[],spikes:[],fakeFloors:[],popTraps:[],ambushSpikes:[],
      plate:{x:1080,y:780,w:68,h:10},plate2:{x:1240,y:780,w:68,h:10},door:{x:1360,y:570,w:32,h:220},
      enemies:[{id:900001,type:'sentinel',x0:760,x1:800,y:694,w:42,h:46,speed:.3,phase:0}],
      elevators:[],chandeliers:[],armors:[],crushers:[],bookshelves:[],ghosts:[],bridgeTiles:[],dragons:[],
      fakeDoors:[],fakeGoals:[],fallingBlocks:[],slamWalls:[],vanishPlatforms:[],windGusts:[],reverseZones:[],
      boss:null,archetype:98,roomTitle:'SALA DE TREINO',regionIndex:0};
  }
  root.ICEJourney={daily,progress,record,tutorialLevel};
})(typeof window==='undefined'?globalThis:window);
