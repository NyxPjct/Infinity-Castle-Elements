/* Expedition presentation, persistence, and non-colliding practice ghosts. */
(function(){
 'use strict';
 const E=window.ICEExpedition,hub=$('#expeditionModal'),storyModal=$('#expeditionStoryModal');let priorFocus=null,resume=false,lastHud='',lastHudAt=0;
 const data=()=>profile.solo||(profile.solo=E.blank());
 const active=()=>state.mode==='singleplayer'&&(!state.activity||state.activity.type==='practice');
 const campaign=()=>active()&&!state.activity;
 const story=()=>data()[state.ngplus?'ngStory':'story'];
 const text=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
 function unlocked(){return !!(data().campaignComplete||loadSoloSave()?.completed);}
 function refresh(){
  const ng=loadNGSave(),button=$('#ngplusBtn');button.disabled=!unlocked()||!!ng?.completed;
  button.textContent=ng?.completed?'Novo Jogo+ concluído':ng?'Continuar Novo Jogo+':'Novo Jogo+';
  text('#ngplusHelp',unlocked()?'Campanha separada, ventos cruzados, inimigos mais rápidos e chefes reforjados.':'Conclua a campanha para liberar o Novo Jogo+.');
  const role=$('#expeditionRole').value||state.selectedRole,m=data().mastery[role],r=E.rank(m.xp);
  text('#masterySummary',`${ELEMENTS[role].name} · ${E.rankNames[r]} · ${m.xp} XP`);
  const bar=$('#masteryProgress');bar.max=r===3?360:[60,180,360][r];bar.value=m.xp;
  const looks=$('#masteryLooks');looks.replaceChildren();
  for(const [i,label] of ['Visual clássico','Traje do iniciado','Manto do guardião','Aura da lenda'].entries()){
   const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=i>r;b.classList.toggle('selected',m.look===i);b.dataset.look=i;
   b.onclick=()=>{m.look=i;saveProfile();refresh();};looks.appendChild(b);
  }
  const list=$('#masteryMissions');list.replaceChildren();
  for(const mission of E.missions(data(),role)){const item=document.createElement('li');item.textContent=mission.label+` · ${Math.min(mission.value,mission.total)}/${mission.total}`;list.appendChild(item);}
  $('#ghostEnabled').checked=data().showGhost;
  const history=$('#storyHistory');history.replaceChildren();
  const selected=$('#expeditionStoryCampaign').value==='ngplus'?data().ngStory:data().story;
  for(let region=1;region<=9;region++){const choice=selected.choices[region];if(!choice)continue;const item=document.createElement('li');item.textContent=E.scenes[region-1][0]+' · '+(choice==='free'?'Libertar a memória':'Reforçar o selo');history.appendChild(item);}
  if(!history.childElementCount){const item=document.createElement('li');item.textContent='As decisões aparecem após os guardiões das primeiras nove regiões.';history.appendChild(item);}
 }
 function open(){priorFocus=document.activeElement;resume=gameplayVisible()&&!state.paused;if(resume)openPauseMenu();$('#expeditionRole').value=active()?state.role:state.selectedRole;$('#expeditionStoryCampaign').value=state.ngplus?'ngplus':'campaign';refresh();hub.classList.remove('hidden');$('#expeditionCloseBtn').focus();}
 function close(){hub.classList.add('hidden');if(resume)closePauseMenu(true);resume=false;priorFocus?.focus?.();}
 function begin(){
  lastHud='';lastHudAt=-Infinity;
  $('#soloObjectives').classList.toggle('hidden',!active());
  if(!active())return;
  const r=state.expeditionRun;
  state.expeditionGhost=state.activity?.type==='practice'&&data().showGhost?data().ghosts[E.ghostKey(state.level,state.role,state.ngplus)]:null;
  r.ghostLabel=!!state.expeditionGhost;tick();
 }
 function onEvents(events){
  if(events.includes('route')&&campaign()&&!state.soloTransition){
   const xp=E.awardRoute(data(),state.role,state.level,state.ngplus);if(xp){saveProfile();showMiniToast('Rota elemental descoberta','Maestria +'+xp+' XP');}
  }
 }
 function tick(){
  if(!active()||!state.expeditionRun||player.dead)return;
  const a=state.expeditionRun,ms=elapsed()*1000;
  E.sample(a,ms,player,gameNow()<state.abilityUntil);
  if(ms-lastHudAt<180)return;lastHudAt=ms;
  const lines=[];
  if(state.levelData.soloNodes?.length)lines.push((state.levelData.soloKind===1?'Ative as runas em ordem com seu poder':'Recolha os três fragmentos')+` · ${a.nodes.length}/3`);
  lines.push('Sem morrer nesta fase'+(state.deaths===state.levelDeathsAtStart?' ✓':' —'));
  if(state.levelData.soloKind!==1)lines.push('Sem usar poder nesta tentativa'+(a.powers===0?' ✓':' —'));
  const par=Math.round(state.levelData.soloSpecial?90:45+state.level/30);lines.push('Concluir em até '+par+'s'+(elapsed()<=par?' ✓':' —'));
  if(state.levelData.soloRoute)lines.push('Explore a rota do seu elemento'+(a.routeClaimed?' ✓':' —'));
  if(state.ngplus)lines.push('Novo Jogo+ · '+state.levelData.ngModifier);
  if(a.ghostLabel)lines.push('Fantasma do melhor tempo ativo');
  const value=lines.join('\n');if(value!==lastHud){const list=$('#soloObjectiveLines');list.replaceChildren();for(const line of lines){const span=document.createElement('span');span.textContent=line;list.appendChild(span);}lastHud=value;}
 }
 function recordGhost(result){
  if(!active()||!state.expeditionRun)return;
  const a=state.expeditionRun,ms=elapsed()*1000;
  if(!a.traceOverflow&&a.trace.length<1800)a.trace.push([Math.round(ms),Math.round(player.x),Math.round(player.y),player.facing===-1?-1:1,gameNow()<state.abilityUntil?1:0]);
  E.saveGhost(data(),state.level,state.role,state.ngplus,a,result.time);
 }
 function complete(result){
  if(!campaign())return;recordGhost(result);
  const reward=E.awardClear(data(),state.role,state.levelData,state.expeditionRun,{...result,secrets:state.runStats.secrets},state.ngplus);
  const s=story();if(state.level%100===0&&state.level<1000&&!s.choices[state.level/100])s.pending=state.level/100;
  if(state.level===1000&&!state.ngplus)data().campaignComplete=true;
  if(reward.xp)showMiniToast('Maestria elemental','Maestria +'+reward.xp+' XP');saveProfile();
 }
 function pendingStory(){
  if(!campaign()||!story().pending)return;
  const region=story().pending;if(region<1||region>9||story().choices[region]){story().pending=null;return;}
  hideOverlay();openPauseMenu();$('#pauseMenu').classList.add('hidden');
  const scene=E.scenes[region-1];text('#expeditionStoryTitle',scene[0]);text('#expeditionStoryText',scene[1]);storyModal.classList.remove('hidden');$('#storyFreeBtn').focus();
 }
 function decide(value){
  const s=story();if(!E.choose(s,s.pending,value))return;
  saveProfile();storyModal.classList.add('hidden');closePauseMenu(true);
 }
 function leaveStory(){storyModal.classList.add('hidden');closePauseMenu(false);showMainMenu();}
 function draw(){
  if(!active()||!state.expeditionRun)return;
  const ld=state.levelData,a=state.expeditionRun,r=ld.soloRoute,c=ELEMENTS[state.role].color;
  if(r){
   const solids=E.solids(ld,a,state.role,gameNow()<state.abilityPhaseUntil);
   for(const p of solids){ctx.save();if(p===r.gate){ctx.fillStyle='#a46cff77';ctx.fillRect(p.x,p.y,p.w,p.h);ctx.strokeStyle='#ccb0ff';ctx.strokeRect(p.x,p.y,p.w,p.h);}else{drawPlatform(p);ctx.strokeStyle=c;ctx.lineWidth=2;ctx.strokeRect(p.x,p.y,p.w,p.h);}ctx.restore();}
   ctx.save();ctx.fillStyle=c;ctx.font='700 14px sans-serif';ctx.fillText('ROTA ELEMENTAL',165,612);
   if(!a.routeClaimed){ctx.translate(r.badge.x+14,r.badge.y+18);ctx.rotate(Math.PI/4);ctx.fillRect(-10,-10,20,20);ctx.strokeStyle='#fff';ctx.strokeRect(-10,-10,20,20);}ctx.restore();
   if(state.role==='air'&&a.routeUnlocked){ctx.save();ctx.strokeStyle='#b6efff99';for(let i=0;i<6;i++){ctx.beginPath();ctx.ellipse(440,300+i*60,90,10,0,0,Math.PI*2);ctx.stroke();}ctx.restore();}
  }
  for(const [i,n] of (ld.soloNodes||[]).entries()){
   ctx.save();ctx.fillStyle=a.nodes.includes(i)?'#c5ed91':'#edd18a';ctx.beginPath();ctx.arc(n.x+14,n.y+14,14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#21182c';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.fillText(String(i+1),n.x+14,n.y+20);ctx.restore();
  }
  const ghost=E.ghostPose(state.expeditionGhost,elapsed()*1000);
  if(ghost){ctx.save();ctx.globalAlpha=.28;drawCharacter(ghost.x,ghost.y,state.role,false,ghost.ability,false,{}, {facing:ghost.facing,vx:0,vy:0,onGround:false});ctx.restore();}
 }
 function drawLook(){
  if(!active())return;const m=data().mastery[state.role],look=Math.min(m.look,E.rank(m.xp));if(!look)return;
  const x=player.x,y=player.y,c=ELEMENTS[state.role].color;ctx.save();ctx.strokeStyle=c;ctx.fillStyle=c;ctx.lineWidth=3;
  if(look>=1){ctx.fillStyle='#f5df9b';ctx.fillRect(x+7,y+25,28,5);}
  if(look>=2){ctx.globalAlpha=.7;ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(x+4,y+23);ctx.lineTo(x-9,y+58);ctx.lineTo(x+17,y+47);ctx.closePath();ctx.fill();}
  if(look>=3){ctx.globalAlpha=.5;ctx.beginPath();ctx.ellipse(x+21,y+30,34,43,0,0,Math.PI*2);ctx.stroke();for(let i=0;i<4;i++){const t=(profile.settings.reducedMotion?0:elapsed()*2)+i*Math.PI/2;ctx.beginPath();ctx.arc(x+21+Math.cos(t)*36,y+28+Math.sin(t)*42,3,0,Math.PI*2);ctx.fill();}}
  ctx.restore();
 }
 $('#masteryBtn').onclick=open;$('#pauseMasteryBtn').onclick=open;$('#expeditionCloseBtn').onclick=close;
 $('#expeditionRole').onchange=refresh;$('#expeditionStoryCampaign').onchange=refresh;
 $('#ghostEnabled').onchange=event=>{data().showGhost=event.target.checked;state.expeditionGhost=active()&&state.activity?.type==='practice'&&data().showGhost?data().ghosts[E.ghostKey(state.level,state.role,state.ngplus)]:null;if(state.expeditionRun)state.expeditionRun.ghostLabel=!!state.expeditionGhost;lastHudAt=-Infinity;tick();saveProfile();};
 $('#ngplusBtn').onclick=()=>{if(unlocked()&&!loadNGSave()?.completed)startNGPlus();};
 $('#storyFreeBtn').onclick=()=>decide('free');$('#storySealBtn').onclick=()=>decide('seal');$('#storyLeaveBtn').onclick=leaveStory;
 hub.addEventListener('click',event=>{if(event.target===hub)close();});
 addEventListener('keydown',event=>{
  const target=!storyModal.classList.contains('hidden')?storyModal:!hub.classList.contains('hidden')?hub:null;if(!target)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();target===hub?close():leaveStory();}
  if(event.key==='Tab'){const items=[...target.querySelectorAll('button:not(:disabled),select,input')].filter(el=>el.getClientRects().length);const index=items.indexOf(document.activeElement);event.preventDefault();event.stopImmediatePropagation();items[(index+(event.shiftKey?-1:1)+items.length)%items.length]?.focus();}
 },true);
 window.ICESoloUI={begin,tick,onEvents,complete,finishPractice:recordGhost,pendingStory,draw,drawLook,refresh,unlocked,hide(){hub.classList.add('hidden');storyModal.classList.add('hidden');$('#soloObjectives').classList.add('hidden');}};
 refresh();
})();
