const APP_VERSION = String(window.electronAPI?.version || window.ICE_APP_VERSION || '0.0.6').trim() || '0.0.6';
const DEFAULT_MULTIPLAYER_SERVER_URL = 'https://infinity-castle-elements-server-production.up.railway.app';
const MULTIPLAYER_SERVER_URL = String(window.electronAPI?.multiplayerUrl || window.ICE_MULTIPLAYER_SERVER_URL || DEFAULT_MULTIPLAYER_SERVER_URL).trim();
function createOfflineSocket(){
  const handlers=new Map();
  return {
    connected:false,id:null,
    on(event,fn){if(!handlers.has(event))handlers.set(event,[]);handlers.get(event).push(fn);return this;},
    off(event,fn){if(!handlers.has(event))return this;handlers.set(event,handlers.get(event).filter(x=>x!==fn));return this;},
    once(event,fn){const wrap=(...args)=>{this.off(event,wrap);fn(...args);};return this.on(event,wrap);},
    emit(event,...args){
      const ack=typeof args[args.length-1]==='function'?args[args.length-1]:null;
      if(ack&&['create-room','join-room'].includes(event))setTimeout(()=>ack({ok:false,error:'Servidor multiplayer indisponível. Verifique sua internet.'}),0);
      return this;
    }
  };
}
const socket = typeof window.io==='function'
  ? window.io(MULTIPLAYER_SERVER_URL,{transports:['websocket','polling'],reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:800,timeout:10000})
  : createOfflineSocket();
const $ = s => document.querySelector(s);
document.querySelectorAll('[data-app-version]').forEach(el=>{el.textContent=APP_VERSION;});
const lobby = $('#lobby'), roomEl = $('#room'), gameWrap = $('#gameWrap');
const appShell=$('#appShell'),studioSplash=$('#studioSplash'),titleScreen=$('#titleScreen'),mainMenu=$('#mainMenu'),exitScreen=$('#exitScreen');
const canvas = $('#game'), ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const ELEMENTS = {
  earth: {name:'Terra',icon:'🪨',color:'#a8c66c',accent:'#6f5139',accel:1450,max:330,gravity:1580,jump:-595,ability:'Raízes do Abismo'},
  air: {name:'Ar',icon:'💨',color:'#9bdcff',accent:'#e9f8ff',accel:1620,max:365,gravity:1240,jump:-645,ability:'Mini Furacão'},
  light: {name:'Luz',icon:'☀️',color:'#ffe477',accent:'#fff8d0',accel:1520,max:350,gravity:1450,jump:-620,ability:'Coroa Solar'},
  darkness: {name:'Escuridão',icon:'🌑',color:'#a46cff',accent:'#241233',accel:1540,max:345,gravity:1480,jump:-615,ability:'Fogo Negro'}
};
const ABILITY_RULES = {
  earth:{duration:1900,cooldown:5000,pulse:850,radius:330,maxHits:2,label:'RAÍZES'},
  air:{duration:2200,cooldown:5000,pulse:0,radius:46,maxHits:2,label:'FURACÃO'},
  light:{duration:2800,cooldown:5000,pulse:800,radius:155,maxHits:3,label:'AURA SOLAR'},
  darkness:{duration:2600,cooldown:5000,pulse:750,radius:120,maxHits:2,label:'FOGO NEGRO'}
};
const SHOP_ITEMS = {
  shield:{cost:12,type:'boost'}, speed:{cost:10,type:'boost'}, jump:{cost:10,type:'boost'},
  crown:{cost:40,type:'cosmetic'}, aura:{cost:60,type:'cosmetic'}
};

const RELICS = {
  fracturedHeart:{name:'Coração Trincado',icon:'🫀',desc:'Absorve uma morte por fase. Depois se cala até a próxima sala.'},
  windstep:{name:'Passo do Vendaval',icon:'🪽',desc:'+8% de velocidade máxima e aceleração.'},
  abyssFeather:{name:'Pena do Abismo',icon:'🪶',desc:'+8% de força de salto.'},
  chronoglass:{name:'Vidro Cronal',icon:'⌛',desc:'Reduz em 10% a recarga do poder elemental.'},
  greedEye:{name:'Olho da Avareza',icon:'👁️',desc:'+25% de moedas recebidas.'},
  seerMark:{name:'Marca do Vidente',icon:'◉',desc:'Revela melhor salas secretas e anomalias.'}
};
const ACHIEVEMENTS = {
  firstDeath:{name:'Bem-vindo ao Castelo',desc:'Morra pela primeira vez.'},
  death100:{name:'Especialista em Sofrer',desc:'Acumule 100 mortes.'},
  jokerClean:{name:'Coringa? Que Coringa?',desc:'Supere uma Fase Coringa sem morrer nela.'},
  firstSecret:{name:'Isso não estava no mapa',desc:'Encontre uma sala secreta.'},
  firstBoss:{name:'Quebrou a Coroa',desc:'Derrote seu primeiro guardião.'},
  phase666:{name:'NÃO OLHE PARA TRÁS',desc:'Entre na sala 666.'},
  hunted:{name:'Ele saiu do fundo',desc:'Sobreviva a uma sala com o Perseguidor ativo.'},
  chaosSurvivor:{name:'Quatro contra o impossível',desc:'Supere uma sala no Modo Caos.'},
  thousand:{name:'O Castelo Acabou?',desc:'Chegue ao fim das 1000 salas.'}
};
const JOKER_MUTATORS = ['reverse','blackout','heavy','float','mirror','closing','echo'];
const RANK_ORDER = ['S','A','B','C','D','CASTELO TE ODEIA'];

const state = {
  id: null, roomCode: null, role: 'earth', selectedRole: 'earth', slot: 0, ready: false, level: 1, deaths: 0,
  mode: 'menu', soloResetPending: false, soloTransition: false,
  running: false, room: null, remotePlayers: new Map(), lastNet: 0, lastGoalSent: false,
  levelData: null, trapState: new Map(), particles: [], levelStart: 0,
  bossCharge: 0, bossDefeated: false, lastRuneSent: null, abilityStartedAt: 0, abilityUntil: 0,
  abilityCooldownUntil:0, abilityPhaseUntil:0, abilityLastPulse:0, abilityHits:0, abilityRootFx:null,
  invulnUntil: 0, levelAttempts: new Map(), attempt: 1, screenShake: 0,
  activeBoosts:{shield:false,speed:false,jump:false}, shopOpen:false, shopTimer:null, lastRewardedLevel:0,
  paused:false, pauseWasRunning:false, settingsFromPause:false, setupKind:'singleplayer', lastChaosSealSent:false,
  levelDeathsAtStart:0, replayBuffer:[], deathReplay:null, relicGuardUsed:false, pursuer:null,
  runStats:{jumps:0,trapTriggers:0,secrets:0}, lastLandingX:null, lastWhisperAt:0
};

const SOLO_SAVE_KEY = 'infinity-castle-elements-solo-v1';
const MULTI_SAVE_KEY = 'infinity-castle-elements-multiplayer-v1';
const CHAOS_SAVE_KEY = 'infinity-castle-elements-chaos-v1';
const LEGACY_SOLO_SAVE_KEY = 'terra-ar-castelo-infinito-solo-v1';
const PROFILE_KEY = 'infinity-castle-elements-profile-v1';

function persistentGet(key){
  try{
    const api=typeof window!=='undefined'?window.electronAPI:null;
    if(api?.storageGet){
      const nativeValue=api.storageGet(key);
      if(nativeValue!==null&&nativeValue!==undefined&&nativeValue!=='')return nativeValue;
      const legacy=localStorage.getItem(key);
      if(legacy!==null&&legacy!==undefined){api.storageSet(key,legacy);return legacy;}
      return null;
    }
    return localStorage.getItem(key);
  }catch{return null;}
}
function persistentSet(key,value){
  const text=String(value??'');
  try{localStorage.setItem(key,text);}catch{}
  try{if(typeof window!=='undefined'&&window.electronAPI?.storageSet)window.electronAPI.storageSet(key,text);}catch{}
}
function persistentRemove(key){
  try{localStorage.removeItem(key);}catch{}
  try{if(typeof window!=='undefined'&&window.electronAPI?.storageRemove)window.electronAPI.storageRemove(key);}catch{}
}

function setConnectionStatus(online){
  for(const id of ['#connectionPill','#menuConnectionPill']){const el=$(id);if(!el)continue;el.textContent=online?'● Online':'● Offline';el.style.color=online?'#55e6a5':'#ff7893';}
}
socket.on('connect', () => setConnectionStatus(true));
socket.on('disconnect', () => setConnectionStatus(false));

document.querySelectorAll('.character-choice').forEach(btn=>btn.addEventListener('click',()=>selectElement(btn.dataset.element)));

let desktopUpdateState=null;
let updateDismissed=false;

function updateStatusMessage(s){
  const current=s?.currentVersion||APP_VERSION;
  if(!s)return `Versão atual ${current}`;
  if(s.status==='checking')return 'Verificando atualizações...';
  if(s.status==='available')return `Nova versão ${s.latestVersion} disponível · instalada ${current}`;
  if(s.status==='downloading')return `Baixando versão ${s.latestVersion} · ${s.progress||0}%`;
  if(s.status==='downloaded')return `Versão ${s.latestVersion} pronta para instalar`;
  if(s.status==='portable-opened')return `Download da versão ${s.latestVersion} aberto no navegador`;
  if(s.status==='up-to-date')return `Você está na versão mais recente (${current})`;
  if(s.status==='error')return `Não foi possível verificar: ${s.error||'erro desconhecido'}`;
  return `Versão atual ${current}`;
}
function renderUpdateState(s){
  if(!s)return;desktopUpdateState=s;
  const badge=$('#menuUpdateBadge'),settingsText=$('#updateSettingsText');
  if(settingsText)settingsText.textContent=updateStatusMessage(s);
  if(badge){
    const show=s.status==='available'||s.status==='downloading'||s.status==='downloaded'||s.status==='error';
    badge.classList.toggle('hidden',!show);
    badge.textContent=s.status==='error'?'⚠ Falha na atualização':
      s.status==='downloaded'?'⬇ Atualização pronta':
      s.status==='downloading'?(`⬇ Baixando ${s.progress||0}%`):(`⬇ Atualização ${s.latestVersion||''}`);
  }
  const current=$('#updateCurrentVersion'),latest=$('#updateLatestVersion'),notes=$('#updateNotes'),status=$('#updateStatusText');
  if(current)current.textContent=s.currentVersion||APP_VERSION;
  if(latest)latest.textContent=s.latestVersion||'—';
  if(notes)notes.textContent=s.notes||'Correções, melhorias e ajustes da nova versão.';
  if(status)status.textContent=s.status==='error'?(s.error||'Falha ao verificar atualização.'):
    s.installMode==='portable'?'Você está usando a versão Portable. O download da nova versão será aberto para substituição manual.':
    s.status==='downloaded'?'Download concluído. Seus saves ficam preservados. Clique em Reiniciar e instalar.':
    s.status==='downloading'?'Baixando a atualização em segundo plano... Não feche o jogo.':
    'A atualização será baixada e instalada sem apagar seus saves.';
  const progressWrap=$('#updateProgressWrap'),percent=$('#updateProgressPercent'),bar=$('#updateProgressBar'),progressText=$('#updateProgressText');
  const showProgress=s.status==='downloading'||s.status==='downloaded';
  progressWrap?.classList.toggle('hidden',!showProgress);
  if(percent)percent.textContent=(s.progress||0)+'%';
  if(bar?.style)bar.style.width=(s.progress||0)+'%';
  if(progressText)progressText.textContent=s.status==='downloaded'?'Download concluído':'Baixando atualização...';
  const updateBtn=$('#updateNowBtn'),installBtn=$('#installUpdateBtn');
  if(updateBtn){
    updateBtn.classList.toggle('hidden',s.status==='downloaded');
    updateBtn.disabled=s.status==='downloading'||s.status==='checking'||s.status==='up-to-date';
    updateBtn.textContent=s.status==='error'?'Tentar novamente':
      s.installMode==='portable'?'Baixar nova versão':
      s.status==='downloading'?'Baixando...':'Atualizar agora';
  }
  if(installBtn){
    installBtn.classList.toggle('hidden',s.status!=='downloaded'||s.installMode!=='installer');
    if(s.status!=='downloaded'){installBtn.disabled=false;installBtn.textContent='Reiniciar e instalar';}
  }

  // IMPORTANTE: não chama openUpdateModal() daqui para evitar recursão infinita.
  // Apenas torna o modal visível quando a notificação deve aparecer.
  const shouldAutoOpen=(s.status==='available'&&!updateDismissed)||s.status==='downloaded'||s.status==='error';
  if(shouldAutoOpen&&mainMenu&&!mainMenu.classList.contains('hidden')){
    $('#updateModal')?.classList.remove('hidden');
  }
}
function openUpdateModal(resetDismissed=true){
  if(resetDismissed)updateDismissed=false;
  if(!desktopUpdateState||!['available','downloading','downloaded','portable-opened','error'].includes(desktopUpdateState.status))return;
  // O estado já foi renderizado por renderUpdateState(). Aqui só abrimos a janela.
  // Na 0.0.1 este método chamava renderUpdateState(), que chamava este método de novo
  // e causava um loop antes do modal aparecer.
  $('#updateModal')?.classList.remove('hidden');
}
function closeUpdateModal(){
  updateDismissed=true;
  $('#updateModal')?.classList.add('hidden');
}
async function checkUpdatesFromUI(){
  if(!window.electronAPI?.checkForUpdates)return;
  updateDismissed=false;
  try{renderUpdateState(await window.electronAPI.checkForUpdates());}catch{}
}
async function downloadDesktopUpdate(){
  if(!window.electronAPI?.downloadUpdate)return;
  const btn=$('#updateNowBtn');
  if(desktopUpdateState?.status==='error'){
    try{
      const checked=await window.electronAPI.checkForUpdates?.();
      if(checked)renderUpdateState(checked);
      if(checked?.status!=='available')return;
    }catch(error){
      renderUpdateState({...desktopUpdateState,status:'error',error:String(error?.message||error||'Falha ao verificar atualização.')});
      return;
    }
  }
  if(btn){btn.disabled=true;btn.textContent='Preparando download...';}
  try{
    const next=await window.electronAPI.downloadUpdate();
    renderUpdateState(next);
    openUpdateModal(false);
  }catch(error){
    renderUpdateState({...desktopUpdateState,status:'error',error:String(error?.message||error||'Falha ao baixar atualização.')});
    openUpdateModal(false);
  }finally{
    if(btn&&desktopUpdateState?.status==='available'){btn.disabled=false;btn.textContent='Atualizar agora';}
  }
}
async function installDesktopUpdate(){
  if(!window.electronAPI?.installUpdate)return;
  const btn=$('#installUpdateBtn');if(btn){btn.disabled=true;btn.textContent='Reiniciando...';}
  try{await window.electronAPI.installUpdate();}catch{if(btn){btn.disabled=false;btn.textContent='Reiniciar e instalar';}}
}
function maybeShowUpdateNotice(){
  if(desktopUpdateState?.status==='available'&&!updateDismissed)openUpdateModal(false);
  else if(desktopUpdateState?.status==='downloaded')openUpdateModal(false);
}

