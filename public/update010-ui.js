/* 0.0.10 quality, connection diagnostics and opt-in verified daily rankings. */
(function(){
  'use strict';
  const modal=$('#connectionModal');let focusBefore=null,resumeAfter=false,diagnosticSequence=0,rankingSequence=0;
  const text=(id,value)=>{const element=$(id);if(element)element.textContent=value;};
  function request(event,payload={},timeout=4000){
    return new Promise(resolve=>{
      if(!socket.connected)return resolve({ok:false,code:'OFFLINE'});
      let settled=false;const timer=setTimeout(()=>{settled=true;resolve({ok:false,code:'TIMEOUT'});},timeout);
      socket.emit(event,payload,result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result||{ok:false});});
    });
  }
  function secret(){
    const key='infinity-castle-elements-ranking-id-v1';let value=persistentGet(key);
    if(!/^[a-f0-9]{64}$/.test(value||'')){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);value=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');persistentSet(key,value);}
    return value;
  }
  function connectionLabel(){return !socket.connected?'Offline':serverCompatibility?.status==='compatible'?'Online':serverCompatibility?.status==='server-outdated'?'Servidor em atualização':serverCompatibility?.status==='client-outdated'?'Multiplayer incompatível':'Verificando conexão';}
  async function refreshDiagnostics(){
    const sequence=++diagnosticSequence;const started=performance.now();
    text('#connectionState',connectionLabel());text('#connectionClient',APP_VERSION);text('#connectionServer',serverCompatibility?.serverVersion||'—');text('#connectionProtocol',MULTIPLAYER_PROTOCOL+' / '+(serverCompatibility?.protocol||'—'));text('#connectionRoom',state.roomCode||'—');text('#connectionLatency','—');
    const result=await request('diagnostics',{},2500);
    if(sequence!==diagnosticSequence)return;
    if(result.ok){setServerCompatibility(result);text('#connectionServer',result.serverVersion);text('#connectionProtocol',MULTIPLAYER_PROTOCOL+' / '+result.protocolVersion);text('#connectionLatency',Math.round(performance.now()-started)+' ms');}
    text('#connectionState',connectionLabel());text('#connectionMessage',multiplayerCompatibilityError()||(result.ok?'Conexão verificada.':socket.connected?'O servidor não respondeu ao diagnóstico.':'Servidor multiplayer indisponível. Verifique sua internet.'));
  }
  function openDiagnostics(){
    focusBefore=document.activeElement;resumeAfter=gameplayVisible()&&!state.paused;if(resumeAfter)openPauseMenu();
    modal.classList.remove('hidden');$('#connectionCloseBtn').focus();refreshDiagnostics();
  }
  function closeDiagnostics(){diagnosticSequence++;modal.classList.add('hidden');if(resumeAfter)closePauseMenu(true);resumeAfter=false;focusBefore?.focus?.();}
  for(const id of ['#menuConnectionPill','#connectionPill','#pauseConnectionBtn'])$(id)?.addEventListener('click',openDiagnostics);
  $('#connectionCloseBtn').onclick=closeDiagnostics;$('#connectionRefreshBtn').onclick=refreshDiagnostics;
  $('#connectionReconnectBtn').onclick=()=>{text('#connectionMessage','Reconectando…');if(typeof socket.connect==='function'){socket.disconnect();socket.connect();}else text('#connectionMessage','Servidor multiplayer indisponível. Verifique sua internet.');};
  modal.addEventListener('click',event=>{if(event.target===modal)closeDiagnostics();});
  for(const event of ['connect','disconnect','protocol-info'])socket.on(event,()=>{if(!modal.classList.contains('hidden'))refreshDiagnostics();});
  addEventListener('keydown',event=>{
    if(modal.classList.contains('hidden'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeDiagnostics();}
    if(event.key==='Tab'){const buttons=[...modal.querySelectorAll('button:not(:disabled)')];const index=buttons.indexOf(document.activeElement);event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}
  },true);
  $('#settingQuality').onchange=event=>{profile.settings.quality=ICEMechanics.qualityName(event.target.value);saveProfile();text('#qualityStatus','Qualidade atual: '+({low:'Baixa',medium:'Média',high:'Alta'}[qualityController.name]));};
  function showBoard(result){
    const list=$('#dailyBoard');list.replaceChildren();
    if(!result.ok){text('#rankingStatus','Ranking indisponível. Você pode jogar localmente.');return;}
    for(const entry of result.entries||[]){const item=document.createElement('li'),name=document.createElement('b'),score=document.createElement('span');name.setAttribute('data-i18n-ignore','');name.textContent=entry.name;score.textContent=`${entry.time.toFixed(2)}s · ${entry.deaths} mortes`;item.append(name,score);list.appendChild(item);}
    text('#rankingStatus',result.entries?.length?'Resultados verificados pelo servidor.':'Nenhum resultado publicado hoje.');
  }
  async function loadBoard(){const sequence=++rankingSequence;const result=await request('daily-board',{},2500);if(sequence===rankingSequence)showBoard(result);}
  $('#rankingName').value=profile.rankingName||'';
  $('#refreshBoardBtn').onclick=loadBoard;
  $('#rankedDailyBtn').onclick=async()=>{
    const button=$('#rankedDailyBtn');button.disabled=true;text('#rankingStatus','Preparando desafio verificado…');
    try{
      const name=String($('#rankingName').value||'Jogador').trim().slice(0,24)||'Jogador';profile.rankingName=name;saveProfile();
      const result=await request('daily-start',{secret:secret(),name,protocol:MULTIPLAYER_PROTOCOL});
      if(!result.ok){text('#rankingStatus','Ranking indisponível. Você pode jogar localmente.');return;}
      if($('#journeyModal').classList.contains('hidden')||$('#journeyDailyView').classList.contains('hidden'))return;
      ICEFeatures.start('daily',result.spec.level,result.spec.role,{token:result.token,spec:result.spec});
    }finally{button.disabled=false;}
  };
  async function dailyFinished(activity,result){
    text('#rankingResult','');
    if(activity.type!=='daily'||!activity.ranking)return;
    text('#rankingResult','Validando resultado no servidor…');
    const replay=state.dailyRun.replay();
    const response=await request('daily-submit',{secret:secret(),token:activity.ranking.token,replay,protocol:MULTIPLAYER_PROTOCOL},15000);
    if(state.activity!==activity)return;
    if(response.ok){text('#rankingResult',response.rank?'Posição no ranking: '+response.rank:'Resultado verificado. Fora das 200 primeiras posições.');if(response.board)showBoard(response.board);}
    else text('#rankingResult',response.code==='RATE_LIMIT'?'O servidor está ocupado. Seu resultado local foi salvo.':'O resultado não foi publicado. Seu recorde local foi salvo.');
  }
  window.ICE010UI={request,openDiagnostics,loadBoard,dailyFinished};
})();
