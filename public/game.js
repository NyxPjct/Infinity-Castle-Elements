const socket = io();
const $ = s => document.querySelector(s);
const lobby = $('#lobby'), roomEl = $('#room'), gameWrap = $('#gameWrap');
const canvas = $('#game'), ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const state = {
  id: null, roomCode: null, role: 'earth', ready: false, level: 1, deaths: 0,
  mode: 'menu', soloActiveRole: 'earth', soloResetPending: false, soloTransition: false,
  running: false, room: null, remote: null, lastNet: 0, lastGoalSent: false,
  levelData: null, trapState: new Map(), particles: [], levelStart: 0,
  bossCharge: 0, bossDefeated: false, lastRuneSent: null, lastAbility: 0, abilityUntil: 0,
  levelAttempts: new Map(), attempt: 1, screenShake: 0
};

const SOLO_SAVE_KEY = 'terra-ar-castelo-infinito-solo-v1';

socket.on('connect', () => { $('#connectionPill').textContent = '● Online'; $('#connectionPill').style.color = '#55e6a5'; });
socket.on('disconnect', () => { $('#connectionPill').textContent = '● Offline'; $('#connectionPill').style.color = '#ff7893'; });

$('#soloBtn').onclick = () => startSolo(false);
$('#continueSoloBtn').onclick = () => startSolo(true);
$('#createBtn').onclick = () => { state.mode='multiplayer'; socket.emit('create-room', { name: playerName() }, handleJoin); };
$('#joinBtn').onclick = () => { state.mode='multiplayer'; socket.emit('join-room', { code: $('#roomCodeInput').value, name: playerName() }, handleJoin); };
$('#roomCodeInput').addEventListener('input', e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
$('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(state.roomCode); $('#copyCode').textContent='Copiado!'; setTimeout(()=>$('#copyCode').textContent='Copiar código',900); } catch{} };
$('#readyBtn').onclick = () => { state.ready = !state.ready; socket.emit('ready', { ready: state.ready }); $('#readyBtn').textContent = state.ready ? 'Cancelar pronto' : 'Estou pronto'; };
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
  if (fullscreenElement()) await exitFullscreen();
  else await enterFullscreen();
}
function updateFullscreenButton(){
  if (!fullscreenBtn) return;
  const active = !!fullscreenElement();
  fullscreenBtn.textContent = active ? '⛶ Sair da tela cheia' : '⛶ Tela cheia';
  fullscreenBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  fullscreenBtn.title = active ? 'Sair da tela cheia (Esc)' : 'Colocar o jogo em tela cheia';
}
if (fullscreenBtn) fullscreenBtn.onclick = toggleFullscreen;
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
updateFullscreenButton();
$('#chatgptBtn').onclick = async () => {
  const r = await fetch('/auth/chatgpt/status').then(r=>r.json()).catch(()=>({enabled:false}));
  $('#errorText').textContent = r.enabled ? 'Integração disponível.' : 'Vínculo ChatGPT preparado, mas precisa das credenciais aprovadas do app.';
};

function playerName(){ return ($('#playerName').value || 'Jogador').trim().slice(0,18); }

function loadSoloSave(){
  try { return JSON.parse(localStorage.getItem(SOLO_SAVE_KEY) || 'null'); } catch { return null; }
}
function saveSoloProgress(completed=false){
  if(state.mode!=='singleplayer') return;
  localStorage.setItem(SOLO_SAVE_KEY, JSON.stringify({level:state.level,deaths:state.deaths,completed,updatedAt:Date.now()}));
  refreshSoloSaveButton();
}
function refreshSoloSaveButton(){
  const btn=$('#continueSoloBtn'); if(!btn) return;
  const save=loadSoloSave();
  if(save && !save.completed && save.level>=1){
    btn.classList.remove('hidden');
    btn.textContent=`↻ Continuar solo — fase ${Math.min(1000,save.level)}`;
  } else btn.classList.add('hidden');
}
function startSolo(useSave){
  const save=useSave?loadSoloSave():null;
  state.mode='singleplayer'; state.id='solo'; state.roomCode=null; state.room=null; state.remote=null;
  state.level=save?.level||1; state.deaths=save?.deaths||0; state.soloActiveRole='earth'; state.role='earth';
  if(!useSave) saveSoloProgress(false);
  lobby.classList.add('hidden'); roomEl.classList.add('hidden');
  $('#soloControls').classList.remove('hidden');
  startLevel(state.level);
}
function restartGame(){
  if(state.mode==='singleplayer'){
    if(!state.running)return;
    showOverlay('↻ SALA REINICIADA','Tentem uma rota diferente.',320);
    setTimeout(()=>startLevel(state.level),330);
  } else socket.emit('restart-level');
}
refreshSoloSaveButton();
function handleJoin(res){
  if(!res?.ok){ $('#errorText').textContent = res?.error || 'Não foi possível entrar.'; return; }
  state.mode='multiplayer'; state.id=res.id; state.roomCode=res.code; state.role=res.role; state.level=res.level;
  $('#soloControls').classList.add('hidden');
  $('#errorText').textContent=''; lobby.classList.add('hidden'); roomEl.classList.remove('hidden');
  $('#roomCode').textContent=res.code; updateHud();
}

socket.on('room-state', room => {
  state.room=room; state.level=room.level; state.deaths=room.deaths;
  const me=room.players.find(p=>p.id===state.id);if(me)state.role=me.role;
  $('#roomLevel').textContent=room.level; $('#roomDeaths').textContent=room.deaths;
  const players=$('#players'); players.innerHTML='';
  room.players.forEach(p=>{
    const div=document.createElement('div'); div.className=`player-card ${p.role}`;
    div.innerHTML=`<span class="ready-dot">${p.ready?'● PRONTO':'○'}</span><div class="avatar">${p.role==='earth'?'🪨':'💨'}</div><h3>${escapeHtml(p.name)}${p.id===state.id?' (você)':''}</h3><p>${p.role==='earth'?'TERRA · impacto sísmico':'AR · impulso aéreo'}</p>`;
    players.appendChild(div);
  });
  updateHud();
});

socket.on('start-level', ({level,deaths}) => { state.level=level; state.deaths=deaths; startLevel(level); });
socket.on('reset-level', ({deaths}) => { state.deaths=deaths; showOverlay('☠️ PEGADINHA DO CASTELO', deathLine(), 550); setTimeout(()=>startLevel(state.level),560); });
socket.on('level-complete', ({level,finished}) => { state.level=level; showOverlay(finished?'🏆 CASTELO CONQUISTADO':'✓ SALA SUPERADA', finished?'Vocês conquistaram as 1000 salas do Castelo Infinito.':`Próxima: fase ${level}`, finished?0:700); });
socket.on('game-finished', ({deaths}) => { state.running=false; state.deaths=deaths; updateHud(); showOverlay('🏆 1000/1000', `O Castelo Infinito caiu após ${deaths} mortes compartilhadas.`, 0); });
socket.on('partner-left', () => { if(state.mode!=='multiplayer')return; state.running=false; showOverlay('Parceiro desconectou', 'Aguardando alguém entrar novamente na sala.', 0); gameWrap.classList.add('hidden'); roomEl.classList.remove('hidden'); state.ready=false; $('#readyBtn').textContent='Estou pronto'; });
socket.on('remote-state', data => { if(state.mode==='multiplayer'&&data.id!==state.id) state.remote=data; });
socket.on('boss-defeated', ({level}={}) => {
  if(state.mode!=='multiplayer'||level!==state.level||!state.levelData?.boss)return;
  state.bossDefeated=true;state.bossCharge=state.levelData.boss.required;
  burst(state.levelData.boss.x+80,state.levelData.boss.y+90,42);
  showOverlay('⚔️ PROTEÇÃO QUEBRADA','Corram para a saída!',850);
});

function startLevel(level){
  roomEl.classList.add('hidden'); gameWrap.classList.remove('hidden'); hideOverlay();
  state.running=true; state.lastGoalSent=false; state.remote=null; state.trapState.clear();
  state.bossCharge=0; state.bossDefeated=false; state.lastRuneSent=null; state.levelStart=performance.now();
  state.soloResetPending=false; state.soloTransition=false;
  state.attempt=(state.levelAttempts.get(level)||0)+1; state.levelAttempts.set(level,state.attempt);
  state.levelData=generateLevel(level);
  if(state.mode==='singleplayer'){
    resetSoloHeroes(); state.soloActiveRole='earth'; state.role='earth'; $('#soloControls').classList.remove('hidden');
  } else { player.reset(); $('#soloControls').classList.add('hidden'); }
  updateHud();
  const enteringZone=((level-1)%100===0)&&state.attempt===1;
  if (state.levelData.boss) showOverlay(`👑 ${state.levelData.boss.name}`, state.mode==='singleplayer'?'Alterne entre Terra e Ar e mantenha cada um em sua runa.':'Ativem as duas runas ao mesmo tempo e sobrevivam.', 1350);
  else if(enteringZone){const z=castleRegion(level);showOverlay(`🏰 ${z.name}`,`${z.subtitle} · O castelo mudou as regras.`,1250);}
}

function updateHud(){
  const roleText=state.role==='earth'?'🪨 TERRA':'💨 AR';
  $('#hudRole').textContent = state.mode==='singleplayer'?`SOLO · ${roleText}`:roleText;
  $('#hudLevel').textContent=state.level; $('#hudDeaths').textContent=state.deaths;
  $('#difficultyLabel').textContent=difficultyName(state.level);
  const mechanic=$('#mechanicLabel'); if(mechanic) mechanic.textContent=mechanicName(state.level);
}
function difficultyName(l){ return castleRegion(l).name; }
function mechanicName(l){ if(l%100===0)return'CHEFE • RITUAL • TROLL'; return castleRegion(l).mechanics; }
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

const keys={};
addEventListener('keydown',e=>{
  const k=e.key.toLowerCase(); keys[k]=true;
  if((k==='tab'||k==='q')&&state.mode==='singleplayer'&&!e.repeat){e.preventDefault();switchSoloRole();}
  if(k==='f'&&state.mode==='singleplayer'&&!e.repeat){e.preventDefault();toggleSoloAnchor();}
  if(k==='r'&&!e.repeat)restartGame();
  if(k==='e'&&!e.repeat)activateAbility();
});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);

