/* Singleplayer expedition rules. No online or daily geometry is changed. */
(function(root){
 'use strict';
 const roles=['earth','air','light','darkness'],clone=v=>JSON.parse(JSON.stringify(v));
 const designs=[
  [[390,750,170],[625,690,170],[850,730,175],[1095,660,190]],
  [[410,720,175],[650,650,180],[900,710,180],[1150,650,180]],
  [[360,730,160],[555,650,170],[760,570,170],[970,490,170],[1190,430,180]],
  [[405,750,185],[655,680,175],[895,750,185],[1150,690,180]],
  [[390,720,180],[630,760,180],[870,680,185],[1120,740,180]],
  [[400,740,190],[660,660,180],[915,740,180],[1160,670,180]],
  [[365,710,170],[570,640,165],[780,560,170],[990,480,170],[1200,420,175]],
  [[390,730,175],[630,670,180],[875,740,180],[1120,680,190]],
  [[400,760,180],[655,690,180],[905,750,170],[1140,680,180]],
  [[410,710,180],[650,760,180],[900,690,185],[1150,730,180]],
  [[370,720,170],[580,640,165],[790,555,170],[1005,475,175],[1220,405,170]],
  [[400,740,180],[650,670,180],[900,730,190],[1160,650,180]],
  [[405,730,180],[650,660,180],[900,740,180],[1150,680,180]],
  [[390,750,180],[640,680,180],[895,750,185],[1150,690,190]],
  [[365,715,170],[575,635,175],[795,555,170],[1010,480,170],[1220,410,170]],
  [[400,760,180],[645,690,190],[905,730,175],[1145,660,190]],
  [[395,745,180],[645,675,180],[895,745,180],[1145,675,190]],
  [[410,730,175],[650,660,180],[900,720,185],[1150,650,185]],
  [[365,710,170],[575,625,180],[800,545,170],[1015,465,170],[1220,395,170]],
  [[390,750,190],[650,680,180],[900,745,185],[1150,675,180]],
  [[400,720,180],[645,760,185],[900,690,175],[1140,740,190]],
  [[405,740,180],[650,665,180],[895,735,185],[1150,660,185]],
  [[365,720,175],[580,640,170],[795,560,175],[1010,480,170],[1220,400,175]],
  [[400,750,190],[655,680,185],[910,750,180],[1155,680,185]],
  [[390,740,190],[650,670,180],[900,745,180],[1145,675,185]],
  [[405,720,180],[650,650,185],[905,725,180],[1150,655,185]],
  [[360,710,175],[575,630,175],[795,550,175],[1015,470,170],[1220,390,175]],
  [[405,750,180],[655,680,180],[900,750,190],[1160,680,180]],
  [[400,725,185],[650,755,180],[900,685,185],[1150,740,185]],
  [[390,750,190],[650,675,185],[905,745,180],[1155,670,185]],
  [[360,715,175],[575,635,175],[795,555,175],[1015,475,175],[1225,395,170]],
  [[400,740,185],[650,665,185],[905,735,185],[1160,660,180]],
  [[405,745,180],[650,675,185],[905,750,180],[1150,680,185]],
  [[400,720,185],[655,650,180],[905,725,185],[1160,655,180]],
  [[360,710,175],[575,630,175],[795,550,175],[1015,470,175],[1230,390,165]],
  [[395,755,190],[655,685,185],[910,750,180],[1155,675,185]],
  [[400,720,185],[650,755,190],[910,680,180],[1155,740,185]],
  [[405,745,185],[655,670,185],[910,740,180],[1155,665,185]],
  [[360,710,180],[580,630,175],[800,550,175],[1020,470,175],[1230,390,165]],
  [[400,750,185],[655,680,185],[910,750,185],[1160,680,180]]
 ];
 const roomNames=['PASSOS DA COROA','CIRCUITO DAS TRÊS RUNAS','ESCADARIA DOS ECOS','RELICÁRIO PARTIDO'];
 function special(level){return level>=20&&level<=1000&&level%20===0&&level%100!==0;}
 function room(level){
  if(!special(level))return null;
  const region=Math.floor((level-1)/100),kind=Math.floor((level%100)/20)-1,layout=designs[region*4+kind];
  const platforms=[{x:0,y:790,w:340,h:110},...layout.map(([x,y,w])=>({x,y,w,h:24})),{x:1400,y:kind===2?layout.at(-1)[1]:790,w:200,h:kind===2?24:110}];
  const ld={level,platforms,goal:{x:1515,y:platforms.at(-1).y-100,w:56,h:100},archetype:120+kind,roomTitle:roomNames[kind],regionIndex:region,soloSpecial:true,soloKind:kind,soloNodes:[],boss:null,plate:null,plate2:null,door:null};
  for(const key of ['hazards','spikes','fakeFloors','popTraps','ambushSpikes','reverseZones','elevators','chandeliers','armors','crushers','bookshelves','ghosts','bridgeTiles','dragons','fakeDoors','fakeGoals','fallingBlocks','slamWalls','vanishPlatforms','windGusts','enemies'])ld[key]=[];
  for(let i=0;i<platforms.length-1;i++){const a=platforms[i],b=platforms[i+1],gap=b.x-a.x-a.w;if(gap>0)ld.hazards.push({x:a.x+a.w,y:830,w:gap,h:70,type:'curse'});}
  const last=layout[1];ld.enemies.push({id:990000+level,type:region%2?'bat':'sentinel',x0:last[0]+40,x1:last[0]+last[2]-50,y:last[1]-(region%2?115:46),w:42,h:region%2?30:46,speed:1+region*.08,phase:0,rangeY:region%2?20:0});
  if(kind===1||kind===3)for(const i of [0,2,layout.length-1]){const p=layout[i];ld.soloNodes.push({x:p[0]+p[2]/2-14,y:p[1]-40,w:28,h:28});}
  if(kind===0)ld.elevators.push({id:990000+level,x:800,y0:785,y1:810,w:100,h:16,speed:1+region*.06,phase:0});
  ld.soloRoute={entry:{x:130,y:628,w:100,h:64},badge:{x:742,y:286,w:28,h:38},gate:{x:650,y:180,w:18,h:310},steps:[{x:130,y:690,w:100,h:18},{x:315,y:600,w:115,h:18},{x:450,y:510,w:115,h:18},{x:585,y:420,w:115,h:18},{x:720,y:330,w:125,h:18}]};
  return ld;
 }
 function decorate(ld,{mode,activity,ngplus=false}={}){
  if(mode!=='singleplayer'||activity&&activity!=='practice')return ld;
  ld=room(ld.level)||ld;
  if(ngplus){
   ld.ngplus=true;ld.ngModifier=['PATRULHAS ACELERADAS','VENTOS CRUZADOS','GUARDIÃO REFORJADO'][ld.boss?2:ld.level%2];
   for(const key of ['enemies','crushers','elevators','ghosts','bookshelves','armors'])for(const item of ld[key]||[])if(Number.isFinite(item.speed))item.speed*=1.2;
   if(!ld.boss)ld.windGusts.push({id:991000+ld.level,x:920,y:440,w:180,h:300,force:ld.level%2?620:-620});
   if(ld.boss){ld.boss.attackInterval*=.8;ld.boss.projectileSpeed*=1.18;ld.boss.ngVariant=true;}
  }
  return ld;
 }
 const hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 function attempt(){return {nodes:[],routeUnlocked:false,routeClaimed:false,powers:0,trace:[],lastSample:-100,traceOverflow:false};}
 function step(ld,a,p,{role,power=false,phase=false,dt=0}={}){
  const events=[];
  if(ld.soloNodes){for(let i=0;i<ld.soloNodes.length;i++){
   if(a.nodes.includes(i))continue;const n=ld.soloNodes[i];
   if(ld.soloKind===1){if(i!==a.nodes.length||!power||Math.hypot(p.x+21-n.x-14,p.y+28-n.y-14)>90)continue;}
   else if(!hit(p,n))continue;
   a.nodes.push(i);events.push('node');
  }}
  const r=ld.soloRoute;if(!r)return events;
  if(power&&hit(p,r.entry))a.routeUnlocked=true;
  if(role==='air'&&a.routeUnlocked&&power&&hit(p,{x:250,y:160,w:470,h:540}))p.vy=Math.min(p.vy,-550);
  const accessible=role==='darkness'?phase:a.routeUnlocked;
  if(!a.routeClaimed&&accessible&&hit(p,r.badge)){a.routeClaimed=true;events.push('route');}
  return events;
 }
 function solids(ld,a,role,phase=false){
  const r=ld.soloRoute;if(!r)return [];
  const steps=(role==='darkness'||a.routeUnlocked)?r.steps:role==='air'?[r.steps[0],r.steps.at(-1)]:[r.steps[0]];
  return [...steps.map(p=>({...p,_soloOneWay:true})),...(role==='darkness'&&!phase?[r.gate]:[])];
 }
 function exitOpen(ld,a){return !ld.soloNodes?.length||a?.nodes?.length===ld.soloNodes.length;}
 function blank(){return {version:1,campaignComplete:false,mastery:Object.fromEntries(roles.map(role=>[role,{xp:0,clears:{},objectives:{},routes:{},look:0}])),story:{choices:{},pending:null},ngStory:{choices:{},pending:null},ngProgress:{unlocked:1,records:{},practice:{}},ghosts:{},showGhost:true};}
 function normalize(raw){
  const base=blank();if(!raw||typeof raw!=='object')return base;
  base.campaignComplete=raw.campaignComplete===true;
  for(const role of roles){const r=raw.mastery?.[role]||{};base.mastery[role]={xp:Math.max(0,Number(r.xp)||0),clears:r.clears&&typeof r.clears==='object'?r.clears:{},objectives:r.objectives&&typeof r.objectives==='object'?r.objectives:{},routes:r.routes&&typeof r.routes==='object'?r.routes:{},look:Math.max(0,Math.min(3,Math.floor(Number(r.look)||0)))};}
  for(const k of ['story','ngStory']){base[k]={choices:{...(raw[k]?.choices||{})},pending:Number(raw[k]?.pending)||null};}
  if(raw.ngProgress&&typeof raw.ngProgress==='object')base.ngProgress={...base.ngProgress,...raw.ngProgress};
  if(raw.ghosts&&typeof raw.ghosts==='object')base.ghosts=Object.fromEntries(Object.entries(raw.ghosts).filter(([,v])=>v&&Array.isArray(v.trace)&&v.trace.length>=2&&v.trace.length<=1800&&v.trace.every(row=>Array.isArray(row)&&row.length===5&&row.every(Number.isFinite))).sort((a,b)=>(b[1].at||0)-(a[1].at||0)).slice(0,24));
  base.showGhost=raw.showGhost!==false;return base;
 }
 const key=(level,ng)=>`${ng?'ng':'solo'}:${level}`,rank=xp=>xp>=360?3:xp>=180?2:xp>=60?1:0;
 const rankNames=['Aprendiz','Iniciado','Guardião elemental','Lenda elemental'];
 function awardRoute(data,role,level,ng=false){const m=data.mastery[role],k=key(level,ng);if(m.routes[k])return 0;m.routes[k]=true;m.xp+=4;return 4;}
 function objectives(ld,a,{deaths=0,time=0,secrets=0}={}){return (deaths===0?1:0)|(ld.soloKind!==1&&a.powers===0?2:0)|(time<=(ld.soloSpecial?90:45+ld.level/30)?4:0)|(secrets>0?8:0)|(a.routeClaimed?16:0);}
 function awardClear(data,role,ld,a,result,ng=false){
  const m=data.mastery[role],k=key(ld.level,ng),bits=objectives(ld,a,result),fresh=bits&~(m.objectives[k]||0);let xp=0;
  if(!m.clears[k]){m.clears[k]=true;xp+=ld.soloSpecial?4:2;}
  m.objectives[k]=(m.objectives[k]||0)|bits;
  for(let n=fresh;n;n&=n-1)xp+=3;m.xp+=xp;return {xp,bits,rank:rank(m.xp)};
 }
 function missions(data,role){const m=data.mastery[role],signature={earth:[40,'Dominar 3 circuitos de runas'],air:[60,'Escalar 3 escadarias dos ecos'],light:[80,'Completar 3 relicários partidos'],darkness:[20,'Superar 3 salas Passos da Coroa']}[role];return [{id:'signature',label:signature[1],value:Object.keys(m.clears).filter(k=>Number(k.split(':')[1])%100===signature[0]).length,total:3},{id:'clears',label:'Concluir 20 fases com este elemento',value:Object.keys(m.clears).length,total:20},{id:'routes',label:'Explorar 5 rotas elementais',value:Object.keys(m.routes).length,total:5},{id:'objectives',label:'Cumprir 30 objetivos opcionais',value:Object.values(m.objectives).reduce((s,b)=>{for(let n=b;n;n&=n-1)s++;return s;},0),total:30}];}
 function sample(a,time,p,power){if(time-a.lastSample<100||a.traceOverflow)return;if(a.trace.length>=1800){a.traceOverflow=true;return;}a.lastSample=time;a.trace.push([Math.round(time),Math.round(p.x),Math.round(p.y),p.facing===-1?-1:1,power?1:0]);}
 function ghostKey(level,role,ng){return `${key(level,ng)}:${role}:v011`;}
 function saveGhost(data,level,role,ng,a,time,at=Date.now()){
  if(a.traceOverflow||a.trace.length<2||time>180||time<=0)return false;
  const k=ghostKey(level,role,ng),old=data.ghosts[k];if(old&&old.time<=time)return false;
  data.ghosts[k]={time,at,trace:a.trace.map(row=>[...row])};
  const keys=Object.keys(data.ghosts).sort((a,b)=>data.ghosts[b].at-data.ghosts[a].at);for(const oldKey of keys.slice(24))delete data.ghosts[oldKey];return true;
 }
 function ghostPose(record,ms){
  const rows=record?.trace;if(!rows||rows.length<2||ms<rows[0][0]||ms>rows.at(-1)[0])return null;
  let i=1;while(i<rows.length-1&&rows[i][0]<ms)i++;const a=rows[i-1],b=rows[i],q=Math.max(0,Math.min(1,(ms-a[0])/(b[0]-a[0]||1)));
  return {x:a[1]+(b[1]-a[1])*q,y:a[2]+(b[2]-a[2])*q,facing:b[3],ability:!!b[4]};
 }
 const scenes=[
 ['A chave do porteiro','A primeira chave guarda vozes de quem ficou para trás. Você pode libertá-las ou reforçar o selo.'],
 ['O vitral quebrado','Atrás do vidro, uma família espera pelo nome que o castelo apagou.'],
 ['As correntes vazias','Um prisioneiro pede que você leve sua memória para fora das masmorras.'],
 ['O relógio parado','Os ponteiros podem devolver um minuto perdido ou prender mais uma lembrança.'],
 ['O livro sem autor','Uma página descreve sua chegada antes mesmo de você nascer.'],
 ['A última vela','A chama da capela protege uma voz que o guardião tentou silenciar.'],
 ['A semente no muro','Uma raiz atravessou a pedra carregando lembranças do mundo exterior.'],
 ['O nome na tempestade','Entre os trovões, alguém ainda se lembra do próprio nome.'],
 ['A coroa vazia','O trono oferece controle sobre o castelo. As memórias pedem liberdade.']
 ];
 function choose(story,region,value){if(!Number.isInteger(region)||region<1||region>9||!['free','seal'].includes(value)||story.choices[region])return false;story.choices[region]=value;story.pending=null;return true;}
 function ending(story){const choices=Object.values(story.choices),free=choices.filter(x=>x==='free').length,seal=choices.filter(x=>x==='seal').length;if(!choices.length)return null;return free>seal+2?{name:'FINAL · AS MEMÓRIAS LIVRES',text:'As vozes atravessam a última porta com você. O castelo perde o poder de apagar seus nomes.'}:seal>free+2?{name:'FINAL · A NOVA COROA',text:'Você assume os selos e mantém o castelo fechado. Agora as portas respondem ao seu nome.'}:{name:'FINAL · O PACTO DOS ELEMENTOS',text:'Liberdade e proteção encontram um equilíbrio. O castelo deixa de escolher sozinho quem pode partir.'};}
 root.ICEExpedition={roles,designs,roomNames,special,room,decorate,attempt,step,solids,exitOpen,blank,normalize,rank,rankNames,awardRoute,objectives,awardClear,missions,sample,ghostKey,saveGhost,ghostPose,scenes,choose,ending,clone};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.ICEExpedition;
})(typeof window==='undefined'?globalThis:window);
