const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { randomBytes } = require('crypto');
const mechanics = require('./public/mechanics');
const {createLeaderboard}=require('./backend/leaderboard.cjs');
let leaderboard;
try{leaderboard=createLeaderboard();}catch(error){
  console.error('Daily ranking storage unavailable:',error.code||error.message);
  const unavailable=()=>({ok:false,code:'RANKING_UNAVAILABLE'});
  leaderboard={begin:unavailable,submit:async()=>unavailable(),list:unavailable,status:()=>({available:false,storage:'file'})};
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const MAX_LEVEL = 1000;
const DEATH_REWARD_COINS = 5;
const MULTIPLAYER_PROTOCOL = 4;
const GAME_VERSION = require('./package.json').version;
const RECONNECT_GRACE_MS = 30_000;
const ELEMENTS = new Set(['earth', 'air', 'light', 'darkness']);
const ELEMENT_ORDER = ['earth', 'air', 'light', 'darkness'];
const MULTIPLAYER_ONLY = process.env.MULTIPLAYER_ONLY === '1';
const ROOM_MODES = {
  multiplayer: { maxPlayers: 2 },
  chaos: { maxPlayers: 4 }
};

app.use(express.json());
if (!MULTIPLAYER_ONLY) app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

app.get('/health', (_req, res) => res.status(200).json({
  ok: true,
  service: 'infinity-castle-elements-multiplayer',
  version: GAME_VERSION,
  protocolVersion: MULTIPLAYER_PROTOCOL,
  rooms: rooms.size,
  modes: { multiplayer: 2, chaos: 4 }
}));

app.get('/multiplayer/status', (_req, res) => res.json({
  online: true,
  version: GAME_VERSION,
  protocolVersion: MULTIPLAYER_PROTOCOL,
  activeRooms: rooms.size,
  maxPlayersPerRoom: 4,
  modes: { multiplayer: 2, chaos: 4 }
}));
app.get('/daily/leaderboard',(_req,res)=>res.json(leaderboard.list()));

app.get('/auth/chatgpt/status', (_req, res) => {
  res.json({ enabled: false, reason: 'Requires an approved Sign in with ChatGPT integration/client configuration for this app.' });
});

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
function uniqueCode(){ let code=makeRoomCode(); while(rooms.has(code)) code=makeRoomCode(); return code; }
function normalizeElement(value) {
  const element = String(value || '').trim().toLowerCase();
  return ELEMENTS.has(element) ? element : 'earth';
}
function normalizeMode(value) {
  return value === 'chaos' ? 'chaos' : 'multiplayer';
}
function publicRoom(room) {
  return {
    code: room.code,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    level: room.level,
    deaths: room.deaths,
    started: room.started,
    paused: room.paused,
    bossDefeated: room.bossDefeated,
    bossPhase: room.bossPhase||0,
    combos: (room.combos||[]).filter(c=>mechanics.comboPose(c,Math.max(0,(room.pausedAt||Date.now())-room.attemptStartedAt))),
    defeatedEnemies: [...room.defeatedEnemies],
    elapsedMs: room.attemptStartedAt ? Math.max(0,(room.pausedAt||Date.now())-room.attemptStartedAt) : 0,
    chaosSeals: [...room.chaosSeals],
    trapStates: [...room.trapStates.entries()].map(([key,activatedAt])=>({key,activatedAt})),
    players: [...room.players.values()].map(p => ({
      id:p.id, name:p.name, role:p.role, slot:p.slot, ready:p.ready, atSeal:p.atSeal,
      connected:p.connected, reconnectUntil:p.reconnectUntil||null, state:p.lastState||null
    }))
  };
}
function emitRoom(room){ io.to(room.code).emit('room-state', publicRoom(room)); }
function resetGoalFlags(room){ for(const p of room.players.values()) p.atGoal=false; }
function clearBossTimer(room){ if(room.bossTimer) clearTimeout(room.bossTimer); room.bossTimer=null; }
function resetBossState(room){
  clearBossTimer(room);room.bossDefeated=false;room.bossPhase=0;
  for(const p of room.players.values()) p.atRune=false;
}
function resetChaosState(room){
  room.chaosSeals.clear();
  for(const p of room.players.values()) p.atSeal=false;
}
function resetAttemptState(room){
  room.combos=[];room.comboCooldowns={};
  room.defeatedEnemies.clear();room.attemptStartedAt=Date.now();
  for(const p of room.players.values())p.lastState=null;
  resetGoalFlags(room);
  resetBossState(room);
  resetChaosState(room);
  room.trapStates.clear();
}
function bossRequiredSeconds(level,mode){
  const tier=level/100;
  const base=2.1+Math.min(1.9,tier*.16);
  return mode==='chaos' ? base+0.7 : base;
}
function maybeStartBossCharge(room){
  if(room.paused||room.level%100!==0||room.bossDefeated||room.bossTimer||room.players.size!==room.maxPlayers)return;
  if(![...room.players.values()].every(p=>p.atRune))return;
  const level=room.level;
  room.bossTimer=setTimeout(()=>{
    room.bossTimer=null;
    if(room.paused||rooms.get(room.code)!==room||room.level!==level||room.players.size!==room.maxPlayers)return;
    if(![...room.players.values()].every(p=>p.atRune))return;
    if((room.bossPhase||0)<2){room.bossPhase=(room.bossPhase||0)+1;io.to(room.code).emit('boss-phase',{level,phase:room.bossPhase});maybeStartBossCharge(room);}
    else{room.bossDefeated=true;io.to(room.code).emit('boss-defeated',{level,mode:room.mode});}
  },Math.round(bossRequiredSeconds(level,room.mode)*1000));
}

function protocolError(protocol){
  const client=Number(protocol);
  if(client===MULTIPLAYER_PROTOCOL)return null;
  const serverOutdated=Number.isInteger(client)&&client>MULTIPLAYER_PROTOCOL;
  return {ok:false,code:serverOutdated?'SERVER_UPDATE_REQUIRED':'UPDATE_REQUIRED',requiredProtocol:MULTIPLAYER_PROTOCOL,serverVersion:GAME_VERSION,error:serverOutdated?'O servidor multiplayer precisa ser atualizado. Tente novamente mais tarde. O Singleplayer continua disponível.':'Seu jogo está desatualizado para o multiplayer. Atualize o Infinity Castle Elements para continuar online.'};
}

function checkCombos(room){
  if(!room.started||room.paused)return;
  const now=Date.now(),elapsed=now-room.attemptStartedAt;
  room.comboCooldowns=room.comboCooldowns||{};room.combos=(room.combos||[]).filter(c=>mechanics.comboPose(c,elapsed));
  const active=[...room.players.values()].filter(p=>p.connected&&p.lastState?.ability);
  for(const [type,a,b] of [['earth-air','earth','air'],['light-darkness','light','darkness']]){
    if(room.combos.some(combo=>combo.type===type))continue;
    if(now<(room.comboCooldowns[type]||0))continue;
    const first=active.find(p=>p.role===a),second=active.find(p=>p.role===b);if(!first||!second)continue;
    const combo=mechanics.combo(type,first.lastState,second.lastState,elapsed,randomBytes(8).toString('hex'));if(!combo)continue;
    room.comboCooldowns[type]=now+12000;room.combos.push(combo);io.to(room.code).emit('combo-created',{level:room.level,combo});
  }
}

io.on('connection', socket => {
  socket.on('diagnostics',(_payload={},ack=()=>{})=>{if(typeof ack==='function')ack({ok:true,serverVersion:GAME_VERSION,protocolVersion:MULTIPLAYER_PROTOCOL,uptime:Math.floor(process.uptime()),ranking:leaderboard.status()});});
  socket.on('daily-board',(_payload={},ack=()=>{})=>{if(typeof ack==='function')ack(leaderboard.list());});
  socket.on('daily-start',(payload={},ack=()=>{})=>{
    payload=payload&&typeof payload==='object'?payload:{};ack=typeof ack==='function'?ack:()=>{};
    const incompatible=protocolError(payload.protocol);if(incompatible)return ack(incompatible);
    ack(leaderboard.begin(payload,socket.handshake.address));
  });
  socket.on('daily-submit',async(payload={},ack=()=>{})=>{
    payload=payload&&typeof payload==='object'?payload:{};ack=typeof ack==='function'?ack:()=>{};
    const incompatible=protocolError(payload.protocol);if(incompatible)return ack(incompatible);
    ack(await leaderboard.submit(payload));
  });
  socket.on('resume-room',({code,token,protocol}={},ack=()=>{})=>{
    const incompatible=protocolError(protocol);if(incompatible)return ack(incompatible);
    if(socket.data.roomCode)return ack({ok:false,error:'Você já está em uma sala.'});
    const room=rooms.get(String(code||'').toUpperCase());
    const p=room&&typeof token==='string'&&[...room.players.values()].find(p=>p.token===token&&!p.connected&&p.reconnectUntil>Date.now());
    if(!p)return ack({ok:false,code:'RESERVATION_EXPIRED',error:'A reserva da sua vaga expirou. Entre novamente na sala.'});
    clearTimeout(p.reconnectTimer);room.players.delete(p.id);p.id=socket.id;p.connected=true;p.reconnectUntil=null;if(p.lastState)p.lastState.id=p.id;
    room.players.set(p.id,p);socket.data.roomCode=room.code;socket.join(room.code);
    if([...room.players.values()].every(p=>p.connected)){
      const pause=Math.max(0,Date.now()-(room.pausedAt||Date.now()));
      room.attemptStartedAt+=pause;
      for(const [key,t] of room.trapStates)room.trapStates.set(key,t+pause);
      for(const type of Object.keys(room.comboCooldowns||{}))room.comboCooldowns[type]+=pause;
      room.paused=false;room.pausedAt=null;
    }
    ack({...joinResult(room,p),resumed:true,room:publicRoom(room)});
    emitRoom(room);
    if(!room.paused){io.to(room.code).emit('session-resumed',{room:publicRoom(room)});maybeStartBossCharge(room);}
  });
  socket.on('leave-room',()=>{const room=getSocketRoom(socket);if(room)removeSeat(room,socket.id);socket.leave(socket.data.roomCode);socket.data.roomCode=null;});
  socket.emit('protocol-info',{protocolVersion:MULTIPLAYER_PROTOCOL,serverVersion:GAME_VERSION});
  socket.on('create-room', ({name,element,resumeLevel,resumeDeaths,mode,protocol}={}, ack=()=>{}) => {
    if(socket.data.roomCode)return ack({ok:false,error:'Você já está em uma sala.'});
    const incompatible=protocolError(protocol);if(incompatible)return ack(incompatible);
    const roomMode=normalizeMode(mode);
    const code=uniqueCode();
    const level=Math.max(1,Math.min(MAX_LEVEL,Number(resumeLevel)||1));
    const deaths=Math.max(0,Math.min(999999,Number(resumeDeaths)||0));
    const room={
      code,
      mode:roomMode,
      maxPlayers:ROOM_MODES[roomMode].maxPlayers,
      level,
      deaths,
      players:new Map(),
      resetting:false,
      bossDefeated:false,
      bossTimer:null,
      chaosSeals:new Set(),
      trapStates:new Map(),
      defeatedEnemies:new Set(),started:false,paused:false,pausedAt:null,attemptStartedAt:0
    };
    rooms.set(code,room);
    joinRoom(socket,room,name,element,ack);
  });

  socket.on('join-room', ({code,name,element,mode,protocol}={}, ack=()=>{}) => {
    const incompatible=protocolError(protocol);if(incompatible)return ack(incompatible);
    const normalized=String(code||'').trim().toUpperCase(),room=rooms.get(normalized);
    if(!room)return ack({ok:false,error:'Sala não encontrada.'});
    if(mode&&normalizeMode(mode)!==room.mode)return ack({ok:false,error:room.mode==='chaos'?'Esse código pertence a uma sala do Modo Caos.':'Esse código pertence ao multiplayer de 2 jogadores.'});
    if(room.players.size>=room.maxPlayers)return ack({ok:false,error:`Essa sala já tem ${room.maxPlayers} jogadores.`});
    joinRoom(socket,room,name,element,ack);
  });

  socket.on('ready', ({ready}={}) => {
    const room=getSocketRoom(socket);if(!room)return;
    if(room.started||room.paused)return;
    const player=room.players.get(socket.id);if(!player)return;
    player.ready=Boolean(ready);emitRoom(room);
    if(room.players.size===room.maxPlayers&&[...room.players.values()].every(p=>p.ready&&p.connected)){
      room.started=true;
      room.resetting=false;
      resetAttemptState(room);
      io.to(room.code).emit('start-level',{level:room.level,deaths:room.deaths,mode:room.mode});
      emitRoom(room);
    }
  });

  socket.on('player-state', payload => {
    const room=getSocketRoom(socket);if(!room||room.paused||!payload||Number(payload.level)!==room.level)return;
    const p=room.players.get(socket.id);
    if(!Number.isFinite(payload.x)||!Number.isFinite(payload.y))return;
    const number=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
    p.lastState={id:p.id,role:p.role,slot:p.slot,level:room.level,x:number(payload.x,0,1600),y:number(payload.y,-500,1300),
      vx:number(payload.vx,-1500,1500),vy:number(payload.vy,-1500,1500),onGround:!!payload.onGround,landPulse:!!payload.landPulse,
      ability:!!payload.ability,abilityProgress:number(payload.abilityProgress,0,1),facing:payload.facing===-1?-1:1,
      abilityRemaining:number(payload.abilityRemaining,0,3000),abilityCooldownRemaining:number(payload.abilityCooldownRemaining,0,8000),
      cosmetics:{crown:!!payload.cosmetics?.crown,aura:!!payload.cosmetics?.aura}};
    p.lastState.rootFx=payload.rootFx&&Number.isFinite(payload.rootFx.x)&&Number.isFinite(payload.rootFx.y)?{x:number(payload.rootFx.x,0,1600),y:number(payload.rootFx.y,-500,1300)}:null;
    p.lastState.relic=['fracturedHeart','windstep','abyssFeather','chronoglass','greedEye','seerMark'].includes(payload.relic)?payload.relic:null;
    socket.to(room.code).emit('remote-state',p.lastState);
    checkCombos(room);
  });

  socket.on('enemy-defeated', ({id,level}={}) => {
    const room=getSocketRoom(socket);if(!room||Number(level)!==room.level||!Number.isFinite(Number(id)))return;
    if(room.paused)return;room.defeatedEnemies.add(Number(id));
    socket.to(room.code).emit('enemy-defeated',{id:Number(id),level:room.level});
  });

  socket.on('trap-trigger', ({level,key}={}) => {
    const room=getSocketRoom(socket);if(!room||Number(level)!==room.level)return;
    if(room.paused)return;
    const trapKey=String(key||'').slice(0,64);
    if(!/^(?:f|p|as|br|vp|ch|fb|sw|fg)\d+$|^movingExit$/.test(trapKey))return;
    if(room.trapStates.has(trapKey))return;
    const activatedAt=Date.now();
    room.trapStates.set(trapKey,activatedAt);
    io.to(room.code).emit('trap-trigger',{level:room.level,key:trapKey,activatedAt});
    emitRoom(room);
  });

  socket.on('chaos-seal-activate', ({level}={}) => {
    const room=getSocketRoom(socket);
    if(room?.paused)return;
    if(!room||room.mode!=='chaos'||room.level%100===0||Number(level)!==room.level)return;
    const player=room.players.get(socket.id);if(!player||player.atSeal)return;
    player.atSeal=true;
    room.chaosSeals.add(player.role);
    io.to(room.code).emit('chaos-seal-activated',{role:player.role,level:room.level,count:room.chaosSeals.size});
    emitRoom(room);
    if(room.chaosSeals.size===4)io.to(room.code).emit('chaos-unlocked',{level:room.level});
  });

  socket.on('rune-state', ({atRune,level}={}) => {
    const room=getSocketRoom(socket);if(!room||room.level%100!==0||Number(level)!==room.level||room.bossDefeated)return;
    if(room.paused)return;
    const player=room.players.get(socket.id);if(!player)return;
    player.atRune=Boolean(atRune);
    if(!player.atRune)clearBossTimer(room);else maybeStartBossCharge(room);
  });

  socket.on('goal-state', ({atGoal}={}) => {
    const room=getSocketRoom(socket);if(!room)return;
    if(room.paused)return;
    const player=room.players.get(socket.id);if(!player)return;
    if(room.level%100===0&&!room.bossDefeated){player.atGoal=false;return;}
    if(room.mode==='chaos'&&room.level%100!==0&&room.chaosSeals.size<4){player.atGoal=false;return;}
    player.atGoal=Boolean(atGoal);
    if(room.players.size===room.maxPlayers&&[...room.players.values()].every(p=>p.atGoal)){
      resetGoalFlags(room);
      const completedLevel=room.level,finished=completedLevel>=MAX_LEVEL;
      if(!finished){room.level+=1;resetAttemptState(room);room.attemptStartedAt+=900;}
      io.to(room.code).emit('level-complete',{level:room.level,finished,completedLevel,mode:room.mode});
      if(!finished)setTimeout(()=>{if(!room.paused)io.to(room.code).emit('start-level',{level:room.level,deaths:room.deaths,mode:room.mode});},900);
      else io.to(room.code).emit('game-finished',{deaths:room.deaths,mode:room.mode});
      emitRoom(room);
    }
  });

  socket.on('player-death', () => {
    const room=getSocketRoom(socket);if(!room||room.resetting||room.paused)return;
    room.resetting=true;room.deaths+=1;resetAttemptState(room);
    room.attemptStartedAt+=5000;
    socket.emit('death-reward',{coins:DEATH_REWARD_COINS});
    io.to(room.code).emit('reset-level',{deaths:room.deaths,mode:room.mode});emitRoom(room);
    setTimeout(()=>{if(rooms.get(room.code)===room)room.resetting=false;},300);
  });

  socket.on('restart-level', () => {
    const room=getSocketRoom(socket);if(!room||room.resetting||room.paused)return;
    room.resetting=true;resetAttemptState(room);
    room.attemptStartedAt+=340;
    io.to(room.code).emit('reset-level',{deaths:room.deaths,manual:true,mode:room.mode});emitRoom(room);
    setTimeout(()=>{if(rooms.get(room.code)===room)room.resetting=false;},300);
  });

  socket.on('disconnect',()=>{
    const room=getSocketRoom(socket);if(!room)return;
    const p=room.players.get(socket.id);if(!p)return;
    p.connected=false;p.reconnectUntil=Date.now()+RECONNECT_GRACE_MS;
    if(!room.paused){room.paused=true;room.pausedAt=Date.now();}
    clearBossTimer(room);emitRoom(room);
    io.to(room.code).emit('session-paused',{until:p.reconnectUntil,room:publicRoom(room)});
    p.reconnectTimer=setTimeout(()=>removeSeat(room,p.id),RECONNECT_GRACE_MS);p.reconnectTimer.unref?.();
  });
});

function getSocketRoom(socket){const code=socket.data.roomCode;return code?rooms.get(code):null;}
function removeSeat(room,id){
  const p=room.players.get(id);if(!p)return;clearTimeout(p.reconnectTimer);room.players.delete(id);
  if(!room.players.size){clearBossTimer(room);rooms.delete(room.code);return;}
  room.started=false;room.paused=false;room.pausedAt=null;room.resetting=false;resetAttemptState(room);
  for(const p of room.players.values()){p.ready=false;p.lastState=null;}
  emitRoom(room);io.to(room.code).emit('partner-left',{mode:room.mode,maxPlayers:room.maxPlayers,currentPlayers:[...room.players.values()].filter(p=>p.connected).length});
}
function joinResult(room,p){return {ok:true,code:room.code,mode:room.mode,maxPlayers:room.maxPlayers,role:p.role,slot:p.slot,id:p.id,level:room.level,deaths:room.deaths,protocolVersion:MULTIPLAYER_PROTOCOL,token:p.token};}
function joinRoom(socket,room,rawName,requestedElement,ack){
  if(socket.data.roomCode)return ack({ok:false,error:'Você já está em uma sala.'});
  const name=String(rawName||'Jogador').trim().slice(0,18)||'Jogador';
  const role=normalizeElement(requestedElement);
  if(room.mode==='chaos'){
    const usedRoles=new Set([...room.players.values()].map(p=>p.role));
    if(usedRoles.has(role))return ack({ok:false,error:'Esse elemento já está ocupado no Modo Caos. Escolha outro dos quatro elementos.'});
  }
  const usedSlots=new Set([...room.players.values()].map(p=>p.slot));
  let slot=0;while(usedSlots.has(slot)&&slot<room.maxPlayers)slot++;
  const player={id:socket.id,name,role,slot,ready:false,atGoal:false,atRune:false,atSeal:false,connected:true,token:randomBytes(32).toString('hex'),lastState:null};
  room.players.set(socket.id,player);socket.data.roomCode=room.code;socket.join(room.code);
  ack(joinResult(room,player));
  emitRoom(room);
}

function startServer(port = PORT, host = '0.0.0.0') {
  if (server.listening) return server;
  server.listen(port, host, () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
    console.log(`Infinity Castle Elements ${GAME_VERSION} multiplayer server listening on 0.0.0.0:${actualPort}`);
  });
  return server;
}

if (require.main === module) startServer(PORT, '0.0.0.0');

module.exports = { app, server, io, startServer, MULTIPLAYER_PROTOCOL };