function activateAbility(){
  if(!state.running) return;
  const now=performance.now();
  if(state.mode==='singleplayer'){
    const h=soloHeroes[state.soloActiveRole]; if(now-h.lastAbility<1700)return;
    h.lastAbility=now; h.abilityUntil=now+420; burst(h.x+21,h.y+28,14); return;
  }
  if(now-state.lastAbility<1700)return;
  state.lastAbility=now; state.abilityUntil=now+420;
  burst(player.x+21,player.y+28,14);
}

const player={x:90,y:680,w:42,h:56,vx:0,vy:0,onGround:false,dead:false,
  reset(){this.x=state.role==='earth'?90:145;this.y=690;this.vx=this.vy=0;this.dead=false;},
  update(dt){
    if(!state.running||this.dead)return;
    const ld=state.levelData; let left=keys['arrowleft']||keys['a'], right=keys['arrowright']||keys['d'];
    const jump=keys['arrowup']||keys['w']||keys[' '];
    const reversed=ld.reverseZones?.some(z=>overlap(this,z)); if(reversed){const t=left;left=right;right=t;}
    const isAir=state.role==='air', ability=performance.now()<state.abilityUntil;
    const accel=isAir?1620:1450, max=isAir?(ability?520:365):330, gravity=isAir?(ability?780:1240):1580, jumpPower=isAir?-645:-595;
    if(left)this.vx-=accel*dt;if(right)this.vx+=accel*dt;if(!left&&!right)this.vx*=Math.pow(.001,dt);this.vx=Math.max(-max,Math.min(max,this.vx));
    if(jump&&this.onGround){this.vy=jumpPower;this.onGround=false;}
    if(isAir&&ability&&jump&&this.vy>0)this.vy-=900*dt;
    this.vy+=gravity*dt; this.vy=Math.min(this.vy,900);
    this.x+=this.vx*dt; collideWorld(this,'x'); this.y+=this.vy*dt; this.onGround=false; collideWorld(this,'y');
    this.x=Math.max(0,Math.min(W-this.w,this.x)); if(this.y>H+100)die();
    processHazards(this,state.role); processTrolls(this); processSetPieces(this,dt,state.role); processBoss(dt);
    const at=goalAccessible()&&overlap(this,currentGoal());
    if(at!==state.lastGoalSent){state.lastGoalSent=at;socket.emit('goal-state',{atGoal:at});}
    const now=performance.now();if(now-state.lastNet>32){
      state.lastNet=now;socket.emit('player-state',{x:this.x,y:this.y,vx:this.vx,vy:this.vy,role:state.role,level:state.level,ability:ability});
    }
  }
};