let splashTimer=null;
function hideCinematicScreens(){for(const el of [studioSplash,titleScreen,mainMenu,exitScreen])el?.classList.add('hidden');}
function showTitleScreen(){
  if(!titleScreen)return;
  clearTimeout(splashTimer);studioSplash?.classList.add('leaving');
  setTimeout(()=>{studioSplash?.classList.add('hidden');studioSplash?.classList.remove('leaving');titleScreen.classList.remove('hidden');},260);
}
function showMainMenu(){
  clearTimeout(splashTimer);state.running=false;state.mode='menu';state.shopOpen=false;closeShop();
  if(typeof closePauseMenu==='function')closePauseMenu(false);if(typeof closeSettings==='function')closeSettings(false);
  hideCinematicScreens();mainMenu?.classList.remove('hidden');appShell?.classList.add('hidden');
  document.body?.classList.remove('game-active','setup-active','chaos-active','phase-666');document.body?.classList.add('boot-sequence');
  setTimeout(maybeShowUpdateNotice,180);
}
function showSetup(kind){
  closeShop();closeSettings(false);closePauseMenu(false);
  state.shopOpen=false;state.setupKind=kind;
  hideCinematicScreens();document.body?.classList.remove('boot-sequence','game-active','chaos-active','phase-666');document.body?.classList.add('setup-active');appShell?.classList.remove('hidden');
  lobby?.classList.remove('hidden');roomEl?.classList.add('hidden');roomEl?.classList.remove('chaos-room');gameWrap?.classList.add('hidden');
  state.running=false;state.mode='menu';$('#backToMenuBtn').style.display='';
  const solo=kind==='singleplayer',multi=kind==='multiplayer',chaos=kind==='chaos';
  $('#soloSetup').classList.toggle('hidden',!solo);$('#multiSetup').classList.toggle('hidden',!multi);$('#chaosSetup').classList.toggle('hidden',!chaos);
  const t=uiT();$('#setupEyebrow').textContent=(chaos?'MODO CAOS · 4 ELEMENTOS':(solo?t.single:t.multi).toUpperCase())+' · '+t.choose;
  $('#errorText').textContent='';refreshSoloSaveButton();refreshMultiplayerSaveButton();refreshChaosSaveButton();refreshChaosSaveButton();
}
function showExitScreen(){
  if(window.electronAPI?.quit){window.electronAPI.quit();return;}
  hideCinematicScreens();appShell?.classList.add('hidden');exitScreen?.classList.remove('hidden');document.body?.classList.add('boot-sequence');
}
async function toggleAppFullscreen(){
  try{
    if(window.electronAPI?.toggleFullscreen){await window.electronAPI.toggleFullscreen();await updateFullscreenButton();return;}
    if(fullscreenElement())return await exitFullscreen();
    const target=document.documentElement||document.body;if(target?.requestFullscreen)await target.requestFullscreen();else if(target?.webkitRequestFullscreen)target.webkitRequestFullscreen();
  }catch{}
}
function gameplayVisible(){return !!gameWrap&&!gameWrap.classList.contains('hidden')&&state.mode!=='menu';}
function openPauseMenu(){
  if(!gameplayVisible()||state.shopOpen||state.paused)return;
  state.pauseWasRunning=state.running;state.running=false;state.paused=true;
  const msg=$('#pauseMessage');if(msg)msg.textContent='';
  $('#pauseMenu')?.classList.remove('hidden');document.body?.classList.add('game-paused');
}
function closePauseMenu(resume=true){
  const wasRunning=state.pauseWasRunning;
  state.paused=false;state.pauseWasRunning=false;
  $('#pauseMenu')?.classList.add('hidden');document.body?.classList.remove('game-paused');
  if(resume&&wasRunning&&gameplayVisible()){state.running=true;ensureGameplayDisplayMode();}
}
function togglePauseMenu(){if(state.paused)closePauseMenu(true);else openPauseMenu();}
function saveFromPause(){
  saveProfile();
  const t=uiT();
  if(state.mode==='singleplayer'){
    saveSoloProgress(false);
    if($('#pauseMessage'))$('#pauseMessage').textContent=`${t.saved} Fase ${state.level} pronta para continuar.`;
  }else if(state.mode==='multiplayer'){
    saveMultiplayerProgress(false);
    if($('#pauseMessage'))$('#pauseMessage').textContent=`Multiplayer salvo na fase ${state.level}. Ao continuar será criada uma nova sala nessa fase.`;
  }else if(state.mode==='chaos'){
    saveChaosProgress(false);
    if($('#pauseMessage'))$('#pauseMessage').textContent=`Modo Caos salvo na fase ${state.level}. Uma nova sala de 4 jogadores poderá continuar daqui.`;
  }else if($('#pauseMessage'))$('#pauseMessage').textContent=t.profileSaved;
}
function leaveMultiplayerSession(){
  if(state.mode!=='multiplayer'&&state.mode!=='chaos'&&!state.roomCode)return;
  try{socket.disconnect();setTimeout(()=>socket.connect(),80);}catch{}
  state.room=null;state.roomCode=null;state.remotePlayers.clear();state.ready=false;
}
function pauseToMainMenu(){closeSettings(false);closePauseMenu(false);clearTimeout(state.shopTimer);closeShop();leaveMultiplayerSession();showMainMenu();}
function pauseToDesktop(){if(window.electronAPI?.quit)window.electronAPI.quit();else showExitScreen();}
$('#menuSingleBtn').onclick=()=>{closeShop();showSetup('singleplayer');};
$('#menuMultiBtn').onclick=()=>{closeShop();showSetup('multiplayer');};
$('#menuChaosBtn').onclick=()=>{closeShop();showSetup('chaos');};
$('#menuSettingsBtn').onclick=()=>openSettings();
if($('#menuChronicleBtn'))$('#menuChronicleBtn').onclick=openChronicle;
if($('#closeChronicleBtn'))$('#closeChronicleBtn').onclick=closeChronicle;
$('#chronicleModal')?.addEventListener('click',e=>{if(e.target?.id==='chronicleModal')closeChronicle();});
$('#menuExitBtn').onclick=showExitScreen;
$('#exitBackBtn').onclick=showMainMenu;
$('#backToMenuBtn').onclick=showMainMenu;
$('#titleContinueBtn').onclick=e=>{e.stopPropagation();showMainMenu();};
titleScreen?.addEventListener('click',showMainMenu);
studioSplash?.addEventListener('click',showTitleScreen);
addEventListener('keydown',e=>{
  if((e.key==='Enter'||e.key===' ')&&studioSplash&&!studioSplash.classList.contains('hidden')){e.preventDefault();showTitleScreen();return;}
  if(e.key==='Enter'&&titleScreen&&!titleScreen.classList.contains('hidden')){e.preventDefault();showMainMenu();return;}
  if(e.key==='Escape'){
    const chronicleOpen=!$('#chronicleModal')?.classList.contains('hidden');
    if(chronicleOpen){e.preventDefault();closeChronicle();return;}
    const settingsOpen=!$('#settingsModal')?.classList.contains('hidden');
    if(settingsOpen){e.preventDefault();closeSettings();return;}
    if(state.paused){e.preventDefault();closePauseMenu(true);return;}
    if(gameplayVisible()&&!state.shopOpen){e.preventDefault();openPauseMenu();return;}
  }
});
$('#soloBtn').onclick = () => startSolo(false);
$('#continueSoloBtn').onclick = () => startSolo(true);
$('#createBtn').onclick = () => { state.mode='multiplayer'; socket.emit('create-room', { name: playerName(), element: state.selectedRole, mode:'multiplayer' }, handleJoin); };
$('#continueMultiBtn').onclick = continueMultiplayer;
$('#joinBtn').onclick = () => { state.mode='multiplayer'; socket.emit('join-room', { code: $('#roomCodeInput').value, name: playerName(), element: state.selectedRole, mode:'multiplayer' }, handleJoin); };
$('#createChaosBtn').onclick = () => { state.mode='chaos'; socket.emit('create-room', { name: playerName(), element: state.selectedRole, mode:'chaos' }, handleJoin); };
$('#continueChaosBtn').onclick = continueChaos;
$('#joinChaosBtn').onclick = () => { state.mode='chaos'; socket.emit('join-room', { code: $('#chaosRoomCodeInput').value, name: playerName(), element: state.selectedRole, mode:'chaos' }, handleJoin); };
$('#roomCodeInput').addEventListener('input', e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
$('#chaosRoomCodeInput').addEventListener('input', e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
$('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(state.roomCode); $('#copyCode').textContent='Copiado!'; setTimeout(()=>$('#copyCode').textContent='Copiar código',900); } catch{} };
$('#readyBtn').onclick = () => { state.ready = !state.ready; socket.emit('ready', { ready: state.ready }); $('#readyBtn').textContent = state.ready ? 'Cancelar pronto' : 'Estou pronto'; };
$('#roomBackToMenuBtn').onclick = () => { leaveMultiplayerSession(); showMainMenu(); };
$('#restartBtn').onclick = restartGame;

// Tela cheia: mantém HUD, controles e canvas juntos.
const fullscreenBtn = $('#fullscreenBtn');
function fullscreenElement(){ return document.fullscreenElement || document.webkitFullscreenElement || null; }
async function enterFullscreen(){
  try {
    if (gameWrap.requestFullscreen) await gameWrap.requestFullscreen();
    else if (gameWrap.webkitRequestFullscreen) gameWrap.webkitRequestFullscreen();
  } catch (err) {
    showOverlay('TELA CHEIA BLOQUEADA','O navegador não permitiu entrar em tela cheia. Você também pode usar F11.',900);
  }
}
async function exitFullscreen(){
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch {}
}
async function toggleFullscreen(){
  if(window.electronAPI?.toggleFullscreen){await window.electronAPI.toggleFullscreen();await updateFullscreenButton();return;}
  if (fullscreenElement()) await exitFullscreen();
  else await enterFullscreen();
}
async function updateFullscreenButton(){
  if (!fullscreenBtn) return;
  let active=!!fullscreenElement();
  if(window.electronAPI?.isFullscreen){try{active=await window.electronAPI.isFullscreen();}catch{}}
  fullscreenBtn.textContent = active ? '⛶ Sair da tela cheia' : '⛶ Tela cheia';
  fullscreenBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  fullscreenBtn.title = active ? 'Alternar tela cheia nas configurações' : 'Colocar o jogo em tela cheia';
}
if (fullscreenBtn) fullscreenBtn.onclick = toggleFullscreen;
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
updateFullscreenButton();
$('#chatgptBtn').onclick = async () => {
  const r = await fetch('/auth/chatgpt/status').then(r=>r.json()).catch(()=>({enabled:false}));
  $('#errorText').textContent = r.enabled ? 'Integração disponível.' : 'Vínculo ChatGPT preparado, mas precisa das credenciais aprovadas do app.';
};

function playerName(){
  const input=(state.mode==='chaos'||state.setupKind==='chaos')?$('#chaosPlayerName'):$('#playerName');
  return (input?.value || 'Jogador').trim().slice(0,18);
}

function defaultProfile(){return {
  coins:25,selectedRole:'earth',
  boosts:{shield:0,speed:0,jump:0},
  owned:{crown:false,aura:false},
  settings:{screenShake:true,reducedMotion:false,resolution:'native',language:'pt-BR',fullscreen:true},
  achievements:{},
  relics:{owned:{},active:null},
  lore:[],
  stats:{deaths:0,jokers:0,secrets:0,bosses:0,finished:0,bestRank:null}
};}
const UI_I18N={"pt-BR":{"single":"Singleplayer","multi":"Multiplayer","shop":"Loja","settings":"Configurações","exit":"Sair","save":"Salvar jogo","menu":"Sair para o menu","desktop":"Sair para desktop","paused":"JOGO PAUSADO","esc":"ESC para continuar a tentativa.","choose":"ESCOLHA SEU ELEMENTO","newGame":"Nova aventura solo","continue":"Continuar","level":"fase","resolution":"Resolução","language":"Idioma","fullscreen":"Tela cheia","saved":"Jogo salvo.","profileSaved":"Perfil local salvo. A sala multiplayer continua no servidor."},"en-US":{"single":"Singleplayer","multi":"Multiplayer","shop":"Shop","settings":"Settings","exit":"Exit","save":"Save game","menu":"Exit to menu","desktop":"Exit to desktop","paused":"GAME PAUSED","esc":"Press ESC to continue.","choose":"CHOOSE YOUR ELEMENT","newGame":"New solo adventure","continue":"Continue","level":"level","resolution":"Resolution","language":"Language","fullscreen":"Fullscreen","saved":"Game saved.","profileSaved":"Local profile saved. The multiplayer room remains on the server."},"es-ES":{"single":"Un jugador","multi":"Multijugador","shop":"Tienda","settings":"Configuración","exit":"Salir","save":"Guardar partida","menu":"Salir al menú","desktop":"Salir al escritorio","paused":"JUEGO EN PAUSA","esc":"Pulsa ESC para continuar.","choose":"ELIGE TU ELEMENTO","newGame":"Nueva aventura","continue":"Continuar","level":"fase","resolution":"Resolución","language":"Idioma","fullscreen":"Pantalla completa","saved":"Partida guardada.","profileSaved":"Perfil local guardado. La sala multijugador sigue en el servidor."},"fr-FR":{"single":"Solo","multi":"Multijoueur","shop":"Boutique","settings":"Paramètres","exit":"Quitter","save":"Sauvegarder","menu":"Retour au menu","desktop":"Quitter vers le bureau","paused":"JEU EN PAUSE","esc":"Appuyez sur Échap pour continuer.","choose":"CHOISISSEZ VOTRE ÉLÉMENT","newGame":"Nouvelle aventure solo","continue":"Continuer","level":"niveau","resolution":"Résolution","language":"Langue","fullscreen":"Plein écran","saved":"Partie sauvegardée.","profileSaved":"Profil local sauvegardé. La salle multijoueur reste sur le serveur."},"de-DE":{"single":"Einzelspieler","multi":"Mehrspieler","shop":"Shop","settings":"Einstellungen","exit":"Beenden","save":"Spiel speichern","menu":"Zum Menü","desktop":"Zum Desktop","paused":"SPIEL PAUSIERT","esc":"ESC zum Fortsetzen.","choose":"WÄHLE DEIN ELEMENT","newGame":"Neues Solo-Abenteuer","continue":"Fortsetzen","level":"Level","resolution":"Auflösung","language":"Sprache","fullscreen":"Vollbild","saved":"Spiel gespeichert.","profileSaved":"Lokales Profil gespeichert. Der Mehrspielerraum bleibt auf dem Server."},"it-IT":{"single":"Giocatore singolo","multi":"Multigiocatore","shop":"Negozio","settings":"Impostazioni","exit":"Esci","save":"Salva partita","menu":"Torna al menu","desktop":"Esci al desktop","paused":"GIOCO IN PAUSA","esc":"Premi ESC per continuare.","choose":"SCEGLI IL TUO ELEMENTO","newGame":"Nuova avventura","continue":"Continua","level":"livello","resolution":"Risoluzione","language":"Lingua","fullscreen":"Schermo intero","saved":"Partita salvata.","profileSaved":"Profilo locale salvato. La stanza multiplayer resta sul server."},"nl-NL":{"single":"Singleplayer","multi":"Multiplayer","shop":"Winkel","settings":"Instellingen","exit":"Afsluiten","save":"Spel opslaan","menu":"Naar menu","desktop":"Naar bureaublad","paused":"SPEL GEPAUZEERD","esc":"Druk op ESC om door te gaan.","choose":"KIES JE ELEMENT","newGame":"Nieuw solo-avontuur","continue":"Doorgaan","level":"level","resolution":"Resolutie","language":"Taal","fullscreen":"Volledig scherm","saved":"Spel opgeslagen.","profileSaved":"Lokaal profiel opgeslagen. De multiplayerruimte blijft op de server."},"pl-PL":{"single":"Jeden gracz","multi":"Wielu graczy","shop":"Sklep","settings":"Ustawienia","exit":"Wyjście","save":"Zapisz grę","menu":"Wyjdź do menu","desktop":"Wyjdź na pulpit","paused":"GRA WSTRZYMANA","esc":"Naciśnij ESC, aby kontynuować.","choose":"WYBIERZ SWÓJ ŻYWIOŁ","newGame":"Nowa przygoda solo","continue":"Kontynuuj","level":"poziom","resolution":"Rozdzielczość","language":"Język","fullscreen":"Pełny ekran","saved":"Gra zapisana.","profileSaved":"Profil lokalny zapisany. Pokój multiplayer pozostaje na serwerze."},"ru-RU":{"single":"Одиночная игра","multi":"Сетевая игра","shop":"Магазин","settings":"Настройки","exit":"Выход","save":"Сохранить игру","menu":"Выйти в меню","desktop":"Выйти на рабочий стол","paused":"ИГРА ПРИОСТАНОВЛЕНА","esc":"Нажмите ESC, чтобы продолжить.","choose":"ВЫБЕРИТЕ СТИХИЮ","newGame":"Новое приключение","continue":"Продолжить","level":"уровень","resolution":"Разрешение","language":"Язык","fullscreen":"Полный экран","saved":"Игра сохранена.","profileSaved":"Локальный профиль сохранён. Комната остаётся на сервере."},"tr-TR":{"single":"Tek oyunculu","multi":"Çok oyunculu","shop":"Mağaza","settings":"Ayarlar","exit":"Çıkış","save":"Oyunu kaydet","menu":"Menüye dön","desktop":"Masaüstüne çık","paused":"OYUN DURAKLATILDI","esc":"Devam etmek için ESC.","choose":"ELEMENTİNİ SEÇ","newGame":"Yeni solo macera","continue":"Devam et","level":"seviye","resolution":"Çözünürlük","language":"Dil","fullscreen":"Tam ekran","saved":"Oyun kaydedildi.","profileSaved":"Yerel profil kaydedildi. Çok oyunculu oda sunucuda kalır."},"ja-JP":{"single":"シングルプレイ","multi":"マルチプレイ","shop":"ショップ","settings":"設定","exit":"終了","save":"ゲームを保存","menu":"メニューへ戻る","desktop":"デスクトップへ終了","paused":"一時停止","esc":"ESCでゲームに戻ります。","choose":"エレメントを選択","newGame":"新しい冒険","continue":"続ける","level":"ステージ","resolution":"解像度","language":"言語","fullscreen":"フルスクリーン","saved":"保存しました。","profileSaved":"ローカルプロフィールを保存しました。マルチプレイルームはサーバーに残ります。"},"ko-KR":{"single":"싱글플레이","multi":"멀티플레이","shop":"상점","settings":"설정","exit":"종료","save":"게임 저장","menu":"메뉴로 나가기","desktop":"바탕화면으로 나가기","paused":"게임 일시정지","esc":"ESC를 눌러 계속합니다.","choose":"원소를 선택하세요","newGame":"새 솔로 모험","continue":"계속하기","level":"스테이지","resolution":"해상도","language":"언어","fullscreen":"전체 화면","saved":"게임이 저장되었습니다.","profileSaved":"로컬 프로필이 저장되었습니다. 멀티플레이 방은 서버에 유지됩니다."},"zh-CN":{"single":"单人游戏","multi":"多人游戏","shop":"商店","settings":"设置","exit":"退出","save":"保存游戏","menu":"返回主菜单","desktop":"退出到桌面","paused":"游戏暂停","esc":"按 ESC 继续。","choose":"选择你的元素","newGame":"新的单人冒险","continue":"继续","level":"关卡","resolution":"分辨率","language":"语言","fullscreen":"全屏","saved":"游戏已保存。","profileSaved":"本地资料已保存。多人房间仍保留在服务器。"},"zh-TW":{"single":"單人遊戲","multi":"多人遊戲","shop":"商店","settings":"設定","exit":"退出","save":"儲存遊戲","menu":"返回主選單","desktop":"退出到桌面","paused":"遊戲暫停","esc":"按 ESC 繼續。","choose":"選擇你的元素","newGame":"新的單人冒險","continue":"繼續","level":"關卡","resolution":"解析度","language":"語言","fullscreen":"全螢幕","saved":"遊戲已儲存。","profileSaved":"本機資料已儲存。多人房間仍保留在伺服器。"},"ar-SA":{"single":"لاعب واحد","multi":"متعدد اللاعبين","shop":"المتجر","settings":"الإعدادات","exit":"خروج","save":"حفظ اللعبة","menu":"العودة إلى القائمة","desktop":"الخروج إلى سطح المكتب","paused":"اللعبة متوقفة","esc":"اضغط ESC للمتابعة.","choose":"اختر عنصرك","newGame":"مغامرة فردية جديدة","continue":"متابعة","level":"المرحلة","resolution":"الدقة","language":"اللغة","fullscreen":"ملء الشاشة","saved":"تم حفظ اللعبة.","profileSaved":"تم حفظ الملف المحلي. تبقى غرفة اللعب الجماعي على الخادم."},"hi-IN":{"single":"एकल खिलाड़ी","multi":"मल्टीप्लेयर","shop":"दुकान","settings":"सेटिंग्स","exit":"बाहर निकलें","save":"गेम सेव करें","menu":"मेनू पर जाएँ","desktop":"डेस्कटॉप पर जाएँ","paused":"गेम रुका हुआ है","esc":"जारी रखने के लिए ESC दबाएँ।","choose":"अपना तत्व चुनें","newGame":"नई एकल यात्रा","continue":"जारी रखें","level":"स्तर","resolution":"रिज़ॉल्यूशन","language":"भाषा","fullscreen":"पूर्ण स्क्रीन","saved":"गेम सेव हो गया।","profileSaved":"स्थानीय प्रोफ़ाइल सेव हो गई। मल्टीप्लेयर रूम सर्वर पर बना रहेगा।"},"sv-SE":{"single":"Enspelare","multi":"Flerspelare","shop":"Butik","settings":"Inställningar","exit":"Avsluta","save":"Spara spelet","menu":"Till menyn","desktop":"Till skrivbordet","paused":"SPELET ÄR PAUSAT","esc":"Tryck ESC för att fortsätta.","choose":"VÄLJ DITT ELEMENT","newGame":"Nytt soloäventyr","continue":"Fortsätt","level":"nivå","resolution":"Upplösning","language":"Språk","fullscreen":"Helskärm","saved":"Spelet sparades.","profileSaved":"Lokal profil sparades. Flerspelarrummet finns kvar på servern."},"da-DK":{"single":"Singleplayer","multi":"Multiplayer","shop":"Butik","settings":"Indstillinger","exit":"Afslut","save":"Gem spil","menu":"Til menuen","desktop":"Til skrivebordet","paused":"SPILLET ER PAUSET","esc":"Tryk ESC for at fortsætte.","choose":"VÆLG DIT ELEMENT","newGame":"Nyt solo-eventyr","continue":"Fortsæt","level":"niveau","resolution":"Opløsning","language":"Sprog","fullscreen":"Fuld skærm","saved":"Spillet er gemt.","profileSaved":"Lokal profil gemt. Multiplayer-rummet forbliver på serveren."},"fi-FI":{"single":"Yksinpeli","multi":"Moninpeli","shop":"Kauppa","settings":"Asetukset","exit":"Poistu","save":"Tallenna peli","menu":"Poistu valikkoon","desktop":"Poistu työpöydälle","paused":"PELI TAUOLLA","esc":"Jatka painamalla ESC.","choose":"VALITSE ELEMENTTISI","newGame":"Uusi sooloseikkailu","continue":"Jatka","level":"taso","resolution":"Resoluutio","language":"Kieli","fullscreen":"Koko näyttö","saved":"Peli tallennettu.","profileSaved":"Paikallinen profiili tallennettu. Moninpelihuone pysyy palvelimella."},"cs-CZ":{"single":"Jeden hráč","multi":"Více hráčů","shop":"Obchod","settings":"Nastavení","exit":"Ukončit","save":"Uložit hru","menu":"Zpět do menu","desktop":"Ukončit na plochu","paused":"HRA POZASTAVENA","esc":"Pokračujte klávesou ESC.","choose":"VYBERTE SVŮJ ŽIVEL","newGame":"Nové sólo dobrodružství","continue":"Pokračovat","level":"úroveň","resolution":"Rozlišení","language":"Jazyk","fullscreen":"Celá obrazovka","saved":"Hra uložena.","profileSaved":"Místní profil uložen. Multiplayerová místnost zůstává na serveru."}};
function uiT(){const code=profile?.settings?.language||'pt-BR';return UI_I18N[code]||UI_I18N['en-US'];}
function applyInterfaceLanguage(){
  const t=uiT(),pairs=[['#menuSingleBtn b',t.single],['#menuMultiBtn b',t.multi],['#menuShopBtn b',t.shop],['#menuSettingsBtn b',t.settings],['#menuExitBtn b',t.exit],['#pauseSaveBtn b',t.save],['#pauseSettingsBtn b',t.settings],['#pauseMainMenuBtn b',t.menu],['#pauseDesktopBtn b',t.desktop],['#pauseTitle',t.paused],['#pauseSubtitle',t.esc],['.character-select-title',t.choose]];
  for(const [sel,val] of pairs){const el=document.querySelector(sel);if(el)el.textContent=val;}
  const rr0=$('#settingResolution'),ll0=$('#settingLanguage'),ff0=$('#settingFullscreen');
  const rr=rr0&&typeof rr0.closest==='function'?rr0.closest('.setting-row')?.querySelector('b'):null;if(rr)rr.textContent=t.resolution;
  const ll=ll0&&typeof ll0.closest==='function'?ll0.closest('.setting-row')?.querySelector('b'):null;if(ll)ll.textContent=t.language;
  const ff=ff0&&typeof ff0.closest==='function'?ff0.closest('.setting-row')?.querySelector('b'):null;if(ff)ff.textContent=t.fullscreen;
  if($('#soloBtn'))$('#soloBtn').textContent='▶ '+t.newGame;
  if(typeof refreshSoloSaveButton==='function')refreshSoloSaveButton();
}
function loadProfile(){
  try{
    const raw=JSON.parse(persistentGet(PROFILE_KEY)||'null'),base=defaultProfile();if(!raw)return base;
    return {...base,...raw,
      boosts:{...base.boosts,...(raw.boosts||{})},
      owned:{...base.owned,...(raw.owned||{})},
      settings:{...base.settings,...(raw.settings||{})},
      achievements:{...(raw.achievements||{})},
      relics:{...base.relics,...(raw.relics||{}),owned:{...(raw.relics?.owned||{})}},
      lore:Array.isArray(raw.lore)?raw.lore:[],
      stats:{...base.stats,...(raw.stats||{})}
    };
  }catch{return defaultProfile();}
}
let profile=loadProfile();
function saveProfile(){profile.selectedRole=state.selectedRole;persistentSet(PROFILE_KEY,JSON.stringify(profile));refreshEconomyUI();applySettings();}
function addCoins(n){
  const mult=profile.relics?.active==='greedEye'?1.25:1;
  profile.coins=Math.max(0,(profile.coins||0)+Math.max(0,Math.floor(n*mult)));saveProfile();
}
function spendCoins(n){if(profile.coins<n)return false;profile.coins-=n;saveProfile();return true;}
function rewardLevel(level){const lv=Math.max(1,Math.min(1000,Number(level)||1));if(state.lastRewardedLevel===lv)return;state.lastRewardedLevel=lv;addCoins(4+Math.floor(lv/100));}
function refreshEconomyUI(){
  for(const id of ['#lobbyCoins','#hudCoins','#shopCoins']){const el=$(id);if(el)el.textContent=profile.coins||0;}
  document.querySelectorAll('.shop-item').forEach(btn=>{const k=btn.dataset.item,it=SHOP_ITEMS[k];if(!it)return;const owned=it.type==='cosmetic'&&profile.owned[k];btn.classList.toggle('owned',!!owned);btn.disabled=owned;});
}

function activeRelicId(){return RELICS[profile.relics?.active]?profile.relics.active:null;}
function activeRelic(){const id=activeRelicId();return id?RELICS[id]:null;}
function showMiniToast(title,text,kind='normal'){
  let el=$('#v006Toast');
  if(!el){el=document.createElement('div');el.id='v006Toast';document.body.appendChild(el);}
  el.className='v006-toast show '+kind;el.innerHTML=`<b>${escapeHtml(title)}</b><span>${escapeHtml(text||'')}</span>`;
  clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2600);
}
function showCastleWhisper(text){
  const now=performance.now();if(now-state.lastWhisperAt<900)return;state.lastWhisperAt=now;
  let el=$('#castleWhisper');if(!el){el=document.createElement('div');el.id='castleWhisper';document.body.appendChild(el);}
  el.textContent=text;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2300);
}
function unlockAchievement(id){
  const a=ACHIEVEMENTS[id];if(!a||profile.achievements?.[id])return false;
  profile.achievements[id]={at:Date.now(),level:state.level};saveProfile();
  showMiniToast('🏆 '+a.name,a.desc,'achievement');refreshChronicle();return true;
}
function awardRelic(id){
  const relic=RELICS[id];if(!relic)return false;
  profile.relics=profile.relics||{owned:{},active:null};profile.relics.owned=profile.relics.owned||{};
  const fresh=!profile.relics.owned[id];profile.relics.owned[id]=true;profile.relics.active=id;saveProfile();
  showMiniToast((fresh?'RELÍQUIA ENCONTRADA · ':'RELÍQUIA EQUIPADA · ')+relic.icon+' '+relic.name,relic.desc,'relic');refreshChronicle();return true;
}
function equipRelic(id){
  if(!profile.relics?.owned?.[id]||!RELICS[id])return;
  profile.relics.active=id;saveProfile();showMiniToast(RELICS[id].icon+' '+RELICS[id].name,'Relíquia ativa.','relic');refreshChronicle();
}
function relicForLevel(level){
  const ids=Object.keys(RELICS);return ids[Math.abs((level*17+state.deaths*3))%ids.length];
}
function rankValue(r){const i=RANK_ORDER.indexOf(r);return i<0?99:i;}
function calculateSufferingRank(){
  const time=Math.max(.1,elapsed()),deaths=Math.max(0,state.deaths-state.levelDeathsAtStart),attempt=Math.max(1,state.attempt);
  let score=100-Math.min(55,deaths*18)-Math.min(22,(attempt-1)*7)-Math.min(28,Math.max(0,time-42)*.45);
  if(state.levelData?.joker)score+=6;if(state.levelData?.chase)score+=5;
  const rank=score>=88?'S':score>=74?'A':score>=58?'B':score>=40?'C':score>=22?'D':'CASTELO TE ODEIA';
  return {rank,time,deaths,attempts:attempt,score:Math.round(score)};
}
function finalizeLevelStats(level){
  const result=calculateSufferingRank();
  profile.stats=profile.stats||{};
  if(!profile.stats.bestRank||rankValue(result.rank)<rankValue(profile.stats.bestRank))profile.stats.bestRank=result.rank;
  if(state.levelData?.joker){profile.stats.jokers=(profile.stats.jokers||0)+1;if(result.deaths===0)unlockAchievement('jokerClean');}
  if(state.levelData?.pursuer?.mode==='hunt')unlockAchievement('hunted');
  if(state.mode==='chaos')unlockAchievement('chaosSurvivor');
  saveProfile();refreshChronicle();return result;
}
function endingForRun(){
  const lore=profile.lore?.length||0,ach=Object.keys(profile.achievements||{}).length;
  if(lore>=8&&ach>=6)return {name:'FINAL VERDADEIRO · O CASTELO LEMBRA',text:'Você não escapou apenas das salas. Você descobriu por que elas estavam esperando por você.'};
  if(state.deaths>=500)return {name:'FINAL AMALDIÇOADO · VOCÊ VIROU PARTE DELE',text:'A porta abriu. O castelo também. Alguma coisa saiu com você.'};
  return {name:'FINAL · A PORTA DO INFINITO',text:'A milésima porta cedeu. Por enquanto, o castelo ficou em silêncio.'};
}
function refreshChronicle(){
  const ach=$('#chronicleAchievements'),rel=$('#chronicleRelics'),lore=$('#chronicleLore'),stats=$('#chronicleStats');
  if(ach)ach.innerHTML=Object.entries(ACHIEVEMENTS).map(([id,a])=>`<div class="chronicle-item ${profile.achievements?.[id]?'unlocked':'locked'}"><b>${profile.achievements?.[id]?'✓':'?'} ${escapeHtml(a.name)}</b><small>${escapeHtml(a.desc)}</small></div>`).join('');
  if(rel)rel.innerHTML=Object.entries(RELICS).map(([id,r])=>{const owned=!!profile.relics?.owned?.[id],active=profile.relics?.active===id;return `<button class="chronicle-item relic-choice ${owned?'unlocked':'locked'} ${active?'active':''}" data-relic="${id}" ${owned?'':'disabled'}><b>${owned?r.icon:'?'} ${owned?escapeHtml(r.name):'Relíquia desconhecida'}${active?' · ATIVA':''}</b><small>${owned?escapeHtml(r.desc):'Encontre salas secretas e derrote guardiões.'}</small></button>`;}).join('');
  if(lore)lore.innerHTML=(profile.lore?.length?profile.lore.map((x,i)=>`<div class="chronicle-item unlocked"><b>Fragmento ${i+1}</b><small>${escapeHtml(x.text||String(x))}</small></div>`).join(''):'<p class="fine">Nenhum fragmento encontrado. Algumas paredes não são paredes.</p>');
  if(stats){const st=profile.stats||{};stats.textContent=`Mortes: ${st.deaths||0} · Segredos: ${st.secrets||0} · Guardiões: ${st.bosses||0} · Melhor rank: ${st.bestRank||'—'}`;}
  document.querySelectorAll('[data-relic]').forEach(btn=>btn.onclick=()=>equipRelic(btn.dataset.relic));
}
function openChronicle(){refreshChronicle();$('#chronicleModal')?.classList.remove('hidden');}
function closeChronicle(){$('#chronicleModal')?.classList.add('hidden');}
function rareEventForLevel(level){
  if(level<12||level===666||level%100===0)return null;
  const h=(level*9301+49297)%997;if(h%23!==0)return null;
  const types=['observer','eyes','wrong-number','silence','blink-door'];return types[h%types.length];
}
function pursuerForLevel(level){
  if(level<70||level%100===0)return null;
  if(level>=320&&level%31===0)return {mode:'hunt',speed:92+Math.min(80,level*.05)};
  if(level%29===0)return {mode:'watch',speed:0};
  return null;
}
function isChaseLevel(level){return level>=120&&level<1000&&level%89===0&&level%100!==0;}
function isSecretLevel(level){return level>=20&&level<1000&&level%43===0&&level%100!==0;}
function applyAdaptiveCastle(ld,level){
  if(!ld||ld.boss||state.attempt<3)return;
  const candidates=(ld.platforms||[]).filter(p=>p.y>620&&p.y<790&&p.x>350&&p.x<1300&&p.w>105&&!p._doorBridge);
  if(!candidates.length)return;
  const p=candidates[(level+state.attempt)%candidates.length],x=Math.max(p.x+18,Math.min(p.x+p.w-54,p.x+p.w*.58));
  ld.ambushSpikes=ld.ambushSpikes||[];
  ld.ambushSpikes.push({id:8000000+level*10+Math.min(9,state.attempt),triggerX:Math.max(250,x-115),delay:55,adaptive:true,spike:{x,y:p.y-30,w:50,h:30,dir:'up'}});
  ld.adaptive=true;
}
function applyV006Mutators(ld,level){
  if(!ld)return ld;
  ld.rareEvent=ld.special666?'eyes':rareEventForLevel(level);
  ld.pursuer=ld.special666?{mode:'watch',speed:0}:pursuerForLevel(level);
  ld.chase=isChaseLevel(level);
  if(isSecretLevel(level)&&!ld.boss){
    const support=(ld.platforms||[]).filter(p=>p.x>480&&p.x<1180&&p.w>100).sort((a,b)=>a.y-b.y)[0];
    if(support)ld.secretRoom={x:support.x+support.w/2-27,y:support.y-72,w:54,h:72,key:'secret-'+level};
  }
  applyAdaptiveCastle(ld,level);
  return ld;
}
function generate666Level(){
  const floorY=790,region=castleRegion(666);
  const ld={
    level:666,
    platforms:[{x:0,y:floorY,w:300,h:110},{x:365,y:748,w:170,h:152},{x:610,y:680,w:190,h:220},{x:880,y:735,w:185,h:165},{x:1145,y:655,w:185,h:245},{x:1405,y:floorY,w:195,h:110}],
    hazards:[{x:300,y:818,w:65,h:82,type:'curse'},{x:535,y:818,w:75,h:82,type:'roots'},{x:800,y:818,w:80,h:82,type:'storm'},{x:1065,y:818,w:80,h:82,type:'curse'},{x:1330,y:818,w:75,h:82,type:'roots'}],
    spikes:[],fakeFloors:[],popTraps:[],ambushSpikes:[{id:66601,triggerX:1210,delay:120,spike:{x:1270,y:625,w:52,h:30,dir:'up'}}],
    reverseZones:[],plate:null,plate2:null,door:null,goal:{x:1515,y:690,w:56,h:100},elevators:[],chandeliers:[],armors:[],crushers:[],bookshelves:[],ghosts:[],bridgeTiles:[],dragons:[],fakeDoors:[],fakeGoals:[],fallingBlocks:[],slamWalls:[],vanishPlatforms:[],windGusts:[],movingExit:null,boss:null,archetype:666,roomTitle:'A SALA QUE NÃO DEVIA EXISTIR',regionIndex:region.index,enemies:[],special666:true,rareEvent:'eyes',pursuer:{mode:'watch',speed:0}
  };
  return sanitizeGeneratedLevel(ld);
}
function recordReplayFrame(){
  if(!state.running||player.dead)return;
  state.replayBuffer.push({x:player.x,y:player.y,role:state.role,facing:player.facing,vx:player.vx,vy:player.vy,onGround:player.onGround,t:performance.now()});
  if(state.replayBuffer.length>110)state.replayBuffer.shift();
}
function beginDeathReplay(){
  const frames=state.replayBuffer.slice(-80);if(frames.length<3)return;
  state.deathReplay={frames,started:performance.now(),duration:950};
}
function drawDeathReplay(){
  const r=state.deathReplay;if(!r)return;
  const age=performance.now()-r.started;if(age>r.duration){state.deathReplay=null;return;}
  const q=Math.max(0,Math.min(.999,age/r.duration)),idx=Math.min(r.frames.length-1,Math.floor(q*r.frames.length)),f=r.frames[idx];
  ctx.save();ctx.globalAlpha=.22;ctx.strokeStyle='#ff477a';ctx.lineWidth=3;ctx.beginPath();
  r.frames.slice(Math.max(0,idx-26),idx+1).forEach((p,i)=>{if(i===0)ctx.moveTo(p.x+21,p.y+28);else ctx.lineTo(p.x+21,p.y+28);});ctx.stroke();
  ctx.globalAlpha=.72;drawCharacter(f.x,f.y,f.role,true,false,false,profile.owned,f,activeRelicId());ctx.restore();
}
function chaseWallX(){return Math.min(1170,-120+elapsed()*(95+state.level/35));}
function closingInset(){return Math.min(355,Math.max(0,elapsed()-1.2)*(24+state.level/90));}
function processV006Hazards(p,dt){
  const ld=state.levelData;if(!ld)return;
  if(ld.chase&&elapsed()>1.1&&p.x<chaseWallX()+46)return die(p);
  if(ld.jokerRules?.includes('closing')){
    const inset=closingInset();if(p.x<inset||p.x+p.w>W-inset)return die(p);
  }
  if(ld.jokerRules?.includes('echo')){const ef=echoFrame();if(ef&&Math.hypot((p.x+21)-(ef.x+21),(p.y+28)-(ef.y+28))<34&&elapsed()>1.4)return die(p);}
  if(ld.pursuer?.mode==='hunt'){
    if(!state.pursuer)state.pursuer={x:Math.max(0,p.x-520),y:p.y};
    const speed=ld.pursuer.speed||100,dx=p.x-state.pursuer.x,dy=p.y-state.pursuer.y,dist=Math.hypot(dx,dy)||1;
    state.pursuer.x+=dx/dist*speed*dt;state.pursuer.y+=dy/dist*speed*.65*dt;
    if(Math.hypot((p.x+21)-(state.pursuer.x+20),(p.y+28)-(state.pursuer.y+28))<44)return die(p);
  }
  const sr=ld.secretRoom;if(sr&&!state.trapState.get(sr.key)&&overlap(p,sr)){
    state.trapState.set(sr.key,true);state.runStats.secrets++;profile.stats.secrets=(profile.stats.secrets||0)+1;
    const loreKey='fragment-'+state.level;
    if(!profile.lore.some(x=>x.id===loreKey))profile.lore.push({id:loreKey,text:`A sala ${state.level} não consta nos mapas do castelo. Alguém a construiu depois.`});
    addCoins(20);awardRelic(relicForLevel(state.level));unlockAchievement('firstSecret');saveProfile();
    showOverlay('🚪 SALA SECRETA ENCONTRADA','Fragmento recuperado · relíquia despertada · +20 moedas',1150);
  }
}
function echoFrame(){const a=state.replayBuffer||[];return a.length>34?a[Math.max(0,a.length-34)]:null;}
function drawEchoClone(){
  if(!state.levelData?.jokerRules?.includes('echo'))return;const f=echoFrame();if(!f)return;
  ctx.save();ctx.globalAlpha=.32;ctx.filter='grayscale(1)';drawCharacter(f.x,f.y,f.role,false,false,false,{},f,null);ctx.filter='none';
  ctx.strokeStyle='rgba(255,70,145,.55)';ctx.strokeRect(f.x-4,f.y-4,50,64);ctx.restore();
}
function drawPursuer(){
  const p=state.levelData?.pursuer;if(!p)return;
  let x,y,alpha;
  if(p.mode==='hunt'&&state.pursuer){x=state.pursuer.x;y=state.pursuer.y;alpha=.88;}
  else{x=1050+Math.sin(elapsed()*.33)*90;y=300;alpha=.32;}
  ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#020104';ctx.beginPath();ctx.ellipse(x+22,y+32,28,46,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ff315f';ctx.beginPath();ctx.arc(x+14,y+20,4,0,Math.PI*2);ctx.arc(x+31,y+20,4,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawSecretRoom(){
  const sr=state.levelData?.secretRoom;if(!sr||state.trapState.get(sr.key))return;
  ctx.save();const reveal=profile.relics?.active==='seerMark';ctx.globalAlpha=reveal ? .95 : .32;ctx.fillStyle='#100a18';ctx.fillRect(sr.x,sr.y,sr.w,sr.h);ctx.strokeStyle=reveal?'#b67cff':'rgba(180,120,255,.35)';ctx.lineWidth=3;ctx.strokeRect(sr.x,sr.y,sr.w,sr.h);ctx.fillStyle='#d9c4ff';ctx.font='700 18px sans-serif';ctx.fillText('?',sr.x+21,sr.y+42);ctx.restore();
}
function drawV006BackgroundEntities(){
  const ld=state.levelData;if(!ld)return;
  if(ld.rareEvent==='observer'&&!ld.pursuer){ctx.save();ctx.globalAlpha=.22;ctx.fillStyle='#050207';ctx.fillRect(1290,240,34,115);ctx.fillStyle='#ff315f';ctx.fillRect(1298,266,5,5);ctx.fillRect(1313,266,5,5);ctx.restore();}
  if(ld.rareEvent==='blink-door'&&Math.floor(elapsed()*2)%2===0){ctx.save();ctx.globalAlpha=.22;ctx.fillStyle='#160d1d';ctx.fillRect(720,360,64,150);ctx.strokeStyle='rgba(255,120,190,.4)';ctx.strokeRect(720,360,64,150);ctx.restore();}
  if(ld.rareEvent==='eyes'||ld.special666){
    ctx.save();ctx.globalAlpha=ld.special666?.42:.18;for(let i=0;i<9;i++){const x=100+i*175,y=220+(i%3)*95;ctx.fillStyle='#050207';ctx.beginPath();ctx.ellipse(x,y,24,10,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff315f';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();}ctx.restore();
  }
  drawPursuer();drawEchoClone();drawSecretRoom();
}
function drawV006OverlayEffects(){
  const ld=state.levelData;if(!ld)return;
  if(ld.chase){const x=chaseWallX();ctx.save();ctx.fillStyle='rgba(35,0,20,.78)';ctx.fillRect(0,0,Math.max(0,x),H);ctx.fillStyle='rgba(255,45,100,.45)';ctx.fillRect(Math.max(0,x-9),0,9,H);ctx.restore();}
  if(ld.jokerRules?.includes('closing')){const n=closingInset();ctx.save();ctx.fillStyle='rgba(5,0,8,.86)';ctx.fillRect(0,0,n,H);ctx.fillRect(W-n,0,n,H);ctx.strokeStyle='rgba(255,70,140,.55)';ctx.strokeRect(n,0,2,H);ctx.strokeRect(W-n,0,2,H);ctx.restore();}
  if(ld.jokerRules?.includes('blackout')){
    const pulse=(Math.sin(elapsed()*2.7)+1)/2,alpha=.28+pulse*.48;ctx.save();ctx.fillStyle=`rgba(0,0,0,${alpha})`;ctx.fillRect(0,0,W,H);ctx.restore();
  }
  if(ld.rareEvent==='silence'){ctx.save();ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(0,0,W,H);ctx.restore();}
  if(ld.special666){ctx.save();ctx.fillStyle='rgba(55,0,12,.18)';ctx.fillRect(0,0,W,H);ctx.restore();}
  drawDeathReplay();
}
function maybeCastleComment(){
  if(state.level===666){showCastleWhisper('Você demorou 665 salas para chegar aqui.');return;}
  if(state.levelData?.pursuer?.mode==='hunt'){showCastleWhisper('Você reparou que ele não está mais no fundo?');return;}
  if(state.attempt>=4){const lines=['Você está criando um padrão.','Eu já sei onde você vai pular.','De novo? Ótimo. Continue me ensinando.','Essa rota não funciona. Mas tenta mais uma vez.'];showCastleWhisper(lines[(state.level+state.attempt)%lines.length]);return;}
  if(state.levelData?.rareEvent)showCastleWhisper('Tem alguma coisa errada nesta sala.');
}

function selectElement(role){
  if(!ELEMENTS[role])return;state.selectedRole=role;profile.selectedRole=role;saveProfile();
  document.querySelectorAll('.character-choice').forEach(b=>b.classList.toggle('selected',b.dataset.element===role));
  const e=ELEMENTS[role];$('#selectedElementIcon').textContent=e.icon;$('#selectedElementName').textContent=e.name;
}
function applyAttemptBoosts(){
  state.activeBoosts={shield:false,speed:false,jump:false};
  for(const k of ['shield','speed','jump'])if((profile.boosts[k]||0)>0){profile.boosts[k]-=1;state.activeBoosts[k]=true;}
  state.invulnUntil=0;saveProfile();
}
function buyShopItem(key){
  const item=SHOP_ITEMS[key];if(!item||!spendCoins(item.cost)){if($('#shopMessage'))$('#shopMessage').textContent='Moedas insuficientes.';return;}
  if(item.type==='boost')profile.boosts[key]=(profile.boosts[key]||0)+1;else profile.owned[key]=true;
  saveProfile();if($('#shopMessage'))$('#shopMessage').textContent=item.type==='boost'?'Comprado. O boost entra na próxima tentativa.':'Item permanente desbloqueado para seu personagem.';
}
function openShop({death=false,multiplayer=false}={}){
  if(state.mode==='menu'&&mainMenu&&!mainMenu.classList.contains('hidden'))return;
  state.shopOpen=true;$('#shopModal').classList.remove('hidden');$('#shopTitle').textContent=death?'☠️ Morreu. Quer trapacear de volta?':'Loja Arcana';
  $('#retryBtn').textContent=multiplayer?'Recomeçando...':death?'Tentar novamente':state.mode==='menu'?'Voltar ao menu':'Voltar ao jogo';$('#retryBtn').disabled=multiplayer;
  $('#shopCountdown').textContent=multiplayer?(state.mode==='chaos'?'O quarteto retorna em 5 segundos. Aproveitem a lojinha.':'A dupla retorna em 5 segundos. Aproveite a lojinha.') : '';refreshEconomyUI();
}
function closeShop(){state.shopOpen=false;$('#shopModal').classList.add('hidden');$('#shopCountdown').textContent='';}
function applySettings(){
  const cfg=profile?.settings||{};document.body?.classList.toggle('reduce-motion',!!cfg.reducedMotion);
  const shake=$('#settingScreenShake'),motion=$('#settingReducedMotion'),resolution=$('#settingResolution'),language=$('#settingLanguage'),fullscreen=$('#settingFullscreen');
  if(shake)shake.checked=cfg.screenShake!==false;if(motion)motion.checked=!!cfg.reducedMotion;
  if(resolution)resolution.value=cfg.resolution||'native';if(language)language.value=cfg.language||'pt-BR';if(fullscreen)fullscreen.checked=cfg.fullscreen!==false;
  if(document.documentElement)document.documentElement.lang=cfg.language||'pt-BR';
  if(typeof applyInterfaceLanguage==='function')applyInterfaceLanguage();
}
async function applyResolutionSetting(value){
  if(profile?.settings?.fullscreen!==false)return;
  if(window.electronAPI?.setResolution){try{await window.electronAPI.setResolution(value||'native');}catch{}}
}
async function applyFullscreenSetting(enabled){
  try{
    if(window.electronAPI?.setFullscreen){await window.electronAPI.setFullscreen(!!enabled);if(!enabled)await applyResolutionSetting(profile.settings.resolution);return;}
    if(enabled){if(!fullscreenElement()){const target=document.documentElement||document.body;if(target?.requestFullscreen)await target.requestFullscreen();}}
    else if(fullscreenElement())await exitFullscreen();
  }catch{}
}
async function ensureGameplayDisplayMode(){
  const fullscreen=profile?.settings?.fullscreen!==false;
  await applyFullscreenSetting(fullscreen);
  if(!fullscreen)await applyResolutionSetting(profile.settings.resolution);
}
function openSettings(fromPause=false){
  state.settingsFromPause=!!fromPause;applySettings();
  if(fromPause)$('#pauseMenu')?.classList.add('hidden');
  $('#settingsModal').classList.remove('hidden');
}
function closeSettings(restorePause=true){
  $('#settingsModal').classList.add('hidden');
  if(restorePause&&state.settingsFromPause&&state.paused)$('#pauseMenu')?.classList.remove('hidden');
  state.settingsFromPause=false;
}
$('#closeSettingsBtn').onclick=()=>closeSettings();
$('#checkUpdatesBtn').onclick=checkUpdatesFromUI;
$('#menuUpdateBadge').onclick=()=>openUpdateModal(true);
$('#closeUpdateBtn').onclick=closeUpdateModal;
$('#updateLaterBtn').onclick=closeUpdateModal;
$('#updateNowBtn').onclick=downloadDesktopUpdate;
$('#installUpdateBtn').onclick=installDesktopUpdate;
$('#settingScreenShake').addEventListener('change',e=>{profile.settings.screenShake=!!e.target.checked;saveProfile();});
$('#settingReducedMotion').addEventListener('change',e=>{profile.settings.reducedMotion=!!e.target.checked;saveProfile();});
$('#settingResolution').addEventListener('change',async e=>{profile.settings.resolution=e.target.value;saveProfile();await applyResolutionSetting(e.target.value);});
$('#settingLanguage').addEventListener('change',e=>{profile.settings.language=e.target.value;saveProfile();});
$('#settingFullscreen').addEventListener('change',async e=>{profile.settings.fullscreen=!!e.target.checked;saveProfile();await applyFullscreenSetting(profile.settings.fullscreen);});
$('#pauseSaveBtn').onclick=saveFromPause;
$('#pauseSettingsBtn').onclick=()=>openSettings(true);
$('#pauseMainMenuBtn').onclick=pauseToMainMenu;
$('#pauseDesktopBtn').onclick=pauseToDesktop;
document.querySelectorAll('.shop-item').forEach(btn=>btn.onclick=()=>buyShopItem(btn.dataset.item));
$('#shopBtnLobby').onclick=()=>openShop();$('#shopBtnHud').onclick=()=>openShop();
$('#closeShopBtn').onclick=()=>{if($('#retryBtn').disabled)return;const retry=state.mode==='singleplayer'&&!state.running;closeShop();if(retry)startLevel(state.level);};
$('#retryBtn').onclick=()=>{if($('#retryBtn').disabled)return;const wasRunning=state.running;closeShop();if(state.mode==='singleplayer'&&!wasRunning)startLevel(state.level);};
profile.selectedRole=ELEMENTS[profile.selectedRole]?profile.selectedRole:'earth';state.selectedRole=profile.selectedRole;selectElement(state.selectedRole);refreshEconomyUI();applySettings();
if(typeof window!=='undefined'&&window.electronAPI?.getUpdateState){
  try{
    window.electronAPI.onUpdateState?.(renderUpdateState);
    window.electronAPI.getUpdateState().then(renderUpdateState).catch(()=>{});
  }catch{}
}else{
  const updateRow=$('#checkUpdatesBtn')?.closest?.('.setting-row');if(updateRow)updateRow.classList.add('hidden');
}
if(typeof location!=='undefined'&&new URLSearchParams(location.search).has('menu'))showMainMenu();else splashTimer=setTimeout(showTitleScreen,2850);

function loadSoloSave(){
  try{
    const current=JSON.parse(persistentGet(SOLO_SAVE_KEY)||'null');if(current)return current;
    const legacy=JSON.parse(persistentGet(LEGACY_SOLO_SAVE_KEY)||'null');
    if(legacy){const migrated={...legacy,role:legacy.role||'earth'};persistentSet(SOLO_SAVE_KEY,JSON.stringify(migrated));return migrated;}
    return null;
  }catch{return null;}
}
function saveSoloProgress(completed=false){
  if(state.mode!=='singleplayer')return;
  persistentSet(SOLO_SAVE_KEY,JSON.stringify({level:state.level,deaths:state.deaths,role:state.role,completed,updatedAt:Date.now()}));
  refreshSoloSaveButton();
}
function refreshSoloSaveButton(){
  const btn=$('#continueSoloBtn');if(!btn)return;
  const save=loadSoloSave();
  if(save&&!save.completed&&Number(save.level)>=1){
    btn.classList.remove('hidden');
    const e=ELEMENTS[save.role]||ELEMENTS.earth,t=uiT();
    btn.textContent='↻ '+t.continue+' '+e.icon+' '+e.name+' — '+t.level+' '+Math.min(1000,Number(save.level)||1);
  }else btn.classList.add('hidden');
}
function loadMultiplayerSave(){
  try{return JSON.parse(persistentGet(MULTI_SAVE_KEY)||'null');}catch{return null;}
}
function saveMultiplayerProgress(completed=false){
  if(state.mode!=='multiplayer')return;
  const payload={
    level:Math.max(1,Math.min(1000,Number(state.level)||1)),
    deaths:Math.max(0,Number(state.deaths)||0),
    role:ELEMENTS[state.role]?state.role:state.selectedRole,
    name:playerName(),
    completed,
    updatedAt:Date.now()
  };
  persistentSet(MULTI_SAVE_KEY,JSON.stringify(payload));
  refreshMultiplayerSaveButton();
}
function refreshMultiplayerSaveButton(){
  const btn=$('#continueMultiBtn');if(!btn)return;
  const save=loadMultiplayerSave();
  if(save&&!save.completed&&Number(save.level)>=1){
    btn.classList.remove('hidden');
    btn.textContent='↻ Continuar multiplayer — fase '+Math.min(1000,Number(save.level)||1);
    const name=$('#playerName');if(name&&!name.value&&save.name)name.value=String(save.name).slice(0,18);
  }else btn.classList.add('hidden');
}
function loadChaosSave(){
  try{return JSON.parse(persistentGet(CHAOS_SAVE_KEY)||'null');}catch{return null;}
}
function saveChaosProgress(completed=false){
  if(state.mode!=='chaos')return;
  const payload={
    level:Math.max(1,Math.min(1000,Number(state.level)||1)),
    deaths:Math.max(0,Number(state.deaths)||0),
    role:ELEMENTS[state.role]?state.role:state.selectedRole,
    name:playerName(),
    completed,
    updatedAt:Date.now()
  };
  persistentSet(CHAOS_SAVE_KEY,JSON.stringify(payload));
  refreshChaosSaveButton();
}
function refreshChaosSaveButton(){
  const btn=$('#continueChaosBtn');if(!btn)return;
  const save=loadChaosSave();
  if(save&&!save.completed&&Number(save.level)>=1){
    btn.classList.remove('hidden');
    btn.textContent='↻ Continuar Caos — fase '+Math.min(1000,Number(save.level)||1);
    const name=$('#chaosPlayerName');if(name&&!name.value&&save.name)name.value=String(save.name).slice(0,18);
  }else btn.classList.add('hidden');
}
function saveOnlineProgress(completed=false){
  if(state.mode==='chaos')saveChaosProgress(completed);
  else if(state.mode==='multiplayer')saveMultiplayerProgress(completed);
}
function startSolo(useSave){
  const save=useSave?loadSoloSave():null;
  state.mode='singleplayer';state.id='solo';state.roomCode=null;state.room=null;state.remotePlayers.clear();state.slot=0;
  state.level=save?.level||1;state.deaths=save?.deaths||0;state.role=ELEMENTS[save?.role]?save.role:state.selectedRole;
  if(!useSave)saveSoloProgress(false);
  lobby.classList.add('hidden');roomEl.classList.add('hidden');$('#backToMenuBtn').style.display='none';
  startLevel(state.level);
}
function continueMultiplayer(){
  const save=loadMultiplayerSave();
  if(!save)return refreshMultiplayerSaveButton();
  state.mode='multiplayer';
  socket.emit('create-room',{
    name:playerName()||save.name||'Jogador',
    element:state.selectedRole,
    mode:'multiplayer',
    resumeLevel:Math.max(1,Math.min(1000,Number(save.level)||1)),
    resumeDeaths:Math.max(0,Number(save.deaths)||0)
  },handleJoin);
}
function continueChaos(){
  const save=loadChaosSave();
  if(!save)return refreshChaosSaveButton();
  state.mode='chaos';
  socket.emit('create-room',{
    name:playerName()||save.name||'Jogador',
    element:ELEMENTS[save.role]?save.role:state.selectedRole,
    mode:'chaos',
    resumeLevel:Math.max(1,Math.min(1000,Number(save.level)||1)),
    resumeDeaths:Math.max(0,Number(save.deaths)||0)
  },handleJoin);
}
function restartGame(){
  if(state.mode==='singleplayer'){
    if(!state.running)return;
    showOverlay('↻ SALA REINICIADA','Tente uma rota diferente.',320);
    setTimeout(()=>startLevel(state.level),330);
  } else socket.emit('restart-level');
}
refreshSoloSaveButton();refreshMultiplayerSaveButton();
function handleJoin(res){
  if(!res?.ok){ $('#errorText').textContent = res?.error || 'Não foi possível entrar.'; return; }
  state.mode=res.mode==='chaos'?'chaos':'multiplayer';state.id=res.id;state.roomCode=res.code;state.role=res.role;state.slot=res.slot||0;state.level=res.level;state.deaths=Number(res.deaths)||0;state.remotePlayers.clear();
  $('#errorText').textContent='';document.body?.classList.remove('setup-active');document.body?.classList.toggle('chaos-active',state.mode==='chaos');lobby.classList.add('hidden');roomEl.classList.remove('hidden');roomEl.classList.toggle('chaos-room',state.mode==='chaos');$('#backToMenuBtn').style.display='none';
  $('#roomCode').textContent=res.code;
  $('#roomModeLabel').textContent=state.mode==='chaos'?'⚡ SALA CAOS · 4 PLAYERS':'SALA PRIVADA · 2 PLAYERS';
  $('#roomRequirementText').textContent=state.mode==='chaos'?'A campanha começa quando os quatro elementos estiverem na sala e todos estiverem prontos.':'A fase começa quando os dois estiverem prontos.';
  updateHud();
}

socket.on('room-state', room => {
  state.room=room;state.mode=room.mode==='chaos'?'chaos':'multiplayer';state.level=room.level;state.deaths=room.deaths;syncRoomTrapSnapshot(room);
  const me=room.players.find(p=>p.id===state.id);if(me){state.role=me.role;state.slot=me.slot||0;}
  const liveIds=new Set(room.players.map(p=>p.id));for(const id of state.remotePlayers.keys())if(!liveIds.has(id))state.remotePlayers.delete(id);
  $('#roomLevel').textContent=room.level;$('#roomDeaths').textContent=room.deaths;
  roomEl.classList.toggle('chaos-room',state.mode==='chaos');document.body?.classList.toggle('chaos-active',state.mode==='chaos');
  $('#roomModeLabel').textContent=state.mode==='chaos'?'⚡ SALA CAOS · 4 PLAYERS':'SALA PRIVADA · 2 PLAYERS';
  $('#roomRequirementText').textContent=state.mode==='chaos'
    ?`Aguardando ${Math.max(0,4-room.players.length)} jogador(es). Os quatro elementos precisam estar presentes e prontos.`
    :'A fase começa quando os dois estiverem prontos.';
  saveOnlineProgress(false);
  const players=$('#players');players.innerHTML='';
  room.players.forEach(p=>{
    const e=ELEMENTS[p.role]||ELEMENTS.earth,div=document.createElement('div');div.className=`player-card ${p.role}`;
    const seal=state.mode==='chaos'?(room.chaosSeals||[]).includes(p.role)?' · SELO ✓':' · SELO ○':'';
    div.innerHTML=`<span class="ready-dot">${p.ready?'● PRONTO':'○'}</span><div class="avatar">${e.icon}</div><h3>${escapeHtml(p.name)}${p.id===state.id?' (você)':''}</h3><p>${e.name.toUpperCase()} · ${e.ability}${seal}</p>`;
    players.appendChild(div);
  });
  updateHud();
});

socket.on('start-level', ({level,deaths,mode}) => {
  if(mode)state.mode=mode==='chaos'?'chaos':'multiplayer';
  state.level=level;state.deaths=deaths;startLevel(level);
});
socket.on('death-reward', ({coins=0}={}) => {
  const amount=Math.max(0,Number(coins)||0);
  if(amount>0){addCoins(amount);saveOnlineProgress(false);}
});
socket.on('reset-level', ({deaths,manual,mode}={}) => {
  if(mode)state.mode=mode==='chaos'?'chaos':'multiplayer';
  state.deaths=deaths;state.running=false;
  if(!manual){profile.stats.deaths=(profile.stats.deaths||0)+1;if(profile.stats.deaths>=100)unlockAchievement('death100');saveProfile();}
  saveOnlineProgress(false);
  if(manual){showOverlay('↻ SALA REINICIADA',state.mode==='chaos'?'O caos foi recalibrado para os quatro elementos.':'Tentem uma rota diferente.',320);setTimeout(()=>startLevel(state.level),340);return;}
  showOverlay(state.mode==='chaos'?'⚡ O CAOS DEVOROU O GRUPO':'☠️ O CASTELO COBROU OUTRA ALMA',deathLine(),520);openShop({death:true,multiplayer:true});
  clearTimeout(state.shopTimer);state.shopTimer=setTimeout(()=>{closeShop();startLevel(state.level);},5000);
});
socket.on('level-complete', ({level,finished,completedLevel,mode}) => {
  if(mode)state.mode=mode==='chaos'?'chaos':'multiplayer';
  const completed=completedLevel||Math.max(1,(finished?1000:level-1)),result=finalizeLevelStats(completed);rewardLevel(completed);state.level=level;
  if(completed%100===0){profile.stats.bosses=(profile.stats.bosses||0)+1;unlockAchievement('firstBoss');}
  saveOnlineProgress(!!finished);
  const ending=finished?endingForRun():null;
  showOverlay(finished?(state.mode==='chaos'?'⚡ CAOS CONQUISTADO':'🏆 INFINITY CASTLE CONQUISTADO'):`✓ SALA SUPERADA · RANK ${result.rank}`, finished?`${ending.name} · ${ending.text}`:`${result.time.toFixed(1)}s · próxima: fase ${level}`, finished?0:760);
});
socket.on('game-finished', ({deaths,mode}) => {
  if(mode)state.mode=mode==='chaos'?'chaos':'multiplayer';
  state.running=false;state.deaths=deaths;profile.stats.finished=(profile.stats.finished||0)+1;unlockAchievement('thousand');saveProfile();saveOnlineProgress(true);updateHud();const ending=endingForRun();showOverlay('🏆 1000/1000 · '+ending.name,`${ending.text} · ${deaths} mortes compartilhadas.`,0);
});
socket.on('enemy-defeated', ({id,level}={}) => {if(Number(level)!==state.level)return;const e=(state.levelData?.enemies||[]).find(x=>x.id===id);if(e)defeatEnemy(e,true);});
socket.on('trap-trigger', ({level,key,activatedAt}={}) => {
  if((state.mode!=='multiplayer'&&state.mode!=='chaos')||Number(level)!==state.level)return;
  applySharedTrapTrigger(key,activatedAt);
});
socket.on('chaos-seal-activated', ({role,level,count}={}) => {
  if(state.mode!=='chaos'||Number(level)!==state.level)return;
  const e=ELEMENTS[role]||ELEMENTS.earth;burst(player.x+21,player.y+25,8);
  const activated=Math.max(1,Math.min(4,Number(count)||((state.room?.chaosSeals||[]).length+1)));
  showOverlay(`${e.icon} SELO DE ${e.name.toUpperCase()} ATIVADO`,`O grupo despertou ${activated}/4 selos.`,420);
});
socket.on('chaos-unlocked', ({level}={}) => {
  if(state.mode!=='chaos'||Number(level)!==state.level)return;
  showOverlay('⚡ QUATRO SELOS DESPERTOS','A saída do Caos foi liberada. Agora os quatro precisam alcançá-la.',850);
});
socket.on('partner-left', ({mode,maxPlayers,currentPlayers}={}) => {
  if(state.mode!=='multiplayer'&&state.mode!=='chaos')return;
  if(mode)state.mode=mode==='chaos'?'chaos':'multiplayer';
  closeShop();clearTimeout(state.shopTimer);state.running=false;state.remotePlayers.clear();
  showOverlay(state.mode==='chaos'?'⚡ UM ELEMENTO CAIU FORA DO CAOS':'Parceiro desconectou',state.mode==='chaos'?`A sala precisa de 4 jogadores. Conectados: ${currentPlayers||1}/${maxPlayers||4}.`:'Aguardando alguém entrar novamente na sala.',0);
  gameWrap.classList.add('hidden');roomEl.classList.remove('hidden');state.ready=false;$('#readyBtn').textContent='Estou pronto';
});
socket.on('remote-state', data => {
  if((state.mode==='multiplayer'||state.mode==='chaos')&&data.id!==state.id)state.remotePlayers.set(data.id,data);
});
socket.on('boss-defeated', ({level}={}) => {
  if((state.mode!=='multiplayer'&&state.mode!=='chaos')||level!==state.level||!state.levelData?.boss)return;
  state.bossDefeated=true;state.bossCharge=state.levelData.boss.required;unlockAchievement('firstBoss');
  burst(state.levelData.boss.x+80,state.levelData.boss.y+90,42);
  showOverlay('⚔️ PROTEÇÃO QUEBRADA',state.mode==='chaos'?'As quatro runas responderam. CORRAM!':'Corram para a saída!',850);
});

function startLevel(level){
  closePauseMenu(false);document.body?.classList.remove('boot-sequence','setup-active');document.body?.classList.add('game-active');document.body?.classList.toggle('chaos-active',state.mode==='chaos');roomEl.classList.add('hidden');gameWrap.classList.remove('hidden');hideOverlay();
  ensureGameplayDisplayMode();
  state.running=true;state.lastGoalSent=false;state.remotePlayers.clear();state.trapState.clear();
  state.bossCharge=0;state.bossDefeated=false;state.lastRuneSent=null;state.lastChaosSealSent=false;state.levelStart=performance.now();
  state.abilityUntil=0;state.abilityPhaseUntil=0;state.abilityLastPulse=0;state.abilityHits=0;state.abilityRootFx=null;
  state.soloResetPending=false;state.soloTransition=false;state.replayBuffer=[];state.deathReplay=null;state.relicGuardUsed=false;state.pursuer=null;state.runStats={jumps:0,trapTriggers:0,secrets:0};
  level=Math.max(1,Math.min(1000,Number(level)||1));state.level=level;
  state.attempt=(state.levelAttempts.get(level)||0)+1;state.levelAttempts.set(level,state.attempt);if(state.attempt===1)state.levelDeathsAtStart=state.deaths;
  state.levelData=safeGenerateLevel(level);if(state.mode==='chaos')applyChaosMutators(state.levelData,level);applyAttemptBoosts();closeShop();
  document.body?.classList.toggle('phase-666',level===666);player.reset();if(level===666)unlockAchievement('phase666');
  updateHud();setTimeout(maybeCastleComment,300);
  const enteringZone=((level-1)%100===0)&&state.attempt===1;
  if(state.levelData.boss){const be=ELEMENTS[state.levelData.boss.element]||ELEMENTS.darkness;showOverlay(`👑 ${state.levelData.boss.name} · ${be.icon} ${be.name.toUpperCase()}`,state.mode==='singleplayer'?'A arena despertou. Mantenha seu elemento em uma runa e sobreviva ao ritual.':state.mode==='chaos'?'A arena despertou. QUATRO RUNAS. QUATRO ELEMENTOS. Sustentem o ritual juntos.':'A arena despertou. Cada jogador segura uma runa enquanto o chefe ataca.',1750);}
  else if(state.levelData.joker&&state.attempt===1)showOverlay('🃏 FASE CORINGA',`Regras proibidas ativas: ${(state.levelData.jokerRules||[]).map(x=>({reverse:'controles invertidos',blackout:'apagões',heavy:'gravidade pesada',float:'gravidade instável',mirror:'mundo espelhado',closing:'paredes fechando',echo:'eco perseguidor'}[x]||x)).join(' · ')}`,1750);
  else if(state.mode==='chaos'&&state.attempt===1)showOverlay('⚡ MODO CAOS',`Fase ${level}: cada elemento precisa ativar seu próprio selo antes da saída.`,1050);
  else if(level===5&&state.attempt===1)showOverlay('😈 AGORA COMEÇA','A partir daqui o castelo deixa de fingir que é seu amigo.',1450);
  else if(enteringZone){const z=castleRegion(level);showOverlay(`🏰 REGIÃO ${z.index+1}/10 · ${z.name}`,`${z.subtitle} · ${z.mechanics}`,1750);}
}

function updateHud(){
  const e=ELEMENTS[state.role]||ELEMENTS.earth,roleText=`${e.icon} ${e.name.toUpperCase()}`;
  $('#hudRole').textContent=state.mode==='singleplayer'?`SOLO · ${roleText}`:state.mode==='chaos'?`CAOS · ${roleText}`:roleText;
  $('#chaosHudBadge')?.classList.toggle('hidden',state.mode!=='chaos');
  $('#hudLevel').textContent=state.level;$('#hudDeaths').textContent=state.deaths;refreshEconomyUI();
  $('#difficultyLabel').textContent=difficultyName(state.level);
  const mechanic=$('#mechanicLabel');if(mechanic)mechanic.textContent=mechanicName(state.level);
  updateAbilityHud(performance.now());
}
function difficultyName(l){return castleRegion(l).name;}
function mechanicName(l){
  if(state.mode==='chaos'){
    if(l%100===0)return'4 RUNAS • CHEFE • MORTE COMPARTILHADA';
    const seals=Math.min(4,(state.room?.chaosSeals||[]).length);
    if(isJokerLevel(l))return`🃏 CORINGA • SELOS ${seals}/4 • REGRAS PROIBIDAS`;
    return`SELOS ${seals}/4 • QUARTETO ELEMENTAL • ${castleRegion(l).mechanics}`;
  }
  if(l%100===0)return'CHEFE • RITUAL • INIMIGOS';
  if(isJokerLevel(l))return'🃏 FASE CORINGA • REGRAS PROIBIDAS • CASTELO INSTÁVEL';
  if(l<5)return'CALMARIA SUSPEITA';if(l<15)return'PEGADINHAS • INIMIGOS • FALSA SEGURANÇA';return`${castleRegion(l).mechanics} • INIMIGOS`;
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

const keys={};
const activeTouchKeys=new Set();
function releaseTouchKey(key){keys[key]=false;activeTouchKeys.delete(key);}
document.querySelectorAll('[data-touch-key]').forEach(btn=>{
  const key=String(btn.dataset.touchKey||'').toLowerCase();
  const press=e=>{
    e.preventDefault();
    try{btn.setPointerCapture?.(e.pointerId);}catch{}
    activeTouchKeys.add(key);keys[key]=true;btn.classList.add('pressed');
  };
  const release=e=>{
    e?.preventDefault?.();
    releaseTouchKey(key);btn.classList.remove('pressed');
  };
  btn.addEventListener('pointerdown',press);
  btn.addEventListener('pointerup',release);
  btn.addEventListener('pointercancel',release);
  btn.addEventListener('lostpointercapture',release);
  btn.addEventListener('contextmenu',e=>e.preventDefault());
});
document.querySelectorAll('[data-touch-action="ability"]').forEach(btn=>{
  btn.addEventListener('pointerdown',e=>{
    e.preventDefault();
    try{btn.setPointerCapture?.(e.pointerId);}catch{}
    btn.classList.add('pressed');activateAbility();
  });
  const clear=e=>{e?.preventDefault?.();btn.classList.remove('pressed');};
  btn.addEventListener('pointerup',clear);
  btn.addEventListener('pointercancel',clear);
  btn.addEventListener('lostpointercapture',clear);
  btn.addEventListener('contextmenu',e=>e.preventDefault());
});
addEventListener('blur',()=>{for(const key of activeTouchKeys)keys[key]=false;activeTouchKeys.clear();});
addEventListener('keydown',e=>{
  if(state.paused||!$('#settingsModal')?.classList.contains('hidden'))return;
  const k=e.key.toLowerCase();keys[k]=true;
  if(k==='r'&&!e.repeat)restartGame();
  if(k===' '&&!e.repeat){
    if(gameplayVisible())e.preventDefault();
    activateAbility();
  }
});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);

function activateAbility(){
  if(!state.running)return;
  const now=performance.now(),rule=ABILITY_RULES[state.role]||ABILITY_RULES.earth;
  if(now<state.abilityCooldownUntil)return;
  state.abilityStartedAt=now;
  state.abilityUntil=now+rule.duration;
  // O cooldown começa quando o efeito termina: poder forte, mas sem spam.
  state.abilityCooldownUntil=state.abilityUntil+rule.cooldown*(activeRelicId()==='chronoglass'?.90:1);
  state.abilityLastPulse=now-rule.pulse;
  state.abilityHits=0;state.abilityRootFx=null;
  state.abilityPhaseUntil=now+(state.role==='darkness'?650:state.role==='earth'?360:0);
  if(state.role==='light'||state.role==='darkness')state.invulnUntil=Math.max(state.invulnUntil,now+320);
  burst(player.x+21,player.y+28,22,(ELEMENTS[state.role]||ELEMENTS.earth).color);
  state.screenShake=Math.max(state.screenShake,state.role==='earth'?7:3);
  processAbilityCombat(now,true);
  updateAbilityHud(now);
}
function abilityProgress(now=performance.now(),started=state.abilityStartedAt,until=state.abilityUntil){
  if(!started||until<=started)return 0;
  return Math.max(0,Math.min(1,(now-started)/(until-started)));
}
function livingEnemies(){
  return (state.levelData?.enemies||[]).filter(e=>!state.trapState.get('enemyDead'+e.id));
}
function nearestEnemyInRadius(p,radius){
  let best=null,bestD=Infinity;
  for(const e of livingEnemies()){
    const r=enemyRect(e),dx=(r.x+r.w/2)-(p.x+p.w/2),dy=(r.y+r.h/2)-(p.y+p.h/2),d=dx*dx+dy*dy;
    if(d<=radius*radius&&d<bestD){best={enemy:e,rect:r};bestD=d;}
  }
  return best;
}
function abilityHitEnemy(hit,color){
  if(!hit||state.abilityHits>=(ABILITY_RULES[state.role]?.maxHits||1))return false;
  state.abilityHits+=1;defeatEnemy(hit.enemy);
  burst(hit.rect.x+hit.rect.w/2,hit.rect.y+hit.rect.h/2,12,color);
  state.screenShake=Math.max(state.screenShake,4);
  return true;
}
function airTornadoRectFor(x,y,facing=1,p=0){
  const dir=facing||1,cx=x+21+dir*(55+p*430),cy=y+30+Math.sin(p*Math.PI*5)*18;
  return {x:cx-34,y:cy-34,w:68,h:68,cx,cy};
}
function localAirTornadoRect(now=performance.now()){
  return airTornadoRectFor(player.x,player.y,player.facing||1,abilityProgress(now));
}
function processAbilityCombat(now=performance.now(),force=false){
  if(now>=state.abilityUntil||!state.levelData)return;
  const role=state.role,rule=ABILITY_RULES[role]||ABILITY_RULES.earth;
  if(state.abilityHits>=rule.maxHits)return;
  if(role==='air'){
    const tornado=localAirTornadoRect(now);
    for(const e of livingEnemies()){
      if(state.abilityHits>=rule.maxHits)break;
      const r=enemyRect(e);
      if(overlap(tornado,r))abilityHitEnemy({enemy:e,rect:r},ELEMENTS.air.color);
    }
    return;
  }
  if(!force&&now-state.abilityLastPulse<rule.pulse)return;
  state.abilityLastPulse=now;
  const hit=nearestEnemyInRadius(player,rule.radius);
  if(!hit)return;
  if(role==='earth'){
    state.abilityRootFx={x:hit.rect.x+hit.rect.w/2,y:hit.rect.y+hit.rect.h/2,until:now+460};
    abilityHitEnemy(hit,ELEMENTS.earth.color);
  }else if(role==='light'){
    abilityHitEnemy(hit,'#fff2a0');
  }else if(role==='darkness'){
    abilityHitEnemy(hit,'#7c3cff');
  }
}
function updateAbilityHud(now=performance.now()){
  const hud=$('#abilityHud'),text=$('#abilityHudText'),bar=$('#abilityCooldownBar');if(!hud||!text||!bar)return;
  const rule=ABILITY_RULES[state.role]||ABILITY_RULES.earth;
  hud.classList.remove('ready','active','cooldown');
  if(now<state.abilityUntil){
    const remaining=Math.max(0,(state.abilityUntil-now)/1000);
    hud.classList.add('active');text.textContent=`${rule.label} ${remaining.toFixed(1)}s`;
    bar.style.width=`${Math.max(0,100*(state.abilityUntil-now)/rule.duration)}%`;
    return;
  }
  if(now<state.abilityCooldownUntil){
    const remaining=Math.max(0,(state.abilityCooldownUntil-now)/1000);
    const pct=Math.max(0,Math.min(100,100*(1-(state.abilityCooldownUntil-now)/rule.cooldown)));
    hud.classList.add('cooldown');text.textContent=`RECARGA ${remaining.toFixed(1)}s`;bar.style.width=pct+'%';return;
  }
  hud.classList.add('ready');text.textContent='PODER PRONTO';bar.style.width='100%';
}

const player={x:90,y:680,w:42,h:56,vx:0,vy:0,onGround:false,dead:false,facing:1,landedAt:0,
  reset(){
    const starts=state.mode==='chaos'?[28,75,122,169]:state.mode==='multiplayer'?[70,125]:[90];
    this.x=starts[Math.min(starts.length-1,state.slot||0)]||90;this.y=690;this.vx=this.vy=0;this.dead=false;this.onGround=false;this.landedAt=0;
  },
  update(dt){
    if(!state.running||this.dead)return;
    const ld=state.levelData,cfg=ELEMENTS[state.role]||ELEMENTS.earth;let left=keys['arrowleft']||keys['a'],right=keys['arrowright']||keys['d'];const jump=keys['w']||keys['arrowup'];
    const reversed=!!ld.joker&&ld.jokerRules?.includes('reverse')&&ld.reverseZones?.some(z=>overlap(this,z));if(reversed){const t=left;left=right;right=t;}
    const ability=performance.now()<state.abilityUntil;let accel=cfg.accel,max=cfg.max,gravity=cfg.gravity,jumpPower=cfg.jump;
    if(ld.jokerRules?.includes('heavy')){gravity*=1.28;jumpPower*=.92;}if(ld.jokerRules?.includes('float')){gravity*=.67;jumpPower*=1.10;}
    if(state.role==='air'&&ability){max=520;gravity=780;}if(state.activeBoosts.speed){accel*=1.15;max*=1.2;}if(state.activeBoosts.jump)jumpPower*=1.15;
    if(activeRelicId()==='windstep'){accel*=1.08;max*=1.08;}if(activeRelicId()==='abyssFeather')jumpPower*=1.08;
    if(left&&!right)this.facing=-1;if(right&&!left)this.facing=1;
    if(left)this.vx-=accel*dt;if(right)this.vx+=accel*dt;if(!left&&!right)this.vx*=Math.pow(.001,dt);this.vx=Math.max(-max,Math.min(max,this.vx));
    if(jump&&this.onGround){this.vy=jumpPower;this.onGround=false;state.runStats.jumps++;}
    if(state.role==='air'&&ability&&jump&&this.vy>0)this.vy-=900*dt;
    this.vy+=gravity*dt;this.vy=Math.min(this.vy,900);
    const wasGrounded=this.onGround;
    this.x+=this.vx*dt;collideWorld(this,'x');this.y+=this.vy*dt;this.onGround=false;collideWorld(this,'y');
    if(this.onGround&&!wasGrounded)this.landedAt=performance.now();
    this.x=Math.max(0,Math.min(W-this.w,this.x));if(this.y>H+100)return die(this);
    recordReplayFrame();processAbilityCombat(performance.now());
    processHazards(this,state.role);processTrolls(this);processSetPieces(this,dt,state.role);processV006Hazards(this,dt);processBoss(dt);processChaosSeal();
    const at=goalAccessible()&&overlap(this,currentGoal());
    if(state.mode==='singleplayer'){if(at)completeSoloLevel();return;}
    if(at!==state.lastGoalSent){state.lastGoalSent=at;socket.emit('goal-state',{atGoal:at});}
    const now=performance.now();if(now-state.lastNet>32){
      state.lastNet=now;
      const rootFx=state.abilityRootFx&&state.abilityRootFx.until>now?{x:state.abilityRootFx.x,y:state.abilityRootFx.y}:null;
      socket.emit('player-state',{x:this.x,y:this.y,vx:this.vx,vy:this.vy,onGround:this.onGround,landPulse:now-this.landedAt<180,role:state.role,slot:state.slot,level:state.level,ability,abilityProgress:ability?abilityProgress(now):0,facing:this.facing,rootFx,cosmetics:profile.owned,relic:activeRelicId()});
    }
  }
};

function updateSolo(dt){player.update(dt);}
function completeSoloLevel(){
  if(state.soloTransition)return;state.soloTransition=true;
  const completed=state.level,result=finalizeLevelStats(completed);rewardLevel(completed);
  if(completed%100===0){profile.stats.bosses=(profile.stats.bosses||0)+1;unlockAchievement('firstBoss');}
  if(completed>=1000){
    state.running=false;profile.stats.finished=(profile.stats.finished||0)+1;unlockAchievement('thousand');saveProfile();saveSoloProgress(true);
    const ending=endingForRun();showOverlay('🏆 1000/1000 · '+ending.name,`${ending.text} · ${ELEMENTS[state.role].name} · ${state.deaths} mortes · rank final ${result.rank}`,0);return;
  }
  state.level+=1;saveSoloProgress(false);showOverlay(`✓ SALA SUPERADA · RANK ${result.rank}`,`${result.time.toFixed(1)}s · ${result.deaths} morte(s) na sala · próxima: fase ${state.level}`,720);setTimeout(()=>startLevel(state.level),750);
}

function elapsed(){return Math.max(0,(performance.now()-state.levelStart)/1000);}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function pointInRect(x,y,r){return x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;}
function roleImmune(type,role){return (type==='roots'&&role==='earth')||(type==='storm'&&role==='air')||(type==='curse'&&role==='light');}

function dynamicElevator(e){
  const t=elapsed()*e.speed+e.phase; const q=(Math.sin(t)+1)/2;
  return {x:e.x,y:e.y0+(e.y1-e.y0)*q,w:e.w,h:e.h,_kind:'elevator'};
}
function dynamicCrusher(c){
  const t=elapsed()*c.speed+c.phase, q=(Math.sin(t)+1)/2;
  return c.axis==='x'?{x:c.a+(c.b-c.a)*q,y:c.y,w:c.w,h:c.h}:{x:c.x,y:c.a+(c.b-c.a)*q,w:c.w,h:c.h};
}
function dynamicBookshelf(b){
  const t=elapsed()*b.speed+b.phase, q=(Math.sin(t)+1)/2;
  return {x:b.x0+(b.x1-b.x0)*q,y:b.y,w:b.w,h:b.h};
}
function chandelierRect(ch){
  const trig=state.trapState.get('ch'+ch.id); if(!trig)return {x:ch.x,y:ch.y,w:ch.w,h:ch.h};
  const age=(performance.now()-trig)/1000; const y=Math.min(ch.floorY-ch.h,ch.y+Math.max(0,age-.25)*820);
  return {x:ch.x,y,w:ch.w,h:ch.h};
}
function bridgeActiveTile(t){
  const trig=state.trapState.get('br'+t.id); if(!trig)return true;
  return performance.now()-trig<t.delay;
}
function getSolidRects(){
  const ld=state.levelData, solids=[...ld.platforms];
  for(const f of ld.fakeFloors){const t=state.trapState.get('f'+f.id)||0;if(!t||performance.now()-t<650)solids.push(f);}
  for(const t of ld.bridgeTiles||[])if(bridgeActiveTile(t))solids.push(t);
  for(const e of ld.elevators||[])solids.push(dynamicElevator(e));
  for(const b of ld.bookshelves||[])solids.push(dynamicBookshelf(b));
  for(const v of ld.vanishPlatforms||[]){const t=state.trapState.get('vp'+v.id);if(!t||performance.now()-t<v.delay)solids.push(v);}
  const door=ld.door;if(door&&!doorOpen())solids.push(door);
  if(ld.boss&&!state.bossDefeated)solids.push(ld.boss.barrier);
  return solids;
}
function collideWorld(p,axis){
  for(const s of getSolidRects()){
    if(!overlap(p,s))continue;
    if(axis==='x'){if(p.vx>0)p.x=s.x-p.w;else if(p.vx<0)p.x=s.x+s.w;p.vx=0;}
    else {if(p.vy>0){p.y=s.y-p.h;p.vy=0;p.onGround=true;}else if(p.vy<0){p.y=s.y+s.h;p.vy=0;}}
  }
}

function processHazards(p,role=state.role){
  const ld=state.levelData,now=performance.now();if(now<state.invulnUntil)return;
  const shadowPhase=role==='darkness'&&performance.now()<state.abilityPhaseUntil;
  for(const h of ld.hazards){if(overlap(p,h)&&!roleImmune(h.type,role)&&!shadowPhase)return die(p);}
  for(const sp of activeSpikes())if(overlap(p,sp)&&!shadowPhase)return die(p);
  for(const c of ld.crushers||[])if(overlap(p,dynamicCrusher(c)))return die(p);
  for(const a of ld.armors||[])if(overlap(p,armorRect(a))){if(role==='earth'&&performance.now()<state.abilityPhaseUntil){state.trapState.set('armor'+a.id,performance.now()+1800);burst(a.x||a.x0,a.y,9,ELEMENTS.earth.color);}else if(!shadowPhase)return die(p);}
  for(const g of ld.ghosts||[])if(overlap(p,ghostRect(g))&&!shadowPhase)return die(p);
  for(const fb of dragonFireballs())if(circleRect(fb,p)&&!shadowPhase)return die(p);
  for(const bf of bossProjectiles())if(circleRect(bf,p)&&!shadowPhase)return die(p);
  for(const f of dynamicFallingBlocks())if(overlap(p,f))return die(p);
  for(const w of dynamicSlamWalls())if(overlap(p,w))return die(p);
  processEnemies(p,role);
}
function circleRect(c,r){const x=Math.max(r.x,Math.min(c.x,r.x+r.w)),y=Math.max(r.y,Math.min(c.y,r.y+r.h));const dx=c.x-x,dy=c.y-y;return dx*dx+dy*dy<c.r*c.r;}
function abilityActiveFor(){return performance.now()<state.abilityUntil;}
function consumeShield(){
  if(!state.activeBoosts.shield)return false;state.activeBoosts.shield=false;state.invulnUntil=performance.now()+1200;state.screenShake=8;burst(player.x+21,player.y+25,28);showOverlay('🛡️ ESCUDO QUEBRADO','A runa arcana absorveu o golpe fatal.',650);return true;
}
function die(p=player){
  if(performance.now()<state.invulnUntil)return;if(consumeShield())return;
  if(activeRelicId()==='fracturedHeart'&&!state.relicGuardUsed){
    state.relicGuardUsed=true;state.invulnUntil=performance.now()+1400;state.screenShake=7;burst(p.x+21,p.y+25,22,'#ff6b86');showMiniToast('🫀 CORAÇÃO TRINCADO','A relíquia recusou esta morte.','relic');return;
  }
  beginDeathReplay();unlockAchievement('firstDeath');
  if(state.mode==='singleplayer'){
    if(state.soloResetPending||p.dead)return;p.dead=true;state.soloResetPending=true;state.deaths+=1;profile.stats.deaths=(profile.stats.deaths||0)+1;if(profile.stats.deaths>=100)unlockAchievement('death100');addCoins(5);saveProfile();saveSoloProgress(false);burst(p.x+21,p.y+25,18);
    state.screenShake=18;state.running=false;showOverlay('☠️ PEGADINHA DO CASTELO',deathLine(),760);showCastleWhisper(deathLine());setTimeout(()=>openShop({death:true}),860);return;
  }
  if(player.dead)return;player.dead=true;burst(player.x+21,player.y+25,18);socket.emit('player-death');
}
function platePressed(plate){
  if(!plate)return false;
  if(overlap(player,plate))return true;
  if(state.mode==='singleplayer')return false;
  for(const remote of state.remotePlayers.values()){
    if(remote.level!==state.level)continue;
    if(overlap({x:remote.x,y:remote.y,w:42,h:56},plate))return true;
  }
  return false;
}
function doorOpen(){
  const plates=[state.levelData.plate,state.levelData.plate2].filter(Boolean);if(!plates.length)return true;
  if(state.mode==='singleplayer'){
    if(state.trapState.get('soloDoorOpen'))return true;
    if(plates.some(platePressed)){state.trapState.set('soloDoorOpen',true);return true;}
    return false;
  }
  if(state.mode==='chaos')return plates.every(platePressed);
  return plates.some(platePressed);
}
function goalAccessible(){
  if(state.levelData.boss&&!state.bossDefeated)return false;
  if(state.mode==='chaos'&&state.level%100!==0&&((state.room?.chaosSeals||[]).length<4))return false;
  return true;
}
function currentGoal(){
  const g=state.levelData.goal, move=state.levelData.movingExit;if(!move)return g;
  const trig=state.trapState.get('movingExit');if(!trig)return g;
  const q=Math.min(1,(performance.now()-trig)/360);
  return {x:g.x+(move.toX-g.x)*q,y:g.y+(move.toY-g.y)*q,w:g.w,h:g.h};
}
function deathLine(){
  const early=['Você acabou de aprender a regra da sala.','Era seguro até você acreditar que era seguro.','O castelo esperou você apertar para a direita.','Volta. Agora você sabe onde está UMA das armadilhas.'];
  const cruel=['Você confiou no chão. O chão discordou.','A saída parecia perto demais, né?','O castelo anotou esse salto. Tente de novo.','Você decorou a primeira armadilha. Faltam as outras.','Era óbvio. Depois que acontece.','O corredor mentiu para você.','Essa plataforma tinha outros planos.','Você pulou certo. O castelo também.','Não foi reflexo. Era memória.','Quase. Essa é a palavra favorita do castelo.','Agora tenta dormir sem pensar nessa fase.','A saída viu você chegando e mudou de ideia.','Eu literalmente mostrei o espinho.','O outro jogador já entendeu. Você não.','Você está me ensinando exatamente onde colocar a próxima armadilha.'];
  if(state.levelData?.pursuer?.mode==='hunt')return 'Agora você entendeu por que ele ficava só olhando.';
  if(state.level===666)return 'A sala 666 não registra mortes. Ela registra visitantes.';
  const lines=state.level<5?early:cruel;return lines[(state.level+state.deaths+state.attempt)%lines.length];
}
function multiplayerTrapSyncEnabled(){return state.mode==='multiplayer'||state.mode==='chaos';}
function setTrapTrigger(key,when=performance.now(),broadcast=true){
  const current=state.trapState.get(key);if(current)return current;
  state.trapState.set(key,when);state.runStats.trapTriggers++;
  if(broadcast&&multiplayerTrapSyncEnabled())socket.emit('trap-trigger',{level:state.level,key});
  return when;
}
function applySharedTrapTrigger(key,activatedAt){
  const normalized=String(key||'');if(!normalized||state.trapState.has(normalized))return;
  const stamp=Number(activatedAt)||Date.now(),age=Math.max(0,Math.min(60000,Date.now()-stamp));
  state.trapState.set(normalized,performance.now()-age);
}
function syncRoomTrapSnapshot(room){
  if(!room||!Array.isArray(room.trapStates))return;
  for(const t of room.trapStates)applySharedTrapTrigger(t?.key,t?.activatedAt);
}
function processTrolls(p){
  const ld=state.levelData,now=performance.now();
  if(!ld)return;
  for(const f of ld.fakeFloors||[]){const key='f'+f.id;if(!state.trapState.get(key)&&Math.abs((p.x+p.w/2)-(f.x+f.w/2))<120)setTrapTrigger(key,now);}
  for(const t of ld.popTraps||[]){const key='p'+t.id;if(!state.trapState.get(key)&&p.x>t.triggerX)setTrapTrigger(key,now);}
  for(const t of ld.ambushSpikes||[]){const key='as'+t.id;if(!state.trapState.get(key)&&p.x>t.triggerX)setTrapTrigger(key,now);}
  for(const t of ld.bridgeTiles||[]){const key='br'+t.id;if(!state.trapState.has(key)&&overlap(p,{x:t.x-3,y:t.y-30,w:t.w+6,h:t.h+38}))setTrapTrigger(key,now);}
  for(const v of ld.vanishPlatforms||[]){const key='vp'+v.id;if(!state.trapState.has(key)&&overlap(p,{x:v.x-3,y:v.y-48,w:v.w+6,h:v.h+54}))setTrapTrigger(key,now);}
  for(const ch of ld.chandeliers||[]){const key='ch'+ch.id;if(!state.trapState.has(key)&&p.x>ch.triggerX)setTrapTrigger(key,now);}
  for(const b of ld.fallingBlocks||[]){const key='fb'+b.id;if(!state.trapState.has(key)&&p.x>b.triggerX)setTrapTrigger(key,now);}
  for(const w of ld.slamWalls||[]){const key='sw'+w.id;if(!state.trapState.has(key)&&p.x>w.triggerX)setTrapTrigger(key,now);}
  if(ld.movingExit&&!state.trapState.has('movingExit')){const g=currentGoal();if(Math.abs((p.x+p.w/2)-(g.x+g.w/2))<ld.movingExit.triggerDist)setTrapTrigger('movingExit',now);}
  for(const fd of ld.fakeDoors||[]){const key='fd'+fd.id,last=state.trapState.get(key)||0;if(overlap(p,fd)&&now-last>1800){state.trapState.set(key,now);p.x=Math.max(40,fd.x-260);p.vx=-250;state.screenShake=10;burst(fd.x+fd.w/2,fd.y+40,12);}}
  for(const fg of ld.fakeGoals||[]){const key='fg'+fg.id;if(!state.trapState.get(key)&&overlap(p,fg)){setTrapTrigger(key,now);p.vx=-330;p.vy=-330;state.screenShake=14;burst(fg.x+28,fg.y+45,18);}}
}
function dynamicFallingBlocks(){const out=[],now=performance.now();for(const b of state.levelData.fallingBlocks||[]){const trig=state.trapState.get('fb'+b.id);if(!trig)continue;const age=(now-trig)/1000;if(age<b.delay)continue;const y=Math.min(b.floorY-b.h,b.y+(age-b.delay)*b.speed);out.push({x:b.x,y,w:b.w,h:b.h});}return out;}
function dynamicSlamWalls(){const out=[],now=performance.now();for(const w of state.levelData.slamWalls||[]){const trig=state.trapState.get('sw'+w.id);if(!trig)continue;const age=(now-trig)/1000;if(age<w.delay)continue;const t=age-w.delay;if(t>w.travel*2+.18)continue;let q=t<=w.travel?t/w.travel:1-(t-w.travel)/w.travel;q=Math.max(0,Math.min(1,q));const eased=1-Math.pow(1-q,3);out.push({x:w.startX+(w.endX-w.startX)*eased,y:w.y,w:w.w,h:w.h});}return out;}
function processSetPieces(p,dt,role){
  for(const ch of state.levelData.chandeliers||[]){const r=chandelierRect(ch),trig=state.trapState.get('ch'+ch.id);if(trig&&performance.now()-trig>300&&overlap(p,r))return die(p);}
  for(const z of state.levelData.windGusts||[]){if(overlap(p,z)&&role!=='air'){p.vx+=z.force*dt;p.vx=Math.max(-560,Math.min(560,p.vx));}}
}
function activeSpikes(){
  const arr=[...(state.levelData.spikes||[])],now=performance.now();
  for(const t of state.levelData.popTraps||[])if(state.trapState.get('p'+t.id))arr.push(t.spike);
  for(const t of state.levelData.ambushSpikes||[]){const trig=state.trapState.get('as'+t.id);if(trig&&now-trig>=t.delay)arr.push(t.spike);}
  return arr;
}

function armorRect(a){
  const disabledUntil=state.trapState.get('armor'+a.id)||0;if(disabledUntil>performance.now())return {x:-9999,y:-9999,w:1,h:1};
  const t=elapsed()*a.speed+a.phase, q=(Math.sin(t)+1)/2;
  return {x:a.x0+(a.x1-a.x0)*q,y:a.y,w:a.w,h:a.h};
}
function ghostRect(g){
  const t=elapsed()*g.speed+g.phase;
  return {x:g.x+Math.sin(t)*g.rangeX,y:g.y+Math.cos(t*1.3)*g.rangeY,w:g.w,h:g.h};
}
function enemyRect(e){
  if(state.trapState.get('enemyDead'+e.id))return {x:-9999,y:-9999,w:1,h:1};
  const t=elapsed()*e.speed+e.phase,q=(Math.sin(t)+1)/2,x=e.x0+(e.x1-e.x0)*q,y=e.y+(e.rangeY?Math.sin(t*1.7)*e.rangeY:0);
  return {x,y,w:e.w,h:e.h};
}
function defeatEnemy(e,remote=false){
  const key='enemyDead'+e.id;if(state.trapState.get(key))return;state.trapState.set(key,true);
  if(!remote){addCoins(2);if(state.mode==='multiplayer'||state.mode==='chaos')socket.emit('enemy-defeated',{id:e.id,level:state.level});}
  burst((e.x0+e.x1)/2,e.y,14);
}
function attackEnemiesAround(p,role){
  // Compatibilidade com chamadas antigas: o dano contínuo agora é controlado por processAbilityCombat().
  const rule=ABILITY_RULES[role];if(!rule)return;
  const hit=nearestEnemyInRadius(p,rule.radius||0);if(hit)abilityHitEnemy(hit,(ELEMENTS[role]||ELEMENTS.earth).color);
}
function processEnemies(p,role){
  const phase=role==='darkness'&&performance.now()<state.abilityPhaseUntil;
  for(const e of state.levelData.enemies||[]){if(state.trapState.get('enemyDead'+e.id))continue;const r=enemyRect(e);if(!overlap(p,r))continue;
    if(!phase)return die(p);
  }
}
function dragonFireballs(){
  const out=[]; for(const d of state.levelData.dragons||[]){
    const t=elapsed()+d.phase; const cycle=t%d.interval; if(cycle>d.life)continue;
    const x=d.fromRight?d.x-cycle*d.speed:d.x+cycle*d.speed;
    const y=d.y+Math.sin(cycle*5+d.phase)*34; out.push({x,y,r:13});
  } return out;
}
function bossProjectiles(){
  const b=state.levelData.boss;if(!b||state.bossDefeated)return[];
  const out=[],t=elapsed(),count=3+Math.floor(state.level/180),cx=b.x+b.w/2,theme=b.element||'darkness';
  const color=(ELEMENTS[theme]||ELEMENTS.darkness).color;
  for(let i=0;i<count;i++){
    const tt=(t+i*.73)%b.attackInterval,dir=i%2===0?-1:1;let x,y,r=14+i%2*3;
    if(theme==='earth'){x=cx+dir*tt*b.projectileSpeed*.82;y=690-Math.abs(Math.sin(tt*4+i))*85;r=18;}
    else if(theme==='air'){x=cx+dir*tt*b.projectileSpeed*1.22;y=500+Math.sin(tt*6+i)*180;r=12;}
    else if(theme==='light'){x=130+i*(1340/Math.max(1,count-1));y=((t*260+i*140)%760)+40;r=11;}
    else{x=cx+dir*tt*b.projectileSpeed;y=565+Math.sin(tt*3.7+i)*105;}
    if(x>-40&&x<W+40&&y>-40&&y<H+40)out.push({x,y,r,color});
  }
  return out;
}

function processBoss(dt){
  const b=state.levelData.boss;if(!b||state.bossDefeated)return;
  const runes=Object.values(b.runes||{});
  if(state.mode==='singleplayer'){
    const onRune=runes.some(r=>overlap(player,r));if(onRune)state.bossCharge=Math.min(b.required,state.bossCharge+dt);else state.bossCharge=Math.max(0,state.bossCharge-dt*.65);
    if(state.bossCharge>=b.required){state.bossDefeated=true;unlockAchievement('firstBoss');burst(b.x+80,b.y+90,42);showOverlay('⚔️ PROTEÇÃO QUEBRADA','Corra para a saída!',850);}return;
  }
  if(state.mode==='chaos'){
    const meRune=b.runes?.[state.role],me=!!(meRune&&overlap(player,meRune));
    if(me!==state.lastRuneSent){state.lastRuneSent=me;socket.emit('rune-state',{atRune:me,level:state.level});}
    let allActive=me&&state.remotePlayers.size>=3;
    if(allActive){
      const seen=new Set([state.role]);
      for(const remote of state.remotePlayers.values()){
        if(remote.level!==state.level)continue;
        const rune=b.runes?.[remote.role],on=!!(rune&&overlap({x:remote.x,y:remote.y,w:42,h:56},rune));
        if(on)seen.add(remote.role);else allActive=false;
      }
      allActive=allActive&&seen.size===4;
    }
    if(allActive)state.bossCharge=Math.min(b.required,state.bossCharge+dt);else state.bossCharge=Math.max(0,state.bossCharge-dt*.65);
    return;
  }
  const myKey=state.slot===0?'left':'right',otherKey=state.slot===0?'right':'left',meRune=b.runes[myKey],otherRune=b.runes[otherKey];
  const remote=[...state.remotePlayers.values()].find(r=>r.level===state.level);
  const me=!!(meRune&&overlap(player,meRune)),other=!!(remote&&otherRune&&overlap({x:remote.x,y:remote.y,w:42,h:56},otherRune));
  if(me!==state.lastRuneSent){state.lastRuneSent=me;socket.emit('rune-state',{atRune:me,level:state.level});}
  if(me&&other)state.bossCharge=Math.min(b.required,state.bossCharge+dt);else state.bossCharge=Math.max(0,state.bossCharge-dt*.65);
}

function applyChaosMutators(ld,level){
  if(!ld)return ld;
  ld.chaosMode=true;
  ld.roomTitle=`CAOS · ${ld.roomTitle||castleRegion(level).name}`;
  if(ld.boss){
    ld.boss.required=(Number(ld.boss.required)||2.5)+0.7;
    ld.boss.runes={
      earth:{x:330,y:665,w:86,h:20},
      air:{x:675,y:585,w:86,h:20},
      light:{x:839,y:585,w:86,h:20},
      darkness:{x:1185,y:665,w:86,h:20}
    };
    return ld;
  }
  const reach=reachablePlatformSet(ld);
  const reachable=(reach.ps||[]).filter((p,i)=>reach.seen.has(i)&&p&&p.w>=90&&p.x>210&&p.x<1405).sort((a,b)=>a.x-b.x);
  const supports=(ld.platforms||[]).filter(p=>p&&p.w>=90&&p.x>210&&p.x<1405).sort((a,b)=>a.x-b.x);
  const fallback=(ld.platforms||[]).filter(p=>p&&p.w>=90).sort((a,b)=>a.x-b.x);
  const pool=reachable.length>=4?reachable:supports.length>=4?supports:fallback;
  const roles=['earth','air','light','darkness'],seals={};
  roles.forEach((role,i)=>{
    const idx=pool.length>1?Math.round(i*(pool.length-1)/3):0,p=pool[idx]||{x:260+i*300,y:790,w:180};
    const w=Math.min(72,Math.max(52,p.w-24)),x=Math.max(p.x+8,Math.min(p.x+p.w-w-8,p.x+p.w/2-w/2));
    seals[role]={x,y:p.y-14,w,h:14,role};
  });
  ld.chaosSeals=seals;
  for(const seal of Object.values(seals))clearCriticalZone(ld,rectAround(seal,24,32));
  ld.enemies=(ld.enemies||[]).filter(e=>{
    const sweep=rangeRect(e.x0,e.x1,e.y,e.h);
    return !Object.values(seals).some(s=>rectIntersects(sweep,rectAround(s,32,58)));
  });
  const enemyPlatforms=pool.filter(p=>!Object.values(seals).some(s=>Math.abs((s.x+s.w/2)-(p.x+p.w/2))<95));
  const extraCount=Math.min(5,2+Math.floor(level/250));
  for(let i=0;i<extraCount&&enemyPlatforms.length;i++){
    const p=enemyPlatforms[(i*2+level)%enemyPlatforms.length];
    if(!p||p.w<90)continue;
    const x0=p.x+12,x1=Math.max(x0,p.x+p.w-54);
    ld.enemies.push({id:7000000+level*10+i,type:i%3===2?'bat':'sentinel',x0,x1,y:p.y-46,w:42,h:46,speed:1.15+(i*.12)+(level/2200),phase:(level+i)*.73,rangeY:i%3===2?22:0});
  }
  return ld;
}
function processChaosSeal(){
  if(state.mode!=='chaos'||state.level%100===0||state.lastChaosSealSent)return;
  const seal=state.levelData?.chaosSeals?.[state.role];if(!seal)return;
  if((state.room?.chaosSeals||[]).includes(state.role)){state.lastChaosSealSent=true;return;}
  if(overlap(player,seal)){
    state.lastChaosSealSent=true;
    socket.emit('chaos-seal-activate',{level:state.level});
  }
}

function rectIntersects(a,b){return !!(a&&b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y);}
function rangeRect(x0,x1,y,h){const x=Math.min(x0,x1);return {x,y,w:Math.abs(x1-x0),h};}
function rectAround(r,mx=0,my=mx){return {x:r.x-mx,y:r.y-my,w:r.w+mx*2,h:r.h+my*2};}
function removeRectHits(arr,zone,toRect=v=>v){return (arr||[]).filter(v=>{const r=toRect(v);return !r||!rectIntersects(r,zone);});}
function supportBelowPlate(ld,plate){
  const probe={x:plate.x+6,y:plate.y+plate.h,w:Math.max(8,plate.w-12),h:14};
  return (ld.platforms||[]).some(p=>rectIntersects(probe,p));
}

function sweepRectFor(kind,v){
  if(!v)return null;
  if(kind==='elevator')return {x:v.x,y:Math.min(v.y0,v.y1),w:v.w,h:Math.abs(v.y1-v.y0)+v.h};
  if(kind==='bookshelf')return {x:Math.min(v.x0,v.x1),y:v.y,w:Math.abs(v.x1-v.x0)+v.w,h:v.h};
  if(kind==='armor')return {x:Math.min(v.x0,v.x1),y:v.y,w:Math.abs(v.x1-v.x0)+v.w,h:v.h};
  if(kind==='crusher')return v.axis==='x'?{x:Math.min(v.a,v.b),y:v.y,w:Math.abs(v.b-v.a)+v.w,h:v.h}:{x:v.x,y:Math.min(v.a,v.b),w:v.w,h:Math.abs(v.b-v.a)+v.h};
  if(kind==='ghost')return {x:v.x-v.rangeX,y:v.y-v.rangeY,w:v.w+v.rangeX*2,h:v.h+v.rangeY*2};
  if(kind==='chandelier')return {x:v.x,y:v.y,w:v.w,h:Math.max(v.h,v.floorY-v.y)};
  if(kind==='fallingBlock')return {x:v.x,y:v.y,w:v.w,h:Math.max(v.h,v.floorY-v.y)};
  if(kind==='slamWall')return {x:Math.min(v.startX,v.endX),y:v.y,w:Math.abs(v.endX-v.startX)+v.w,h:v.h};
  return v;
}
function clearCriticalZone(ld,zone){
  ld.hazards=removeRectHits(ld.hazards,zone);ld.spikes=removeRectHits(ld.spikes,zone);
  ld.fakeFloors=removeRectHits(ld.fakeFloors,zone);ld.bridgeTiles=removeRectHits(ld.bridgeTiles,zone);
  ld.vanishPlatforms=removeRectHits(ld.vanishPlatforms,zone);ld.fakeDoors=removeRectHits(ld.fakeDoors,zone);ld.fakeGoals=removeRectHits(ld.fakeGoals,zone);
  ld.popTraps=(ld.popTraps||[]).filter(t=>!rectIntersects(t.spike,zone));
  ld.ambushSpikes=(ld.ambushSpikes||[]).filter(t=>!rectIntersects(t.spike,zone));
  ld.elevators=removeRectHits(ld.elevators,zone,v=>sweepRectFor('elevator',v));
  ld.bookshelves=removeRectHits(ld.bookshelves,zone,v=>sweepRectFor('bookshelf',v));
  ld.armors=removeRectHits(ld.armors,zone,v=>sweepRectFor('armor',v));
  ld.crushers=removeRectHits(ld.crushers,zone,v=>sweepRectFor('crusher',v));
  ld.ghosts=removeRectHits(ld.ghosts,zone,v=>sweepRectFor('ghost',v));
  ld.chandeliers=removeRectHits(ld.chandeliers,zone,v=>sweepRectFor('chandelier',v));
  ld.fallingBlocks=removeRectHits(ld.fallingBlocks,zone,v=>sweepRectFor('fallingBlock',v));
  ld.slamWalls=removeRectHits(ld.slamWalls,zone,v=>sweepRectFor('slamWall',v));
  ld.windGusts=removeRectHits(ld.windGusts,zone);
  return ld;
}
function supportPlatformForRect(ld,r){
  if(!r)return null;const bottom=r.y+r.h,cx=r.x+r.w/2;
  return (ld.platforms||[]).filter(p=>cx>=p.x-2&&cx<=p.x+p.w+2&&p.y>=bottom&&p.y-bottom<=14).sort((a,b)=>a.y-b.y)[0]||null;
}
function earthJumpTime(fromY,toY){
  const vy=-595,g=1580,rise=fromY-toY,disc=vy*vy-2*g*rise;if(disc<0)return null;
  return (-vy+Math.sqrt(disc))/g;
}
function earthCanJumpPlatform(a,b){
  if(!a||!b||a===b||a.w<42||b.w<42)return false;
  const t=earthJumpTime(a.y,b.y);if(t===null)return false;
  let gap=0;if(b.x>a.x+a.w)gap=b.x-(a.x+a.w);else if(a.x>b.x+b.w)gap=a.x-(b.x+b.w);
  return gap<=330*t+6;
}
function reachablePlatformSet(ld){
  const ps=(ld.platforms||[]).filter(p=>p&&p.w>=42&&p.h>0&&p.y<=790);
  const start=ps.findIndex(p=>100>=p.x&&100<=p.x+p.w&&p.y>=740&&p.y<=795);if(start<0)return {ps,seen:new Set()};
  const seen=new Set([start]),q=[start];
  while(q.length){const i=q.shift(),a=ps[i];for(let j=0;j<ps.length;j++){if(seen.has(j))continue;if(earthCanJumpPlatform(a,ps[j])){seen.add(j);q.push(j);}}}
  return {ps,seen};
}
function earthCanReachSupport(ld,r){
  const target=supportPlatformForRect(ld,r);if(!target)return false;const {ps,seen}=reachablePlatformSet(ld),idx=ps.indexOf(target);return idx>=0&&seen.has(idx);
}
function staticEarthRouteExists(ld){return earthCanReachSupport(ld,ld.goal);}
function protectCriticalLandings(ld){
  // Toda ilha principal mantém pelo menos uma faixa limpa para aterrissagem. As pegadinhas
  // continuam no centro/final das plataformas, mas uma plataforma estreita não pode virar uma parede de morte.
  const bases=(ld.platforms||[]).filter(p=>p.x>220&&p.x<1450&&p.y<=790&&!p._doorBridge&&!p._repairStep);
  for(const p of bases){
    const safeW=Math.min(p.w,p.w<150?p.w:74),zone={x:p.x-4,y:p.y-72,w:safeW+8,h:74};
    ld.spikes=removeRectHits(ld.spikes,zone);
    ld.popTraps=(ld.popTraps||[]).filter(t=>!rectIntersects(t.spike,zone));
    ld.ambushSpikes=(ld.ambushSpikes||[]).filter(t=>!rectIntersects(t.spike,zone));
    ld.chandeliers=removeRectHits(ld.chandeliers,zone,v=>sweepRectFor('chandelier',v));
    ld.fallingBlocks=removeRectHits(ld.fallingBlocks,zone,v=>sweepRectFor('fallingBlock',v));
    ld.fakeDoors=removeRectHits(ld.fakeDoors,zone);ld.fakeGoals=removeRectHits(ld.fakeGoals,zone);
  }
  return ld;
}
function sanitizeBossLevel(ld){
  if(!ld||!ld.boss)return ld;
  const spawnSafe={x:18,y:620,w:210,h:170},goalSafe=rectAround(ld.goal,32,18);clearCriticalZone(ld,spawnSafe);clearCriticalZone(ld,goalSafe);
  for(const rune of Object.values(ld.boss.runes||{})){
    const _rune=rune,stand={x:rune.x-12,y:rune.y-66,w:rune.w+24,h:86};
    // A runa precisa de piso, espaço para um personagem e acesso até ela com o salto da Terra.
    let support=supportPlatformForRect(ld,rune);
    if(!support){const py=rune.y+rune.h+5;support={x:rune.x-30,y:py,w:rune.w+60,h:25,_bossRepair:true};ld.platforms.push(support);}
    clearCriticalZone(ld,stand);
  }
  // Nunca deixa a própria barreira nascer em cima da porta final.
  if(rectIntersects(ld.boss.barrier,rectAround(ld.goal,10,0)))ld.boss.barrier.x=ld.goal.x-65;
  return ld;
}
function finiteGeometryIssues(ld){
  const issues=[];const walk=(v,path='')=>{if(Array.isArray(v))return v.forEach((x,i)=>walk(x,`${path}[${i}]`));if(!v||typeof v!=='object')return;for(const[k,x]of Object.entries(v)){const p=path?`${path}.${k}`:k;if(typeof x==='number'&&!Number.isFinite(x))issues.push(`número inválido em ${p}`);else if(x&&typeof x==='object')walk(x,p);}};walk(ld);return issues;
}
function duplicateTrapIdIssues(ld){
  const issues=[];for(const key of ['fakeFloors','popTraps','ambushSpikes','elevators','chandeliers','armors','crushers','bookshelves','ghosts','bridgeTiles','dragons','fakeDoors','fakeGoals','fallingBlocks','slamWalls','vanishPlatforms','windGusts','enemies']){const seen=new Set();for(const v of ld[key]||[]){if(v.id==null)continue;if(seen.has(v.id))issues.push(`id duplicado em ${key}: ${v.id}`);seen.add(v.id);}}return issues;
}

function sanitizeGeneratedLevel(ld){
  if(!ld)return ld;
  if(ld.boss)return sanitizeBossLevel(ld);
  const floorY=790;
  // Áreas essenciais nunca podem nascer bloqueadas por geometria sólida.
  const spawnSafe={x:18,y:620,w:210,h:170};
  const goalXs=[ld.goal?.x||1515];
  if(ld.movingExit)goalXs.push(ld.movingExit.toX);
  const goalLeft=Math.min(...goalXs)-58,goalRight=Math.max(...goalXs)+(ld.goal?.w||56)+58;
  const goalSafe={x:goalLeft,y:590,w:goalRight-goalLeft,h:200};
  clearCriticalZone(ld,spawnSafe);clearCriticalZone(ld,goalSafe);
  ld.platforms=(ld.platforms||[]).filter(p=>p._doorBridge||p.y>=floorY||(!rectIntersects(p,spawnSafe)&&!rectIntersects(p,goalSafe)));
  ld.elevators=removeRectHits(ld.elevators,spawnSafe,e=>rangeRect(e.x,e.x+e.w,Math.min(e.y0,e.y1),Math.abs(e.y1-e.y0)+e.h));
  ld.elevators=removeRectHits(ld.elevators,goalSafe,e=>rangeRect(e.x,e.x+e.w,Math.min(e.y0,e.y1),Math.abs(e.y1-e.y0)+e.h));
  ld.bookshelves=removeRectHits(ld.bookshelves,spawnSafe,b=>({x:Math.min(b.x0,b.x1),y:b.y,w:Math.abs(b.x1-b.x0)+b.w,h:b.h}));
  ld.bookshelves=removeRectHits(ld.bookshelves,goalSafe,b=>({x:Math.min(b.x0,b.x1),y:b.y,w:Math.abs(b.x1-b.x0)+b.w,h:b.h}));
  ld.fakeDoors=removeRectHits(ld.fakeDoors,goalSafe);
  ld.fakeGoals=removeRectHits(ld.fakeGoals,goalSafe);

  if(ld.door&&ld.plate&&ld.plate2){
    // Corredor cooperativo reservado: nenhuma armadilha procedural pode invadir a área
    // necessária para ficar nas placas, atravessar o portão e fazer o revezamento.
    const coop={x:535,y:500,w:625,h:400};
    ld.platforms=(ld.platforms||[]).filter(p=>p._doorBridge||p.y>=floorY||!rectIntersects(p,coop));
    if(!ld.platforms.some(p=>p._doorBridge))ld.platforms.push({x:540,y:floorY,w:620,h:110,_doorBridge:true});
    // Evita uma coluna alta logo na entrada/saída do corredor. Isso foi a causa das
    // salas em que a placa existia, mas uma parede procedural tornava o acesso impossível.
    const leftApproach={x:235,y:540,w:305,h:250},rightApproach={x:1160,y:540,w:245,h:250};
    ld.platforms=(ld.platforms||[]).filter(p=>p._doorBridge||p.y>=680||(!rectIntersects(p,leftApproach)&&!rectIntersects(p,rightApproach)));
    // Pequenos degraus de contingência mantêm o salto da Terra dentro de uma margem segura
    // sem transformar toda a sala em piso contínuo.
    ld.platforms.push({x:430,y:755,w:92,h:145,_repairStep:true},{x:1200,y:755,w:92,h:145,_repairStep:true},{x:1310,y:755,w:74,h:145,_repairStep:true});
    ld.door={x:845,y:570,w:36,h:220};
    ld.plate={x:675,y:floorY-10,w:68,h:10};
    ld.plate2={x:965,y:floorY-10,w:68,h:10};

    ld.hazards=removeRectHits(ld.hazards,coop);
    ld.spikes=removeRectHits(ld.spikes,coop);
    ld.fakeFloors=removeRectHits(ld.fakeFloors,coop);
    ld.bridgeTiles=removeRectHits(ld.bridgeTiles,coop);
    ld.popTraps=(ld.popTraps||[]).filter(t=>!rectIntersects(t.spike,coop));
    ld.ambushSpikes=(ld.ambushSpikes||[]).filter(t=>!rectIntersects(t.spike,coop));
    ld.reverseZones=removeRectHits(ld.reverseZones,coop);
    ld.elevators=removeRectHits(ld.elevators,coop,e=>({x:e.x,y:Math.min(e.y0,e.y1),w:e.w,h:Math.abs(e.y1-e.y0)+e.h}));
    ld.chandeliers=(ld.chandeliers||[]).filter(ch=>ch.x+ch.w<=coop.x||ch.x>=coop.x+coop.w);
    ld.armors=(ld.armors||[]).filter(a=>Math.max(a.x0,a.x1)+a.w<=coop.x||Math.min(a.x0,a.x1)>=coop.x+coop.w);
    ld.crushers=removeRectHits(ld.crushers,coop,c=>c.axis==='x'?({x:Math.min(c.a,c.b),y:c.y,w:Math.abs(c.b-c.a)+c.w,h:c.h}):({x:c.x,y:Math.min(c.a,c.b),w:c.w,h:Math.abs(c.b-c.a)+c.h}));
    ld.bookshelves=(ld.bookshelves||[]).filter(b=>Math.max(b.x0,b.x1)+b.w<=coop.x||Math.min(b.x0,b.x1)>=coop.x+coop.w);
    ld.ghosts=(ld.ghosts||[]).filter(g=>{const r={x:g.x-g.rangeX,y:g.y-g.rangeY,w:g.w+g.rangeX*2,h:g.h+g.rangeY*2};return !rectIntersects(r,coop);});
    ld.fakeDoors=removeRectHits(ld.fakeDoors,coop);
    ld.fakeGoals=removeRectHits(ld.fakeGoals,coop);
    ld.fallingBlocks=removeRectHits(ld.fallingBlocks,coop,b=>({x:b.x,y:b.y,w:b.w,h:Math.max(b.h,b.floorY-b.y)}));
    // Paredes de ataque cruzam o corredor desde fora da tela; em fases com portão elas
    // ficam desativadas para não matar um personagem que precisa permanecer ancorado.
    ld.slamWalls=[];
    ld.vanishPlatforms=removeRectHits(ld.vanishPlatforms,coop);
    ld.windGusts=removeRectHits(ld.windGusts,coop);
    // Projéteis de dragão atravessam a tela toda e podem tornar o revezamento solo impossível.
    ld.dragons=[];
  }
  protectCriticalLandings(ld);
  return injectEnemies(injectInsanity(emergencyRepairLevel(ld)));
}
function injectInsanity(ld){
  if(!ld||ld.boss||ld.level<5)return ld;
  const rng=mulberry32(ld.level*73129+666),doorZone=ld.door?{x:515,y:470,w:690,h:430}:null;
  const safePlatform=p=>p&&!p._doorBridge&&!p._repairStep&&p.x>255&&p.x+p.w<1385&&p.w>=118&&p.y>=600&&(!doorZone||!rectIntersects({x:p.x,y:p.y-150,w:p.w,h:170},doorZone));
  const ps=(ld.platforms||[]).filter(safePlatform);
  const amount=ld.level<12?2:ld.level<35?3:ld.level<120?4:5;
  let nextId=900000+ld.level*20;
  for(let i=0;i<amount&&ps.length;i++){
    const pp=ps[(Math.floor(rng()*ps.length)+i*3)%ps.length],usable=Math.max(28,pp.w-100),sx=pp.x+78+((ld.level*37+i*53)%Math.floor(usable));
    const ceiling=(ld.level>=8&&(i+ld.level)%3===0);
    const spike=ceiling?{x:sx,y:pp.y-90,w:46,h:34,dir:'down'}:{x:sx,y:pp.y-30,w:48,h:30,dir:'up'};
    ld.ambushSpikes.push({id:nextId++,triggerX:Math.max(pp.x+12,sx-(80+((i+ld.level)%3)*30)),delay:45+((i+ld.level)%4)*35,spike});
  }
  // Uma segunda resposta para o jogador que já memorizou o primeiro susto: bloco do teto.
  if(ld.level>=7&&ps.length){const pp=ps[(ld.level*5)%ps.length],x=pp.x+Math.min(pp.w-70,Math.max(24,pp.w*.58));ld.fallingBlocks.push({id:nextId++,triggerX:Math.max(pp.x+8,x-105),x,y:90,w:58,h:58,floorY:pp.y,delay:.09+((ld.level%3)*.05),speed:800+Math.min(260,ld.level*.7)});}
  // Portas/saídas falsas aparecem cedo para quebrar a leitura visual da fase.
  if(ld.level>=6&&ld.level%4===2)ld.fakeGoals.push({id:nextId++,x:1210+((ld.level%3)*34),y:690,w:56,h:100});
  if(ld.level>=10&&ld.level%5===0)ld.fakeDoors.push({id:nextId++,x:1080+((ld.level%4)*38),y:690,w:56,h:100});
  // Parede-relâmpago no meio/final, nunca no spawn ou na saída.
  if(ld.level>=14&&ld.level%3===1&&!ld.door)ld.slamWalls.push({id:nextId++,triggerX:870,startX:1260,endX:980,y:650,w:42,h:140,delay:.09,travel:.26});
  return ld;
}
function injectEnemies(ld){
  if(!ld)return ld;ld.enemies=ld.enemies||[];if(ld.boss||ld.level<5)return ld;
  const rng=mulberry32(ld.level*19087+404);
  const rage=ld.level<15?2:ld.level<60?3:ld.level<250?4:ld.level<600?5:6;
  const count=Math.min(6,rage);
  const spawnSafe={x:0,y:590,w:250,h:210},goalSafe={x:1380,y:550,w:220,h:250},coop=ld.door?{x:520,y:470,w:670,h:430}:null;
  const blocked=r=>rectIntersects(r,spawnSafe)||rectIntersects(r,goalSafe)||(coop&&rectIntersects(r,coop));
  const candidates=(ld.platforms||[]).filter(p=>!p._doorBridge&&!p._repairStep&&p.w>=105&&p.x>245&&p.x+p.w<1390&&p.y>=500&&p.y<=790).filter(p=>!blocked({x:p.x-8,y:p.y-190,w:p.w+16,h:205}));
  const used=new Set();
  for(let i=0;i<count;i++){
    let pp=null;for(let tries=0;tries<24&&candidates.length;tries++){const c=candidates[Math.floor(rng()*candidates.length)];if(!used.has(c)){pp=c;used.add(c);break;}}
    const types=ld.level<25?['sentinel','bat']:ld.level<180?['sentinel','bat','bat']:ld.level<520?['sentinel','bat','wraith']:['sentinel','bat','wraith','wraith'];
    const type=types[Math.floor(rng()*types.length)],w=type==='bat'?38:42,h=type==='bat'?30:46;let enemy;
    if(pp){const x0=pp.x+16,x1=Math.max(x0+8,pp.x+pp.w-w-16),baseY=type==='bat'?Math.max(330,pp.y-145):pp.y-h;enemy={id:70000+ld.level*10+i,type,x0,x1,y:baseY,w,h,speed:1.0+rng()*(ld.level<50?.8:1.25),phase:rng()*6,rangeY:type==='bat'||type==='wraith'?24+rng()*42:0};}
    else{enemy={id:70000+ld.level*10+i,type:'bat',x0:270,x1:445,y:535,w:38,h:30,speed:1.2+rng()*.7,phase:rng()*6,rangeY:24};}
    const sweep={x:Math.min(enemy.x0,enemy.x1),y:enemy.y-(enemy.rangeY||0),w:Math.abs(enemy.x1-enemy.x0)+enemy.w,h:enemy.h+(enemy.rangeY||0)*2};if(!blocked(sweep))ld.enemies.push(enemy);
  }
  return ld;
}
function emergencyRepairLevel(ld){
  const floorY=790;
  if(ld.door&&ld.plate&&ld.plate2){
    const plates=[ld.plate,ld.plate2];
    // Cada placa recebe um volume de pé/cabeça livre de 62 px, além do piso de apoio.
    for(const plate of plates){
      const stand={x:plate.x-8,y:plate.y-64,w:plate.w+16,h:64};
      ld.platforms=(ld.platforms||[]).filter(p=>p._doorBridge||p.y>=floorY||!rectIntersects(p,stand));
      ld.hazards=removeRectHits(ld.hazards,rectAround(stand,14,10));
      ld.spikes=removeRectHits(ld.spikes,rectAround(stand,14,10));
      ld.fakeFloors=removeRectHits(ld.fakeFloors,rectAround(stand,14,10));
      ld.bridgeTiles=removeRectHits(ld.bridgeTiles,rectAround(stand,14,10));
      ld.ambushSpikes=(ld.ambushSpikes||[]).filter(t=>!rectIntersects(t.spike,rectAround(stand,14,10)));
      ld.popTraps=(ld.popTraps||[]).filter(t=>!rectIntersects(t.spike,rectAround(stand,14,10)));
    }
    // Última garantia: se por qualquer motivo o piso de uma placa sumiu, recoloca o corredor.
    if(!supportBelowPlate(ld,ld.plate)||!supportBelowPlate(ld,ld.plate2)){
      ld.platforms=(ld.platforms||[]).filter(p=>!p._doorBridge);
      ld.platforms.push({x:540,y:floorY,w:620,h:110,_doorBridge:true});
    }
  }
  return ld;
}
function levelIntegrityIssues(ld){
  const issues=[];
  if(!ld)return ['fase ausente'];
  issues.push(...finiteGeometryIssues(ld),...duplicateTrapIdIssues(ld));
  if(ld.level<1||ld.level>1000)issues.push('número de fase fora do intervalo');
  if(!ld.goal||ld.goal.w<=0||ld.goal.h<=0)issues.push('saída inválida');
  if(!supportPlatformForRect(ld,ld.goal))issues.push('saída sem piso de apoio');
  if(!staticEarthRouteExists(ld))issues.push('sem rota estrutural para a saída com Terra');
  const spawn={x:90,y:690,w:97,h:56};
  const spawnKillers=[...(ld.hazards||[]),...(ld.spikes||[])];if(spawnKillers.some(r=>rectIntersects(r,spawn)))issues.push('spawn nasce sobre armadilha');
  if(ld.movingExit){const moved={x:ld.movingExit.toX,y:ld.movingExit.toY,w:ld.goal.w,h:ld.goal.h};if(!supportPlatformForRect(ld,moved))issues.push('destino da saída móvel sem piso');}
  if(ld.boss){
    for(const [key,rune] of Object.entries(ld.boss.runes||{})){
      if(!rune){issues.push(`runa ${key} ausente`);continue;}
      if(!supportPlatformForRect(ld,rune))issues.push(`runa ${key} sem piso`);
      if(!earthCanReachSupport(ld,rune))issues.push(`runa ${key} inalcançável pelo elemento base`);
      const stand=rectAround({x:rune.x,y:rune.y-56,w:rune.w,h:56},8,6);
      const killers=[...(ld.hazards||[]),...(ld.spikes||[])];if(killers.some(r=>rectIntersects(r,stand)))issues.push(`runa ${key} nasce em armadilha estática`);
    }
    if(rectIntersects(ld.boss.barrier,ld.goal))issues.push('barreira do chefe sobre a saída');
  }
  if(ld.door&&ld.plate&&ld.plate2){
    if(rectIntersects(ld.door,ld.plate)||rectIntersects(ld.door,ld.plate2))issues.push('portão sobre placa');
    if(!supportBelowPlate(ld,ld.plate))issues.push('placa esquerda sem piso');
    if(!supportBelowPlate(ld,ld.plate2))issues.push('placa direita sem piso');
    for(const [name,plate] of [['esquerda',ld.plate],['direita',ld.plate2]]){
      const stand={x:plate.x-6,y:plate.y-60,w:plate.w+12,h:60};
      const blockers=(ld.platforms||[]).filter(p=>!p._doorBridge&&p.y<790&&rectIntersects(p,stand));
      if(blockers.length)issues.push(`placa ${name} bloqueada por plataforma`);
      const killers=[...(ld.hazards||[]),...(ld.spikes||[]),...(ld.fakeFloors||[]),...(ld.bridgeTiles||[])];
      if(killers.some(r=>rectIntersects(r,rectAround(stand,10,8))))issues.push(`placa ${name} ocupada por armadilha`);
      if((ld.ambushSpikes||[]).some(t=>rectIntersects(t.spike,rectAround(stand,10,8))))issues.push(`placa ${name} recebe espinho surpresa`);
      if((ld.fallingBlocks||[]).some(t=>rectIntersects(sweepRectFor('fallingBlock',t),rectAround(stand,10,8))))issues.push(`placa ${name} recebe bloco em queda`);
      if((ld.chandeliers||[]).some(t=>rectIntersects(sweepRectFor('chandelier',t),rectAround(stand,10,8))))issues.push(`placa ${name} recebe lustre`);
    }
    if(ld.plate.x+ld.plate.w>ld.door.x-55)issues.push('pouco espaço antes do portão');
    if(ld.plate2.x<ld.door.x+ld.door.w+55)issues.push('pouco espaço depois do portão');
  }
  return [...new Set(issues)];
}

function isJokerLevel(level){const l=Number(level)||0;return l>=37&&l<1000&&l%37===0&&l%100!==0;}
function applyJokerMutators(ld,level){
  if(!ld)return ld;
  ld.joker=false;ld.jokerVariant=0;ld.jokerRules=[];ld.reverseZones=[];
  if(!isJokerLevel(level)||ld.boss)return ld;
  const variant=Math.floor(level/37)-1,count=1+Math.min(2,Math.floor(level/300));
  ld.joker=true;ld.jokerVariant=variant%7;
  for(let i=0;i<count;i++){const rule=JOKER_MUTATORS[(variant+i*3)%JOKER_MUTATORS.length];if(!ld.jokerRules.includes(rule))ld.jokerRules.push(rule);}
  if(ld.jokerRules.includes('reverse')){
    ld.reverseZones=[{x:520+(variant%3)*45,y:450,w:300,h:340}];
    if(level>=370)ld.reverseZones.push({x:1010-(variant%2)*55,y:480,w:210,h:310});
  }
  ld.roomTitle=`🃏 ${ld.roomTitle||castleRegion(level).name}`;
  return ld;
}
function safeGenerateLevel(level){
  try{
    const ld=generateLevel(level),issues=levelIntegrityIssues(ld);
    if(ld&&Array.isArray(ld.platforms)&&ld.platforms.length>=2&&ld.goal&&issues.length===0)return applyV006Mutators(applyJokerMutators(ld,level),level);
    console.error('[Infinity Castle] Fase inválida, usando sala de emergência:',level,issues);
  }catch(err){console.error('[Infinity Castle] Falha ao gerar fase, usando sala de emergência:',level,err);}
  return applyV006Mutators(applyJokerMutators(buildEmergencyLevel(level),level),level);
}
function buildEmergencyLevel(level){
  const region=castleRegion(level),floorY=790,base={
    level,platforms:[{x:0,y:floorY,w:260,h:110},{x:330,y:760,w:190,h:140},{x:590,y:715,w:200,h:185},{x:855,y:760,w:190,h:140},{x:1115,y:715,w:205,h:185},{x:1405,y:floorY,w:195,h:110}],
    hazards:[{x:260,y:818,w:70,h:82,type:'roots'},{x:520,y:818,w:70,h:82,type:'storm'},{x:790,y:818,w:65,h:82,type:'curse'}],spikes:[],fakeFloors:[],popTraps:[],ambushSpikes:[],reverseZones:[],plate:null,plate2:null,door:null,
    goal:{x:1515,y:690,w:56,h:100},elevators:[],chandeliers:[],armors:[],crushers:[],bookshelves:[],ghosts:[],bridgeTiles:[],dragons:[],fakeDoors:[],fakeGoals:[],fallingBlocks:[],slamWalls:[],vanishPlatforms:[],windGusts:[],movingExit:null,boss:null,archetype:98,roomTitle:'SALA DE EMERGÊNCIA',regionIndex:region.index,enemies:[]
  };
  if(level%100===0){
    base.platforms=[{x:0,y:floorY,w:1600,h:110},{x:270,y:690,w:240,h:25},{x:650,y:610,w:300,h:24},{x:1090,y:690,w:250,h:25}];base.hazards=[];
    base.boss={name:'Guardião de Emergência',x:720,y:265,w:160,h:230,required:2.5,attackInterval:2.1,projectileSpeed:390,runes:{left:{x:330,y:665,w:86,h:20},right:{x:1185,y:665,w:86,h:20}},barrier:{x:1450,y:570,w:40,h:220}};base.archetype=99;base.roomTitle='SALÃO DO GUARDIÃO';
  }else if(level>=5){
    base.ambushSpikes.push({id:990000+level,triggerX:520,delay:90,spike:{x:650,y:685,w:46,h:30,dir:'up'}});
    base.enemies.push({id:980000+level,type:'sentinel',x0:875,x1:990,y:714,w:42,h:46,speed:1.15,phase:0,rangeY:0});
  }
  return base;
}

function generateLevel(level){
  if(level===666)return generate666Level();
  if(level%100===0)return generateBossLevel(level);
  const rng=mulberry32(level*9749+1337),region=castleRegion(level),diff=Math.min(1,(level-1)/999),archetype=(level*7+Math.floor(level/9))%12;
  const platforms=[],hazards=[],spikes=[],fakeFloors=[],popTraps=[],reverseZones=[],elevators=[],chandeliers=[],armors=[],crushers=[],bookshelves=[],ghosts=[],bridgeTiles=[],dragons=[],fakeDoors=[];
  const ambushSpikes=[],fallingBlocks=[],slamWalls=[],vanishPlatforms=[],fakeGoals=[],windGusts=[];let id=0;
  const floorY=790;platforms.push({x:0,y:floorY,w:235,h:110});
  const count=6+(archetype%4),ys=layoutHeights(archetype,count,rng,diff);let x=235;
  for(let i=0;i<count;i++){
    const gap=72+Math.floor(rng()*(55+diff*52)),width=118+Math.floor(rng()*(92+(archetype===4?70:0))),gapX=x;
    const type=region.hazards[Math.floor(rng()*region.hazards.length)];
    if(rng()<.74)hazards.push({x:gapX,y:floorY+28,w:gap,h:82,type});
    if(level>=5&&rng()<.24+diff*.20)fakeFloors.push({id:id++,x:gapX,y:floorY-12,w:gap,h:14});
    if(level>620&&rng()<.22){const n=2+Math.floor(rng()*3),tw=gap/n;for(let j=0;j<n;j++)bridgeTiles.push({id:id++,x:gapX+j*tw,y:floorY-12,w:Math.max(18,tw-2),h:14,delay:420+Math.floor(rng()*260)});}
    x+=gap;const y=ys[i];const p={x,y,w:width,h:H-y};platforms.push(p);
    if(level>12&&rng()<.22)spikes.push({x:x+width*(.35+rng()*.25),y:y-18,w:30+rng()*30,h:18,dir:'up'});
    if(level>=5&&rng()<.42+diff*.22)ambushSpikes.push({id:id++,triggerX:x-55-rng()*80,delay:90+Math.floor(rng()*240),spike:{x:x+20+rng()*Math.max(20,width-80),y:y-30,w:52,h:30,dir:'up'}});if(level>=9&&rng()<.20+diff*.12)ambushSpikes.push({id:id++,triggerX:x-30-rng()*55,delay:70+Math.floor(rng()*160),spike:{x:x+28+rng()*Math.max(18,width-92),y:y-86,w:48,h:34,dir:'down'}});
    if(level>=8&&rng()<.24+diff*.10)chandeliers.push({id:id++,x:x+width*(.30+rng()*.35),y:95,w:40,h:60,floorY:y,triggerX:x-90-rng()*60});
    if(level>=14&&rng()<.20+diff*.10)elevators.push({id:id++,x:x+width*.25,y0:y-8,y1:Math.max(430,y-190),w:74,h:16,speed:.85+rng()*.75,phase:rng()*6});
    if(level>=18&&rng()<.18+diff*.10)armors.push({id:id++,x0:x+8,x1:x+Math.max(20,width-54),y:y-54,w:38,h:54,speed:1+rng()*.8,phase:rng()*6});
    if(level>=11&&rng()<.22+diff*.12)fallingBlocks.push({id:id++,triggerX:x-95,x:x+width*.38,y:115,w:62,h:62,floorY:y,delay:.15+rng()*.28,speed:650+rng()*230});
    if(level>=28&&rng()<.17+diff*.10)crushers.push({id:id++,axis:'y',x:x+width*.52,a:y-245,b:y-85,w:54,h:85,speed:1.15+rng(),phase:rng()*6});
    if(level>=16&&rng()<.21+diff*.12)vanishPlatforms.push({id:id++,x:x+width*.15,y:y-92,w:72+Math.floor(rng()*45),h:15,delay:360+Math.floor(rng()*320)});
    if((region.index===4||region.index===9)&&rng()<.30)bookshelves.push({id:id++,x0:x+8,x1:x+Math.max(16,width-54),y:y-125,w:48,h:125,speed:.75+rng()*.85,phase:rng()*6});
    if(region.index>=5&&rng()<.13+diff*.08)ghosts.push({id:id++,x:x+width*.48,y:y-120,w:40,h:50,rangeX:42+rng()*70,rangeY:28+rng()*54,speed:.8+rng()*.9,phase:rng()*6});
    if((region.index===7||region.index===9)&&rng()<.22)windGusts.push({id:id++,x:x,y:y-175,w:width,h:175,force:(rng()<.5?-1:1)*(550+rng()*350)});
    if(level>720&&rng()<.11)dragons.push({id:id++,x:1540,y:300+rng()*220,interval:2.6-rng()*.55,life:2.25,speed:440+rng()*150,phase:rng()*2,fromRight:true});
    if(level>780&&rng()<.11)slamWalls.push({id:id++,triggerX:x-80,startX:W+80,endX:x+width-50,y:y-115,w:46,h:115,delay:.12+rng()*.22,travel:.35+rng()*.22});
    x+=width;
  }
  const scale=(1405-235)/(x-235),scaleX=o=>{o.x=235+(o.x-235)*scale;o.w*=scale;};
  for(const o of [...platforms.slice(1),...hazards,...spikes])scaleX(o);for(const f of fakeFloors)scaleX(f);for(const t of bridgeTiles)scaleX(t);for(const t of ambushSpikes){t.triggerX=235+(t.triggerX-235)*scale;scaleX(t.spike);}for(const e of elevators){e.x=235+(e.x-235)*scale;e.w*=scale;}for(const ch of chandeliers){ch.x=235+(ch.x-235)*scale;ch.triggerX=235+(ch.triggerX-235)*scale;}for(const a of armors){a.x0=235+(a.x0-235)*scale;a.x1=235+(a.x1-235)*scale;}for(const c of crushers)c.x=235+(c.x-235)*scale;for(const b of bookshelves){b.x0=235+(b.x0-235)*scale;b.x1=235+(b.x1-235)*scale;}for(const g of ghosts)g.x=235+(g.x-235)*scale;for(const v of vanishPlatforms)scaleX(v);for(const b of fallingBlocks){b.triggerX=235+(b.triggerX-235)*scale;b.x=235+(b.x-235)*scale;}for(const w of slamWalls){w.triggerX=235+(w.triggerX-235)*scale;w.endX=235+(w.endX-235)*scale;}for(const z of windGusts)scaleX(z);
  platforms.push({x:1405,y:floorY,w:195,h:110});
  // Portas cooperativas aparecem em parte das salas, com uma placa em cada lado.
  let plate=null,plate2=null,door=null;if(level>3&&level%4===0){
    // Corredor cooperativo dedicado: garante chão contínuo e uma placa em cada lado do portão.
    platforms.push({x:540,y:floorY,w:620,h:110,_doorBridge:true});
    door={x:845,y:570,w:36,h:220};plate={x:675,y:floorY-10,w:68,h:10};plate2={x:965,y:floorY-10,w:68,h:10};
  }
  // Maldades adicionais ficam progressivamente mais frequentes, mas sempre resetam de forma determinística.
  if(level>=7&&level%5===0)fakeDoors.push({id:id++,x:1110+(level%3)*45,y:690,w:56,h:100});
  if(level>=9&&level%7===0)fakeGoals.push({id:id++,x:1240,y:690,w:56,h:100});
  if(level>560&&level%13===0)ambushSpikes.push({id:id++,triggerX:1360,delay:80,spike:{x:1450,y:758,w:64,h:32,dir:'up'}});
  // INSANITY MODE: fases 1-4 ensinam; da fase 5 em diante o castelo começa a mentir de propósito.
  if(level>=5){
    const cruelty=Math.min(1,(level-5)/180),extra=1+Math.floor(Math.min(4,(level-5)/45));
    const safePlatforms=platforms.filter(p=>!p._doorBridge&&p.x>280&&p.x+p.w<1380&&p.w>100&&p.y>=610);
    for(let k=0;k<extra&&safePlatforms.length;k++){
      const pp=safePlatforms[(level*13+k*7)%safePlatforms.length];
      const sx=pp.x+Math.max(18,Math.min(pp.w-55,28+((level*31+k*47)%Math.max(35,Math.floor(pp.w-65)))));
      if((level+k)%2===0)ambushSpikes.push({id:id++,triggerX:Math.max(250,sx-105),delay:45+((level+k)%4)*45,spike:{x:sx,y:pp.y-30,w:48,h:30,dir:'up'}});
      else fallingBlocks.push({id:id++,triggerX:Math.max(250,sx-90),x:sx,y:105,w:54,h:54,floorY:pp.y,delay:.08+((level+k)%3)*.07,speed:760+cruelty*230});
    }
    // A fase às vezes pune quem volta para pegar impulso.
    if(level>=10&&level%4===1)slamWalls.push({id:id++,triggerX:520,startX:-70,endX:360,y:650,w:42,h:140,delay:.16,travel:.32});
    // Saída-isca cedo, mas não sobre a saída real.
    if(level>=8&&level%6===2)fakeGoals.push({id:id++,x:1260,y:690,w:56,h:100});
  }
  const goal={x:1515,y:690,w:56,h:100};
  const movingExit=level>=5&&level%5===0?{triggerDist:185,toX:1425,toY:690}:null;
  const roomTitle=region.rooms[(level-1)%region.rooms.length];
  return sanitizeGeneratedLevel({platforms,hazards,spikes,fakeFloors,popTraps,ambushSpikes,reverseZones,plate,plate2,door,goal,level,elevators,chandeliers,armors,crushers,bookshelves,ghosts,bridgeTiles,dragons,fakeDoors,fakeGoals,fallingBlocks,slamWalls,vanishPlatforms,windGusts,movingExit,boss:null,archetype,roomTitle,regionIndex:region.index});
}
function layoutHeights(type,count,rng,diff){
  const floor=790,a=[];let prev=floor;
  for(let i=0;i<count;i++){
    let y=floor;
    if(type===0)y=floor-(i%3)*34;
    else if(type===1)y=floor-Math.min(i,4)*48;
    else if(type===2)y=floor-(i%2)*76;
    else if(type===3)y=floor-Math.round((Math.sin(i*1.5)+1)*38);
    else if(type===4)y=floor-(i<Math.ceil(count/2)?i:(count-i))*42;
    else if(type===5)y=floor-((i%4===1||i%4===2)?70:10);
    else if(type===6)y=floor-Math.min(90,(i%5)*23);
    else if(type===7)y=floor-((i*37)%88);
    else if(type===8)y=floor-(i%3===1?82:i%3===2?40:0);
    else if(type===9)y=floor-Math.round((1-Math.cos(i*.9))*42);
    else if(type===10)y=floor-(rng()<.5?18:72);
    else y=floor-(i%2?55:0)-Math.min(35,diff*35);
    y=Math.max(620,Math.min(790,y));if(y<prev-88)y=prev-88;prev=y;a.push(y);
  }return a;
}
function generateBossLevel(level){
  const tier=level/100,region=castleRegion(level),floorY=790;
  // As plataformas laterais ficam a 100 px do piso: Terra (o salto mais baixo) consegue alcançá-las.
  // A passarela central cria uma rota real por cima da sequência de espinhos dos chefes avançados.
  const platforms=[{x:0,y:floorY,w:1600,h:110},{x:270,y:690,w:240,h:25},{x:1090,y:690,w:250,h:25},{x:650,y:610,w:300,h:24}];
  const bossNames=['O Porteiro de Granito','A Rainha do Vitral','O Carcereiro Sem Rosto','O Rei do Relógio','A Bibliotecária Morta','O Bispo Esquecido','A Fera do Jardim','O Dragão da Tempestade','O Arauto Rubro','O Coração do Castelo'];
  const boss={name:bossNames[tier-1]||'O Coração do Castelo',element:['earth','air','light','darkness'][(tier-1)%4],x:720,y:265,w:160,h:230,required:2.1+Math.min(1.9,tier*.16),attackInterval:2.15-Math.min(.75,tier*.06),projectileSpeed:370+tier*22,runes:{left:{x:330,y:665,w:86,h:20},right:{x:1185,y:665,w:86,h:20}},barrier:{x:1450,y:570,w:40,h:220}};
  const hazards=[{x:510,y:790,w:140,h:110,type:'storm'},{x:950,y:790,w:140,h:110,type:'roots'}],spikes=[];
  for(let i=0;i<tier;i++)spikes.push({x:555+i*50,y:772,w:28,h:18,dir:'up'});
  const crushers=[];if(tier>=4){crushers.push({axis:'y',x:525,a:250,b:585,w:50,h:92,speed:1.1,phase:0});crushers.push({axis:'y',x:1025,a:250,b:585,w:50,h:92,speed:1.15,phase:2.2});}
  const ghosts=tier>=5?[{x:780,y:520,w:40,h:50,rangeX:230,rangeY:55,speed:1.2,phase:0}]:[],dragons=tier>=8?[{x:1540,y:430,interval:2.3,life:2.5,speed:480,phase:0,fromRight:true}]:[];
  const ld={level,platforms,hazards,spikes,fakeFloors:[],popTraps:[],ambushSpikes:tier>=7?[{id:900+level,triggerX:1320,delay:100,spike:{x:1395,y:754,w:62,h:36,dir:'up'}}]:[],reverseZones:[],plate:null,plate2:null,door:null,goal:{x:1515,y:690,w:56,h:100},elevators:[],chandeliers:[],armors:[],crushers,bookshelves:[],ghosts,bridgeTiles:[],dragons,fakeDoors:[],fakeGoals:[],fallingBlocks:[],slamWalls:[],vanishPlatforms:[],windGusts:[],movingExit:null,boss,archetype:99,roomTitle:'SALÃO DO GUARDIÃO',regionIndex:region.index};
  return sanitizeBossLevel(ld);
}
function nearestPlatform(platforms,x){let best=platforms[0],d=Infinity;for(const p of platforms){const c=p.x+p.w/2,nd=Math.abs(c-x);if(nd<d){d=nd;best=p;}}return best;}
function nearestPlatformBefore(platforms,x){const arr=platforms.filter(p=>p.x+p.w<x).sort((a,b)=>(b.x+b.w)-(a.x+a.w));return arr[0]||platforms[0];}
function nearestPlatformAfter(platforms,x){const arr=platforms.filter(p=>p.x>x).sort((a,b)=>a.x-b.x);return arr[0]||platforms[platforms.length-1];}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}}

function render(){
  ctx.save();
  if(profile.settings?.screenShake!==false&&state.screenShake>0){const m=state.screenShake;ctx.translate((Math.random()-.5)*m,(Math.random()-.5)*m);state.screenShake=Math.max(0,state.screenShake-1.15);}else if(state.screenShake>0)state.screenShake=0;
  ctx.clearRect(-30,-30,W+60,H+60);const mirror=state.levelData?.jokerRules?.includes('mirror');if(mirror){ctx.translate(W,0);ctx.scale(-1,1);}drawBackground();drawV006BackgroundEntities();if(!state.levelData){ctx.restore();return;}const ld=state.levelData;
  for(const p of ld.platforms)drawPlatform(p);for(const h of ld.hazards)drawHazard(h);for(const f of ld.fakeFloors||[])drawFakeFloor(f);for(const t of ld.bridgeTiles||[])drawBridgeTile(t);for(const v of ld.vanishPlatforms||[])drawVanishPlatform(v);for(const e of ld.elevators||[])drawElevator(dynamicElevator(e));for(const b of ld.bookshelves||[])drawBookshelf(dynamicBookshelf(b));
  for(const z of ld.windGusts||[])drawWindGust(z);for(const z of ld.reverseZones||[])drawReverseZone(z);if(ld.plate)drawPlate(ld.plate,platePressed(ld.plate));if(ld.plate2)drawPlate(ld.plate2,platePressed(ld.plate2));if(ld.door&&!doorOpen())drawDoor(ld.door);
  for(const ch of ld.chandeliers||[])drawChandelier(chandelierRect(ch),!!state.trapState.get('ch'+ch.id));for(const b of dynamicFallingBlocks())drawFallingBlock(b);for(const w of dynamicSlamWalls())drawSlamWall(w);for(const c of ld.crushers||[])drawCrusher(dynamicCrusher(c));for(const a of ld.armors||[])drawArmor(armorRect(a));for(const g of ld.ghosts||[])drawGhost(ghostRect(g));for(const d of ld.dragons||[])drawDragon(d);for(const fb of dragonFireballs())drawFireball(fb,'#ff8b4b');for(const fd of ld.fakeDoors||[])drawFakeDoor(fd);for(const fg of ld.fakeGoals||[])drawFakeGoal(fg,!!state.trapState.get('fg'+fg.id));for(const sp of activeSpikes())drawSpike(sp);
  for(const e of ld.enemies||[])drawEnemy(enemyRect(e),e);
  if(state.mode==='chaos'&&ld.chaosSeals)for(const [role,seal] of Object.entries(ld.chaosSeals))drawChaosSeal(role,seal,(state.room?.chaosSeals||[]).includes(role));
  if(ld.boss)drawBoss(ld.boss);for(const bf of bossProjectiles())drawFireball(bf,bf.color||'#c96cff');drawGoal(currentGoal(),goalAccessible());
  const abilityNow=performance.now(),localAbility=abilityNow<state.abilityUntil;
  if(state.mode==='singleplayer'){
    if(localAbility)drawElementAbilityFx(player.x,player.y,state.role,abilityProgress(abilityNow),player.facing||1,state.abilityRootFx&&state.abilityRootFx.until>abilityNow?state.abilityRootFx:null);
    drawCharacter(player.x,player.y,state.role,true,localAbility,false,profile.owned,player,activeRelicId());
  }else{
    for(const remote of state.remotePlayers.values())if(remote.level===state.level){
      if(remote.ability)drawElementAbilityFx(remote.x,remote.y,remote.role,Number(remote.abilityProgress)||0,remote.facing||1,remote.rootFx||null);
      drawCharacter(remote.x,remote.y,remote.role,false,remote.ability,false,remote.cosmetics||{},remote,remote.relic||null);
    }
    if(localAbility)drawElementAbilityFx(player.x,player.y,state.role,abilityProgress(abilityNow),player.facing||1,state.abilityRootFx&&state.abilityRootFx.until>abilityNow?state.abilityRootFx:null);
    drawCharacter(player.x,player.y,state.role,true,localAbility,false,profile.owned,player,activeRelicId());
  }
  drawForegroundAtmosphere();drawParticles();drawLevelTitle();drawV006OverlayEffects();ctx.restore();
}
function castleRegion(level){
  const i=Math.min(9,Math.floor((Math.max(1,level)-1)/100));
  const regions=[
    {name:'PORTÃO E PÁTIO REAL',subtitle:'O castelo ainda finge ser justo',mechanics:'CHÃO FALSO • ESPINHOS-SURPRESA',sky:'#101923',wall:'#29313a',accent:'#d2a85e',platform:'#34383d',edge:'#72706a',hazards:['roots','storm'],rooms:['PÁTIO DAS BANDEIRAS','CASA DA GUARDA','PONTE DO PORTÃO','CORREDOR DOS ESCUDOS']},
    {name:'GALERIA NOBRE',subtitle:'Luxo, vitrais e péssimas intenções',mechanics:'LUSTRES • SAÍDAS FALSAS',sky:'#171225',wall:'#352b46',accent:'#9b79cc',platform:'#38323e',edge:'#796a86',hazards:['storm','curse'],rooms:['SALÃO DOS RETRATOS','GALERIA DE VITRAIS','SALÃO DE BAILE','QUARTOS DA CORTE']},
    {name:'MASMORRAS PROFUNDAS',subtitle:'O caminho seguro costuma ser o pior',mechanics:'BLOCOS CAINDO • ARMADURAS',sky:'#08131a',wall:'#1e3038',accent:'#66889a',platform:'#29373b',edge:'#60767b',hazards:['roots','curse'],rooms:['CELAS ALAGADAS','CORREDOR DAS CORRENTES','POÇO DOS PRISIONEIROS','CRIPTA DOS GUARDAS']},
    {name:'TORRE DO RELÓGIO',subtitle:'Tudo se move quando não deveria',mechanics:'ELEVADORES • ESMAGADORES',sky:'#1b130c',wall:'#3b2b1b',accent:'#c28743',platform:'#3b342c',edge:'#7e6a4b',hazards:['storm','curse'],rooms:['CÂMARA DOS PÊNDULOS','ENGRENAGEM CENTRAL','SALÃO DOS SINOS','ESCADARIA DO TEMPO']},
    {name:'BIBLIOTECA VIVA',subtitle:'As estantes odeiam visitantes',mechanics:'ESTANTES • PLATAFORMAS QUE SOMEM',sky:'#151020',wall:'#33243b',accent:'#9b6fbd',platform:'#332d38',edge:'#73617b',hazards:['curse','roots'],rooms:['ARQUIVO PROIBIDO','SALÃO DOS MAPAS','ACERVO SEM FIM','SALA DOS LIVROS MORTOS']},
    {name:'CAPELA ASSOMBRADA',subtitle:'Nem toda porta quer levar a algum lugar',mechanics:'FANTASMAS • PORTAS-MENTIRA',sky:'#0d1218',wall:'#25303a',accent:'#9da9b8',platform:'#2b3037',edge:'#69727e',hazards:['curse','storm'],rooms:['NAVE DOS SUSSURROS','CATACUMBAS','ALTAR QUEBRADO','CORREDOR DOS SINOS MORTOS']},
    {name:'JARDINS SUSPENSOS',subtitle:'Bonito o bastante para baixar a guarda',mechanics:'RAÍZES • PONTES QUEBRÁVEIS',sky:'#0b1b18',wall:'#1f3a31',accent:'#6eb783',platform:'#2b3933',edge:'#607a6b',hazards:['roots','storm'],rooms:['ESTUFA REAL','JARDIM DA LUA','PÁTIO DAS ESTÁTUAS','PONTE DAS HERAS']},
    {name:'MURALHAS DA TEMPESTADE',subtitle:'Agora o próprio ar tenta jogar vocês fora',mechanics:'VENTANIA • DRAGÕES • PONTES',sky:'#07131f',wall:'#213142',accent:'#70b9df',platform:'#28343f',edge:'#667989',hazards:['storm','curse'],rooms:['AMEIAS DO NORTE','TORRE DO TROVÃO','PONTE EXTERNA','MURALHA PARTIDA']},
    {name:'TRONO RUBRO',subtitle:'O castelo para de fingir que joga limpo',mechanics:'PAREDES-ARMADILHA • CORREDORES VIVOS',sky:'#210a0d',wall:'#451b21',accent:'#d6535d',platform:'#3e292c',edge:'#8b565c',hazards:['curse','roots','storm'],rooms:['SALÃO DO TRONO','CORREDOR DE SANGUE','CÂMARA DA COROA','GALERIA DO CARRASCO']},
    {name:'CORAÇÃO IMPOSSÍVEL',subtitle:'Aqui a arquitetura também mente',mechanics:'PEGADINHAS EXTREMAS • CAOS',sky:'#160815',wall:'#321334',accent:'#e35fd2',platform:'#322635',edge:'#7c5b81',hazards:['curse','storm','roots'],rooms:['SALÃO QUE NÃO EXISTE','ESCADA SEM FIM','CORREDOR DO AVESSO','CÂMARA DO CASTELO VIVO']}
  ];return {...regions[i],index:i};
}

function castleCorruption(){
  if(state.level===666)return .92;
  if(state.level<500)return 0;
  return Math.max(0,Math.min(1,(state.level-500)/500));
}
function castleParallaxOffset(mult=.03){
  const px=player?.x||0;
  return -Math.max(0,Math.min(W,px))*mult;
}
function seededVisual(seed){
  const x=Math.sin(seed*12.9898+state.level*78.233)*43758.5453;
  return x-Math.floor(x);
}
function drawFarCastleSilhouette(z){
  const off=castleParallaxOffset(.022),n=z.index;
  ctx.save();ctx.globalAlpha=.20+.025*n;
  ctx.fillStyle=n>=8?'#080309':'#05080d';
  for(let i=-1;i<10;i++){
    const x=i*210+off+(n%3)*37,h=170+((i+n*2)&3)*52;
    ctx.fillRect(x,160-h*.15,130,h);
    if(n!==6){ctx.beginPath();ctx.moveTo(x-8,160-h*.15);ctx.lineTo(x+65,80-h*.15);ctx.lineTo(x+138,160-h*.15);ctx.closePath();ctx.fill();}
    if(n===6){ctx.globalAlpha=.10;ctx.fillRect(x-40,90,210,20);ctx.globalAlpha=.20+.025*n;}
  }
  ctx.restore();
}
function drawRegionDepth(z){
  const n=z.index,t=elapsed(),off=castleParallaxOffset(.055);
  ctx.save();
  if(n===0){
    ctx.globalAlpha=.16;ctx.fillStyle='#0c1420';
    for(let i=0;i<7;i++){const x=i*250+off;ctx.fillRect(x,210,150,390);for(let b=0;b<4;b++)ctx.fillRect(x+b*42,187,24,28);}
    ctx.globalAlpha=.18;ctx.strokeStyle='#7890a3';for(let i=0;i<4;i++){const x=220+i*390+off*.5;ctx.beginPath();ctx.moveTo(x,110);ctx.lineTo(x+18,270);ctx.stroke();}
  }else if(n===1){
    for(let i=0;i<5;i++){const x=80+i*330+off*.35;ctx.globalAlpha=.15;ctx.fillStyle=i%2?'#9a6bc3':'#5e87b8';ctx.beginPath();ctx.roundRect(x,120,150,300,72);ctx.fill();ctx.globalAlpha=.12;ctx.fillStyle='#f1d29b';ctx.fillRect(x+69,120,12,300);}
    ctx.globalAlpha=.16;ctx.fillStyle='#09070d';for(let i=0;i<4;i++){const x=205+i*375;ctx.fillRect(x,255,90,145);ctx.fillStyle='rgba(210,180,235,.15)';ctx.fillRect(x+12,270,66,105);ctx.fillStyle='#09070d';}
  }else if(n===2){
    ctx.globalAlpha=.22;ctx.fillStyle='#02080b';ctx.fillRect(0,570,W,260);
    ctx.globalAlpha=.18;ctx.strokeStyle='#78868b';ctx.lineWidth=3;
    for(let i=0;i<8;i++){const x=75+i*220+off*.25;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+Math.sin(t*.3+i)*8,205+(i%3)*45);ctx.stroke();for(let y=20;y<175;y+=22){ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.stroke();}}
  }else if(n===3){
    ctx.globalAlpha=.15;ctx.strokeStyle='#c28743';ctx.lineWidth=8;
    for(let i=0;i<6;i++){const x=120+i*280+off*.45,y=240+(i%2)*115,r=55+(i%3)*18;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();for(let a=0;a<8;a++){const aa=a*Math.PI/4+t*(i%2?.08:-.06);ctx.beginPath();ctx.moveTo(x+Math.cos(aa)*(r-12),y+Math.sin(aa)*(r-12));ctx.lineTo(x+Math.cos(aa)*(r+16),y+Math.sin(aa)*(r+16));ctx.stroke();}}
    ctx.lineWidth=2;
  }else if(n===4){
    ctx.globalAlpha=.20;ctx.fillStyle='#130c0d';
    for(let i=0;i<8;i++){const x=20+i*205+off*.18;ctx.fillRect(x,115,165,480);for(let y=150;y<560;y+=56){ctx.fillStyle='rgba(120,82,58,.3)';ctx.fillRect(x+8,y,149,5);ctx.fillStyle='#130c0d';}}
  }else if(n===5){
    ctx.globalAlpha=.14;ctx.fillStyle='#020307';
    for(let i=0;i<5;i++){const x=75+i*335+off*.25;ctx.beginPath();ctx.moveTo(x,460);ctx.lineTo(x,250);ctx.quadraticCurveTo(x+85,95,x+170,250);ctx.lineTo(x+170,460);ctx.closePath();ctx.fill();}
    ctx.globalAlpha=.08;ctx.fillStyle='#d8e2f0';for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(100+i*330,140);ctx.lineTo(245+i*330,600);ctx.lineTo(300+i*330,600);ctx.closePath();ctx.fill();}
  }else if(n===6){
    ctx.globalAlpha=.14;ctx.fillStyle='#07110e';for(let i=0;i<7;i++){const x=40+i*250+off*.4,y=180+(i%3)*45;ctx.beginPath();ctx.arc(x,y,105,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=.16;ctx.strokeStyle='#5e946b';ctx.lineWidth=7;for(let i=0;i<6;i++){const x=i*320+off*.25;ctx.beginPath();ctx.moveTo(x,-20);ctx.bezierCurveTo(x+150,180,x-50,420,x+180,710);ctx.stroke();}ctx.lineWidth=2;
  }else if(n===7){
    ctx.globalAlpha=.16;ctx.fillStyle='#abcce2';for(let i=0;i<8;i++){const x=(i*240+off*.25)%1750,y=120+(i%3)*55;ctx.beginPath();ctx.ellipse(x,y,130,38,0,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=.18;ctx.fillStyle='#111b27';for(let i=0;i<6;i++){const x=i*300+off*.18;ctx.fillRect(x,330,210,360);for(let b=0;b<5;b++)ctx.fillRect(x+b*48,300,28,36);}
  }else if(n===8){
    ctx.globalAlpha=.18;ctx.fillStyle='#070204';for(let i=0;i<7;i++){const x=50+i*245+off*.16;ctx.fillRect(x,105,90,510);}
    ctx.globalAlpha=.12;ctx.fillStyle='#b32336';for(let i=0;i<5;i++){const x=155+i*325;ctx.beginPath();ctx.moveTo(x,80);ctx.lineTo(x+78,80);ctx.lineTo(x+60,400+Math.sin(i)*40);ctx.lineTo(x+40,365);ctx.lineTo(x+20,400);ctx.closePath();ctx.fill();}
  }else{
    ctx.globalAlpha=.13;ctx.strokeStyle='#ea67dc';ctx.lineWidth=3;
    for(let i=0;i<12;i++){const x=(i*151+state.level*19)%W,y=90+(i*77)%620;ctx.save();ctx.translate(x,y);ctx.rotate((i%5)*.28+t*.01*(i%2?1:-1));ctx.strokeRect(-70,-22,140,44);ctx.restore();}
    ctx.globalAlpha=.11;ctx.fillStyle='#fa75df';for(let i=0;i<5;i++){const x=160+i*330,y=240+(i%2)*120;ctx.beginPath();ctx.ellipse(x,y,100,34,0,0,Math.PI*2);ctx.fill();}
  }
  ctx.restore();
}
function drawRegionStoryDetails(z){
  const n=z.index,t=elapsed(),px=player?.x+21||800,py=player?.y+28||450;
  ctx.save();
  if(n===0){
    ctx.globalAlpha=.28;for(let i=0;i<6;i++){const x=120+i*280;ctx.fillStyle=i%2?'#6c2430':'#917137';ctx.fillRect(x,250,42,150);ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.moveTo(x+6,290);ctx.lineTo(x+21,270);ctx.lineTo(x+36,290);ctx.closePath();ctx.fill();}
    ctx.globalAlpha=.18;ctx.strokeStyle='#b8c9d8';for(let i=0;i<4;i++){const x=((t*34+i*430)%1900)-120,y=120+(i%2)*55;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+10,y-8,x+20,y);ctx.quadraticCurveTo(x+30,y-8,x+40,y);ctx.stroke();}
  }else if(n===1){
    for(let i=0;i<4;i++){const x=190+i*360,y=245;ctx.globalAlpha=.22;ctx.fillStyle='#120d17';ctx.fillRect(x,y,92,135);ctx.strokeStyle='#a884c4';ctx.strokeRect(x,y,92,135);const look=Math.max(-4,Math.min(4,(px-(x+46))/150));ctx.fillStyle='rgba(220,200,235,.25)';ctx.beginPath();ctx.ellipse(x+46+look,y+58,16,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(120,60,155,.65)';ctx.beginPath();ctx.arc(x+46+look,y+58,3,0,Math.PI*2);ctx.fill();}
  }else if(n===2){
    ctx.globalAlpha=.25;ctx.fillStyle='#91b6c2';ctx.fillRect(0,775,W,6);ctx.globalAlpha=.15;for(let i=0;i<12;i++){const x=(i*147+state.level*7)%W,y=((t*70+i*93)%560)+90;ctx.fillRect(x,y,2,14);}
    ctx.globalAlpha=.17;ctx.strokeStyle='#8a969b';for(let i=0;i<5;i++){const x=130+i*340;ctx.beginPath();ctx.moveTo(x,110);ctx.lineTo(x,420);ctx.stroke();}
  }else if(n===3){
    ctx.globalAlpha=.26;ctx.strokeStyle='#d0a35c';ctx.lineWidth=5;const x=800,y=115;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(t*.9)*115,420);ctx.stroke();ctx.fillStyle='#6e4d2e';ctx.beginPath();ctx.ellipse(x+Math.sin(t*.9)*115,430,54,18,0,0,Math.PI*2);ctx.fill();ctx.lineWidth=2;
  }else if(n===4){
    ctx.globalAlpha=.28;ctx.fillStyle='#d3b48e';for(let i=0;i<14;i++){const x=(i*137+t*(10+(i%4)*3))%1750-60,y=150+(i*91)%500;ctx.save();ctx.translate(x,y);ctx.rotate((i*.8+t*.25)%6);ctx.fillRect(-10,-6,20,12);ctx.restore();}
    if(Math.floor(state.level/11)%3===0){ctx.globalAlpha=.18;ctx.fillStyle='#050308';ctx.beginPath();ctx.ellipse(1290,310,34,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b36bce';ctx.beginPath();ctx.arc(1290+Math.max(-8,Math.min(8,(px-1290)/90)),310,5,0,Math.PI*2);ctx.fill();}
  }else if(n===5){
    ctx.globalAlpha=.32;for(let i=0;i<15;i++){const x=45+i*112,y=545+(i%2)*24;ctx.fillStyle='#ffc86b';ctx.fillRect(x,y,3,27);ctx.beginPath();ctx.arc(x+1.5,y-3+Math.sin(t*5+i)*2,4,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=.10;ctx.fillStyle='#d9e5f3';for(let i=0;i<3;i++){const x=((t*18+i*580)%1850)-120,y=270+(i%2)*120;ctx.beginPath();ctx.ellipse(x,y,35,60,0,0,Math.PI*2);ctx.fill();}
  }else if(n===6){
    ctx.globalAlpha=.28;ctx.fillStyle='#8bc383';for(let i=0;i<18;i++){const x=(i*101+t*(14+(i%3)*5))%1700-50,y=((t*(17+i%4*3)+i*73)%700)+50;ctx.save();ctx.translate(x,y);ctx.rotate(t+i);ctx.beginPath();ctx.ellipse(0,0,6,3,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    ctx.globalAlpha=.14;ctx.fillStyle='#233a31';for(let i=0;i<4;i++){const x=200+i*410,y=125+(i%2)*90;ctx.fillRect(x,y,160,24);ctx.fillRect(x+20,y-95,25,95);ctx.fillRect(x+115,y-65,22,65);}
  }else if(n===7){
    ctx.globalAlpha=.24;ctx.strokeStyle='#bfe8ff';ctx.lineWidth=2;for(let i=0;i<45;i++){const x=(i*47+t*230)%1700-50,y=(i*91+t*520)%950-30;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-14,y+34);ctx.stroke();}
    if(Math.floor(t*2.2)%13===0){ctx.globalAlpha=.38;ctx.strokeStyle='#e6f7ff';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(1120,0);ctx.lineTo(1055,125);ctx.lineTo(1115,168);ctx.lineTo(1015,315);ctx.stroke();}
  }else if(n===8){
    ctx.globalAlpha=.32;for(let i=0;i<18;i++){const x=(i*103+t*(18+i%4*5))%1700-40,y=720-((t*(28+i%3*8)+i*61)%610);ctx.fillStyle=i%2?'#ff674f':'#a82c3e';ctx.fillRect(x,y,3+(i%2),3+(i%3));}
    ctx.globalAlpha=.12;ctx.strokeStyle='#ff5266';for(let i=0;i<8;i++){const x=60+i*220;ctx.beginPath();ctx.moveTo(x,100);ctx.lineTo(x+40,260);ctx.lineTo(x+5,410);ctx.stroke();}
  }else{
    ctx.globalAlpha=.22;ctx.strokeStyle='#f077df';ctx.lineWidth=2;for(let i=0;i<10;i++){const x=100+i*165,y=110+(i%4)*130,ox=Math.sin(t*.7+i)*18;ctx.beginPath();ctx.moveTo(x+ox,y);ctx.lineTo(x-35+ox,y+65);ctx.lineTo(x+45+ox,y+115);ctx.lineTo(x-10+ox,y+170);ctx.stroke();}
  }
  ctx.restore();
}
function drawBossArenaAtmosphere(z){
  const ld=state.levelData;if(!ld?.boss)return;
  const t=elapsed(),c=(ELEMENTS[ld.boss.element]||ELEMENTS.darkness).color;
  ctx.save();ctx.globalAlpha=.18;ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(800,330,360,220,0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=.28;ctx.strokeStyle=c;ctx.lineWidth=4;for(let i=0;i<4;i++){const r=150+i*58;ctx.beginPath();ctx.arc(800,380,r,-Math.PI*.88,-Math.PI*.12);ctx.stroke();}
  ctx.globalAlpha=.25;for(let i=0;i<8;i++){const a=i*Math.PI/4+t*.04,x=800+Math.cos(a)*300,y=430+Math.sin(a)*170;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.strokeRect(-14,-14,28,28);ctx.restore();}
  ctx.restore();
}
function drawCastleMemoryBleed(){
  const q=castleCorruption();if(q<.38)return;
  const t=elapsed();ctx.save();ctx.globalAlpha=(q-.28)*.18;
  if(state.level>700){ctx.fillStyle='#5b3427';ctx.fillRect(1180,260,120,260);ctx.fillStyle='#6d526d';for(let y=290;y<490;y+=42)ctx.fillRect(1188,y,104,4);}
  if(state.level>820){ctx.strokeStyle='#5d8e63';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(250,0);ctx.bezierCurveTo(400,170,170,360,390,690);ctx.stroke();ctx.lineWidth=2;}
  if(state.level>900){ctx.globalAlpha=.12+.06*Math.sin(t*2);ctx.fillStyle='#9a6fc0';ctx.beginPath();ctx.roundRect(190,190,120,230,55);ctx.fill();ctx.fillStyle='#050209';ctx.beginPath();ctx.ellipse(250,290,24,9,0,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}
function drawCastleCorruptionOverlay(){
  const q=castleCorruption();if(q<=0)return;
  const t=elapsed();ctx.save();ctx.globalAlpha=.05+.11*q;ctx.strokeStyle='#b13a86';ctx.lineWidth=2;
  const cracks=2+Math.floor(q*9);for(let i=0;i<cracks;i++){const x=(i*173+state.level*29)%W,y=80+(i*97)%630;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+18,y+28);ctx.lineTo(x-5,y+56);ctx.lineTo(x+26,y+83);ctx.stroke();}
  if(state.level===666){ctx.globalAlpha=.14+.05*Math.sin(t*3);ctx.fillStyle='#650019';for(let i=0;i<5;i++){const x=220+i*310,y=250+(i%2)*150;ctx.beginPath();ctx.ellipse(x,y,70,26,0,0,Math.PI*2);ctx.fill();}}
  ctx.restore();
}
function drawCastleLighting(z){
  const n=z.index,t=elapsed();ctx.save();
  const warm=[0,1,3,4,5,8].includes(n),c=warm?'#ffbd67':(n===7?'#a8e7ff':n===6?'#9fe5a6':'#d883ff');
  const count=n===2?3:5;for(let i=0;i<count;i++){const x=140+i*(W/(count-1||1)),y=n===7?180:280+(i%2)*105,r=55+Math.sin(t*4+i)*7;ctx.globalAlpha=.035+(i%2)*.012;ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}
function drawForegroundAtmosphere(){
  const z=castleRegion(state.level),n=z.index,t=elapsed();ctx.save();ctx.pointerEvents='none';
  if(n===2){ctx.globalAlpha=.14;ctx.fillStyle='#aec6ce';for(let i=0;i<9;i++){const x=(i*199+t*17)%1750-60,y=770+(i%3)*18;ctx.beginPath();ctx.ellipse(x,y,120,18,0,0,Math.PI*2);ctx.fill();}}
  if(n===5){ctx.globalAlpha=.08;ctx.fillStyle='#d9e7f5';for(let i=0;i<5;i++){const x=(i*350+t*20)%1850-120,y=520+(i%2)*85;ctx.beginPath();ctx.ellipse(x,y,170,34,0,0,Math.PI*2);ctx.fill();}}
  if(n===7){ctx.globalAlpha=.13;ctx.fillStyle='#cbe9f6';for(let i=0;i<5;i++){const x=(i*360-t*28)%1900,y=690+(i%2)*70;ctx.beginPath();ctx.ellipse(x,y,190,32,0,0,Math.PI*2);ctx.fill();}}
  if(n===8||n===9){ctx.globalAlpha=.12;ctx.fillStyle=n===8?'#e24946':'#e05acb';for(let i=0;i<12;i++){const x=(i*137+t*12)%1700,y=850-((t*18+i*67)%720);ctx.beginPath();ctx.arc(x,y,2+i%2,0,Math.PI*2);ctx.fill();}}
  ctx.restore();
}

function drawBackground(){
  const z=castleRegion(state.level),g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,z.sky);g.addColorStop(1,'#05070a');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  drawFarCastleSilhouette(z);drawRegionDepth(z);
  const n=z.index;if(n===0)bgCourtyard(z);else if(n===1)bgRoyal(z);else if(n===2)bgDungeon(z);else if(n===3)bgClock(z);else if(n===4)bgLibrary(z);else if(n===5)bgChapel(z);else if(n===6)bgGarden(z);else if(n===7)bgRamparts(z);else if(n===8)bgThrone(z);else bgHeart(z);
  drawRegionStoryDetails(z);drawBossArenaAtmosphere(z);drawCastleMemoryBleed();drawCastleLighting(z);
  if(state.levelData?.joker)drawJokerAnomaly();
  drawCastleCorruptionOverlay();
  ctx.fillStyle='rgba(0,0,0,.16)';ctx.fillRect(0,0,W,H);
}
function drawJokerAnomaly(){
  const t=elapsed(),variant=state.levelData?.jokerVariant||0,px=player?.x+21||800,py=player?.y+28||450;
  ctx.save();
  const pulse=.06+(Math.sin(t*3.1)+1)*.025;
  ctx.fillStyle=`rgba(95,0,70,${pulse})`;ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,60,155,.16)';ctx.lineWidth=3;
  for(let i=0;i<7;i++){const x=80+i*245+Math.sin(t*1.3+i)*18,y=115+(i%3)*122;ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t*.7+i)*.08+(variant-1.5)*.01);ctx.strokeRect(-74,-28,148,56);ctx.restore();}
  for(let i=0;i<6;i++){
    const x=150+i*265,y=190+(i%2)*210+Math.sin(t*1.7+i)*7,rx=30+(i%3)*7,ry=13+(i%2)*3;
    ctx.fillStyle='rgba(5,3,10,.68)';ctx.beginPath();ctx.moveTo(x-rx,y);ctx.quadraticCurveTo(x,y-ry*1.6,x+rx,y);ctx.quadraticCurveTo(x,y+ry*1.6,x-rx,y);ctx.fill();
    const lookX=Math.max(-8,Math.min(8,(px-x)/90)),lookY=Math.max(-4,Math.min(4,(py-y)/120));
    ctx.fillStyle='rgba(255,78,155,.72)';ctx.beginPath();ctx.arc(x+lookX,y+lookY,6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,230,245,.8)';ctx.beginPath();ctx.arc(x+lookX+1,y+lookY-1,2,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=.13;ctx.fillStyle='#ff4d9e';
  for(let i=0;i<5;i++){const y=((t*95+i*173+variant*61)%H);ctx.fillRect((i%2)*180,y,W-(i%2)*360,2+(i%3));}
  ctx.restore();
}
function bgStone(z,alpha=.15){ctx.strokeStyle=`rgba(220,220,220,${alpha})`;ctx.lineWidth=2;for(let y=100;y<H;y+=70){const off=(Math.floor(y/70)%2)*52;for(let x=-off;x<W;x+=104)ctx.strokeRect(x,y,104,70);}}
function bgCourtyard(z){ctx.fillStyle='rgba(112,145,175,.12)';ctx.fillRect(0,0,W,250);ctx.fillStyle=z.wall;for(let i=0;i<8;i++){const x=i*220-35,h=260+(i%3)*70;ctx.fillRect(x,230,160,h);for(let b=0;b<5;b++)ctx.fillRect(x+b*35,205,22,30);}for(let i=0;i<6;i++){ctx.fillStyle=z.accent;ctx.globalAlpha=.28;ctx.fillRect(130+i*270,250,40,150);ctx.globalAlpha=1;}bgStone(z,.06);}
function bgRoyal(z){ctx.fillStyle=z.wall;ctx.fillRect(0,110,W,H);for(let i=0;i<6;i++){const x=90+i*285;ctx.fillStyle='rgba(110,160,210,.12)';ctx.beginPath();ctx.roundRect(x,150,125,250,60);ctx.fill();ctx.strokeStyle='rgba(220,180,255,.18)';ctx.stroke();ctx.fillStyle=z.accent;ctx.globalAlpha=.22;ctx.fillRect(x+47,150,30,250);ctx.globalAlpha=1;}for(let i=0;i<5;i++){ctx.fillStyle='rgba(205,170,90,.14)';ctx.fillRect(180+i*310,70,7,520);}bgStone(z,.045);}
function bgDungeon(z){ctx.fillStyle=z.wall;ctx.fillRect(0,90,W,H);bgStone(z,.07);for(let i=0;i<7;i++){const x=80+i*235;ctx.fillStyle='rgba(0,0,0,.42)';ctx.fillRect(x,210,120,210);ctx.strokeStyle='rgba(130,150,155,.22)';for(let b=0;b<5;b++){ctx.beginPath();ctx.moveTo(x+15+b*23,210);ctx.lineTo(x+15+b*23,420);ctx.stroke();}}ctx.strokeStyle='rgba(150,155,160,.2)';for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(150+i*280,0);ctx.lineTo(150+i*280,170+(i%2)*50);ctx.stroke();}}
function bgClock(z){ctx.fillStyle=z.wall;ctx.fillRect(0,90,W,H);bgStone(z,.05);for(let i=0;i<7;i++){const x=110+i*245,y=210+(i%2)*95,r=55+(i%3)*18;ctx.strokeStyle='rgba(205,151,80,.20)';ctx.lineWidth=9;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();for(let a=0;a<8;a++){ctx.save();ctx.translate(x,y);ctx.rotate(a*Math.PI/4);ctx.fillStyle='rgba(205,151,80,.14)';ctx.fillRect(r-5,-7,24,14);ctx.restore();}}ctx.lineWidth=2;}
function bgLibrary(z){ctx.fillStyle=z.wall;ctx.fillRect(0,70,W,H);for(let i=0;i<9;i++){const x=25+i*185;ctx.fillStyle='rgba(35,20,17,.68)';ctx.fillRect(x,150,145,430);for(let y=180;y<570;y+=48){ctx.fillStyle='rgba(120,83,60,.35)';ctx.fillRect(x+7,y,131,5);for(let k=0;k<11;k++){ctx.fillStyle=`rgba(${90+(k%3)*30},${55+(k%4)*15},${85+(k%2)*30},.32)`;ctx.fillRect(x+11+k*11,y-30,8,28);}}}}
function bgChapel(z){ctx.fillStyle=z.wall;ctx.fillRect(0,80,W,H);for(let i=0;i<5;i++){const x=85+i*330;ctx.fillStyle='rgba(10,10,15,.45)';ctx.beginPath();ctx.moveTo(x,410);ctx.lineTo(x,240);ctx.quadraticCurveTo(x+80,100,x+160,240);ctx.lineTo(x+160,410);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(180,190,205,.12)';ctx.stroke();}for(let i=0;i<14;i++){ctx.fillStyle='rgba(255,211,125,.16)';ctx.fillRect(45+i*115,510+(i%2)*35,4,35);}}
function bgGarden(z){ctx.fillStyle='rgba(30,65,52,.55)';ctx.fillRect(0,80,W,H);for(let i=0;i<8;i++){ctx.fillStyle='rgba(85,135,95,.12)';ctx.beginPath();ctx.arc(100+i*225,240+(i%3)*55,90,0,Math.PI*2);ctx.fill();}ctx.strokeStyle='rgba(120,190,115,.22)';ctx.lineWidth=8;for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(i*300,0);ctx.bezierCurveTo(i*300+140,230,i*300-30,430,i*300+170,690);ctx.stroke();}ctx.lineWidth=2;}
function bgRamparts(z){ctx.fillStyle='rgba(55,95,130,.14)';ctx.fillRect(0,0,W,340);ctx.fillStyle=z.wall;for(let i=0;i<7;i++){const x=i*250-40;ctx.fillRect(x,350,180,300);for(let b=0;b<5;b++)ctx.fillRect(x+b*42,325,24,35);}ctx.strokeStyle='rgba(180,220,255,.18)';for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(100+i*220,60);ctx.lineTo(35+i*220,250);ctx.stroke();}if(Math.floor(elapsed()*2)%8===0){ctx.strokeStyle='rgba(220,245,255,.45)';ctx.beginPath();ctx.moveTo(1120,0);ctx.lineTo(1050,110);ctx.lineTo(1110,150);ctx.lineTo(1010,290);ctx.stroke();}}
function bgThrone(z){ctx.fillStyle=z.wall;ctx.fillRect(0,70,W,H);bgStone(z,.045);ctx.fillStyle='rgba(120,15,25,.22)';for(let i=0;i<7;i++)ctx.fillRect(90+i*245,85,65,500);ctx.fillStyle='rgba(20,5,8,.55)';ctx.beginPath();ctx.moveTo(690,470);ctx.lineTo(800,260);ctx.lineTo(910,470);ctx.closePath();ctx.fill();ctx.fillStyle='rgba(210,70,70,.10)';ctx.fillRect(735,300,130,310);}
function bgHeart(z){ctx.fillStyle=z.wall;ctx.fillRect(0,0,W,H);for(let i=0;i<14;i++){const x=(i*137+state.level*17)%W,y=70+(i*83)%650;ctx.save();ctx.translate(x,y);ctx.rotate((i%4)*.35);ctx.strokeStyle='rgba(235,90,220,.15)';ctx.strokeRect(-80,-25,160,50);ctx.restore();}const pulse=.18+Math.sin(elapsed()*2.2)*.06;ctx.fillStyle=`rgba(235,50,190,${pulse})`;ctx.beginPath();ctx.arc(800,300,120,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(255,180,245,.18)';for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(800,300);ctx.lineTo(100+i*200,H);ctx.stroke();}}
function drawPlatform(p){
  const z=castleRegion(state.level),n=z.index,top=7;
  ctx.save();ctx.fillStyle=z.platform;ctx.fillRect(p.x,p.y,p.w,p.h);ctx.fillStyle=z.edge;ctx.fillRect(p.x,p.y,p.w,top);
  const depth=Math.min(44,Math.max(0,p.h-top));ctx.beginPath();ctx.rect(p.x,p.y,p.w,top+depth);ctx.clip();
  if(n===0){
    ctx.strokeStyle='rgba(220,210,190,.13)';for(let xx=p.x;xx<p.x+p.w;xx+=48)ctx.strokeRect(xx,p.y+7,48,34);
    ctx.fillStyle='rgba(93,126,78,.18)';for(let xx=p.x+14;xx<p.x+p.w;xx+=83)ctx.fillRect(xx,p.y,24,3);
  }else if(n===1){
    ctx.strokeStyle='rgba(226,202,240,.16)';ctx.lineWidth=2;for(let xx=p.x+24;xx<p.x+p.w;xx+=70){ctx.beginPath();ctx.moveTo(xx,p.y+8);ctx.lineTo(xx+28,p.y+37);ctx.lineTo(xx+56,p.y+8);ctx.stroke();}
    ctx.fillStyle='rgba(154,92,185,.13)';ctx.fillRect(p.x,p.y+12,p.w,4);
  }else if(n===2){
    ctx.strokeStyle='rgba(180,205,210,.11)';for(let xx=p.x;xx<p.x+p.w;xx+=55)ctx.strokeRect(xx,p.y+7,55,35);
    ctx.fillStyle='rgba(130,177,190,.15)';for(let xx=p.x+18;xx<p.x+p.w;xx+=91)ctx.fillRect(xx,p.y+7,3,18+(xx%3)*3);
  }else if(n===3){
    ctx.strokeStyle='rgba(199,145,68,.24)';ctx.lineWidth=2;ctx.strokeRect(p.x+2,p.y+9,p.w-4,25);
    ctx.fillStyle='rgba(218,169,93,.32)';for(let xx=p.x+18;xx<p.x+p.w;xx+=54){ctx.beginPath();ctx.arc(xx,p.y+20,3,0,Math.PI*2);ctx.fill();}
  }else if(n===4){
    ctx.fillStyle='rgba(65,37,29,.75)';ctx.fillRect(p.x,p.y+7,p.w,37);ctx.fillStyle='rgba(157,108,68,.28)';ctx.fillRect(p.x,p.y+9,p.w,4);
    for(let xx=p.x+10;xx<p.x+p.w;xx+=18){ctx.fillStyle=xx%36?'rgba(112,70,92,.35)':'rgba(85,105,76,.35)';ctx.fillRect(xx,p.y+17,12,24);}
  }else if(n===5){
    ctx.strokeStyle='rgba(210,220,230,.13)';for(let xx=p.x;xx<p.x+p.w;xx+=64)ctx.strokeRect(xx,p.y+7,64,34);
    ctx.strokeStyle='rgba(40,45,55,.38)';for(let xx=p.x+30;xx<p.x+p.w;xx+=115){ctx.beginPath();ctx.moveTo(xx,p.y+7);ctx.lineTo(xx+14,p.y+20);ctx.lineTo(xx+4,p.y+38);ctx.stroke();}
  }else if(n===6){
    ctx.strokeStyle='rgba(120,187,128,.26)';ctx.lineWidth=3;for(let xx=p.x+6;xx<p.x+p.w;xx+=58){ctx.beginPath();ctx.moveTo(xx,p.y+4);ctx.bezierCurveTo(xx+15,p.y+14,xx-8,p.y+25,xx+21,p.y+40);ctx.stroke();}
    ctx.fillStyle='rgba(90,135,87,.22)';ctx.fillRect(p.x,p.y,p.w,4);
  }else if(n===7){
    ctx.strokeStyle='rgba(176,218,240,.16)';for(let xx=p.x;xx<p.x+p.w;xx+=52)ctx.strokeRect(xx,p.y+7,52,33);
    ctx.fillStyle='rgba(175,225,248,.16)';ctx.fillRect(p.x,p.y,p.w,2);ctx.fillRect(p.x+8,p.y+11,p.w*.55,2);
  }else if(n===8){
    ctx.strokeStyle='rgba(154,50,58,.24)';for(let xx=p.x+28;xx<p.x+p.w;xx+=72){ctx.beginPath();ctx.moveTo(xx,p.y+8);ctx.lineTo(xx+18,p.y+23);ctx.lineTo(xx+7,p.y+40);ctx.stroke();}
    ctx.fillStyle='rgba(189,46,62,.20)';ctx.fillRect(p.x,p.y+10,p.w,3);
  }else{
    const pulse=.11+(Math.sin(elapsed()*2.3+p.x*.01)+1)*.035;ctx.strokeStyle=`rgba(238,102,218,${pulse+.06})`;ctx.lineWidth=2;
    for(let xx=p.x+12;xx<p.x+p.w;xx+=62){ctx.save();ctx.translate(xx,p.y+24);ctx.rotate((xx%5)*.16);ctx.strokeRect(-18,-10,36,20);ctx.restore();}
    ctx.fillStyle=`rgba(221,68,190,${pulse})`;ctx.fillRect(p.x,p.y,p.w,4);
  }
  ctx.restore();
}
function drawHazard(h){
  const palette={roots:'#5f8f48',storm:'#7fd8ff',curse:'#b15cff'},c=palette[h.type];ctx.save();ctx.fillStyle=c;ctx.globalAlpha=.5;ctx.fillRect(h.x,h.y,h.w,h.h);ctx.globalAlpha=1;
  if(h.type==='roots'){ctx.strokeStyle='#9fc66d';ctx.lineWidth=5;for(let x=h.x+12;x<h.x+h.w;x+=34){ctx.beginPath();ctx.moveTo(x,h.y+h.h);ctx.quadraticCurveTo(x-12,h.y+28,x+8,h.y+4);ctx.stroke();}}
  else if(h.type==='storm'){ctx.strokeStyle='rgba(230,250,255,.8)';ctx.lineWidth=3;for(let y=h.y+14;y<h.y+h.h;y+=18){ctx.beginPath();ctx.moveTo(h.x+8,y);ctx.lineTo(h.x+h.w-8,y-7);ctx.stroke();}}
  else{ctx.shadowBlur=20;ctx.shadowColor=c;ctx.fillStyle='rgba(210,120,255,.45)';for(let x=h.x+10;x<h.x+h.w;x+=28){ctx.beginPath();ctx.arc(x,h.y+18+(x%3)*8,6,0,Math.PI*2);ctx.fill();}}ctx.restore();
}
function drawSpike(s){ctx.fillStyle='#eef1f6';const n=Math.max(1,Math.floor(s.w/18));for(let i=0;i<n;i++){const x=s.x+i*s.w/n;ctx.beginPath();if(s.dir==='down'){ctx.moveTo(x,s.y);ctx.lineTo(x+s.w/n/2,s.y+s.h);ctx.lineTo(x+s.w/n,s.y);}else{ctx.moveTo(x,s.y+s.h);ctx.lineTo(x+s.w/n/2,s.y);ctx.lineTo(x+s.w/n,s.y+s.h);}ctx.closePath();ctx.fill();}}
function drawPlate(p,on){ctx.fillStyle=on?'#91d17d':'#d7b56d';ctx.fillRect(p.x,p.y,p.w,p.h);ctx.shadowBlur=on?18:0;ctx.shadowColor=ctx.fillStyle;ctx.fillRect(p.x+8,p.y-5,p.w-16,5);ctx.shadowBlur=0;}
function drawDoor(d){
  const z=castleRegion(state.level),n=z.index;ctx.save();
  ctx.fillStyle=n===4?'#39251c':n===8?'#281216':n===9?'#210c24':'#3f352c';ctx.fillRect(d.x,d.y,d.w,d.h);
  ctx.strokeStyle=n===7?'#7db9d7':n===9?'#d45ac6':z.accent;ctx.lineWidth=3;ctx.strokeRect(d.x+2,d.y+2,d.w-4,d.h-4);
  ctx.globalAlpha=.35;ctx.fillStyle=z.accent;for(let y=d.y+18;y<d.y+d.h;y+=35)ctx.fillRect(d.x+7,y,d.w-14,3);
  ctx.globalAlpha=1;ctx.fillStyle='#09090c';ctx.beginPath();ctx.arc(d.x+d.w-9,d.y+d.h*.53,3,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawGoal(g,open=true){
  const z=castleRegion(state.level),n=z.index,t=elapsed();ctx.save();ctx.globalAlpha=open?1:.45;
  const frame=n===9?'#ce5bc2':n===8?'#ba4652':n===7?'#78bfdc':n===6?'#73aa7d':z.accent;
  ctx.fillStyle=n===9?'rgba(18,5,20,.96)':'rgba(24,18,14,.92)';ctx.fillRect(g.x,g.y,g.w,g.h);
  ctx.strokeStyle=open?frame:'#7d3150';ctx.lineWidth=4;ctx.strokeRect(g.x,g.y,g.w,g.h);
  if(open){ctx.globalAlpha=.11+.05*Math.sin(t*3);ctx.fillStyle=frame;ctx.fillRect(g.x-6,g.y-6,g.w+12,g.h+12);ctx.globalAlpha=1;}
  ctx.fillStyle=open?'rgba(215,181,109,.12)':'rgba(180,45,90,.16)';ctx.fillRect(g.x+7,g.y+8,g.w-14,g.h-16);
  ctx.font='15px sans-serif';const icons=[['◆','#a8c66c'],['◇','#9bdcff'],['✦','#ffe477'],['●','#a46cff']];icons.forEach((it,i)=>{ctx.fillStyle=it[1];ctx.fillText(it[0],g.x+8+(i%2)*24,g.y+37+Math.floor(i/2)*24);});
  if(n===9&&open){ctx.strokeStyle='rgba(235,95,215,.45)';ctx.beginPath();ctx.arc(g.x+g.w/2,g.y+g.h/2,34+Math.sin(t*2)*4,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
}
function drawFakeDoor(fd){ctx.save();ctx.fillStyle='rgba(25,18,27,.88)';ctx.fillRect(fd.x,fd.y,fd.w,fd.h);ctx.strokeStyle='#a14767';ctx.lineWidth=3;ctx.strokeRect(fd.x,fd.y,fd.w,fd.h);ctx.fillStyle='#c85f88';ctx.font='26px sans-serif';ctx.fillText('?',fd.x+20,fd.y+58);ctx.restore();}
function drawFakeFloor(f){const t=state.trapState.get('f'+f.id)||0;let a=1;if(t){const age=performance.now()-t;a=Math.max(0,1-age/650);}if(a<=0)return;ctx.globalAlpha=a;ctx.fillStyle='#4a4640';ctx.fillRect(f.x,f.y,f.w,f.h);ctx.strokeStyle='rgba(20,15,12,.6)';for(let x=f.x+14;x<f.x+f.w;x+=28){ctx.beginPath();ctx.moveTo(x,f.y);ctx.lineTo(x-8,f.y+7);ctx.lineTo(x+5,f.y+14);ctx.stroke();}ctx.globalAlpha=1;}
function drawBridgeTile(t){if(!bridgeActiveTile(t))return;const trig=state.trapState.get('br'+t.id);ctx.globalAlpha=trig?Math.max(.2,1-(performance.now()-trig)/t.delay):1;ctx.fillStyle='#694a2f';ctx.fillRect(t.x,t.y,t.w,t.h);ctx.strokeStyle='#c49b67';ctx.strokeRect(t.x,t.y,t.w,t.h);ctx.globalAlpha=1;}
function drawVanishPlatform(v){const trig=state.trapState.get('vp'+v.id),age=trig?performance.now()-trig:0;if(age>=v.delay)return;ctx.save();ctx.globalAlpha=trig?Math.max(.12,1-age/v.delay):.82;ctx.fillStyle='#675a76';ctx.fillRect(v.x,v.y,v.w,v.h);ctx.strokeStyle='#bba7d0';ctx.strokeRect(v.x,v.y,v.w,v.h);ctx.restore();}
function drawFallingBlock(b){ctx.fillStyle='#55545c';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeStyle='#a3a0aa';ctx.strokeRect(b.x+4,b.y+4,b.w-8,b.h-8);ctx.fillStyle='#202126';ctx.fillRect(b.x+14,b.y+17,8,8);ctx.fillRect(b.x+b.w-22,b.y+17,8,8);}
function drawSlamWall(w){ctx.fillStyle='#51414a';ctx.fillRect(w.x,w.y,w.w,w.h);ctx.fillStyle='#c0a4ad';for(let y=w.y+8;y<w.y+w.h;y+=22)ctx.fillRect(w.x+5,y,w.w-10,4);}
function drawWindGust(z){ctx.save();ctx.globalAlpha=.18;ctx.strokeStyle='#b9eaff';ctx.lineWidth=3;for(let y=z.y+25;y<z.y+z.h;y+=34){ctx.beginPath();ctx.moveTo(z.x+12,y);ctx.quadraticCurveTo(z.x+z.w*.5,y-18,z.x+z.w-12,y);ctx.stroke();}ctx.restore();}
function drawFakeGoal(f,triggered){ctx.save();ctx.globalAlpha=triggered?.35:1;ctx.fillStyle='rgba(24,18,14,.9)';ctx.fillRect(f.x,f.y,f.w,f.h);ctx.strokeStyle=triggered?'#ff4f79':'#d7b56d';ctx.lineWidth=3;ctx.strokeRect(f.x,f.y,f.w,f.h);ctx.fillStyle=triggered?'#ff4f79':'#a8c66c';ctx.font='26px sans-serif';ctx.fillText(triggered?'☠':'?',f.x+15,f.y+58);ctx.restore();}
function drawReverseZone(z){const p=.08+(Math.sin(elapsed()*5)+1)*.035;ctx.save();ctx.strokeStyle='rgba(255,65,160,.42)';ctx.lineWidth=3;ctx.setLineDash([7,6,2,8]);ctx.strokeRect(z.x,z.y,z.w,z.h);ctx.setLineDash([]);ctx.fillStyle=`rgba(110,0,90,${p})`;ctx.fillRect(z.x,z.y,z.w,z.h);ctx.fillStyle='rgba(255,220,245,.45)';ctx.font='900 20px sans-serif';ctx.fillText('←  ?  →',z.x+z.w/2-36,z.y+32);ctx.restore();}
function drawElevator(e){ctx.fillStyle='#5b4632';ctx.fillRect(e.x,e.y,e.w,e.h);ctx.fillStyle='#c39a62';ctx.fillRect(e.x+8,e.y+4,e.w-16,4);ctx.strokeStyle='rgba(210,190,150,.45)';ctx.beginPath();ctx.moveTo(e.x+8,e.y);ctx.lineTo(e.x+8,70);ctx.moveTo(e.x+e.w-8,e.y);ctx.lineTo(e.x+e.w-8,70);ctx.stroke();}
function drawChandelier(r,falling){ctx.save();ctx.strokeStyle='#80684e';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(r.x+r.w/2,0);ctx.lineTo(r.x+r.w/2,r.y);ctx.stroke();ctx.translate(r.x+r.w/2,r.y+10);ctx.strokeStyle=falling?'#c99058':'#a17e57';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,18,22,0,Math.PI);ctx.stroke();for(let i=-1;i<=1;i++){ctx.fillStyle='#ffca68';ctx.beginPath();ctx.arc(i*14,28,5,0,Math.PI*2);ctx.fill();}ctx.restore();}
function drawCrusher(c){ctx.fillStyle='#4c4d52';ctx.fillRect(c.x,c.y,c.w,c.h);ctx.fillStyle='#9b9da6';for(let y=c.y+8;y<c.y+c.h;y+=18)ctx.fillRect(c.x+4,y,c.w-8,4);drawSpike({x:c.x,y:c.y+c.h-14,w:c.w,h:14});}
function drawBookshelf(b){ctx.fillStyle='#3b251b';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.fillStyle='#674533';for(let y=b.y+18;y<b.y+b.h;y+=24){ctx.fillRect(b.x+5,y,b.w-10,3);ctx.fillStyle='#87604d';for(let x=b.x+7;x<b.x+b.w-7;x+=9)ctx.fillRect(x,y-15,6,14);ctx.fillStyle='#674533';}}
function drawArmor(a){if(a.x<-1000)return;ctx.save();ctx.fillStyle='#8f96a3';ctx.fillRect(a.x+8,a.y+16,a.w-16,a.h-16);ctx.beginPath();ctx.arc(a.x+a.w/2,a.y+12,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#343944';ctx.fillRect(a.x+13,a.y+9,a.w-26,4);ctx.strokeStyle='#cbd0da';ctx.strokeRect(a.x+5,a.y+15,a.w-10,a.h-18);ctx.restore();}
function drawGhost(g){ctx.save();ctx.globalAlpha=.66;ctx.shadowBlur=18;ctx.shadowColor='#a987d9';ctx.fillStyle='#b7a0e8';ctx.beginPath();ctx.roundRect(g.x,g.y,g.w,g.h,18);ctx.fill();ctx.fillStyle='#1b1427';ctx.fillRect(g.x+9,g.y+16,6,7);ctx.fillRect(g.x+25,g.y+16,6,7);ctx.restore();}
function drawDragon(d){ctx.save();ctx.translate(d.x,d.y);ctx.scale(d.fromRight?-1:1,1);ctx.fillStyle='#8b3038';ctx.beginPath();ctx.ellipse(0,0,42,28,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-25,-8);ctx.lineTo(-80,-58);ctx.lineTo(-55,3);ctx.fill();ctx.beginPath();ctx.moveTo(25,-6);ctx.lineTo(78,-42);ctx.lineTo(52,7);ctx.fill();ctx.fillStyle='#ffcf67';ctx.fillRect(28,-6,8,6);ctx.restore();}
function drawFireball(f,c){ctx.save();ctx.shadowBlur=22;ctx.shadowColor=c;ctx.fillStyle=c;ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();ctx.restore();}
function drawEnemy(r,e){
  if(r.x<-1000)return;ctx.save();const palette={sentinel:'#d06c5d',bat:'#9b83cb',wraith:'#6bc2b6'},c=palette[e.type]||'#d06c5d';ctx.shadowBlur=14;ctx.shadowColor=c;ctx.fillStyle=c;
  if(e.type==='bat'){ctx.beginPath();ctx.moveTo(r.x+r.w/2,r.y+8);ctx.lineTo(r.x-10,r.y+r.h/2);ctx.lineTo(r.x+8,r.y+r.h);ctx.lineTo(r.x+r.w/2,r.y+20);ctx.lineTo(r.x+r.w-8,r.y+r.h);ctx.lineTo(r.x+r.w+10,r.y+r.h/2);ctx.closePath();ctx.fill();}
  else if(e.type==='wraith'){ctx.globalAlpha=.75;ctx.beginPath();ctx.roundRect(r.x,r.y,r.w,r.h,14);ctx.fill();ctx.fillStyle='#071115';ctx.fillRect(r.x+9,r.y+14,6,7);ctx.fillRect(r.x+r.w-15,r.y+14,6,7);}
  else{ctx.beginPath();ctx.roundRect(r.x,r.y,r.w,r.h,9);ctx.fill();ctx.fillStyle='#301414';ctx.fillRect(r.x+9,r.y+12,7,7);ctx.fillRect(r.x+r.w-16,r.y+12,7,7);ctx.fillStyle='#d9b36c';ctx.fillRect(r.x+4,r.y+r.h-8,r.w-8,5);}
  ctx.restore();
}

function drawBoss(b){
  ctx.save();const bossTheme=ELEMENTS[b.element]||ELEMENTS.darkness;ctx.fillStyle='#2b2033';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeStyle=bossTheme.color;ctx.lineWidth=5;ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.fillStyle=bossTheme.color;ctx.beginPath();ctx.arc(b.x+b.w/2,b.y+55,36,0,Math.PI*2);ctx.fill();ctx.fillStyle='#231829';ctx.fillRect(b.x+46,b.y+45,18,8);ctx.fillRect(b.x+96,b.y+45,18,8);
  let ri=0;for(const [key,r] of Object.entries(b.runes||{})){
    const element=ELEMENTS[key],colors=['#ffe477','#a46cff'],color=element?.color||colors[ri%2];
    ctx.fillStyle=color+'55';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.fillStyle=color;ctx.font='700 12px sans-serif';
    ctx.fillText(element?`${element.icon} ${element.name.toUpperCase()}`:key==='left'?'RUNA I':'RUNA II',r.x+5,r.y-8);ri++;
  }
  const pct=Math.min(1,state.bossCharge/b.required);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(610,190,380,14);ctx.fillStyle=state.mode==='chaos'?'#e66cff':'#d7b56d';ctx.fillRect(610,190,380*pct,14);ctx.font='700 18px sans-serif';ctx.textAlign='center';ctx.fillStyle='rgba(255,255,255,.75)';ctx.fillText(state.bossDefeated?'CHEFE DERROTADO':state.mode==='singleplayer'?'RITUAL ELEMENTAL':state.mode==='chaos'?'RITUAL DO CAOS · 4 RUNAS':'RITUAL COOPERATIVO',800,178);ctx.textAlign='left';
  if(!state.bossDefeated){ctx.fillStyle='rgba(170,70,210,.2)';ctx.fillRect(b.barrier.x,b.barrier.y,b.barrier.w,b.barrier.h);ctx.strokeStyle='#b75be1';ctx.strokeRect(b.barrier.x,b.barrier.y,b.barrier.w,b.barrier.h);}ctx.restore();
}
function drawChaosSeal(role,r,active){
  const e=ELEMENTS[role]||ELEMENTS.earth,c=e.color;ctx.save();
  ctx.globalAlpha=active?.9:.45;ctx.shadowBlur=active?24:10;ctx.shadowColor=c;ctx.fillStyle=active?c:c+'55';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.shadowBlur=0;ctx.strokeStyle=c;ctx.lineWidth=active?3:1;ctx.strokeRect(r.x,r.y,r.w,r.h);
  ctx.globalAlpha=active?1:.72;ctx.fillStyle=c;ctx.font='800 12px sans-serif';ctx.textAlign='center';ctx.fillText(`${e.icon} ${active?'ATIVO':e.name.toUpperCase()}`,r.x+r.w/2,r.y-8);ctx.textAlign='left';ctx.restore();
}
function characterCorruption(){
  if(state.level===666)return .82;
  if(state.level<700)return 0;
  return Math.max(0,Math.min(1,(state.level-700)/300));
}
function drawCharacterRelic(relicId,role){
  if(!relicId||!RELICS[relicId])return;
  const e=ELEMENTS[role]||ELEMENTS.earth;
  ctx.save();ctx.lineWidth=1.5;ctx.shadowBlur=8;ctx.shadowColor=e.color;
  if(relicId==='fracturedHeart'){
    ctx.fillStyle='#ff5878';ctx.beginPath();ctx.moveTo(0,8);ctx.bezierCurveTo(-9,0,-12,11,0,18);ctx.bezierCurveTo(12,11,9,0,0,8);ctx.fill();
    ctx.strokeStyle='#2d0912';ctx.beginPath();ctx.moveTo(1,7);ctx.lineTo(-2,11);ctx.lineTo(2,13);ctx.lineTo(-1,18);ctx.stroke();
  }else if(relicId==='windstep'){
    ctx.strokeStyle='#d9f7ff';ctx.lineWidth=2;
    for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*10,22);ctx.quadraticCurveTo(side*18,17,side*20,10);ctx.moveTo(side*10,25);ctx.quadraticCurveTo(side*19,24,side*22,18);ctx.stroke();}
  }else if(relicId==='abyssFeather'){
    ctx.strokeStyle='#d5c7ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(10,-5);ctx.quadraticCurveTo(20,3,11,13);ctx.moveTo(11,-4);ctx.lineTo(7,13);ctx.stroke();
  }else if(relicId==='chronoglass'){
    ctx.strokeStyle='#f0d6ff';ctx.fillStyle='rgba(191,128,255,.35)';ctx.beginPath();ctx.moveTo(-5,5);ctx.lineTo(5,5);ctx.lineTo(-4,16);ctx.lineTo(4,16);ctx.closePath();ctx.fill();ctx.stroke();
  }else if(relicId==='greedEye'){
    ctx.strokeStyle='#ffd86a';ctx.fillStyle='#2a1700';ctx.beginPath();ctx.ellipse(0,11,8,4.5,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#ffd86a';ctx.beginPath();ctx.arc(0,11,2.2,0,Math.PI*2);ctx.fill();
  }else if(relicId==='seerMark'){
    ctx.strokeStyle='#c48cff';ctx.beginPath();ctx.arc(0,-8,5.5,0,Math.PI*2);ctx.moveTo(-9,-8);ctx.lineTo(9,-8);ctx.moveTo(0,-17);ctx.lineTo(0,1);ctx.stroke();
  }
  ctx.restore();
}
function drawCorruptionMarks(level,role){
  const q=characterCorruption();if(q<=0)return;
  const t=performance.now()/1000,e=ELEMENTS[role]||ELEMENTS.earth;
  ctx.save();ctx.globalAlpha=.24+.38*q;ctx.strokeStyle='#1b071c';ctx.lineWidth=1.5;
  const count=1+Math.floor(q*4);
  for(let i=0;i<count;i++){
    const ox=-12+i*6,oy=-3+(i%2)*10;
    ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(ox+4,oy+6);ctx.lineTo(ox+1,oy+11);ctx.stroke();
  }
  ctx.globalAlpha=.12+.18*q;ctx.fillStyle=e.color;
  for(let i=0;i<Math.ceil(q*4);i++){const a=t*(.6+i*.12)+i*2.1,r=22+i*3;ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a*1.7)*9,1.5+i*.3,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}
function drawCharacter(x,y,role,me,ability=false,anchored=false,cosmetics={},motion={},relicId=null){
  const e=ELEMENTS[role]||ELEMENTS.earth,c=e.color,accent=e.accent,t=performance.now()/1000;
  const vx=Number(motion?.vx)||0,vy=Number(motion?.vy)||0,onGround=motion?.onGround!==false;
  const facing=(Number(motion?.facing)||1)>=0?1:-1,speed=Math.abs(vx),moving=onGround&&speed>35,airborne=!onGround;
  const run=Math.sin(t*(7+Math.min(6,speed/55))+x*.015),idle=Math.sin(t*2.6+x*.021);
  const localLanding=Number(motion?.landedAt)>0?Math.max(0,1-(performance.now()-Number(motion.landedAt))/180):0;
  const landing=motion?.landPulse?Math.max(.45,Math.abs(Math.sin(t*15))):localLanding;
  const squash=1-Math.min(.12,landing*.12),stretch=1+Math.min(.10,(airborne?Math.min(1,Math.abs(vy)/650)*.08:0));
  const bob=moving?Math.abs(run)*1.25:idle*.65;
  const lean=airborne?Math.max(-.12,Math.min(.12,vx/1400)):Math.max(-.10,Math.min(.10,vx/1800));
  const glitch=state.level===666?Math.sin(t*31+x)*1.2:0;
  const nearThreat=!!state.levelData?.pursuer;
  const eyeGlow=ability||state.level===666;
  const outline='#080a0d';

  ctx.save();ctx.translate(x+21+glitch,y+28+bob);ctx.rotate(lean);ctx.scale(1/squash,stretch*squash);

  if(cosmetics.aura){
    ctx.save();ctx.globalAlpha=.16+.06*Math.sin(t*5);ctx.fillStyle=c;ctx.shadowBlur=18;ctx.shadowColor=c;ctx.beginPath();ctx.arc(0,0,38+Math.sin(t*5)*3,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  const armSwing=moving?run*7:(airborne?facing*4:idle*1.4);
  const legSwing=moving?run*6:(airborne?facing*2:0);
  const headY=-13+(airborne&&vy<0?-1:0);

  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=outline;ctx.lineWidth=2.1;
  ctx.shadowBlur=ability?24:(me?12:7);ctx.shadowColor=c;

  if(role==='earth'){
    // Broad, armored silhouette.
    ctx.fillStyle='#4a3628';ctx.beginPath();ctx.roundRect(-16,-3,32,28,8);ctx.fill();ctx.stroke();
    ctx.fillStyle=c;ctx.beginPath();ctx.arc(-16,2,7,0,Math.PI*2);ctx.arc(16,2,7,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#79604a';ctx.beginPath();ctx.arc(0,headY,12,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(-10,headY-7);ctx.lineTo(-4,headY-14);ctx.lineTo(1,headY-8);ctx.lineTo(7,headY-15);ctx.lineTo(11,headY-5);ctx.lineTo(8,headY-1);ctx.lineTo(-9,headY-1);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='#35261d';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-13,3);ctx.lineTo(-18+armSwing*.18,18);ctx.moveTo(13,3);ctx.lineTo(18-armSwing*.18,18);ctx.stroke();
    ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-8,22);ctx.lineTo(-10-legSwing*.45,29);ctx.moveTo(8,22);ctx.lineTo(10+legSwing*.45,29);ctx.stroke();
    ctx.strokeStyle=c;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-13,12);ctx.lineTo(13,12);ctx.stroke();
  }else if(role==='air'){
    // Narrow body, floating scarf and cloak.
    ctx.fillStyle='#dff7ff';ctx.beginPath();ctx.moveTo(-10,-3);ctx.quadraticCurveTo(-12,12,-8,24);ctx.lineTo(8,24);ctx.quadraticCurveTo(12,12,10,-3);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=c;ctx.beginPath();ctx.arc(0,headY,10.5,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#f5fdff';ctx.beginPath();ctx.moveTo(-9,headY-4);ctx.quadraticCurveTo(0,headY-15,10,headY-4);ctx.lineTo(7,headY-1);ctx.quadraticCurveTo(0,headY-8,-9,headY);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle=c;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-8,1);ctx.lineTo(-13-armSwing*.28,17);ctx.moveTo(8,1);ctx.lineTo(13+armSwing*.28,17);ctx.stroke();
    ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-5,23);ctx.lineTo(-7-legSwing*.35,29);ctx.moveTo(5,23);ctx.lineTo(7+legSwing*.35,29);ctx.stroke();
    ctx.strokeStyle='#dff7ff';ctx.lineWidth=3;const scarfDir=-facing;ctx.beginPath();ctx.moveTo(scarfDir*8,headY+8);ctx.quadraticCurveTo(scarfDir*(20+speed*.02),headY+10+run*2,scarfDir*(28+speed*.03),headY+4-run*3);ctx.stroke();
    ctx.fillStyle='rgba(155,220,255,.28)';ctx.beginPath();ctx.moveTo(-10,8);ctx.lineTo(-16,25);ctx.lineTo(-5,20);ctx.closePath();ctx.moveTo(10,8);ctx.lineTo(16,25);ctx.lineTo(5,20);ctx.closePath();ctx.fill();
  }else if(role==='light'){
    // Elegant robe, halo and radiant mantle.
    ctx.fillStyle='#fff1a8';ctx.beginPath();ctx.moveTo(-11,-3);ctx.lineTo(-15,24);ctx.lineTo(15,24);ctx.lineTo(11,-3);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff9dc';ctx.beginPath();ctx.arc(0,headY,11,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle=c;ctx.lineWidth=2.2;ctx.globalAlpha=.72;ctx.beginPath();ctx.ellipse(0,headY-13,13,4,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    ctx.strokeStyle='#e9c956';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(-14-armSwing*.25,17);ctx.moveTo(9,0);ctx.lineTo(14+armSwing*.25,17);ctx.stroke();
    ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-5,23);ctx.lineTo(-7-legSwing*.3,29);ctx.moveTo(5,23);ctx.lineTo(7+legSwing*.3,29);ctx.stroke();
    ctx.fillStyle=c;ctx.globalAlpha=.45;for(let i=0;i<4;i++){const a=t*.6+i*Math.PI/2;ctx.beginPath();ctx.arc(Math.cos(a)*17,8+Math.sin(a)*8,2,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  }else{
    // Hooded, ragged shadow body.
    ctx.fillStyle='#170d22';ctx.beginPath();ctx.moveTo(-13,-4);ctx.quadraticCurveTo(-16,10,-14,24);ctx.lineTo(-8,20);ctx.lineTo(-3,25);ctx.lineTo(2,20);ctx.lineTo(8,25);ctx.lineTo(14,20);ctx.quadraticCurveTo(16,8,13,-4);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#2a153d';ctx.beginPath();ctx.arc(0,headY,12,Math.PI,0);ctx.lineTo(10,headY+8);ctx.quadraticCurveTo(0,headY+13,-10,headY+8);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#08050c';ctx.beginPath();ctx.ellipse(0,headY+2,8,6,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=c;ctx.lineWidth=4;ctx.globalAlpha=.72;ctx.beginPath();ctx.moveTo(-10,0);ctx.quadraticCurveTo(-17-armSwing*.3,8,-15-armSwing*.25,19);ctx.moveTo(10,0);ctx.quadraticCurveTo(17+armSwing*.3,8,15+armSwing*.25,19);ctx.stroke();ctx.globalAlpha=1;
    ctx.strokeStyle='#291538';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-5,23);ctx.lineTo(-7-legSwing*.25,29);ctx.moveTo(5,23);ctx.lineTo(7+legSwing*.25,29);ctx.stroke();
    ctx.fillStyle='rgba(110,45,180,.22)';for(let i=0;i<3;i++){const px=-10+i*10+Math.sin(t*4+i)*3,py=19+Math.sin(t*5+i)*3;ctx.beginPath();ctx.arc(px,py,3+i,0,Math.PI*2);ctx.fill();}
  }

  ctx.shadowBlur=0;

  // Reactive eyes: running narrows them; danger opens them; abilities make them glow.
  const ey=role==='darkness'?headY+2:headY+1,eyeH=nearThreat?5:(moving?3.2:4.2),eyeW=role==='earth'?4.5:4;
  ctx.fillStyle=eyeGlow?c:'#0b0d10';ctx.shadowBlur=eyeGlow?10:0;ctx.shadowColor=c;
  ctx.beginPath();ctx.roundRect(-7.5,ey-eyeH/2,eyeW,eyeH,1.5);ctx.roundRect(3.5,ey-eyeH/2,eyeW,eyeH,1.5);ctx.fill();
  if(!eyeGlow&&role!=='darkness'){ctx.fillStyle='rgba(255,255,255,.78)';ctx.fillRect(-6.8,ey-eyeH/2+.6,1.2,1.2);ctx.fillRect(4.2,ey-eyeH/2+.6,1.2,1.2);}
  ctx.shadowBlur=0;

  // Elemental insignia on chest helps readability at a distance.
  ctx.strokeStyle=c;ctx.fillStyle=c;ctx.lineWidth=1.6;
  if(role==='earth'){ctx.beginPath();ctx.moveTo(-5,5);ctx.lineTo(0,0);ctx.lineTo(5,5);ctx.lineTo(0,10);ctx.closePath();ctx.stroke();}
  else if(role==='air'){ctx.beginPath();ctx.arc(0,6,6,Math.PI*.15,Math.PI*1.45);ctx.stroke();}
  else if(role==='light'){for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(Math.cos(a)*4,6+Math.sin(a)*4);ctx.lineTo(Math.cos(a)*7,6+Math.sin(a)*7);ctx.stroke();}ctx.beginPath();ctx.arc(0,6,3,0,Math.PI*2);ctx.fill();}
  else{ctx.beginPath();ctx.arc(0,6,6,Math.PI*.2,Math.PI*1.8);ctx.stroke();}

  // Equipped relic is physically represented on the character.
  ctx.save();ctx.translate(role==='air'?8:0,role==='light'?2:0);drawCharacterRelic(relicId,role);ctx.restore();

  drawCorruptionMarks(state.level,role);

  if(cosmetics.crown){
    ctx.fillStyle='#ffd95a';ctx.strokeStyle='#5c4510';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-11,headY-9);ctx.lineTo(-8,headY-19);ctx.lineTo(-2,headY-13);ctx.lineTo(5,headY-20);ctx.lineTo(11,headY-9);ctx.closePath();ctx.fill();ctx.stroke();
  }
  if(ability){
    ctx.globalAlpha=.48;ctx.strokeStyle=c;ctx.lineWidth=2;ctx.shadowBlur=10;ctx.shadowColor=c;ctx.beginPath();ctx.arc(0,0,34+Math.sin(performance.now()/95)*3,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}
function drawElementAbilityFx(x,y,role,progress=0,facing=1,rootFx=null){
  const cx=x+21,cy=y+28,t=performance.now()/1000,e=ELEMENTS[role]||ELEMENTS.earth;
  ctx.save();
  if(role==='light'){
    const pulse=1+Math.sin(t*8)*.08,r=72*pulse;
    const glow=ctx.createRadialGradient(cx,cy,12,cx,cy,r);
    glow.addColorStop(0,'rgba(255,255,225,.42)');glow.addColorStop(.35,'rgba(255,228,119,.24)');glow.addColorStop(1,'rgba(255,210,70,0)');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(255,238,145,.88)';ctx.lineWidth=3;ctx.shadowBlur=18;ctx.shadowColor='#ffe477';
    ctx.beginPath();ctx.arc(cx,cy,47+Math.sin(t*6)*5,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<12;i++){
      const a=t*1.7+i*Math.PI/6,inner=56,outer=75+(i%2)*8;
      ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*inner,cy+Math.sin(a)*inner);ctx.lineTo(cx+Math.cos(a)*outer,cy+Math.sin(a)*outer);ctx.stroke();
    }
  }else if(role==='darkness'){
    ctx.globalCompositeOperation='lighter';ctx.shadowBlur=14;ctx.shadowColor='#6f2cff';
    for(let i=0;i<11;i++){
      const a=i*Math.PI*2/11+t*.8,rr=34+(i%3)*7,bx=cx+Math.cos(a)*rr,by=cy+Math.sin(a)*18+18;
      const h=24+((i*7)%18)+Math.sin(t*7+i)*8;
      ctx.fillStyle=i%2?'rgba(112,39,214,.58)':'rgba(20,10,30,.92)';
      ctx.beginPath();ctx.moveTo(bx-7,by);ctx.quadraticCurveTo(bx-12,by-h*.45,bx,by-h);ctx.quadraticCurveTo(bx+12,by-h*.45,bx+7,by);ctx.closePath();ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';ctx.strokeStyle='rgba(172,96,255,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,46+Math.sin(t*9)*5,0,Math.PI*2);ctx.stroke();
  }else if(role==='earth'){
    ctx.strokeStyle='rgba(120,86,48,.95)';ctx.lineWidth=6;ctx.lineCap='round';ctx.shadowBlur=8;ctx.shadowColor='#7a5630';
    for(let i=0;i<5;i++){
      const dir=i<2?-1:1,len=38+i*13,startX=cx+(i-2)*5,startY=y+54;
      ctx.beginPath();ctx.moveTo(startX,startY);
      ctx.bezierCurveTo(startX+dir*len*.35,startY-12-Math.sin(t*5+i)*6,startX+dir*len*.65,startY+8,startX+dir*len,startY-10-(i%2)*9);ctx.stroke();
      ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(startX+dir*len*.58,startY);ctx.lineTo(startX+dir*len*.78,startY-20);ctx.stroke();ctx.lineWidth=6;
    }
    if(rootFx){
      ctx.strokeStyle='#a8c66c';ctx.lineWidth=7;ctx.shadowBlur=15;ctx.shadowColor='#8dad55';
      ctx.beginPath();ctx.moveTo(cx,y+52);
      const mx=(cx+rootFx.x)/2;
      ctx.bezierCurveTo(mx,y+78,mx,rootFx.y+35,rootFx.x,rootFx.y);ctx.stroke();
      ctx.lineWidth=2;ctx.strokeStyle='#d1e79a';
      for(let i=1;i<=3;i++){const q=i/4,px=cx+(rootFx.x-cx)*q,py=y+52+(rootFx.y-(y+52))*q;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+(i%2?18:-18),py-16);ctx.stroke();}
    }
  }else if(role==='air'){
    ctx.strokeStyle='rgba(202,241,255,.62)';ctx.lineWidth=3;ctx.shadowBlur=12;ctx.shadowColor='#9bdcff';
    for(let i=0;i<4;i++){
      const rr=35+i*8,off=t*3+i*.7;ctx.beginPath();ctx.arc(cx,cy,rr,off,off+Math.PI*1.25);ctx.stroke();
    }
    const tr=airTornadoRectFor(x,y,facing,progress);
    drawMiniTornado(tr.cx,tr.cy,progress);
  }
  ctx.restore();
}
function drawMiniTornado(cx,cy,progress=0){
  ctx.save();ctx.translate(cx,cy);ctx.shadowBlur=14;ctx.shadowColor='#9bdcff';
  for(let i=0;i<6;i++){
    const y=-30+i*11,w=18+i*7,phase=performance.now()/115+i*.8+progress*9;
    ctx.strokeStyle=`rgba(190,235,255,${.32+i*.08})`;ctx.lineWidth=3;
    ctx.beginPath();ctx.ellipse(Math.sin(phase)*5,y,w,6,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.globalAlpha=.24;ctx.fillStyle='#cdefff';ctx.beginPath();ctx.moveTo(-12,-34);ctx.lineTo(31,34);ctx.lineTo(-31,34);ctx.closePath();ctx.fill();ctx.restore();
}
function drawLevelTitle(){const ld=state.levelData,z=castleRegion(state.level),shown=ld?.rareEvent==='wrong-number'?(state.level===666?'0666':'????'):String(state.level).padStart(4,'0');ctx.fillStyle='rgba(255,255,255,.14)';ctx.font='900 72px sans-serif';ctx.textAlign='center';ctx.fillText(shown,W/2,103);ctx.font='800 20px sans-serif';ctx.fillStyle=state.mode==='chaos'?'#ef7aff':z.accent;ctx.globalAlpha=.55;ctx.fillText(ld?.roomTitle||z.name,W/2,139);ctx.font='650 13px sans-serif';ctx.fillStyle='rgba(255,255,255,.55)';ctx.globalAlpha=.6;ctx.fillText(`${z.name}  •  TENTATIVA ${state.attempt}${state.levelData?.joker?'  •  🃏 CORINGA':state.mode==='chaos'?'  •  ⚡ CAOS 4P':state.level>=5?'  •  INSANITY':''}`,W/2,163);ctx.globalAlpha=1;ctx.textAlign='left';}
function burst(x,y,n,color=null){for(let i=0;i<n;i++)state.particles.push({x,y,vx:(Math.random()-.5)*500,vy:(Math.random()-.7)*450,life:1,color});}
function drawParticles(){for(const p of state.particles){ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color||(ELEMENTS[state.role]||ELEMENTS.earth).color;ctx.fillRect(p.x,p.y,6,6);}ctx.globalAlpha=1;}
function updateParticles(dt){for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=700*dt;p.life-=dt*1.7;}state.particles=state.particles.filter(p=>p.life>0);}
function showOverlay(title,text,ms){$('#overlayTitle').textContent=title;$('#overlayText').textContent=text;$('#overlay').classList.remove('hidden');if(ms)setTimeout(hideOverlay,ms);}
function hideOverlay(){$('#overlay').classList.add('hidden');}

let last=performance.now();function loop(now){const dt=Math.min(.03,(now-last)/1000);last=now;if(state.running&&!(state.shopOpen&&state.mode==='singleplayer')){if(state.mode==='singleplayer')updateSolo(dt);else player.update(dt);updateParticles(dt);}updateAbilityHud(now);render();requestAnimationFrame(loop);}requestAnimationFrame(loop);
