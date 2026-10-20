/* 0.0.9 activities and preference UI. Campaign writes stay in the game engine. */
(function(){
  'use strict';
  const modal=$('#journeyModal');let view='map',selected=1,pendingBinding=null,lastActivity=null,previousFocus=null;
  const labels={left:'Esquerda',right:'Direita',jump:'Pular',ability:'Poder',restart:'Reiniciar'};
  const icons={left:'◀',right:'▶',jump:'▲',ability:'✦'};
  function text(id,value){const el=$(id);if(el)el.textContent=value;}
  function hide(){modal.classList.add('hidden');previousFocus?.focus?.();}
  function show(kind){
    view=kind;previousFocus=document.activeElement;
    for(const [name,id] of [['map','#journeyMapView'],['daily','#journeyDailyView'],['result','#journeyResultView']])$(id).classList.toggle('hidden',name!==kind);
    text('#journeyTitle',kind==='map'?'Mapa da campanha':kind==='daily'?'Desafio diário':'Treino concluído');
    modal.classList.remove('hidden');$('#journeyCloseBtn').focus();
  }
  function campaignProgress(){
    profile.progress=ICEJourney.progress(profile.progress,savedCampaignLevel());return profile.progress;
  }
  function bestLabel(record){return record?`${Number(record.time).toFixed(2)}s · ${record.deaths} mortes`:'—';}
  function mapSelection(){
    const p=campaignProgress();text('#mapSelection',`Fase ${selected} · Recorde da campanha: ${bestLabel(p.records[selected])} · Recorde de treino: ${bestLabel(p.practice[selected])}`);
    for(const b of $('#mapLevels').querySelectorAll('button'))b.classList.toggle('selected',Number(b.dataset.level)===selected);
  }
  function renderMap(){
    const p=campaignProgress(),region=Number($('#mapRegion').value)||0,grid=$('#mapLevels');grid.replaceChildren();
    for(let level=region*100+1;level<region*100+101;level++){
      const b=document.createElement('button');b.type='button';b.dataset.level=String(level);b.disabled=level>p.unlocked;
      if(level<p.unlocked||p.records[level])b.classList.add('completed');
      const num=document.createElement('b');num.textContent=(level%100===0?'♛ ':'')+String(level).padStart(4,'0');num.setAttribute('data-i18n-ignore','');b.appendChild(num);
      const small=document.createElement('small');small.textContent=p.records[level]?p.records[level].time.toFixed(1)+'s':b.disabled?'🔒':'—';b.appendChild(small);
      b.setAttribute('aria-label','Fase '+level);b.onclick=()=>{selected=level;mapSelection();};grid.appendChild(b);
    }
    if(selected<region*100+1||selected>region*100+100)selected=Math.min(p.unlocked,region*100+1);
    $('#mapPlayBtn').disabled=selected>p.unlocked;mapSelection();
  }
  function openMap(){
    const p=campaignProgress();selected=p.unlocked;$('#mapRegion').value=String(Math.floor((selected-1)/100));$('#journeyRole').value=state.selectedRole;
    renderMap();show('map');
  }
  function openDaily(){
    const d=ICEJourney.daily();text('#dailyDescription',`${d.date} UTC · Fase ${d.level} · ${ELEMENTS[d.role].name}`);
    text('#dailyBest','Melhor resultado: '+bestLabel(profile.daily?.[d.date]));show('daily');window.ICE010UI?.loadBoard();
  }
  function start(type,level,role,ranking=null){
    if(type==='practice'&&Number(level)>campaignProgress().unlocked)return false;
    leaveMultiplayerSession();closePauseMenu(false);closeSettings(false);hide();hideCinematicScreens();appShell.classList.remove('hidden');
    state.dailyRun=null;state.dailyClock=null;state.dailyAbilityQueued=state.dailyRestartQueued=false;
    let daily=null;if(type==='daily'){daily=ranking?.spec||ICEJourney.daily();level=daily.level;role=daily.role;}
    state.activity={type,level:type==='tutorial'?1:Number(level)||1,role:ELEMENTS[role]?role:state.selectedRole,stage:0,power:false,coop:false,date:daily?.date,ranking,complete:false};
    lastActivity={...state.activity};state.mode='singleplayer';state.id='solo';state.slot=0;state.room=null;state.roomCode=null;state.networkPaused=false;state.deaths=0;
    state.role=state.activity.role;state.levelAttempts=new Map();if(type==='daily')createDailyRun(daily,()=>finish());else startLevel(state.activity.level);
    $('#activityStatus').classList.remove('hidden');
    text('#activityTitle',type==='tutorial'?'Tutorial':type==='daily'?'Desafio diário':'Treino');
    text('#activityHint',type==='daily'?'Sem relíquias, bônus ou armadilhas adaptativas.':type==='practice'?'Este treino não altera o progresso da campanha.':'Use os controles de movimento para chegar à primeira marca.');
    updateTutorial();return true;
  }
  function updateTutorial(){
    const a=state.activity;if(a?.type!=='tutorial'||a.complete)return;
    if(a.stage===0&&player.x>210)a.stage=1;
    if(a.stage===1&&player.x>510&&state.runStats.jumps>0)a.stage=2;
    if(a.stage===2&&a.power)a.stage=3;
    if(a.stage===3&&overlap(player,{x:1080,y:760,w:68,h:40})){a.coop=true;a.stage=4;}
    const hints=['Use os controles de movimento para chegar à primeira marca.','Pule o vão e alcance a plataforma elevada.','Use seu poder elemental perto do inimigo de treino.','Pise na primeira placa. O parceiro de treino ocupa a segunda.','As duas placas abriram a porta. Alcance a saída!'];
    text('#activityHint',hints[a.stage]);
  }
  function finish(){
    const a=state.activity;if(!a||a.complete||(a.type==='tutorial'&&a.stage<4))return;
    if(a.type==='daily'&&!state.dailyRun?.complete){if(!player.dead)state.dailyRun?.finish();return;}
    a.complete=true;state.running=false;inputController?.clear();sound?.play('complete',state.role);
    const result={time:Math.max(.01,a.type==='daily'?state.dailyRun.time:elapsed()),deaths:state.deaths};
    if(a.type==='tutorial')profile.tutorialCompleted=true;
    else if(a.type==='practice'){profile.progress=campaignProgress();ICEJourney.record(profile.progress.practice,a.level,result);}
    else if(a.type==='daily'){
      profile.daily=profile.daily||{};const old=profile.daily[a.date];
      if(!old||result.deaths<old.deaths||result.deaths===old.deaths&&result.time<old.time)profile.daily[a.date]={...result,level:a.level,role:a.role};
      const dates=Object.keys(profile.daily).sort();for(const day of dates.slice(0,Math.max(0,dates.length-60)))delete profile.daily[day];
    }
    saveProfile();$('#activityStatus').classList.add('hidden');text('#activityResult',`${result.time.toFixed(2)}s · ${result.deaths} mortes`);show('result');
    text('#journeyTitle',a.type==='tutorial'?'Tutorial concluído':a.type==='daily'?'Desafio concluído':'Treino concluído');
    window.ICE010UI?.dailyFinished(a,result);
  }
  function die(){
    const a=state.activity;if(!a||a.complete||player.dead||gameNow()<state.invulnUntil)return;
    if(a.type==='daily'){state.dailyRun?.die();return;}
    state.deaths++;sound?.play('death',state.role);
    if(a.type==='tutorial'){
      Object.assign(player,{x:a.stage>=3?1020:a.stage>=2?520:90,y:a.stage===2?684:734,vx:0,vy:0,dead:false});state.invulnUntil=gameNow()+600;
    }else{
      player.dead=true;state.running=false;
      setTimeout(()=>{if(state.activity===a&&state.mode==='singleplayer'&&!a.complete)startLevel(a.level);},600);
    }
    updateHud();
  }
  function refreshControls(){
    const list=$('#keyBindings');if(!list||!inputController)return;
    list.replaceChildren();
    for(const [action,codes] of Object.entries(inputController.bindings)){
      const b=document.createElement('button');b.type='button';b.dataset.binding=action;
      const label=document.createElement('span');label.textContent=labels[action];const key=document.createElement('kbd');key.setAttribute('data-i18n-ignore','');key.textContent=codes.map(ICEControls.label).join(' / ');
      b.append(label,key);b.classList.toggle('binding',pendingBinding===action);b.onclick=()=>{pendingBinding=action;text('#bindingStatus','Pressione a nova tecla. Escape cancela.');refreshControls();};list.appendChild(b);
    }
    const abilityKey=$('#abilityHud .ability-copy b');if(abilityKey){abilityKey.setAttribute('data-i18n-ignore','');abilityKey.textContent=inputController.bindings.ability.map(ICEControls.label).join(' / ');}
    $('#abilityHud')?.removeAttribute('title');
    profile.settings.touch=ICEControls.touch(profile.settings.touch);
    const selected=$('#touchButtonSelect').value||'left',cfg=profile.settings.touch[selected];
    for(const [suffix,key] of [['Size','size'],['X','x'],['Y','y']]){$('#touch'+suffix).value=cfg[key];text('#touch'+suffix+'Value',cfg[key]+(key==='size'?'px':'%'));}
    const preview=$('#touchLayoutPreview');preview.replaceChildren();
    for(const [key,v] of Object.entries(profile.settings.touch)){const dot=document.createElement('span');dot.textContent=icons[key];dot.style.cssText=`left:${v.x}%;top:${v.y}%;width:${v.size*.32}px;height:${v.size*.32}px`;preview.appendChild(dot);}
    applyTouchLayout();
    const audio=sound?.stats().config||{};$('#audioMuted').checked=!!audio.muted;
    for(const key of ['master','music','sfx']){const suffix=key[0].toUpperCase()+key.slice(1);$('#audio'+suffix).value=Math.round((audio[key]??.5)*100);text('#audio'+suffix+'Value',$('#audio'+suffix).value+'%');}
  }
  function applyTouchLayout(){
    const cfg=ICEControls.touch(profile.settings.touch);
    for(const [action,v] of Object.entries(cfg)){
      const selector=action==='ability'?'[data-touch-action="ability"]':'[data-touch-key="'+({left:'a',right:'d',jump:'w'}[action])+'"]';
      const b=$(selector);if(!b)continue;
      const half=v.size/2+8,x=Math.max(half,Math.min(innerWidth-half,innerWidth*v.x/100)),y=Math.max(half,Math.min(innerHeight-half,innerHeight*v.y/100));
      Object.assign(b.style,{position:'fixed',left:x+'px',top:y+'px',width:v.size+'px',height:v.size+'px',minWidth:'0',minHeight:'0',transform:'translate(-50%,-50%)',margin:'0'});
    }
  }
  $('#menuTutorialBtn').onclick=()=>start('tutorial',1,state.selectedRole);$('#menuMapBtn').onclick=openMap;$('#menuDailyBtn').onclick=openDaily;
  $('#mapRegion').onchange=renderMap;$('#mapPlayBtn').onclick=()=>start('practice',selected,$('#journeyRole').value);$('#dailyPlayBtn').onclick=()=>start('daily');
  $('#journeyCloseBtn').onclick=()=>{hide();if(view==='result')showMainMenu();};modal.addEventListener('click',e=>{if(e.target===modal)$('#journeyCloseBtn').click();});
  $('#activityExitBtn').onclick=pauseToMainMenu;$('#activityMenuBtn').onclick=()=>{hide();showMainMenu();};$('#activityRetryBtn').onclick=()=>{
    if(lastActivity?.ranking){hide();showMainMenu();openDaily();return;}
    start(lastActivity.type,lastActivity.level,lastActivity.role);
  };
  for(let i=0;i<10;i++){const o=document.createElement('option');o.value=String(i);o.textContent=castleRegion(i*100+1).name;$('#mapRegion').appendChild(o);}
  $('#resetControlsBtn').onclick=()=>{pendingBinding=null;profile.settings.controls=null;profile.settings.touch=null;saveProfile();text('#bindingStatus','Controles restaurados.');};
  $('#touchButtonSelect').onchange=refreshControls;
  for(const [suffix,key] of [['Size','size'],['X','x'],['Y','y']])$('#touch'+suffix).addEventListener('input',e=>{const cfg=ICEControls.touch(profile.settings.touch);cfg[$('#touchButtonSelect').value][key]=Number(e.target.value);profile.settings.touch=cfg;saveProfile();});
  for(const key of ['master','music','sfx']){const suffix=key[0].toUpperCase()+key.slice(1);$('#audio'+suffix).addEventListener('input',e=>{profile.settings.audio={...sound.stats().config,[key]:Number(e.target.value)/100};saveProfile();});}
  $('#audioMuted').onchange=e=>{profile.settings.audio={...sound.stats().config,muted:e.target.checked};saveProfile();};$('#audioPreviewBtn').onclick=()=>{sound?.unlock();sound?.play('ability',state.selectedRole);};
  addEventListener('keydown',e=>{
    if(pendingBinding){e.preventDefault();e.stopImmediatePropagation();
      if(e.code==='Escape'){pendingBinding=null;text('#bindingStatus','Alteração cancelada.');refreshControls();return;}
      if(!inputController.bind(pendingBinding,e.code)){text('#bindingStatus','Essa tecla está reservada ou já está em uso.');return;}
      profile.settings.controls=inputController.bindings;pendingBinding=null;saveProfile();text('#bindingStatus','Controles salvos.');return;
    }
    if(!modal.classList.contains('hidden')){
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();$('#journeyCloseBtn').click();}
      if(e.key==='Tab'){const all=[...modal.querySelectorAll('button:not(:disabled),select')].filter(el=>el.getClientRects().length);const at=all.indexOf(document.activeElement),next=(at+(e.shiftKey?-1:1)+all.length)%all.length;e.preventDefault();all[next]?.focus();}
    }
  },true);
  addEventListener('resize',applyTouchLayout);addEventListener('pointerdown',()=>sound?.unlock(),{capture:true});addEventListener('keydown',()=>sound?.unlock(),{capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){inputController?.clear();sound?.suspend();}});
  window.ICEFeatures={start,finish,die,updateTutorial,refreshControls,openMap,openDaily,dailyLimit(){text('#activityHint','Limite de 10 minutos atingido. Reinicie o desafio.');},cancelBinding(){pendingBinding=null;}};sound?.configure(profile.settings.audio);refreshControls();
})();