function makeSoloHero(role){return {role,x:role==='earth'?90:145,y:690,w:42,h:56,vx:0,vy:0,onGround:false,dead:false,anchored:false,lastAbility:0,abilityUntil:0};}
const soloHeroes={earth:makeSoloHero('earth'),air:makeSoloHero('air')};
function resetSoloHeroes(){
  for(const role of ['earth','air']){const h=soloHeroes[role];h.x=role==='earth'?90:145;h.y=690;h.vx=0;h.vy=0;h.onGround=false;h.dead=false;h.anchored=false;h.lastAbility=0;h.abilityUntil=0;}
}
function switchSoloRole(){
  if(!state.running)return;
  state.soloActiveRole=state.soloActiveRole==='earth'?'air':'earth';state.role=state.soloActiveRole;updateHud();
  const h=soloHeroes[state.soloActiveRole];burst(h.x+21,h.y+28,7);
}
function toggleSoloAnchor(){
  if(!state.running)return;const h=soloHeroes[state.soloActiveRole];
  if(!h.onGround&&!h.anchored){showOverlay('PRECISA ESTAR NO CHÃO','Pouse antes de segurar posição.',450);return;}
  h.anchored=!h.anchored;h.vx=0;h.vy=0;
  showOverlay(h.anchored?'◆ POSIÇÃO SEGURADA':'◇ POSIÇÃO LIBERADA',h.anchored?'Agora troque de personagem com Q/Tab.':'O personagem volta a se mover normalmente.',420);
}
function hasSupport(h){const probe={x:h.x+4,y:h.y+h.h,w:h.w-8,h:5};return getSolidRects().some(s=>overlap(probe,s));}
function updateSoloHero(h,dt,controlled){
  if(!state.running||h.dead)return;
  if(h.anchored&&!hasSupport(h))h.anchored=false;
  if(h.anchored&&!controlled){processHazards(h,h.role);processTrolls(h);processSetPieces(h,dt,h.role);return;}
  const ld=state.levelData;let left=controlled&&(keys['arrowleft']||keys['a']),right=controlled&&(keys['arrowright']||keys['d']);
  const jump=controlled&&(keys['arrowup']||keys['w']||keys[' ']);
  if(controlled&&(left||right||jump))h.anchored=false;
  const reversed=ld.reverseZones?.some(z=>overlap(h,z));if(reversed){const t=left;left=right;right=t;}
  const isAir=h.role==='air',ability=performance.now()<h.abilityUntil;
  const accel=isAir?1620:1450,max=isAir?(ability?520:365):330,gravity=isAir?(ability?780:1240):1580,jumpPower=isAir?-645:-595;
  if(left)h.vx-=accel*dt;if(right)h.vx+=accel*dt;if(!left&&!right)h.vx*=Math.pow(.001,dt);h.vx=Math.max(-max,Math.min(max,h.vx));
  if(jump&&h.onGround){h.vy=jumpPower;h.onGround=false;}
  if(isAir&&ability&&jump&&h.vy>0)h.vy-=900*dt;
  h.vy+=gravity*dt;h.vy=Math.min(h.vy,900);
  h.x+=h.vx*dt;collideWorld(h,'x');h.y+=h.vy*dt;h.onGround=false;collideWorld(h,'y');
  h.x=Math.max(0,Math.min(W-h.w,h.x));if(h.y>H+100)return die(h);
  processHazards(h,h.role);processTrolls(h);processSetPieces(h,dt,h.role);
}
function updateSolo(dt){
  updateSoloHero(soloHeroes.earth,dt,state.soloActiveRole==='earth');
  updateSoloHero(soloHeroes.air,dt,state.soloActiveRole==='air');
  if(state.soloResetPending)return;
  processBoss(dt);
  const goal=currentGoal();if(goalAccessible()&&overlap(soloHeroes.earth,goal)&&overlap(soloHeroes.air,goal))completeSoloLevel();
}
function completeSoloLevel(){
  if(state.soloTransition)return;state.soloTransition=true;
  if(state.level>=1000){state.running=false;saveSoloProgress(true);showOverlay('🏆 1000/1000',`Você conquistou o Castelo Infinito sozinho após ${state.deaths} mortes.`,0);return;}
  state.level+=1;saveSoloProgress(false);showOverlay('✓ SALA SUPERADA',`Próxima: fase ${state.level}`,620);setTimeout(()=>startLevel(state.level),650);
}

function elapsed(){return Math.max(0,(performance.now()-state.levelStart)/1000);}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function pointInRect(x,y,r){return x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;}
function roleImmune(type,role){return (type==='roots'&&role==='earth')||(type==='storm'&&role==='air');}

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
  const ld=state.levelData;
  for(const h of ld.hazards){if(overlap(p,h)&&!roleImmune(h.type,role))return die(p);}
  for(const s of activeSpikes())if(overlap(p,s))return die(p);
  for(const c of ld.crushers||[])if(overlap(p,dynamicCrusher(c)))return die(p);
  for(const a of ld.armors||[])if(overlap(p,armorRect(a))){
    if(role==='earth'&&abilityActiveFor(p,role)){state.trapState.set('armor'+a.id,performance.now()+3000);burst(a.x,a.y,9);} else return die(p);
  }
  for(const g of ld.ghosts||[])if(overlap(p,ghostRect(g)))return die(p);
  for(const fb of dragonFireballs())if(circleRect(fb,p))return die(p);
  for(const bf of bossProjectiles())if(circleRect(bf,p))return die(p);
  for(const f of dynamicFallingBlocks())if(overlap(p,f))return die(p);
  for(const w of dynamicSlamWalls())if(overlap(p,w))return die(p);
}
function circleRect(c,r){const x=Math.max(r.x,Math.min(c.x,r.x+r.w)),y=Math.max(r.y,Math.min(c.y,r.y+r.h));const dx=c.x-x,dy=c.y-y;return dx*dx+dy*dy<c.r*c.r;}
function abilityActiveFor(p,role){return state.mode==='singleplayer'?performance.now()<(p.abilityUntil||0):(role===state.role&&performance.now()<state.abilityUntil);}
function die(p=player){
  if(state.mode==='singleplayer'){
    if(state.soloResetPending||p.dead)return;p.dead=true;state.soloResetPending=true;state.deaths+=1;saveSoloProgress(false);burst(p.x+21,p.y+25,18);
    state.screenShake=18;showOverlay('☠️ PEGADINHA DO CASTELO',deathLine(),520);setTimeout(()=>startLevel(state.level),540);return;
  }
  if(player.dead)return;player.dead=true;burst(player.x+21,player.y+25,18);socket.emit('player-death');
}
function platePressed(plate){
  if(!plate)return false;
  if(state.mode==='singleplayer')return overlap(soloHeroes.earth,plate)||overlap(soloHeroes.air,plate);
  const remoteRect=state.remote?{x:state.remote.x,y:state.remote.y,w:42,h:56}:null;
  return overlap(player,plate)||(remoteRect&&overlap(remoteRect,plate));
}
function doorOpen(){
  const plates=[state.levelData.plate,state.levelData.plate2].filter(Boolean);if(!plates.length)return true;
  return plates.some(platePressed);
}
function goalAccessible(){return !state.levelData.boss||state.bossDefeated;}
function currentGoal(){
  const g=state.levelData.goal, move=state.levelData.movingExit;if(!move)return g;
  const trig=state.trapState.get('movingExit');if(!trig)return g;
  const q=Math.min(1,(performance.now()-trig)/360);
  return {x:g.x+(move.toX-g.x)*q,y:g.y+(move.toY-g.y)*q,w:g.w,h:g.h};
}
function deathLine(){const lines=['Você confiou no chão. O chão discordou.','A saída parecia perto demais, né?','O castelo anotou esse salto. Tente de novo.','Parabéns: você encontrou a armadilha.','Era óbvio. Depois que acontece.','O corredor mentiu para você.','Essa plataforma tinha outros planos.','O castelo agradece a sua confiança.'];return lines[(state.level+state.deaths+state.attempt)%lines.length];}

function processTrolls(p){
  const ld=state.levelData,now=performance.now();
  for(const f of ld.fakeFloors||[]){const key='f'+f.id;let v=state.trapState.get(key)||0;if(v===0&&Math.abs((p.x+p.w/2)-(f.x+f.w/2))<120)v=now;state.trapState.set(key,v);}
  for(const t of ld.popTraps||[]){const key='p'+t.id;if(!state.trapState.get(key)&&p.x>t.triggerX)state.trapState.set(key,now);}
  for(const t of ld.ambushSpikes||[]){const key='as'+t.id;if(!state.trapState.get(key)&&p.x>t.triggerX)state.trapState.set(key,now);}
  for(const t of ld.bridgeTiles||[]){if(!state.trapState.has('br'+t.id)&&overlap(p,{x:t.x-3,y:t.y-30,w:t.w+6,h:t.h+38}))state.trapState.set('br'+t.id,now);}
  for(const v of ld.vanishPlatforms||[]){if(!state.trapState.has('vp'+v.id)&&overlap(p,{x:v.x-3,y:v.y-48,w:v.w+6,h:v.h+54}))state.trapState.set('vp'+v.id,now);}
  for(const ch of ld.chandeliers||[]){if(!state.trapState.has('ch'+ch.id)&&p.x>ch.triggerX)state.trapState.set('ch'+ch.id,now);}
  for(const b of ld.fallingBlocks||[]){if(!state.trapState.has('fb'+b.id)&&p.x>b.triggerX)state.trapState.set('fb'+b.id,now);}
  for(const w of ld.slamWalls||[]){if(!state.trapState.has('sw'+w.id)&&p.x>w.triggerX)state.trapState.set('sw'+w.id,now);}
  if(ld.movingExit&&!state.trapState.has('movingExit')){const g=currentGoal();if(Math.abs((p.x+p.w/2)-(g.x+g.w/2))<ld.movingExit.triggerDist)state.trapState.set('movingExit',now);}
  for(const fd of ld.fakeDoors||[]){
    const key='fd'+fd.id,last=state.trapState.get(key)||0;
    if(overlap(p,fd)&&now-last>1800){state.trapState.set(key,now);p.x=Math.max(40,fd.x-260);p.vx=-250;state.screenShake=10;burst(fd.x+fd.w/2,fd.y+40,12);}
  }
  for(const fg of ld.fakeGoals||[]){
    const key='fg'+fg.id;if(!state.trapState.get(key)&&overlap(p,fg)){state.trapState.set(key,now);p.vx=-330;p.vy=-330;state.screenShake=14;burst(fg.x+28,fg.y+45,18);}
  }
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
function dragonFireballs(){
  const out=[]; for(const d of state.levelData.dragons||[]){
    const t=elapsed()+d.phase; const cycle=t%d.interval; if(cycle>d.life)continue;
    const x=d.fromRight?d.x-cycle*d.speed:d.x+cycle*d.speed;
    const y=d.y+Math.sin(cycle*5+d.phase)*34; out.push({x,y,r:13});
  } return out;
}
function bossProjectiles(){
  const b=state.levelData.boss;if(!b||state.bossDefeated)return[];
  const out=[],t=elapsed(),count=2+Math.floor(state.level/250),cx=b.x+b.w/2;
  for(let i=0;i<count;i++){
    const tt=(t+i*0.73)%b.attackInterval,dir=i%2===0?-1:1;
    const x=cx+dir*tt*b.projectileSpeed,y=565+Math.sin(tt*3.7+i)*105;
    if(x>-30&&x<W+30)out.push({x,y,r:14+i%2*3});
  }
  return out;
}

function processBoss(dt){
  const b=state.levelData.boss;if(!b||state.bossDefeated)return;
  let both=false;
  if(state.mode==='singleplayer'){
    both=overlap(soloHeroes.earth,b.runes.earth)&&overlap(soloHeroes.air,b.runes.air);
    if(both)state.bossCharge=Math.min(b.required,state.bossCharge+dt);else state.bossCharge=Math.max(0,state.bossCharge-dt*.65);
    if(state.bossCharge>=b.required){state.bossDefeated=true;burst(b.x+80,b.y+90,42);showOverlay('⚔️ PROTEÇÃO QUEBRADA','Leve Terra e Ar até a saída!',850);}
    return;
  }
  // No multiplayer o servidor é a autoridade do ritual; isso evita um cliente abrir a barreira antes do outro por lag.
  const meRune=b.runes[state.role],otherRole=state.role==='earth'?'air':'earth',otherRune=b.runes[otherRole];
  const me=overlap(player,meRune),remote=state.remote&&state.remote.role===otherRole&&overlap({x:state.remote.x,y:state.remote.y,w:42,h:56},otherRune);both=!!(me&&remote);
  if(me!==state.lastRuneSent){state.lastRuneSent=me;socket.emit('rune-state',{atRune:me,level:state.level});}
  if(both)state.bossCharge=Math.min(b.required,state.bossCharge+dt);else state.bossCharge=Math.max(0,state.bossCharge-dt*.65);
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
  for(const role of ['earth','air']){
    const rune=ld.boss.runes[role],stand={x:rune.x-12,y:rune.y-66,w:rune.w+24,h:86};
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
  const issues=[];for(const key of ['fakeFloors','popTraps','ambushSpikes','elevators','chandeliers','armors','crushers','bookshelves','ghosts','bridgeTiles','dragons','fakeDoors','fakeGoals','fallingBlocks','slamWalls','vanishPlatforms','windGusts']){const seen=new Set();for(const v of ld[key]||[]){if(v.id==null)continue;if(seen.has(v.id))issues.push(`id duplicado em ${key}: ${v.id}`);seen.add(v.id);}}return issues;
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
  return emergencyRepairLevel(ld);
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
    for(const role of ['earth','air']){
      const rune=ld.boss.runes?.[role];if(!rune){issues.push(`runa ${role} ausente`);continue;}
      if(!supportPlatformForRect(ld,rune))issues.push(`runa ${role} sem piso`);
      if(!earthCanReachSupport(ld,rune))issues.push(`runa ${role} inalcançável por Terra`);
      const stand=rectAround({x:rune.x,y:rune.y-56,w:rune.w,h:56},8,6);
      const killers=[...(ld.hazards||[]),...(ld.spikes||[])];if(killers.some(r=>rectIntersects(r,stand)))issues.push(`runa ${role} nasce em armadilha estática`);
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

function generateLevel(level){
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
    if(level>22&&rng()<.10+diff*.12)fakeFloors.push({id:id++,x:gapX,y:floorY-12,w:gap,h:14});
    if(level>620&&rng()<.22){const n=2+Math.floor(rng()*3),tw=gap/n;for(let j=0;j<n;j++)bridgeTiles.push({id:id++,x:gapX+j*tw,y:floorY-12,w:Math.max(18,tw-2),h:14,delay:420+Math.floor(rng()*260)});}
    x+=gap;const y=ys[i];const p={x,y,w:width,h:H-y};platforms.push(p);
    if(level>12&&rng()<.22)spikes.push({x:x+width*(.35+rng()*.25),y:y-18,w:30+rng()*30,h:18,dir:'up'});
    if(level>35&&rng()<.18+diff*.16)ambushSpikes.push({id:id++,triggerX:x-55-rng()*80,delay:90+Math.floor(rng()*240),spike:{x:x+20+rng()*Math.max(20,width-80),y:y-30,w:52,h:30,dir:'up'}});if(level>120&&rng()<.08+diff*.05)ambushSpikes.push({id:id++,triggerX:x-30-rng()*55,delay:70+Math.floor(rng()*160),spike:{x:x+28+rng()*Math.max(18,width-92),y:y-86,w:48,h:34,dir:'down'}});
    if(level>65&&rng()<.16)chandeliers.push({id:id++,x:x+width*(.30+rng()*.35),y:95,w:40,h:60,floorY:y,triggerX:x-90-rng()*60});
    if(level>125&&rng()<.16)elevators.push({id:id++,x:x+width*.25,y0:y-8,y1:Math.max(430,y-190),w:74,h:16,speed:.85+rng()*.75,phase:rng()*6});
    if(level>180&&rng()<.14)armors.push({id:id++,x0:x+8,x1:x+Math.max(20,width-54),y:y-54,w:38,h:54,speed:1+rng()*.8,phase:rng()*6});
    if(level>250&&rng()<.15)fallingBlocks.push({id:id++,triggerX:x-95,x:x+width*.38,y:115,w:62,h:62,floorY:y,delay:.15+rng()*.28,speed:650+rng()*230});
    if(level>320&&rng()<.14)crushers.push({id:id++,axis:'y',x:x+width*.52,a:y-245,b:y-85,w:54,h:85,speed:1.15+rng(),phase:rng()*6});
    if(level>405&&rng()<.13)vanishPlatforms.push({id:id++,x:x+width*.15,y:y-92,w:72+Math.floor(rng()*45),h:15,delay:360+Math.floor(rng()*320)});
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
  if(level>90&&level%7===0)fakeDoors.push({id:id++,x:1110+(level%3)*45,y:690,w:56,h:100});
  if(level>160&&level%11===0)fakeGoals.push({id:id++,x:1240,y:690,w:56,h:100});
  if(level>430&&level%9===0)reverseZones.push({x:650,y:460,w:280,h:330});
  if(level>560&&level%13===0)ambushSpikes.push({id:id++,triggerX:1360,delay:80,spike:{x:1450,y:758,w:64,h:32,dir:'up'}});
  const goal={x:1515,y:690,w:56,h:100};
  const movingExit=level>690&&level%10===3?{triggerDist:185,toX:1425,toY:690}:null;
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
  const boss={name:bossNames[tier-1]||'O Coração do Castelo',x:720,y:265,w:160,h:230,required:2.1+Math.min(1.9,tier*.16),attackInterval:2.15-Math.min(.75,tier*.06),projectileSpeed:370+tier*22,runes:{earth:{x:330,y:665,w:86,h:20},air:{x:1185,y:665,w:86,h:20}},barrier:{x:1450,y:570,w:40,h:220}};
  const hazards=[{x:510,y:790,w:140,h:110,type:'storm'},{x:950,y:790,w:140,h:110,type:'roots'}],spikes=[];
  for(let i=0;i<tier;i++)spikes.push({x:555+i*50,y:772,w:28,h:18,dir:'up'});
  const crushers=[];if(tier>=4){crushers.push({axis:'y',x:525,a:250,b:585,w:50,h:92,speed:1.1,phase:0});crushers.push({axis:'y',x:1025,a:250,b:585,w:50,h:92,speed:1.15,phase:2.2});}
  const ghosts=tier>=5?[{x:780,y:520,w:40,h:50,rangeX:230,rangeY:55,speed:1.2,phase:0}]:[],dragons=tier>=8?[{x:1540,y:430,interval:2.3,life:2.5,speed:480,phase:0,fromRight:true}]:[];
  const ld={level,platforms,hazards,spikes,fakeFloors:[],popTraps:[],ambushSpikes:tier>=7?[{id:900+level,triggerX:1320,delay:100,spike:{x:1395,y:754,w:62,h:36,dir:'up'}}]:[],reverseZones:tier>=9?[{x:650,y:480,w:300,h:310}]:[],plate:null,plate2:null,door:null,goal:{x:1515,y:690,w:56,h:100},elevators:[],chandeliers:[],armors:[],crushers,bookshelves:[],ghosts,bridgeTiles:[],dragons,fakeDoors:[],fakeGoals:[],fallingBlocks:[],slamWalls:[],vanishPlatforms:[],windGusts:[],movingExit:null,boss,archetype:99,roomTitle:'SALÃO DO GUARDIÃO',regionIndex:region.index};
  return sanitizeBossLevel(ld);
}
function nearestPlatform(platforms,x){let best=platforms[0],d=Infinity;for(const p of platforms){const c=p.x+p.w/2,nd=Math.abs(c-x);if(nd<d){d=nd;best=p;}}return best;}
function nearestPlatformBefore(platforms,x){const arr=platforms.filter(p=>p.x+p.w<x).sort((a,b)=>(b.x+b.w)-(a.x+a.w));return arr[0]||platforms[0];}
function nearestPlatformAfter(platforms,x){const arr=platforms.filter(p=>p.x>x).sort((a,b)=>a.x-b.x);return arr[0]||platforms[platforms.length-1];}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}}

function render(){
  ctx.save();
  if(state.screenShake>0){const m=state.screenShake;ctx.translate((Math.random()-.5)*m,(Math.random()-.5)*m);state.screenShake=Math.max(0,state.screenShake-1.15);}
  ctx.clearRect(-30,-30,W+60,H+60);drawBackground();if(!state.levelData){ctx.restore();return;}const ld=state.levelData;
  for(const p of ld.platforms)drawPlatform(p);for(const h of ld.hazards)drawHazard(h);for(const f of ld.fakeFloors||[])drawFakeFloor(f);for(const t of ld.bridgeTiles||[])drawBridgeTile(t);for(const v of ld.vanishPlatforms||[])drawVanishPlatform(v);for(const e of ld.elevators||[])drawElevator(dynamicElevator(e));for(const b of ld.bookshelves||[])drawBookshelf(dynamicBookshelf(b));
  for(const z of ld.windGusts||[])drawWindGust(z);for(const z of ld.reverseZones||[])drawReverseZone(z);if(ld.plate)drawPlate(ld.plate,platePressed(ld.plate));if(ld.plate2)drawPlate(ld.plate2,platePressed(ld.plate2));if(ld.door&&!doorOpen())drawDoor(ld.door);
  for(const ch of ld.chandeliers||[])drawChandelier(chandelierRect(ch),!!state.trapState.get('ch'+ch.id));for(const b of dynamicFallingBlocks())drawFallingBlock(b);for(const w of dynamicSlamWalls())drawSlamWall(w);for(const c of ld.crushers||[])drawCrusher(dynamicCrusher(c));for(const a of ld.armors||[])drawArmor(armorRect(a));for(const g of ld.ghosts||[])drawGhost(ghostRect(g));for(const d of ld.dragons||[])drawDragon(d);for(const fb of dragonFireballs())drawFireball(fb,'#ff8b4b');for(const fd of ld.fakeDoors||[])drawFakeDoor(fd);for(const fg of ld.fakeGoals||[])drawFakeGoal(fg,!!state.trapState.get('fg'+fg.id));for(const sp of activeSpikes())drawSpike(sp);
  if(ld.boss)drawBoss(ld.boss);for(const bf of bossProjectiles())drawFireball(bf,'#c96cff');drawGoal(currentGoal(),goalAccessible());
  if(state.mode==='singleplayer'){for(const role of ['earth','air']){const h=soloHeroes[role];drawCharacter(h.x,h.y,role,role===state.soloActiveRole,performance.now()<h.abilityUntil,h.anchored);}}else{if(state.remote&&state.remote.level===state.level)drawCharacter(state.remote.x,state.remote.y,state.remote.role,false,state.remote.ability);drawCharacter(player.x,player.y,state.role,true,performance.now()<state.abilityUntil);}
  drawParticles();drawLevelTitle();ctx.restore();
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
    {name:'TRONO RUBRO',subtitle:'O castelo para de fingir que joga limpo',mechanics:'CONTROLES INVERTIDOS • PAREDES-ARMADILHA',sky:'#210a0d',wall:'#451b21',accent:'#d6535d',platform:'#3e292c',edge:'#8b565c',hazards:['curse','roots','storm'],rooms:['SALÃO DO TRONO','CORREDOR DE SANGUE','CÂMARA DA COROA','GALERIA DO CARRASCO']},
    {name:'CORAÇÃO IMPOSSÍVEL',subtitle:'Aqui a arquitetura também mente',mechanics:'TODAS AS PEGADINHAS • CAOS',sky:'#160815',wall:'#321334',accent:'#e35fd2',platform:'#322635',edge:'#7c5b81',hazards:['curse','storm','roots'],rooms:['SALÃO QUE NÃO EXISTE','ESCADA SEM FIM','CORREDOR DO AVESSO','CÂMARA DO CASTELO VIVO']}
  ];return {...regions[i],index:i};
}
function drawBackground(){
  const z=castleRegion(state.level),g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,z.sky);g.addColorStop(1,'#05070a');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  const n=z.index;if(n===0)bgCourtyard(z);else if(n===1)bgRoyal(z);else if(n===2)bgDungeon(z);else if(n===3)bgClock(z);else if(n===4)bgLibrary(z);else if(n===5)bgChapel(z);else if(n===6)bgGarden(z);else if(n===7)bgRamparts(z);else if(n===8)bgThrone(z);else bgHeart(z);
  ctx.fillStyle='rgba(0,0,0,.20)';ctx.fillRect(0,0,W,H);
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
function drawPlatform(p){const z=castleRegion(state.level);ctx.fillStyle=z.platform;ctx.fillRect(p.x,p.y,p.w,p.h);ctx.fillStyle=z.edge;ctx.fillRect(p.x,p.y,p.w,7);ctx.strokeStyle='rgba(220,210,190,.10)';for(let xx=p.x;xx<p.x+p.w;xx+=48)ctx.strokeRect(xx,p.y+7,48,34);}
function drawHazard(h){
  const palette={roots:'#5f8f48',storm:'#7fd8ff',curse:'#b15cff'},c=palette[h.type];ctx.save();ctx.fillStyle=c;ctx.globalAlpha=.5;ctx.fillRect(h.x,h.y,h.w,h.h);ctx.globalAlpha=1;
  if(h.type==='roots'){ctx.strokeStyle='#9fc66d';ctx.lineWidth=5;for(let x=h.x+12;x<h.x+h.w;x+=34){ctx.beginPath();ctx.moveTo(x,h.y+h.h);ctx.quadraticCurveTo(x-12,h.y+28,x+8,h.y+4);ctx.stroke();}}
  else if(h.type==='storm'){ctx.strokeStyle='rgba(230,250,255,.8)';ctx.lineWidth=3;for(let y=h.y+14;y<h.y+h.h;y+=18){ctx.beginPath();ctx.moveTo(h.x+8,y);ctx.lineTo(h.x+h.w-8,y-7);ctx.stroke();}}
  else{ctx.shadowBlur=20;ctx.shadowColor=c;ctx.fillStyle='rgba(210,120,255,.45)';for(let x=h.x+10;x<h.x+h.w;x+=28){ctx.beginPath();ctx.arc(x,h.y+18+(x%3)*8,6,0,Math.PI*2);ctx.fill();}}ctx.restore();
}
function drawSpike(s){ctx.fillStyle='#eef1f6';const n=Math.max(1,Math.floor(s.w/18));for(let i=0;i<n;i++){const x=s.x+i*s.w/n;ctx.beginPath();if(s.dir==='down'){ctx.moveTo(x,s.y);ctx.lineTo(x+s.w/n/2,s.y+s.h);ctx.lineTo(x+s.w/n,s.y);}else{ctx.moveTo(x,s.y+s.h);ctx.lineTo(x+s.w/n/2,s.y);ctx.lineTo(x+s.w/n,s.y+s.h);}ctx.closePath();ctx.fill();}}
function drawPlate(p,on){ctx.fillStyle=on?'#91d17d':'#d7b56d';ctx.fillRect(p.x,p.y,p.w,p.h);ctx.shadowBlur=on?18:0;ctx.shadowColor=ctx.fillStyle;ctx.fillRect(p.x+8,p.y-5,p.w-16,5);ctx.shadowBlur=0;}
function drawDoor(d){ctx.fillStyle='#3f352c';ctx.fillRect(d.x,d.y,d.w,d.h);ctx.fillStyle='#a78653';ctx.fillRect(d.x+4,d.y,d.w-8,5);ctx.fillRect(d.x+6,d.y+40,d.w-12,3);ctx.fillRect(d.x+6,d.y+110,d.w-12,3);}
function drawGoal(g,open=true){ctx.save();ctx.globalAlpha=open?1:.45;ctx.fillStyle='rgba(24,18,14,.9)';ctx.fillRect(g.x,g.y,g.w,g.h);ctx.strokeStyle=open?'#d7b56d':'#7d3150';ctx.lineWidth=4;ctx.strokeRect(g.x,g.y,g.w,g.h);ctx.fillStyle=open?'rgba(215,181,109,.14)':'rgba(180,45,90,.16)';ctx.fillRect(g.x+7,g.y+8,g.w-14,g.h-16);ctx.font='25px sans-serif';ctx.fillStyle='#a8c66c';ctx.fillText('◆',g.x+8,g.y+57);ctx.fillStyle='#9bdcff';ctx.fillText('◇',g.x+29,g.y+57);ctx.restore();}
function drawFakeDoor(fd){ctx.save();ctx.fillStyle='rgba(25,18,27,.88)';ctx.fillRect(fd.x,fd.y,fd.w,fd.h);ctx.strokeStyle='#a14767';ctx.lineWidth=3;ctx.strokeRect(fd.x,fd.y,fd.w,fd.h);ctx.fillStyle='#c85f88';ctx.font='26px sans-serif';ctx.fillText('?',fd.x+20,fd.y+58);ctx.restore();}
function drawFakeFloor(f){const t=state.trapState.get('f'+f.id)||0;let a=1;if(t){const age=performance.now()-t;a=Math.max(0,1-age/650);}if(a<=0)return;ctx.globalAlpha=a;ctx.fillStyle='#4a4640';ctx.fillRect(f.x,f.y,f.w,f.h);ctx.strokeStyle='rgba(20,15,12,.6)';for(let x=f.x+14;x<f.x+f.w;x+=28){ctx.beginPath();ctx.moveTo(x,f.y);ctx.lineTo(x-8,f.y+7);ctx.lineTo(x+5,f.y+14);ctx.stroke();}ctx.globalAlpha=1;}
function drawBridgeTile(t){if(!bridgeActiveTile(t))return;const trig=state.trapState.get('br'+t.id);ctx.globalAlpha=trig?Math.max(.2,1-(performance.now()-trig)/t.delay):1;ctx.fillStyle='#694a2f';ctx.fillRect(t.x,t.y,t.w,t.h);ctx.strokeStyle='#c49b67';ctx.strokeRect(t.x,t.y,t.w,t.h);ctx.globalAlpha=1;}
function drawVanishPlatform(v){const trig=state.trapState.get('vp'+v.id),age=trig?performance.now()-trig:0;if(age>=v.delay)return;ctx.save();ctx.globalAlpha=trig?Math.max(.12,1-age/v.delay):.82;ctx.fillStyle='#675a76';ctx.fillRect(v.x,v.y,v.w,v.h);ctx.strokeStyle='#bba7d0';ctx.strokeRect(v.x,v.y,v.w,v.h);ctx.restore();}
function drawFallingBlock(b){ctx.fillStyle='#55545c';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeStyle='#a3a0aa';ctx.strokeRect(b.x+4,b.y+4,b.w-8,b.h-8);ctx.fillStyle='#202126';ctx.fillRect(b.x+14,b.y+17,8,8);ctx.fillRect(b.x+b.w-22,b.y+17,8,8);}
function drawSlamWall(w){ctx.fillStyle='#51414a';ctx.fillRect(w.x,w.y,w.w,w.h);ctx.fillStyle='#c0a4ad';for(let y=w.y+8;y<w.y+w.h;y+=22)ctx.fillRect(w.x+5,y,w.w-10,4);}
function drawWindGust(z){ctx.save();ctx.globalAlpha=.18;ctx.strokeStyle='#b9eaff';ctx.lineWidth=3;for(let y=z.y+25;y<z.y+z.h;y+=34){ctx.beginPath();ctx.moveTo(z.x+12,y);ctx.quadraticCurveTo(z.x+z.w*.5,y-18,z.x+z.w-12,y);ctx.stroke();}ctx.restore();}
function drawFakeGoal(f,triggered){ctx.save();ctx.globalAlpha=triggered?.35:1;ctx.fillStyle='rgba(24,18,14,.9)';ctx.fillRect(f.x,f.y,f.w,f.h);ctx.strokeStyle=triggered?'#ff4f79':'#d7b56d';ctx.lineWidth=4;ctx.strokeRect(f.x,f.y,f.w,f.h);ctx.fillStyle=triggered?'#ff4f79':'#a8c66c';ctx.font='25px sans-serif';ctx.fillText(triggered?'☠':'◆',f.x+15,f.y+58);ctx.restore();}
function drawReverseZone(z){ctx.strokeStyle='rgba(255,211,77,.18)';ctx.setLineDash([9,10]);ctx.strokeRect(z.x,z.y,z.w,z.h);ctx.setLineDash([]);ctx.fillStyle='rgba(255,211,77,.05)';ctx.fillRect(z.x,z.y,z.w,z.h);}
function drawElevator(e){ctx.fillStyle='#5b4632';ctx.fillRect(e.x,e.y,e.w,e.h);ctx.fillStyle='#c39a62';ctx.fillRect(e.x+8,e.y+4,e.w-16,4);ctx.strokeStyle='rgba(210,190,150,.45)';ctx.beginPath();ctx.moveTo(e.x+8,e.y);ctx.lineTo(e.x+8,70);ctx.moveTo(e.x+e.w-8,e.y);ctx.lineTo(e.x+e.w-8,70);ctx.stroke();}
function drawChandelier(r,falling){ctx.save();ctx.strokeStyle='#80684e';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(r.x+r.w/2,0);ctx.lineTo(r.x+r.w/2,r.y);ctx.stroke();ctx.translate(r.x+r.w/2,r.y+10);ctx.strokeStyle=falling?'#c99058':'#a17e57';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,18,22,0,Math.PI);ctx.stroke();for(let i=-1;i<=1;i++){ctx.fillStyle='#ffca68';ctx.beginPath();ctx.arc(i*14,28,5,0,Math.PI*2);ctx.fill();}ctx.restore();}
function drawCrusher(c){ctx.fillStyle='#4c4d52';ctx.fillRect(c.x,c.y,c.w,c.h);ctx.fillStyle='#9b9da6';for(let y=c.y+8;y<c.y+c.h;y+=18)ctx.fillRect(c.x+4,y,c.w-8,4);drawSpike({x:c.x,y:c.y+c.h-14,w:c.w,h:14});}
function drawBookshelf(b){ctx.fillStyle='#3b251b';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.fillStyle='#674533';for(let y=b.y+18;y<b.y+b.h;y+=24){ctx.fillRect(b.x+5,y,b.w-10,3);ctx.fillStyle='#87604d';for(let x=b.x+7;x<b.x+b.w-7;x+=9)ctx.fillRect(x,y-15,6,14);ctx.fillStyle='#674533';}}
function drawArmor(a){if(a.x<-1000)return;ctx.save();ctx.fillStyle='#8f96a3';ctx.fillRect(a.x+8,a.y+16,a.w-16,a.h-16);ctx.beginPath();ctx.arc(a.x+a.w/2,a.y+12,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#343944';ctx.fillRect(a.x+13,a.y+9,a.w-26,4);ctx.strokeStyle='#cbd0da';ctx.strokeRect(a.x+5,a.y+15,a.w-10,a.h-18);ctx.restore();}
function drawGhost(g){ctx.save();ctx.globalAlpha=.66;ctx.shadowBlur=18;ctx.shadowColor='#a987d9';ctx.fillStyle='#b7a0e8';ctx.beginPath();ctx.roundRect(g.x,g.y,g.w,g.h,18);ctx.fill();ctx.fillStyle='#1b1427';ctx.fillRect(g.x+9,g.y+16,6,7);ctx.fillRect(g.x+25,g.y+16,6,7);ctx.restore();}
function drawDragon(d){ctx.save();ctx.translate(d.x,d.y);ctx.scale(d.fromRight?-1:1,1);ctx.fillStyle='#8b3038';ctx.beginPath();ctx.ellipse(0,0,42,28,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-25,-8);ctx.lineTo(-80,-58);ctx.lineTo(-55,3);ctx.fill();ctx.beginPath();ctx.moveTo(25,-6);ctx.lineTo(78,-42);ctx.lineTo(52,7);ctx.fill();ctx.fillStyle='#ffcf67';ctx.fillRect(28,-6,8,6);ctx.restore();}
function drawFireball(f,c){ctx.save();ctx.shadowBlur=22;ctx.shadowColor=c;ctx.fillStyle=c;ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();ctx.restore();}
function drawBoss(b){
  ctx.save();ctx.fillStyle='#2b2033';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeStyle='#a66ee0';ctx.lineWidth=5;ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.fillStyle='#d0b5ef';ctx.beginPath();ctx.arc(b.x+b.w/2,b.y+55,36,0,Math.PI*2);ctx.fill();ctx.fillStyle='#231829';ctx.fillRect(b.x+46,b.y+45,18,8);ctx.fillRect(b.x+96,b.y+45,18,8);
  for(const [role,r] of Object.entries(b.runes)){ctx.fillStyle=role==='earth'?'rgba(168,198,108,.38)':'rgba(155,220,255,.38)';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeStyle=role==='earth'?'#a8c66c':'#9bdcff';ctx.strokeRect(r.x,r.y,r.w,r.h);}
  const pct=Math.min(1,state.bossCharge/b.required);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(610,190,380,14);ctx.fillStyle='#d7b56d';ctx.fillRect(610,190,380*pct,14);ctx.font='700 18px sans-serif';ctx.textAlign='center';ctx.fillStyle='rgba(255,255,255,.75)';ctx.fillText(state.bossDefeated?'CHEFE DERROTADO':'RITUAL COOPERATIVO',800,178);ctx.textAlign='left';
  if(!state.bossDefeated){ctx.fillStyle='rgba(170,70,210,.2)';ctx.fillRect(b.barrier.x,b.barrier.y,b.barrier.w,b.barrier.h);ctx.strokeStyle='#b75be1';ctx.strokeRect(b.barrier.x,b.barrier.y,b.barrier.w,b.barrier.h);}ctx.restore();
}
function drawCharacter(x,y,role,me,ability=false,anchored=false){
  const earth=role==='earth',c=earth?'#a8c66c':'#9bdcff',accent=earth?'#6f5139':'#e9f8ff';ctx.save();ctx.shadowBlur=ability?38:(me?24:12);ctx.shadowColor=c;ctx.fillStyle=c;ctx.beginPath();ctx.roundRect(x,y,42,56,12);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle=accent;if(earth){ctx.fillRect(x+5,y+40,32,8);ctx.beginPath();ctx.arc(x+21,y+8,9,0,Math.PI*2);ctx.fill();}else{ctx.beginPath();ctx.moveTo(x+5,y+42);ctx.quadraticCurveTo(x+21,y+32,x+37,y+42);ctx.lineTo(x+37,y+49);ctx.quadraticCurveTo(x+21,y+39,x+5,y+49);ctx.fill();}
  ctx.fillStyle='#0b0d10';ctx.fillRect(x+9,y+18,7,7);ctx.fillRect(x+26,y+18,7,7);ctx.fillStyle='#fff';ctx.globalAlpha=.8;ctx.fillRect(x+10,y+19,2,2);ctx.fillRect(x+27,y+19,2,2);if(ability){ctx.globalAlpha=.35;ctx.strokeStyle=c;ctx.lineWidth=4;ctx.strokeRect(x-8,y-8,58,72);}if(anchored){ctx.globalAlpha=.9;ctx.fillStyle='#d7b56d';ctx.font='18px sans-serif';ctx.fillText('◆',x+12,y-8);}ctx.restore();
}
function drawLevelTitle(){const ld=state.levelData,z=castleRegion(state.level);ctx.fillStyle='rgba(255,255,255,.14)';ctx.font='900 72px sans-serif';ctx.textAlign='center';ctx.fillText(String(state.level).padStart(4,'0'),W/2,103);ctx.font='800 20px sans-serif';ctx.fillStyle=z.accent;ctx.globalAlpha=.55;ctx.fillText(ld?.roomTitle||z.name,W/2,139);ctx.font='650 13px sans-serif';ctx.fillStyle='rgba(255,255,255,.55)';ctx.globalAlpha=.6;ctx.fillText(`${z.name}  •  TENTATIVA ${state.attempt}`,W/2,163);ctx.globalAlpha=1;ctx.textAlign='left';}
function burst(x,y,n){for(let i=0;i<n;i++)state.particles.push({x,y,vx:(Math.random()-.5)*500,vy:(Math.random()-.7)*450,life:1});}
function drawParticles(){for(const p of state.particles){ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=state.role==='earth'?'#a8c66c':'#9bdcff';ctx.fillRect(p.x,p.y,6,6);}ctx.globalAlpha=1;}
function updateParticles(dt){for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=700*dt;p.life-=dt*1.7;}state.particles=state.particles.filter(p=>p.life>0);}
function showOverlay(title,text,ms){$('#overlayTitle').textContent=title;$('#overlayText').textContent=text;$('#overlay').classList.remove('hidden');if(ms)setTimeout(hideOverlay,ms);}
function hideOverlay(){$('#overlay').classList.add('hidden');}

let last=performance.now();function loop(now){const dt=Math.min(.03,(now-last)/1000);last=now;if(state.running){if(state.mode==='singleplayer')updateSolo(dt);else player.update(dt);updateParticles(dt);}render();requestAnimationFrame(loop);}requestAnimationFrame(loop);
